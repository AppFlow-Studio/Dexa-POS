import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { CartItem } from "@/lib/types";

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
    useStoreSettingsStore.getState().selectedStore?.kds_workflow_mode;
  return mode === "2-step" ? "preparing" : "sent";
}

/** Returns "preparing" in 2-step mode, "sent_to_kitchen" in 3-step (default) */
export function getOrderSentStatus(): "sent_to_kitchen" | "preparing" {
  const mode =
    useStoreSettingsStore.getState().selectedStore?.kds_workflow_mode;
  return mode === "2-step" ? "preparing" : "sent_to_kitchen";
}
