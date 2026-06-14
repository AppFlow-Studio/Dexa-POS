/**
 * Subscriber-based order prefetch for occupied tables.
 *
 * Watches `useTableSessionStore.sessions` for changes to order_ids and
 * prefetches uncached orders via `syncOrderFromDatabase()`. Replaces the
 * dynamic import hack that was inline in `loadFloorPlanStatus()`.
 *
 * Initialize once in root layout after both stores hydrate.
 */

import { useCoursingStore } from "@/stores/useCoursingStore";
import { useLocationConfigStore } from "@/stores/useLocationConfigStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { useTableSessionStore } from "@/stores/useTableSessionStore";

const PREFETCH_CONCURRENCY = 2;
// How long to suppress prefetch for a dbOrderId after it was emitted by
// hydrateOrderFromSeat. Within this window the seat flow's local order is
// authoritative — fetching from the backend can race the not-yet-landed
// archiveOrder/order_status='completed' write from the *previous* session
// and inject stale items from a reused/dirty backend row.
const HYDRATE_SUPPRESS_MS = 5000;
// How recently a session must have been seated to be considered "fresh" —
// realtime broadcasts often arrive before the seat_guests_v3 RPC response, so
// the prefetch can fire before hydrateOrderFromSeat marks the dbOrderId.
// Reading `seated_at` from the session lets us short-circuit independently
// of whether hydrate has had a chance to mark yet.
const FRESH_SEAT_WINDOW_MS = 10000;

let _unsubscribe: (() => void) | null = null;
const _inFlightOrderIds = new Set<string>();
const _inFlightPrefetches = new Map<string, Promise<string | null>>();
const _recentlyHydrated = new Map<string, number>();

/**
 * Called by hydrateOrderFromSeat after a seat_guests_v3 response binds a
 * dbOrderId to a local order. Tells the prefetch subscriber to skip this id
 * for HYDRATE_SUPPRESS_MS so it doesn't race-create a stale shell from the
 * backend before the rekey/index repair settles.
 */
export function markOrderRecentlyHydrated(dbOrderId: string): void {
  _recentlyHydrated.set(dbOrderId, Date.now());
}

function isRecentlyHydrated(dbOrderId: string): boolean {
  const stamped = _recentlyHydrated.get(dbOrderId);
  if (stamped == null) return false;
  if (Date.now() - stamped > HYDRATE_SUPPRESS_MS) {
    _recentlyHydrated.delete(dbOrderId);
    return false;
  }
  return true;
}

/**
 * Returns true if any session in useTableSessionStore is bound to this
 * order_id AND was seated recently. This covers the race where a realtime
 * broadcast lands the new dbOrderId on the session *before* the seat_guests_v3
 * RPC response gets a chance to call hydrateOrderFromSeat — at which point
 * the local order is still pending and a backend fetch would inject stale
 * items from a reused/dirty backend row.
 */
function isFreshlySeatedOrder(orderId: string): boolean {
  const sessions = useTableSessionStore.getState().sessions;
  const now = Date.now();
  for (const session of Object.values(sessions)) {
    if (session.order_id !== orderId) continue;
    if (
      session.status !== "seating" &&
      session.status !== "seated" &&
      session.status !== "ordering"
    ) {
      continue;
    }
    const seatedAt = session.seated_at
      ? new Date(session.seated_at).getTime()
      : 0;
    if (Number.isFinite(seatedAt) && now - seatedAt < FRESH_SEAT_WINDOW_MS) {
      return true;
    }
  }
  return false;
}

function getCachedOrderId(orderId: string): string | null {
  const { ordersById, dbOrderIdIndex, orderIds } = useOrderStore.getState();
  if (ordersById[orderId]) return orderId;

  const localId = dbOrderIdIndex[orderId];
  if (localId && ordersById[localId]) return localId;

  // Defensive scan: if hydrateOrderFromSeat set db_order_id on a local order
  // but the dbOrderIdIndex repair hasn't committed yet (rare reorder during
  // a SESSION_CREATED → subscriber → microtask chain), still treat the order
  // as cached so we don't race-fetch a duplicate shell. Iterate the
  // pre-maintained orderIds array instead of allocating Object.entries.
  for (let i = 0; i < orderIds.length; i++) {
    const key = orderIds[i];
    const o = ordersById[key];
    if (o && o.db_order_id === orderId) return key;
  }
  return null;
}

/**
 * Perf T3b: warm the coursing data for an order alongside the order itself.
 * Mirrors useTableCoursing's mount guards (10s lastSyncAt window, in-flight
 * skip) so the hook's own load becomes a no-op when this ran first. Coursing
 * RPC only fires for dine-in orders with a db_order_id and only when the
 * merchant has coursing enabled.
 */
function prefetchCoursing(localOrderId: string): void {
  try {
    if (!useLocationConfigStore.getState().config.dining.enableCoursing) return;
    const order = useOrderStore.getState().ordersById[localOrderId];
    const dbOrderId = order?.db_order_id;
    if (!dbOrderId) return;

    const coursing = useCoursingStore.getState();
    const existing = coursing.byOrderId[localOrderId];
    if (existing?.syncing) return;
    if (
      existing?.lastSyncAt &&
      Date.now() - existing.lastSyncAt.getTime() < 10_000
    ) {
      return;
    }

    if (!existing) {
      // Fresh init auto-loads from server when a dbOrderId is present.
      coursing.initializeForOrder(localOrderId, dbOrderId);
      return;
    }
    if (!existing.dbOrderId) coursing.setDbOrderId(localOrderId, dbOrderId);
    void coursing.loadFromServer(localOrderId).catch(() => {});
  } catch {
    // Prefetch is best-effort — never let it break the tap path.
  }
}

export function ensureOrderPrefetched(orderId: string): Promise<string | null> {
  const cachedOrderId = getCachedOrderId(orderId);
  if (cachedOrderId) {
    prefetchCoursing(cachedOrderId);
    return Promise.resolve(cachedOrderId);
  }

  const inFlightPrefetch = _inFlightPrefetches.get(orderId);
  if (inFlightPrefetch) return inFlightPrefetch;

  _inFlightOrderIds.add(orderId);
  const prefetch = useOrderStore
    .getState()
    .syncOrderFromDatabase(orderId)
    .then((localOrderId) => {
      if (localOrderId) prefetchCoursing(localOrderId);
      return localOrderId;
    })
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
    // Skip ids that were just hydrated via seat_guests — the local order is
    // authoritative; the backend may still be flushing the previous session's
    // order_status='completed' so a fetch here would inject stale items.
    if (isRecentlyHydrated(id)) return false;
    // Race-cover for the broadcast-before-RPC-response case: the session is
    // freshly seated (within the last few seconds) and the seat_guests_v3 RPC
    // is still in flight on this client. Hydrate hasn't had a chance to mark
    // yet, but the seat flow is the authoritative writer here. Skip the fetch.
    if (isFreshlySeatedOrder(id)) return false;
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
