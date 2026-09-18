/**
 * The one place a progress fraction becomes a number on screen.
 *
 * Trivial arithmetic, but it is shared by two surfaces and the failure modes
 * are all "the bar looks broken": a null denominator rendered as 0%, a stale
 * over-count rendered as 112%, or two screens disagreeing about 99 vs 100.
 */
import {
  syncProgressPercent,
  type LocalDbSyncProgress,
} from "@/stores/useLocalDbSyncStore";

const p = (received: number, total: number | null): LocalDbSyncProgress => ({
  entity: "orders",
  received,
  total,
});

describe("syncProgressPercent", () => {
  it("rounds to a whole percent", () => {
    expect(syncProgressPercent(p(1, 3))).toBe(33);
    expect(syncProgressPercent(p(2, 3))).toBe(67);
    expect(syncProgressPercent(p(4000, 4000))).toBe(100);
  });

  /**
   * Null means "we could not count", which the banner renders as an
   * indeterminate sweep. Returning 0 here would render a bar that looks stuck
   * at the start for the whole sync — strictly worse than admitting we don't
   * know.
   */
  it("returns null when there is nothing honest to show", () => {
    expect(syncProgressPercent(null)).toBeNull();
    expect(syncProgressPercent(p(0, null))).toBeNull();
    expect(syncProgressPercent(p(0, 0))).toBeNull();
    expect(syncProgressPercent(p(5, -1))).toBeNull();
  });

  it("clamps, so a stale denominator cannot render 112%", () => {
    expect(syncProgressPercent(p(112, 100))).toBe(100);
    expect(syncProgressPercent(p(-5, 100))).toBe(0);
  });
});
