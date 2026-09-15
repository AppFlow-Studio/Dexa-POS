import {
  isItemOrderable,
  useModifierGroupResolver,
} from "@/components/kiosk/shared/kioskItemAvailability";
import {
  buildKioskSearchEntry,
  type KioskSearchEntry,
} from "@/components/kiosk/shared/kioskMenuSearch";
import { isMenuVisibleOnChannel } from "@/lib/menu/menuChannelVisibility";
import type { Category } from "@/lib/types";
import { useMenuStore } from "@/stores/useMenuStore";
import { useMemo } from "react";

/**
 * The searchable index: every item a customer could actually order right now,
 * flattened out of the menu tree with its folded text precomputed.
 *
 * Applies exactly the same visibility filters the menu templates apply to the
 * rail and the grid — kiosk channel, menu and category schedules, 86 state and
 * unbuildable required modifier groups — so search can never surface something
 * the browsing path deliberately hides. It is built from the same inputs, in
 * one `useMemo`, so it recomputes only when the menu itself changes, not per
 * keystroke.
 */
export function useKioskSearchEntries(): KioskSearchEntry[] {
  const menus = useMenuStore((s) => s.menus);
  const isMenuAvailableNow = useMenuStore((s) => s.isMenuAvailableNow);
  const isCategoryAvailableNow = useMenuStore((s) => s.isCategoryAvailableNow);
  const resolveGroups = useModifierGroupResolver();

  return useMemo(() => {
    const entries: KioskSearchEntry[] = [];
    // An item can be listed under more than one menu or category. Index the
    // first placement only: two identical result rows look like a bug, and the
    // customer has no way to tell which one to tap.
    const seen = new Set<string>();

    for (const menu of menus) {
      if (!isMenuVisibleOnChannel(menu, "kiosk")) continue;
      if (!isMenuAvailableNow(menu.id)) continue;

      for (const category of menu.categories as Category[]) {
        if (!category.isActive) continue;
        if (!isCategoryAvailableNow(category.name)) continue;

        for (const item of category.items ?? []) {
          if (seen.has(item.id)) continue;
          if (!isItemOrderable(item, resolveGroups)) continue;
          seen.add(item.id);
          entries.push(
            buildKioskSearchEntry(
              item,
              `${menu.id}:${category.id}`,
              category.name,
              menu.name,
            ),
          );
        }
      }
    }

    return entries;
  }, [menus, isMenuAvailableNow, isCategoryAvailableNow, resolveGroups]);
}
