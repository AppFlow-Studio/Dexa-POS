import { useLocationConfigStore } from "@/stores/useLocationConfigStore";
import type { CartItem, OrderProfile } from "@/lib/types";

export type EffectiveItemStatus =
  | "new"
  | "sent"
  | "preparing"
  | "ready"
  | "served";

/** Resolve authoritative item preparation status.
 *  Priority: kitchen_status (KDS-updated) > item_status (legacy). */
export function getEffectiveItemStatus(item: CartItem): EffectiveItemStatus {
  const ks = item.kitchen_status;
  if (ks === "served" || ks === "ready" || ks === "preparing" || ks === "sent")
    return ks;

  const is = item.item_status?.toLowerCase();
  if (is === "served") return "served";
  if (is === "ready") return "ready";
  if (is === "preparing") return "preparing";

  return "new";
}

/** True when item is ready or served (for alert/payment gating). */
export function isItemReadyOrServed(item: CartItem): boolean {
  const s = getEffectiveItemStatus(item);
  return s === "ready" || s === "served";
}

/** Returns "preparing" in 2-step mode, "sent" in 3-step (default) */
export function getKitchenSentStatus(): "sent" | "preparing" {
  const mode =
    useLocationConfigStore.getState().config.kds.workflowMode;
  return mode === "2-step" ? "preparing" : "sent";
}

/** Returns "preparing" in 2-step mode, "sent_to_kitchen" in 3-step (default) */
export function getOrderSentStatus(): "sent_to_kitchen" | "preparing" {
  const mode =
    useLocationConfigStore.getState().config.kds.workflowMode;
  return mode === "2-step" ? "preparing" : "sent_to_kitchen";
}

/**
 * Reopen the fulfillment lifecycle when an open check fires another batch.
 * A previously ready/completed kitchen cycle is no longer the order's current
 * state once a new item is sent. Closed or terminally-cancelled checks remain
 * terminal as a defense-in-depth guard for stale/programmatic callers.
 */
export function getOrderStatusAfterKitchenSend(
  currentStatus: OrderProfile["order_status"],
  checkStatus: OrderProfile["check_status"],
  sentStatus: ReturnType<typeof getOrderSentStatus> = getOrderSentStatus(),
): OrderProfile["order_status"] {
  if (
    checkStatus === "Closed" ||
    currentStatus === "void" ||
    currentStatus === "cancelled" ||
    currentStatus === "refunded" ||
    currentStatus === "declined"
  ) {
    return currentStatus;
  }

  return sentStatus;
}

/**
 * True when the line has never been fired (no status or 'new').
 * Single source of truth — components used to carry their own copies.
 */
export function isKitchenItemUnsent(item: {
  kitchen_status?: string | null;
}): boolean {
  return !item.kitchen_status || item.kitchen_status === "new";
}

/**
 * True when the line has been fired at least once (any non-new status).
 * Inverse of isKitchenItemUnsent.
 */
export function isKitchenItemSent(item: {
  kitchen_status?: string | null;
}): boolean {
  return !!item.kitchen_status && item.kitchen_status !== "new";
}
