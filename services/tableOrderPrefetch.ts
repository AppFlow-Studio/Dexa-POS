/**
 * Subscriber-based order prefetch for occupied tables.
 *
 * Watches `useTableSessionStore.sessions` for changes to order_ids and
 * prefetches uncached orders via `syncOrderFromDatabase()`. Replaces the
 * dynamic import hack that was inline in `loadFloorPlanStatus()`.
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
    // Selector: extract only order_ids (fires only when order_ids change)
    (state) => {
      const ids: string[] = [];
      for (const s of Object.values(state.sessions)) {
        if (s.order_id) ids.push(s.order_id);
      }
      return ids;
    },
    (orderIds) => {
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
            if (__DEV__) console.log(
              `[prefetch] Fetching ${uncachedOrderIds.length} uncached orders`,
            );
            await Promise.allSettled(
              uncachedOrderIds.map((id) =>
                orderState.syncOrderFromDatabase(id),
              ),
            );
            if (__DEV__) console.log(
              `[prefetch] Finished fetching ${uncachedOrderIds.length} orders`,
            );
          }
        } catch (err) {
          console.error("[prefetch] Failed:", err);
        }
      });
    },
    {
      // Only fire when the set of order_ids actually changes
      equalityFn: (a, b) => {
        if (a.length !== b.length) return false;
        const setB = new Set(b);
        return a.every((id) => setB.has(id));
      },
    },
  );
}

export function teardownTableOrderPrefetch() {
  _unsubscribe?.();
  _unsubscribe = null;
}
