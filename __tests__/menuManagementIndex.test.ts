import {
  applyOrder,
  buildCategoryItemIndex,
} from "@/lib/menu/menuManagementIndex";
import type { MenuItemType } from "@/lib/types";

const item = (id: string, extra: Partial<MenuItemType> = {}): MenuItemType =>
  ({ id, name: id, price: 1, meal: [], category: [], ...extra }) as MenuItemType;

describe("applyOrder", () => {
  const list = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];

  it("follows the given ids", () => {
    expect(applyOrder(list, ["c", "a", "d", "b"]).map((e) => e.id)).toEqual([
      "c",
      "a",
      "d",
      "b",
    ]);
  });

  it("keeps entries the ids don't mention, in their original order, at the end", () => {
    // A reorder list built before a sync added a menu must not drop that menu.
    expect(applyOrder(list, ["d", "b"]).map((e) => e.id)).toEqual(["d", "b", "a", "c"]);
  });

  it("ignores unknown and duplicate ids", () => {
    expect(applyOrder(list, ["x", "b", "b", "a"]).map((e) => e.id)).toEqual([
      "b",
      "a",
      "c",
      "d",
    ]);
  });
});

describe("buildCategoryItemIndex", () => {
  it("orders items by the menu tree but returns the live item objects", () => {
    // Tree copies lag behind availability/86 toggles, which update menuItems.
    const liveB = item("b", { availability: false });
    const menus = [
      {
        id: "m1",
        name: "Lunch",
        categories: [{ id: "c1", items: [item("b"), item("a")] }],
      },
    ];
    const index = buildCategoryItemIndex(menus, [item("a"), liveB], [
      { id: "c1", name: "Mains" },
    ]);
    const items = index.itemsByCategoryId.get("c1")!;
    expect(items.map((i) => i.id)).toEqual(["b", "a"]);
    expect(items[0]).toBe(liveB);
    expect(index.orderedCategoryIds.has("c1")).toBe(true);
  });

  it("lists every menu a category appears in, and takes order from the first", () => {
    const menus = [
      { id: "m1", name: "Lunch", categories: [{ id: "c1", items: [item("a"), item("b")] }] },
      { id: "m2", name: "Dinner", categories: [{ id: "c1", items: [item("b"), item("a")] }] },
    ];
    const index = buildCategoryItemIndex(menus, [item("a"), item("b")], []);
    expect(index.menusByCategoryId.get("c1")).toEqual([
      { id: "m1", name: "Lunch" },
      { id: "m2", name: "Dinner" },
    ]);
    expect(index.itemsByCategoryId.get("c1")!.map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("falls back to name membership for a category in no menu, and can't reorder it", () => {
    const menuItems = [
      item("a", { category: ["Desserts"] }),
      item("b", { category: ["Mains", "Desserts"] }),
      item("c", { category: ["Mains"] }),
    ];
    const index = buildCategoryItemIndex([], menuItems, [
      { id: "c9", name: "Desserts" },
    ]);
    expect(index.itemsByCategoryId.get("c9")!.map((i) => i.id)).toEqual(["a", "b"]);
    expect(index.orderedCategoryIds.has("c9")).toBe(false);
    expect(index.menusByCategoryId.get("c9")).toBeUndefined();
  });

  it("gives an empty list, not undefined, to a category with no items", () => {
    const index = buildCategoryItemIndex([], [], [{ id: "c1", name: "Empty" }]);
    expect(index.itemsByCategoryId.get("c1")).toEqual([]);
  });
});
