/**
 * W1-3: demand-driven order-detail fetch — the staleness contract.
 *
 * Broadcasts carry live header fields (status, totals, item_count) for every
 * order; item-level detail has exactly one consumer: an open order screen.
 * The eager path (`_debouncedOrderRefresh` → get_order_details RPC → big
 * merge → persist arm) used to fire on any change-signal for ANY locally-held
 * order — table 3's register downloading table 14's item list because a
 * broadcast said its item_count moved.
 *
 * Contract every consumer can rely on:
 * - Header fields are always live (broadcast-fed).
 * - Item detail is guaranteed fresh only after open-path hydration completes.
 * - `isOrderDetailStale(dbOrderId)` tells you which regime you're in.
 *
 * Mismatches for orders OUTSIDE the local working scope mark the order stale
 * here (no fetch). Entering the working scope (open / claim) hydrates via
 * `syncOrderFromBackendComplete(..., { force: true })`, which clears the flag
 * ON SUCCESS only — an offline or failed open keeps the flag so the next
 * open retries.
 *
 * Module-dict state, deliberately NOT persisted: it's derivable, and
 * persisting it would re-arm the writes W1-1 eliminated.
 *
 * Leaf module: imports only telemetry. Do not import stores.
 */
import { KEY_RT_DETAIL_REFRESH_SUPPRESSED } from "@/lib/telemetry/keys";
import { recordCount } from "@/lib/telemetry/registry";

/** Orders (by db_order_id) whose item-level detail is known stale. */
const detailStaleOrders: Record<string, true> = {};

/**
 * Refcount of screens currently showing full item detail for an order
 * WITHOUT going through setActiveOrder (online-orders detail screen). While
 * registered, eager refresh stays allowed for that order.
 */
const visibleDetailOrders: Record<string, number> = {};

/**
 * The slice of order-store state the working-scope predicate reads.
 * Structurally satisfied by OrderState — pass `get()` directly.
 */
export interface WorkingScopeState {
  _workingSetLookup: Record<string, true>;
  activeOrderId: string | null;
  persistableOrderIds: Record<string, true>;
}

/**
 * "Ours" — the same definition W1-1's persisted subset uses, plus explicit
 * visibility registration: orders this station is serving (working set),
 * editing (active), holding unsynced local changes for (persistable), or
 * currently displaying item detail for (visible registration).
 *
 * Broadcast context has both key spaces in hand, so both are checked:
 * `dbOrderId` (working set + visibility are keyed by it) and the local store
 * key (activeOrderId / persistableOrderIds may hold either after rekey).
 */
export function isInLocalWorkingScope(
  s: WorkingScopeState,
  dbOrderId: string,
  localKey: string,
): boolean {
  return (
    !!s._workingSetLookup[dbOrderId] ||
    s.activeOrderId === localKey ||
    s.activeOrderId === dbOrderId ||
    !!s.persistableOrderIds[localKey] ||
    !!s.persistableOrderIds[dbOrderId] ||
    !!visibleDetailOrders[dbOrderId]
  );
}

/** Suppressed eager refresh → mark stale + count the avoided RPC cycle. */
export function markOrderDetailStale(dbOrderId: string): void {
  detailStaleOrders[dbOrderId] = true;
  recordCount(KEY_RT_DETAIL_REFRESH_SUPPRESSED);
}

export function isOrderDetailStale(dbOrderId: string): boolean {
  return !!detailStaleOrders[dbOrderId];
}

/**
 * Called on successful full-detail sync (syncOrderFromBackendComplete) and
 * when an order leaves ordersById (module-state cleanup).
 */
export function clearOrderDetailStale(dbOrderId: string): void {
  delete detailStaleOrders[dbOrderId];
}

/**
 * Register a screen showing full item detail outside the setActiveOrder
 * flow. Returns an idempotent unregister for the effect cleanup.
 */
export function registerVisibleOrderDetail(dbOrderId: string): () => void {
  visibleDetailOrders[dbOrderId] = (visibleDetailOrders[dbOrderId] ?? 0) + 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const next = (visibleDetailOrders[dbOrderId] ?? 1) - 1;
    if (next <= 0) delete visibleDetailOrders[dbOrderId];
    else visibleDetailOrders[dbOrderId] = next;
  };
}

/** Test-only: reset both module dicts between cases. */
export function _resetDetailStalenessForTests(): void {
  for (const k of Object.keys(detailStaleOrders)) delete detailStaleOrders[k];
  for (const k of Object.keys(visibleDetailOrders))
    delete visibleDetailOrders[k];
}
