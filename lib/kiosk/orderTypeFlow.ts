import { composeKioskLocationLabel } from "@/lib/formatTableLabel";
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
 * merchant lets the guest pick (seat mode "ask"), and there is at least one
 * location to pick — an empty list skips the step rather than trapping the
 * customer. A fixed seat never asks.
 */
export function shouldAskForSeat(
  settings: KioskOrderingSettings,
  orderType: KioskOrderType | null,
): boolean {
  return (
    orderType === "dine_in" &&
    settings.seatMode === "ask" &&
    settings.seatOptions.length > 0
  );
}

/**
 * Where staff deliver a kiosk order — the label written to
 * `orders.table_number`. Null for takeout or when nothing is configured.
 *
 *   fixed table + fixed seat  → "Table 1, Seat 3"
 *   fixed table + guest pick  → "Table 1, Seat 5"
 *   fixed table only          → "Table 1"
 *   fixed seat only           → "Seat 3"
 *   guest pick, no table      → the picked label verbatim (pre-existing
 *                               behaviour; staff surfaces format it)
 */
export function resolveKioskLocationLabel(
  settings: KioskOrderingSettings,
  orderType: KioskOrderType | null,
  pickedSeat: string | null,
): string | null {
  if (orderType !== "dine_in") return null;
  const seat =
    settings.seatMode === "fixed"
      ? settings.fixedSeatLabel
      : settings.seatMode === "ask"
        ? pickedSeat
        : null;
  if (!settings.tableLabel && settings.seatMode === "ask") {
    return pickedSeat?.trim() || null;
  }
  return composeKioskLocationLabel(settings.tableLabel, seat) || null;
}
