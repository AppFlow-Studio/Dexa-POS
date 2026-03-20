// lib/pendingVoidOrderIds.ts
// Module-level set tracking orders currently being voided.
// Prevents false conflict detection during the void flow's queueMicrotask gap.

const pendingVoidOrderIds = new Set<string>();

export function markOrderPendingVoid(orderId: string): void {
  pendingVoidOrderIds.add(orderId);
}

export function clearOrderPendingVoid(orderId: string): void {
  pendingVoidOrderIds.delete(orderId);
}

export function isOrderPendingVoid(orderId: string): boolean {
  return pendingVoidOrderIds.has(orderId);
}
