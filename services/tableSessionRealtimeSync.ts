/**
 * Real-time sync for table_sessions via polling
 * Periodically fetches floor_plan_objects with sessions and updates store without Supabase Realtime
 */

import { isLocalOnlyStatus } from "@/lib/tableStateMachine";
import { useTableSessionStore } from "@/stores/useTableSessionStore";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { FloorPlanService } from "@/services/floorPlanService";
import { SupabaseClient } from "@supabase/supabase-js";

let pollInterval: ReturnType<typeof setInterval> | null = null;
let lastSyncTimestamp = 0;
let supabaseClient: SupabaseClient | null = null;
const POLL_INTERVAL = 3000; // Poll every 3 seconds
const MIN_SYNC_INTERVAL = 1000; // Minimum 1 second between syncs

// Track voided sessions to prevent re-syncing the same session that was just cleared
// Maps tableId -> sessionId that was voided
const voidedSessions = new Map<string, string>();
const VOID_BLOCK_DURATION = 5000; // Block restore for 5 seconds

// Track when tables were last cleared locally to prevent polling from immediately restoring them
// Maps tableId -> timestamp when session was cleared
const lastClearedTables = new Map<string, number>();
const CLEAR_BLOCK_DURATION = 5000; // Block restore for 5 seconds after local clear

/**
 * Register Supabase client for use in polling
 */
export function setTableSessionSyncSupabaseClient(client: SupabaseClient | null) {
  supabaseClient = client;
}

/**
 * Start polling for table_sessions changes
 */
export function startTableSessionRealtimeSync(locationId: string) {
  if (pollInterval) return; // Already running

  const poll = async () => {
    try {
      const now = Date.now();
      if (now - lastSyncTimestamp < MIN_SYNC_INTERVAL) {
        return; // Skip if too soon
      }

      if (!supabaseClient) {
        console.warn("[TableSessionRealtimeSync] Supabase client not initialized yet");
        return;
      }

      // Get the active floor plan ID
      const activeFloorPlanId = useFloorPlanStore.getState().activeFloorPlanId;
      if (!activeFloorPlanId) return;

      // Fetch all objects with session data for the active floor plan
      const { data: objects, error } = await FloorPlanService.getAllFloorPlanObjects(
        supabaseClient,
        activeFloorPlanId
      );

      if (error) {
        console.error("[TableSessionRealtimeSync] Fetch error:", error);
        return;
      }

      if (!objects || objects.length === 0) return;

      lastSyncTimestamp = now;

      // Update each table's session in both stores
      const sessionStore = useTableSessionStore.getState();

      const dispatchActions: Array<{ tableId: string; action: any }> = [];

      objects.forEach((object) => {
        const currentSession = sessionStore.sessions[object.id];

        // If local session is cleared, ALWAYS keep it cleared to respect user actions
        // (void, checkout, etc). Only restore if it's a different session (new guest).
        if (!currentSession && object.session) {
          const voidedSessionId = voidedSessions.get(object.id);

          // ALWAYS skip if same voided session
          if (voidedSessionId === object.session.id) {
            console.log(`[TableSessionRealtimeSync] SKIP restore for table ${object.name || object.id}: same voided session`);
            return;
          }

          // NEW: Also skip if the table was JUST cleared (within last 5 seconds)
          // This prevents polling from immediately restoring a cleared session before
          // the backend RPC has time to update is_active=false
          const lastClearedTime = lastClearedTables.get(object.id);
          if (lastClearedTime && now - lastClearedTime < 5000) {
            console.log(`[TableSessionRealtimeSync] SKIP restore for table ${object.name || object.id}: recently cleared locally (${now - lastClearedTime}ms ago)`);
            return;
          }

          // Different session ID + not recently cleared = new guest, allow it to be synced
          console.log(`[TableSessionRealtimeSync] NEW guest for table ${object.name || object.id}: different session`);
        }

        if (!object.session) {
          // Session was closed on backend — clear local session if one exists
          if (currentSession && !isLocalOnlyStatus(currentSession.status)) {
            console.log(`[TableSessionRealtimeSync] CLEAR stale session for table ${object.name || object.id}: local status="${currentSession.status}", no backend session`);
            dispatchActions.push({
              tableId: object.id,
              action: { type: "CLEAR" as const },
            });
          }
          return;
        }

        // Only update if session actually changed (for existing sessions)
        if (currentSession) {
          const sessionChanged =
            currentSession.id !== object.session.id ||
            currentSession.status !== object.session.status ||
            currentSession.party_size !== object.session.party_size ||
            currentSession.guest_name !== object.session.guest_name ||
            currentSession.order_id !== object.session.order_id ||
            currentSession.server_staff_id !== object.session.server_staff_id ||
            currentSession.current_course !== object.session.current_course ||
            currentSession.needs_attention !== object.session.needs_attention ||
            currentSession.is_vip !== object.session.is_vip;

          if (sessionChanged) {
            console.log(`[TableSessionRealtimeSync] UPDATE table ${object.name || object.id}: "${currentSession.status}" → "${object.session.status}"`);
            dispatchActions.push({
              tableId: object.id,
              action: { type: "SYNC" as const, session: object.session },
            });
          }
        }
      });

      // batchDispatch handles both session store + floor plan store sync via _syncToFloorPlanStore
      if (dispatchActions.length > 0) {
        sessionStore.batchDispatch(dispatchActions);
      }
    } catch (err) {
      console.error("[TableSessionRealtimeSync] Poll error:", err);
    }
  };

  // Start polling
  pollInterval = setInterval(poll, POLL_INTERVAL);

  // Initial poll
  poll();

  console.log("[TableSessionRealtimeSync] Started with interval:", POLL_INTERVAL);
}

/**
 * Record a voided session so polling won't restore it
 */
export function recordVoidedSession(tableId: string, sessionId: string) {
  voidedSessions.set(tableId, sessionId);
  // Auto-cleanup after void block duration
  setTimeout(() => {
    voidedSessions.delete(tableId);
  }, VOID_BLOCK_DURATION);
}

/**
 * Record a table as recently cleared so polling won't immediately restore it
 * Called when a session is cleared locally (void, checkout, etc)
 */
export function recordTableCleared(tableId: string) {
  lastClearedTables.set(tableId, Date.now());
  // Auto-cleanup after clear block duration
  setTimeout(() => {
    lastClearedTables.delete(tableId);
  }, CLEAR_BLOCK_DURATION);
}

/**
 * Stop polling for table_sessions changes
 */
export function stopTableSessionRealtimeSync() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
    lastSyncTimestamp = 0;
    console.log("[TableSessionRealtimeSync] Stopped");
  }
}

/**
 * Restart the sync (useful when location changes)
 */
export function restartTableSessionRealtimeSync() {
  stopTableSessionRealtimeSync();

  const locationId = useStoreSettingsStore.getState().selectedStore?.id;
  if (locationId) {
    startTableSessionRealtimeSync(locationId);
  }
}
