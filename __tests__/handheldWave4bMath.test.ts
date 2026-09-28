import type { CartItem, OrderProfilePayment } from "@/lib/types";
import { typeAmount } from "@/handheld/lib/amountInput";
import { changeDue, quickCashAmounts, stillOwed } from "@/handheld/lib/cash";
import { canAdjustTip, paymentTitle, refundable } from "@/handheld/lib/paymentRecords";
import { evenShares, groupBySeat, linesDue, openLines } from "@/handheld/lib/split";

const item = (over: Partial<CartItem>): CartItem =>
  ({ id: "i", name: "Item", quantity: 1, paidQuantity: 0, price: 10, subtotal: 10, customizations: {}, ...over }) as CartItem;

const payment = (over: Partial<OrderProfilePayment>): OrderProfilePayment =>
  ({
    id: "p",
    amount: 100,
    method: "Card",
    tip_amount: 20,
    total_collected: 120,
    itemsCovered: [],
    status: "captured",
    timestamp: "2026-09-28T20:14:00.000Z",
    isVoided: false,
    ...over,
  }) as OrderProfilePayment;

describe("evenShares", () => {
  it("adds back to the cent, leftover cents first", () => {
    expect(evenShares(100, 3)).toEqual([33.34, 33.33, 33.33]);
    expect(evenShares(189.66, 4)).toEqual([47.42, 47.42, 47.41, 47.41]);
  });
  it("is empty for nothing to split", () => {
    expect(evenShares(0, 3)).toEqual([]);
  });
});

describe("split lines", () => {
  const lines = openLines({
    items: [
      item({ id: "a", seatNumber: 2, price: 20, subtotal: 20 }),
      item({ id: "b", seatNumber: null }),
      item({ id: "c", seatNumber: 1, quantity: 2, paidQuantity: 1, subtotal: 20 }),
      item({ id: "d", seatNumber: 1, is_voided: true }),
      item({ id: "e", seatNumber: 3, paidQuantity: 1 }),
    ],
  } as never);

  it("keeps only unpaid, unvoided units", () => {
    expect(lines.map((l) => [l.item.id, l.quantity])).toEqual([
      ["a", 1],
      ["b", 1],
      ["c", 1],
    ]);
  });
  it("groups seats ascending with shared last", () => {
    expect(groupBySeat(lines).map((g) => g.seat)).toEqual([1, 2, null]);
  });
  it("prices a selection with tax", () => {
    expect(linesDue(lines, { standard: 10 })).toBe(44);
  });
});

describe("cash", () => {
  it("offers exact then round bills", () => {
    expect(quickCashAmounts(37.4)).toEqual([37.4, 40, 50, 100]);
    expect(quickCashAmounts(20)).toEqual([20, 50, 100]);
  });
  it("computes change and what is still owed", () => {
    expect(changeDue(37.4, 50)).toBe(12.6);
    expect(changeDue(37.4, 20)).toBe(0);
    expect(stillOwed(37.4, 20)).toBe(17.4);
  });
});

describe("payment records", () => {
  it("refunds what is left, nothing once voided", () => {
    expect(refundable(payment({ refundedAmount: 30 }))).toBe(90);
    expect(refundable(payment({ isVoided: true }))).toBe(0);
  });
  it("adjusts tips on untouched card payments only", () => {
    expect(canAdjustTip(payment({}))).toBe(true);
    expect(canAdjustTip(payment({ method: "Cash" }))).toBe(false);
    expect(canAdjustTip(payment({ refundedAmount: 5 }))).toBe(false);
  });
  it("names the card when it can", () => {
    expect(paymentTitle(payment({ cardBrand: "Visa", last4: "4412" }))).toBe("Visa ending 4412");
    expect(paymentTitle(payment({ method: "Cash" }))).toBe("Cash");
  });
});

describe("typeAmount", () => {
  it("allows one point and two decimals", () => {
    expect(["1", "2", ".", "5", "0", "9"].reduce((r, k) => typeAmount(r, k as never), "")).toBe("12.50");
  });
});
