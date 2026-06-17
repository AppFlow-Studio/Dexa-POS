/**
 * In-flight per-item "TO GO" toggle registry.
 *
 * Problem: `toggleToGoOnItems` persists `order_items.is_to_go` via a fire-and-forget
 * RPC, but the single inbound mapper (`mapBackendItemToCartItem`) overwrites the
 * local flag with whatever the backend payload carries. On slow WiFi a poll/fetch
 * (`get_active_orders_v1`, `get_order_details`) or a realtime re-fetch can land in
 * the window between the optimistic local toggle and the RPC committing — it reads
 * the stale pre-toggle value and clobbers the user's change ("TO GO lost sometimes
 * on broadcast/fetch"). It self-heals on the next fetch, but the flicker/loss is real.
 *
 * Fix: while a toggle's persist is unconfirmed, remember the desired value keyed by
 * db_order_item_id. The inbound mapper prefers this value over a stale backend one,
 * and auto-clears the entry once the backend payload finally agrees (server caught
 * up). On RPC failure the caller clears the entry so the next fetch reconciles the
 * local flag back to the (unchanged) DB value.
 */

const pending = new Map<string, boolean>()

/** Mark a set of db_order_item_ids as having an in-flight to-go toggle. */
export function markPendingToGo(dbItemIds: string[], value: boolean): void {
  for (const id of dbItemIds) {
    if (id) pending.set(id, value)
  }
}

/** Unconditionally drop pending markers (use when the persist RPC failed). */
export function clearPendingToGo(dbItemIds: string[]): void {
  for (const id of dbItemIds) {
    pending.delete(id)
  }
}

/**
 * Resolve the effective is_to_go for an inbound (fetched/broadcast) item.
 * - No pending toggle → use the incoming backend value.
 * - Pending toggle, backend now agrees → confirmed: clear the marker, use incoming.
 * - Pending toggle, backend still stale → keep the optimistic local value.
 */
export function resolveInboundToGo(
  dbItemId: string | undefined,
  incoming: boolean
): boolean {
  if (!dbItemId) return incoming
  const desired = pending.get(dbItemId)
  if (desired === undefined) return incoming
  if (incoming === desired) {
    pending.delete(dbItemId)
    return incoming
  }
  return desired
}
