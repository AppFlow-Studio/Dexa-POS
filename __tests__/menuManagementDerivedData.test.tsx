/**
 * Performance contracts of the menu management derived data
 * (hooks/menu/useMenuManagementData.ts):
 *
 * - every panel that asks for the same derivation gets the SAME object, so
 *   Menus, Categories and Schedules don't each rebuild the category index;
 * - a schedule-clock tick that opens or closes nothing produces no new objects,
 *   so the minute tick re-renders nothing downstream.
 */

import React from "react";
// @ts-ignore — react-test-renderer ships no bundled types on SDK 53
import TestRenderer, { act } from "react-test-renderer";

import {
  useCategoryItemIndex,
  useManagedMenus,
  useSortedCategories,
  useSortedItems,
} from "@/hooks/menu/useMenuManagementData";
import { sortByName } from "@/lib/menu/menuManagementIndex";
import type { MenuItemType } from "@/lib/types";
import { useMenuStore } from "@/stores/useMenuStore";
import { formatCurrency } from "@/utils/currency";

// jest.mock calls are hoisted above the imports by babel-jest.
// See menuSyncStateProvenance.test.ts: stubs a lazy require whose module graph
// pulls in ESM `uuid`.
jest.mock("@/stores/useModifierSidebarStore", () => ({
  clearModifierPreWarmCache: jest.fn(),
}));

let mockNow = new Date(2026, 8, 21, 12, 0);
jest.mock("@/hooks/useScheduleClock", () => ({
  useScheduleClock: () => mockNow,
}));

const item = (id: string, name: string): MenuItemType =>
  ({ id, name, price: 1, meal: [], category: [] }) as unknown as MenuItemType;

type Snapshot = {
  menus: ReturnType<typeof useManagedMenus>;
  index: ReturnType<typeof useCategoryItemIndex>;
  items: ReturnType<typeof useSortedItems>;
  categories: ReturnType<typeof useSortedCategories>;
};

function Probe({ out }: { out: Snapshot[]; tick: number }) {
  out.push({
    menus: useManagedMenus(),
    index: useCategoryItemIndex(),
    items: useSortedItems(),
    categories: useSortedCategories(),
  });
  return null;
}

describe("menu management derived data", () => {
  const openMenus = new Set(["m1"]);
  type Renderer = {
    update: (element: React.ReactElement) => void;
    unmount: () => void;
  };
  const mounted: Renderer[] = [];
  const mount = (element: React.ReactElement): Renderer => {
    let renderer!: Renderer;
    act(() => {
      renderer = TestRenderer.create(element);
    });
    mounted.push(renderer);
    return renderer;
  };

  afterEach(() => {
    act(() => mounted.splice(0).forEach((r) => r.unmount()));
  });

  beforeEach(() => {
    openMenus.clear();
    openMenus.add("m1");
    const burger = item("i1", "burger");
    const fries = item("i2", "Fries");
    useMenuStore.setState({
      menus: [
        {
          id: "m2",
          name: "Dinner",
          isActive: true,
          displayOrder: 1,
          categories: [{ id: "c1", name: "Mains", isActive: true, order: 0, items: [fries] }],
        },
        {
          id: "m1",
          name: "Lunch",
          isActive: true,
          displayOrder: 0,
          categories: [{ id: "c1", name: "Mains", isActive: true, order: 0, items: [fries, burger] }],
        },
      ] as any,
      menuItems: [fries, burger],
      categories: [
        { id: "c1", name: "Mains", isActive: true, order: 0 },
        { id: "c2", name: "desserts", isActive: true, order: 1 },
      ] as any,
      isMenuAvailableNow: (id: string) => openMenus.has(id),
    });
  });

  it("hands every panel the same derived objects", () => {
    const a: Snapshot[] = [];
    const b: Snapshot[] = [];
    mount(
      <>
        <Probe out={a} tick={0} />
        <Probe out={b} tick={0} />
      </>,
    );
    const [first] = a;
    const [second] = b;
    expect(second.menus).toBe(first.menus);
    expect(second.index).toBe(first.index);
    expect(second.items).toBe(first.items);
    expect(second.categories).toBe(first.categories);

    // Display order, then name; items A–Z case-insensitively.
    expect(first.menus.map((m) => m.id)).toEqual(["m1", "m2"]);
    expect(first.items.map((i) => i.name)).toEqual(["burger", "Fries"]);
    expect(first.categories.map((c) => c.name)).toEqual(["desserts", "Mains"]);
    // Category order comes from the first menu in display order (Lunch).
    expect(first.index.itemsByCategoryId.get("c1")!.map((i) => i.id)).toEqual([
      "i2",
      "i1",
    ]);
  });

  it("keeps the same menus array across a clock tick that changes nothing", () => {
    const out: Snapshot[] = [];
    const renderer = mount(<Probe out={out} tick={0} />);
    const before = out[out.length - 1];

    mockNow = new Date(mockNow.getTime() + 60_000);
    act(() => renderer.update(<Probe out={out} tick={1} />));
    const afterQuietTick = out[out.length - 1];
    expect(afterQuietTick.menus).toBe(before.menus);
    expect(afterQuietTick.index).toBe(before.index);

    // Dinner opens: now, and only now, the menus change.
    openMenus.add("m2");
    mockNow = new Date(mockNow.getTime() + 60_000);
    act(() => renderer.update(<Probe out={out} tick={2} />));
    const afterOpening = out[out.length - 1];
    expect(afterOpening.menus).not.toBe(before.menus);
    expect(afterOpening.menus.find((m) => m.id === "m2")!.isAvailableNow).toBe(true);
    // The index only depends on the menu trees, not on availability.
    expect(afterOpening.index).toBe(before.index);
  });
});

describe("sortByName", () => {
  it("is case- and accent-insensitive and stable", () => {
    const list = [
      { id: "1", name: "crème brûlée" },
      { id: "2", name: "Crepe" },
      { id: "3", name: "apple" },
      { id: "4", name: "Zucchini" },
      { id: "5", name: "apple" },
    ];
    expect(sortByName(list).map((e) => e.id)).toEqual(["3", "5", "1", "2", "4"]);
  });
});

describe("formatCurrency (cached formatter)", () => {
  it("formats exactly as before", () => {
    expect(formatCurrency(1234.5)).toBe("$1,234.50");
    expect(formatCurrency(0)).toBe("$0.00");
    expect(formatCurrency(-3)).toBe("-$3.00");
    expect(formatCurrency(null)).toBe("$0.00");
    expect(formatCurrency(Number.NaN)).toBe("$0.00");
  });
});
