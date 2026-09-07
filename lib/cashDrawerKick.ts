import { CashDrawerKickResult } from "@/types/printer";

/**
 * Shared operator-facing interpretation of a cash-drawer kick result so every
 * call site (No Sale, Pay In/Out, manual Open Drawer, Test Pop) reacts
 * identically.
 *
 * - `ok`          — command ACKed and the drawer-open signal transitioned (the
 *                   drawer physically popped), OR the sense was unreadable so we
 *                   trust the ACK.
 * - `unconfirmed` — command ACKed but the Star drawer-open signal did NOT change
 *                   state. This catches BOTH a wired drawer that failed to pop
 *                   AND a printer with no drawer on its DK port (which still ACKs
 *                   the open-loop pulse). Surface a warning, never a hard error.
 * - `failed`      — no candidate / every candidate failed. Surface an error.
 *
 * NOTE: we key off `drawerConfirmed` (the before→after transition), NOT
 * `externalDevice1Connected` — on Star the latter is often `null` even when no
 * drawer is physically present, so it can't distinguish "no drawer" from
 * "solenoid-only". The transition is the signal that actually moves.
 */
export type KickOutcome = "ok" | "unconfirmed" | "failed";

export function classifyKickOutcome(result: CashDrawerKickResult): KickOutcome {
  if (!result.ok) return "failed";
  // Sense read completed and showed no open transition → nothing opened.
  // `null` (sense unreadable) falls through to `ok` — trust the ACK.
  if (result.drawerConfirmed === false) return "unconfirmed";
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

/** Warning shown when the drawer-open signal didn't move after the kick. */
export const DRAWER_UNCONFIRMED_MESSAGE =
  "No drawer opened — check that a cash drawer is connected to this printer.";
