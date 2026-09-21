import { colors } from "@/lib/theme";
import type { OrderProfile } from "@/lib/types";
import { formatElapsed, minutesSince } from "./format";
import { lightTint, ORDER_TINT_DARK, type Tint } from "./tokens";

export type OrderKind = "takeout" | "dine_in" | "delivery";

export function orderKind(order: OrderProfile): OrderKind {
  switch (order.order_type) {
    case "Takeaway":
    case "takeout":
      return "takeout";
    case "Delivery":
    case "delivery":
      return "delivery";
    default:
      return "dine_in";
  }
}

const KIND_LABEL: Record<OrderKind, string> = {
  takeout: "Takeout",
  dine_in: "Dine in",
  delivery: "Delivery",
};

export function orderKindLabel(kind: OrderKind): string {
  return KIND_LABEL[kind];
}

/** Artifact tints in dark mode; the palette's solid order-type colour in light. */
export function orderKindTint(kind: OrderKind, dark: boolean): Tint {
  if (dark) return ORDER_TINT_DARK[kind];
  switch (kind) {
    case "takeout":
      return lightTint(colors.orderTypeToGo);
    case "delivery":
      return lightTint(colors.orderTypeDelivery);
    case "dine_in":
      return lightTint(colors.orderTypeDineIn);
  }
}

const CLOSED_STATUSES: ReadonlySet<OrderProfile["order_status"]> = new Set<
  OrderProfile["order_status"]
>(["cancelled", "void", "refunded", "declined"]);

/**
 * Open: the check is editable on the register — Opened, not in a terminal
 * state, and not an empty draft (the register creates one on "New order").
 */
export function isOpenCheck(order: OrderProfile): boolean {
  if (order.check_status !== "Opened") return false;
  if (CLOSED_STATUSES.has(order.order_status)) return false;
  if (order.order_status === "draft" && order.items.length === 0) return false;
  return true;
}

/** Closed: whatever the shared store still holds from this shift. */
export function isClosedCheck(order: OrderProfile): boolean {
  return order.check_status === "Closed" && order.items.length > 0;
}

export function checkNumber(order: OrderProfile): string {
  return order.display_number ?? order.order_number ?? "New";
}

/** "#1045 · Ben K." / "#1043 · Counter" / "#1050 · Table 12" */
export function checkTitle(order: OrderProfile): string {
  const who =
    order.customer_name?.trim() ||
    order.service_location_name?.trim() ||
    (orderKind(order) === "dine_in" ? "Counter" : "Walk-in");
  return `${checkNumber(order)} · ${who}`;
}

export type KitchenTone = "plain" | "warn" | "ok";

export interface KitchenState {
  label: string;
  tone: KitchenTone;
}

/** What the kitchen is doing with the check, in the artifact's words. */
export function kitchenState(order: OrderProfile, now: number): KitchenState {
  switch (order.order_status) {
    case "draft":
    case "pending":
      return { label: "Not sent", tone: "warn" };
    case "accepted":
    case "sent_to_kitchen":
    case "preparing": {
      const since = formatElapsed(
        minutesSince(order.sent_to_kitchen_at ?? order.opened_at, now),
      );
      return { label: since ? `Preparing ${since}` : "Preparing", tone: "plain" };
    }
    case "ready":
      return { label: "Ready", tone: "ok" };
    case "completed":
      return { label: "Served", tone: "plain" };
    case "cancelled":
    case "void":
      return { label: "Voided", tone: "plain" };
    case "refunded":
      return { label: "Refunded", tone: "plain" };
    case "declined":
      return { label: "Declined", tone: "plain" };
  }
}

/** Kitchen is waiting on the server: the Checks tab badge. */
export function checkNeedsYou(order: OrderProfile): boolean {
  return order.order_status === "ready";
}

export function openedAtMs(order: OrderProfile): number {
  const t = order.opened_at ? new Date(order.opened_at).getTime() : NaN;
  return Number.isNaN(t) ? 0 : t;
}

export function closedAtMs(order: OrderProfile): number {
  const t = order.closed_at ? new Date(order.closed_at).getTime() : NaN;
  return Number.isNaN(t) ? openedAtMs(order) : t;
}

export function itemCount(order: OrderProfile): number {
  return order.items.reduce((sum, item) => sum + item.quantity, 0);
}
