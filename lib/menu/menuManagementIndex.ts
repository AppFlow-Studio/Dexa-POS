/**
 * Pure helpers behind the menu management screen's derived data and reorders.
 * Kept free of React and the store so they can be unit tested directly.
 */
import type { Category, MenuItemType } from "@/lib/types";

/**
 * Sort key for a name: lower-cased, accents stripped. Only non-ASCII names pay
 * for `normalize`, and each name pays once, not once per comparison.
 */
export function nameSortKey(name: string | null | undefined): string {
  const lower = (name ?? "").toLowerCase();
  return /[^\u0000-\u007f]/.test(lower)
    ? lower.normalize("NFD").replace(/[̀-ͯ]/g, "")
    : lower;
}

/** Plain comparison of two sort keys. */
export const compareKeys = (a: string, b: string): number =>
  a < b ? -1 : a > b ? 1 : 0;

/**
 * A–Z by name, case- and accent-insensitive, stable.
 *
 * Deliberately not `localeCompare`: on Hermes/Android every call goes through
 * native ICU, and sorting ~2,000 items makes ~22,000 of those calls, which
 * shows up as a visible stall on low-end tablets. Here each name is keyed
 * once, then compared as plain strings.
 */
export function sortByName<T extends { name: string }>(list: readonly T[]): T[] {
  const keyed = list.map((entry, index) => ({
    entry,
    index,
    key: nameSortKey(entry.name),
  }));
  keyed.sort((a, b) => compareKeys(a.key, b.key) || a.index - b.index);
  return keyed.map((k) => k.entry);
}

/**
 * `list` rearranged to follow `orderedIds`. Anything the ids don't mention
 * keeps its relative order at the end, so a stale id list can't drop a row.
 */
export function applyOrder<T extends { id: string }>(
  list: readonly T[],
  orderedIds: readonly string[],
): T[] {
  const byId = new Map(list.map((entry) => [entry.id, entry]));
  const placed = new Set<string>();
  const result: T[] = [];
  for (const id of orderedIds) {
    const entry = byId.get(id);
    if (entry && !placed.has(id)) {
      result.push(entry);
      placed.add(id);
    }
  }
  for (const entry of list) {
    if (!placed.has(entry.id)) result.push(entry);
  }
  return result;
}

export interface CategoryItemIndex {
  /** Items per category id, in the category's display order when known. */
  itemsByCategoryId: Map<string, MenuItemType[]>;
  /**
   * Categories whose order comes from the menu tree. Only these can be
   * reordered: the reorder RPC and the store reorder both work on the tree.
   */
  orderedCategoryIds: Set<string>;
  /** Menus each category appears in, in the order `menus` was given. */
  menusByCategoryId: Map<string, { id: string; name: string }[]>;
}

type TreeMenu = {
  id: string;
  name: string;
  categories: readonly Pick<Category, "id" | "items">[];
};

/**
 * One index for every "what's in this category" question on the screen.
 *
 * Order comes from the menu tree (`menu.categories[].items`), which is what the
 * item reorder writes. The item OBJECTS come from `menuItems`, because that is
 * the list availability and 86 toggles update, and tree copies can lag behind.
 * Categories that no menu contains fall back to name membership, the same rule
 * `useMenuStore.getItemsInCategory` uses.
 */
export function buildCategoryItemIndex(
  menus: readonly TreeMenu[],
  menuItems: readonly MenuItemType[],
  categories: readonly Pick<Category, "id" | "name">[],
): CategoryItemIndex {
  const itemById = new Map(menuItems.map((item) => [item.id, item]));
  const itemsByCategoryId = new Map<string, MenuItemType[]>();
  const orderedCategoryIds = new Set<string>();
  const menusByCategoryId = new Map<string, { id: string; name: string }[]>();

  for (const menu of menus) {
    for (const category of menu.categories) {
      const menusForCategory = menusByCategoryId.get(category.id) ?? [];
      menusForCategory.push({ id: menu.id, name: menu.name });
      menusByCategoryId.set(category.id, menusForCategory);

      if (orderedCategoryIds.has(category.id)) continue;
      if (!Array.isArray(category.items)) continue;
      orderedCategoryIds.add(category.id);
      itemsByCategoryId.set(
        category.id,
        category.items.map((treeItem) => itemById.get(treeItem.id) ?? treeItem),
      );
    }
  }

  // Name-membership fallback for categories absent from every menu tree.
  const categoryIdByName = new Map<string, string>();
  for (const category of categories) {
    if (!itemsByCategoryId.has(category.id)) {
      categoryIdByName.set(category.name, category.id);
      itemsByCategoryId.set(category.id, []);
    }
  }
  if (categoryIdByName.size > 0) {
    for (const item of menuItems) {
      const names: readonly string[] = Array.isArray(item.category)
        ? item.category
        : item.category
          ? [item.category as unknown as string]
          : [];
      for (const name of names) {
        const categoryId = categoryIdByName.get(name);
        if (categoryId) itemsByCategoryId.get(categoryId)!.push(item);
      }
    }
  }

  return { itemsByCategoryId, orderedCategoryIds, menusByCategoryId };
}
