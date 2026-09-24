import { useVisibleMenus } from "@/hooks/menu/useVisibleMenus";
import { useScheduleClock } from "@/hooks/useScheduleClock";
import type { Menu } from "@/lib/types";
import { useMenuStore } from "@/stores/useMenuStore";
import { useMemo } from "react";

/**
 * The menus a customer can browse on THIS kiosk right now — the one schedule
 * filter every kiosk template and kiosk search read, so browsing and search
 * cannot disagree about what is open.
 *
 * On top of `useVisibleMenus` (kiosk channel + per-station scope) it drops
 * menus outside their schedule and, inside each open menu, inactive or
 * off-schedule categories. Re-evaluated every minute via `useScheduleClock`,
 * so a category disappears when its window closes rather than at the next
 * menu rebuild. The kiosk has no manager override.
 *
 * `closedBySchedule` is true when the station has categories but none is open
 * right now — the templates show the "not available right now" state then
 * instead of an empty rail.
 */
export function useKioskScheduledMenus(): {
  menus: Menu[];
  closedBySchedule: boolean;
} {
  const visibleMenus = useVisibleMenus();
  const isMenuAvailableNow = useMenuStore((s) => s.isMenuAvailableNow);
  const isCategoryAvailableNow = useMenuStore((s) => s.isCategoryAvailableNow);
  const now = useScheduleClock();

  return useMemo(() => {
    const menus = visibleMenus
      .filter((m) => isMenuAvailableNow(m.id, now))
      .map((m) => ({
        ...m,
        categories: m.categories.filter(
          (c) => c.isActive && isCategoryAvailableNow(c.id, m.id, now),
        ),
      }));

    // Only a schedule can make an otherwise-orderable station empty here;
    // switched-off menus/categories are not "closed right now".
    const hasAnyCategory = visibleMenus.some(
      (m) => m.isActive && m.categories.some((c) => c.isActive),
    );
    const hasOpenCategory = menus.some((m) => m.categories.length > 0);

    return { menus, closedBySchedule: hasAnyCategory && !hasOpenCategory };
  }, [visibleMenus, isMenuAvailableNow, isCategoryAvailableNow, now]);
}
