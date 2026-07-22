import { isNothingLeftToCollect } from "@/lib/paymentGuards";

describe("isNothingLeftToCollect — penny-payment guard (regressed via 90f0ed1e)", () => {
  it("allows a $0.01 full card payment (amount = 0.01)", () =>
    expect(isNothingLeftToCollect(0.01, 0.01)).toBe(false));
  it("allows a $0.01 pay-full payment (amount = null)", () =>
    expect(isNothingLeftToCollect(0.01, null)).toBe(false));
  it("rejects sub-cent rounding dust (< $0.005 owed)", () => {
    expect(isNothingLeftToCollect(0.003, 0.003)).toBe(true);
    expect(isNothingLeftToCollect(0.004, null)).toBe(true);
  });
  it("rejects a fully-paid order (nothing owed)", () => {
    expect(isNothingLeftToCollect(0, 0)).toBe(true);
    expect(isNothingLeftToCollect(0, null)).toBe(true);
  });
  it("rejects a $0.01 balance the payment does not cover", () =>
    expect(isNothingLeftToCollect(0.01, 0)).toBe(true));
  it("does not apply to normal-sized balances (guard is <= $0.01 only)", () => {
    expect(isNothingLeftToCollect(50, 0.01)).toBe(false);
    expect(isNothingLeftToCollect(5, 5)).toBe(false);
  });
});
