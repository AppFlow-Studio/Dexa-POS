import { useEffect } from "react";
import {
  registerAllSessionSideEffects,
  teardownAllSessionSideEffects,
} from "@/services/sessionEffects";
import {
  setupServiceChargeSubscriber,
  teardownServiceChargeSubscriber,
} from "@/services/serviceChargeSubscriber";
import {
  setupTableOrderPrefetch,
  teardownTableOrderPrefetch,
} from "@/services/tableOrderPrefetch";
import { detectStuckSessions, resolveToSyncableStatus } from "@/lib/tableStateMachine";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useTableSessionStore } from "@/stores/useTableSessionStore";

/**
 * Consolidated table session initialization hook.
 *
 * On mount (if not skipped):
 * 1. Registers all session side effects (send-to-kitchen, close-check, etc.)
 * 2. Sets up the table-order prefetch subscriber
 * 3. Patches session store from current table data (one-time on mount)
 * 4. Starts stuck-session watchdog (every 5 min)
 *
 * Cleanup: tears down effects, prefetch, and watchdog.
 *
 * Does NOT manage realtime channel lifecycle (handled by `useFloorRealtime`
 * + the session store propagation fix).
 */

const STUCK_CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// Wave 3.2: singleton guard. Multiple mounts of this hook (tab navigation,
// route remounts, etc.) must not multiply the watchdog interval or stack
// duplicate side-effect registrations.
let _activeMounts = 0;
let _stuckCheckInterval: ReturnType<typeof setInterval> | null = null;

export function useTableSessionInit(options?: { skip?: boolean }): void {
  const skip = options?.skip ?? false;

  useEffect(() => {
    if (skip) return;

    _activeMounts++;
    const isFirst = _activeMounts === 1;

    if (isFirst) {
      // 1. Register session side effects
      registerAllSessionSideEffects();

      // 2. Set up table order prefetch
      setupTableOrderPrefetch();

      // 2b. Set up service-charge recalculation on party_size change
      setupServiceChargeSubscriber();

      // 3. If tables already loaded, patch session store immediately.
      //    NOT authoritative: on cold start these tables come from the
      //    rehydrated floor-plan store with sessions STRIPPED, so we omit
      //    clearMissing (add-only) — otherwise this wipes the persisted
      //    session store before the first network fetch lands.
      const { tables } = useFloorPlanStore.getState();
      if (tables.length > 0) {
        useTableSessionStore.getState()._patchSessionsFromTables(tables);
      }

      // 4. Start stuck-session watchdog
      _stuckCheckInterval = setInterval(() => {
        resolveStuckSessions();
      }, STUCK_CHECK_INTERVAL_MS);

      // Also run once on mount (catches sessions stuck from previous app session)
      resolveStuckSessions();
    }

    return () => {
      _activeMounts--;
      if (_activeMounts === 0) {
        teardownAllSessionSideEffects();
        teardownTableOrderPrefetch();
        teardownServiceChargeSubscriber();
        if (_stuckCheckInterval) {
          clearInterval(_stuckCheckInterval);
          _stuckCheckInterval = null;
        }
      }
    };
  }, [skip]);
}

/**
 * Detect and auto-resolve sessions stuck in local-only statuses.
 * Maps each stuck session to its nearest syncable status via the state machine.
 */
function resolveStuckSessions(): void {
  const store = useTableSessionStore.getState();
  const sessionsForDetection: Record<string, { status: any; updatedAt?: string }> = {};

  for (const [tableId, session] of Object.entries(store.sessions)) {
    sessionsForDetection[tableId] = {
      status: session.status,
      updatedAt: session.seated_at,
    };
  }

  const stuck = detectStuckSessions(sessionsForDetection);

  if (stuck.length === 0) return;

  console.warn(
    `[StuckSessionWatchdog] Found ${stuck.length} stuck session(s), auto-resolving:`,
    stuck.map((s) => `${s.tableId}: ${s.status} → ${s.resolvedStatus}`),
  );

  const actions = stuck.map(({ tableId, resolvedStatus }) => ({
    tableId,
    action: {
      type: "SET" as const,
      session: {
        ...store.sessions[tableId],
        status: resolvedStatus,
      },
    },
  }));

  store.batchDispatch(actions);
}
