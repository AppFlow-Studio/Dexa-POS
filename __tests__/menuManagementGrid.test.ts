import {
  ITEM_GRID_MIN_CARD_WIDTH,
  buildItemGridRows,
  computeItemGridMetrics,
} from "@/lib/menu/menuManagementGrid";

const scaleBy = (k: number) => (n: number) => Math.round(n * k);

// Grid widths the Items tab actually gets: 8" Landi-class tablets up to 15"
// panels, across the UI-scale range (0.6-1.25, times the user's size setting).
const WIDTHS = [520, 700, 900, 1100, 1300, 1600, 1900];
const SCALES = [0.6, 0.85, 1, 1.1, 1.25, 1.5];

describe("computeItemGridMetrics", () => {
  it("never overflows the grid and never shrinks a card below the minimum", () => {
    for (const width of WIDTHS) {
      for (const k of SCALES) {
        const s = scaleBy(k);
        const m = computeItemGridMetrics(width, s);
        const used = m.columns * m.cardWidth + (m.columns - 1) * m.gap;
        expect(used).toBeLessThanOrEqual(width);
        if (m.columns > 1) {
          expect(m.cardWidth).toBeGreaterThanOrEqual(s(ITEM_GRID_MIN_CARD_WIDTH));
        }
        // No more than one card's worth of width left unused.
        expect(width - used).toBeLessThan(m.columns * (m.cardWidth + m.gap));
      }
    }
  });

  it("adds columns as the grid widens instead of stretching one card", () => {
    const s = scaleBy(1);
    const columns = WIDTHS.map((w) => computeItemGridMetrics(w, s).columns);
    for (let i = 1; i < columns.length; i += 1) {
      expect(columns[i]).toBeGreaterThanOrEqual(columns[i - 1]);
    }
    expect(columns[columns.length - 1]).toBeGreaterThan(columns[0]);
  });

  it("caps the image so a wide card can't become a billboard", () => {
    const s = scaleBy(1);
    // A single column on a very wide grid is the worst case.
    const m = computeItemGridMetrics(ITEM_GRID_MIN_CARD_WIDTH * 2 - 1, s);
    expect(m.columns).toBe(1);
    expect(m.imageHeight).toBeLessThanOrEqual(s(140));
  });

  it("gives FlashList a row height that is exactly the rendered card plus gap", () => {
    // The card renders at cardHeight, built from these same parts: if a row is
    // added to the card and not here, FlashList's layout drifts from the view.
    for (const k of SCALES) {
      const m = computeItemGridMetrics(1200, scaleBy(k));
      const b = m.body;
      const body =
        b.paddingTop +
        b.nameLineHeight * b.nameLines +
        b.nameToPrice +
        b.priceHeight +
        b.priceToActions +
        b.actionsHeight +
        b.paddingBottom;
      expect(m.cardHeight).toBe(m.imageHeight + body + 2);
      expect(m.rowHeight).toBe(m.cardHeight + m.gap);
    }
  });

  it("uses the whole width for a single column narrower than the minimum", () => {
    const s = scaleBy(1);
    const m = computeItemGridMetrics(150, s);
    expect(m.columns).toBe(1);
    expect(m.cardWidth).toBe(150);
  });
});

describe("buildItemGridRows", () => {
  const item = (id: string, name: string) => ({ id, name });

  it("chunks items into rows of the column count, keeping order", () => {
    const items = ["a", "b", "c", "d", "e"].map((n) => item(n, n));
    const rows = buildItemGridRows(items, 2, false);
    expect(rows.map((r) => (r.type === "cards" ? r.items.map((i) => i.id) : r.letter))).toEqual([
      ["a", "b"],
      ["c", "d"],
      ["e"],
    ]);
  });

  it("groups under letter headers, with non-letters last under #", () => {
    const items = [
      item("1", "apple"),
      item("2", "Avocado"),
      item("3", "7 Up"),
      item("4", "banana"),
    ];
    const rows = buildItemGridRows(items, 4, true);
    expect(
      rows.map((r) => (r.type === "header" ? r.letter : r.items.map((i) => i.id).join(","))),
    ).toEqual(["A", "1,2", "B", "4", "#", "3"]);
  });

  it("gives every row a unique key", () => {
    const items = Array.from({ length: 40 }, (_, i) => item(`id${i}`, `Item ${i}`));
    const rows = buildItemGridRows(items, 3, true);
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
  });
});
