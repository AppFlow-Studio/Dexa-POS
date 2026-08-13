/**
 * Menu offline fallback snapshot.
 *
 * Regression cover for the P1 where a failed boot sync left order-processing
 * with an empty menu grid until someone ran Settings → Sync POS. The snapshot
 * is what makes a failed sync degrade to "yesterday's menu" instead of nothing.
 */

const mockMemory = new Map<string, string>();

jest.mock("@/lib/storage", () => ({
  syncStorage: {
    getString: (key: string) => mockMemory.get(key),
    set: (key: string, value: string) => mockMemory.set(key, value),
    remove: (key: string) => mockMemory.delete(key),
  },
}));

jest.mock("@/services/menuImageCache", () => ({
  menuImagePath: (itemId: string) =>
    `file:///data/user/0/app/files/menu-images/${itemId}.jpg`,
}));

import { menuOfflineCache } from "@/stores/menuOfflineCache";
import type { PosSyncData } from "@/types/menu";

const LOCATION = "loc-1";
const BASE64 = "A".repeat(400); // >200 chars, no "://" → treated as a blob

const buildSync = (overrides: Partial<PosSyncData> = {}): PosSyncData =>
  ({
    synced_at: "2026-08-12T10:00:00.000Z",
    location_id: LOCATION,
    menus: [
      {
        id: "menu-1",
        name: "All Day",
        categories: [
          {
            id: "mc-1",
            category_id: "cat-1",
            display_order: 0,
            is_active: true,
            category: { id: "cat-1", name: "Burgers" },
            items: [
              {
                display_order: 0,
                menu_item: {
                  id: "item-1",
                  name: "Cheeseburger",
                  image: BASE64,
                  effective_price: 9.5,
                },
              },
              {
                display_order: 1,
                menu_item: {
                  id: "item-2",
                  name: "Fries",
                  image: "https://cdn.example.com/fries.jpg",
                  effective_price: 3.5,
                },
              },
            ],
          },
        ],
        schedules: [],
      },
    ],
    menu_item_ingredients: [],
    modifier_group_item_ingredients: [],
    ...overrides,
  }) as unknown as PosSyncData;

const cachedItems = (data: PosSyncData) =>
  (data.menus[0] as any).categories[0].items;

beforeEach(() => {
  mockMemory.clear();
  jest.useRealTimers();
});

describe("menuOfflineCache", () => {
  it("round-trips a synced menu", () => {
    menuOfflineCache.set(LOCATION, buildSync());

    const restored = menuOfflineCache.get(LOCATION);
    expect(restored).not.toBeNull();
    expect(restored!.synced_at).toBe("2026-08-12T10:00:00.000Z");
    expect(restored!.menus).toHaveLength(1);
    expect(cachedItems(restored!)).toHaveLength(2);
  });

  it("swaps inline base64 images for their on-disk path and leaves URIs alone", () => {
    menuOfflineCache.set(LOCATION, buildSync());

    const items = cachedItems(menuOfflineCache.get(LOCATION)!);
    expect(items[0].menu_item.image).toBe(
      "file:///data/user/0/app/files/menu-images/item-1.jpg",
    );
    expect(items[1].menu_item.image).toBe("https://cdn.example.com/fries.jpg");

    // The blob must not reach MMKV — that's the whole point of the swap.
    expect(mockMemory.get(`menu_offline:${LOCATION}`)).not.toContain(BASE64);
  });

  it("does not mutate the live payload handed to setMenuData", () => {
    const live = buildSync();
    menuOfflineCache.set(LOCATION, live);
    expect(cachedItems(live)[0].menu_item.image).toBe(BASE64);
  });

  it("handles the unwrapped item shape the RPC sometimes returns", () => {
    const data = buildSync();
    (data.menus[0] as any).categories[0].items = [
      { id: "item-3", name: "Shake", image: BASE64 },
    ];

    menuOfflineCache.set(LOCATION, data);

    expect(cachedItems(menuOfflineCache.get(LOCATION)!)[0].image).toBe(
      "file:///data/user/0/app/files/menu-images/item-3.jpg",
    );
  });

  it("refuses to persist an empty menu over a good snapshot", () => {
    menuOfflineCache.set(LOCATION, buildSync());
    menuOfflineCache.set(LOCATION, buildSync({ menus: [] }));

    expect(menuOfflineCache.get(LOCATION)!.menus).toHaveLength(1);
  });

  it("keeps snapshots per location", () => {
    menuOfflineCache.set(LOCATION, buildSync());
    expect(menuOfflineCache.get("other-loc")).toBeNull();
  });

  it("expires and evicts a snapshot older than the TTL", () => {
    const nowSpy = jest.spyOn(Date, "now");
    nowSpy.mockReturnValue(0);
    menuOfflineCache.set(LOCATION, buildSync());

    // 6 days — still served.
    nowSpy.mockReturnValue(6 * 24 * 60 * 60 * 1000);
    expect(menuOfflineCache.get(LOCATION)).not.toBeNull();

    // 8 days — dropped, and the key is evicted rather than re-read each boot.
    nowSpy.mockReturnValue(8 * 24 * 60 * 60 * 1000);
    expect(menuOfflineCache.get(LOCATION)).toBeNull();
    expect(mockMemory.has(`menu_offline:${LOCATION}`)).toBe(false);

    nowSpy.mockRestore();
  });

  it("survives corrupt stored JSON instead of throwing at boot", () => {
    mockMemory.set(`menu_offline:${LOCATION}`, "{not json");
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    expect(menuOfflineCache.get(LOCATION)).toBeNull();
    errSpy.mockRestore();
  });
});
