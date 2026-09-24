/**
 * Derived, read-only views of the menu store for the menu management screen.
 *
 * Two rules keep this cheap on low-end tablets:
 *
 * 1. **Built once, shared.** Every derivation sits behind a single-entry cache
 *    keyed on its inputs' identities, at module level. The Menus, Categories and
 *    Schedules panels ask for the same sorted menus and the same category index;
 *    the first one to render builds it, the others get the same object back.
 *    Per-component `useMemo` would build it once per panel.
 *
 * 2. **Stable across clock ticks.** `useScheduleClock` ticks every minute. A
 *    derivation that depends on "now" only produces a new object when a result
 *    actually changed (a menu opened or closed), so a tick that changes nothing
 *    re-renders nothing downstream.
 */
import { useMemo } from "react";

import { useScheduleClock } from "@/hooks/useScheduleClock";
import {
  buildCategoryItemIndex,
  compareKeys,
  nameSortKey,
  sortByName,
  type CategoryItemIndex,
} from "@/lib/menu/menuManagementIndex";
import { isActivelySnoozed } from "@/lib/snoozeDurations";
import type { Category, Menu, MenuItemType, ModifierCategory } from "@/lib/types";
import { useMenuStore } from "@/stores/useMenuStore";

/** Remembers the last call; returns the cached result for identical arguments. */
function memoLast<A extends unknown[], R>(fn: (...args: A) => R) {
  let lastArgs: A | null = null;
  let lastResult: R;
  return (...args: A): R => {
    if (
      lastArgs !== null &&
      lastArgs.length === args.length &&
      lastArgs.every((arg, i) => Object.is(arg, args[i]))
    ) {
      return lastResult;
    }
    lastResult = fn(...args);
    lastArgs = args;
    return lastResult;
  };
}

const asArray = <T,>(value: T[] | null | undefined): T[] =>
  Array.isArray(value) ? value : [];

// ---------------------------------------------------------------------------
// Menus
// ---------------------------------------------------------------------------

export type ManagedMenu = Menu & { isAvailableNow: boolean };

/** Display order, then name. Tree shape normalized (categories always an array). */
const sortMenus = memoLast((menus: Menu[]): Menu[] =>
  asArray(menus)
    .map((menu) => ({
      menu: Array.isArray(menu.categories) ? menu : { ...menu, categories: [] },
      order: menu.displayOrder ?? Number.MAX_SAFE_INTEGER,
      key: nameSortKey(menu.name),
    }))
    .sort((a, b) => a.order - b.order || compareKeys(a.key, b.key))
    .map((entry) => entry.menu),
);

let lastManaged: {
  sorted: Menu[];
  flags: boolean[];
  result: ManagedMenu[];
} | null = null;

function managedMenusFor(
  sorted: Menu[],
  isMenuAvailableNow: (id: string, at?: Date) => boolean,
  now: Date,
): ManagedMenu[] {
  const flags = sorted.map((menu) => isMenuAvailableNow(menu.id, now));
  if (
    lastManaged &&
    lastManaged.sorted === sorted &&
    flags.every((flag, i) => flag === lastManaged!.flags[i])
  ) {
    return lastManaged.result;
  }
  const result = sorted.map((menu, i) => ({ ...menu, isAvailableNow: flags[i] }));
  lastManaged = { sorted, flags, result };
  return result;
}

/** Menus in display order, each with its schedule evaluated for "now". */
export function useManagedMenus(): ManagedMenu[] {
  const menus = useMenuStore((s) => s.menus);
  const isMenuAvailableNow = useMenuStore((s) => s.isMenuAvailableNow);
  const now = useScheduleClock();
  return useMemo(
    () => managedMenusFor(sortMenus(menus), isMenuAvailableNow, now),
    [menus, isMenuAvailableNow, now],
  );
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

const sortCategories = memoLast((categories: Category[]) =>
  sortByName(asArray(categories)),
);

/** Library categories, A–Z. */
export function useSortedCategories(): Category[] {
  const categories = useMenuStore((s) => s.categories);
  return sortCategories(categories);
}

// Keyed on the sorted menu TREES, not on ManagedMenu: availability flips must
// not rebuild an index that only depends on which items are where.
const categoryIndexFor = memoLast(
  (menus: Menu[], menuItems: MenuItemType[], categories: Category[]) =>
    buildCategoryItemIndex(menus, asArray(menuItems), asArray(categories)),
);

/**
 * Items per category, in display order, plus which menus hold each category.
 * See `buildCategoryItemIndex` for the ordering and fallback rules.
 */
export function useCategoryItemIndex(): CategoryItemIndex {
  const menus = useMenuStore((s) => s.menus);
  const menuItems = useMenuStore((s) => s.menuItems);
  const categories = useMenuStore((s) => s.categories);
  return categoryIndexFor(sortMenus(menus), menuItems, categories);
}

let lastOpenNow: {
  categories: Category[];
  map: Map<string, boolean>;
} | null = null;

/** Whether each category is open right now (active + schedule). */
export function useCategoryOpenNow(): Map<string, boolean> {
  const categories = useSortedCategories();
  const isCategoryAvailableNow = useMenuStore((s) => s.isCategoryAvailableNow);
  const now = useScheduleClock();
  return useMemo(() => {
    const map = new Map<string, boolean>();
    for (const category of categories) {
      map.set(category.id, isCategoryAvailableNow(category.id, null, now));
    }
    const prev = lastOpenNow;
    if (
      prev &&
      prev.categories === categories &&
      prev.map.size === map.size &&
      [...map].every(([id, open]) => prev.map.get(id) === open)
    ) {
      return prev.map;
    }
    lastOpenNow = { categories, map };
    return map;
  }, [categories, isCategoryAvailableNow, now]);
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

const sortItems = memoLast((menuItems: MenuItemType[]) =>
  sortByName(asArray(menuItems)),
);

/** The whole item library, A–Z. */
export function useSortedItems(): MenuItemType[] {
  const menuItems = useMenuStore((s) => s.menuItems);
  return sortItems(menuItems);
}

const countOutOfStock = memoLast(
  (menuItems: MenuItemType[], modifierGroups: ModifierCategory[]) => {
    let count = 0;
    for (const item of asArray(menuItems)) {
      if (isActivelySnoozed(item.snoozedUntil)) count += 1;
    }
    for (const group of asArray(modifierGroups)) {
      for (const option of group.options ?? []) {
        if (isActivelySnoozed(option.snoozedUntil)) count += 1;
      }
    }
    return count;
  },
);

/** Everything currently 86'd: items plus individual modifier options. */
export function useOutOfStockCount(): number {
  const menuItems = useMenuStore((s) => s.menuItems);
  const modifierGroups = useMenuStore((s) => s.modifierGroups);
  return countOutOfStock(menuItems, modifierGroups);
}

// ---------------------------------------------------------------------------
// Modifiers
// ---------------------------------------------------------------------------

export type ManagedModifierGroup = ModifierCategory & { items: MenuItemType[] };

const managedModifierGroupsFor = memoLast(
  (menuItems: MenuItemType[], modifierGroups: ModifierCategory[]) => {
    const itemsByGroupId = new Map<string, MenuItemType[]>();
    for (const item of asArray(menuItems)) {
      for (const groupId of item.modifierGroupIds ?? []) {
        const list = itemsByGroupId.get(groupId);
        if (list) list.push(item);
        else itemsByGroupId.set(groupId, [item]);
      }
    }
    return asArray(modifierGroups)
      .map((group) => ({
        group: {
          ...group,
          options: Array.isArray(group.options) ? group.options : [],
          items: itemsByGroupId.get(group.id) ?? [],
        },
        order: group.displayOrder ?? Number.MAX_SAFE_INTEGER,
        key: nameSortKey(group.name),
      }))
      .sort((a, b) => a.order - b.order || compareKeys(a.key, b.key))
      .map((entry) => entry.group as ManagedModifierGroup);
  },
);

/** Modifier groups in display order, each with the items that use it. */
export function useManagedModifierGroups(): ManagedModifierGroup[] {
  const menuItems = useMenuStore((s) => s.menuItems);
  const modifierGroups = useMenuStore((s) => s.modifierGroups);
  return managedModifierGroupsFor(menuItems, modifierGroups);
}
