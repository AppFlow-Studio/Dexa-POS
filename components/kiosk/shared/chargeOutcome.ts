// ============================================================
// resolveKioskChargeOutcome — pure decision for "what happens after the charge"
// File: components/kiosk/shared/chargeOutcome.ts
// ============================================================
// Given the normalized result of `chargeActiveTerminal` plus whether the
// customer pressed Back, decide how the kiosk should react. Kept pure (no store
// / no React) so the money-safety branches can be unit-tested exhaustively.
//
// The critical invariant: NEVER void or re-charge an order whose card MAY have
// been captured. Two things can capture money we can't cleanly confirm:
//   1. `indeterminate` — the processor told us the charge may have landed.
//   2. A customer Back on Castles — its ONLY abort is closing the shared socket,
//      which can sever an approval that already went through. Valor/Dejavoo
//      cancel on a SEPARATE channel, so their sale result stays authoritative.
// ============================================================

export const KIOSK_VERIFY_STAFF_MESSAGE =
  "Payment is being verified. Please see a staff member before trying again.";

export const KIOSK_CANCEL_UNCONFIRMED_MESSAGE =
  "We couldn't confirm the payment was cancelled. Please see a staff member before trying again.";

export type KioskChargeOutcome =
  /** Card approved — record the payment and run the confirmation flow. */
  | { kind: "success" }
  /** Confirmed cancel with no capture — void the half-built order, show cancelled. */
  | { kind: "cancelled" }
  /** May have captured (indeterminate / unconfirmable Castles cancel) — do NOT
   *  void or re-charge; route the customer to a staff member. */
  | { kind: "verify"; message: string }
  /** Clean decline — void the half-built order, show the decline message. */
  | { kind: "declined"; message: string };

export interface ResolveKioskChargeOutcomeArgs {
  /** `chargeActiveTerminal` result: card approved & confirmed. */
  ok: boolean;
  /** `chargeActiveTerminal` result: charge may have landed but can't be confirmed. */
  indeterminate?: boolean;
  /** Decline / error / indeterminate message from the terminal. */
  message?: string;
  /** The customer pressed Back to cancel during the card read. */
  userCancelled: boolean;
  /** terminal_type running the sale (from the charge handle). */
  terminalType?: string;
}

/**
 * Decide the kiosk's reaction to a settled charge. A successful charge ALWAYS
 * wins — even if the customer pressed Back, an approved card is completed and
 * the order goes through confirmation (we can't and must not un-charge it).
 */
export function resolveKioskChargeOutcome(
  args: ResolveKioskChargeOutcomeArgs,
): KioskChargeOutcome {
  const { ok, indeterminate, message, userCancelled, terminalType } = args;

  // Approved card wins outright — record it and confirm the order, regardless of
  // a late Back press (the cancel raced the approval and lost).
  if (ok) return { kind: "success" };

  // MAY have captured — never void or re-charge; hand off to staff.
  if (indeterminate) {
    return { kind: "verify", message: message ?? KIOSK_VERIFY_STAFF_MESSAGE };
  }

  // Castles cancels by closing the shared sale socket, so a not-ok after a Back
  // can't be trusted to mean "no charge" — treat as unconfirmed, hand off to
  // staff rather than void a possibly-charged order.
  if (userCancelled && terminalType === "castles") {
    return { kind: "verify", message: KIOSK_CANCEL_UNCONFIRMED_MESSAGE };
  }

  // Customer Back on a separate-channel processor (Valor/Dejavoo) — the not-ok
  // sale result is authoritative, so this is a confirmed cancellation.
  if (userCancelled) {
    return { kind: "cancelled" };
  }

  // Genuine decline.
  return { kind: "declined", message: message ?? "Payment declined." };
}
