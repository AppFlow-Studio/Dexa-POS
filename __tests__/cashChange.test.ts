import { computeChangeBreakdown } from "@/lib/cashChange";

describe("computeChangeBreakdown", () => {
  it("returns [] for zero, negative, and non-finite input", () => {
    expect(computeChangeBreakdown(0)).toEqual([]);
    expect(computeChangeBreakdown(-5)).toEqual([]);
    expect(computeChangeBreakdown(NaN)).toEqual([]);
    expect(computeChangeBreakdown(Infinity)).toEqual([]);
  });

  it("breaks $8.00 into 1×$5 and 3×$1", () => {
    expect(computeChangeBreakdown(8)).toEqual([
      { label: "$5", count: 1 },
      { label: "$1", count: 3 },
    ]);
  });

  it("handles coins without float drift ($0.99)", () => {
    // 99¢ = 3×25 + 2×10 + 4×1
    expect(computeChangeBreakdown(0.99)).toEqual([
      { label: "25¢", count: 3 },
      { label: "10¢", count: 2 },
      { label: "1¢", count: 4 },
    ]);
  });

  it("greedily uses the largest denominations first ($137.41)", () => {
    expect(computeChangeBreakdown(137.41)).toEqual([
      { label: "$100", count: 1 },
      { label: "$20", count: 1 },
      { label: "$10", count: 1 },
      { label: "$5", count: 1 },
      { label: "$1", count: 2 },
      { label: "25¢", count: 1 },
      { label: "10¢", count: 1 },
      { label: "5¢", count: 1 },
      { label: "1¢", count: 1 },
    ]);
  });

  it("never emits zero-count denominations ($20.00)", () => {
    const result = computeChangeBreakdown(20);
    expect(result).toEqual([{ label: "$20", count: 1 }]);
    expect(result.every((d) => d.count > 0)).toBe(true);
  });
});
