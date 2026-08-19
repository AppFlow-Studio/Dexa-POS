import {
  DEFAULT_MENU_ITEM_PLACEHOLDER_ICON,
  extractMenuItemPlaceholderIconKey,
  type MenuItemPlaceholderIconKey,
} from "@/lib/menuItemPlaceholderIcon";
import type { MenuItemType } from "@/lib/types";

const VALID_PLACEHOLDER_KEYS = new Set<MenuItemPlaceholderIconKey>([
  "utensils",
  "drink",
  "burger",
  "pizza",
  "dessert",
  "coffee",
  "salad",
  "seafood",
]);

/**
 * Resolve the best placeholder-icon key for a menu item with no usable image.
 * Lifted out of components/menu/MenuItem.tsx (where it was POS-private) so kiosk
 * templates can share the same heuristic without importing POS-coupled code.
 */
export function resolveMenuItemFallbackIconKey(
  item: MenuItemType,
): MenuItemPlaceholderIconKey {
  const fromPlaceholderField = item.placeholderIcon as
    | MenuItemPlaceholderIconKey
    | undefined;

  if (fromPlaceholderField && VALID_PLACEHOLDER_KEYS.has(fromPlaceholderField)) {
    return fromPlaceholderField;
  }

  const fromCardBgColor = extractMenuItemPlaceholderIconKey(item.cardBgColor);
  if (fromCardBgColor) {
    return fromCardBgColor;
  }

  const hintSource = `${item.name} ${
    item.category?.join(" ") || ""
  }`.toLowerCase();

  if (/coffee|espresso|latte|cappuccino|tea/.test(hintSource)) return "coffee";
  if (/soda|drink|juice|cola|lemonade|smoothie|beverage/.test(hintSource))
    return "drink";
  if (/burger|sandwich/.test(hintSource)) return "burger";
  if (/pizza|slice/.test(hintSource)) return "pizza";
  if (/cake|dessert|ice\s*cream|cookie|brownie|sweet/.test(hintSource))
    return "dessert";
  if (/salad|greens/.test(hintSource)) return "salad";
  if (/fish|shrimp|salmon|tuna|seafood/.test(hintSource)) return "seafood";

  return DEFAULT_MENU_ITEM_PLACEHOLDER_ICON;
}
