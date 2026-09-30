import {
  isItemOrderable,
  useModifierGroupResolver,
} from "@/components/kiosk/shared/kioskItemAvailability";
import {
  buildKioskSearchEntry,
  type KioskSearchEntry,
} from "@/components/kiosk/shared/kioskMenuSearch";
import { useKioskScheduledMenus } from "@/components/kiosk/shared/useKioskScheduledMenus";
import type { Category } from "@/lib/types";
import { useMemo } from "react";

/**
 * The searchable index: every item a customer could actually order right now,
 * flattened out of the menu tree with its folded text precomputed.
 *
 * Applies exactly the same visibility filters the menu templates apply to the
 * rail and the grid — kiosk channel, per-station scope and menu/category
 * schedules (all inside `useKioskScheduledMenus`), 86 state and unbuildable
 * required modifier groups — so search can never surface something the
 * browsing path deliberately hides. It is built from the same inputs, in one
 * `useMemo`, so it recomputes when the menu changes or a schedule window
 * opens/closes, not per keystroke.
 */
export function useKioskSearchEntries(): KioskSearchEntry[] {
  const { menus } = useKioskScheduledMenus();
  const resolveGroups = useModifierGroupResolver();

  return useMemo(() => {
    const entries: KioskSearchEntry[] = [];
    // An item can be listed under more than one menu or category. Index the
    // first placement only: two identical result rows look like a bug, and the
    // customer has no way to tell which one to tap.
    const seen = new Set<string>();

    for (const menu of menus) {
      for (const category of menu.categories as Category[]) {
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
  }, [menus, resolveGroups]);
}
