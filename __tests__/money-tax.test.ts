/// <reference types="jest" />
/**
 * Tests for utils/money tax helpers introduced with the v6 aggregate-tax fix:
 *  - formatTaxRate: display the true rate (8.875%), not the truncated 8.88%.
 *  - aggregateTaxByCategory: round tax once per rate group, not per item.
 */

import { aggregateTaxByCategory, formatTaxRate } from "@/utils/money";

const taxRatesMap = { standard: 8.875, alcohol: 12.0, exempt: 0 };

describe("formatTaxRate", () => {
  it("preserves 3-decimal rate instead of truncating to 2", () => {
    // The reported bug: .toFixed(2) rendered "8.88"; must be "8.875".
    expect(formatTaxRate(8.875)).toBe("8.875");
  });

  it("trims trailing zeros", () => {
    expect(formatTaxRate(8.88)).toBe("8.88");
    expect(formatTaxRate(8.1)).toBe("8.1");
    expect(formatTaxRate(8)).toBe("8");
    expect(formatTaxRate(12.0)).toBe("12");
  });

  it("caps at 4 decimals", () => {
    expect(formatTaxRate(8.88755)).toBe("8.8876"); // ROUND_HALF_UP at 4dp
  });
});

describe("aggregateTaxByCategory", () => {
  it("rounds once on the aggregate, not per item (aggregate higher)", () => {
    // 3 lines @ 2.28: per-item ROUND(2.28*8.875%)=0.20 each -> 0.60 (old bug);
    // aggregate ROUND(6.84*8.875%)=0.61.
    const lines = [
      { netSubtotal: 2.28, taxCategory: "standard" },
      { netSubtotal: 2.28, taxCategory: "standard" },
      { netSubtotal: 2.28, taxCategory: "standard" },
    ];
    expect(aggregateTaxByCategory(lines, taxRatesMap)).toBe(0.61);
  });

  it("groups by rate and rounds each group once", () => {
    const lines = [
      { netSubtotal: 2.28, taxCategory: "standard" },
      { netSubtotal: 2.28, taxCategory: "standard" },
      { netSubtotal: 2.28, taxCategory: "standard" },
      { netSubtotal: 7.77, taxCategory: "alcohol" },
      { netSubtotal: 7.77, taxCategory: "alcohol" },
    ];
    // 0.61 (standard) + ROUND(15.54*12%)=1.86 (alcohol)
    expect(aggregateTaxByCategory(lines, taxRatesMap)).toBe(2.47);
  });

  it("excludes exempt and zero-rate lines", () => {
    const lines = [
      { netSubtotal: 2.28, taxCategory: "standard" },
      { netSubtotal: 2.28, taxCategory: "standard" },
      { netSubtotal: 2.28, taxCategory: "standard" },
      { netSubtotal: 100, taxCategory: "standard", isTaxExempt: true },
      { netSubtotal: 100, taxCategory: "exempt" },
    ];
    expect(aggregateTaxByCategory(lines, taxRatesMap)).toBe(0.61);
  });

  it("defaults missing category to standard", () => {
    const lines = [{ netSubtotal: 6.84 }];
    expect(aggregateTaxByCategory(lines, taxRatesMap)).toBe(0.61);
  });

  it("returns 0 for an empty set", () => {
    expect(aggregateTaxByCategory([], taxRatesMap)).toBe(0);
  });
});
