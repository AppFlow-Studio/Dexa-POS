import { OrderProfile } from "@/lib/types";

/**
 * Deduplicates orders by removing prefetch_ duplicates
 * Keeps one entry per db_order_id, preferring non-prefetch versions
 * For orders without db_order_id, keeps them as-is
 */
export function deduplicateOrders(orders: OrderProfile[]): OrderProfile[] {
  const orderMap = new Map<string, OrderProfile>();

  orders.forEach((order) => {
    // If no db_order_id, treat as unique and keep
    if (!order.db_order_id) {
      orderMap.set(order.id, order);
      return;
    }

    const existing = orderMap.get(order.db_order_id);

    if (!existing) {
      // First time seeing this db_order_id
      orderMap.set(order.db_order_id, order);
    } else {
      // We have a duplicate - decide which to keep
      const isCurrentPrefetch = order.id.startsWith("prefetch_");
      const isExistingPrefetch = existing.id.startsWith("prefetch_");

      // Prefer non-prefetch over prefetch
      if (isExistingPrefetch && !isCurrentPrefetch) {
        orderMap.set(order.db_order_id, order);
      } else if (!isExistingPrefetch && !isCurrentPrefetch) {
        // Both are real orders, keep the most recently active
        const currentActivity = order.last_activity_at || order.opened_at || "";
        const existingActivity =
          existing.last_activity_at || existing.opened_at || "";
        if (currentActivity > existingActivity) {
          orderMap.set(order.db_order_id, order);
        }
      }
      // If current is prefetch and existing is not, keep existing (do nothing)
    }
  });

  return Array.from(orderMap.values());
}

/**
 * Filters orders to show only relevant ones for Previous Orders view
 * Excludes: void status, draft status, orders with no items
 */
export function filterPreviousOrders(orders: OrderProfile[]): OrderProfile[] {
  return orders.filter(
    (o) => o.order_status !== "draft" && o.db_order_id, // Only include orders that have been synced to backend
  );
}
