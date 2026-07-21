/**
 * Refund accounting in calculatePaidStatus.
 *
 * Why this matters: order_payments.refunded_amount is stored in the payment's
 * own currency (cash for a cash-priced payment). For a fully-refunded cash
 * payment, naively subtracting the raw refunded amount from cardEquivalent
 * leaves the cashSavings residue counted as "paid" — the optimistic
 * paid_status flips to "Paid" even though the bill is back to fully owed.
 *
 * This caused the floor-plan tile to flash "Paid – Clear & Close" after a
 * single-cash-payment refund + new partial repay. Proportional refund
 * subtraction (cardEquiv × refunded/amount) zeros the contribution exactly
 * when refunded === amount.
 */

import { calculatePaidStatus } from "@/lib/order-calculator";

describe("calculatePaidStatus refund handling", () => {
  it("returns Partial when a cash payment is fully refunded and a second partial repay covers part of the bill", () => {
    // The exact 2026-05-30 trace: bill $21.52, cash payment $7.75
    // (cardEquivalent $10.93) refunded, then another $7.75 cash paid.
    const payments = [
      {
        amount: 7.75,
        isCashPriced: true,
        cashSavings: 3.18,
        refundedAmount: 7.75, // fully refunded
      },
      {
        amount: 7.75,
        isCashPriced: true,
        cashSavings: 3.18,
        refundedAmount: 0,
      },
    ];

    expect(calculatePaidStatus(payments, 21.52)).toBe("Partial");
  });

  it("returns Pending when the only payment is fully refunded", () => {
    const payments = [
      {
        amount: 7.75,
        isCashPriced: true,
        cashSavings: 3.18,
        refundedAmount: 7.75,
      },
    ];
    expect(calculatePaidStatus(payments, 21.52)).toBe("Pending");
  });

  it("returns Paid when the unrefunded payment alone covers the bill", () => {
    const payments = [
      { amount: 5, isCashPriced: false, refundedAmount: 5 }, // fully refunded card
      { amount: 21.52, isCashPriced: false, refundedAmount: 0 }, // covers bill
    ];
    expect(calculatePaidStatus(payments, 21.52)).toBe("Paid");
  });

  it("partial refund subtracts proportional card-equivalent (cash payment)", () => {
    // $10.93 card-equivalent payment, refund half ($3.875 of cash) →
    // contribution = $10.93 × (1 - 3.875/7.75) = $5.465. Bill of $5 → Paid.
    const payments = [
      {
        amount: 7.75,
        isCashPriced: true,
        cashSavings: 3.18,
        refundedAmount: 3.875,
      },
    ];
    expect(calculatePaidStatus(payments, 5)).toBe("Paid");
    expect(calculatePaidStatus(payments, 6)).toBe("Partial");
  });

  it("ignores refunded_amount on voided payments (already excluded)", () => {
    const payments = [
      {
        amount: 10,
        isVoided: true,
        refundedAmount: 10,
      },
      { amount: 5, refundedAmount: 0 },
    ];
    expect(calculatePaidStatus(payments, 5)).toBe("Paid");
  });

  it("handles missing refundedAmount as zero (no regression for legacy payments)", () => {
    const payments = [{ amount: 21.52 }];
    expect(calculatePaidStatus(payments, 21.52)).toBe("Paid");
  });
});
