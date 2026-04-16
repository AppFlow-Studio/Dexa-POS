// lib/pendingItemRemovals.ts
// Module-level set tracking items currently being removed or voided.
// Used to prevent stale realtime broadcasts (and full-refresh syncs) from
// re-introducing items during the fire-and-forget RPC window.
//
// Pattern mirrors lib/pendingVoidOrderIds.ts.

const pendingRemovals = new Set<string>();
const removalTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

export function markItemPendingRemoval(dbOrderItemId: string): void {
  pendingRemovals.add(dbOrderItemId);
  const existing = removalTimeouts.get(dbOrderItemId);
  if (existing) clearTimeout(existing);
  // Safety net: auto-clear after 10s so a hung RPC can't permanently block.
  removalTimeouts.set(
    dbOrderItemId,
    setTimeout(() => {
      pendingRemovals.delete(dbOrderItemId);
      removalTimeouts.delete(dbOrderItemId);
    }, 10_000),
  );
}

export function clearItemPendingRemoval(dbOrderItemId: string): void {
  pendingRemovals.delete(dbOrderItemId);
  const t = removalTimeouts.get(dbOrderItemId);
  if (t) {
    clearTimeout(t);
    removalTimeouts.delete(dbOrderItemId);
  }
}

export function isItemPendingRemoval(dbOrderItemId: string): boolean {
  return pendingRemovals.has(dbOrderItemId);
}
