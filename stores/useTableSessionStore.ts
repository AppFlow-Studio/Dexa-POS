/**
 * useTableSessionStore - Manages all table session state and operations.
 *
 * Extracted from useFloorPlanStore to separate ephemeral session state
 * from persistent layout/geometry. Sessions ARE persisted to MMKV for
 * offline durability — replaced with backend data when online via hydrateFromBackend().
 *
 * During the bridge period (Phase 1-2), _syncToFloorPlanStore() writes
 * session data back into useFloorPlanStore so unmigrated consumers still
 * work via table.session.
 *
 * Architecture: dispatch()-based mutations with Immer middleware.
 * All session mutations flow through _applyAction (pure) → dispatch/batchDispatch.
 * Side effects (bridge, backend sync) are decoupled via registry.
 */

import { markOrderPendingVoid } from "@/lib/pendingVoidOrderIds";
import {
    ACTION_TO_EVENT,
    type SessionAction as DispatchableAction,
} from "@/lib/sessionActions";
import { _fireEffects, type SideEffectContext } from "@/lib/sessionSideEffects";
import { createLazyPersistStorage } from "@/lib/storage";
import {
    canTransition as canTransitionFn,
    isLocalOnlyStatus,
    TableEvent,
    transitionTableStatus,
} from "@/lib/tableStateMachine";
import { FloorPlanService } from "@/services/floorPlanService";
import { getIsOnline, queueOperation } from "@/services/offlineSyncService";
import { handleSeatingEffect } from "@/services/sessionEffects/handleSeatingEffect";
import { useToastStore } from "@/stores/useToastStore";
import {
    FloorPlanObject,
    TableSession,
    TableStatus,
} from "@/types/db-floor-plan-types";
import type { TableSessionPayload } from "@/types/real-time";
import { create } from "zustand";
import { persist, subscribeWithSelector } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import { useEmployeeStore } from "./useEmployeeStore";
import {
    buildTablesById,
    getFloorPlanClient,
    useFloorPlanStore,
} from "./useFloorPlanStore";
import { useStoreSettingsStore } from "./useStoreSettingsStore";

// ---------------------------------------------------------------------------
// Supabase client — reuses floor plan store's client via getFloorPlanClient()
// ---------------------------------------------------------------------------

const getClient = () => getFloorPlanClient();

function getSelectedTablesCapacity(tableIds: string[]): {
  totalCapacity: number;
  hasKnownCapacity: boolean;
} {
  const tablesById = useFloorPlanStore.getState().tablesById;
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

// ---------------------------------------------------------------------------
// SessionAction type
// ---------------------------------------------------------------------------

export type SessionAction =
  | { type: TableEvent } // state machine validated
  | { type: "SET"; session: TableSession } // optimistic/local, always applied
  | { type: "SYNC"; session: TableSession } // from backend/realtime, always applied (authoritative)
  | { type: "CLEAR" } // remove session
  | { type: "PATCH"; updates: Partial<TableSession> } // update fields only
  | { type: "SESSION_CREATED"; session: TableSession } // replace optimistic with real backend data
  | { type: "SEAT_FAILED" }; // resolve seating → seated on error

// ---------------------------------------------------------------------------
// Side effect registry
// ---------------------------------------------------------------------------

export type SessionSideEffect = (
  tableId: string,
  prev: TableSession | undefined,
  next: TableSession | undefined,
  action: SessionAction,
) => void | Promise<void>;

const sideEffectHandlers: SessionSideEffect[] = [];

export function registerSessionSideEffect(
  handler: SessionSideEffect,
): () => void {
  sideEffectHandlers.push(handler);
  return () => {
    const idx = sideEffectHandlers.indexOf(handler);
    if (idx >= 0) sideEffectHandlers.splice(idx, 1);
  };
}

function fireSideEffects(
  tableId: string,
  prev: TableSession | undefined,
  next: TableSession | undefined,
  action: SessionAction,
) {
  if (sideEffectHandlers.length === 0) return;
  queueMicrotask(() => {
    for (const handler of sideEffectHandlers) {
      try {
        handler(tableId, prev, next, action);
      } catch (err) {
        console.error("[SessionSideEffect] Error:", err);
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Pure _applyAction — computes new session state without side effects
// ---------------------------------------------------------------------------

function _applyAction(
  current: TableSession | undefined,
  action: SessionAction,
): { session: TableSession | undefined; changed: boolean } {
  if (action.type === "SET") {
    return { session: action.session, changed: true };
  }
  if (action.type === "SYNC") {
    // Always apply SYNC from backend — these represent authoritative state changes
    // Local-only intermediates (seating, ordering, paying, closing) are just transient states
    // that will eventually transition to a backend-syncable status
    // DO NOT preserve local-only statuses as this prevents legitimate DB updates from being applied
    // Skip if session data is identical (prevents unnecessary re-renders from polling)
    if (current && current.id === action.session.id) {
      const statusChanged = current.status !== action.session.status;
      const partyChanged = current.party_size !== action.session.party_size;
      const guestChanged = current.guest_name !== action.session.guest_name;
      const orderChanged = current.order_id !== action.session.order_id;
      const serverChanged =
        current.server_staff_id !== action.session.server_staff_id;
      const courseChanged =
        current.current_course !== action.session.current_course;
      const attentionChanged =
        current.needs_attention !== action.session.needs_attention;
      const vipChanged = current.is_vip !== action.session.is_vip;
      const sessionNumChanged =
        current.session_number !== action.session.session_number;

      const currMerged = current.merged_tables || [];
      const newMerged = action.session.merged_tables || [];
      const mergedEqual =
        currMerged.length === newMerged.length &&
        currMerged.every((id, idx) => id === newMerged[idx]);
      const mergedChanged = !mergedEqual;

      if (
        !statusChanged &&
        !partyChanged &&
        !guestChanged &&
        !orderChanged &&
        !serverChanged &&
        !courseChanged &&
        !attentionChanged &&
        !vipChanged &&
        !sessionNumChanged &&
        !mergedChanged
      ) {
        return { session: current, changed: false };
      }
    }
    return { session: action.session, changed: true };
  }
  if (action.type === "CLEAR") {
    return { session: undefined, changed: current !== undefined };
  }
  if (action.type === "PATCH") {
    if (!current) return { session: undefined, changed: false };
    return { session: { ...current, ...action.updates }, changed: true };
  }
  if (action.type === "SESSION_CREATED") {
    return {
      session: { ...action.session, status: "seated" as TableStatus },
      changed: true,
    };
  }
  if (action.type === "SEAT_FAILED") {
    if (current && current.status === "seating") {
      return {
        session: { ...current, status: "seated" as TableStatus },
        changed: true,
      };
    }
    return { session: current, changed: false };
  }
  // Remaining: TableEvent — validate via state machine
  if (!current) return { session: undefined, changed: false };
  try {
    const nextStatus = transitionTableStatus(current.status, action.type);
    return { session: { ...current, status: nextStatus }, changed: true };
  } catch {
    return { session: current, changed: false };
  }
}

// ---------------------------------------------------------------------------
// Index maintenance helpers (used inside Immer set() callbacks)
// ---------------------------------------------------------------------------

function _updateIndex(
  sessionTableIndex: Record<string, string[]>,
  tableId: string,
  prev: TableSession | undefined,
  next: TableSession | undefined,
) {
  // Remove from old index entry
  if (prev?.id && (!next || prev.id !== next.id)) {
    const oldArr = sessionTableIndex[prev.id];
    if (oldArr) {
      const idx = oldArr.indexOf(tableId);
      if (idx >= 0) oldArr.splice(idx, 1);
      if (oldArr.length === 0) delete sessionTableIndex[prev.id];
    }
  }
  // Add to new index entry
  if (next) {
    if (!sessionTableIndex[next.id]) {
      sessionTableIndex[next.id] = [];
    }
    if (!sessionTableIndex[next.id].includes(tableId)) {
      sessionTableIndex[next.id].push(tableId);
    }
  }
  // CLEAR: remove from index
  if (!next && prev?.id) {
    const arr = sessionTableIndex[prev.id];
    if (arr) {
      const idx = arr.indexOf(tableId);
      if (idx >= 0) arr.splice(idx, 1);
      if (arr.length === 0) delete sessionTableIndex[prev.id];
    }
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DispatchResult = {
  success: boolean;
  error?: string;
  nextStatus?: TableStatus | null;
};

interface TableSessionStoreState {
  /** tableId → session data */
  sessions: Record<string, TableSession>;
  /** sessionId → tableId[] (for merged tables) */
  sessionTableIndex: Record<string, string[]>;
  /** true once the store has been populated from the backend at least once */
  isInitialized: boolean;
  // ---- Dispatch API ----

  dispatch: (tableId: string, action: SessionAction) => boolean;
  batchDispatch: (
    actions: Array<{ tableId: string; action: SessionAction }>,
  ) => number;

  /** High-level dispatch for SessionAction (from lib/sessionActions.ts).
   *  Validates transition, applies optimistic update, fires side effects. */
  dispatchAction: (action: DispatchableAction) => Promise<DispatchResult>;

  // ---- Session methods (moved from useFloorPlanStore) ----

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
    localOrderId?: string;
    serverId?: string;
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
  rekeyOrderId: (oldOrderId: string, newOrderId: string) => void;
  linkOrderToSession: (sessionId: string, orderId: string) => Promise<void>;
  clearTableSession: (tableId: string) => Promise<void>;
  finishCleaning: (tableId: string) => Promise<void>;

  // ---- Internal ----

  /** Hydrate sessions from backend via get_location_table_status_v2 */
  hydrateFromBackend: (locationId: string) => Promise<void>;

  /** Handle realtime broadcast for session changes */
  _handleSessionChange: (payload: TableSessionPayload) => void;

  /** Hydrate sessions from FloorPlanObject[] (called after loadFloorPlanStatus) */
  _patchSessionsFromTables: (tables: FloorPlanObject[]) => void;

  /** Bridge: write session data back into useFloorPlanStore (removed in Phase 3) */
  _syncToFloorPlanStore: (changedTableId?: string | string[]) => void;

  // ---- Selectors ----

  getSession: (tableId: string) => TableSession | undefined;
  getSessionBySessionId: (
    sessionId: string,
  ) => { tableId: string; session: TableSession } | undefined;
  getTableStatus: (tableId: string) => TableStatus;
}

// ---------------------------------------------------------------------------
// Microtask-coalescing scheduler for _syncToFloorPlanStore
// Multiple rapid dispatches (realtime sync, side effects) coalesce into one
// floor plan update per microtask, reducing cascading re-renders.
// ---------------------------------------------------------------------------

let _pendingSyncIds: Set<string> | null = null;

function _scheduleSyncToFloorPlan(tableIds: string | string[]) {
  const ids = Array.isArray(tableIds) ? tableIds : [tableIds];
  if (!_pendingSyncIds) {
    _pendingSyncIds = new Set(ids);
    queueMicrotask(() => {
      const pending = _pendingSyncIds;
      _pendingSyncIds = null;
      if (pending && pending.size > 0) {
        useTableSessionStore.getState()._syncToFloorPlanStore([...pending]);
      }
    });
  } else {
    for (const id of ids) _pendingSyncIds.add(id);
  }
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useTableSessionStore = create<TableSessionStoreState>()(
  subscribeWithSelector(
    persist(
      immer((set, get) => ({
        sessions: {},
        sessionTableIndex: {},
        isInitialized: false,

        // ------------------------------------------------------------------
        // dispatch — single table action
        // ------------------------------------------------------------------

        dispatch: (tableId: string, action: SessionAction): boolean => {
          const prev = get().sessions[tableId];
          const result = _applyAction(prev, action);
          if (!result.changed) return false;

          set((state) => {
            if (result.session) {
              state.sessions[tableId] = result.session;
            } else {
              delete state.sessions[tableId];
            }
            _updateIndex(
              state.sessionTableIndex,
              tableId,
              prev,
              result.session,
            );
          });

          _scheduleSyncToFloorPlan(tableId);
          fireSideEffects(tableId, prev, result.session, action);
          return true;
        },

        // ------------------------------------------------------------------
        // batchDispatch — multiple table actions in one React render
        // ------------------------------------------------------------------

        batchDispatch: (
          actions: Array<{ tableId: string; action: SessionAction }>,
        ): number => {
          const currentSessions = get().sessions;
          const allResults = actions.map(({ tableId, action }) => ({
            tableId,
            action,
            prev: currentSessions[tableId],
            result: _applyAction(currentSessions[tableId], action),
          }));

          const results = allResults.filter((r) => r.result.changed);

          if (results.length === 0) return 0;

          set((state) => {
            for (const { tableId, prev, result } of results) {
              if (result.session) {
                state.sessions[tableId] = result.session;
              } else {
                delete state.sessions[tableId];
              }
              _updateIndex(
                state.sessionTableIndex,
                tableId,
                prev,
                result.session,
              );
            }
          });

          // Selective sync — coalesced via microtask to avoid cascading re-renders
          const changedTableIds = results.map((r) => r.tableId);
          _scheduleSyncToFloorPlan(changedTableIds);
          for (const { tableId, action, prev, result } of results) {
            fireSideEffects(tableId, prev, result.session, action);
          }
          return results.length;
        },

        // ------------------------------------------------------------------
        // dispatchAction — high-level dispatch for SessionAction (lib/sessionActions.ts)
        // ------------------------------------------------------------------

        dispatchAction: async (
          action: DispatchableAction,
        ): Promise<DispatchResult> => {
          const { tableId } = action;
          const session = get().sessions[tableId];
          const previousStatus = session?.status;

          // 1. Determine if this action maps to a state machine event
          const event = ACTION_TO_EVENT[action.type];
          let nextStatus: TableStatus | null = null;

          if (event) {
            // Validate transition
            if (!session) {
              return {
                success: false,
                error: `No active session for table ${tableId}`,
              };
            }
            if (!canTransitionFn(session.status, event)) {
              return {
                success: false,
                error: `Invalid transition: "${session.status}" + ${event}`,
              };
            }

            // Apply transition to all tables in this session so merged tables stay in sync.
            const tableIdsForSession = get().sessionTableIndex[session.id] ?? [
              tableId,
            ];
            const changed = get().batchDispatch(
              tableIdsForSession.map((tid) => ({
                tableId: tid,
                action: { type: event },
              })),
            );
            if (changed === 0) {
              return {
                success: false,
                error: "State machine transition produced no change",
              };
            }

            nextStatus = get().sessions[tableId]?.status ?? null;

            // Note: _syncToFloorPlanStore() is already called by dispatch() above,
            // so no manual floor plan update needed here.

            // Backend sync for non-local statuses
            if (nextStatus && !isLocalOnlyStatus(nextStatus) && session) {
              // Fire-and-forget backend sync (non-blocking)
              const sessionId = session.id;
              const syncStatus = nextStatus;
              queueMicrotask(async () => {
                const isOnline = getIsOnline();
                const supabase = getClient();
                if (isOnline && supabase) {
                  try {
                    const p_staff_id =
                      useEmployeeStore.getState().loggedInEmployee?.profileId;
                    const { error } =
                      await FloorPlanService.updateTableSessionStatus(
                        supabase,
                        {
                          p_session_id: sessionId,
                          p_status: syncStatus,
                          p_staff_id,
                        },
                      );
                    if (error) {
                      console.error(
                        "[dispatchAction] Backend sync error, queuing:",
                        error,
                      );
                      await queueOperation({
                        type: "update_session_status",
                        params: { sessionId, status: syncStatus },
                        localOrderId: sessionId,
                      });
                    }
                  } catch (err) {
                    console.error(
                      "[dispatchAction] Backend sync exception, queuing:",
                      err,
                    );
                    await queueOperation({
                      type: "update_session_status",
                      params: { sessionId, status: syncStatus },
                      localOrderId: sessionId,
                    });
                  }
                } else {
                  await queueOperation({
                    type: "update_session_status",
                    params: { sessionId, status: syncStatus },
                    localOrderId: sessionId,
                  });
                }
              });
            }
          }
          // If no event (e.g. CLOSE_CHECK), skip transition — just fire effects

          // 2. Mark void intent BEFORE queueMicrotask to close race window
          // with broadcast handler's conflict detection
          if (action.type === "VOID_ORDER") {
            markOrderPendingVoid(action.orderId);
          }

          // 3. Fire side effects asynchronously
          const ctx: SideEffectContext = {
            action,
            tableId,
            previousStatus,
            nextStatus: nextStatus ?? undefined,
            sessionId: session?.id,
          };

          // Use queueMicrotask so effects fire after Zustand commits
          queueMicrotask(() => {
            _fireEffects(ctx).catch((err) => {
              console.error("[dispatchAction] Side effect error:", err);
            });
          });

          if (
            session?.id &&
            (action.type === "CLEAR_TABLE" || action.type === "VOID_ORDER")
          ) {
            queueMicrotask(() => {
              const reservationStore = (
                require("./useReservationStore") as typeof import("./useReservationStore")
              ).useReservationStore;
              reservationStore
                .getState()
                .completeReservationForSession(session.id)
                .catch((err: unknown) => {
                  console.error(
                    "[dispatchAction] Failed to complete reservation after table close/void:",
                    err,
                  );
                });
            });
          }

          return { success: true, nextStatus };
        },

        // ------------------------------------------------------------------
        // hydrateFromBackend — fetch sessions from get_location_table_status_v2
        // ------------------------------------------------------------------

        hydrateFromBackend: async (locationId: string) => {
          const supabase = getClient();
          if (!supabase || !locationId) return;

          const { data, error } = await FloorPlanService.getLocationTableStatus(
            supabase,
            locationId,
          );

          if (error || !data) {
            console.error("[hydrateFromBackend] Failed:", error);
            return;
          }

          const currentSessions = get().sessions;
          const actions: Array<{ tableId: string; action: SessionAction }> = [];
          const incomingTableIds = new Set<string>();

          for (const row of data) {
            if (!row.session_id || !row.session_status) continue;
            incomingTableIds.add(row.table_id);

            // Preserve merged_tables from existing session — the status RPC
            // returns one row per table and doesn't encode merge relationships.
            // Wiping it on every poll causes the merged-table display to flicker.
            const existingSession = currentSessions[row.table_id];
            const preservedMergedTables =
              existingSession?.id === row.session_id
                ? (existingSession.merged_tables ?? [])
                : [];

            const session: TableSession = {
              id: row.session_id,
              session_number: row.session_number,
              status: row.session_status,
              party_size: row.party_size ?? 1,
              guest_name: row.guest_name,
              seated_at: row.seated_at || new Date().toISOString(),
              current_course: row.current_course ?? 1,
              needs_attention: row.needs_attention ?? false,
              is_vip: row.is_vip ?? false,
              order_id: row.order_id ?? undefined,
              server_staff_id: row.server_staff_id ?? undefined,
              merged_tables: preservedMergedTables,
            };

            actions.push({
              tableId: row.table_id,
              action: { type: "SYNC", session },
            });
          }

          // Clear sessions for tables not in the backend response
          // but preserve optimistic local-only sessions (seating, ordering, etc.)
          for (const tableId of Object.keys(currentSessions)) {
            if (!incomingTableIds.has(tableId)) {
              const existing = currentSessions[tableId];
              if (existing && isLocalOnlyStatus(existing.status)) {
                continue;
              }
              actions.push({ tableId, action: { type: "CLEAR" } });
            }
          }

          if (actions.length > 0) {
            get().batchDispatch(actions);
          }

          // Mark store as initialized — DraggableTable uses this to know the
          // session store is authoritative and should not fall back to stale
          // table.session props that TableLayoutView.memo blocks from updating.
          set((state) => { state.isInitialized = true; });

          console.log(
            `[hydrateFromBackend] Synced ${
              incomingTableIds.size
            } sessions, cleared ${
              Object.keys(currentSessions).length - incomingTableIds.size
            }`,
          );
        },

        // ------------------------------------------------------------------
        // _patchSessionsFromTables — hydrate sessions from FloorPlanObject[]
        // ------------------------------------------------------------------

        _patchSessionsFromTables: (tables: FloorPlanObject[]) => {
          const currentSessions = get().sessions;
          const actions: Array<{ tableId: string; action: SessionAction }> = [];

          // Collect table IDs that have sessions in the incoming data
          const incomingTableIds = new Set<string>();

          for (const table of tables) {
            if (!table.session) continue;
            incomingTableIds.add(table.id);

            // Use SYNC action — applies backend status updates
            actions.push({
              tableId: table.id,
              action: { type: "SYNC", session: table.session },
            });
          }

          // Clear sessions for tables that no longer have sessions
          // but preserve optimistic local-only sessions (seating, ordering, etc.)
          for (const tableId of Object.keys(currentSessions)) {
            if (!incomingTableIds.has(tableId)) {
              const existing = currentSessions[tableId];
              if (existing && isLocalOnlyStatus(existing.status)) {
                continue;
              }
              actions.push({ tableId, action: { type: "CLEAR" } });
            }
          }

          if (actions.length > 0) {
            get().batchDispatch(actions);
          }
          set((state) => { state.isInitialized = true; });
        },

        // ------------------------------------------------------------------
        // _syncToFloorPlanStore — bridge write-back (Phase 1-2, removed in Phase 3)
        // ------------------------------------------------------------------

        _syncToFloorPlanStore: (changedTableId?: string | string[]) => {
          const { sessions } = get();
          const floorPlanState = useFloorPlanStore.getState();

          // Selective sync for one or more specific table IDs
          const changedIds = changedTableId
            ? Array.isArray(changedTableId)
              ? changedTableId
              : [changedTableId]
            : null;

          if (changedIds) {
            const changedSet = new Set(changedIds);
            let anyChanged = false;
            let newTablesById = floorPlanState.tablesById;

            for (const tableId of changedIds) {
              const existingTable = newTablesById[tableId];
              if (!existingTable) continue;

              const session = sessions[tableId];
              const needsUpdate = session
                ? existingTable.session !== session
                : !!existingTable.session;

              if (!needsUpdate) continue;

              anyChanged = true;
              const updated = session
                ? { ...existingTable, session }
                : { ...existingTable, session: undefined };
              newTablesById = { ...newTablesById, [tableId]: updated };
            }

            if (!anyChanged) return;

            const newTables = floorPlanState.tables.map((t) =>
              changedSet.has(t.id) &&
              newTablesById[t.id] !== floorPlanState.tablesById[t.id]
                ? newTablesById[t.id]
                : t,
            );
            useFloorPlanStore.setState({
              tables: newTables,
              tablesById: newTablesById,
            });
            return;
          }

          // Full rebuild fallback (used by batchDispatch with multiple tables)
          const { tables } = floorPlanState;

          const newTables = tables.map((t) => {
            const session = sessions[t.id];
            if (session) {
              return { ...t, session };
            }
            if (t.session && !session) {
              return { ...t, session: undefined };
            }
            return t;
          });

          useFloorPlanStore.setState({
            tables: newTables,
            tablesById: buildTablesById(newTables),
          });
        },

        // ------------------------------------------------------------------
        // _handleSessionChange — realtime broadcast handler
        // ------------------------------------------------------------------

        _handleSessionChange: (payload: TableSessionPayload) => {
          const { operation, data } = payload;

          if (operation === "DELETE" || !data?.session) {
            useFloorPlanStore.getState()._debouncedRefresh();
            return;
          }

          // If the session is no longer active, clear all tables associated with it
          if (data.session.is_active === false) {
            const sessionId = data.session.id;
            // O(1) lookup via sessionTableIndex instead of scanning all sessions
            const tableIds = get().sessionTableIndex[sessionId] || [];
            const actions: Array<{ tableId: string; action: SessionAction }> =
              [];
            for (const tId of tableIds) {
              actions.push({ tableId: tId, action: { type: "CLEAR" } });
            }
            if (actions.length > 0) get().batchDispatch(actions);
            return;
          }

          const sessionId = data.session.id;
          const tableIds = data.tables?.map((t) => t.table_id) || [];

          const actions: Array<{ tableId: string; action: SessionAction }> = [];

          // The broadcast payload (TableSessionData) doesn't include server_staff_id.
          // Preserve it from the existing session so the server badge doesn't flicker
          // until the next full loadFloorPlanStatus restores it from the DB.
          const existingSessionForBroadcast =
            tableIds.length > 0 ? get().sessions[tableIds[0]] : undefined;
          const preservedServerStaffId =
            existingSessionForBroadcast?.id === sessionId
              ? existingSessionForBroadcast.server_staff_id
              : undefined;

          const incomingSession: TableSession = {
            id: sessionId,
            status: data.session.status,
            party_size: data.session.party_size,
            guest_name: data.session.guest_name,
            seated_at: data.session.seated_at || new Date().toISOString(),
            current_course: data.session.current_course,
            needs_attention: data.session.needs_attention,
            is_vip: data.session.is_vip,
            order_id: data.session.order_id,
            reservation_id: (data.session as any).reservation_id ?? null,
            session_number: data.session.session_number,
            merged_tables: tableIds.length > 1 ? tableIds : undefined,
            server_staff_id: preservedServerStaffId,
          };

          // SYNC for tables in this session
          for (const tableId of tableIds) {
            actions.push({
              tableId,
              action: { type: "SYNC", session: incomingSession },
            });
          }

          // CLEAR for tables that were previously in this session but aren't anymore
          const currentSessions = get().sessions;
          for (const [tId, sess] of Object.entries(currentSessions)) {
            if (sess.id === sessionId && !tableIds.includes(tId)) {
              actions.push({ tableId: tId, action: { type: "CLEAR" } });
            }
          }

          if (actions.length > 0) {
            get().batchDispatch(actions);
          }
        },

        // ------------------------------------------------------------------
        // seatGuests
        // ------------------------------------------------------------------

        seatGuests: async (params) => {
          const isOnline = getIsOnline();
          const supabase = getClient();
          console.log("[TableSessionStore][seatGuests] Request received", {
            tableIds: params.tableIds,
            localOrderId: params.localOrderId ?? null,
            createOrderParam: params.createOrder,
            isOnline,
            hasSupabaseClient: !!supabase,
          });

          const normalizeTableIds = (ids: string[]) =>
            Array.from(new Set(ids)).sort((left, right) =>
              left.localeCompare(right),
            );

          const providedOrderId = params.localOrderId;
          let providedDbOrderId: string | undefined;
          if (providedOrderId) {
            const { useOrderStore } =
              require("@/stores/useOrderStore") as typeof import("@/stores/useOrderStore");
            providedDbOrderId =
              useOrderStore.getState().ordersById[providedOrderId]?.db_order_id;

            console.log(
              "[TableSessionStore][seatGuests] Resolved provided order",
              {
                providedOrderId,
                providedDbOrderId: providedDbOrderId ?? null,
              },
            );
          }

          // Create a session order only when explicitly requested AND there is no
          // existing backend order yet. A localOrderId alone should not block order creation.
          const shouldCreateOrder =
            params.createOrder !== false && !providedDbOrderId;

          console.log(
            "[TableSessionStore][seatGuests] Derived order creation mode",
            {
              providedOrderId: providedOrderId ?? null,
              providedDbOrderId: providedDbOrderId ?? null,
              createOrderParam: params.createOrder,
              shouldCreateOrder,
            },
          );

          const orderLinkIds = new Set<string>();
          if (providedOrderId) orderLinkIds.add(providedOrderId);
          if (providedDbOrderId) orderLinkIds.add(providedDbOrderId);

          if (orderLinkIds.size > 0) {
            const linkedEntries = Object.entries(get().sessions).filter(
              ([, session]) =>
                !!session &&
                session.status !== "available" &&
                !!session.order_id &&
                orderLinkIds.has(session.order_id),
            );

            if (linkedEntries.length > 1) {
              throw new Error(
                "Order is linked to multiple active sessions. Please clear extra sessions before reseating.",
              );
            }

            if (linkedEntries.length === 1) {
              const [existingTableId, existingSession] = linkedEntries[0];
              const existingTableIds = normalizeTableIds(
                existingSession.merged_tables?.length
                  ? existingSession.merged_tables
                  : [existingTableId],
              );
              const requestedTableIds = normalizeTableIds(params.tableIds);
              const sameTarget =
                existingTableIds.length === requestedTableIds.length &&
                existingTableIds.every(
                  (tableId, index) => tableId === requestedTableIds[index],
                );

              if (sameTarget) {
                console.log(
                  "[TableSessionStore][seatGuests] Reusing existing session on same table target",
                  {
                    sessionId: existingSession.id,
                    existingSessionOrderId: existingSession.order_id,
                    providedOrderId: providedOrderId ?? null,
                    shouldCreateOrder,
                  },
                );
                return {
                  sessionId: existingSession.id,
                  orderId: providedOrderId ?? existingSession.order_id,
                };
              }

              if (!isOnline || !supabase) {
                throw new Error(
                  "Cannot move an active table session while offline.",
                );
              }

              const { error } = await FloorPlanService.transferTableSession(
                supabase,
                {
                  p_session_id: existingSession.id,
                  p_new_table_ids: params.tableIds,
                },
              );

              if (error) {
                throw error;
              }

              await useFloorPlanStore.getState().loadFloorPlanStatus();

              console.log(
                "[TableSessionStore][seatGuests] Transferred existing session to new table(s)",
                {
                  sessionId: existingSession.id,
                  providedOrderId: providedOrderId ?? null,
                  providedDbOrderId: providedDbOrderId ?? null,
                  targetTableIds: params.tableIds,
                },
              );

              return {
                sessionId: existingSession.id,
                orderId: providedOrderId ?? existingSession.order_id,
              };
            }
          }

          // 1. Generate local IDs for optimistic update
          const localSessionId = `local_session_${Date.now()}_${Math.random()
            .toString(36)
            .substring(2, 9)}`;
          const localOrderId =
            params.localOrderId ||
            `local_order_${Date.now()}_${Math.random()
              .toString(36)
              .substring(2, 9)}`;

          // 2. Resolve staff/merchant/device/station context
          const storeSettings = useStoreSettingsStore.getState();
          const merchantId = storeSettings.selectedStore?.merchant_id ?? "";
          const staffId =
            useEmployeeStore.getState().loggedInEmployee?.profileId ?? null;
          const serverStaffId = params.serverId ?? staffId;
          const deviceId = params.device_id ?? null;
          const stationId =
            params.selected_station ??
            storeSettings.selectedStation?.id ??
            null;

          // 3. Optimistic update — batchDispatch SET for all tables
          const optimisticSession: TableSession = {
            id: localSessionId,
            session_number: localSessionId.slice(-6).toUpperCase(),
            status: "seating" as TableStatus,
            party_size: params.partySize,
            guest_name: params.guestName,
            seated_at: new Date().toISOString(),
            order_id:
              params.localOrderId ||
              (shouldCreateOrder ? localOrderId : undefined),
            reservation_id: params.reservationId ?? null,
            current_course: 1,
            needs_attention: false,
            is_vip: false,
            server_staff_id: serverStaffId ?? undefined,
            merged_tables:
              params.tableIds.length > 1 ? [...params.tableIds] : undefined,
          };

          get().batchDispatch(
            params.tableIds.map((tableId) => ({
              tableId,
              action: { type: "SET" as const, session: optimisticSession },
            })),
          );

          // Create optimistic order if caller didn't provide one (Path B & C)
          if (!params.localOrderId && shouldCreateOrder) {
            const { useOrderStore } = require("@/stores/useOrderStore");
            useOrderStore.getState().startNewOrder({
              tableId: params.tableIds[0],
              guestCount: params.partySize,
              localSessionId: localSessionId,
              orderId: localOrderId,
            });
            useOrderStore.getState().setActiveOrder(localOrderId);
          } else if (params.localOrderId) {
            // Caller supplied an existing local order (Path A — normal seat flow
            // from tables/index.tsx, or BillSection's "assign existing order to
            // table"). Force-pin guest_count to the modal's partySize so the
            // order matches the session and downstream consumers (service
            // charge eligibility, header banner, seat selector default) all
            // see the same number. Prior behavior left guest_count stale,
            // which broke SC eligibility when the original order was started
            // with party=1 / undefined.
            const { useOrderStore } = require("@/stores/useOrderStore");
            const existing =
              useOrderStore.getState().ordersById[params.localOrderId];
            if (existing && existing.guest_count !== params.partySize) {
              useOrderStore
                .getState()
                .patchOrder(params.localOrderId, {
                  guest_count: params.partySize,
                });
            }
          }

          // Clear selection on floor plan store
          useFloorPlanStore.getState().clearSelection();

          const hasActiveSessionConflict = (message?: string) => {
            const text = (message || "").toLowerCase();
            return (
              text.includes("active session") && text.includes("available")
            );
          };

          const tryResolveActiveSessionConflict = async () => {
            // Force a fresh pull so we can adopt the backend-authoritative session.
            await useFloorPlanStore.getState().loadFloorPlanStatus();
            const refreshed = get().sessions[params.tableIds[0]];
            if (refreshed && refreshed.status !== "available") {
              return {
                resolved: true,
                sessionId: refreshed.id,
                orderId:
                  params.createOrder !== false
                    ? (params.localOrderId ?? refreshed.order_id)
                    : undefined,
              };
            }
            return { resolved: false as const };
          };

          // 4. Try backend if online
          if (isOnline && supabase) {
            try {
              const result = await handleSeatingEffect(
                params.tableIds,
                {
                  partySize: params.partySize,
                  guestName: params.guestName,
                  guestPhone: params.guestPhone,
                  reservationId: params.reservationId,
                  waitlistId: params.waitlistId,
                  createOrder: shouldCreateOrder,
                  localOrderId: params.localOrderId ?? localOrderId,
                  optimisticSession,
                },
                {
                  supabase,
                  merchantId,
                  staffId,
                  serverStaffId,
                  deviceId,
                  stationId,
                  batchDispatch: get().batchDispatch,
                },
              );

              console.log(
                "[TableSessionStore][seatGuests] handleSeatingEffect result",
                {
                  success: result.success,
                  sessionId: result.sessionId,
                  orderId: result.orderId,
                  shouldCreateOrder,
                  localOrderId,
                  providedOrderId: params.localOrderId ?? null,
                },
              );

              if (result.success && result.sessionId) {
                return {
                  sessionId: result.sessionId,
                  orderId: result.orderId,
                };
              }

              if (hasActiveSessionConflict(result.error)) {
                try {
                  const recovered = await tryResolveActiveSessionConflict();
                  if (recovered.resolved) {
                    return {
                      sessionId: recovered.sessionId,
                      orderId: recovered.orderId,
                    };
                  }
                } catch (recoveryErr) {
                  console.warn(
                    "[seatGuests] Failed to recover active-session conflict from backend state:",
                    recoveryErr,
                  );
                }
              }

              // Backend error — resolve seating → seated so table is usable
              if (!result.success) {
                console.error(
                  "[seatGuests] Backend error, queuing for retry:",
                  result.error,
                );
                _resolveSeatingToSeated(localSessionId);
                await queueOperation({
                  type: "seat_guests",
                  params: {
                    tableIds: params.tableIds,
                    guestCount: params.partySize,
                    guestName: params.guestName,
                    guestPhone: params.guestPhone,
                    guestNotes: params.guestNotes,
                    reservationId: params.reservationId,
                    waitlistId: params.waitlistId,
                    createOrder: shouldCreateOrder,
                    localSessionId,
                    merchantId,
                    staffId,
                    serverStaffId,
                    deviceId,
                    stationId,
                  },
                  localOrderId: localOrderId,
                });
              }
            } catch (err) {
              const errorMessage =
                err instanceof Error ? err.message : String(err);
              if (hasActiveSessionConflict(errorMessage)) {
                try {
                  const recovered = await tryResolveActiveSessionConflict();
                  if (recovered.resolved) {
                    return {
                      sessionId: recovered.sessionId,
                      orderId: recovered.orderId,
                    };
                  }
                } catch (recoveryErr) {
                  console.warn(
                    "[seatGuests] Failed to recover exception active-session conflict from backend state:",
                    recoveryErr,
                  );
                }
              }

              console.error("[seatGuests] Exception, queuing for retry:", err);
              _resolveSeatingToSeated(localSessionId);
              await queueOperation({
                type: "seat_guests",
                params: {
                  tableIds: params.tableIds,
                  guestCount: params.partySize,
                  guestName: params.guestName,
                  guestPhone: params.guestPhone,
                  guestNotes: params.guestNotes,
                  reservationId: params.reservationId,
                  waitlistId: params.waitlistId,
                  createOrder: shouldCreateOrder,
                  localSessionId,
                  merchantId,
                  staffId,
                  serverStaffId,
                  deviceId,
                  stationId,
                },
                localOrderId: localOrderId,
              });
            }
          } else {
            // 5. Offline — resolve seating → seated, then queue
            console.log("[seatGuests] Offline, queuing operation");
            _resolveSeatingToSeated(localSessionId);
            await queueOperation({
              type: "seat_guests",
              params: {
                tableIds: params.tableIds,
                guestCount: params.partySize,
                guestName: params.guestName,
                guestPhone: params.guestPhone,
                guestNotes: params.guestNotes,
                reservationId: params.reservationId,
                waitlistId: params.waitlistId,
                createOrder: shouldCreateOrder,
                localSessionId,
                merchantId,
                staffId,
                serverStaffId,
                deviceId,
                stationId,
              },
              localOrderId: localOrderId,
            });
          }

          // Return local IDs so the UI can proceed
          return {
            sessionId: localSessionId,
            orderId:
              params.localOrderId ||
              (shouldCreateOrder ? localOrderId : undefined),
          };
        },

        // ------------------------------------------------------------------
        // updateSessionStatus
        // ------------------------------------------------------------------

        updateSessionStatus: async (
          sessionId: string,
          status: TableStatus,
          notes?: string,
        ) => {
          const isOnline = getIsOnline();
          const supabase = getClient();

          // 1. Optimistic local update — dispatch SET for all tables with this sessionId
          console.log(
            "[updateSessionStatus] sessionId & status",
            sessionId,
            status,
          );
          const currentSessions = get().sessions;
          const sessionIndex = get().sessionTableIndex;
          const tableIdsForSession = sessionIndex[sessionId];
          console.log("[updateSessionStatus] sessionTableIndex lookup:", {
            sessionId,
            tableIds: tableIdsForSession,
            allSessions: Object.keys(currentSessions),
            allIndexEntries: Object.keys(sessionIndex),
          });
          const actions: Array<{ tableId: string; action: SessionAction }> = [];

          for (const [tableId, session] of Object.entries(currentSessions)) {
            if (session.id === sessionId) {
              console.log(
                "[updateSessionStatus] Found matching session for tableId",
                tableId,
              );
              actions.push({
                tableId,
                action: { type: "SET", session: { ...session, status } },
              });
            }
          }

          console.log(
            "[updateSessionStatus] Dispatching",
            actions.length,
            "actions",
          );
          if (actions.length > 0) {
            get().batchDispatch(actions);
          }

          // Skip backend sync for local-only states
          if (isLocalOnlyStatus(status)) {
            return;
          }

          // 2. Try backend if online
          if (isOnline && supabase) {
            try {
              const p_staff_id =
                useEmployeeStore.getState().loggedInEmployee?.profileId;
              const { error } = await FloorPlanService.updateTableSessionStatus(
                supabase,
                {
                  p_session_id: sessionId,
                  p_status: status,
                  p_notes: notes,
                  p_staff_id,
                },
              );

              if (error) {
                console.error(
                  "[updateSessionStatus] Backend error, queuing:",
                  error,
                );
                await queueOperation({
                  type: "update_session_status",
                  params: { sessionId, status, notes },
                  localOrderId: sessionId,
                });
              }
            } catch (err) {
              console.error("[updateSessionStatus] Exception, queuing:", err);
              await queueOperation({
                type: "update_session_status",
                params: { sessionId, status, notes },
                localOrderId: sessionId,
              });
            }
          } else {
            // 3. Offline — queue for later
            console.log("[updateSessionStatus] Offline, queuing");
            await queueOperation({
              type: "update_session_status",
              params: { sessionId, status, notes },
              localOrderId: sessionId,
            });
          }
        },

        // ------------------------------------------------------------------
        // transferSession
        // ------------------------------------------------------------------

        transferSession: async (sessionId: string, newTableIds: string[]) => {
          if (!getIsOnline()) {
            useToastStore.getState().show({
              title: "Offline",
              message: "Table transfer requires connection",
              type: "warning",
            });
            return;
          }
          const supabase = getClient();
          const { error } = await FloorPlanService.transferTableSession(
            supabase,
            {
              p_session_id: sessionId,
              p_new_table_ids: newTableIds,
            },
          );

          if (error) throw error;

          // Refresh via floor plan store (which calls _patchSessionsFromTables)
          await useFloorPlanStore.getState().loadFloorPlanStatus();
        },

        // ------------------------------------------------------------------
        // mergeTable
        // ------------------------------------------------------------------

        mergeTable: async (sessionId: string, tableId: string) => {
          const isOnline = getIsOnline();
          const supabase = getClient();

          // Optimistic: copy primary session to merged table
          const currentSessions = get().sessions;
          const primaryTableId = Object.keys(currentSessions).find(
            (tid) => currentSessions[tid]?.id === sessionId,
          );
          const primarySession = primaryTableId
            ? currentSessions[primaryTableId]
            : undefined;

          if (primarySession) {
            const existingMerged = primarySession.merged_tables ?? [];
            const merged =
              existingMerged.length > 0
                ? [...existingMerged, tableId] // Primary already in list from prior merge
                : [primaryTableId!, tableId]; // First merge: include both tables
            const updatedSession = { ...primarySession, merged_tables: merged };
            const batch: Array<{ tableId: string; action: SessionAction }> = [];
            for (const tid of merged) {
              batch.push({
                tableId: tid,
                action: { type: "SET" as const, session: updatedSession },
              });
            }
            // Also update the primary table
            if (primaryTableId && !merged.includes(primaryTableId)) {
              batch.push({
                tableId: primaryTableId,
                action: { type: "SET" as const, session: updatedSession },
              });
            }
            get().batchDispatch(batch);
          }

          if (isOnline && supabase) {
            try {
              const { error } = await FloorPlanService.mergeTableToSession(
                supabase,
                {
                  p_session_id: sessionId,
                  p_table_id: tableId,
                },
              );
              if (error) {
                console.error("[mergeTable] Backend error, queuing:", error);
                await queueOperation({
                  type: "merge_table",
                  params: { sessionId, tableId },
                  localOrderId: sessionId,
                });
              } else {
                await useFloorPlanStore.getState().loadFloorPlanStatus();
              }
            } catch (err) {
              console.error("[mergeTable] Exception, queuing:", err);
              await queueOperation({
                type: "merge_table",
                params: { sessionId, tableId },
                localOrderId: sessionId,
              });
            }
          } else {
            console.log("[mergeTable] Offline, queuing");
            await queueOperation({
              type: "merge_table",
              params: { sessionId, tableId },
              localOrderId: sessionId,
            });
          }
        },

        // ------------------------------------------------------------------
        // unmergeTable
        // ------------------------------------------------------------------

        unmergeTable: async (sessionId: string, tableId: string) => {
          const isOnline = getIsOnline();
          const supabase = getClient();

          // Optimistic: clear session from unmerged table + update merged_tables on remaining
          get().dispatch(tableId, { type: "CLEAR" });

          // Update remaining tables' merged_tables list
          const currentSessions = get().sessions;
          const remaining = Object.keys(currentSessions).filter(
            (tid) => currentSessions[tid]?.id === sessionId && tid !== tableId,
          );
          if (remaining.length > 0) {
            const currentSession = currentSessions[remaining[0]];
            if (currentSession) {
              const updatedMerged = (currentSession.merged_tables ?? []).filter(
                (t) => t !== tableId,
              );
              const updatedSession = {
                ...currentSession,
                merged_tables:
                  updatedMerged.length > 1 ? updatedMerged : undefined,
              };
              const batch = remaining.map((tid) => ({
                tableId: tid,
                action: { type: "SET" as const, session: updatedSession },
              }));
              get().batchDispatch(batch);
            }
          }

          if (isOnline && supabase) {
            try {
              const { error } = await FloorPlanService.unmergeTableFromSession(
                supabase,
                {
                  p_session_id: sessionId,
                  p_table_id: tableId,
                },
              );
              if (error) {
                console.error("[unmergeTable] Backend error, queuing:", error);
                await queueOperation({
                  type: "unmerge_table",
                  params: { sessionId, tableId },
                  localOrderId: sessionId,
                });
              } else {
                await useFloorPlanStore.getState().loadFloorPlanStatus();
              }
            } catch (err) {
              console.error("[unmergeTable] Exception, queuing:", err);
              await queueOperation({
                type: "unmerge_table",
                params: { sessionId, tableId },
                localOrderId: sessionId,
              });
            }
          } else {
            console.log("[unmergeTable] Offline, queuing");
            await queueOperation({
              type: "unmerge_table",
              params: { sessionId, tableId },
              localOrderId: sessionId,
            });
          }
        },

        // ------------------------------------------------------------------
        // advanceCourse
        // ------------------------------------------------------------------

        advanceCourse: async (sessionId: string) => {
          if (!getIsOnline()) {
            useToastStore.getState().show({
              title: "Offline",
              message: "Advance course requires connection",
              type: "warning",
            });
            return;
          }
          const supabase = getClient();
          const p_staff_id =
            useEmployeeStore.getState().loggedInEmployee?.profileId;
          const { data, error } = await FloorPlanService.advanceCourse(
            supabase,
            sessionId,
            p_staff_id,
          );

          if (error) throw error;
          if (!data) throw new Error("No data returned from advanceCourse");

          // Update sessions — dispatch PATCH for all tables with this sessionId
          const currentSessions = get().sessions;
          const actions: Array<{ tableId: string; action: SessionAction }> = [];

          for (const [tableId, session] of Object.entries(currentSessions)) {
            if (session.id === sessionId) {
              actions.push({
                tableId,
                action: {
                  type: "PATCH",
                  updates: { current_course: data.current_course },
                },
              });
            }
          }

          if (actions.length > 0) {
            get().batchDispatch(actions);
          }
        },

        // ------------------------------------------------------------------
        // rekeyOrderId
        // ------------------------------------------------------------------

        rekeyOrderId: (oldOrderId: string, newOrderId: string) => {
          if (!oldOrderId || !newOrderId || oldOrderId === newOrderId) return;

          const changedTableIds: string[] = [];
          set((state) => {
            for (const [tableId, session] of Object.entries(state.sessions)) {
              if (session.order_id === oldOrderId) {
                state.sessions[tableId] = {
                  ...session,
                  order_id: newOrderId,
                };
                changedTableIds.push(tableId);
              }
            }
          });

          if (changedTableIds.length > 0) {
            _scheduleSyncToFloorPlan(changedTableIds);
          }
        },

        // ------------------------------------------------------------------
        // linkOrderToSession
        // ------------------------------------------------------------------

        linkOrderToSession: async (sessionId: string, orderId: string) => {
          if (!getIsOnline()) {
            useToastStore.getState().show({
              title: "Offline",
              message: "Link order requires connection",
              type: "warning",
            });
            return;
          }
          const supabase = getClient();
          const p_staff_id =
            useEmployeeStore.getState().loggedInEmployee?.profileId;
          const { error } = await supabase.rpc("link_order_to_session", {
            p_session_id: sessionId,
            p_order_id: orderId,
            p_staff_id,
          });
          if (error) throw error;
        },

        // ------------------------------------------------------------------
        // clearTableSession
        // ------------------------------------------------------------------

        clearTableSession: async (tableId: string) => {
          const isOnline = getIsOnline();
          const supabase = getClient();
          const session = get().sessions[tableId];
          const sessionId = session?.id;

          if (sessionId) {
            const reservationStore = (
              require("./useReservationStore") as typeof import("./useReservationStore")
            ).useReservationStore;
            reservationStore
              .getState()
              .completeReservationForSession(sessionId)
              .catch((err: unknown) => {
                console.error(
                  "[clearTableSession] Failed to complete reservation:",
                  err,
                );
              });
          }

          // 1. Optimistic local transition to cleaning
          const transitioned = get().dispatch(tableId, { type: "CLEAR_TABLE" });
          if (!transitioned) {
            console.warn(
              "[clearTableSession] Could not transition to cleaning state",
            );
            return;
          }

          // 2. Try backend if online and session exists
          if (isOnline && supabase && sessionId) {
            try {
              const p_staff_id =
                useEmployeeStore.getState().loggedInEmployee?.profileId;
              const { error } = await FloorPlanService.updateTableSessionStatus(
                supabase,
                {
                  p_session_id: sessionId,
                  p_status: "cleaning",
                  p_staff_id,
                },
              );

              if (error) {
                console.error(
                  "[clearTableSession] Backend error, queuing:",
                  error,
                );
                await queueOperation({
                  type: "update_session_status",
                  params: { sessionId, status: "cleaning" },
                  localOrderId: sessionId,
                });
              }
            } catch (err) {
              console.error("[clearTableSession] Exception, queuing:", err);
              await queueOperation({
                type: "update_session_status",
                params: { sessionId, status: "cleaning" },
                localOrderId: sessionId,
              });
            }
          } else if (sessionId) {
            // 3. Offline — queue for later
            console.log("[clearTableSession] Offline, queuing");
            await queueOperation({
              type: "update_session_status",
              params: { sessionId, status: "cleaning" },
              localOrderId: sessionId,
            });
          }
        },

        // ------------------------------------------------------------------
        // finishCleaning — mark table as available after cleaning
        // ------------------------------------------------------------------

        finishCleaning: async (tableId: string) => {
          const isOnline = getIsOnline();
          const supabase = getClient();
          const session = get().sessions[tableId];
          const sessionId = session?.id;

          // 1. Optimistic local transition: clear the session immediately.
          // FINISH_CLEANING → "available" means the table is free — remove it
          // from the store now rather than waiting for the realtime broadcast,
          // which can be slow or missed entirely, leaving the table stuck.
          const transitioned = get().dispatch(tableId, {
            type: "FINISH_CLEANING",
          });
          if (!transitioned) {
            console.warn(
              "[finishCleaning] Could not transition from cleaning to available",
            );
            return;
          }
          // Immediately clear the session from the store so DraggableTable
          // reverts to green without waiting for the realtime update.
          get().dispatch(tableId, { type: "CLEAR" });

          // 2. Try backend if online and session exists
          if (isOnline && supabase && sessionId) {
            try {
              const p_staff_id =
                useEmployeeStore.getState().loggedInEmployee?.profileId;
              const { error } = await FloorPlanService.updateTableSessionStatus(
                supabase,
                {
                  p_session_id: sessionId,
                  p_status: "available",
                  p_staff_id,
                },
              );

              if (error) {
                console.error(
                  "[finishCleaning] Backend error, queuing:",
                  error,
                );
                await queueOperation({
                  type: "update_session_status",
                  params: { sessionId, status: "available" },
                  localOrderId: sessionId,
                });
              }
            } catch (err) {
              console.error("[finishCleaning] Exception, queuing:", err);
              await queueOperation({
                type: "update_session_status",
                params: { sessionId, status: "available" },
                localOrderId: sessionId,
              });
            }
          } else if (sessionId) {
            // 3. Offline — queue for later
            console.log("[finishCleaning] Offline, queuing");
            await queueOperation({
              type: "update_session_status",
              params: { sessionId, status: "available" },
              localOrderId: sessionId,
            });
          }
        },

        // ------------------------------------------------------------------
        // Selectors
        // ------------------------------------------------------------------

        getSession: (tableId: string) => get().sessions[tableId],

        getSessionBySessionId: (sessionId: string) => {
          const { sessions } = get();
          for (const [tableId, session] of Object.entries(sessions)) {
            if (session.id === sessionId) {
              return { tableId, session };
            }
          }
          return undefined;
        },

        getTableStatus: (tableId: string) => {
          return get().sessions[tableId]?.status || "available";
        },
      })),
      {
        name: "table-session-storage",
        storage: createLazyPersistStorage(),
        version: 1,
        migrate: (persistedState) => persistedState as any,
        partialize: (state) => ({
          // Only persist sessions (not index — rebuilt on hydration)
          sessions: state.sessions,
        }),
        onRehydrateStorage: () => (state) => {
          if (state?.sessions) {
            // Rebuild sessionTableIndex from persisted sessions
            const index: Record<string, string[]> = {};
            for (const [tableId, session] of Object.entries(state.sessions)) {
              if (!session) continue;
              if (!index[session.id]) index[session.id] = [];
              if (!index[session.id].includes(tableId)) {
                index[session.id].push(tableId);
              }
            }
            state.sessionTableIndex = index;
          }
        },
      },
    ),
  ),
);

// ---------------------------------------------------------------------------
// After session store hydrates, immediately bridge sessions → floor plan store
// so table colors/status are correct before the first network refresh arrives.
// Handles the race where floor plan store hydrates first (sessions still empty).
// ---------------------------------------------------------------------------
useTableSessionStore.persist.onFinishHydration(() => {
  const sessions = useTableSessionStore.getState().sessions;
  if (Object.keys(sessions).length > 0) {
    useTableSessionStore.setState((s) => { s.isInitialized = true; });
  }
  if (Object.keys(sessions).length === 0) return;

  // Lazy-require to avoid circular deps at module init time
  try {
    const { useFloorPlanStore, buildTablesById } =
      require("@/stores/useFloorPlanStore") as typeof import("@/stores/useFloorPlanStore");
    const currentTables = useFloorPlanStore.getState().tables;
    if (currentTables.length === 0) return; // floor plan not loaded yet — bridge runs from its own onFinishHydration

    let changed = false;
    const patched = currentTables.map((table) => {
      const session = sessions[table.id];
      if (!session) return table;
      if (
        table.session?.id === session.id &&
        table.session?.status === session.status
      )
        return table;
      changed = true;
      return { ...table, session };
    });

    if (changed) {
      useFloorPlanStore.setState({
        tables: patched,
        tablesById: buildTablesById(patched),
      });
    }
  } catch {
    // Non-fatal — loadFloorPlanStatus will correct state on next sync
  }
});

// ---------------------------------------------------------------------------
// Helper: resolve seating → seated for error/offline paths
// ---------------------------------------------------------------------------

function _resolveSeatingToSeated(localSessionId: string) {
  const store = useTableSessionStore.getState();
  const actions: Array<{ tableId: string; action: SessionAction }> = [];

  // O(1) lookup via sessionTableIndex instead of scanning all sessions
  const tableIds = store.sessionTableIndex[localSessionId] || [];
  for (const tableId of tableIds) {
    const session = store.sessions[tableId];
    if (session && session.status === "seating") {
      actions.push({
        tableId,
        action: {
          type: "SET",
          session: { ...session, status: "seated" as TableStatus },
        },
      });
    }
  }

  if (actions.length > 0) {
    store.batchDispatch(actions);
  }
}

// ---------------------------------------------------------------------------
// Convenience hooks
// ---------------------------------------------------------------------------

/** Subscribe to a single table's session */
export function useTableSession_data(
  tableId: string,
): TableSession | undefined {
  return useTableSessionStore((s) => s.sessions[tableId]);
}

/** Get the status of a table (defaults to "available") */
export function useTableStatus(tableId: string): TableStatus {
  return useTableSessionStore(
    (s) => s.sessions[tableId]?.status || "available",
  );
}
