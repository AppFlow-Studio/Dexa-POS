/**
 * Menu + category schedules through the real store path: a v3 bootstrap
 * payload → `setMenuData` → `isMenuAvailableNow` / `isCategoryAvailableNow`.
 *
 * Guards the three ways scheduling was silently dead on the tablet:
 *   - category schedules were never mapped (always "available"),
 *   - menu schedules were dropped (v2 never sent `is_active`),
 *   - `day_of_week` was read as 0=Monday (a day off),
 * plus the name-lookup bug: a category renamed in its second menu
 * (custom_title) must not be reported closed.
 */

// See menuSyncStateProvenance.test.ts — stubs a lazy require whose module
// graph pulls in ESM `uuid`.
jest.mock("@/stores/useModifierSidebarStore", () => ({
  clearModifierPreWarmCache: jest.fn(),
}));

import { useMenuStore } from "@/stores/useMenuStore";
import type { PosSyncData } from "@/types/menu";

// Week of 2026-09-20: Mon 21, Sat 26.
const MON_NOON = new Date(2026, 8, 21, 12, 0);
const MON_EVENING = new Date(2026, 8, 21, 19, 0);
const SAT_NOON = new Date(2026, 8, 26, 12, 0);

const weekdayLunch = {
  id: "cs-1",
  schedule: {
    id: "sched-lunch",
    name: "Weekday Lunch",
    description: null,
    is_active: true,
    // 0=Sunday on the wire → 1..5 = Mon..Fri.
    time_slots: [1, 2, 3, 4, 5].map((day) => ({
      id: `ts-${day}`,
      day_of_week: day,
      start_time: "11:00:00",
      end_time: "14:00:00",
      is_active: true,
    })),
  },
};

const item = (id: string) => ({
  display_order: 0,
  menu_item: {
    id,
    name: id,
    effective_price: 5,
    effective_availability: true,
    modifier_groups: [],
    categories: [],
  },
});

const categoryEntry = (
  menuCategoryId: string,
  categoryId: string,
  name: string,
  schedules?: unknown[],
) => ({
  id: menuCategoryId,
  category_id: categoryId,
  display_order: 0,
  is_active: true,
  category: { id: categoryId, name },
  items: [item(`${categoryId}-item`)],
  ...(schedules ? { schedules } : {}),
});

const buildSync = (): PosSyncData =>
  ({
    synced_at: "2026-09-21T10:00:00Z",
    location_id: "loc-1",
    menus: [
      {
        id: "menu-main",
        name: "Main",
        is_active: true,
        display_order: 0,
        categories: [
          categoryEntry("mc-1", "cat-lunch", "Lunch Specials", [weekdayLunch]),
          categoryEntry("mc-2", "cat-drinks", "Drinks"),
        ],
        schedules: [],
      },
      {
        id: "menu-bar",
        name: "Bar",
        is_active: true,
        display_order: 1,
        // Same category, renamed on this menu via custom_title.
        categories: [
          categoryEntry("mc-3", "cat-lunch", "Bar Bites", [weekdayLunch]),
        ],
        schedules: [{ ...weekdayLunch, id: "ms-1" }],
      },
    ],
    menu_item_ingredients: [],
    modifier_group_item_ingredients: [],
  }) as unknown as PosSyncData;

const store = () => useMenuStore.getState();

beforeEach(() => {
  store().clearMenuData();
  store().setMenuData(buildSync());
});

describe("category schedules", () => {
  it("maps category schedules from the bootstrap entry", () => {
    const lunch = store()
      .menus.find((m) => m.id === "menu-main")!
      .categories.find((c) => c.id === "cat-lunch")!;
    expect(lunch.schedules).toHaveLength(1);
    expect(lunch.schedules![0].days).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri"]);
  });

  it("is open inside its window and closed outside it", () => {
    const { isCategoryAvailableNow } = store();
    expect(isCategoryAvailableNow("cat-lunch", "menu-main", MON_NOON)).toBe(true);
    expect(isCategoryAvailableNow("cat-lunch", "menu-main", MON_EVENING)).toBe(
      false,
    );
    expect(isCategoryAvailableNow("cat-lunch", "menu-main", SAT_NOON)).toBe(
      false,
    );
  });

  it("keeps a category with no schedule always available", () => {
    const { isCategoryAvailableNow } = store();
    expect(isCategoryAvailableNow("cat-drinks", "menu-main", MON_EVENING)).toBe(
      true,
    );
    expect(isCategoryAvailableNow("cat-drinks", null, SAT_NOON)).toBe(true);
  });

  it("resolves by id, so a renamed copy in another menu is not falsely closed", () => {
    const { isCategoryAvailableNow } = store();
    expect(isCategoryAvailableNow("cat-lunch", "menu-bar", MON_NOON)).toBe(true);
  });

  it("reports a category absent from the given menu as closed", () => {
    expect(
      store().isCategoryAvailableNow("cat-drinks", "menu-bar", MON_NOON),
    ).toBe(false);
  });
});

describe("menu schedules", () => {
  it("are enforced now that v3 sends is_active", () => {
    const { isMenuAvailableNow } = store();
    expect(isMenuAvailableNow("menu-bar", MON_NOON)).toBe(true);
    expect(isMenuAvailableNow("menu-bar", MON_EVENING)).toBe(false);
    expect(isMenuAvailableNow("menu-bar", SAT_NOON)).toBe(false);
    // Unscheduled menu: always available.
    expect(isMenuAvailableNow("menu-main", SAT_NOON)).toBe(true);
  });

  it("honour the global scheduling switch", () => {
    store().setMenuSchedulingEnabled(false);
    expect(store().isMenuAvailableNow("menu-bar", SAT_NOON)).toBe(true);
    expect(
      store().isCategoryAvailableNow("cat-lunch", "menu-main", SAT_NOON),
    ).toBe(true);
    store().setMenuSchedulingEnabled(true);
  });
});
