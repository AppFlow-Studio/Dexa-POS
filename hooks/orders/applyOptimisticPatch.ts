import type { OrderProfile, PreviousOrder } from "@/lib/types";
import { useOrderStore } from "@/stores/useOrderStore";
import { usePreviousOrdersStore } from "@/stores/usePreviousOrdersStore";

/**
 * Applies optimistic patches to both useOrderStore (active orders)
 * and usePreviousOrdersStore (history orders) so the UI updates instantly.
 *
 * Safe to call even if the order only exists in one store.
 */
export function applyOptimisticPatch(
  orderId: string,
  dbOrderId: string | undefined,
  orderPatch: Partial<OrderProfile>,
  previousOrderPatch: Partial<PreviousOrder>,
): void {
  // Patch active order store (uses Immer)
  const orderState = useOrderStore.getState();
  // Resolve via dbOrderIdIndex if needed
  const localKey =
    orderState.ordersById[orderId]
      ? orderId
      : dbOrderId
        ? orderState.dbOrderIdIndex[dbOrderId] ?? dbOrderId
        : undefined;

  if (localKey && orderState.ordersById[localKey]) {
    orderState.patchOrder(localKey, orderPatch);
  }

  // Patch previous orders store
  // Try orderId first, then dbOrderId
  const prevStore = usePreviousOrdersStore.getState();
  const prevOrder = prevStore.getOrderById(orderId) ?? (dbOrderId ? prevStore.getOrderById(dbOrderId) : undefined);
  if (prevOrder) {
    usePreviousOrdersStore.getState().patchPreviousOrder(
      prevOrder.db_order_id || prevOrder.orderId,
      previousOrderPatch,
    );
  }
}
