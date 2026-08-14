/**
 * Cash change denomination breakdown.
 *
 * Given a change-due amount, returns the bills/coins to hand back, greedily
 * from largest to smallest. Pure and cents-based to avoid float drift.
 *
 * Shared by the cash entry screen (CashPaymentView) and the post-payment
 * success screen (PaymentSuccessView) so both show the same "give back" list.
 */

export interface ChangeDenomination {
  /** Display label, e.g. "$20" for bills, "25¢" for coins. */
  label: string;
  /** How many of this denomination to give back. */
  count: number;
}

/** US denominations in dollars, largest first. */
const DENOMINATIONS = [100, 50, 20, 10, 5, 1, 0.25, 0.1, 0.05, 0.01];

/**
 * Break `change` (in dollars) into a greedy list of denominations to return.
 * Returns [] for zero, negative, or non-finite input.
 */
export function computeChangeBreakdown(change: number): ChangeDenomination[] {
  if (!Number.isFinite(change) || change <= 0) return [];

  const result: ChangeDenomination[] = [];
  let remaining = Math.round(change * 100);

  for (const denom of DENOMINATIONS) {
    const denomCents = Math.round(denom * 100);
    const count = Math.floor(remaining / denomCents);
    if (count > 0) {
      result.push({
        label: denom >= 1 ? `$${denom.toFixed(0)}` : `${Math.round(denom * 100)}¢`,
        count,
      });
      remaining -= count * denomCents;
    }
  }

  return result;
}
