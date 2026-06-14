/**
 * Wave R-SC: assert that the per-payment item refund amount includes the
 * prorated service-charge slice. process_payment_v14 bakes the SC into
 * op.amount; the per-item rows (order_payment_items.subtotal_paid /
 * tax_paid) carry only the items+tax slice. Without prorating the SC,
 * apply_refund_to_payment_v4's proportional reversal under-collects on
 * every item refund where SC was present.
 *
 * The helper under test mirrors apply_refund_to_payment_v4_sc_reversal.sql's
 * `v_delta_sc = SC × refund_amount / op.amount` formula in inverse: given
 * the items+tax slice, derive the SC slice that must be added so the server
 * reverses the correct portion of SC.
 */

import { computeItemRefundAmount } from "@/lib/refundScShare";

describe("computeItemRefundAmount — Wave R-SC", () => {
  it("single item, single payment, SC present → refund = op.amount", () => {
    // Payment: items $10.00 + tax $0.80 + SC $1.00 = $11.80.
    // Refund the entire item slice ($10.80 items+tax).
    const result = computeItemRefundAmount(
      { amount: 11.8, serviceCharge: 1.0 },
      10.8,
    );
    // SC snaps to full when items_total covers all items+tax. Refund = op.amount.
    expect(result.scShare).toBe(1.0);
    expect(result.amount).toBe(11.8);
  });

  it("half-items refund → SC prorated 50/50", () => {
    // Payment: items $20.00 + tax $1.60 + SC $2.00 = $23.60. Two units.
    // Refund one unit: items+tax = $10.80.
    const result = computeItemRefundAmount(
      { amount: 23.6, serviceCharge: 2.0 },
      10.8,
    );
    // scShare = 2.00 × 10.80 / 21.60 = 1.00. Refund = 10.80 + 1.00 = 11.80.
    expect(result.scShare).toBe(1.0);
    expect(result.amount).toBe(11.8);
  });

  it("pre-v13 payment (no SC) → no change to items+tax", () => {
    // Legacy: op.service_charge defaults to 0. Refund must not be inflated.
    const result = computeItemRefundAmount(
      { amount: 10.8, serviceCharge: 0 },
      10.8,
    );
    expect(result.scShare).toBe(0);
    expect(result.amount).toBe(10.8);
  });

  it("third-of-items refund → SC prorated 33.3%", () => {
    // 3 units, items+tax = $32.40, SC = $5.40. Refund 1 unit = $10.80 items+tax.
    const result = computeItemRefundAmount(
      { amount: 37.8, serviceCharge: 5.4 },
      10.8,
    );
    // scShare = 5.40 × 10.80 / 32.40 = 1.80. Refund = 10.80 + 1.80 = 12.60.
    expect(result.scShare).toBe(1.8);
    expect(result.amount).toBe(12.6);
  });

  it("snap fires within 1¢ of full items+tax (rounding insurance)", () => {
    // items+tax = $21.60 but client passes $21.599 due to rounding upstream.
    // The 0.001 snap tolerance picks this up as a full-items refund.
    const result = computeItemRefundAmount(
      { amount: 23.6, serviceCharge: 2.0 },
      21.599,
    );
    expect(result.scShare).toBe(2.0); // full snap
    expect(result.amount).toBeCloseTo(23.6, 2);
  });

  it("degenerate payment with zero items+tax (SC only) → no refund", () => {
    // Pathological: a payment row where op.amount === op.serviceCharge (no items).
    // Division by zero guard returns scShare = 0.
    const result = computeItemRefundAmount(
      { amount: 5.0, serviceCharge: 5.0 },
      0,
    );
    expect(result.scShare).toBe(0);
    expect(result.amount).toBe(0);
  });

  it("invariant: SUM of successive partial refunds === op.amount", () => {
    const payment = { amount: 23.6, serviceCharge: 2.0 };
    // Refund 1 of 2 units, then refund the second unit.
    const first = computeItemRefundAmount(payment, 10.8);
    // Server LEAST-clamps service_charge_refunded against payment.service_charge.
    // On the second refund the client passes the REMAINING items+tax slice.
    const second = computeItemRefundAmount(payment, 10.8);
    expect(first.amount + second.amount).toBeCloseTo(payment.amount, 2);
  });

  it("multi-payment split: each payment prorates its own SC independently", () => {
    // Order paid by two terminals. Each payment has its own SC slice.
    const cardPayment = { amount: 11.8, serviceCharge: 1.0 }; // 1 item
    const cashPayment = { amount: 11.8, serviceCharge: 1.0 }; // 1 item

    const refundFromCard = computeItemRefundAmount(cardPayment, 10.8);
    const refundFromCash = computeItemRefundAmount(cashPayment, 10.8);

    // Each payment refunds its own SC share. Sum across both = full order SC.
    expect(refundFromCard.scShare + refundFromCash.scShare).toBeCloseTo(2.0, 2);
    expect(refundFromCard.amount).toBe(11.8);
    expect(refundFromCash.amount).toBe(11.8);
  });
});
