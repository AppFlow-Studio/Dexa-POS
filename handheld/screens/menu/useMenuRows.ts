import { isItemOnChannel } from "@/lib/menu/itemChannelVisibility";
import { filterPosOrderEntryMenus } from "@/lib/menu/posMenuVisibility";
import { isKitchenItemUnsent } from "@/lib/kitchenStatusUtils";
import type { MenuItemType } from "@/lib/types";
import { useMenuStore } from "@/stores/useMenuStore";
import { useMenuVisibilityStore } from "@/stores/useMenuVisibilityStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useMemo } from "react";

/** One category chip: the menu-tree ids the register records on a cart item. */
export interface MenuChip {
  key: string;
  label: string;
  menuId: string;
  categoryId: string;
}

/** A menu row with the context it was found in (prices come from the tree copy). */
export interface MenuRowData {
  item: MenuItemType;
  menuId: string;
  categoryId: string;
}

export interface MenuRows {
  chips: MenuChip[];
  rows: MenuRowData[];
  /** Unsent quantity of each menu item on the check, for the `.qa.in` count; sent lines are the kitchen's now. */
  inOrder: Record<string, number>;
}

const EMPTY_HIDDEN: readonly string[] = [];

function sellable(item: MenuItemType): boolean {
  return item.availability !== false && isItemOnChannel(item, "pos");
}

/**
 * Screen 3's data from the same stores and rules as MenuSection: POS-visible
 * menus available now, their categories in schedule, items sold on the POS
 * channel. Items come from the menu tree so `price` is the context price.
 * `now` (minute tick) re-evaluates the schedules; `query` searches every
 * chip's items by name and hides the chips.
 */
export function useMenuRows(orderId: string, chipKey: string | null, query: string, now: number): MenuRows {
  const menus = useMenuStore((s) => s.menus);
  const isMenuAvailableNow = useMenuStore((s) => s.isMenuAvailableNow);
  const isCategoryAvailableNow = useMenuStore((s) => s.isCategoryAvailableNow);
  const unlockedMenus = useMenuStore((s) => s.temporaryActiveMenus);
  const unlockedCategories = useMenuStore((s) => s.temporaryActiveCategories);
  const storeId = useStoreSettingsStore((s) => s.selectedStore?.id ?? null);
  const hiddenMenuIds = useMenuVisibilityStore(
    (s) => (storeId ? s.hiddenMenuIdsByLocation[storeId] : null) ?? EMPTY_HIDDEN,
  );
  const items = useOrderStore((s) => s.ordersById[orderId]?.items);

  const chips = useMemo(() => {
    const at = new Date(now);
    const unlockedMenu = new Set(unlockedMenus);
    const unlockedCategory = new Set(unlockedCategories);
    const result: MenuChip[] = [];
    for (const menu of filterPosOrderEntryMenus(menus, hiddenMenuIds)) {
      const menuOpen = isMenuAvailableNow(menu.id, at) || unlockedMenu.has(menu.name);
      if (!menuOpen) continue;
      for (const category of menu.categories) {
        if (!category.items?.some(sellable)) continue;
        if (!isCategoryAvailableNow(category.name, at) && !unlockedCategory.has(category.name)) continue;
        result.push({
          key: `${menu.id}:${category.id}`,
          label: category.name,
          menuId: menu.id,
          categoryId: category.id,
        });
      }
    }
    return result;
  }, [menus, hiddenMenuIds, isMenuAvailableNow, isCategoryAvailableNow, unlockedMenus, unlockedCategories, now]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const wanted = needle ? chips : chips.filter((c) => c.key === chipKey);
    const seen = new Set<string>();
    const result: MenuRowData[] = [];
    for (const chip of wanted) {
      const menu = menus.find((m) => m.id === chip.menuId);
      const category = menu?.categories.find((c) => c.id === chip.categoryId);
      for (const item of category?.items ?? []) {
        if (!sellable(item) || seen.has(item.id)) continue;
        if (needle && !item.name.toLowerCase().includes(needle)) continue;
        seen.add(item.id);
        result.push({ item, menuId: chip.menuId, categoryId: chip.categoryId });
      }
    }
    return result;
  }, [menus, chips, chipKey, query]);

  const inOrder = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of items ?? []) {
      if (item.is_voided || item.isDraft || !isKitchenItemUnsent(item)) continue;
      counts[item.menuItemId] = (counts[item.menuItemId] ?? 0) + item.quantity;
    }
    return counts;
  }, [items]);

  return { chips, rows, inOrder };
}
