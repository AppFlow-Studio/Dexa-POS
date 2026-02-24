/**
 * Subscriber-based order prefetch for occupied tables.
 *
 * Watches `useTableSessionStore.sessions` for changes and prefetches uncached
 * orders via `syncOrderFromDatabase()`. Replaces the dynamic import hack
 * that was inline in `loadFloorPlanStatus()`.
 *
 * Initialize once in root layout after both stores hydrate.
 */

import { useOrderStore } from "@/stores/useOrderStore";
import { useTableSessionStore } from "@/stores/useTableSessionStore";

let _unsubscribe: (() => void) | null = null;

export function setupTableOrderPrefetch() {
  // Prevent double-init
  if (_unsubscribe) return;

  _unsubscribe = useTableSessionStore.subscribe(
    (state) => state.sessions,
    (sessions) => {
      const orderIds = Object.values(sessions)
        .map((s) => s.order_id)
        .filter((id): id is string => !!id);

      if (orderIds.length === 0) return;

      // Defer to avoid blocking UI
      queueMicrotask(async () => {
        try {
          const orderState = useOrderStore.getState();
          const { ordersById, dbOrderIdIndex } = orderState;

          const uncachedOrderIds = orderIds.filter((id) => {
            if (ordersById[id]) return false;
            const localId = dbOrderIdIndex[id];
            if (localId && ordersById[localId]) return false;
            return true;
          });

          if (uncachedOrderIds.length > 0) {
            console.log(
              `[prefetch] Fetching ${uncachedOrderIds.length} uncached orders`,
            );
            await Promise.allSettled(
              uncachedOrderIds.map((id) =>
                orderState.syncOrderFromDatabase(id),
              ),
            );
            console.log(
              `[prefetch] Finished fetching ${uncachedOrderIds.length} orders`,
            );
          }
        } catch (err) {
          console.error("[prefetch] Failed:", err);
        }
      });
    },
    { fireImmediately: false },
  );
}

export function teardownTableOrderPrefetch() {
  _unsubscribe?.();
  _unsubscribe = null;
}
