import {
    derivePaymentRefundState,
    derivePreviousOrderPaymentStatus,
    getCashPricedOrderTotal,
    hasCollectedPayment,
} from "@/lib/paymentStatus";
import type { OrderProfile, OrderProfilePayment } from "@/lib/types";

const cashPayment = (overrides: Partial<OrderProfilePayment> = {}) =>
  ({
    id: "payment-1",
    amount: 17.42,
    method: "Cash",
    tip_amount: 0,
    total_collected: 17.42,
    isCashPriced: true,
    itemsCovered: [],
    status: "captured",
    timestamp: "2026-05-05T00:00:00.000Z",
    isVoided: false,
    ...overrides,
  }) as OrderProfilePayment;

describe("paymentStatus refund helpers", () => {
  it("treats a cash-priced payment as fully refunded when refunded amount equals the cash charge", () => {
    const state = derivePaymentRefundState([
      cashPayment({ amount: 17.42, refundedAmount: 17.42 }),
    ]);

    expect(state.totalRefunded).toBe(17.42);
    expect(state.isFullyRefunded).toBe(true);
    expect(state.isPartiallyRefunded).toBe(false);
  });

  it("uses cash item totals instead of card totals for cash-priced previous orders", () => {
    const order = {
      items: [
        {
          id: "item-1",
          quantity: 1,
          price: 6.25,
          cashPrice: 6,
          subtotal: 6.25,
          cashSubtotal: 6,
          taxAmount: 0.55,
          cashTaxAmount: 0.53,
        },
        {
          id: "item-2",
          quantity: 1,
          price: 10.4,
          cashPrice: 9.75,
          subtotal: 10.4,
          cashSubtotal: 9.75,
          taxAmount: 0.92,
          cashTaxAmount: 0.86,
        },
      ],
      payments: [cashPayment({ amount: 17.14, refundedAmount: 17.14 })],
      total_cash_amount: undefined,
    } as Pick<OrderProfile, "items" | "payments" | "total_cash_amount">;

    expect(getCashPricedOrderTotal(order)).toBeCloseTo(17.14);
  });
});

describe("derivePreviousOrderPaymentStatus", () => {
  const order = (overrides: Partial<OrderProfile> = {}) =>
    ({
      id: "order-1",
      paid_status: "Paid",
      amount_paid: 25,
      amount_due: 0,
      cash_amount_due: 0,
      total_amount: 25,
      payments: [],
      ...overrides,
    }) as OrderProfile;

  it("maps a full refund (paid_status='refunded') to Refunded, never Unpaid/Awaiting Payment", () => {
    // Regression: the server sets paid_status='refunded' for full refunds, but
    // the Previous Orders mapping used to drop that case and fall through to
    // "Unpaid", so refunded rows rendered as "Awaiting Payment".
    expect(
      derivePreviousOrderPaymentStatus(order({ paid_status: "Refunded" })),
    ).toBe("Refunded");
  });

  it("keeps paid orders Paid and unpaid orders Unpaid", () => {
    expect(
      derivePreviousOrderPaymentStatus(order({ paid_status: "Paid" })),
    ).toBe("Paid");
    expect(
      derivePreviousOrderPaymentStatus(
        order({ paid_status: "Unpaid", amount_paid: 0, amount_due: 25 }),
      ),
    ).toBe("Unpaid");
  });

  it("maps a partial balance to In Progress", () => {
    expect(
      derivePreviousOrderPaymentStatus(
        order({ paid_status: "Partial", amount_paid: 10, amount_due: 15 }),
      ),
    ).toBe("In Progress");
  });
});

describe("hasCollectedPayment", () => {
  it("is false for an unpaid order with no payments", () => {
    expect(hasCollectedPayment([])).toBe(false);
    expect(hasCollectedPayment(undefined)).toBe(false);
  });

  it("is true when at least one captured payment holds money", () => {
    expect(
      hasCollectedPayment([
        cashPayment({ amount: 25, status: "captured", isVoided: false }),
      ]),
    ).toBe(true);
  });

  it("is false for voided, authorized, pending, and pre-auth payments only", () => {
    expect(hasCollectedPayment([cashPayment({ status: "voided" })])).toBe(
      false,
    );
    expect(hasCollectedPayment([cashPayment({ status: "authorized" })])).toBe(
      false,
    );
    expect(hasCollectedPayment([cashPayment({ status: "pending" })])).toBe(
      false,
    );
    expect(
      hasCollectedPayment([
        cashPayment({ status: "captured", isPreAuth: true }),
      ]),
    ).toBe(false);
  });

  it("is false for a captured payment with zero amount", () => {
    expect(
      hasCollectedPayment([cashPayment({ status: "captured", amount: 0 })]),
    ).toBe(false);
  });
});
