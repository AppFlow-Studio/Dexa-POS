/**
 * `syncState` provenance — how the menu on screen got there.
 *
 * The order-processing grid looks identical whether the items came from a live
 * sync or from the offline snapshot, so `isFromCache` is the only thing
 * standing between an operator and ringing up yesterday's prices without
 * knowing it. It drives MenuStaleBanner ("Menu may be out of date · Sync").
 */

// `setMenuData` lazily requires useModifierSidebarStore to clear the pre-warm
// cache. That pulls in useSeatingStore → offlineSyncService → `uuid`, which is
// ESM and trips the (pre-existing) transformIgnorePatterns gap. Stubbed here so
// this suite tests the store, not the module graph.
jest.mock("@/stores/useModifierSidebarStore", () => ({
  clearModifierPreWarmCache: jest.fn(),
}));

import { useMenuStore } from "@/stores/useMenuStore";
import type { PosSyncData } from "@/types/menu";

const buildSync = (syncedAt: string): PosSyncData =>
  ({
    synced_at: syncedAt,
    location_id: "loc-1",
    menus: [
      {
        id: "menu-1",
        name: "All Day",
        is_active: true,
        display_order: 0,
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
                  effective_price: 9.5,
                  effective_availability: true,
                  modifier_groups: [],
                  categories: [],
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
  }) as unknown as PosSyncData;

const syncState = () => useMenuStore.getState().syncState;

beforeEach(() => {
  useMenuStore.getState().clearMenuData();
});

describe("useMenuStore sync provenance", () => {
  it("starts with no menu and no cache claim", () => {
    expect(useMenuStore.getState().menus).toHaveLength(0);
    expect(syncState().isFromCache).toBe(false);
    expect(syncState().lastSyncedAt).toBeNull();
  });

  it("a live sync marks the menu as fresh and clears loading/error", () => {
    useMenuStore.getState().setSyncState({ isLoading: true, isError: true });
    useMenuStore.getState().setMenuData(buildSync("2026-08-12T10:00:00.000Z"));

    expect(useMenuStore.getState().menus).toHaveLength(1);
    expect(syncState().isFromCache).toBe(false);
    expect(syncState().isLoading).toBe(false);
    expect(syncState().isError).toBe(false);
    expect(syncState().lastSyncedAt).toBe("2026-08-12T10:00:00.000Z");
  });

  it("a cache hydrate marks the menu as stale, stamped with the ORIGINAL sync time", () => {
    useMenuStore
      .getState()
      .setMenuData(buildSync("2026-08-11T09:00:00.000Z"), { fromCache: true });

    expect(useMenuStore.getState().menus).toHaveLength(1);
    expect(syncState().isFromCache).toBe(true);
    // Not "now" — the banner reports how old the data actually is.
    expect(syncState().lastSyncedAt).toBe("2026-08-11T09:00:00.000Z");
  });

  it("a cache hydrate does not claim the in-flight live fetch finished", () => {
    // Boot: query is fetching, snapshot paints the grid underneath it.
    useMenuStore.getState().setSyncState({ isLoading: true });
    useMenuStore
      .getState()
      .setMenuData(buildSync("2026-08-11T09:00:00.000Z"), { fromCache: true });

    expect(syncState().isLoading).toBe(true);
    expect(syncState().isFromCache).toBe(true);
  });

  it("a cache hydrate preserves a failed live sync's error state", () => {
    const err = new Error("deadline exceeded");
    useMenuStore.getState().setSyncState({ isError: true, error: err });
    useMenuStore
      .getState()
      .setMenuData(buildSync("2026-08-11T09:00:00.000Z"), { fromCache: true });

    expect(syncState().isError).toBe(true);
    expect(syncState().error).toBe(err);
  });

  it("a live sync landing after a cache hydrate clears the stale flag", () => {
    useMenuStore
      .getState()
      .setMenuData(buildSync("2026-08-11T09:00:00.000Z"), { fromCache: true });
    expect(syncState().isFromCache).toBe(true);

    useMenuStore.getState().setMenuData(buildSync("2026-08-12T10:00:00.000Z"));

    expect(syncState().isFromCache).toBe(false);
    expect(syncState().lastSyncedAt).toBe("2026-08-12T10:00:00.000Z");
  });

  it("clearMenuData resets provenance so a store switch can't inherit it", () => {
    useMenuStore
      .getState()
      .setMenuData(buildSync("2026-08-11T09:00:00.000Z"), { fromCache: true });
    useMenuStore.getState().clearMenuData();

    expect(syncState().isFromCache).toBe(false);
    expect(syncState().lastSyncedAt).toBeNull();
  });
});
