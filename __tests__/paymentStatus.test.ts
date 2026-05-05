import {
    derivePaymentRefundState,
    getCashPricedOrderTotal,
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
