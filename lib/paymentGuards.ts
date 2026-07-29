/**
 * Whether an incoming payment should be rejected because the order has no
 * meaningful balance left to collect.
 *
 * A $0.01 order (or a tiny final split remainder, e.g. $0.05 split 3 ways
 * leaves $0.01) is a REAL balance the guest owes and MUST be collectable, so
 * only genuine sub-cent rounding dust (< $0.005) is treated as "already paid".
 * Any payment that actually covers the outstanding balance — including a null
 * "pay the entire remaining balance" (full-pay) amount — is allowed through.
 *
 * Pure & unit-tested so this penny-payment behaviour can't be silently reverted
 * again (it regressed once when commit 90f0ed1e clobbered the 40dee0fd fix).
 *
 * @param outstandingBeforePayment Order balance still owed, in dollars.
 * @param amount This payment's amount in dollars, or null/undefined for a
 *               "pay the entire remaining balance" (full-pay) payment.
 * @returns true when the payment should be rejected as "already paid".
 */
export function isNothingLeftToCollect(
  outstandingBeforePayment: number,
  amount: number | null | undefined,
): boolean {
  // Does this payment actually collect what's still owed? A null amount means
  // "pay the entire remaining balance" (full-pay), which collects by definition.
  const collectsRemaining =
    amount == null ||
    (amount > 0 && amount >= outstandingBeforePayment - 0.001);

  // Only genuine sub-cent dust counts as nothing left to collect.
  const nothingLeftToCollect = outstandingBeforePayment < 0.005;

  return (
    nothingLeftToCollect ||
    (outstandingBeforePayment <= 0.01 && !collectsRemaining)
  );
}
