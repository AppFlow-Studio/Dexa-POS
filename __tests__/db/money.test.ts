/**
 * Phase 1 acceptance — money conversion.
 *
 * This is the one place in the local DB layer where currency changes
 * representation, so it is the one place a rounding bug could enter. The
 * project rule is decimal.js and never floats; these assert that the
 * INTEGER-minor-units promotion honours it.
 */
import Decimal from "decimal.js";

import { fromMinor, MINOR_UNITS_PER_MAJOR, sumMinor, toMinor } from "@/lib/db/money";

describe("toMinor", () => {
  it("converts ordinary amounts exactly", () => {
    expect(toMinor(12.34)).toBe(1234);
    expect(toMinor(0)).toBe(0);
    expect(toMinor(100)).toBe(10000);
    expect(toMinor("12.34")).toBe(1234);
  });

  /**
   * The reason this module exists. 0.1 + 0.2 !== 0.3 in IEEE-754, and
   * 19.99 * 100 === 1998.9999999999998 — which truncates to 1998, losing a
   * cent per row. Multiplied across a shift's SUM(), that is real money.
   */
  it("does not lose a cent to floating point", () => {
    expect(toMinor(19.99)).toBe(1999);
    expect(19.99 * 100).not.toBe(1999); // the naive version is wrong
    expect(toMinor(1.005)).toBe(101); // half-up, not banker's rounding
    expect(toMinor(8.475)).toBe(848);
  });

  it("keeps null distinct from zero", () => {
    // On a payments row these mean different things: "no tip recorded" is not
    // "a tip of zero". Collapsing them would misreport tips.
    expect(toMinor(null)).toBeNull();
    expect(toMinor(undefined)).toBeNull();
    expect(toMinor("")).toBeNull();
    expect(toMinor(0)).toBe(0);
  });

  it("handles negative amounts (refunds, discounts)", () => {
    expect(toMinor(-12.34)).toBe(-1234);
    expect(toMinor("-0.01")).toBe(-1);
  });

  it("nulls a malformed value instead of throwing", () => {
    // A bad numeric from the server must not take down an entire sync batch —
    // the row still lands, with payload intact, and the aggregate column empty.
    expect(toMinor("not-a-number")).toBeNull();
    expect(toMinor(Number.NaN)).toBeNull();
    expect(toMinor(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("survives amounts far beyond any real check total", () => {
    expect(toMinor(999999.99)).toBe(99999999);
  });
});

describe("fromMinor", () => {
  it("returns a Decimal, never a number", () => {
    const value = fromMinor(1234);
    expect(value).toBeInstanceOf(Decimal);
    expect(value!.toString()).toBe("12.34");
  });

  it("round-trips exactly", () => {
    for (const amount of ["0.01", "12.34", "19.99", "1.005", "999999.99"]) {
      const minor = toMinor(amount)!;
      const back = fromMinor(minor)!;
      // 1.005 rounds to 101 minor units on the way in, so compare against the
      // rounded value rather than the input — the point is that no FURTHER
      // drift happens on the way back.
      expect(back.times(MINOR_UNITS_PER_MAJOR).toNumber()).toBe(minor);
    }
  });

  it("passes null through", () => {
    expect(fromMinor(null)).toBeNull();
    expect(fromMinor(undefined)).toBeNull();
  });
});

describe("sumMinor", () => {
  it("adds exactly, where floats would drift", () => {
    const amounts = ["0.1", "0.2", "0.3"].map((a) => toMinor(a)!);
    expect(sumMinor(amounts)).toBe(60);
    expect(fromMinor(sumMinor(amounts))!.toString()).toBe("0.6");
    // The float version famously is not 0.6.
    expect(0.1 + 0.2 + 0.3).not.toBe(0.6);
  });

  it("skips nulls rather than coercing them to zero-and-counting", () => {
    expect(sumMinor([100, null, 200, undefined])).toBe(300);
  });

  it("is zero for an empty set", () => {
    expect(sumMinor([])).toBe(0);
  });

  it("stays exact across a shift-sized batch", () => {
    // 5,000 orders at 19.99 — the case where a per-row cent of drift would
    // show up as a visible discrepancy on the end-of-day report.
    const rows = Array.from({ length: 5000 }, () => toMinor(19.99)!);
    expect(sumMinor(rows)).toBe(5000 * 1999);
    expect(fromMinor(sumMinor(rows))!.toString()).toBe("99950");
  });
});
