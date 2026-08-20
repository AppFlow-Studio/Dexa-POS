import {
  kioskCardMetrics,
  kioskRowMetrics,
  shouldUseRowLayout,
} from "@/components/kiosk/shared/kioskCardMetrics";
import {
  hasOrderableItem,
  isItemOrderable,
} from "@/components/kiosk/shared/kioskItemAvailability";
import { selectableModifierGroups } from "@/components/kiosk/shared/useItemModifiers";
import { kioskRailWidth } from "@/components/kiosk/shared/kioskLayout";
import {
  BASELINE_HEIGHT_DP,
  BASELINE_WIDTH_DP,
  computeKioskUiScale,
  computeUiScale,
  KIOSK_MAX_UI_SCALE,
  KIOSK_MIN_UI_SCALE,
} from "@/lib/uiScale";

/**
 * The kiosk sizing chain: screen dp → kiosk UI scale → card width → card
 * typography. Every visible size in the kiosk flow hangs off these three pure
 * functions, so they're worth pinning down.
 */

describe("computeKioskUiScale", () => {
  it("does not shrink a large portrait kiosk below the tablet baseline", () => {
    // Regression: the old implementation compared the panel's 1080dp width
    // against the *landscape* baseline width (1333) and Math.min picked that
    // 0.81, so a 32" portrait kiosk rendered smaller type than a 10" tablet.
    const portraitKiosk = computeKioskUiScale(1080, 1920);
    const tablet = computeUiScale(BASELINE_WIDTH_DP, BASELINE_HEIGHT_DP);

    expect(portraitKiosk).toBeGreaterThan(tablet);
    expect(portraitKiosk).toBeGreaterThan(1.5);
  });

  it("gives the same panel the same scale in either orientation", () => {
    expect(computeKioskUiScale(1080, 1920)).toBeCloseTo(
      computeKioskUiScale(1920, 1080),
      5,
    );
  });

  it("scales up monotonically with panel size", () => {
    const scales = [
      computeKioskUiScale(800, 1280),
      computeKioskUiScale(1080, 1920),
      computeKioskUiScale(1440, 2560),
    ];
    expect(scales[0]).toBeLessThan(scales[1]);
    expect(scales[1]).toBeLessThan(scales[2]);
  });

  it("clamps to the kiosk range at both extremes", () => {
    expect(computeKioskUiScale(3840, 2160)).toBe(KIOSK_MAX_UI_SCALE);
    expect(computeKioskUiScale(320, 480)).toBe(KIOSK_MIN_UI_SCALE);
  });

  it("falls back to 1 for a missing width", () => {
    expect(computeKioskUiScale(0, 1920)).toBe(1);
  });

  it("leaves the POS scale untouched", () => {
    // The POS path is landscape-only and must keep its own (lower) ceiling.
    expect(computeUiScale(BASELINE_WIDTH_DP, BASELINE_HEIGHT_DP)).toBeCloseTo(
      1,
      5,
    );
  });
});

describe("kioskCardMetrics", () => {
  it("grows type with card width", () => {
    const narrow = kioskCardMetrics(160);
    const wide = kioskCardMetrics(340);

    expect(wide.nameSize).toBeGreaterThan(narrow.nameSize);
    expect(wide.priceSize).toBeGreaterThan(narrow.priceSize);
    expect(wide.imageHeight).toBeGreaterThan(narrow.imageHeight);
  });

  it("keeps type readable at the narrow end instead of shrinking it away", () => {
    const tiny = kioskCardMetrics(96);
    expect(tiny.nameSize).toBeGreaterThanOrEqual(15);
    expect(tiny.priceSize).toBeGreaterThanOrEqual(16);
  });

  it("drops the description rather than truncating it on narrow cards", () => {
    expect(kioskCardMetrics(150).showDescription).toBe(false);
    expect(kioskCardMetrics(150).descBlockHeight).toBe(0);
    expect(kioskCardMetrics(300).showDescription).toBe(true);
    expect(kioskCardMetrics(300).descBlockHeight).toBeGreaterThan(0);
  });

  it("caps type on very wide cards so a 2-column 4K grid is not a billboard", () => {
    const huge = kioskCardMetrics(1600);
    expect(huge.nameSize).toBeLessThanOrEqual(64);
    expect(huge.priceSize).toBeLessThanOrEqual(68);
  });

  it("does not cap before the kiosk UI scale does", () => {
    // Widest card the 3.0x scale ceiling can actually produce (a 4K panel,
    // 3 columns). Card type must still be tracking width here, or it would
    // stall while the surrounding scale-driven chrome kept growing.
    const at4k = kioskCardMetrics(440);
    expect(at4k.nameSize).toBeGreaterThan(42);
    expect(at4k.priceSize).toBeGreaterThan(46);
  });

  it("reserves a fixed name block so cards line up across rows", () => {
    const m = kioskCardMetrics(260);
    expect(m.nameBlockHeight).toBe(m.nameLineHeight * 2);
  });

  it("returns whole-pixel type sizes", () => {
    for (const w of [96, 137, 211, 349, 512]) {
      const m = kioskCardMetrics(w);
      expect(Number.isInteger(m.nameSize)).toBe(true);
      expect(Number.isInteger(m.descSize)).toBe(true);
      expect(Number.isInteger(m.priceSize)).toBe(true);
    }
  });
});

describe("kioskRailWidth", () => {
  it("gives width back to the grid as columns increase", () => {
    const two = parseFloat(kioskRailWidth(true, 2));
    const three = parseFloat(kioskRailWidth(true, 3));
    const four = parseFloat(kioskRailWidth(true, 4));

    expect(two).toBeGreaterThan(three);
    expect(three).toBeGreaterThan(four);
  });

  it("keeps the rail narrower in landscape than portrait", () => {
    expect(parseFloat(kioskRailWidth(false, 3))).toBeLessThan(
      parseFloat(kioskRailWidth(true, 3)),
    );
  });

  it("stays within sane bounds at every column count", () => {
    for (const vertical of [true, false]) {
      for (const cols of [2, 3, 4]) {
        const pct = parseFloat(kioskRailWidth(vertical, cols));
        expect(pct).toBeGreaterThanOrEqual(18);
        expect(pct).toBeLessThanOrEqual(36);
      }
    }
  });
});

describe("selectableModifierGroups", () => {
  const opt = (id: string, isAvailable?: boolean) => ({
    id,
    name: id,
    price: 0,
    isAvailable,
  });
  const group = (id: string, type: "required" | "optional", options: any[]) =>
    ({
      id,
      name: id,
      type,
      selectionType: "single",
      options,
    }) as any;

  it("hides unavailable options instead of showing them greyed out", () => {
    const [g] = selectableModifierGroups([
      group("size", "optional", [
        opt("small"),
        opt("medium", false),
        opt("large", true),
      ]),
    ]);
    expect(g.options.map((o) => o.id)).toEqual(["small", "large"]);
  });

  it("drops a required group whose options are all unavailable", () => {
    // Regression: this was a dead end — nothing tappable, so the group stayed
    // in missingRequired, canAdd never became true, and the item could not be
    // ordered at all.
    const result = selectableModifierGroups([
      group("bun", "required", [opt("brioche", false), opt("sesame", false)]),
      group("sauce", "optional", [opt("ketchup")]),
    ]);
    expect(result.map((g) => g.id)).toEqual(["sauce"]);
  });

  it("keeps a required group that still has one available option", () => {
    const result = selectableModifierGroups([
      group("bun", "required", [opt("brioche", false), opt("sesame")]),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].options.map((o) => o.id)).toEqual(["sesame"]);
  });

  it("treats a missing isAvailable flag as available", () => {
    const [g] = selectableModifierGroups([
      group("extras", "optional", [opt("bacon")]),
    ]);
    expect(g.options).toHaveLength(1);
  });

  it("does not mutate the groups it was given", () => {
    const input = [group("size", "optional", [opt("s"), opt("m", false)])];
    selectableModifierGroups(input);
    expect(input[0].options).toHaveLength(2);
  });
});

describe("isItemOrderable", () => {
  const opt = (id: string, isAvailable?: boolean) => ({
    id,
    name: id,
    price: 0,
    isAvailable,
  });
  const grp = (id: string, type: "required" | "optional", options: any[]) =>
    ({ id, name: id, type, selectionType: "single", options }) as any;
  const item = (over: Partial<any> = {}) =>
    ({ id: "burger", name: "Burger", price: 5, ...over }) as any;

  /** Stand-in for useMenuStore.getModifierGroupsByIds. */
  const resolver = (groups: any[]) => (ids: string[]) =>
    groups.filter((g) => ids.includes(g.id));

  it("hides an item whose required group has no available options", () => {
    // A burger whose every bun is 86'd cannot be built. Without this it
    // reached the detail screen and — before the group-skip fix — became an
    // unorderable dead end there.
    const groups = [
      grp("bun", "required", [opt("brioche", false), opt("sesame", false)]),
    ];
    expect(
      isItemOrderable(item({ modifierGroupIds: ["bun"] }), resolver(groups)),
    ).toBe(false);
  });

  it("keeps an item whose required group still has one option", () => {
    const groups = [
      grp("bun", "required", [opt("brioche", false), opt("sesame")]),
    ];
    expect(
      isItemOrderable(item({ modifierGroupIds: ["bun"] }), resolver(groups)),
    ).toBe(true);
  });

  it("ignores a fully-unavailable OPTIONAL group", () => {
    // Optional extras being out doesn't stop the item being made.
    const groups = [grp("extras", "optional", [opt("bacon", false)])];
    expect(
      isItemOrderable(item({ modifierGroupIds: ["extras"] }), resolver(groups)),
    ).toBe(true);
  });

  it("still respects the item's own 86 flag", () => {
    expect(isItemOrderable(item({ availability: false }), resolver([]))).toBe(
      false,
    );
  });

  it("fails open when groups cannot be resolved", () => {
    // Menu still hydrating: never hide a sellable item over a loading gap.
    expect(
      isItemOrderable(item({ modifierGroupIds: ["bun"] }), resolver([])),
    ).toBe(true);
  });

  it("treats an item with no modifier groups as orderable", () => {
    expect(isItemOrderable(item(), resolver([]))).toBe(true);
  });

  it("hasOrderableItem drops a category with nothing left to sell", () => {
    const groups = [grp("bun", "required", [opt("brioche", false)])];
    const items = [
      item({ id: "a", modifierGroupIds: ["bun"] }),
      item({ id: "b", availability: false }),
    ];
    expect(hasOrderableItem(items, resolver(groups))).toBe(false);
    expect(hasOrderableItem([...items, item({ id: "c" })], resolver(groups))).toBe(
      true,
    );
  });
});

describe("card layout responds to the grid's height, not just its width", () => {
  // A landscape kiosk grid: wide viewport, short height budget per card.
  const LANDSCAPE_BUDGET = 443;
  // A portrait kiosk grid: height is abundant.
  const PORTRAIT_BUDGET = 879;

  it("caps the image so a wide landscape cell cannot fill the viewport", () => {
    // Regression: at 2 columns on 1920x1080 the width-derived image was 485px
    // tall, making one row 863px of an 874px viewport — 1.01 rows visible.
    const capped = kioskCardMetrics(673, LANDSCAPE_BUDGET);
    const uncapped = kioskCardMetrics(673);

    expect(uncapped.imageHeight).toBeGreaterThan(400);
    expect(capped.imageHeight).toBeLessThan(uncapped.imageHeight);
    expect(capped.imageHeight).toBeLessThanOrEqual(LANDSCAPE_BUDGET * 0.56 + 1);
  });

  it("leaves portrait untouched — the cap only bites when height is scarce", () => {
    for (const w of [319, 218, 167]) {
      expect(kioskCardMetrics(w, PORTRAIT_BUDGET)).toEqual(
        kioskCardMetrics(w),
      );
    }
  });

  it("keeps type consistent across column counts in landscape", () => {
    // Changing columns should reflow the grid, not rescale the whole design.
    const three = kioskCardMetrics(463, LANDSCAPE_BUDGET);
    const four = kioskCardMetrics(359, LANDSCAPE_BUDGET);
    expect(three.nameSize).toBe(four.nameSize);
  });

  it("still shows the description on a wide-but-short card", () => {
    // Horizontal affordances key off real width, not the height-bounded basis.
    const m = kioskCardMetrics(673, LANDSCAPE_BUDGET);
    expect(m.showDescription).toBe(true);
    expect(m.descLines).toBe(2);
    expect(m.showOptionsLabel).toBe(true);
  });
});

describe("shouldUseRowLayout", () => {
  it("switches to a row card only when the cell is much wider than tall", () => {
    expect(shouldUseRowLayout(673, 443)).toBe(true); // 2-col landscape
    expect(shouldUseRowLayout(463, 443)).toBe(false); // 3-col landscape
    expect(shouldUseRowLayout(218, 879)).toBe(false); // 3-col portrait
  });

  it("stays on the grid card when there is no height budget yet", () => {
    expect(shouldUseRowLayout(673, 0)).toBe(false);
    expect(shouldUseRowLayout(673, undefined)).toBe(false);
  });

  it("gives the row card a square image and a usable copy column", () => {
    const m = kioskRowMetrics(673, 443);
    expect(m.imageSize).toBeLessThanOrEqual(443 * 0.8);
    expect(m.showDescription).toBe(true);
    expect(m.nameSize).toBeGreaterThanOrEqual(16);
    // The whole row must fit well inside the budget it was given.
    expect(m.imageSize + m.pad * 2).toBeLessThan(443);
  });
});
