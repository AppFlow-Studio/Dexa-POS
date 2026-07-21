/**
 * "Amount Paid" reduction in `components/bill/PricingBreakdownSheet.tsx`.
 *
 * Why this exists: PricingBreakdownSheet used to compute
 *   actual = p.isCashPriced && p.cashSavings ? p.amount - p.cashSavings : p.amount
 * That was correct under the pre-v14 invariant where `op.amount` was stored
 * in card-equivalent terms and `cashSavings` mapped it back to cash. Under
 * `process_payment_v14` (the live RPC since `services/orderService.ts:528-545`
 * and `stores/useOrderStore.ts:2712-2733` were re-routed), `op.amount` is
 * stored in cash terms directly — so subtracting `cashSavings` double-deducts
 * the discount.
 *
 * The S6-0010 staging repro on 2026-05-30: customer handed $8.00 cash for
 * Mocha, got $0.18 change. `op.amount = $7.82`, `op.original_amount = $11.03`
 * → `cashSavings = $3.21`. Old formula displayed `$7.82 − $3.21 = $4.61`.
 * New formula displays `$7.82` (matches CFD and the order's amount_paid).
 *
 * Pattern: mirror the production reduce as a pure function (same approach
 * as `__tests__/recalculate-sc-drift-gate.test.ts`). If the production
 * formula changes again, this mirror diverges and needs re-checking.
 */

import { round2 } from "@/lib/order-calculator";

type PaymentLike = {
  amount: number;
  isVoided?: boolean;
  isCashPriced?: boolean;
  cashSavings?: number;
  refundedAmount?: number;
  isReturned?: boolean;
};

/**
 * Mirror of `PricingBreakdownSheet.tsx:paidAmount` (post-refund-fix shape).
 *
 *   const paidAmount = payments
 *     ?.filter((p) => !p.isVoided || p.isReturned === true)
 *     .reduce((acc, p) => acc + Math.max(0, p.amount - (p.refundedAmount ?? 0)), 0) ?? 0;
 *
 * Refund subtraction is in the payment's own currency (matches refunded_amount
 * column). A refund-via-void (status='void' AND is_returned=true) participates
 * in the reduce so its refunded_amount cancels the original amount → $0 net.
 * A true cancellation (void without is_returned) is filtered out entirely.
 */
function paidAmount(payments: PaymentLike[] | undefined): number {
  return round2(
    payments
      ?.filter((p) => !p.isVoided || p.isReturned === true)
      .reduce(
        (acc, p) => acc + Math.max(0, p.amount - (p.refundedAmount ?? 0)),
        0,
      ) ?? 0,
  );
}

describe("PricingBreakdownSheet — Amount Paid reduction", () => {
  test("cash payment shows op.amount directly (no cashSavings subtraction)", () => {
    // S6-0010 Mocha case: op.amount = $7.82 cash terms; cashSavings = $3.21
    // (from original_amount $11.03 − amount $7.82). Pre-fix buggy answer
    // was $4.61; post-fix is $7.82.
    expect(
      paidAmount([
        { amount: 7.82, isCashPriced: true, cashSavings: 3.21, isVoided: false },
      ]),
    ).toBeCloseTo(7.82, 2);
  });

  test("card payment shows op.amount unchanged", () => {
    // Card payment: isCashPriced=false, no cashSavings. Both old and new
    // formulas return op.amount; this test pins the card path.
    expect(
      paidAmount([{ amount: 11.03, isCashPriced: false, isVoided: false }]),
    ).toBeCloseTo(11.03, 2);
  });

  test("mixed two-payment order sums cash and card amounts", () => {
    // One cash payment ($7.82) + one card payment ($11.03) → $18.85 total.
    expect(
      paidAmount([
        { amount: 7.82, isCashPriced: true, cashSavings: 3.21, isVoided: false },
        { amount: 11.03, isCashPriced: false, isVoided: false },
      ]),
    ).toBeCloseTo(18.85, 2);
  });

  test("voided payments are excluded from the sum", () => {
    expect(
      paidAmount([
        { amount: 7.82, isCashPriced: true, isVoided: false },
        { amount: 11.03, isCashPriced: false, isVoided: true },
      ]),
    ).toBeCloseTo(7.82, 2);
  });

  test("empty / undefined payments collapse to 0", () => {
    expect(paidAmount(undefined)).toBe(0);
    expect(paidAmount([])).toBe(0);
  });

  test("refunded cash payment + fresh repay = only fresh amount paid", () => {
    // 2026-05-30 repro: cash $7.75 refunded, then $7.75 paid again.
    // Order Breakdown was reading $15.50 ($7.75 + $7.75) and treating the
    // bill as overpaid. Correct: $7.75 (only the new payment net of refund).
    expect(
      paidAmount([
        {
          amount: 7.75,
          isCashPriced: true,
          cashSavings: 3.18,
          refundedAmount: 7.75,
        },
        {
          amount: 7.75,
          isCashPriced: true,
          cashSavings: 3.18,
          refundedAmount: 0,
        },
      ]),
    ).toBeCloseTo(7.75, 2);
  });

  test("partial refund subtracts the refunded portion only", () => {
    expect(
      paidAmount([{ amount: 10, refundedAmount: 4 }]),
    ).toBeCloseTo(6, 2);
  });

  test("refund-via-void (status='void', is_returned=true) contributes 0, not amount", () => {
    // Refund routes that take the void path leave is_voided=true AND set
    // refunded_amount = amount. Filter passes the row through (because
    // isReturned=true), then the per-row math zeros it out.
    expect(
      paidAmount([
        { amount: 7.75, isVoided: true, isReturned: true, refundedAmount: 7.75 },
        { amount: 5, refundedAmount: 0 },
      ]),
    ).toBeCloseTo(5, 2);
  });

  test("true void cancellation (no is_returned) still filtered out entirely", () => {
    // Old behavior preserved: voids that are NOT refunds drop out before reduce.
    expect(
      paidAmount([
        { amount: 7.75, isVoided: true, isReturned: false },
        { amount: 5 },
      ]),
    ).toBeCloseTo(5, 2);
  });
});
