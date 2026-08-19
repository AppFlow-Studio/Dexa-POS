/**
 * Menu library (standalone entities) persisted snapshot.
 *
 * Cover for the regression where menu management waited on the network after
 * every app restart — the item count in the header climbed as the payload
 * trickled in, and the section was unusable offline. The snapshot is what lets
 * it paint from disk on the first frame; the fingerprint is what stops an
 * unchanged payload from rebuilding the whole menu store.
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

import type { StandaloneSyncData } from "@/hooks/pos/useStandaloneSync";
import {
  fingerprintLibrary,
  menuLibraryCache,
} from "@/stores/menuLibraryCache";

const MERCHANT = "merch-1";
const LOCATION = "loc-1";
const BASE64 = "A".repeat(400); // >200 chars, no "://" → treated as a blob

const buildLibrary = (
  overrides: Partial<StandaloneSyncData> = {},
): StandaloneSyncData =>
  ({
    categories: [
      {
        id: "cat-1",
        name: "Burgers",
        description: null,
        image: null,
        location_id: null,
        location_name: null,
        is_active: true,
        item_count: 1,
        items: [],
      },
    ],
    items: [
      {
        id: "item-1",
        name: "Cheeseburger",
        description: null,
        image: null,
        base_price: 9.5,
        base_cash_price: null,
        effective_price: 9.5,
        effective_cash_price: null,
        effective_availability: true,
        stock_tracking_mode: "in_stock",
        location_id: null,
        categories: [],
      },
    ],
    modifierGroups: [],
    menus: [],
    menu_item_ingredients: [],
    modifier_group_item_ingredients: [],
    ...overrides,
  }) as StandaloneSyncData;

beforeEach(() => mockMemory.clear());

describe("menuLibraryCache", () => {
  it("round-trips a library payload", () => {
    const data = buildLibrary();
    menuLibraryCache.set(MERCHANT, LOCATION, data);

    const cached = menuLibraryCache.get(MERCHANT, LOCATION);
    expect(cached?.data.items).toHaveLength(1);
    expect(cached?.data.items[0].name).toBe("Cheeseburger");
  });

  it("returns null when nothing is cached", () => {
    expect(menuLibraryCache.get(MERCHANT, LOCATION)).toBeNull();
  });

  it("keys per merchant+location", () => {
    menuLibraryCache.set(MERCHANT, LOCATION, buildLibrary());
    expect(menuLibraryCache.get(MERCHANT, "other-loc")).toBeNull();
    expect(menuLibraryCache.get("other-merch", LOCATION)).toBeNull();
  });

  it("swaps inline base64 item images for their on-disk path", () => {
    const data = buildLibrary({
      items: [
        { ...buildLibrary().items[0], image: BASE64 },
      ] as StandaloneSyncData["items"],
    });
    menuLibraryCache.set(MERCHANT, LOCATION, data);

    const cached = menuLibraryCache.get(MERCHANT, LOCATION);
    expect(cached?.data.items[0].image).toBe(
      "file:///data/user/0/app/files/menu-images/item-1.jpg",
    );
    // The multi-MB blob must not reach storage.
    expect(mockMemory.get(`menu_library:${MERCHANT}:${LOCATION}`)).not.toContain(
      BASE64,
    );
  });

  it("drops inline base64 category images (no on-disk file exists)", () => {
    const data = buildLibrary({
      categories: [
        { ...buildLibrary().categories[0], image: BASE64 },
      ] as StandaloneSyncData["categories"],
    });
    menuLibraryCache.set(MERCHANT, LOCATION, data);

    expect(menuLibraryCache.get(MERCHANT, LOCATION)?.data.categories[0].image)
      .toBeNull();
  });

  it("leaves an already-resolved file:// path alone", () => {
    const path = "file:///already/resolved.jpg";
    const data = buildLibrary({
      items: [
        { ...buildLibrary().items[0], image: path },
      ] as StandaloneSyncData["items"],
    });
    menuLibraryCache.set(MERCHANT, LOCATION, data);

    expect(menuLibraryCache.get(MERCHANT, LOCATION)?.data.items[0].image).toBe(
      path,
    );
  });

  it("refuses to persist an empty library over a good snapshot", () => {
    menuLibraryCache.set(MERCHANT, LOCATION, buildLibrary());
    menuLibraryCache.set(
      MERCHANT,
      LOCATION,
      buildLibrary({ items: [], categories: [] }),
    );

    // The good snapshot survives — this is the blank state the cache exists
    // to prevent.
    expect(menuLibraryCache.get(MERCHANT, LOCATION)?.data.items).toHaveLength(1);
  });

  it("expires a snapshot older than the TTL", () => {
    menuLibraryCache.set(MERCHANT, LOCATION, buildLibrary());

    const key = `menu_library:${MERCHANT}:${LOCATION}`;
    const stored = JSON.parse(mockMemory.get(key)!);
    stored.cachedAt = Date.now() - 8 * 24 * 60 * 60 * 1000; // 8 days
    mockMemory.set(key, JSON.stringify(stored));

    expect(menuLibraryCache.get(MERCHANT, LOCATION)).toBeNull();
    expect(mockMemory.has(key)).toBe(false); // and sweeps itself
  });

  it("survives corrupt stored JSON", () => {
    mockMemory.set(`menu_library:${MERCHANT}:${LOCATION}`, "{not json");
    expect(menuLibraryCache.get(MERCHANT, LOCATION)).toBeNull();
  });
});

describe("fingerprintLibrary", () => {
  it("is stable for identical payloads", () => {
    expect(fingerprintLibrary(buildLibrary())).toBe(
      fingerprintLibrary(buildLibrary()),
    );
  });

  it("changes when an item price changes", () => {
    const before = fingerprintLibrary(buildLibrary());
    const after = fingerprintLibrary(
      buildLibrary({
        items: [
          { ...buildLibrary().items[0], effective_price: 10.5 },
        ] as StandaloneSyncData["items"],
      }),
    );
    expect(after).not.toBe(before);
  });

  it("changes when an item is deleted", () => {
    const twoItems = buildLibrary({
      items: [
        buildLibrary().items[0],
        { ...buildLibrary().items[0], id: "item-2", name: "Fries" },
      ] as StandaloneSyncData["items"],
    });
    expect(fingerprintLibrary(twoItems)).not.toBe(
      fingerprintLibrary(buildLibrary()),
    );
  });

  it("round-trips through the cache so an unchanged sync can be skipped", () => {
    const data = buildLibrary();
    const fp = menuLibraryCache.set(MERCHANT, LOCATION, data);
    expect(menuLibraryCache.get(MERCHANT, LOCATION)?.fingerprint).toBe(fp);
    expect(fp).toBe(fingerprintLibrary(data));
  });
});
