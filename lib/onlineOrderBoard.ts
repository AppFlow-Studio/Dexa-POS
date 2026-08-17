import type { OrderProfile } from "@/lib/types";

export const ACTIVE_ONLINE_ORDER_STATUSES = new Set([
  "pending",
  "accepted",
  "sent_to_kitchen",
  "preparing",
  "ready",
]);

const BOARD_ONLINE_ORDER_STATUSES = new Set([
  ...ACTIVE_ONLINE_ORDER_STATUSES,
  "completed",
]);

export interface OnlineOrderBoardSelection {
  orderId: string;
  placedAt: string | null;
  isInRange: boolean;
  itemCount: number;
  orderData: unknown;
}

export function isActiveOnlineOrderStatus(status: string | null | undefined) {
  return ACTIVE_ONLINE_ORDER_STATUSES.has(status ?? "");
}

/** Active realtime rows absent from the last RPC snapshot need one refresh. */
export function getMissingActiveOnlineOrderIds(
  selections: OnlineOrderBoardSelection[],
  liveOrders: OrderProfile[],
): string[] {
  const selectedIds = new Set(selections.map((selection) => selection.orderId));
  const missingIds = new Set<string>();

  for (const order of liveOrders) {
    if (!isActiveOnlineOrderStatus(order.order_status)) continue;
    const orderId = order.db_order_id ?? order.id;
    if (!selectedIds.has(orderId)) missingIds.add(orderId);
  }

  return Array.from(missingIds).sort();
}

const STATUS_RANK: Record<string, number> = {
  draft: 0,
  pending: 0,
  accepted: 1,
  sent_to_kitchen: 1,
  preparing: 1,
  ready: 2,
  completed: 3,
};

/** Merge an authoritative header without reverting an optimistic local step. */
export function reconcileOnlineOrderSnapshot(
  existing: OrderProfile | undefined,
  incoming: OrderProfile,
): OrderProfile {
  if (!existing) return incoming;

  const existingRank = STATUS_RANK[existing.order_status ?? ""] ?? 0;
  const incomingRank = STATUS_RANK[incoming.order_status ?? ""] ?? 0;
  const preserveLocalStatus = existingRank > incomingRank;

  return {
    ...existing,
    ...incoming,
    order_status: preserveLocalStatus
      ? existing.order_status
      : incoming.order_status,
    sent_to_kitchen_at: preserveLocalStatus
      ? (existing.sent_to_kitchen_at ?? incoming.sent_to_kitchen_at)
      : incoming.sent_to_kitchen_at,
    items: incoming.items.length > 0 ? incoming.items : existing.items,
    payments:
      (incoming.payments?.length ?? 0) > 0
        ? incoming.payments
        : existing.payments,
  };
}

/**
 * Reconcile the server-selected rows with the latest realtime order objects.
 * Completed rows are retained only when the RPC marked them in-range. Active
 * rows outside the window are retained only when `includeActiveOutsideRange`
 * is set — the caller passes this when the selected range reaches today, so
 * historical tabs (Yesterday, a past custom range) stay scoped by placed_at
 * instead of showing today's live orders.
 */
export function assembleOnlineOrderBoard(
  selections: OnlineOrderBoardSelection[],
  ordersById: Record<string, OrderProfile>,
  liveOrders: OrderProfile[],
  options: {
    includeLiveCompleted?: boolean;
    includeActiveOutsideRange?: boolean;
  } = {},
): OrderProfile[] {
  // Default true preserves the original "active always visible" behavior for
  // callers that don't scope by day (e.g. the Today live view).
  const includeActiveOutsideRange = options.includeActiveOutsideRange ?? true;
  const selectionById = new Map(
    selections.map((selection) => [selection.orderId, selection]),
  );
  const byId = new Map<string, OrderProfile>();

  for (const selection of selections) {
    const order = ordersById[selection.orderId];
    if (!order || !BOARD_ONLINE_ORDER_STATUSES.has(order.order_status ?? "")) {
      continue;
    }
    if (
      selection.isInRange ||
      (includeActiveOutsideRange &&
        isActiveOnlineOrderStatus(order.order_status))
    ) {
      byId.set(selection.orderId, order);
    }
  }

  // Realtime may deliver a newly-active order before the RPC refresh returns —
  // but only surface it when the window reaches today, so a live order (placed
  // now) never leaks onto a historical tab.
  for (const order of liveOrders) {
    const isLiveFallback =
      (includeActiveOutsideRange &&
        isActiveOnlineOrderStatus(order.order_status)) ||
      (options.includeLiveCompleted && order.order_status === "completed");
    if (!isLiveFallback) continue;
    byId.set(order.db_order_id ?? order.id, order);
  }

  return Array.from(byId.entries())
    .sort(([aId, a], [bId, b]) => {
      const aTime =
        selectionById.get(aId)?.placedAt ?? a.opened_at ?? "1970-01-01";
      const bTime =
        selectionById.get(bId)?.placedAt ?? b.opened_at ?? "1970-01-01";
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    })
    .map(([, order]) => order);
}
