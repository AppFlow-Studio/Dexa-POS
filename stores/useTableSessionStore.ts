/**
 * useTableSessionStore - Manages all table session state and operations.
 *
 * Extracted from useFloorPlanStore to separate ephemeral session state
 * from persistent layout/geometry. Sessions are NOT persisted to MMKV —
 * they are re-fetched from the backend on app restart.
 *
 * During the bridge period (Phase 1-2), _syncToFloorPlanStore() writes
 * session data back into useFloorPlanStore so unmigrated consumers still
 * work via table.session.
 *
 * Architecture: dispatch()-based mutations with Immer middleware.
 * All session mutations flow through _applyAction (pure) → dispatch/batchDispatch.
 * Side effects (bridge, backend sync) are decoupled via registry.
 */

import {
  ACTION_TO_EVENT,
  type SessionAction as DispatchableAction,
} from "@/lib/sessionActions";
import { _fireEffects, type SideEffectContext } from "@/lib/sessionSideEffects";
import {
  canTransition as canTransitionFn,
  isLocalOnlyStatus,
  TableEvent,
  transitionTableStatus,
} from "@/lib/tableStateMachine";
import { FloorPlanService } from "@/services/floorPlanService";
import { getIsOnline, queueOperation } from "@/services/offlineSyncService";
import { handleSeatingEffect } from "@/services/sessionEffects/handleSeatingEffect";
import {
  FloorPlanObject,
  TableSession,
  TableStatus,
} from "@/types/db-floor-plan-types";
import type { TableSessionPayload } from "@/types/real-time";
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
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

// ---------------------------------------------------------------------------
// SessionAction type
// ---------------------------------------------------------------------------

export type SessionAction =
  | { type: TableEvent }                                  // state machine validated
  | { type: 'SET'; session: TableSession }                // optimistic/local, always applied
  | { type: 'SYNC'; session: TableSession }               // from backend/realtime, always applied (authoritative)
  | { type: 'CLEAR' }                                     // remove session
  | { type: 'PATCH'; updates: Partial<TableSession> }     // update fields only
  | { type: 'SESSION_CREATED'; session: TableSession }    // replace optimistic with real backend data
  | { type: 'SEAT_FAILED' };                              // resolve seating → seated on error

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

export function registerSessionSideEffect(handler: SessionSideEffect): () => void {
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
        console.error('[SessionSideEffect] Error:', err);
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
  if (action.type === 'SET') {
    return { session: action.session, changed: true };
  }
  if (action.type === 'SYNC') {
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
      const serverChanged = current.server_staff_id !== action.session.server_staff_id;
      const courseChanged = current.current_course !== action.session.current_course;
      const attentionChanged = current.needs_attention !== action.session.needs_attention;
      const vipChanged = current.is_vip !== action.session.is_vip;
      const sessionNumChanged = current.session_number !== action.session.session_number;

      const currMerged = current.merged_tables || [];
      const newMerged = action.session.merged_tables || [];
      const mergedEqual = currMerged.length === newMerged.length &&
        currMerged.every((id, idx) => id === newMerged[idx]);
      const mergedChanged = !mergedEqual;

      if (!statusChanged && !partyChanged && !guestChanged && !orderChanged &&
          !serverChanged && !courseChanged && !attentionChanged && !vipChanged &&
          !sessionNumChanged && !mergedChanged) {
        return { session: current, changed: false };
      }
    }
    return { session: action.session, changed: true };
  }
  if (action.type === 'CLEAR') {
    return { session: undefined, changed: current !== undefined };
  }
  if (action.type === 'PATCH') {
    if (!current) return { session: undefined, changed: false };
    return { session: { ...current, ...action.updates }, changed: true };
  }
  if (action.type === 'SESSION_CREATED') {
    return { session: { ...action.session, status: "seated" as TableStatus }, changed: true };
  }
  if (action.type === 'SEAT_FAILED') {
    if (current && current.status === "seating") {
      return { session: { ...current, status: "seated" as TableStatus }, changed: true };
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
  // ---- Dispatch API ----

  dispatch: (tableId: string, action: SessionAction) => boolean;
  batchDispatch: (actions: Array<{ tableId: string; action: SessionAction }>) => number;

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
  }) => Promise<{ sessionId: string; orderId?: string }>;

  updateSessionStatus: (
    sessionId: string,
    status: TableStatus,
    notes?: string,
  ) => Promise<void>;

  transferSession: (
    sessionId: string,
    newTableIds: string[],
  ) => Promise<void>;

  mergeTable: (sessionId: string, tableId: string) => Promise<void>;
  unmergeTable: (sessionId: string, tableId: string) => Promise<void>;
  advanceCourse: (sessionId: string) => Promise<void>;
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
  getSessionBySessionId: (sessionId: string) => { tableId: string; session: TableSession } | undefined;
  getTableStatus: (tableId: string) => TableStatus;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useTableSessionStore = create<TableSessionStoreState>()(
  subscribeWithSelector(
    immer((set, get) => ({
      sessions: {},
      sessionTableIndex: {},

      // ------------------------------------------------------------------
      // dispatch — single table action
      // ------------------------------------------------------------------

      dispatch: (tableId: string, action: SessionAction): boolean => {
        const prev = get().sessions[tableId];
        const result = _applyAction(prev, action);
        if (!result.changed) return false;

        set(state => {
          if (result.session) {
            state.sessions[tableId] = result.session;
          } else {
            delete state.sessions[tableId];
          }
          _updateIndex(state.sessionTableIndex, tableId, prev, result.session);
        });

        get()._syncToFloorPlanStore(tableId);
        fireSideEffects(tableId, prev, result.session, action);
        return true;
      },

      // ------------------------------------------------------------------
      // batchDispatch — multiple table actions in one React render
      // ------------------------------------------------------------------

      batchDispatch: (actions: Array<{ tableId: string; action: SessionAction }>): number => {
        const currentSessions = get().sessions;
        const allResults = actions
          .map(({ tableId, action }) => ({
            tableId,
            action,
            prev: currentSessions[tableId],
            result: _applyAction(currentSessions[tableId], action),
          }));

        const results = allResults.filter(r => r.result.changed);

        if (allResults.length > 0) {
          console.log('[useTableSessionStore] batchDispatch:', {
            actionCount: allResults.length,
            changedCount: results.length,
            actions: allResults.map(r => ({
              tableId: r.tableId,
              actionType: r.action.type,
              prevStatus: r.prev?.status,
              newStatus: r.result.session?.status,
              changed: r.result.changed
            }))
          });
        }

        if (results.length === 0) return 0;

        set(state => {
          for (const { tableId, prev, result } of results) {
            if (result.session) {
              state.sessions[tableId] = result.session;
            } else {
              delete state.sessions[tableId];
            }
            _updateIndex(state.sessionTableIndex, tableId, prev, result.session);
          }
        });

        // Selective sync — only patch changed tables instead of full rebuild
        const changedTableIds = results.map(r => r.tableId);
        get()._syncToFloorPlanStore(changedTableIds);
        for (const { tableId, action, prev, result } of results) {
          fireSideEffects(tableId, prev, result.session, action);
        }
        return results.length;
      },

      // ------------------------------------------------------------------
      // dispatchAction — high-level dispatch for SessionAction (lib/sessionActions.ts)
      // ------------------------------------------------------------------

      dispatchAction: async (action: DispatchableAction): Promise<DispatchResult> => {
        const { tableId } = action;
        const session = get().sessions[tableId];
        const previousStatus = session?.status;

        // 1. Determine if this action maps to a state machine event
        const event = ACTION_TO_EVENT[action.type];
        let nextStatus: TableStatus | null = null;

        if (event) {
          // Validate transition
          if (!session) {
            return { success: false, error: `No active session for table ${tableId}` };
          }
          if (!canTransitionFn(session.status, event)) {
            return {
              success: false,
              error: `Invalid transition: "${session.status}" + ${event}`,
            };
          }

          // Apply optimistic state machine transition via internal dispatch
          const changed = get().dispatch(tableId, { type: event });
          if (!changed) {
            return { success: false, error: "State machine transition produced no change" };
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
                  const { error } = await FloorPlanService.updateTableSessionStatus(
                    supabase,
                    { p_session_id: sessionId, p_status: syncStatus, p_staff_id },
                  );
                  if (error) {
                    console.error("[dispatchAction] Backend sync error, queuing:", error);
                    await queueOperation({
                      type: "update_session_status",
                      params: { sessionId, status: syncStatus },
                      localOrderId: sessionId,
                    });
                  }
                } catch (err) {
                  console.error("[dispatchAction] Backend sync exception, queuing:", err);
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

        // 2. Fire side effects asynchronously
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
          };

          actions.push({
            tableId: row.table_id,
            action: { type: 'SYNC', session },
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
            actions.push({ tableId, action: { type: 'CLEAR' } });
          }
        }

        if (actions.length > 0) {
          get().batchDispatch(actions);
        }

        console.log(
          `[hydrateFromBackend] Synced ${incomingTableIds.size} sessions, cleared ${
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
            action: { type: 'SYNC', session: table.session },
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
            actions.push({ tableId, action: { type: 'CLEAR' } });
          }
        }

        if (actions.length > 0) {
          get().batchDispatch(actions);
        }
      },

      // ------------------------------------------------------------------
      // _syncToFloorPlanStore — bridge write-back (Phase 1-2, removed in Phase 3)
      // ------------------------------------------------------------------

      _syncToFloorPlanStore: (changedTableId?: string | string[]) => {
        const { sessions } = get();
        const floorPlanState = useFloorPlanStore.getState();

        // Selective sync for one or more specific table IDs
        const changedIds = changedTableId
          ? (Array.isArray(changedTableId) ? changedTableId : [changedTableId])
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

          const newTables = floorPlanState.tables.map(
            (t) => (changedSet.has(t.id) && newTablesById[t.id] !== floorPlanState.tablesById[t.id]
              ? newTablesById[t.id]
              : t),
          );
          useFloorPlanStore.setState({ tables: newTables, tablesById: newTablesById });
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

        console.log('[useTableSessionStore] _handleSessionChange:', {
          operation,
          sessionId: data?.session?.id,
          status: data?.session?.status,
          tableCount: data?.tables?.length ?? 0,
          tables: data?.tables?.map(t => ({ id: t.table_id, label: t.table_label }))
        });

        if (operation === "DELETE" || !data?.session) {
          useFloorPlanStore.getState()._debouncedRefresh();
          return;
        }

        // If the session is no longer active, clear all tables associated with it
        if (data.session.is_active === false) {
          const sessionId = data.session.id;
          // O(1) lookup via sessionTableIndex instead of scanning all sessions
          const tableIds = get().sessionTableIndex[sessionId] || [];
          const actions: Array<{ tableId: string; action: SessionAction }> = [];
          for (const tId of tableIds) {
            actions.push({ tableId: tId, action: { type: 'CLEAR' } });
          }
          if (actions.length > 0) get().batchDispatch(actions);
          return;
        }

        const sessionId = data.session.id;
        const tableIds = data.tables?.map((t) => t.table_id) || [];

        const actions: Array<{ tableId: string; action: SessionAction }> = [];

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
          session_number: data.session.session_number,
          merged_tables: tableIds.length > 1 ? tableIds : undefined,
        };

        // SYNC for tables in this session
        console.log('[useTableSessionStore] Creating SYNC actions for tables:', {
          sessionId,
          tableIds,
          status: incomingSession.status,
          actionCount: tableIds.length
        });

        for (const tableId of tableIds) {
          actions.push({
            tableId,
            action: { type: 'SYNC', session: incomingSession },
          });
        }

        // CLEAR for tables that were previously in this session but aren't anymore
        const currentSessions = get().sessions;
        for (const [tId, sess] of Object.entries(currentSessions)) {
          if (sess.id === sessionId && !tableIds.includes(tId)) {
            actions.push({ tableId: tId, action: { type: 'CLEAR' } });
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
        const staffId = useEmployeeStore.getState().loggedInEmployee?.profileId ?? null;
        const serverStaffId = params.serverId ?? staffId;
        const deviceId = params.device_id ?? null;
        const stationId = params.selected_station ?? storeSettings.selectedStation?.id ?? null;

        // 3. Optimistic update — batchDispatch SET for all tables
        const optimisticSession: TableSession = {
          id: localSessionId,
          session_number: localSessionId.slice(-6).toUpperCase(),
          status: "seating" as TableStatus,
          party_size: params.partySize,
          guest_name: params.guestName,
          seated_at: new Date().toISOString(),
          order_id: params.createOrder !== false ? localOrderId : undefined,
          current_course: 1,
          needs_attention: false,
          is_vip: false,
        };

        get().batchDispatch(
          params.tableIds.map(tableId => ({
            tableId,
            action: { type: 'SET' as const, session: optimisticSession },
          })),
        );

        // Clear selection on floor plan store
        useFloorPlanStore.getState().clearSelection();

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
                createOrder: params.createOrder ?? true,
                localOrderId: params.localOrderId,
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

            if (result.success && result.sessionId) {
              return {
                sessionId: result.sessionId,
                orderId: result.orderId,
              };
            }

            // Backend error — resolve seating → seated so table is usable
            if (!result.success) {
              console.error("[seatGuests] Backend error, queuing for retry:", result.error);
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
                  createOrder: params.createOrder,
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
                createOrder: params.createOrder,
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
              createOrder: params.createOrder,
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
          orderId: params.createOrder !== false ? localOrderId : undefined,
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
        const actions: Array<{ tableId: string; action: SessionAction }> = [];

        for (const [tableId, session] of Object.entries(currentSessions)) {
          if (session.id === sessionId) {
            console.log(
              "[updateSessionStatus] Found matching session for tableId",
              tableId,
            );
            actions.push({
              tableId,
              action: { type: 'SET', session: { ...session, status } },
            });
          }
        }

        console.log(
          "[updateSessionStatus] Dispatching",
          actions.length,
          "actions"
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
        const supabase = getClient();
        const { error } = await FloorPlanService.transferTableSession(supabase, {
          p_session_id: sessionId,
          p_new_table_ids: newTableIds,
        });

        if (error) throw error;

        // Refresh via floor plan store (which calls _patchSessionsFromTables)
        await useFloorPlanStore.getState().loadFloorPlanStatus();
      },

      // ------------------------------------------------------------------
      // mergeTable
      // ------------------------------------------------------------------

      mergeTable: async (sessionId: string, tableId: string) => {
        const supabase = getClient();
        const { error } = await FloorPlanService.mergeTableToSession(supabase, {
          p_session_id: sessionId,
          p_table_id: tableId,
        });

        if (error) throw error;

        await useFloorPlanStore.getState().loadFloorPlanStatus();
      },

      // ------------------------------------------------------------------
      // unmergeTable
      // ------------------------------------------------------------------

      unmergeTable: async (sessionId: string, tableId: string) => {
        const supabase = getClient();
        const { error } = await FloorPlanService.unmergeTableFromSession(
          supabase,
          {
            p_session_id: sessionId,
            p_table_id: tableId,
          },
        );

        console.log("[unmergeTable] error", error);
        if (error) throw error;

        await useFloorPlanStore.getState().loadFloorPlanStatus();
      },

      // ------------------------------------------------------------------
      // advanceCourse
      // ------------------------------------------------------------------

      advanceCourse: async (sessionId: string) => {
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
              action: { type: 'PATCH', updates: { current_course: data.current_course } },
            });
          }
        }

        if (actions.length > 0) {
          get().batchDispatch(actions);
        }
      },

      // ------------------------------------------------------------------
      // linkOrderToSession
      // ------------------------------------------------------------------

      linkOrderToSession: async (sessionId: string, orderId: string) => {
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

        // Capture for rollback
        const originalSession = session;

        // 1. Optimistic local transition to cleaning
        const transitioned = get().dispatch(tableId, { type: 'CLEAR_TABLE' });
        if (!transitioned) {
          // If local transition failed, the session may not be in a clearable state
          console.warn("[clearTableSession] Could not transition to cleaning state");
          return;
        }

        // 2. Try backend if online and session exists
        if (isOnline && supabase && sessionId) {
          try {
            const p_staff_id =
              useEmployeeStore.getState().loggedInEmployee?.profileId;
            // Update to "cleaning" status, not directly to "available"
            const { error } = await FloorPlanService.updateTableSessionStatus(
              supabase,
              {
                p_session_id: sessionId,
                p_status: "cleaning",
                p_staff_id,
              },
            );

            if (error) {
              console.error("[clearTableSession] Backend error:", error);
              // ROLLBACK
              if (originalSession) {
                get().dispatch(tableId, { type: 'SET', session: originalSession });
              }
              throw new Error(
                `Failed to clear session: ${error.message || error}`,
              );
            }

            console.log("[clearTableSession] Table marked for cleaning:", {
              tableId,
              sessionId,
            });
          } catch (err) {
            console.error("[clearTableSession] Exception:", err);
            // ROLLBACK (only if not already rolled back above)
            if (originalSession && !get().sessions[tableId]) {
              get().dispatch(tableId, { type: 'SET', session: originalSession });
            }
            throw err;
          }
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

        // Capture for rollback
        const originalSession = session;

        // 1. Optimistic local transition to available
        const transitioned = get().dispatch(tableId, { type: 'FINISH_CLEANING' });
        if (!transitioned) {
          // If local transition failed, the session may not be in cleaning state
          console.warn("[finishCleaning] Could not transition from cleaning to available");
          return;
        }

        // 2. Try backend if online and session exists
        if (isOnline && supabase && sessionId) {
          try {
            const p_staff_id =
              useEmployeeStore.getState().loggedInEmployee?.profileId;
            // Update to "available" status
            const { error } = await FloorPlanService.updateTableSessionStatus(
              supabase,
              {
                p_session_id: sessionId,
                p_status: "available",
                p_staff_id,
              },
            );

            if (error) {
              console.error("[finishCleaning] Backend error:", error);
              // ROLLBACK
              if (originalSession) {
                get().dispatch(tableId, { type: 'SET', session: originalSession });
              }
              throw new Error(
                `Failed to finish cleaning: ${error.message || error}`,
              );
            }

            console.log("[finishCleaning] Table marked as available:", {
              tableId,
              sessionId,
            });
          } catch (err) {
            console.error("[finishCleaning] Exception:", err);
            // ROLLBACK (only if not already rolled back above)
            if (originalSession && !get().sessions[tableId]) {
              get().dispatch(tableId, { type: 'SET', session: originalSession });
            }
            throw err;
          }
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
  ),
);

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
          type: 'SET',
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
export function useTableSession_data(tableId: string): TableSession | undefined {
  return useTableSessionStore((s) => s.sessions[tableId]);
}

/** Get the status of a table (defaults to "available") */
export function useTableStatus(tableId: string): TableStatus {
  return useTableSessionStore((s) => s.sessions[tableId]?.status || "available");
}
