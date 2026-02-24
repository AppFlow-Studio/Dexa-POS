import { useEffect } from "react";
import {
  registerAllSessionSideEffects,
  teardownAllSessionSideEffects,
} from "@/services/sessionEffects";
import {
  setupTableOrderPrefetch,
  teardownTableOrderPrefetch,
} from "@/services/tableOrderPrefetch";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useTableSessionStore } from "@/stores/useTableSessionStore";

/**
 * Consolidated table session initialization hook.
 *
 * On mount (if not skipped):
 * 1. Registers all session side effects (send-to-kitchen, close-check, etc.)
 * 2. Sets up the table-order prefetch subscriber
 * 3. Patches session store from current table data (one-time on mount)
 *
 * Cleanup: tears down effects and prefetch.
 *
 * Does NOT manage realtime channel lifecycle (handled by `useFloorRealtime`
 * + the session store propagation fix).
 */

export function useTableSessionInit(options?: { skip?: boolean }): void {
  const skip = options?.skip ?? false;

  useEffect(() => {
    if (skip) return;

    // 1. Register session side effects
    registerAllSessionSideEffects();

    // 2. Set up table order prefetch
    setupTableOrderPrefetch();

    // 3. If tables already loaded, patch session store immediately
    const { tables } = useFloorPlanStore.getState();
    if (tables.length > 0) {
      useTableSessionStore.getState()._patchSessionsFromTables(tables);
    }

    return () => {
      teardownAllSessionSideEffects();
      teardownTableOrderPrefetch();
    };
  }, [skip]);
}
