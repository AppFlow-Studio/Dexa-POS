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
