import type { Category } from "@/lib/types";

export interface CategoryLockState {
  /** Has at least one schedule window. Legacy string entries never do. */
  isScheduled: boolean;
  /** Open on its schedule and switched on for this menu, with no grant. */
  isNormallyAvailable: boolean;
  /** A manager grant on the category, or on the menu that holds it. */
  hasOverride: boolean;
  /** Staff can open it without a PIN. */
  isAvailable: boolean;
  /** Scheduled, closed, and not unlocked: render it locked. */
  showLock: boolean;
}

interface CategoryLockInput {
  category: Category | string;
  menu: { id: string; name: string } | undefined;
  at: Date;
  isCategoryAvailableNow: (
    categoryId: string,
    menuId?: string | null,
    at?: Date,
  ) => boolean;
  isCategoryActiveForMenu: (menuId: string, categoryId: string) => boolean;
  grantedCategories: ReadonlySet<string>;
  grantedMenus: ReadonlySet<string>;
}

/**
 * How a category reads on every POS navigation surface: the tab row, the popup
 * category grid, and the classic menu picker. One function so the three cannot
 * disagree about whether a category is locked.
 */
export function getCategoryLockState({
  category,
  menu,
  at,
  isCategoryAvailableNow,
  isCategoryActiveForMenu,
  grantedCategories,
  grantedMenus,
}: CategoryLockInput): CategoryLockState {
  const isLegacy = typeof category === "string";
  const name = isLegacy ? category : category.name;
  const isScheduled = !isLegacy && !!category.schedules?.length;
  const isOnSchedule =
    isLegacy ||
    (!!menu && isCategoryAvailableNow(category.id, menu.id, at));
  const isNormallyAvailable =
    !!menu &&
    isOnSchedule &&
    isCategoryActiveForMenu(menu.id, isLegacy ? category : category.id);
  // A grant on the containing menu counts too: unlocking a menu is what lets
  // staff browse it, and MenuSection renders its items on the same basis.
  const hasOverride =
    grantedCategories.has(name) || (!!menu && grantedMenus.has(menu.name));
  const isAvailable = isNormallyAvailable || hasOverride;

  return {
    isScheduled,
    isNormallyAvailable,
    hasOverride,
    isAvailable,
    showLock: isScheduled && !isAvailable,
  };
}
