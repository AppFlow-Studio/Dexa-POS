import {
  applySessionBroadcast,
  type SessionBroadcastPayload,
} from "@/lib/floor/applySessionBroadcast";
import { DEADLINES } from "@/lib/network/deadlines";
import { runWithDeadline } from "@/lib/network/runWithDeadline";
import { findReservationTableConflictForWindow } from "@/lib/reservationConflicts";
import { createLazyPersistStorage } from "@/lib/storage";
import { TABLE_SHAPES } from "@/lib/table-shapes";
import { isLocalOnlyStatus } from "@/lib/tableStateMachine";
import {
  KEY_FLOOR_LOAD_APPLY_MS,
  KEY_FLOOR_LOAD_RPC_MS,
  KEY_FLOOR_READ_DEADLINE,
  KEY_FLOOR_SWITCH_PAINT_MS,
  KEY_FLOOR_SWITCH_WAIT_MS,
} from "@/lib/telemetry/keys";
import { recordCount, recordSpan } from "@/lib/telemetry/registry";
import { FloorPlanService } from "@/services/floorPlanService";
import { getIsOnline, getRawIsOnline } from "@/services/offlineSyncService";
import {
  FloorPlan,
  FloorPlanObject,
  FloorSnapshotEnvelope,
  FloorSnapshotSession,
  FloorSnapshotStatusTable,
  LocationTableStatusRow,
  Reservation,
  ServerSection,
  SwitchPaintPath,
  TableSession,
  TableStatus,
  WaitlistEntry,
} from "@/types/db-floor-plan-types";
import * as Sentry from "@sentry/react-native";
import { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { create } from "zustand";
import { persist, subscribeWithSelector } from "zustand/middleware";

const DEFAULT_CANVAS_WORLD_WIDTH = 2400;
const DEFAULT_CANVAS_WORLD_HEIGHT = 1600;
// Lazy accessor — breaks circular dependency with useTableSessionStore
const getTableSessionStore = () =>
  (require("./useTableSessionStore") as typeof import("./useTableSessionStore"))
    .useTableSessionStore;

/**
 * Reject session restores for sessions the session store CLEAR'd locally
 * within the TTL window. Prevents a stale backend snapshot or delayed broadcast
 * from re-stamping a paid session onto tables[].session after a Clear has
 * already wiped useTableSessionStore.sessions[tableId].
 */
const wasRecentlyCleared = (sessionId: string | undefined | null): boolean => {
  if (!sessionId) return false;
  return (
    require("./useTableSessionStore") as typeof import("./useTableSessionStore")
  ).wasSessionRecentlyCleared(sessionId);
};

// Newest broadcast timestamp applied per session, so a broadcast delivered out
// of order can't roll a session back (applySessionBroadcastPayload).
const _lastSessionBroadcastAt = new Map<string, number>();

// Lazy accessor — breaks circular dependency with useReservationStore
const getReservationStore = () =>
  (require("./useReservationStore") as typeof import("./useReservationStore"))
    .useReservationStore;

// Global client reference to avoid direct dependency loops or hook usage outside components
let _supabaseClient: SupabaseClient | null = null;

// Dedup concurrent loadFloorPlanStatus calls (module-level to avoid re-renders)
let _loadFloorPlanPromise: Promise<void> | null = null;
// What the in-flight load covers: `location:<id>` for the snapshot RPC (one
// read serves every plan, so a plan switch mid-flight reuses it), or a plan id
// on the legacy per-plan path.
let _loadFloorPlanId: string | null = null;
// Monotonic load sequence: lets a forced load supersede an in-flight stale one.
// Only the latest-issued snapshot is allowed to commit to state.
let _loadFloorPlanSeq = 0;
const _prefetchFloorPlanPromises = new Map<string, Promise<void>>();
// True once get_floor_snapshot_v1 answered "not deployed here" this session.
// Floor status then comes from the per-plan table reads, and per-plan prefetch
// is what warms the other plans. While false, one snapshot fills every plan.
let _floorSnapshotRpcAbsent = false;
// refreshTableSessions: one read in flight, at most one queued behind it.
let _refreshInFlight: Promise<void> | null = null;
let _refreshRerun = false;

/** Test seam: module state survives between cases otherwise. */
export const __resetFloorReadStateForTest = () => {
  _loadFloorPlanPromise = null;
  _loadFloorPlanId = null;
  _loadFloorPlanSeq = 0;
  _prefetchFloorPlanPromises.clear();
  _floorSnapshotRpcAbsent = false;
  _refreshInFlight = null;
  _refreshRerun = false;
};

export const setFloorPlanSupabaseClient = (client: SupabaseClient | null) => {
  _supabaseClient = client;
};

const getClient = () => {
  if (!_supabaseClient) {
    console.warn(
      "Supabase client not set in useFloorPlanStore, some actions may fail.",
    );
  }
  return _supabaseClient!;
};

/** Expose client getter for useTableSessionStore (avoids duplicate registration) */
export const getFloorPlanClient = getClient;

function getSelectedTablesCapacity(
  tablesById: Record<string, FloorPlanObject>,
  tableIds: string[],
): { totalCapacity: number; hasKnownCapacity: boolean } {
  let totalCapacity = 0;
  let hasKnownCapacity = false;

  for (const tableId of tableIds) {
    const capacity = tablesById[tableId]?.capacity;
    if (typeof capacity === "number" && capacity > 0) {
      totalCapacity += capacity;
      hasKnownCapacity = true;
    }
  }

  return { totalCapacity, hasKnownCapacity };
}

type FloorPlanCacheEntry = {
  tables: FloorPlanObject[];
  sections: ServerSection[];
  sectionsById: Record<string, ServerSection>;
  lastSyncAt: string | null;
};

/**
 * Drop the ephemeral `session` from each table.
 *
 * Used on both sides of persistence: at write time (partialize) and at read
 * time (onRehydrateStorage). Session state belongs to useTableSessionStore and
 * is re-bridged by onFinishHydration, so it must never survive a round-trip
 * through this store's storage — keeping the two sides on one helper is what
 * guarantees the write side can't drift back into serializing it.
 */
const stripTableSessions = (
  tables: FloorPlanObject[] | undefined,
): FloorPlanObject[] =>
  (tables ?? []).map((t) => (t.session ? { ...t, session: undefined } : t));

const buildSectionsById = (
  sections: ServerSection[],
): Record<string, ServerSection> =>
  sections.reduce(
    (acc, section) => {
      acc[section.id] = section;
      return acc;
    },
    {} as Record<string, ServerSection>,
  );

const getNextAvailableTableNumber = (names: string[]) => {
  const used = new Set(
    names
      .map((name) => {
        const trimmed = name.trim();
        if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10);
        const prefixedMatch = /^T-(\d+)$/.exec(trimmed);
        return prefixedMatch ? parseInt(prefixedMatch[1], 10) : NaN;
      })
      .filter((n) => Number.isInteger(n) && n > 0),
  );

  let next = 1;
  while (used.has(next)) next += 1;
  return next;
};

const buildFloorPlanCacheEntry = (
  tables: FloorPlanObject[],
  sections: ServerSection[],
  sectionsById: Record<string, ServerSection>,
  lastSyncAt: string | null,
): FloorPlanCacheEntry => ({
  tables,
  sections,
  sectionsById,
  lastSyncAt,
});

// Perf T2a: value-compare two snapshot values a few levels deep. Used to
// decide whether a freshly fetched table can keep its PREVIOUS object
// identity — unknown/new fields are compared too (conservative: any
// difference forces the fresh object, never loses an update). Depth 3 covers
// table → session/next_reservation → merged_tables[] → primitives.
const shallowValueEqual = (a: unknown, b: unknown, depth: number): boolean => {
  if (Object.is(a, b)) return true;
  if (depth <= 0) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!shallowValueEqual(a[i], b[i], depth - 1)) return false;
    }
    return true;
  }
  if (
    a !== null &&
    b !== null &&
    typeof a === "object" &&
    typeof b === "object" &&
    !Array.isArray(a) &&
    !Array.isArray(b)
  ) {
    const keysA = Object.keys(a as Record<string, unknown>);
    const keysB = Object.keys(b as Record<string, unknown>);
    if (keysA.length !== keysB.length) return false;
    for (const key of keysA) {
      if (
        !shallowValueEqual(
          (a as Record<string, unknown>)[key],
          (b as Record<string, unknown>)[key],
          depth - 1,
        )
      ) {
        return false;
      }
    }
    return true;
  }
  return false;
};

// ---------------------------------------------------------------------------
// Session mapping
//
// A session reaches this store from three reads that spell it differently:
// the snapshot RPC (merged_tables WITHOUT the table itself, plus a
// minutes_seated that changes on every call), the status RPC (flat rows, one
// per table) and the legacy table reads (raw columns, merged_tables WITH the
// table itself). Mapping all three to one shape — same keys, same defaults,
// never an undefined-valued key — is what lets shallowValueEqual keep a
// table's identity when only the source of the read changed.
//
// minutes_seated is left out on purpose: it is now() - seated_at, so carrying
// it would make every session differ from its previous read and re-render the
// whole floor on every reconcile.
// ---------------------------------------------------------------------------

/**
 * The table ids of a merged group: de-duplicated, sorted, and always including
 * the table the session was read from. `undefined` for a single table, so
 * "is this merged?" is `merged_tables !== undefined` for every source.
 */
export const normalizeMergedTables = (
  ids: readonly (string | null | undefined)[] | null | undefined,
): string[] | undefined => {
  if (!ids || ids.length === 0) return undefined;
  const unique = Array.from(
    new Set(ids.filter((id): id is string => !!id)),
  ).sort((left, right) => left.localeCompare(right));
  return unique.length > 1 ? unique : undefined;
};

type SessionSourceFields = {
  id: string;
  status: TableStatus;
  session_number?: string | null;
  party_size?: number | null;
  guest_name?: string | null;
  order_id?: string | null;
  seated_at?: string | null;
  current_course?: number | null;
  needs_attention?: boolean | null;
  is_vip?: boolean | null;
  server_staff_id?: string | null;
};

const buildSession = (
  fields: SessionSourceFields,
  groupTableIds: readonly (string | null | undefined)[],
): TableSession => {
  const session: TableSession = {
    id: fields.id,
    session_number: fields.session_number ?? null,
    status: fields.status,
    party_size: fields.party_size ?? 0,
    guest_name: fields.guest_name ?? null,
    order_id: fields.order_id ?? null,
    seated_at: fields.seated_at ?? new Date().toISOString(),
    current_course: fields.current_course ?? 1,
    needs_attention: fields.needs_attention ?? false,
    is_vip: fields.is_vip ?? false,
  };
  if (fields.server_staff_id) session.server_staff_id = fields.server_staff_id;
  const merged = normalizeMergedTables(groupTableIds);
  if (merged) session.merged_tables = merged;
  return session;
};

/** Session from a get_floor_snapshot_v1 status row. */
export const sessionFromSnapshot = (
  tableId: string,
  session: FloorSnapshotSession,
): TableSession =>
  buildSession(session, [tableId, ...(session.merged_tables ?? [])]);

/**
 * Session from a get_location_table_status_v2 row. `groupTableIds` is every
 * table that row's session sits on (the caller groups the rows by session).
 */
export const sessionFromStatusRow = (
  row: LocationTableStatusRow,
  groupTableIds: readonly string[],
): TableSession | null => {
  if (!row.session_id || !row.session_status) return null;
  return buildSession(
    {
      id: row.session_id,
      status: row.session_status,
      session_number: row.session_number,
      party_size: row.party_size,
      guest_name: row.guest_name,
      order_id: row.order_id,
      seated_at: row.seated_at,
      current_course: row.current_course,
      needs_attention: row.needs_attention,
      is_vip: row.is_vip,
      server_staff_id: row.server_staff_id,
    },
    [row.table_id, ...groupTableIds],
  );
};

/** Session from the legacy floor_plan_objects + table_sessions reads. */
export const sessionFromLegacyObject = (
  tableId: string,
  session: TableSession,
): TableSession =>
  buildSession(session, [tableId, ...(session.merged_tables ?? [])]);

type NextReservation = NonNullable<FloorPlanObject["next_reservation"]>;

const nextReservationFor = (
  tableId: string,
  nextReservationByTableId: Record<string, Reservation | undefined>,
): NextReservation | null => {
  // The reservation store's index, not the RPC's copy: it is rebuilt on every
  // reservation fetch with the active + future filter, and it carries the date.
  const next = nextReservationByTableId[tableId];
  if (!next) return null;
  return {
    id: next.id,
    party_name: next.party_name,
    party_size: next.party_size,
    date: next.reservation_date,
    time: next.reservation_time,
    status: next.status,
  };
};

/**
 * One plan's tables, built from its geometry.
 *
 * `statusTables` decides the mode:
 *  - an array: a reconcile. A table the server reported on takes the server's
 *    session, behind the same three guards fetchFloorPlanSnapshot applies.
 *  - `null`: a paint with no network. Sessions come from the session store.
 *
 * Iterates the plan's OBJECTS and looks status up by id, never the other way
 * round: status covers active tables and booths only, geometry covers every
 * object. An object the server made no claim about keeps its live session.
 *
 * Every table gets `session` and `next_reservation` keys, so a painted table
 * and a reconciled one have the same key set, and a table that is value-equal
 * to its previous object keeps that object's identity.
 */
export const buildPlanTables = (
  plan: Pick<FloorPlan, "id" | "objects">,
  statusTables: readonly FloorSnapshotStatusTable[] | null,
  prevById: Record<string, FloorPlanObject>,
  liveSessions: Record<string, TableSession | undefined>,
  nextReservationByTableId: Record<string, Reservation | undefined>,
): FloorPlanObject[] => {
  const statusById = statusTables
    ? new Map(statusTables.map((row) => [row.id, row]))
    : null;

  const tables: FloorPlanObject[] = [];
  for (const object of plan.objects ?? []) {
    if (object.is_active === false) continue;

    const live = liveSessions[object.id];
    const prev = prevById[object.id];
    const row = statusById?.get(object.id);

    let session: TableSession | undefined;
    if (!row) {
      session = live;
    } else if (!row.session) {
      session = undefined;
    } else {
      const fresh = sessionFromSnapshot(object.id, row.session);
      if (live && isLocalOnlyStatus(live.status) && live.id === fresh.id) {
        // The backend never sees seating/ordering/paying/closing.
        session = live;
      } else if (
        prev?.session &&
        isLocalOnlyStatus(prev.session.status) &&
        prev.session.id === fresh.id
      ) {
        session = prev.session;
      } else if (wasRecentlyCleared(fresh.id)) {
        // Cleared here within the TTL; a lagging read must not bring it back.
        session = undefined;
      } else {
        session = fresh;
      }
    }

    const next: FloorPlanObject = {
      ...object,
      floor_plan_id: plan.id,
      session,
      next_reservation: nextReservationFor(object.id, nextReservationByTableId),
    };
    tables.push(prev && shallowValueEqual(prev, next, 3) ? prev : next);
  }
  return tables;
};

const sameElements = <T>(a: readonly T[], b: readonly T[]): boolean =>
  a.length === b.length && a.every((item, index) => item === b[index]);

/** Breadcrumb for a floor read that failed; never throws. */
const noteFloorReadFailure = (opName: string, error: unknown) => {
  const code = (error as { code?: string } | null | undefined)?.code;
  if (code === "DEADLINE_EXCEEDED") recordCount(KEY_FLOOR_READ_DEADLINE);
  try {
    Sentry.addBreadcrumb({
      category: "floor.read",
      level: "warning",
      message: `${opName} failed`,
      data: {
        opName,
        code: code ?? null,
        message: (error as { message?: string } | null | undefined)?.message,
      },
    });
  } catch {
    // observability must never mask the read's own outcome
  }
};

// Exported for unit testing of the local-only preserve guard.
export const fetchFloorPlanSnapshot = async (
  floorPlanId: string,
  currentTablesById: Record<string, FloorPlanObject> = {},
  signal?: AbortSignal,
): Promise<{ data: FloorPlanCacheEntry | null; error: Error | null }> => {
  const supabase = getClient();

  try {
    const [objectsResult, sectionsResult] = await Promise.all([
      FloorPlanService.getAllFloorPlanObjects(supabase, floorPlanId, signal),
      FloorPlanService.getServerSections(supabase, floorPlanId, signal),
    ]);

    const { data: freshObjects, error } = objectsResult;
    if (error) {
      return { data: null, error };
    }

    const rawTables = freshObjects || [];
    // Read before the mapping below drops the raw `is_active` column.
    const inactiveSessionTableIds = new Set(
      rawTables
        .filter(
          (table) =>
            (table.session as unknown as { is_active?: boolean } | undefined)
              ?.is_active === false,
        )
        .map((table) => table.id),
    );
    // One session shape for every source — see "Session mapping" above.
    // "No session" is `undefined` here as everywhere else, never null.
    const freshTables = rawTables.map((table) => ({
      ...table,
      session: table.session
        ? sessionFromLegacyObject(table.id, table.session)
        : undefined,
    }));

    // The session store holds ALL plans' live sessions keyed by tableId,
    // independent of which plan's currentTablesById is in scope. Consult it so
    // the local-only preserve fires even when currentTablesById is empty — i.e.
    // the prefetch path (no currentTablesById) and the cache-miss reload path
    // (tablesById was reset to {} before this fetch). Read once, not per-table.
    const liveSessions = getTableSessionStore().getState().sessions;

    const mergedTables = freshTables.map((freshTable) => {
      const currentTable = currentTablesById[freshTable.id];
      const freshSessionIsInactive = inactiveSessionTableIds.has(freshTable.id);

      // Preserve a live, SAME-SESSION local-only status (seating/ordering/
      // paying/closing) — the backend snapshot never knows about these
      // optimistic sub-states. Prefer the session-store view (global, survives
      // empty currentTablesById); fall back to currentTablesById.
      const liveSession = liveSessions[freshTable.id];
      if (
        liveSession &&
        isLocalOnlyStatus(liveSession.status) &&
        freshTable.session &&
        liveSession.id === freshTable.session.id
      ) {
        return { ...freshTable, session: liveSession };
      }

      if (
        currentTable?.session &&
        isLocalOnlyStatus(currentTable.session.status) &&
        freshTable.session &&
        currentTable.session.id === freshTable.session.id
      ) {
        return { ...freshTable, session: currentTable.session };
      }

      if (!currentTable?.session && freshSessionIsInactive) {
        return { ...freshTable, session: undefined };
      }

      // Drop a fresh session that the session store CLEAR'd locally within
      // the TTL — backend lag can return a still-paid row after our Clear
      // has wiped the local session, and we don't want to resurrect it.
      if (freshTable.session && wasRecentlyCleared(freshTable.session.id)) {
        return { ...freshTable, session: undefined };
      }

      return freshTable;
    });

    // Use the O(1) nextReservationByTableId index (rebuilt on every reservation
    // fetch with the same active+future filter and soonest-first sort as
    // getUpcomingForTable) instead of re-filtering all reservations per table.
    const nextReservationByTableId =
      getReservationStore().getState().nextReservationByTableId;
    const enrichedTables = mergedTables.map((table) => {
      const next = nextReservationByTableId[table.id];
      if (!next) return { ...table, next_reservation: null };
      return {
        ...table,
        next_reservation: {
          id: next.id,
          party_name: next.party_name,
          party_size: next.party_size,
          date: next.reservation_date,
          time: next.reservation_time,
          status: next.status,
        },
      };
    });

    const freshSections = sectionsResult.data || [];
    return {
      data: {
        tables: enrichedTables,
        sections: freshSections,
        sectionsById: buildSectionsById(freshSections),
        lastSyncAt: new Date().toISOString(),
      },
      error: null,
    };
  } catch (error) {
    return {
      data: null,
      error:
        error instanceof Error
          ? error
          : new Error("Failed to fetch floor plan snapshot"),
    };
  }
};

interface FloorPlanState {
  // Data
  locationId: string | null;
  floorPlans: FloorPlan[];
  /**
   * Opaque geometry token from get_floor_snapshot_v1. Sent back on the next
   * load so the server can omit geometry when the layout hasn't changed.
   * Null = no token yet (or the legacy RPC answered), so geometry is re-sent.
   */
  geometryVersion: string | null;
  activeFloorPlanId: string | null;
  tables: FloorPlanObject[];
  tablesById: Record<string, FloorPlanObject>; // O(1) lookup map
  waitlist: WaitlistEntry[];
  reservations: Reservation[];
  sections: ServerSection[];
  sectionsById: Record<string, ServerSection>;

  // Realtime State
  realtimeStatus: "connected" | "reconnecting" | "disconnected";
  realtimeError: string | null;
  _reconnectAttempts: number;
  _reconnectTimeout: ReturnType<typeof setTimeout> | null;
  _isCleaningUp: boolean;
  _handleReconnect: (locationId: string) => void;
  manualReconnect: () => void;

  // UI State
  selectedTableIds: string[];
  isDesignMode: boolean;
  isLoading: boolean;
  loadingFloorPlanId: string | null;
  error: string | null;
  lastSyncAt: string | null; // ISO string for persistence
  floorPlanCache: Record<
    string,
    {
      tables: FloorPlanObject[];
      sections: ServerSection[];
      sectionsById: Record<string, ServerSection>;
      lastSyncAt: string | null;
    }
  >;

  // Undo/Redo (design mode only)
  past: FloorPlanObject[][];
  future: FloorPlanObject[][];

  // Connection
  isOnline: boolean;
  realtimeChannel: RealtimeChannel | null;

  // Actions
  setFloorPlans: (floorPlans: FloorPlan[]) => void;
  setActiveFloorPlanId: (floorPlanId: string | null) => void;
  cleanup: () => void;
  setupRealtimeSubscriptions: (locationId: string) => void;

  // Floor Plan Actions
  /**
   * Switch plans. Tables paint before any network read whenever the plan has a
   * cache entry or geometry; the reconcile then runs in the background.
   * Resolves with how the first paint was made. `waitForReconcile` makes the
   * promise wait for the reconcile as well (boot, Sync All).
   */
  setActiveFloorPlan: (
    floorPlanId: string,
    opts?: { waitForReconcile?: boolean },
  ) => Promise<SwitchPaintPath>;
  prefetchFloorPlan: (floorPlanId: string) => Promise<void>;
  prefetchFloorPlans: (floorPlanIds?: string[]) => Promise<void>;
  createFloorPlan: (name: string, description?: string) => Promise<string>;
  updateFloorPlan: (id: string, updates: Partial<FloorPlan>) => Promise<void>;
  deleteFloorPlan: (id: string) => Promise<void>;
  loadFloorPlans: () => Promise<void>;
  loadFloorPlanStatus: (force?: boolean) => Promise<void>;
  loadFloorPlanStatusIfStale: (ttlMs?: number) => Promise<void>;
  refreshTableSessions: () => Promise<void>;
  /** One status read and apply. Callers use refreshTableSessions, which serialises it. */
  _refreshTableSessionsOnce: () => Promise<void>;
  /**
   * Apply one tables-channel session broadcast directly (no RPC). Returns false
   * when it can't be applied safely; the caller then reconciles as before.
   */
  applySessionBroadcastPayload: (payload: SessionBroadcastPayload) => boolean;
  getCachedFloorPlan: (floorPlanId: string) => {
    tables: FloorPlanObject[];
    sections: ServerSection[];
    sectionsById: Record<string, ServerSection>;
    lastSyncAt: string | null;
  } | null;

  // Table Design Actions (Design Mode)
  setDesignMode: (enabled: boolean) => void;
  addTable: (tableData: Partial<FloorPlanObject>) => Promise<string>;
  updateTablePosition: (
    tableId: string,
    x: number,
    y: number,
    rotation?: number,
  ) => Promise<void>;
  updateTableGeometry: (
    tableId: string,
    updates: {
      x: number;
      y: number;
      width: number;
      height: number;
      rotation?: number;
    },
  ) => Promise<void>;
  updateTableName: (tableId: string, name: string) => Promise<void>; // Added
  updateTableSize: (
    tableId: string,
    width: number,
    height: number,
  ) => Promise<void>;
  updateTablePositionsBatch: (
    updates: Array<{ id: string; x: number; y: number; rotation?: number }>,
  ) => Promise<void>;
  removeTable: (tableId: string) => Promise<void>;

  // Table Session Actions (Service Mode)
  seatGuests: (params: {
    tableIds: string[];
    partySize: number;
    guestName?: string;
    guestPhone?: string;
    guestNotes?: string;
    reservationId?: string;
    waitlistId?: string;
    createOrder?: boolean;
    selected_station?: string;
    device_id?: string;
    localOrderId?: string; // Pre-created local order ID to use instead of generating one
  }) => Promise<{ sessionId: string; orderId?: string | null }>;

  updateSessionStatus: (
    sessionId: string,
    status: TableStatus,
    notes?: string,
  ) => Promise<void>;
  transferSession: (sessionId: string, newTableIds: string[]) => Promise<void>;
  mergeTable: (sessionId: string, tableId: string) => Promise<void>;
  unmergeTable: (sessionId: string, tableId: string) => Promise<void>;
  advanceCourse: (sessionId: string) => Promise<void>;
  linkOrderToSession: (sessionId: string, orderId: string) => Promise<void>;
  clearTableSession: (tableId: string) => Promise<void>;
  finishCleaning: (tableId: string) => Promise<void>;

  // Selection Actions
  toggleTableSelection: (tableId: string) => void;
  clearSelection: () => void;
  selectMultipleTables: (tableIds: string[]) => void;

  // Waitlist Actions
  loadWaitlist: () => Promise<void>;
  addToWaitlist: (params: {
    partyName: string;
    partySize: number;
    phone?: string;
    notes?: string;
    preferredSection?: string;
    quotedWaitMinutes?: number;
  }) => Promise<{ waitlistId: string; position: number; quotedWait: number }>;
  notifyWaitlistParty: (
    waitlistId: string,
  ) => Promise<{ phone: string; message: string }>;
  updateWaitlistStatus: (waitlistId: string, status: string) => Promise<void>;
  seatFromWaitlist: (
    waitlistId: string,
    tableIds: string[],
  ) => Promise<{ sessionId: string; orderId?: string }>;

  // Reservation Actions
  loadReservations: (date?: string) => Promise<void>;
  createReservation: (params: {
    partyName: string;
    partySize: number;
    phone: string;
    date: string;
    time: string;
    email?: string;
    notes?: string;
    specialRequests?: string;
    isVip?: boolean;
  }) => Promise<{ reservationId: string; confirmationNumber: string }>;
  updateReservationStatus: (
    reservationId: string,
    status: Reservation["status"],
  ) => Promise<void>;
  assignReservationTables: (
    reservationId: string,
    tableIds: string[],
  ) => Promise<void>;
  seatReservation: (
    reservationId: string,
    tableIds?: string[],
  ) => Promise<{ sessionId: string; orderId?: string }>;
  checkAvailability: (
    date: string,
    time: string,
    partySize: number,
  ) => Promise<FloorPlanObject[]>;

  // Undo/Redo (design mode)
  undo: () => void;
  redo: () => void;
  saveSnapshot: () => void;

  // Server Section Actions
  assignServerToSection: (
    sectionId: string,
    staffProfileId: string,
  ) => Promise<void>;
  unassignServerFromSection: (sectionId: string) => Promise<void>;

  // O(1) Getters
  getTableById: (id: string) => FloorPlanObject | undefined;

  // Internal helpers
  _debouncedRefresh: () => void;
}

// Helper to build tablesById map from tables array
// Helper function to rebuild the tablesById lookup map
// Exported for use in other stores that need to update table state
export const buildTablesById = (
  tables: FloorPlanObject[],
): Record<string, FloorPlanObject> => {
  return tables.reduce(
    (acc, table) => {
      acc[table.id] = table;
      return acc;
    },
    {} as Record<string, FloorPlanObject>,
  );
};

type SnapshotReconcileOutcome =
  | "applied"
  | "failed"
  | "superseded"
  | "rpc_absent";

/**
 * The floor reconcile: ONE location-wide get_floor_snapshot_v1.
 *
 * It returns live status for every plan, so a single round trip commits the
 * active plan, fills floorPlanCache for all of them and hydrates the session
 * store for the whole location. It replaces three sequential table reads plus
 * a sections read per plan, which is what turned a slow database into a
 * frozen Tables screen.
 *
 * Location-wide on purpose: the geometry token is a digest over the plans in
 * scope, so a per-plan call could never match the location-scoped token the
 * store holds.
 *
 * Bounded by a deadline that does not report into connection quality. On any
 * failure the store keeps what it has; nothing is retried here.
 */
async function reconcileFromFloorSnapshot(
  locationId: string,
  mySeq: number,
): Promise<SnapshotReconcileOutcome> {
  const store = useFloorPlanStore;
  const client = getClient();
  const before = store.getState();

  // A token is only worth sending when every plan it describes has its
  // objects here. Otherwise "unchanged" would leave nothing to build from.
  const holdsGeometry =
    before.floorPlans.length > 0 &&
    before.floorPlans.every((fp) => Array.isArray(fp.objects));
  const knownVersion = holdsGeometry ? before.geometryVersion : null;

  let usedFallback = false;
  const rpcStart = performance.now();
  const res = await runWithDeadline<FloorSnapshotEnvelope>(
    "floor_snapshot",
    DEADLINES.read,
    async (signal) => {
      const result = await FloorPlanService.getFloorSnapshot(
        client,
        locationId,
        { knownVersion, signal },
      );
      usedFallback = result.usedFallback;
      return { data: result.data, error: result.error };
    },
    { quality: false },
  );
  recordSpan(KEY_FLOOR_LOAD_RPC_MS, performance.now() - rpcStart);

  if (usedFallback) {
    // Not deployed in this environment. Remember it, so later reconciles go
    // straight to the per-plan reads instead of paying for this probe.
    _floorSnapshotRpcAbsent = true;
    if (!res.error) return "rpc_absent";
  }

  if (res.error || !res.data) {
    noteFloorReadFailure("floor_snapshot", res.error);
    if (mySeq === _loadFloorPlanSeq) {
      store.setState({ error: res.error?.message || "Unknown error" });
    }
    return "failed";
  }

  // A newer load (e.g. a forced post-transfer reconcile) was issued after this
  // one started; its snapshot is fresher.
  if (mySeq !== _loadFloorPlanSeq) return "superseded";

  const snap = res.data;
  const applyStart = performance.now();

  if (snap.geometry) {
    store.getState().setFloorPlans(snap.geometry);
  }
  if (snap.geometry_version !== store.getState().geometryVersion) {
    store.setState({ geometryVersion: snap.geometry_version });
  }

  const prev = store.getState();
  // Read at apply time: the data covers every plan, so it is never "for the
  // wrong plan" however many switches happened while it was in flight.
  const activeId = prev.activeFloorPlanId;
  const plansById = new Map(prev.floorPlans.map((fp) => [fp.id, fp]));
  const liveSessions = getTableSessionStore().getState().sessions;
  const nextReservationByTableId =
    getReservationStore().getState().nextReservationByTableId;
  const syncedAt = new Date().toISOString();

  const sectionsByPlan = new Map<string, ServerSection[]>();
  for (const row of snap.sections ?? []) {
    const list = sectionsByPlan.get(row.floor_plan_id) ?? [];
    list.push({
      id: row.id,
      name: row.name,
      color: row.color,
      assigned_staff_id: row.assigned_staff_id,
      floor_plan_id: row.floor_plan_id,
    });
    sectionsByPlan.set(row.floor_plan_id, list);
  }

  // Cache entries survive only for plans that still exist.
  const nextCache: Record<string, FloorPlanCacheEntry> = {};
  for (const [planId, entry] of Object.entries(prev.floorPlanCache)) {
    if (plansById.has(planId)) nextCache[planId] = entry;
  }

  // Tables the server made a claim about. Only these may lose a session.
  const reportedTables: FloorPlanObject[] = [];
  let activeEntry: FloorPlanCacheEntry | null = null;

  for (const bucket of snap.status ?? []) {
    const plan = plansById.get(bucket.floor_plan_id);
    if (!plan || !Array.isArray(plan.objects)) continue;

    const isActive = plan.id === activeId;
    const prevEntry = prev.floorPlanCache[plan.id];
    const prevTables = isActive ? prev.tables : prevEntry?.tables;
    const prevById = isActive
      ? prev.tablesById
      : prevEntry
        ? buildTablesById(prevEntry.tables)
        : {};

    const built = buildPlanTables(
      plan,
      bucket.tables,
      prevById,
      liveSessions,
      nextReservationByTableId,
    );
    // Same elements in the same order: keep the ARRAY identity too, so
    // subscribers to `tables` do not re-render for an unchanged floor.
    const tables =
      prevTables && sameElements(prevTables, built) ? prevTables : built;

    const freshSections = sectionsByPlan.get(plan.id) ?? [];
    const prevSections = isActive ? prev.sections : prevEntry?.sections;
    const prevSectionsById = isActive
      ? prev.sectionsById
      : prevEntry?.sectionsById;
    const sectionsUnchanged =
      !!prevSections &&
      !!prevSectionsById &&
      shallowValueEqual(prevSections, freshSections, 2);

    const entry = buildFloorPlanCacheEntry(
      tables,
      sectionsUnchanged ? prevSections! : freshSections,
      sectionsUnchanged ? prevSectionsById! : buildSectionsById(freshSections),
      syncedAt,
    );
    nextCache[plan.id] = entry;
    if (isActive) activeEntry = entry;

    const reportedIds = new Set(bucket.tables.map((row) => row.id));
    for (const table of tables) {
      if (reportedIds.has(table.id)) reportedTables.push(table);
    }
  }

  if (activeEntry) {
    const entry: FloorPlanCacheEntry = activeEntry;
    const tablesUnchanged = entry.tables === prev.tables;
    const sectionsUnchanged = entry.sections === prev.sections;
    store.setState({
      ...(tablesUnchanged
        ? {}
        : { tables: entry.tables, tablesById: buildTablesById(entry.tables) }),
      ...(sectionsUnchanged
        ? {}
        : { sections: entry.sections, sectionsById: entry.sectionsById }),
      lastSyncAt: syncedAt,
      error: null,
      isLoading: false,
      loadingFloorPlanId: null,
      floorPlanCache: nextCache,
    });
  } else {
    // The active plan had no status bucket (deleted elsewhere, or its geometry
    // never arrived). Keep what is on screen; the other plans still refresh.
    store.setState({ floorPlanCache: nextCache, error: null });
  }

  // Authoritative for the tables it reported on: a reported table without a
  // session is genuinely free. The sweep is scoped to the tables passed in,
  // so one call covers every plan.
  getTableSessionStore()
    .getState()
    ._patchSessionsFromTables(reportedTables, { clearMissing: true });
  recordSpan(KEY_FLOOR_LOAD_APPLY_MS, performance.now() - applyStart);

  return "applied";
}

export const useFloorPlanStore = create<FloorPlanState>()(
  subscribeWithSelector(
    persist(
      (set, get) => ({
        // Initial State
        locationId: null,
        floorPlans: [],
        geometryVersion: null,
        activeFloorPlanId: null,
        tables: [],
        tablesById: {}, // O(1) lookup map
        waitlist: [],
        reservations: [],
        sections: [],
        sectionsById: {},
        selectedTableIds: [],
        isDesignMode: false,
        isLoading: false,
        loadingFloorPlanId: null,
        error: null,
        lastSyncAt: null,
        floorPlanCache: {},
        past: [],
        future: [],
        isOnline: true,
        realtimeChannel: null,

        realtimeStatus: "disconnected",
        realtimeError: null,
        // ====================================================================
        // SETTER ACTIONS (for external sync)
        // ====================================================================

        setFloorPlans: (floorPlans: FloorPlan[]) => {
          // Merge incoming data with existing floor plans to preserve local-only
          // fields (e.g., canvas_width, canvas_height) that the RPC may not return.
          set((state) => {
            const existingById = new Map(
              state.floorPlans.map((fp) => [fp.id, fp]),
            );
            const merged = floorPlans.map((fp) => {
              const existing = existingById.get(fp.id);
              return existing ? { ...existing, ...fp } : fp;
            });
            const first = merged[0];
            if (first) {
              console.log("[setFloorPlans] merged plan canvas dims:", {
                cw: first.canvas_width,
                ch: first.canvas_height,
                id: first.id,
              });
            }
            return { floorPlans: merged };
          });
        },

        setActiveFloorPlanId: (floorPlanId: string | null) => {
          set({ activeFloorPlanId: floorPlanId });
        },

        // DEPRECATED: the floor `location:{id}:tables` channel is owned entirely
        // by the `useFloorRealtime` hook (in LocationRealtimeProvider). This
        // store no longer opens its own duplicate channel — that caused two
        // writers racing the same state. Kept as a no-op so legacy callers don't
        // break; convergence is handled by the hook + loadFloorPlanStatus.
        setupRealtimeSubscriptions: async (locationId: string) => {
          set({ locationId });
        },

        // NEW: Reconnection with exponential backoff
        _reconnectAttempts: 0,
        _reconnectTimeout: null as ReturnType<typeof setTimeout> | null,
        _isCleaningUp: false,

        _handleReconnect: (locationId: string) => {
          const maxAttempts = 5;
          const state = get();

          if (state._reconnectAttempts >= maxAttempts) {
            console.warn("[Realtime] Max reconnect attempts reached");
            set({
              realtimeStatus: "disconnected",
              realtimeError: "Connection failed. Tap to retry.",
            });
            return;
          }

          // Clear existing timeout
          if (state._reconnectTimeout) {
            clearTimeout(state._reconnectTimeout);
          }

          // Faster backoff: 0ms (instant), 500ms, 1s, 2s, 4s
          const delay =
            state._reconnectAttempts === 0
              ? 0
              : 500 * Math.pow(2, state._reconnectAttempts - 1);

          console.log(
            `[Realtime] Reconnecting in ${delay}ms (attempt ${
              state._reconnectAttempts + 1
            })`,
          );

          const timeout = setTimeout(async () => {
            set({ _reconnectAttempts: get()._reconnectAttempts + 1 });

            // Unsubscribe first (Reddit pattern)
            const channel = get().realtimeChannel;
            if (channel) {
              const supabase = getClient();
              if (supabase) await supabase.removeChannel(channel);
            }

            // Re-subscribe
            get().setupRealtimeSubscriptions(locationId);
          }, delay);

          set({ _reconnectTimeout: timeout });
        },

        // NEW: Manual reconnect (for UI button)
        manualReconnect: () => {
          const locationId = get().locationId;
          if (!locationId) return;

          set({ _reconnectAttempts: 0, realtimeStatus: "reconnecting" });
          get().setupRealtimeSubscriptions(locationId);
        },

        // Add debounced refresh helper (prevents rapid reloads)
        // UPDATED (Phase 1.3): Increased from 300ms to 500ms to reduce refresh frequency
        _debouncedRefresh: (() => {
          let timeoutId: ReturnType<typeof setTimeout> | null = null;
          return () => {
            if (timeoutId) clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
              useFloorPlanStore.getState().loadFloorPlanStatus();
            }, 500); // Increased from 300ms to 500ms
          };
        })(),

        cleanup: () => {
          set({ _isCleaningUp: true });
          const supabase = getClient();
          const channel = get().realtimeChannel;
          if (channel && supabase) {
            supabase.removeChannel(channel);
          }
          // Clear any pending reconnect timeout
          const timeout = get()._reconnectTimeout;
          if (timeout) {
            clearTimeout(timeout);
          }
          set({
            realtimeChannel: null,
            locationId: null,
            floorPlans: [],
            geometryVersion: null,
            activeFloorPlanId: null,
            loadingFloorPlanId: null,
            tables: [],
            tablesById: {},
            waitlist: [],
            reservations: [],
            floorPlanCache: {},
            _reconnectAttempts: 0,
            _reconnectTimeout: null,
            _isCleaningUp: false,
          });
        },

        // ====================================================================
        // FLOOR PLAN ACTIONS
        // ====================================================================

        setActiveFloorPlan: async (
          floorPlanId: string,
          opts?: { waitForReconcile?: boolean },
        ): Promise<SwitchPaintPath> => {
          const switchStart = performance.now();
          const before = get();
          const cached = before.floorPlanCache[floorPlanId];
          const FRESH_MS = 30_000;
          const cachedSyncMs = cached?.lastSyncAt
            ? Date.parse(cached.lastSyncAt)
            : 0;
          const isFresh =
            !!cached &&
            Number.isFinite(cachedSyncMs) &&
            Date.now() - cachedSyncMs < FRESH_MS;

          // The tables on screen before this switch. If they are this plan's
          // own (a cold start rehydrates the active plan's tables), they are
          // the fallback should the skeleton path's read fail.
          const ownTablesBefore =
            before.tables.length > 0 &&
            before.tables.every((t) => t.floor_plan_id === floorPlanId)
              ? before.tables
              : null;

          let path: SwitchPaintPath;
          const plan = cached
            ? undefined
            : before.floorPlans.find((fp) => fp.id === floorPlanId);

          if (cached) {
            path = isFresh ? "cacheHit/fresh" : "cacheHit/stale";
            const paintStart = performance.now();
            set({
              activeFloorPlanId: floorPlanId,
              tables: cached.tables,
              tablesById: buildTablesById(cached.tables),
              sections: cached.sections,
              sectionsById: cached.sectionsById,
              lastSyncAt: cached.lastSyncAt,
              isLoading: false,
              loadingFloorPlanId: null,
              error: null,
            });
            // Hydrate the session store from the cached snapshot in the SAME
            // frame as the cached table paint. DraggableTable reads sessions
            // from useTableSessionStore (authoritative once initialized — no
            // table.session fallback), and the store only ever holds the
            // active plan's sessions, so without this every switch flashed
            // ALL tables as "available" until the background
            // loadFloorPlanStatus patched sessions in (~0.5-2s). The cache is
            // ≤30s fresh (prefetch re-warm); _patchSessionsFromTables preserves
            // live same-session local-only statuses (seating/ordering/paying/
            // closing) against the snapshot's backend status, so a stale cache
            // can't downgrade an in-progress table; the authoritative load still
            // reconciles right after.
            // NOT authoritative: a rehydrated (cold-start) cache has its sessions
            // STRIPPED, so we must NOT pass clearMissing here. add-only — present
            // sessions are synced, persisted sessions are left intact, and the
            // background loadFloorPlanStatus below (stale cache) reconciles
            // authoritatively. Without this guard a stripped cache wiped the
            // whole session store on launch (all tables flashed "available").
            getTableSessionStore()
              .getState()
              ._patchSessionsFromTables(cached.tables);
            // Wave-1 attribution: synchronous JS block of the cached instant
            // paint (buildTablesById + zustand commit + session patch).
            recordSpan(KEY_FLOOR_SWITCH_PAINT_MS, performance.now() - paintStart);
          } else if (plan && Array.isArray(plan.objects)) {
            // No cache entry, but the plan's geometry is already in the store
            // (and on disk): paint it now with the sessions the session store
            // holds, and let the reconcile correct it. This is the case a slow
            // database used to turn into a skeleton for as long as three
            // sequential reads took. `objects: []` is a known-empty plan and
            // paints as one.
            path = "cacheMiss/geometryPaint";
            const paintedTables = buildPlanTables(
              plan,
              null,
              {},
              getTableSessionStore().getState().sessions,
              getReservationStore().getState().nextReservationByTableId,
            );
            set({
              activeFloorPlanId: floorPlanId,
              tables: paintedTables,
              tablesById: buildTablesById(paintedTables),
              sections: [],
              sectionsById: {},
              // null, not "now": nothing was read. Staleness checks and the
              // realtime just-loaded suppression must still see this plan as
              // never synced.
              lastSyncAt: null,
              isLoading: false,
              loadingFloorPlanId: null,
              error: null,
              floorPlanCache: {
                ...before.floorPlanCache,
                [floorPlanId]: buildFloorPlanCacheEntry(
                  paintedTables,
                  [],
                  {},
                  null,
                ),
              },
            });
            // No _patchSessionsFromTables: these sessions came FROM that store.
          } else {
            path = "cacheMiss/skeleton";
            set({
              activeFloorPlanId: floorPlanId,
              loadingFloorPlanId: floorPlanId,
              isLoading: true,
              tables: [],
              tablesById: {},
              sections: [],
              sectionsById: {},
              error: null,
            });
          }

          if (path !== "cacheMiss/skeleton") {
            recordSpan(KEY_FLOOR_SWITCH_WAIT_MS, performance.now() - switchStart);
          }

          const finishLoading = () => {
            if (get().activeFloorPlanId !== floorPlanId) return;
            const now = get();
            if (
              path === "cacheMiss/skeleton" &&
              now.tables.length === 0 &&
              ownTablesBefore
            ) {
              // The read failed and there is no geometry to paint from: the
              // plan's last known tables beat an empty floor.
              set({
                tables: ownTablesBefore,
                tablesById: buildTablesById(ownTablesBefore),
                isLoading: false,
                loadingFloorPlanId: null,
              });
              return;
            }
            if (now.isLoading || now.loadingFloorPlanId) {
              set({ isLoading: false, loadingFloorPlanId: null });
            }
          };

          // Raw reachability, not getIsOnline(): that one is also false in slow
          // mode, and a slow connection is exactly when a reconcile is wanted.
          const reachable = getRawIsOnline();

          if (path === "cacheHit/fresh" || !reachable) {
            // Fresh cache: the paint above is authoritative and realtime keeps
            // it live, so a reconcile would re-fetch identical data. Offline:
            // nothing to ask; the paint (or the fallback) is what there is.
            finishLoading();
          } else {
            const reconcile = get()
              .loadFloorPlanStatus()
              .catch((error: unknown) => {
                noteFloorReadFailure("floor_switch_reconcile", error);
              })
              .finally(finishLoading);

            if (path === "cacheMiss/skeleton" || opts?.waitForReconcile) {
              await reconcile;
              if (path === "cacheMiss/skeleton") {
                recordSpan(
                  KEY_FLOOR_SWITCH_WAIT_MS,
                  performance.now() - switchStart,
                );
              }
            }
          }

          // Only the legacy per-plan path needs this: one snapshot already
          // fills every plan's cache.
          void get().prefetchFloorPlans();
          return path;
        },

        prefetchFloorPlan: async (floorPlanId: string) => {
          if (!floorPlanId) return;

          // Perf T1a: re-warm STALE cache entries instead of skipping forever.
          // The old `if (cached) return` meant a plan's cache went permanently
          // stale after first fill — every later switch painted stale session
          // states and then paid a full background refresh + table re-render.
          // prefetchFloorPlans runs after every switch, so this keeps inactive
          // plans ≤30s old and switches land on already-fresh data.
          const cached = get().floorPlanCache[floorPlanId];
          const cachedSyncMs = cached?.lastSyncAt
            ? Date.parse(cached.lastSyncAt)
            : 0;
          const isFresh =
            !!cached &&
            Number.isFinite(cachedSyncMs) &&
            Date.now() - cachedSyncMs < 30_000;
          if (isFresh) return;

          const existingPromise = _prefetchFloorPlanPromises.get(floorPlanId);
          if (existingPromise) {
            return existingPromise;
          }

          const prefetchPromise = (async () => {
            try {
              const snapshot = await runWithDeadline<FloorPlanCacheEntry>(
                "floor_plan_prefetch",
                DEADLINES.read,
                (signal) => fetchFloorPlanSnapshot(floorPlanId, {}, signal),
                { quality: false },
              );
              if (!snapshot.data) {
                if (snapshot.error) {
                  console.warn(
                    `[prefetchFloorPlan] Failed to prefetch ${floorPlanId}:`,
                    snapshot.error,
                  );
                }
                return;
              }

              set({
                floorPlanCache: {
                  ...get().floorPlanCache,
                  [floorPlanId]: snapshot.data,
                },
              });
            } finally {
              _prefetchFloorPlanPromises.delete(floorPlanId);
            }
          })();

          _prefetchFloorPlanPromises.set(floorPlanId, prefetchPromise);
          return prefetchPromise;
        },

        prefetchFloorPlans: async (floorPlanIds?: string[]) => {
          // Where the snapshot RPC answers, every reconcile already fills the
          // cache for all plans in one read. Per-plan prefetch would add four
          // reads per plan on top, and it was the first thing to fail on a
          // slow database. It stays for environments without the RPC.
          if (!_floorSnapshotRpcAbsent && get().locationId) return;

          const activeFloorPlanId = get().activeFloorPlanId;
          const ids =
            floorPlanIds && floorPlanIds.length > 0
              ? floorPlanIds
              : get().floorPlans.map((floorPlan) => floorPlan.id);

          await Promise.allSettled(
            ids
              .filter((id) => !!id && id !== activeFloorPlanId)
              .map((id) => get().prefetchFloorPlan(id)),
          );
        },

        loadFloorPlans: async () => {
          const supabase = getClient();
          const locationId = get().locationId;
          if (!supabase || !locationId) return;

          // Versioned snapshot: geometry is only re-sent when the layout has
          // actually changed, so an unedited floor costs its live status only
          // (-79% payload, 5 round trips -> 1). Falls back to the legacy RPC
          // where get_floor_snapshot_v1 isn't deployed.
          const knownVersion = get().geometryVersion;
          let { data: snap, error } = await FloorPlanService.getFloorSnapshot(
            supabase,
            locationId,
            { knownVersion },
          );
          if (error) {
            set({ error: error.message });
            return;
          }

          // geometry === null means "your token is current, reuse your cache".
          if (snap && snap.geometry === null) {
            if (get().floorPlans.length > 0) {
              // Normal warm path: keep cached geometry, refresh the token.
              set({ geometryVersion: snap.geometry_version });
              return;
            }
            // Token without geometry to match it — should be unreachable since
            // both persist together, but re-requesting unconditionally is the
            // difference between a stale-token bug and an EMPTY FLOOR PLAN on
            // a live terminal. Ask again with no token.
            const retry = await FloorPlanService.getFloorSnapshot(
              supabase,
              locationId,
              { knownVersion: null },
            );
            if (retry.error) {
              set({ error: retry.error.message });
              return;
            }
            snap = retry.data;
          }

          if (snap?.geometry_version !== undefined) {
            set({ geometryVersion: snap.geometry_version });
          }

          let plans = snap?.geometry || [];

          // The get_location_floor_plans RPC may not include canvas_width /
          // canvas_height. Patch them from the direct table if missing.
          const needsPatch = plans.some(
            (fp) => fp.canvas_width == null || fp.canvas_height == null,
          );
          if (needsPatch) {
            const { data: fullRows } = await supabase
              .from("floor_plans")
              .select("id, canvas_width, canvas_height")
              .in(
                "id",
                plans.map((fp) => fp.id),
              );
            if (fullRows) {
              const dimsById = new Map(
                fullRows.map((r: any) => [
                  r.id,
                  {
                    canvas_width: r.canvas_width,
                    canvas_height: r.canvas_height,
                  },
                ]),
              );
              plans = plans.map((fp) => {
                const dims = dimsById.get(fp.id);
                return dims
                  ? {
                      ...fp,
                      canvas_width: dims.canvas_width,
                      canvas_height: dims.canvas_height,
                    }
                  : fp;
              });
            }
          }

          set({ floorPlans: plans });
          // Warm the cache for inactive plans in the background so subsequent
          // switches are instant (cache-hit path in setActiveFloorPlan).
          void get().prefetchFloorPlans();
        },

        createFloorPlan: async (name: string, description?: string) => {
          const supabase = getClient();
          const locationId = get().locationId;
          if (!locationId) throw new Error("No location set");

          const { data, error } = await FloorPlanService.createFloorPlan(
            supabase,
            {
              p_location_id: locationId,
              p_name: name,
              p_description: description,
            },
          );

          if (error) throw error;
          if (!data) throw new Error("Failed to create floor plan");

          // Reload through the snapshot, so every plan keeps its `objects`
          // (the switch paints from them). A new plan changes the geometry
          // token, so the full geometry comes back.
          await get().loadFloorPlans();

          return data.floor_plan_id;
        },

        updateFloorPlan: async (id: string, updates: Partial<FloorPlan>) => {
          const supabase = getClient();
          const locationId = get().locationId;
          if (!locationId) throw new Error("No location set");

          console.log(
            "[updateFloorPlan] Saving updates:",
            updates,
            "for id:",
            id,
          );

          const { error } = await FloorPlanService.updateFloorPlan(
            supabase,
            id,
            updates,
          );
          if (error) throw error;

          // Proactively merge the updates into the local floorPlans array so the
          // UI reflects changes immediately — the get_location_floor_plans RPC
          // may not return canvas_width / canvas_height, so a full reload can
          // silently drop those fields.
          const state = get();
          const updatedPlans = state.floorPlans.map((fp) =>
            fp.id === id ? { ...fp, ...updates } : fp,
          );

          // Also patch the floorPlanCache so the layout viewer picks up the
          // new canvas dimensions on next render.
          const existingCache = state.floorPlanCache[id];
          if (existingCache) {
            set({
              floorPlans: updatedPlans,
              floorPlanCache: {
                ...state.floorPlanCache,
                [id]: {
                  ...existingCache,
                  lastSyncAt: new Date().toISOString(),
                },
              },
            });
          } else {
            set({ floorPlans: updatedPlans });
          }
        },

        deleteFloorPlan: async (id: string) => {
          console.log("[deleteFloorPlan] Starting delete for floor plan:", id);
          const supabase = getClient();
          const locationId = get().locationId;
          console.log(
            "[deleteFloorPlan] locationId:",
            locationId,
            "supabase:",
            !!supabase,
          );
          if (!locationId) throw new Error("No location set");
          if (!supabase) throw new Error("Supabase client not available");

          // Collect table IDs before deletion so we can clean up orphaned
          // sessions in useTableSessionStore after the floorplan is gone.
          const isActive = get().activeFloorPlanId === id;
          const cachedEntry = get().floorPlanCache[id];
          const deletedTableIds: string[] = isActive
            ? get().tables.map((t) => t.id)
            : (cachedEntry?.tables.map((t) => t.id) ?? []);

          // Use the SECURITY DEFINER RPC to cascade-delete the floor plan.
          // This bypasses RLS on online_order_sessions and handles all FK
          // cleanup server-side (table_qr_codes, online_order_sessions,
          // qr_guest_alerts → floor_plan_objects → floor_plans).
          console.log(
            "[deleteFloorPlan] Calling delete_floor_plan_cascade RPC...",
          );
          const { error } = await supabase.rpc("delete_floor_plan_cascade", {
            p_floor_plan_id: id,
          });
          if (error) {
            console.error("[deleteFloorPlan] RPC error:", error);
            throw error;
          }

          console.log(
            "[deleteFloorPlan] Floor plan deleted, reloading list...",
          );
          // Through the snapshot, so the remaining plans keep their `objects`.
          // The deleted plan is filtered out here as well: if the reload
          // fails, the list must still not offer a plan that no longer exists.
          await get().loadFloorPlans();

          const newPlans = get().floorPlans.filter((fp) => fp.id !== id);
          const nextCache = { ...get().floorPlanCache };
          delete nextCache[id];

          set({
            floorPlans: newPlans,
            activeFloorPlanId: isActive
              ? newPlans[0]?.id || null
              : get().activeFloorPlanId,
            floorPlanCache: nextCache,
          });

          if (isActive && newPlans.length > 0) {
            get().setActiveFloorPlan(newPlans[0].id);
          } else if (newPlans.length === 0) {
            set({
              tables: [],
              tablesById: {},
              isLoading: false,
              loadingFloorPlanId: null,
            });
          }

          // Clean up orphaned sessions in useTableSessionStore for tables
          // that no longer exist. This prevents stale sessions from being
          // counted by activeSessionCount or persisting in MMKV.
          if (deletedTableIds.length > 0) {
            const sessionStore = getTableSessionStore();
            const actions = deletedTableIds
              .filter((tableId) => !!sessionStore.getState().sessions[tableId])
              .map((tableId) => ({
                tableId,
                action: { type: "CLEAR" as const },
              }));
            if (actions.length > 0) {
              sessionStore.getState().batchDispatch(actions);
              console.log(
                "[deleteFloorPlan] Cleaned up",
                actions.length,
                "orphaned sessions for deleted floor plan tables",
              );
            }
          }
        },

        loadFloorPlanStatus: async (force?: boolean) => {
          const floorPlanId = get().activeFloorPlanId;
          if (!floorPlanId || !getClient()) return;

          // One location-wide snapshot is the reconcile wherever the RPC is
          // deployed. The per-plan table reads below remain as the fallback
          // for an environment without it.
          const locationId = get().locationId;
          const useSnapshot = !!locationId && !_floorSnapshotRpcAbsent;
          const loadKey = useSnapshot ? `location:${locationId}` : floorPlanId;

          // Reuse an in-flight load that covers the same thing. On the snapshot
          // path that is the whole location, so a plan switch mid-flight shares
          // the read instead of starting another.
          // `force` skips the dedup so a caller that just mutated the backend
          // (e.g. transferSession) gets a snapshot taken AFTER its write — an
          // in-flight read started before the write would return stale state.
          if (!force && _loadFloorPlanPromise && _loadFloorPlanId === loadKey) {
            return _loadFloorPlanPromise;
          }

          _loadFloorPlanId = loadKey;
          const mySeq = ++_loadFloorPlanSeq;
          const loadPromise = (async () => {
            try {
              if (useSnapshot) {
                const outcome = await reconcileFromFloorSnapshot(
                  locationId!,
                  mySeq,
                );
                if (outcome !== "rpc_absent") return;
                // Not deployed here: fall through to the per-plan reads, then
                // warm the other plans the way this path always has.
              }

              const rpcStart = performance.now();
              const snapshot = await runWithDeadline<FloorPlanCacheEntry>(
                "floor_plan_status",
                DEADLINES.read,
                (signal) =>
                  fetchFloorPlanSnapshot(floorPlanId, get().tablesById, signal),
                { quality: false },
              );
              // Wave-1 attribution: network+parse wait (not a JS block) vs the
              // synchronous apply below — separates "slow RPC" from "slow diff/
              // commit" when a /tables long task lands during a reconcile.
              recordSpan(KEY_FLOOR_LOAD_RPC_MS, performance.now() - rpcStart);

              if (!snapshot.data) {
                // Last known good stays on screen; nothing is retried here.
                noteFloorReadFailure("floor_plan_status", snapshot.error);
                set({ error: snapshot.error?.message || "Unknown error" });
                return;
              }
              if (useSnapshot) void get().prefetchFloorPlans();

              // A newer load (e.g. a forced post-transfer reconcile) was issued
              // after this one started — its snapshot is fresher. Drop ours so a
              // stale read can't clobber the newer authoritative state.
              if (mySeq !== _loadFloorPlanSeq) {
                return;
              }

              // If the user switched floor plans while this request was in flight,
              // ignore the stale response so it can't paint the previous layout back in.
              if (get().activeFloorPlanId !== floorPlanId) {
                return;
              }

              const applyStart = performance.now();
              const prev = get();
              const prevTables = prev.tables;
              const prevById = prev.tablesById;
              const prevSections = prev.sections;
              const nextSections = snapshot.data.sections;

              // Perf T2a: reuse the PREVIOUS object identity for every table
              // that is value-equal to its fresh counterpart. Downstream this
              // means: useShallow(s => s.tables) subscribers (TablesScreen)
              // skip re-rendering entirely when elements are identical, and
              // DraggableTable.memo comparators hit the prev===next fast path
              // for the ~49 tables a 1-table session change didn't touch.
              // (The old field-subset equality replaced ALL identities on any
              // single change, re-diffing every table on every realtime tick.)
              const nextTables = snapshot.data.tables.map((n) => {
                const p = prevById[n.id];
                return p && shallowValueEqual(p, n, 3) ? p : n;
              });

              const tablesEqual =
                prevTables.length === nextTables.length &&
                nextTables.every((t, i) => t === prevTables[i]);

              const sectionsEqual =
                prevSections.length === nextSections.length &&
                prevSections.every((s, i) => s.id === nextSections[i]?.id);

              if (tablesEqual && sectionsEqual) {
                // Data unchanged — skip the commit so 100 DraggableTables don't
                // re-render. Still update lastSyncAt + cache freshness.
                set({
                  lastSyncAt: snapshot.data.lastSyncAt,
                  error: null,
                  isLoading: false,
                  loadingFloorPlanId: null,
                  floorPlanCache: {
                    ...prev.floorPlanCache,
                    [floorPlanId]: snapshot.data,
                  },
                });
              } else {
                set({
                  tables: tablesEqual ? prevTables : nextTables,
                  tablesById: tablesEqual
                    ? prev.tablesById
                    : buildTablesById(nextTables),
                  sections: sectionsEqual ? prevSections : nextSections,
                  sectionsById: sectionsEqual
                    ? prev.sectionsById
                    : snapshot.data.sectionsById,
                  lastSyncAt: snapshot.data.lastSyncAt,
                  error: null,
                  isLoading: false,
                  loadingFloorPlanId: null,
                  floorPlanCache: {
                    ...prev.floorPlanCache,
                    [floorPlanId]: snapshot.data,
                  },
                });
              }

              // Hydrate session store from fresh table data. Authoritative
              // network snapshot — clearMissing lets it clear genuinely-freed
              // tables (table present, no session).
              getTableSessionStore()
                .getState()
                ._patchSessionsFromTables(snapshot.data.tables, {
                  clearMissing: true,
                });
              // Wave-1 attribution: synchronous diff + commit + session patch.
              recordSpan(KEY_FLOOR_LOAD_APPLY_MS, performance.now() - applyStart);

              // Order prefetch is now handled by services/tableOrderPrefetch.ts subscriber
            } finally {
              // Only clear the dedup slot if WE are still the latest load —
              // a newer forced load may have superseded us.
              if (mySeq === _loadFloorPlanSeq && _loadFloorPlanId === loadKey) {
                _loadFloorPlanPromise = null;
                _loadFloorPlanId = null;
              }
            }
          })();

          _loadFloorPlanPromise = loadPromise;
          return loadPromise;
        },

        loadFloorPlanStatusIfStale: async (ttlMs: number = 30000) => {
          const { lastSyncAt, isLoading } = get();

          // Don't refresh if already loading
          if (isLoading) {
            if (__DEV__)
              console.log(
                "[loadFloorPlanStatusIfStale] Skipping - already loading",
              );
            return;
          }

          // Check if offline - use cached data
          const isOnline = getIsOnline();
          if (!isOnline) {
            if (__DEV__)
              console.log(
                "[loadFloorPlanStatusIfStale] Offline - using cached data",
              );
            return;
          }

          // Check if data is stale
          const isStale =
            !lastSyncAt || Date.now() - new Date(lastSyncAt).getTime() > ttlMs;

          if (isStale) {
            if (__DEV__)
              console.log(
                "[loadFloorPlanStatusIfStale] Data is stale - refreshing",
              );
            if (get().tables.length > 0 && get().locationId) {
              await get().refreshTableSessions(); // lightweight, no geometry
            } else {
              await get().loadFloorPlanStatus(); // full load
            }
          } else if (__DEV__) {
            console.log(
              "[loadFloorPlanStatusIfStale] Data is fresh - skipping refresh",
            );
          }
        },

        // Lightweight session-only refresh using get_location_table_status_v2
        // Geometry is preserved from cache — only .session is updated
        //
        // One read at a time. This runs on every floor broadcast (about every
        // 1.5 s on a busy floor); when the database is slow, reads that each
        // take seconds used to stack up on the HTTP client's per-host queue,
        // ahead of whatever the operator had just tapped. A call that arrives
        // while a read is in flight asks for ONE more read after it, so a burst
        // still ends with a read taken after its last broadcast.
        refreshTableSessions: async () => {
          if (_refreshInFlight) {
            _refreshRerun = true;
            return _refreshInFlight;
          }

          const run = async (): Promise<void> => {
            do {
              _refreshRerun = false;
              await get()._refreshTableSessionsOnce();
            } while (_refreshRerun);
          };
          const inFlight = run().finally(() => {
            if (_refreshInFlight === inFlight) {
              _refreshInFlight = null;
              _refreshRerun = false;
            }
          });
          _refreshInFlight = inFlight;
          return inFlight;
        },

        _refreshTableSessionsOnce: async () => {
          const supabase = getClient();
          const locationId = get().locationId;
          const floorPlanId = get().activeFloorPlanId;
          if (!locationId || !supabase || !floorPlanId) return;

          const { data, error } = await runWithDeadline<
            LocationTableStatusRow[]
          >(
            "floor_status",
            DEADLINES.read,
            (signal) =>
              FloorPlanService.getLocationTableStatus(
                supabase,
                locationId,
                signal,
              ),
            { quality: false },
          );

          if (error) {
            // If offline, restore sessions from useTableSessionStore (persisted in MMKV)
            const isOnline = getIsOnline();
            if (!isOnline) {
              console.log(
                "[refreshTableSessions] Offline — restoring sessions from session store",
              );
              const sessionState = getTableSessionStore().getState();
              const currentTables = get().tables;
              const restored = currentTables.map((table) => {
                const session = sessionState.sessions[table.id];
                return session ? { ...table, session } : table;
              });
              if (get().activeFloorPlanId !== floorPlanId) {
                return;
              }
              set({
                tables: restored,
                tablesById: buildTablesById(restored),
                floorPlanCache: {
                  ...get().floorPlanCache,
                  [floorPlanId]: {
                    tables: restored,
                    sections: get().sections,
                    sectionsById: get().sectionsById,
                    lastSyncAt: get().lastSyncAt,
                  },
                },
              });
              return;
            }
            noteFloorReadFailure("floor_status", error);
            if (error.code === "DEADLINE_EXCEEDED") {
              // The database is slow. A full load would only queue more reads
              // behind the one that just timed out; the next broadcast or the
              // heartbeat tries again. Last known good stays on screen.
              set({ error: error.message });
              return;
            }
            console.warn(
              "[refreshTableSessions] Error, falling back to full load:",
              error.message,
            );
            await get().loadFloorPlanStatus();
            return;
          }

          if (!data) return;

          // Pre-group table IDs by session for merged_tables
          const tableIdsBySession: Record<string, string[]> = {};
          for (const row of data) {
            if (row.session_id) {
              (tableIdsBySession[row.session_id] ??= []).push(row.table_id);
            }
          }

          // Session per reported table, in the one shape every floor read maps
          // to (see "Session mapping"). A reported table with no session is
          // `undefined`, the same "no session" every other writer uses, so a
          // free table keeps its identity whichever read touched it last.
          const reportedTableIds = new Set<string>();
          const sessionByTableId: Record<string, TableSession | undefined> = {};
          for (const row of data) {
            reportedTableIds.add(row.table_id);
            sessionByTableId[row.table_id] =
              sessionFromStatusRow(
                row,
                row.session_id ? (tableIdsBySession[row.session_id] ?? []) : [],
              ) ?? undefined;
          }

          const currentTables = get().tables;
          const currentTablesById = get().tablesById;

          if (get().activeFloorPlanId !== floorPlanId) {
            return;
          }

          // Merge sessions into existing tables, preserving geometry.
          //
          // Runs on every floor broadcast (~every 1.5s on a busy floor). A
          // table whose session is value-equal keeps its OBJECT IDENTITY, the
          // same T2a rule as loadFloorPlanStatus — otherwise every table is new
          // on every reconcile and the whole Tables screen, sidebar list and
          // context sheet re-render with it.
          const withSession = (
            table: FloorPlanObject,
            session: FloorPlanObject["session"],
          ): FloorPlanObject =>
            shallowValueEqual(table.session, session, 3)
              ? table
              : { ...table, session };

          const mergedTables = currentTables.map((table) => {
            const incomingSession = sessionByTableId[table.id];

            // Preserve local-only statuses with the same session ID
            const currentSession = currentTablesById[table.id]?.session;
            if (
              currentSession &&
              isLocalOnlyStatus(currentSession.status) &&
              incomingSession &&
              currentSession.id === incomingSession.id
            ) {
              return withSession(table, currentSession);
            }

            // Drop an incoming session that was CLEAR'd locally within TTL —
            // see wasRecentlyCleared() comment for context. Treat as "no session".
            if (incomingSession && wasRecentlyCleared(incomingSession.id)) {
              return withSession(table, undefined);
            }

            // A table the status read did not report on keeps what it has.
            return withSession(
              table,
              reportedTableIds.has(table.id) ? incomingSession : table.session,
            );
          });

          const unchanged = mergedTables.every(
            (t, i) => t === currentTables[i],
          );
          if (unchanged) {
            // Nothing to paint — `tables` keeps its identity. Freshness still
            // moves (loadFloorPlanStatusIfStale reads lastSyncAt), exactly as
            // loadFloorPlanStatus does on an unchanged snapshot. Other paths
            // (_syncToFloorPlanStore) update `tables` without the cache, so
            // re-point the cache at the live array.
            const now = new Date().toISOString();
            const cached = get().floorPlanCache[floorPlanId];
            set({
              lastSyncAt: now,
              error: null,
              floorPlanCache: {
                ...get().floorPlanCache,
                [floorPlanId]: {
                  tables: currentTables,
                  sections: cached?.sections ?? get().sections,
                  sectionsById: cached?.sectionsById ?? get().sectionsById,
                  lastSyncAt: now,
                },
              },
            });
            // The session store still gets the authoritative snapshot — its
            // SYNC keeps identity for unchanged sessions.
            getTableSessionStore()
              .getState()
              ._patchSessionsFromTables(mergedTables, { clearMissing: true });
            return;
          }

          set({
            tables: mergedTables,
            tablesById: buildTablesById(mergedTables),
            lastSyncAt: new Date().toISOString(),
            error: null,
            floorPlanCache: {
              ...get().floorPlanCache,
              [floorPlanId]: {
                tables: mergedTables,
                sections: get().sections,
                sectionsById: get().sectionsById,
                lastSyncAt: new Date().toISOString(),
              },
            },
          });

          // Hydrate session store from merged tables. Authoritative network
          // snapshot (getLocationTableStatus) — clearMissing lets it clear
          // genuinely-freed tables.
          getTableSessionStore()
            .getState()
            ._patchSessionsFromTables(mergedTables, { clearMissing: true });
        },

        applySessionBroadcastPayload: (payload: SessionBroadcastPayload) => {
          const floorPlanId = get().activeFloorPlanId;
          const sessionId = payload?.data?.session?.id;
          if (!floorPlanId || !sessionId || get().tables.length === 0) {
            return false;
          }

          const sentAt = payload.timestamp ? Date.parse(payload.timestamp) : NaN;
          const lastAt = _lastSessionBroadcastAt.get(sessionId);
          if (Number.isFinite(sentAt) && lastAt !== undefined && sentAt < lastAt) {
            // Older than what we already applied: nothing to do.
            return true;
          }

          const result = applySessionBroadcast(
            get().tables,
            payload,
            (id) => wasRecentlyCleared(id),
          );
          if (!result) return false;
          if (Number.isFinite(sentAt)) {
            _lastSessionBroadcastAt.set(sessionId, sentAt);
          }
          if (result.changedTables.length === 0) return true;

          set({
            tables: result.tables,
            tablesById: buildTablesById(result.tables),
            floorPlanCache: {
              ...get().floorPlanCache,
              [floorPlanId]: {
                tables: result.tables,
                sections: get().sections,
                sectionsById: get().sectionsById,
                lastSyncAt: get().lastSyncAt,
              },
            },
          });

          // Only the changed tables: clearMissing then frees exactly the
          // tables this session left, and nothing else.
          getTableSessionStore()
            .getState()
            ._patchSessionsFromTables(result.changedTables, { clearMissing: true });
          return true;
        },

        getCachedFloorPlan: (floorPlanId: string) => {
          return get().floorPlanCache[floorPlanId] ?? null;
        },

        // ====================================================================
        // TABLE DESIGN ACTIONS (Design Mode)
        // ====================================================================

        setDesignMode: (enabled: boolean) => {
          set({ isDesignMode: enabled, selectedTableIds: [] });
          if (!enabled) {
            // Clear undo history when exiting design mode
            set({ past: [], future: [] });
          }
        },

        addTable: async (tableData: Partial<FloorPlanObject>) => {
          const supabase = getClient();
          const floorPlanId = get().activeFloorPlanId;
          if (!floorPlanId) throw new Error("No floor plan selected");

          get().saveSnapshot();

          const shape =
            TABLE_SHAPES[tableData.shape_id as keyof typeof TABLE_SHAPES];
          const tableWidth = shape?.width ?? 80;
          const tableHeight = shape?.height ?? 80;

          // Clamp position to stay within canvas bounds
          const floorPlan = get().floorPlans.find((p) => p.id === floorPlanId);
          const canvasW = floorPlan?.canvas_width ?? DEFAULT_CANVAS_WORLD_WIDTH;
          const canvasH =
            floorPlan?.canvas_height ?? DEFAULT_CANVAS_WORLD_HEIGHT;
          const clampedX = Math.max(
            0,
            Math.min(tableData.x ?? 100, canvasW - tableWidth),
          );
          const clampedY = Math.max(
            0,
            Math.min(tableData.y ?? 100, canvasH - tableHeight),
          );

          const { data, error } = await FloorPlanService.addFloorPlanObject(
            supabase,
            {
              p_floor_plan_id: floorPlanId,
              p_name:
                tableData.name ||
                String(
                  getNextAvailableTableNumber(
                    get().tables.map((table) => table.name),
                  ),
                ),
              p_shape_id: tableData.shape_id || "square-4",
              p_category: (shape?.category as any) || "table",
              p_x: clampedX,
              p_y: clampedY,
              p_rotation: tableData.rotation ?? 0,
              p_capacity: shape?.capacity ?? undefined,
              p_width: tableWidth,
              p_height: tableHeight,
            },
          );

          if (error) throw error;
          if (!data) throw new Error("No object_id returned");

          await get().loadFloorPlanStatus();

          return data.object_id;
        },

        updateTablePosition: async (
          tableId: string,
          x: number,
          y: number,
          rotation?: number,
        ) => {
          const supabase = getClient();
          // Optimistic update - targeted O(1) tablesById update instead of full rebuild
          set((state) => {
            const existing = state.tablesById[tableId];
            if (!existing) return state;
            const updated = {
              ...existing,
              x,
              y,
              rotation: rotation ?? existing.rotation,
            };
            const newTables = state.tables.map((t) =>
              t.id === tableId ? updated : t,
            );
            const activeFloorPlanId = state.activeFloorPlanId;
            return {
              tables: newTables,
              tablesById: { ...state.tablesById, [tableId]: updated },
              floorPlanCache: activeFloorPlanId
                ? {
                    ...state.floorPlanCache,
                    [activeFloorPlanId]: buildFloorPlanCacheEntry(
                      newTables,
                      state.sections,
                      state.sectionsById,
                      state.lastSyncAt,
                    ),
                  }
                : state.floorPlanCache,
            };
          });

          const { error } =
            await FloorPlanService.updateFloorPlanObjectPosition(supabase, {
              p_object_id: tableId,
              p_x: x,
              p_y: y,
              p_rotation: rotation,
            });

          if (error) {
            // Revert on error
            await get().loadFloorPlanStatus();
            throw error;
          }
        },

        updateTableGeometry: async (tableId, updates) => {
          const supabase = getClient();
          set((state) => {
            const existing = state.tablesById[tableId];
            if (!existing) return state;
            const updated = {
              ...existing,
              x: updates.x,
              y: updates.y,
              width: updates.width,
              height: updates.height,
              rotation: updates.rotation ?? existing.rotation,
            };
            const newTables = state.tables.map((t) =>
              t.id === tableId ? updated : t,
            );
            const activeFloorPlanId = state.activeFloorPlanId;
            return {
              tables: newTables,
              tablesById: { ...state.tablesById, [tableId]: updated },
              floorPlanCache: activeFloorPlanId
                ? {
                    ...state.floorPlanCache,
                    [activeFloorPlanId]: buildFloorPlanCacheEntry(
                      newTables,
                      state.sections,
                      state.sectionsById,
                      state.lastSyncAt,
                    ),
                  }
                : state.floorPlanCache,
            };
          });

          const { error } = await FloorPlanService.updateFloorPlanObject(
            supabase,
            tableId,
            {
              x: updates.x,
              y: updates.y,
              width: updates.width,
              height: updates.height,
              rotation: updates.rotation,
            },
          );

          if (error) {
            await get().loadFloorPlanStatus();
            throw error;
          }
        },

        updateTableName: async (tableId: string, name: string) => {
          const supabase = getClient();
          // Optimistic update - targeted O(1) tablesById update instead of full rebuild
          set((state) => {
            const existing = state.tablesById[tableId];
            if (!existing) return state;
            const updated = { ...existing, name };
            const newTables = state.tables.map((t) =>
              t.id === tableId ? updated : t,
            );
            const activeFloorPlanId = state.activeFloorPlanId;
            return {
              tables: newTables,
              tablesById: { ...state.tablesById, [tableId]: updated },
              floorPlanCache: activeFloorPlanId
                ? {
                    ...state.floorPlanCache,
                    [activeFloorPlanId]: buildFloorPlanCacheEntry(
                      newTables,
                      state.sections,
                      state.sectionsById,
                      state.lastSyncAt,
                    ),
                  }
                : state.floorPlanCache,
            };
          });

          const { error } = await FloorPlanService.updateFloorPlanObject(
            supabase,
            tableId,
            { name }, // Assuming 'name' column exists and is updateable
          );

          if (error) {
            await get().loadFloorPlanStatus();
            throw error;
          }
        },

        updateTableSize: async (
          tableId: string,
          width: number,
          height: number,
        ) => {
          const supabase = getClient();
          // Optimistic update - targeted O(1) tablesById update instead of full rebuild
          set((state) => {
            const existing = state.tablesById[tableId];
            if (!existing) return state;
            const updated = { ...existing, width, height };
            const newTables = state.tables.map((t) =>
              t.id === tableId ? updated : t,
            );
            const activeFloorPlanId = state.activeFloorPlanId;
            return {
              tables: newTables,
              tablesById: { ...state.tablesById, [tableId]: updated },
              floorPlanCache: activeFloorPlanId
                ? {
                    ...state.floorPlanCache,
                    [activeFloorPlanId]: buildFloorPlanCacheEntry(
                      newTables,
                      state.sections,
                      state.sectionsById,
                      state.lastSyncAt,
                    ),
                  }
                : state.floorPlanCache,
            };
          });

          const { error } = await FloorPlanService.updateFloorPlanObject(
            supabase,
            tableId,
            { width, height },
          );

          if (error) {
            await get().loadFloorPlanStatus();
            throw error;
          }
        },

        updateTablePositionsBatch: async (updates) => {
          const supabase = getClient();
          // Create O(1) lookup map from updates to avoid O(n*m) nested loop
          const updatesById = new Map(updates.map((u) => [u.id, u]));

          // Optimistic update - sync both tables array and tablesById map
          set((state) => {
            const newTables = state.tables.map((t) => {
              const update = updatesById.get(t.id); // O(1) instead of O(n)
              return update
                ? {
                    ...t,
                    x: update.x,
                    y: update.y,
                    rotation: update.rotation ?? t.rotation,
                  }
                : t;
            });
            const activeFloorPlanId = state.activeFloorPlanId;
            return {
              tables: newTables,
              tablesById: buildTablesById(newTables),
              floorPlanCache: activeFloorPlanId
                ? {
                    ...state.floorPlanCache,
                    [activeFloorPlanId]: buildFloorPlanCacheEntry(
                      newTables,
                      state.sections,
                      state.sectionsById,
                      state.lastSyncAt,
                    ),
                  }
                : state.floorPlanCache,
            };
          });

          const { error } = await FloorPlanService.updateFloorPlanObjectsBatch(
            supabase,
            {
              p_updates: updates,
            },
          );

          if (error) {
            await get().loadFloorPlanStatus();
            throw error;
          }
        },

        removeTable: async (tableId: string) => {
          const supabase = getClient();
          get().saveSnapshot();

          const { error } = await FloorPlanService.deleteFloorPlanObject(
            supabase,
            tableId,
          );

          if (error) throw error;

          // Sync both tables array and tablesById map
          set((state) => {
            const newTables = state.tables.filter((t) => t.id !== tableId);
            const activeFloorPlanId = state.activeFloorPlanId;
            return {
              tables: newTables,
              tablesById: buildTablesById(newTables),
              selectedTableIds: state.selectedTableIds.filter(
                (id) => id !== tableId,
              ),
              floorPlanCache: activeFloorPlanId
                ? {
                    ...state.floorPlanCache,
                    [activeFloorPlanId]: buildFloorPlanCacheEntry(
                      newTables,
                      state.sections,
                      state.sectionsById,
                      state.lastSyncAt,
                    ),
                  }
                : state.floorPlanCache,
            };
          });
        },

        // ====================================================================
        // TABLE SESSION ACTIONS (Service Mode)
        // ====================================================================

        // Forwarding stubs — session methods now delegate to useTableSessionStore
        seatGuests: async (params) =>
          getTableSessionStore().getState().seatGuests(params),

        updateSessionStatus: async (
          sessionId: string,
          status: TableStatus,
          notes?: string,
        ) =>
          getTableSessionStore()
            .getState()
            .updateSessionStatus(sessionId, status, notes),

        transferSession: async (sessionId: string, newTableIds: string[]) =>
          getTableSessionStore()
            .getState()
            .transferSession(sessionId, newTableIds),

        mergeTable: async (sessionId: string, tableId: string) =>
          getTableSessionStore().getState().mergeTable(sessionId, tableId),

        unmergeTable: async (sessionId: string, tableId: string) =>
          getTableSessionStore().getState().unmergeTable(sessionId, tableId),

        advanceCourse: async (sessionId: string) =>
          getTableSessionStore().getState().advanceCourse(sessionId),

        linkOrderToSession: async (sessionId: string, orderId: string) =>
          getTableSessionStore()
            .getState()
            .linkOrderToSession(sessionId, orderId),

        clearTableSession: async (tableId: string) =>
          getTableSessionStore().getState().clearTableSession(tableId),

        finishCleaning: async (tableId: string) =>
          getTableSessionStore().getState().finishCleaning(tableId),

        // ====================================================================
        // SELECTION ACTIONS
        // ====================================================================

        toggleTableSelection: (tableId: string) => {
          set((state) => ({
            selectedTableIds: state.selectedTableIds.includes(tableId)
              ? state.selectedTableIds.filter((id) => id !== tableId)
              : [...state.selectedTableIds, tableId],
          }));
        },

        clearSelection: () => set({ selectedTableIds: [] }),

        selectMultipleTables: (tableIds: string[]) =>
          set({ selectedTableIds: tableIds }),

        // ====================================================================
        // WAITLIST ACTIONS
        // ====================================================================

        loadWaitlist: async () => {
          const supabase = getClient();
          const locationId = get().locationId;
          if (!locationId || !supabase) return;

          const { data, error } = await FloorPlanService.getWaitlist(
            supabase,
            locationId,
          );

          if (error) {
            console.error("Failed to load waitlist:", error);
            return;
          }

          set({ waitlist: data?.waitlist || [] });
        },

        addToWaitlist: async (params) => {
          const supabase = getClient();
          const locationId = get().locationId;
          if (!locationId) throw new Error("No location set");

          const { data, error } = await FloorPlanService.addToWaitlist(
            supabase,
            {
              p_location_id: locationId,
              p_party_name: params.partyName,
              p_party_size: params.partySize,
              p_phone: params.phone,
              p_notes: params.notes,
              p_preferred_section: params.preferredSection,
              p_quoted_wait_minutes: params.quotedWaitMinutes,
            },
          );

          if (error) throw error;
          if (!data) throw new Error("Failed to add to waitlist");

          return {
            waitlistId: data.waitlist_id,
            position: data.position,
            quotedWait: data.quoted_wait_minutes,
          };
        },

        notifyWaitlistParty: async (waitlistId: string) => {
          const supabase = getClient();
          const { data, error } = await FloorPlanService.notifyWaitlistParty(
            supabase,
            waitlistId,
          );

          if (error) throw error;
          if (!data) throw new Error("Failed to notify");

          return {
            phone: data.phone,
            message: data.message_template,
          };
        },

        updateWaitlistStatus: async (waitlistId: string, status: string) => {
          const supabase = getClient();
          const { error } = await FloorPlanService.updateWaitlistStatus(
            supabase,
            waitlistId,
            status,
          );

          if (error) throw error;
        },

        seatFromWaitlist: async (waitlistId: string, tableIds: string[]) => {
          const waitlistEntry = get().waitlist.find(
            (entry) => entry.id === waitlistId,
          );
          const supabase = getClient();
          const { data, error } = await FloorPlanService.seatFromWaitlist(
            supabase,
            waitlistId,
            tableIds,
          );

          if (error) throw error;
          if (!data) throw new Error("Failed to seat from waitlist");

          await get().loadFloorPlanStatus();
          get().clearSelection();

          return {
            sessionId: data.session_id,
            orderId: data.order_id,
          };
        },

        // ====================================================================
        // RESERVATION ACTIONS
        // ====================================================================

        loadReservations: async (date?: string) => {
          const supabase = getClient();
          const locationId = get().locationId;
          if (!locationId || !supabase) return;

          const { data, error } = await FloorPlanService.getReservations(
            supabase,
            locationId,
            date,
          );

          if (error) {
            console.error("Failed to load reservations:", error);
            return;
          }

          set({ reservations: data?.reservations || [] });
        },

        createReservation: async (params) => {
          const supabase = getClient();
          const locationId = get().locationId;
          if (!locationId) throw new Error("No location set");

          const { data, error } = await FloorPlanService.createReservation(
            supabase,
            {
              p_location_id: locationId,
              p_party_name: params.partyName,
              p_party_size: params.partySize,
              p_phone: params.phone,
              p_reservation_date: params.date,
              p_reservation_time: params.time,
              p_email: params.email,
              p_notes: params.notes,
              p_special_requests: params.specialRequests,
              p_is_vip: params.isVip,
            },
          );

          if (error) throw error;
          if (!data) throw new Error("Failed to create reservation");

          return {
            reservationId: data.reservation_id,
            confirmationNumber: data.confirmation_number,
          };
        },

        updateReservationStatus: async (reservationId, status) => {
          const supabase = getClient();
          const { error } = await FloorPlanService.updateReservationStatus(
            supabase,
            reservationId,
            status,
          );

          if (error) throw error;
        },

        assignReservationTables: async (reservationId, tableIds) => {
          const supabase = getClient();

          if (tableIds.length > 0) {
            const targetReservation = get().reservations.find(
              (r) => r.id === reservationId,
            );
            const reservationDate = targetReservation?.reservation_date;
            const reservationTime = targetReservation?.reservation_time;

            if (targetReservation && reservationDate && reservationTime) {
              const { data: existingData, error: existingError } =
                await FloorPlanService.getReservations(
                  supabase,
                  targetReservation.location_id,
                  reservationDate,
                );

              if (!existingError) {
                const existingReservations =
                  existingData?.reservations ?? get().reservations;
                const conflict = findReservationTableConflictForWindow(
                  {
                    reservationDate,
                    reservationTime,
                    durationMinutes: targetReservation.duration_minutes,
                    tableIds,
                    ignoreReservationId: reservationId,
                  },
                  existingReservations,
                );

                if (conflict) {
                  throw new Error(
                    `Table already reserved for ${conflict.partyName} at ${conflict.reservationTime}.`,
                  );
                }
              }
            }
          }

          const { error } = await FloorPlanService.assignReservationTables(
            supabase,
            reservationId,
            tableIds,
          );

          if (error) throw error;
        },

        seatReservation: async (reservationId, tableIds) => {
          const reservation = get().reservations.find(
            (entry) => entry.id === reservationId,
          );
          const supabase = getClient();
          const { data, error } = await FloorPlanService.seatReservation(
            supabase,
            reservationId,
            tableIds,
          );

          if (error) throw error;
          if (!data) throw new Error("Failed to seat reservation");

          await get().loadFloorPlanStatus();

          return {
            sessionId: data.session_id,
            orderId: data.order_id,
          };
        },

        checkAvailability: async (date, time, partySize) => {
          const supabase = getClient();
          const locationId = get().locationId;
          if (!locationId) throw new Error("No location set");

          const { data, error } = await FloorPlanService.checkTableAvailability(
            supabase,
            {
              p_location_id: locationId,
              p_date: date,
              p_time: time,
              p_party_size: partySize,
            },
          );

          if (error) throw error;
          return data || [];
        },

        // ====================================================================
        // HISTORY (Design Mode)
        // ====================================================================

        undo: () => {
          set((state) => {
            if (state.past.length === 0) return state;
            const previous = state.past[state.past.length - 1];
            const newPast = state.past.slice(0, -1);
            const activeFloorPlanId = state.activeFloorPlanId;
            return {
              tables: previous,
              tablesById: buildTablesById(previous),
              past: newPast,
              future: [state.tables, ...state.future],
              floorPlanCache: activeFloorPlanId
                ? {
                    ...state.floorPlanCache,
                    [activeFloorPlanId]: buildFloorPlanCacheEntry(
                      previous,
                      state.sections,
                      state.sectionsById,
                      state.lastSyncAt,
                    ),
                  }
                : state.floorPlanCache,
            };
          });
        },

        redo: () => {
          set((state) => {
            if (state.future.length === 0) return state;
            const next = state.future[0];
            const newFuture = state.future.slice(1);
            const activeFloorPlanId = state.activeFloorPlanId;
            return {
              tables: next,
              tablesById: buildTablesById(next),
              past: [...state.past, state.tables],
              future: newFuture,
              floorPlanCache: activeFloorPlanId
                ? {
                    ...state.floorPlanCache,
                    [activeFloorPlanId]: buildFloorPlanCacheEntry(
                      next,
                      state.sections,
                      state.sectionsById,
                      state.lastSyncAt,
                    ),
                  }
                : state.floorPlanCache,
            };
          });
        },

        saveSnapshot: () => {
          set((state) => ({
            past: [...state.past, state.tables].slice(-30),
            future: [],
          }));
        },

        // Server Section Actions
        assignServerToSection: async (
          sectionId: string,
          staffProfileId: string,
        ) => {
          const client = getClient();
          if (!client) return;

          // Optimistic update
          set((state) => {
            const updatedSections = state.sections.map((s) =>
              s.id === sectionId
                ? { ...s, assigned_staff_id: staffProfileId }
                : s,
            );
            const updatedSectionsById = { ...state.sectionsById };
            if (updatedSectionsById[sectionId]) {
              updatedSectionsById[sectionId] = {
                ...updatedSectionsById[sectionId],
                assigned_staff_id: staffProfileId,
              };
            }
            const activeFloorPlanId = state.activeFloorPlanId;
            return {
              sections: updatedSections,
              sectionsById: updatedSectionsById,
              floorPlanCache: activeFloorPlanId
                ? {
                    ...state.floorPlanCache,
                    [activeFloorPlanId]: buildFloorPlanCacheEntry(
                      state.tables,
                      updatedSections,
                      updatedSectionsById,
                      state.lastSyncAt,
                    ),
                  }
                : state.floorPlanCache,
            };
          });

          // Backend update
          const { error } = await client
            .from("server_sections")
            .update({
              assigned_staff_id: staffProfileId,
              updated_at: new Date().toISOString(),
            })
            .eq("id", sectionId);

          if (error) {
            console.error(
              "[FloorPlan] Failed to assign server to section:",
              error,
            );
            // Revert on error
            set((state) => {
              const reverted = state.sections.map((s) =>
                s.id === sectionId ? { ...s, assigned_staff_id: null } : s,
              );
              const revertedById = { ...state.sectionsById };
              if (revertedById[sectionId]) {
                revertedById[sectionId] = {
                  ...revertedById[sectionId],
                  assigned_staff_id: null,
                };
              }
              const activeFloorPlanId = state.activeFloorPlanId;
              return {
                sections: reverted,
                sectionsById: revertedById,
                floorPlanCache: activeFloorPlanId
                  ? {
                      ...state.floorPlanCache,
                      [activeFloorPlanId]: buildFloorPlanCacheEntry(
                        state.tables,
                        reverted,
                        revertedById,
                        state.lastSyncAt,
                      ),
                    }
                  : state.floorPlanCache,
              };
            });
          }
        },

        unassignServerFromSection: async (sectionId: string) => {
          const client = getClient();
          if (!client) return;

          const previousStaffId =
            get().sectionsById[sectionId]?.assigned_staff_id;

          // Optimistic update
          set((state) => {
            const updatedSections = state.sections.map((s) =>
              s.id === sectionId ? { ...s, assigned_staff_id: null } : s,
            );
            const updatedSectionsById = { ...state.sectionsById };
            if (updatedSectionsById[sectionId]) {
              updatedSectionsById[sectionId] = {
                ...updatedSectionsById[sectionId],
                assigned_staff_id: null,
              };
            }
            const activeFloorPlanId = state.activeFloorPlanId;
            return {
              sections: updatedSections,
              sectionsById: updatedSectionsById,
              floorPlanCache: activeFloorPlanId
                ? {
                    ...state.floorPlanCache,
                    [activeFloorPlanId]: buildFloorPlanCacheEntry(
                      state.tables,
                      updatedSections,
                      updatedSectionsById,
                      state.lastSyncAt,
                    ),
                  }
                : state.floorPlanCache,
            };
          });

          const { error } = await client
            .from("server_sections")
            .update({
              assigned_staff_id: null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", sectionId);

          if (error) {
            console.error(
              "[FloorPlan] Failed to unassign server from section:",
              error,
            );
            // Revert
            if (previousStaffId) {
              set((state) => {
                const reverted = state.sections.map((s) =>
                  s.id === sectionId
                    ? { ...s, assigned_staff_id: previousStaffId }
                    : s,
                );
                const revertedById = { ...state.sectionsById };
                if (revertedById[sectionId]) {
                  revertedById[sectionId] = {
                    ...revertedById[sectionId],
                    assigned_staff_id: previousStaffId,
                  };
                }
                const activeFloorPlanId = state.activeFloorPlanId;
                return {
                  sections: reverted,
                  sectionsById: revertedById,
                  floorPlanCache: activeFloorPlanId
                    ? {
                        ...state.floorPlanCache,
                        [activeFloorPlanId]: buildFloorPlanCacheEntry(
                          state.tables,
                          reverted,
                          revertedById,
                          state.lastSyncAt,
                        ),
                      }
                    : state.floorPlanCache,
                };
              });
            }
          }
        },

        // O(1) Getter
        getTableById: (id: string) => get().tablesById[id],
      }),
      {
        name: "floor-plan-db-storage",
        storage: createLazyPersistStorage(),
        version: 2,
        migrate: (persistedState) => persistedState as any,
        // floorPlanCache is deliberately NOT persisted (Wave-1, telemetry
        // evidence): it made floor-plan-db-storage the app's biggest persist
        // payload (~192KB avg / 207KB max, 39.5ms max stringify, ~7 fires/min
        // — every table/session touch rewrote every cached plan). It is a
        // re-warmable cache: the active plan still restores from the
        // persisted tables/sections below (see onRehydrateStorage fallback);
        // non-active plans re-fetch on first switch after a cold start.
        partialize: (state) => ({
          floorPlans: state.floorPlans,
          // Persisted WITH floorPlans, never apart: the two are written in the
          // same snapshot, so a rehydrated token always describes the geometry
          // rehydrated beside it. That is what lets a warm launch skip the
          // geometry payload entirely. loadFloorPlans still re-requests without
          // the token if it ever finds a token but no plans.
          geometryVersion: state.geometryVersion,
          activeFloorPlanId: state.activeFloorPlanId,
          // Persist geometry WITHOUT the embedded session. onRehydrateStorage
          // below strips `session` from every rehydrated table unconditionally,
          // and onFinishHydration re-bridges live sessions from
          // useTableSessionStore — so persisted session data was written on
          // every convergence and never once read back.
          //
          // That was the bulk of this store's write amplification: the floor
          // reloads while the realtime channel is down were each serializing a
          // ~215KB blob (2.03MB over a 10-minute session on a Tab S6 Lite),
          // most of it session state destined to be thrown away on the next
          // boot. Stripping at write time is exactly what read time already
          // does, so this cannot change behavior — it just stops paying for it.
          tables: stripTableSessions(state.tables),
          sections: state.sections,
          sectionsById: state.sectionsById,
          locationId: state.locationId,
          lastSyncAt: state.lastSyncAt,
        }),
        // Rebuild tablesById map after rehydrating from storage
        // Strip ephemeral session data to prevent stale sessions (e.g. 61h-old)
        onRehydrateStorage: () => (state) => {
          if (!state) return;
          // Shared with partialize — see stripTableSessions. Kept as a local
          // alias so the existing call sites below read unchanged.
          const stripSessions = stripTableSessions;

          const sanitizedCache = Object.fromEntries(
            Object.entries(state.floorPlanCache ?? {}).map(
              ([floorPlanId, entry]) => [
                floorPlanId,
                buildFloorPlanCacheEntry(
                  stripSessions(entry.tables ?? []),
                  entry.sections ?? [],
                  entry.sectionsById ?? buildSectionsById(entry.sections ?? []),
                  entry.lastSyncAt ?? null,
                ),
              ],
            ),
          ) as Record<string, FloorPlanCacheEntry>;

          state.floorPlanCache = sanitizedCache;

          const activeCached = state.activeFloorPlanId
            ? (sanitizedCache[state.activeFloorPlanId] ?? null)
            : null;

          if (activeCached) {
            state.tables = activeCached.tables;
            state.sections = activeCached.sections;
            state.sectionsById = activeCached.sectionsById;
            state.lastSyncAt = activeCached.lastSyncAt;
          } else if (state.tables) {
            state.tables = stripSessions(state.tables);
            state.lastSyncAt = null;
          }

          state.tablesById = buildTablesById(state.tables ?? []);
          return;
          /*
            // Clear session from all rehydrated tables — session data is ephemeral
            // Table geometry (positions, shapes, names) stays cached
            state.tables = state.tables.map((t) => ({
              ...t,
              session: undefined,
            }));
            state.tablesById = buildTablesById(state.tables);
            // Force immediate refresh by clearing lastSyncAt
            state.lastSyncAt = null;
          }
*/
        },
      },
    ),
  ),
);

// After hydration finishes, fetch fresh session data
useFloorPlanStore.persist.onFinishHydration(() => {
  const { activeFloorPlanId, locationId } = useFloorPlanStore.getState();
  if (!activeFloorPlanId) return;

  // Immediately bridge persisted sessions → floor plan (sync, no flicker)
  const sessionState = getTableSessionStore().getState();
  const sessions = sessionState.sessions;
  if (Object.keys(sessions).length > 0) {
    const currentTables = useFloorPlanStore.getState().tables;
    const restored = currentTables.map((table) => {
      const session = sessions[table.id];
      return session ? { ...table, session } : table;
    });
    useFloorPlanStore.setState({
      tables: restored,
      tablesById: buildTablesById(restored),
    });
  }

  // Defer network refresh (non-blocking)
  setTimeout(() => {
    const store = useFloorPlanStore.getState();
    const isOnline = getIsOnline();
    if (!isOnline) return; // already restored above

    if (store.tables.length > 0 && locationId) {
      store.refreshTableSessions(); // lightweight, geometry already cached
    } else {
      store.loadFloorPlanStatus(); // full load
    }
  }, 100);
});
