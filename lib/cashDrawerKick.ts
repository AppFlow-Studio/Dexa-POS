import { CashDrawerKickResult } from "@/types/printer";

/**
 * Shared operator-facing interpretation of a cash-drawer kick result so every
 * call site (No Sale, Pay In/Out, manual Open Drawer, Test Pop) reacts
 * identically.
 *
 * - `ok`          — command ACKed and (if sensed) the drawer opened.
 * - `unconfirmed` — command ACKed, a drawer IS wired, but the Star sense saw no
 *                   open transition (strict-confirm tripwire). Surface a warning,
 *                   never a hard error — a fast re-close or an inverted-polarity
 *                   sense can produce this on a drawer that physically opened.
 * - `failed`      — no candidate / every candidate failed. Surface an error.
 */
export type KickOutcome = "ok" | "unconfirmed" | "failed";

export function classifyKickOutcome(result: CashDrawerKickResult): KickOutcome {
  if (!result.ok) return "failed";
  if (result.externalDevice === true && result.drawerConfirmed === false) {
    return "unconfirmed";
  }
  return "ok";
}

/** Operator-facing explanation for a failed kick, mapped from the error code. */
export function describeCashDrawerKickError(
  result: CashDrawerKickResult,
): string {
  switch (result.error) {
    case "no_candidate":
      return "No cash-drawer printer is configured for this station.";
    case "in_use":
      return "The cash-drawer printer is busy. Try again in a moment.";
    case "not_initialized":
      return "The cash-drawer printer is not ready. Check its connection.";
    case "timeout":
    case "unreachable":
    case "all_failed":
    default:
      return "Could not reach the cash-drawer printer. Check that it is powered and on the network.";
  }
}

/** Warning shown when a wired drawer's sense didn't confirm an open. */
export const DRAWER_UNCONFIRMED_MESSAGE =
  "The drawer may not have opened — please check the till.";
