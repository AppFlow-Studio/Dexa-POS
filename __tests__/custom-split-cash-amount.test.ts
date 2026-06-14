import { calculateCustomSplitCashAmount } from "@/utils/custom-split-amounts";

describe("custom split cash amount", () => {
  it("scales a card-entered amount to the cash-priced outstanding total", () => {
    expect(calculateCustomSplitCashAmount(25, 100, 96)).toBe(24);
  });

  it("rounds the cash amount to cents", () => {
    expect(calculateCustomSplitCashAmount(8.02, 24.06, 23.25)).toBe(7.75);
  });

  it("falls back to the entered amount when card outstanding is unavailable", () => {
    expect(calculateCustomSplitCashAmount(12.34, 0, 0)).toBe(12.34);
  });
});
