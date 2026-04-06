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
const _inFlightOrderIds = new Set<string>();

function getSessionOrderIds(): string[] {
  const ids: string[] = [];
  for (const s of Object.values(useTableSessionStore.getState().sessions)) {
    if (s.order_id) ids.push(s.order_id);
  }
  return ids;
}

async function prefetchUncachedOrders(orderIds: string[]) {
  if (orderIds.length === 0) return;

  const orderState = useOrderStore.getState();
  const { ordersById, dbOrderIdIndex } = orderState;

  const uncachedOrderIds = orderIds.filter((id) => {
    if (_inFlightOrderIds.has(id)) return false;
    if (ordersById[id]) return false;
    const localId = dbOrderIdIndex[id];
    if (localId && ordersById[localId]) return false;
    return true;
  });

  if (uncachedOrderIds.length === 0) return;

  if (__DEV__) console.log(
    `[prefetch] Fetching ${uncachedOrderIds.length} uncached orders`,
  );
  for (const id of uncachedOrderIds) _inFlightOrderIds.add(id);
  await Promise.allSettled(
    uncachedOrderIds.map((id) =>
      orderState.syncOrderFromDatabase(id).finally(() => {
        _inFlightOrderIds.delete(id);
      }),
    ),
  );
  if (__DEV__) console.log(
    `[prefetch] Finished fetching ${uncachedOrderIds.length} orders`,
  );
}

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
      // Defer to avoid blocking UI
      queueMicrotask(() => {
        prefetchUncachedOrders(orderIds).catch((err) => {
          console.error("[prefetch] Failed:", err);
        });
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

  // Run immediately for sessions already loaded before this subscriber was set up.
  // Without this, tables that were occupied at startup never get their orders
  // fetched until a session change occurs (e.g. long-press triggers a manual sync).
  queueMicrotask(() => {
    prefetchUncachedOrders(getSessionOrderIds()).catch((err) => {
      console.error("[prefetch] Initial fetch failed:", err);
    });
  });
}

export function teardownTableOrderPrefetch() {
  _unsubscribe?.();
  _unsubscribe = null;
}
