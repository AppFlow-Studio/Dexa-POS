import { round2 } from "@/utils/money";

/**
 * Wave R-SC: compute the SC-inclusive refund amount for a per-payment item slice.
 *
 * `itemsTotal` is the sum of (subtotal_paid + tax_paid) for the items being
 * refunded from this payment. `payment.amount − payment.serviceCharge` is the
 * SUM of all items+tax recorded against the payment by process_payment_v14.
 *
 *   scShare = ROUND(SC × itemsTotal / (amount − SC), 2)
 *
 * Snapped to the full SC when `itemsTotal` covers the whole items+tax slice
 * — mirrors the `v_is_full_refund` snap at
 * apply_refund_to_payment_v4_sc_reversal.sql:134-137.
 *
 * Exported as a standalone helper so the unit test doesn't transitively pull
 * in services/refundService.ts (which imports uuid, an ESM-only build that
 * jest-expo doesn't transform).
 */
export function computeItemRefundAmount(
  payment: { amount: number; serviceCharge: number },
  itemsTotal: number,
): { scShare: number; amount: number } {
  const allItemsInPayment = payment.amount - payment.serviceCharge;
  let scShare = 0;
  if (payment.serviceCharge > 0 && allItemsInPayment > 0) {
    const isFullItemsRefund = itemsTotal + 0.001 >= allItemsInPayment;
    scShare = isFullItemsRefund
      ? payment.serviceCharge
      : round2((payment.serviceCharge * itemsTotal) / allItemsInPayment);
  }
  return { scShare, amount: round2(itemsTotal + scShare) };
}
