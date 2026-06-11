import { findReservationTableConflictForWindow } from "@/lib/reservationConflicts";
import { createLazyPersistStorage } from "@/lib/storage";
import { TABLE_SHAPES } from "@/lib/table-shapes";
import { isLocalOnlyStatus } from "@/lib/tableStateMachine";
import { FloorPlanService } from "@/services/floorPlanService";
import { getIsOnline } from "@/services/offlineSyncService";
import {
    FloorPlan,
    FloorPlanObject,
    Reservation,
    ServerSection,
    TableSession,
    TableStatus,
    WaitlistEntry,
} from "@/types/db-floor-plan-types";
import { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { create } from "zustand";
import { persist, subscribeWithSelector } from "zustand/middleware";
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

// Lazy accessor — breaks circular dependency with useReservationStore
const getReservationStore = () =>
  (require("./useReservationStore") as typeof import("./useReservationStore"))
    .useReservationStore;

// Global client reference to avoid direct dependency loops or hook usage outside components
let _supabaseClient: SupabaseClient | null = null;

// Dedup concurrent loadFloorPlanStatus calls (module-level to avoid re-renders)
let _loadFloorPlanPromise: Promise<void> | null = null;
let _loadFloorPlanId: string | null = null; // Track which plan is being loaded
// Monotonic load sequence: lets a forced load supersede an in-flight stale one.
// Only the latest-issued snapshot is allowed to commit to state.
let _loadFloorPlanSeq = 0;
const _prefetchFloorPlanPromises = new Map<string, Promise<void>>();

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

const fetchFloorPlanSnapshot = async (
  floorPlanId: string,
  currentTablesById: Record<string, FloorPlanObject> = {},
): Promise<{ data: FloorPlanCacheEntry | null; error: Error | null }> => {
  const supabase = getClient();

  try {
    const [objectsResult, sectionsResult] = await Promise.all([
      FloorPlanService.getAllFloorPlanObjects(supabase, floorPlanId),
      FloorPlanService.getServerSections(supabase, floorPlanId),
    ]);

    const { data: freshObjects, error } = objectsResult;
    if (error) {
      return { data: null, error };
    }

    const freshTables = freshObjects || [];

    const mergedTables = freshTables.map((freshTable) => {
      const currentTable = currentTablesById[freshTable.id];
      const freshSessionIsInactive =
        (
          freshTable.session as unknown as
            | { is_active?: boolean }
            | undefined
        )?.is_active === false;

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
      if (
        freshTable.session &&
        wasRecentlyCleared(freshTable.session.id)
      ) {
        return { ...freshTable, session: undefined };
      }

      return freshTable;
    });

    const getUpcomingForTable =
      getReservationStore().getState().getUpcomingForTable;
    const enrichedTables = mergedTables.map((table) => {
      const upcoming = getUpcomingForTable(table.id);
      const next = upcoming[0];
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
  setActiveFloorPlan: (floorPlanId: string) => Promise<void>;
  prefetchFloorPlan: (floorPlanId: string) => Promise<void>;
  prefetchFloorPlans: (floorPlanIds?: string[]) => Promise<void>;
  createFloorPlan: (name: string, description?: string) => Promise<string>;
  updateFloorPlan: (id: string, updates: Partial<FloorPlan>) => Promise<void>;
  deleteFloorPlan: (id: string) => Promise<void>;
  loadFloorPlans: () => Promise<void>;
  loadFloorPlanStatus: (force?: boolean) => Promise<void>;
  loadFloorPlanStatusIfStale: (ttlMs?: number) => Promise<void>;
  refreshTableSessions: () => Promise<void>;
  getCachedFloorPlan: (
    floorPlanId: string,
  ) => {
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
  }) => Promise<{ sessionId: string; orderId?: string }>;

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

export const useFloorPlanStore = create<FloorPlanState>()(
  subscribeWithSelector(
    persist(
      (set, get) => ({
        // Initial State
        locationId: null,
        floorPlans: [],
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
          set({ floorPlans });
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

        setActiveFloorPlan: async (floorPlanId: string) => {
          const cached = get().floorPlanCache[floorPlanId];
          const FRESH_MS = 30_000;
          const cachedSyncMs = cached?.lastSyncAt
            ? Date.parse(cached.lastSyncAt)
            : 0;
          const isFresh =
            !!cached &&
            Number.isFinite(cachedSyncMs) &&
            Date.now() - cachedSyncMs < FRESH_MS;

          if (cached) {
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
            // ≤30s fresh (prefetch re-warm) and SYNC respects local-only
            // statuses; the authoritative load still reconciles right after.
            getTableSessionStore()
              .getState()
              ._patchSessionsFromTables(cached.tables);
          } else {
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

          const refresh = get()
            .loadFloorPlanStatus()
            .finally(() => {
              if (get().activeFloorPlanId === floorPlanId) {
                set({ isLoading: false, loadingFloorPlanId: null });
              }
            });

          if (!isFresh) {
            await refresh;
          }
          void get().prefetchFloorPlans();
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
              const snapshot = await fetchFloorPlanSnapshot(floorPlanId);
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
          const supabase = getClient()
          const locationId = get().locationId
          if (!supabase || !locationId) return
          const { data, error } =
            await FloorPlanService.getLocationFloorPlans(supabase, locationId)
          if (error) {
            set({ error: error.message })
            return
          }
          set({ floorPlans: data || [] })
          // Warm the cache for inactive plans in the background so subsequent
          // switches are instant (cache-hit path in setActiveFloorPlan).
          void get().prefetchFloorPlans()
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

          // Reload floor plans
          const { data: floorPlans } =
            await FloorPlanService.getLocationFloorPlans(supabase, locationId);

          set({ floorPlans: floorPlans || [] });

          return data.floor_plan_id;
        },

        updateFloorPlan: async (id: string, updates: Partial<FloorPlan>) => {
          const supabase = getClient();
          const locationId = get().locationId;
          if (!locationId) return;

          const { error } = await FloorPlanService.updateFloorPlan(
            supabase,
            id,
            updates,
          );
          if (error) throw error;

          // Reload
          const { data: floorPlans } =
            await FloorPlanService.getLocationFloorPlans(supabase, locationId);
          set({ floorPlans: floorPlans || [] });
        },

        deleteFloorPlan: async (id: string) => {
          const supabase = getClient();
          const locationId = get().locationId;
          if (!locationId) return;

          const { error } = await FloorPlanService.deleteFloorPlan(
            supabase,
            id,
          );
          if (error) throw error;

          // Reload
          const { data: floorPlans } =
            await FloorPlanService.getLocationFloorPlans(supabase, locationId);

          const newPlans = floorPlans || [];
          const isActive = get().activeFloorPlanId === id;
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
        },

        loadFloorPlanStatus: async (force?: boolean) => {
          const floorPlanId = get().activeFloorPlanId;
          if (!floorPlanId || !getClient()) return;

          // Only reuse promise if loading same floor plan (avoid stale data on plan switch).
          // `force` skips the dedup so a caller that just mutated the backend
          // (e.g. transferSession) gets a snapshot taken AFTER its write — an
          // in-flight read started before the write would return stale state.
          if (!force && _loadFloorPlanPromise && _loadFloorPlanId === floorPlanId) {
            return _loadFloorPlanPromise;
          }

          _loadFloorPlanId = floorPlanId;
          const mySeq = ++_loadFloorPlanSeq;
          const loadPromise = (async () => {
            try {
              const snapshot = await fetchFloorPlanSnapshot(
                floorPlanId,
                get().tablesById,
              );

              if (!snapshot.data) {
                set({ error: snapshot.error?.message || "Unknown error" });
                return;
              }

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

              // Hydrate session store from fresh table data
              getTableSessionStore()
                .getState()
                ._patchSessionsFromTables(snapshot.data.tables);

              // Order prefetch is now handled by services/tableOrderPrefetch.ts subscriber
            } finally {
              // Only clear the dedup slot if WE are still the latest load —
              // a newer forced load may have superseded us.
              if (mySeq === _loadFloorPlanSeq && _loadFloorPlanId === floorPlanId) {
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
            console.log(
              "[loadFloorPlanStatusIfStale] Skipping - already loading",
            );
            return;
          }

          // Check if offline - use cached data
          const isOnline = getIsOnline();
          if (!isOnline) {
            console.log(
              "[loadFloorPlanStatusIfStale] Offline - using cached data",
            );
            return;
          }

          // Check if data is stale
          const isStale =
            !lastSyncAt || Date.now() - new Date(lastSyncAt).getTime() > ttlMs;

          if (isStale) {
            console.log(
              "[loadFloorPlanStatusIfStale] Data is stale - refreshing",
            );
            if (get().tables.length > 0 && get().locationId) {
              await get().refreshTableSessions(); // lightweight, no geometry
            } else {
              await get().loadFloorPlanStatus(); // full load
            }
          } else {
            console.log(
              "[loadFloorPlanStatusIfStale] Data is fresh - skipping refresh",
            );
          }
        },

        // Lightweight session-only refresh using get_location_table_status_v2
        // Geometry is preserved from cache — only .session is updated
        refreshTableSessions: async () => {
          const supabase = getClient();
          const locationId = get().locationId;
          const floorPlanId = get().activeFloorPlanId;
          if (!locationId || !supabase || !floorPlanId) return;

          const { data, error } = await FloorPlanService.getLocationTableStatus(
            supabase,
            locationId,
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

          // Build session lookup from flat rows: tableId → TableSession | null
          const sessionByTableId: Record<string, TableSession | null> = {};
          for (const row of data) {
            if (row.session_id && row.session_status) {
              const mergedTables = tableIdsBySession[row.session_id];
              sessionByTableId[row.table_id] = {
                id: row.session_id,
                session_number: row.session_number,
                status: row.session_status,
                party_size: row.party_size ?? 0,
                guest_name: row.guest_name,
                guest_phone: row.guest_phone ?? undefined,
                order_id: row.order_id,
                server_staff_id: row.server_staff_id ?? undefined,
                seated_at: row.seated_at ?? new Date().toISOString(),
                current_course: row.current_course ?? 1,
                needs_attention: row.needs_attention ?? false,
                is_vip: row.is_vip ?? false,
                merged_tables:
                  (mergedTables?.length ?? 0) > 1 ? mergedTables : undefined,
              };
            } else {
              sessionByTableId[row.table_id] = null;
            }
          }

          const currentTables = get().tables;
          const currentTablesById = get().tablesById;

          if (get().activeFloorPlanId !== floorPlanId) {
            return;
          }

          // Merge sessions into existing tables, preserving geometry
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
              return { ...table, session: currentSession };
            }

            // Drop an incoming session that was CLEAR'd locally within TTL —
            // see wasRecentlyCleared() comment for context. Treat as "no session".
            if (incomingSession && wasRecentlyCleared(incomingSession.id)) {
              return { ...table, session: undefined };
            }

            return {
              ...table,
              session:
                incomingSession !== undefined ? incomingSession : table.session,
            };
          });

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

          // Hydrate session store from merged tables
          getTableSessionStore()
            .getState()
            ._patchSessionsFromTables(mergedTables);
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

          const { data, error } = await FloorPlanService.addFloorPlanObject(
            supabase,
            {
              p_floor_plan_id: floorPlanId,
              p_name:
                tableData.name ||
                String(
                  getNextAvailableTableNumber(get().tables.map((table) => table.name)),
                ),
              p_shape_id: tableData.shape_id || "square-4",
              p_category: (shape?.category as any) || "table",
              p_x: tableData.x ?? 100,
              p_y: tableData.y ?? 100,
              p_rotation: tableData.rotation ?? 0,
              p_capacity: shape?.capacity ?? undefined,
              p_width: shape?.width ?? undefined,
              p_height: shape?.height ?? undefined,
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
        partialize: (state) => ({
          floorPlans: state.floorPlans,
          activeFloorPlanId: state.activeFloorPlanId,
          tables: state.tables,
          sections: state.sections,
          sectionsById: state.sectionsById,
          floorPlanCache: state.floorPlanCache,
          locationId: state.locationId,
          lastSyncAt: state.lastSyncAt,
        }),
        // Rebuild tablesById map after rehydrating from storage
        // Strip ephemeral session data to prevent stale sessions (e.g. 61h-old)
        onRehydrateStorage: () => (state) => {
          if (!state) return;
          const stripSessions = (tables: FloorPlanObject[]) =>
            tables.map((t) => ({
              ...t,
              session: undefined,
            }));

          const sanitizedCache = Object.fromEntries(
            Object.entries(state.floorPlanCache ?? {}).map(
              ([floorPlanId, entry]) => [
                floorPlanId,
                buildFloorPlanCacheEntry(
                  stripSessions(entry.tables ?? []),
                  entry.sections ?? [],
                  entry.sectionsById ??
                    buildSectionsById(entry.sections ?? []),
                  entry.lastSyncAt ?? null,
                ),
              ],
            ),
          ) as Record<string, FloorPlanCacheEntry>;

          state.floorPlanCache = sanitizedCache;

          const activeCached = state.activeFloorPlanId
            ? sanitizedCache[state.activeFloorPlanId] ?? null
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
