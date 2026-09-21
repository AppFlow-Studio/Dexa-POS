import type { OrderProfile } from "@/lib/types";

const CLOSED_STATUSES: ReadonlySet<OrderProfile["order_status"]> = new Set<
  OrderProfile["order_status"]
>(["cancelled", "void", "refunded", "declined"]);

/**
 * An open check is one the register would still show as editable: the check
 * itself is Opened, the order is not in a terminal state, and it is not an
 * empty draft (the register creates those the moment "New order" is tapped).
 */
export function isOpenCheck(order: OrderProfile): boolean {
  if (order.check_status !== "Opened") return false;
  if (CLOSED_STATUSES.has(order.order_status)) return false;
  if (order.order_status === "draft" && order.items.length === 0) return false;
  return true;
}

export function checkNumber(order: OrderProfile): string {
  return order.display_number ?? order.order_number ?? "New check";
}

/** Where the check is: its table, else a short order-type word. */
export function checkPlace(order: OrderProfile): string {
  if (order.service_location_name) return order.service_location_name;
  switch (order.order_type) {
    case "Takeaway":
    case "takeout":
      return "Takeout";
    case "Delivery":
    case "delivery":
      return "Delivery";
    case "Dine In":
    case "dine_in":
      return "Dine in";
    default:
      return "";
  }
}

export function itemCountLabel(order: OrderProfile): string {
  const n = order.items.reduce((sum, item) => sum + item.quantity, 0);
  return n === 1 ? "1 item" : `${n} items`;
}

export function openedAtMs(order: OrderProfile): number {
  const t = order.opened_at ? new Date(order.opened_at).getTime() : NaN;
  return Number.isNaN(t) ? 0 : t;
}
