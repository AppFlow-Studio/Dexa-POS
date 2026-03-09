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

        // Only update if session changed
        if (
          !currentSession ||
          JSON.stringify(currentSession) !== JSON.stringify(object.session)
        ) {
          if (currentSession) {
            console.log(`[TableSessionRealtimeSync] UPDATE table ${object.name || object.id}: "${currentSession.status}" → "${object.session.status}" (session ${object.session.id})`);
          } else {
            console.log(`[TableSessionRealtimeSync] NEW session for table ${object.name || object.id}: status="${object.session.status}" (session ${object.session.id})`);
          }
          dispatchActions.push({
            tableId: object.id,
            action: { type: "SYNC" as const, session: object.session },
          });
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
