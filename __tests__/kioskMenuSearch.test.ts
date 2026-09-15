import {
  buildKioskSearchEntry,
  foldSearchText,
  KIOSK_SEARCH_RESULT_LIMIT,
  searchKioskMenu,
  tokenizeSearchQuery,
  type KioskSearchEntry,
} from "@/components/kiosk/shared/kioskMenuSearch";
import type { MenuItemType } from "@/lib/types";

/**
 * Kiosk menu search: folding, token semantics and ranking.
 *
 * The ranking is what a customer standing at the panel actually experiences —
 * type three letters, expect the thing you wanted at the top — so the ordering
 * assertions here are the contract, not implementation detail.
 */

function item(name: string, extra: Partial<MenuItemType> = {}): MenuItemType {
  return {
    id: extra.id ?? name.toLowerCase().replace(/\s+/g, "-"),
    name,
    price: 9.99,
    meal: [],
    category: [],
    ...extra,
  };
}

function entry(
  name: string,
  categoryName = "Mains",
  extra: Partial<MenuItemType> = {},
): KioskSearchEntry {
  return buildKioskSearchEntry(
    item(name, extra),
    `menu-1:${categoryName.toLowerCase()}`,
    categoryName,
    "All Day",
  );
}

const names = (results: KioskSearchEntry[]) => results.map((r) => r.item.name);

describe("foldSearchText", () => {
  it("lower-cases and strips accents", () => {
    expect(foldSearchText("Café Jalapeño")).toBe("cafe jalapeno");
  });

  it("collapses punctuation to single spaces and trims", () => {
    expect(foldSearchText("  Mac & Cheese!! ")).toBe("mac cheese");
    expect(foldSearchText('12" Pizza')).toBe("12 pizza");
  });

  it("keeps digits, which menus use for sizes and counts", () => {
    expect(foldSearchText("6-Piece Wings")).toBe("6 piece wings");
  });
});

describe("tokenizeSearchQuery", () => {
  it("returns no tokens for blank or punctuation-only input", () => {
    expect(tokenizeSearchQuery("")).toEqual([]);
    expect(tokenizeSearchQuery("   ")).toEqual([]);
    expect(tokenizeSearchQuery("!!!")).toEqual([]);
  });

  it("splits on punctuation as well as whitespace", () => {
    expect(tokenizeSearchQuery("mac & cheese")).toEqual(["mac", "cheese"]);
  });
});

describe("searchKioskMenu", () => {
  const entries = [
    entry("Chicken Sandwich"),
    entry("Grilled Chicken Salad", "Salads"),
    entry("Chipotle Chicken Wrap"),
    entry("Cheeseburger", "Burgers", {
      description: "Beef patty with cheddar and pickles",
    }),
    entry("Iced Coffee", "Drinks"),
    entry("Café Latte", "Drinks"),
  ];

  it("returns nothing for an empty query — the box shows a hint, not the menu", () => {
    expect(searchKioskMenu(entries, "")).toEqual([]);
    expect(searchKioskMenu(entries, "   ")).toEqual([]);
  });

  it("ranks a name prefix above a name word above a description hit", () => {
    const results = names(searchKioskMenu(entries, "chicken"));
    expect(results[0]).toBe("Chicken Sandwich");
    expect(results).toEqual([
      "Chicken Sandwich",
      "Chipotle Chicken Wrap",
      "Grilled Chicken Salad",
    ]);
  });

  it("puts a whole-phrase name prefix above scattered word matches", () => {
    const scattered = [
      entry("Sandwich, Grilled Chicken"),
      entry("Chicken Sandwich"),
    ];
    expect(names(searchKioskMenu(scattered, "chicken sand"))[0]).toBe(
      "Chicken Sandwich",
    );
  });

  it("ANDs tokens, so typing more words narrows the list", () => {
    expect(names(searchKioskMenu(entries, "chicken"))).toHaveLength(3);
    expect(names(searchKioskMenu(entries, "chicken salad"))).toEqual([
      "Grilled Chicken Salad",
    ]);
  });

  it("matches the category name, so 'drinks' finds the drinks", () => {
    expect(names(searchKioskMenu(entries, "drinks")).sort()).toEqual([
      "Café Latte",
      "Iced Coffee",
    ]);
  });

  it("matches the description, ranked below any name match", () => {
    expect(names(searchKioskMenu(entries, "cheddar"))).toEqual([
      "Cheeseburger",
    ]);
  });

  it("finds accented items from unaccented typing, and the reverse", () => {
    expect(names(searchKioskMenu(entries, "cafe"))).toEqual(["Café Latte"]);
    expect(names(searchKioskMenu(entries, "café"))).toEqual(["Café Latte"]);
  });

  it("breaks ties on the shorter, more specific name", () => {
    const ties = [entry("Coffee Cake Slice"), entry("Coffee")];
    expect(names(searchKioskMenu(ties, "coffee"))).toEqual([
      "Coffee",
      "Coffee Cake Slice",
    ]);
  });

  it("returns a stable order across keystrokes of the same prefix", () => {
    const first = names(searchKioskMenu(entries, "chick"));
    const second = names(searchKioskMenu(entries, "chick"));
    expect(first).toEqual(second);
  });

  it("caps results so a one-letter query can't flood the panel", () => {
    const many = Array.from({ length: 60 }, (_, i) =>
      entry(`Combo ${i}`, "Mains", { id: `combo-${i}` }),
    );
    expect(searchKioskMenu(many, "combo")).toHaveLength(
      KIOSK_SEARCH_RESULT_LIMIT,
    );
    expect(searchKioskMenu(many, "combo", 5)).toHaveLength(5);
  });

  it("returns nothing when a token matches nothing, even if others do", () => {
    expect(searchKioskMenu(entries, "chicken zzz")).toEqual([]);
  });
});
