import {
  dedupeSyncCategoryItems,
  sortSyncCategoryItems,
} from "@/lib/menuSyncDedupe";

describe("menu sync category-item dedupe", () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("drops duplicate menu_item rows after sort while preserving the first canonical row", () => {
    const input = [
      {
        id: "junction-2",
        display_order: 3,
        menu_item: { id: "item-b", name: "Oreo Crepe" },
      },
      {
        id: "junction-1b",
        display_order: 1,
        menu_item: { id: "item-a", name: "Strawberry Banana Crepe" },
      },
      {
        id: "junction-1a",
        display_order: 1,
        menu_item: { id: "item-a", name: "Strawberry Banana Crepe" },
      },
      {
        id: "junction-3",
        display_order: 4,
        menu_item: { id: "item-c", name: "S'Mores Crepe" },
      },
    ];

    const result = dedupeSyncCategoryItems(sortSyncCategoryItems(input));

    expect(result).toHaveLength(3);
    expect(result.map((entry) => entry.menu_item.id)).toEqual([
      "item-a",
      "item-b",
      "item-c",
    ]);
    expect(result[0].id).toBe("junction-1b");
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("keeps distinct rows when item identities are different", () => {
    const input = [
      {
        id: "junction-1",
        display_order: 1,
        menu_item: { id: "item-a", name: "Original Crepe" },
      },
      {
        id: "junction-2",
        display_order: 1,
        menu_item: { id: "item-b", name: "Oreo Crepe" },
      },
    ];

    const result = dedupeSyncCategoryItems(sortSyncCategoryItems(input));

    expect(result).toHaveLength(2);
    expect(result.map((entry) => entry.menu_item.id)).toEqual([
      "item-b",
      "item-a",
    ]);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
