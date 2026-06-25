import { payableQuantity } from "@/lib/payableQuantity";

describe("payableQuantity (refund-aware unpaid count)", () => {
  it("unpaid item → full quantity", () => {
    expect(
      payableQuantity({ quantity: 2, paidQuantity: 0, refundedQuantity: 0 }),
    ).toBe(2);
  });

  it("fully paid, not refunded → 0", () => {
    expect(
      payableQuantity({ quantity: 1, paidQuantity: 1, refundedQuantity: 0 }),
    ).toBe(0);
  });

  it("refunded paid item → payable again (the Black Coffee bug)", () => {
    // qty 1, paid 1, refunded 1 → 1 unit is payable again
    expect(
      payableQuantity({ quantity: 1, paidQuantity: 1, refundedQuantity: 1 }),
    ).toBe(1);
  });

  it("re-paid after refund → 0", () => {
    // after re-pay the server sets paid=2 (refunded=1) → net unpaid 0
    expect(
      payableQuantity({ quantity: 1, paidQuantity: 2, refundedQuantity: 1 }),
    ).toBe(0);
  });

  it("partial paid + partial refund", () => {
    // qty 3, paid 2, refunded 1 → 3 - 2 + 1 = 2 payable
    expect(
      payableQuantity({ quantity: 3, paidQuantity: 2, refundedQuantity: 1 }),
    ).toBe(2);
  });

  it("treats null/undefined paid & refunded as 0", () => {
    expect(payableQuantity({ quantity: 2 })).toBe(2);
    expect(
      payableQuantity({ quantity: 2, paidQuantity: null, refundedQuantity: null }),
    ).toBe(2);
  });
});
