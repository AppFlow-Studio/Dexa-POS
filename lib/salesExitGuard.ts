import type { OrderProfile } from "@/lib/types";

/**
 * What leaving the Sales screen should do when "Require PIN per order" is on.
 *
 *  - "navigate": the guard does not apply — leave exactly as before.
 *  - "reset":    drop the active order and its PIN attribution, then leave, so
 *                the next person to open Sales starts a fresh order behind the
 *                PIN gate. The order itself is never deleted or voided.
 *  - "prompt":   the order has items not yet sent to the kitchen — ask first
 *                (Send & Leave / Leave Order Open / Stay).
 */
export type SalesExitDecision = "navigate" | "reset" | "prompt";

type ExitGuardOrder = Pick<
  OrderProfile,
  | "items"
  | "order_type"
  | "service_location_id"
  | "paid_status"
  | "check_status"
  | "order_status"
>;

const FINAL_ORDER_STATUSES = new Set(["completed", "void", "cancelled"]);

/**
 * Items still waiting to go to the kitchen. Same rule the Send button counts
 * with, minus draft items: a draft is the item still open in the modifier
 * sidebar, and leaving Sales discards it (cancelAndRemoveDraft).
 */
export function countUnsentItems(
  order: Pick<OrderProfile, "items"> | null | undefined,
): number {
  let count = 0;
  for (const item of order?.items ?? []) {
    if (item.isDraft) continue;
    if (!item.kitchen_status || item.kitchen_status === "new") count++;
  }
  return count;
}

export function getSalesExitDecision({
  requirePinPerOrder,
  isKiosk,
  order,
}: {
  requirePinPerOrder: boolean;
  isKiosk: boolean;
  order: ExitGuardOrder | null | undefined;
}): SalesExitDecision {
  if (!requirePinPerOrder || isKiosk || !order) return "navigate";

  // Dine-in is attributed at seating and belongs to its table, not the till.
  const isDineIn =
    order.order_type === "dine_in" ||
    order.order_type === "Dine In" ||
    !!order.service_location_id;
  if (isDineIn) return "navigate";

  // A paid or closed order is already done; the next order re-prompts anyway.
  if (
    order.paid_status === "Paid" ||
    order.check_status === "Closed" ||
    FINAL_ORDER_STATUSES.has(order.order_status ?? "")
  ) {
    return "navigate";
  }

  return countUnsentItems(order) > 0 ? "prompt" : "reset";
}
