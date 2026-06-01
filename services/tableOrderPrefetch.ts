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

const PREFETCH_CONCURRENCY = 2;

let _unsubscribe: (() => void) | null = null;
const _inFlightOrderIds = new Set<string>();
const _inFlightPrefetches = new Map<string, Promise<string | null>>();

function getCachedOrderId(orderId: string): string | null {
  const { ordersById, dbOrderIdIndex } = useOrderStore.getState();
  if (ordersById[orderId]) return orderId;

  const localId = dbOrderIdIndex[orderId];
  return localId && ordersById[localId] ? localId : null;
}

export function ensureOrderPrefetched(orderId: string): Promise<string | null> {
  const cachedOrderId = getCachedOrderId(orderId);
  if (cachedOrderId) return Promise.resolve(cachedOrderId);

  const inFlightPrefetch = _inFlightPrefetches.get(orderId);
  if (inFlightPrefetch) return inFlightPrefetch;

  _inFlightOrderIds.add(orderId);
  const prefetch = useOrderStore
    .getState()
    .syncOrderFromDatabase(orderId)
    .finally(() => {
      _inFlightOrderIds.delete(orderId);
      _inFlightPrefetches.delete(orderId);
    });
  _inFlightPrefetches.set(orderId, prefetch);
  return prefetch;
}

function getSessionOrderIds(): string[] {
  const ids: string[] = [];
  for (const s of Object.values(useTableSessionStore.getState().sessions)) {
    if (s.order_id) ids.push(s.order_id);
  }
  return ids;
}

async function prefetchUncachedOrders(orderIds: string[]) {
  if (orderIds.length === 0) return;

  const uncachedOrderIds = orderIds.filter((id) => {
    if (_inFlightOrderIds.has(id)) return false;
    return !getCachedOrderId(id);
  });

  if (uncachedOrderIds.length === 0) return;

  if (__DEV__) console.log(
    `[prefetch] Fetching ${uncachedOrderIds.length} uncached orders`,
  );
  // Cap concurrency: prior Promise.allSettled fired N parallel fetches and each
  // syncOrderFromDatabase issues 4 inner queries, so a station switch with 3
  // occupied tables produced 12 concurrent Postgres queries and triggered
  // statement timeouts (57014). Limit to PREFETCH_CONCURRENCY at a time.
  const queue = [...uncachedOrderIds];
  const runWorker = async () => {
    while (queue.length > 0) {
      const id = queue.shift();
      if (!id) return;
      try {
        await ensureOrderPrefetched(id);
      } catch (err) {
        if (__DEV__) console.warn(`[prefetch] ${id} failed:`, err);
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(PREFETCH_CONCURRENCY, uncachedOrderIds.length) }, runWorker),
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
