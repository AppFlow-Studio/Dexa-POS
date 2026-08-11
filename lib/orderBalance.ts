import type { OrderProfile } from "@/lib/types";

/**
 * Sub-cent tolerance. Below this, a residual `amount_due` is a rounding
 * artifact of proportional tax splitting across portions — not money anyone
 * should be asked to collect.
 */
export const BALANCE_EPSILON = 0.01;

/**
 * Card-priced balance still owed on an order, or 0 when there is none.
 *
 * Deliberately conservative: it reports a balance ONLY when the backend has
 * positively told us one exists — `paid_status` is not "Paid" AND `amount_due`
 * is a finite number above the epsilon. Every unknown (no order, or an
 * `amount_due` that never arrived because the payment was queued offline)
 * reports 0.
 *
 * That default direction matters. Callers use this to decide whether to
 * interrupt the post-payment flow — block the auto-created next order, swap the
 * success CTA to "Pay Remaining". Guessing "there's a balance" when we don't
 * actually know would strand the operator on a settled order with no way
 * forward, so ambiguity resolves toward the normal path.
 *
 * NOT the complement of the `isOrderFullyPaid` check in usePaymentStore. That
 * one gates the `order:paid` event and defaults the opposite way (unsure → not
 * paid, so don't emit). Both predicates fail safe toward inaction; they are
 * deliberately not inverses of each other.
 */
export function getOrderBalanceDue(order?: OrderProfile | null): number {
  if (!order) return 0;
  if (order.paid_status === "Paid") return 0;

  const due = order.amount_due;
  if (typeof due !== "number" || !Number.isFinite(due)) return 0;

  return due > BALANCE_EPSILON ? due : 0;
}

/**
 * True when the order positively has money left to collect.
 *
 * EXISTENCE ONLY. Callers must not display `getOrderBalanceDue`'s figure on the
 * payment success screen: right after a payment the outstanding fields have not
 * been decremented yet, so the amount reads as the pre-payment total. Existence
 * survives that staleness — an unpaid check reports a balance either way, and a
 * settled one is caught by the `paid_status === "Paid"` short-circuit — but the
 * amount does not.
 */
export function hasOrderBalanceDue(order?: OrderProfile | null): boolean {
  return getOrderBalanceDue(order) > 0;
}
