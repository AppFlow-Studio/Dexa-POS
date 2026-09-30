/**
 * Per-display KDS flow + online-orders button rules (kds_displays.kds_flow_mode,
 * kds_displays.show_online_orders_button). Pure, so the screen, the store and
 * the settings panel agree and the rules are unit-tested.
 */

/** standard = Cooking → Served → Done. quick_done = Cooking → Done. */
export type KdsFlowMode = "standard" | "quick_done";

/** Board tab keys. "ready" is the tab labelled "Served". */
export type KdsStatusTab = "pending" | "cooking" | "ready" | "done";

/**
 * Tabs a display shows. The location's 2-step/3-step workflow owns "pending";
 * the display's flow mode owns "ready" (Served).
 */
export function visibleStatusTabKeys(
  workflowMode: "2-step" | "3-step",
  flowMode: KdsFlowMode,
): KdsStatusTab[] {
  const tabs: KdsStatusTab[] =
    workflowMode === "2-step" ? ["cooking"] : ["pending", "cooking"];
  if (flowMode !== "quick_done") tabs.push("ready");
  tabs.push("done");
  return tabs;
}

/** Quick Done skips Served: a bump that would land on ready goes to served. */
export function resolveBumpStatus<S extends "preparing" | "ready" | "served">(
  newStatus: S,
  flowMode: KdsFlowMode | null | undefined,
): S | "served" {
  return flowMode === "quick_done" && newStatus === "ready"
    ? "served"
    : newStatus;
}

/** Undo window for a Quick Done item tap before anything is written. */
export const QUICK_DONE_UNDO_MS = 5000;

export interface OnlineAcceptConfig {
  /** online_store_config.auto_accept_orders (null = no active storefront). */
  storeAutoAccept: boolean | null;
  /** orderout_restaurants.auto_accept_orders (null = not connected). */
  orderoutAutoAccept: boolean | null;
}

/** True when some channel parks new orders in "pending" for a manual Accept. */
export function requiresManualAccept(c: OnlineAcceptConfig | null): boolean {
  return c?.storeAutoAccept === false || c?.orderoutAutoAccept === false;
}

/**
 * The display setting can only hide the button when nothing needs it: a
 * channel that needs manual accepts keeps it, and so does any pending order
 * (covers a stale accept-config cache).
 */
export function shouldShowOnlineOrdersButton(
  setting: boolean,
  accept: OnlineAcceptConfig | null,
  pendingCount: number,
): boolean {
  return setting || requiresManualAccept(accept) || pendingCount > 0;
}
