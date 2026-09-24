import type {
  KioskOrderingSettings,
  KioskOrderType,
} from "@/types/kiosk";

export interface KioskOrderTypeFlow {
  /**
   * Set when the merchant allows exactly one order type and wants the question
   * skipped — the kiosk starts straight on the menu with this type applied.
   */
  autoType: KioskOrderType | null;
  /** Buttons for the order-type screen (unused when `autoType` is set). */
  options: KioskOrderType[];
}

/**
 * Resolve the station's "Available Order Types" setting into the kiosk entry
 * flow:
 *   both                     → ask, [dine_in, takeout]
 *   dine_in_only + skip      → auto dine_in
 *   dine_in_only, no skip    → ask, [dine_in] (single button)
 *   takeout_only             → auto takeout (never asked)
 */
export function resolveOrderTypeFlow(
  settings: KioskOrderingSettings,
): KioskOrderTypeFlow {
  switch (settings.orderTypes) {
    case "takeout_only":
      return { autoType: "takeout", options: ["takeout"] };
    case "dine_in_only":
      return settings.dineInOnlySkipPrompt
        ? { autoType: "dine_in", options: ["dine_in"] }
        : { autoType: null, options: ["dine_in"] };
    default:
      return { autoType: null, options: ["dine_in", "takeout"] };
  }
}

/**
 * Whether checkout should ask "Where are you sitting?". Dine-in only, the
 * merchant has it on, and there is at least one location to pick — an empty
 * list skips the step rather than trapping the customer.
 */
export function shouldAskForSeat(
  settings: KioskOrderingSettings,
  orderType: KioskOrderType | null,
): boolean {
  return (
    orderType === "dine_in" &&
    settings.seatSelectionEnabled &&
    settings.seatOptions.length > 0
  );
}
