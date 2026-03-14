/**
 * Real-time sync for table_sessions via polling
 * Uses lightweight getLocationTableStatus RPC (1 query) instead of getAllFloorPlanObjects (3 queries)
 * Adaptive polling: 5s base, extends to 10-15s when idle, resets on changes
 */

import { isLocalOnlyStatus } from "@/lib/tableStateMachine";
import { useTableSessionStore } from "@/stores/useTableSessionStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { FloorPlanService } from "@/services/floorPlanService";
import type { LocationTableStatusRow } from "@/types/db-floor-plan-types";
import { SupabaseClient } from "@supabase/supabase-js";

let pollTimeout: ReturnType<typeof setTimeout> | null = null;
let lastSyncTimestamp = 0;
let supabaseClient: SupabaseClient | null = null;
let activeLocationId: string | null = null;

// Adaptive polling
let consecutiveNoChangePolls = 0;
const BASE_INTERVAL = 5000;
const IDLE_THRESHOLD = 3;
const MAX_INTERVAL = 15000;
const MIN_SYNC_INTERVAL = 1000;

function getNextInterval(): number {
  if (consecutiveNoChangePolls < IDLE_THRESHOLD) return BASE_INTERVAL;
  return Math.min(
    BASE_INTERVAL + (consecutiveNoChangePolls - IDLE_THRESHOLD + 1) * 2500,
    MAX_INTERVAL
  );
}

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

function scheduleNextPoll() {
  if (pollTimeout === null && activeLocationId === null) return; // stopped
  const interval = getNextInterval();
  pollTimeout = setTimeout(poll, interval);
}

async function poll() {
  try {
    const now = Date.now();
    if (now - lastSyncTimestamp < MIN_SYNC_INTERVAL) {
      scheduleNextPoll();
      return;
    }

    if (!supabaseClient) {
      console.warn("[TableSessionRealtimeSync] Supabase client not initialized yet");
      scheduleNextPoll();
      return;
    }

    if (!activeLocationId) {
      scheduleNextPoll();
      return;
    }

    // Fetch session data only — 1 RPC instead of 3 queries
    const { data: rows, error } = await FloorPlanService.getLocationTableStatus(
      supabaseClient,
      activeLocationId
    );

    if (error) {
      console.error("[TableSessionRealtimeSync] Fetch error:", error);
      scheduleNextPoll();
      return;
    }

    if (!rows) {
      scheduleNextPoll();
      return;
    }

    lastSyncTimestamp = now;

    // Pre-group table IDs by session for merged_tables
    const tableIdsBySession: Record<string, string[]> = {};
    for (const row of rows) {
      if (row.session_id) {
        (tableIdsBySession[row.session_id] ??= []).push(row.table_id);
      }
    }

    // Build a set of table IDs in the response for detecting removed sessions
    const responseTableIds = new Set<string>();

    const sessionStore = useTableSessionStore.getState();
    const dispatchActions: Array<{ tableId: string; action: any }> = [];

    for (const row of rows) {
      responseTableIds.add(row.table_id);
      const currentSession = sessionStore.sessions[row.table_id];

      if (!currentSession && row.session_id) {
        // No local session but backend has one — check void/clear blocks
        const voidedSessionId = voidedSessions.get(row.table_id);
        if (voidedSessionId === row.session_id) {
          if (__DEV__) console.log(`[TableSessionRealtimeSync] SKIP restore for table ${row.table_name || row.table_id}: same voided session`);
          continue;
        }

        const lastClearedTime = lastClearedTables.get(row.table_id);
        if (lastClearedTime && now - lastClearedTime < CLEAR_BLOCK_DURATION) {
          if (__DEV__) console.log(`[TableSessionRealtimeSync] SKIP restore for table ${row.table_name || row.table_id}: recently cleared locally (${now - lastClearedTime}ms ago)`);
          continue;
        }

        // New guest — sync it
        if (__DEV__) console.log(`[TableSessionRealtimeSync] NEW guest for table ${row.table_name || row.table_id}: different session`);
      }

      if (!row.session_id || !row.session_status) {
        // No session on backend — clear local session if one exists
        if (currentSession && !isLocalOnlyStatus(currentSession.status)) {
          if (__DEV__) console.log(`[TableSessionRealtimeSync] CLEAR stale session for table ${row.table_name || row.table_id}: local status="${currentSession.status}", no backend session`);
          dispatchActions.push({
            tableId: row.table_id,
            action: { type: "CLEAR" as const },
          });
        }
        continue;
      }

      // Build session object from row
      const mergedTables = tableIdsBySession[row.session_id];
      const incomingSession = {
        id: row.session_id,
        session_number: row.session_number,
        status: row.session_status,
        party_size: row.party_size ?? 0,
        guest_name: row.guest_name,
        order_id: row.order_id,
        server_staff_id: row.server_staff_id ?? undefined,
        seated_at: row.seated_at ?? new Date().toISOString(),
        current_course: row.current_course ?? 1,
        needs_attention: row.needs_attention ?? false,
        is_vip: row.is_vip ?? false,
        merged_tables: (mergedTables?.length ?? 0) > 1 ? mergedTables : undefined,
      };

      // Only update if session actually changed (for existing sessions)
      if (currentSession) {
        const sessionChanged =
          currentSession.id !== incomingSession.id ||
          currentSession.status !== incomingSession.status ||
          currentSession.party_size !== incomingSession.party_size ||
          currentSession.guest_name !== incomingSession.guest_name ||
          currentSession.order_id !== incomingSession.order_id ||
          currentSession.server_staff_id !== incomingSession.server_staff_id ||
          currentSession.current_course !== incomingSession.current_course ||
          currentSession.needs_attention !== incomingSession.needs_attention ||
          currentSession.is_vip !== incomingSession.is_vip ||
          currentSession.session_number !== incomingSession.session_number ||
          (currentSession.merged_tables?.length ?? 0) !== (incomingSession.merged_tables?.length ?? 0);

        if (sessionChanged) {
          if (__DEV__) console.log(`[TableSessionRealtimeSync] UPDATE table ${row.table_name || row.table_id}: "${currentSession.status}" → "${incomingSession.status}"`);
          dispatchActions.push({
            tableId: row.table_id,
            action: { type: "SYNC" as const, session: incomingSession },
          });
        }
      } else {
        // No local session — sync new session
        dispatchActions.push({
          tableId: row.table_id,
          action: { type: "SYNC" as const, session: incomingSession },
        });
      }
    }

    // Check for tables that exist in session store but NOT in backend response
    // These sessions may have been cleared on another station
    for (const tableId of Object.keys(sessionStore.sessions)) {
      if (!responseTableIds.has(tableId)) {
        const currentSession = sessionStore.sessions[tableId];
        if (currentSession && !isLocalOnlyStatus(currentSession.status)) {
          if (__DEV__) console.log(`[TableSessionRealtimeSync] CLEAR orphaned session for table ${tableId}: not in backend response`);
          dispatchActions.push({
            tableId,
            action: { type: "CLEAR" as const },
          });
        }
      }
    }

    // batchDispatch handles both session store + floor plan store sync via _syncToFloorPlanStore
    if (dispatchActions.length > 0) {
      consecutiveNoChangePolls = 0; // Reset — changes detected
      sessionStore.batchDispatch(dispatchActions);
    } else {
      consecutiveNoChangePolls++;
    }
  } catch (err) {
    console.error("[TableSessionRealtimeSync] Poll error:", err);
  }

  scheduleNextPoll();
}

/**
 * Start polling for table_sessions changes
 */
export function startTableSessionRealtimeSync(locationId: string) {
  if (pollTimeout) return; // Already running

  activeLocationId = locationId;
  consecutiveNoChangePolls = 0;

  // Initial poll
  poll();

  if (__DEV__) console.log("[TableSessionRealtimeSync] Started with base interval:", BASE_INTERVAL);
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
  if (pollTimeout) {
    clearTimeout(pollTimeout);
    pollTimeout = null;
  }
  activeLocationId = null;
  lastSyncTimestamp = 0;
  consecutiveNoChangePolls = 0;
  if (__DEV__) console.log("[TableSessionRealtimeSync] Stopped");
}

/**
 * Restart the sync (useful when location changes)
 */
export function restartTableSessionRealtimeSync() {
  stopTableSessionRealtimeSync();

  const locationId = useStoreSettingsStore.getState().selectedStore?.id;
  if (locationId) {
    consecutiveNoChangePolls = 0; // Reset to fast polling on restart
    startTableSessionRealtimeSync(locationId);
  }
}
