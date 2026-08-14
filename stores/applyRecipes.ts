/**
 * Re-apply recipe (ingredient) data onto the menu store.
 *
 * Both `setMenuData` and `mergeStandaloneData` rebuild the item collections from
 * scratch, which drops the `recipe` field hanging off each menu item / modifier
 * option. Every path that touches those collections therefore re-applies recipes
 * afterwards.
 *
 * Shared by the POS boot sync (`PosSyncProvider`) and the lazily-loaded
 * menu-management route (`app/(main)/menu/_layout.tsx`) so the two can't drift.
 */

import { useMenuStore } from "@/stores/useMenuStore";

interface RecipeCarrier {
  menu_item_ingredients?: Array<{
    menu_item_id: string;
    inventory_item_id: string;
    quantity: number;
  }>;
  modifier_group_item_ingredients?: Array<{
    modifier_group_item_id: string;
    inventory_item_id: string;
    quantity: number;
  }>;
}

export const applyRecipes = (data: RecipeCarrier | null | undefined) => {
  if (!data) return;
  if (
    data.menu_item_ingredients?.length ||
    data.modifier_group_item_ingredients?.length
  ) {
    useMenuStore.getState().mergeRecipeData({
      menuRecipes: (data.menu_item_ingredients ?? []).map((r) => ({
        menu_item_id: r.menu_item_id,
        inventory_item_id: r.inventory_item_id,
        quantity: r.quantity,
      })),
      modifierRecipes: (data.modifier_group_item_ingredients ?? []).map((r) => ({
        modifier_group_item_id: r.modifier_group_item_id,
        inventory_item_id: r.inventory_item_id,
        quantity: r.quantity,
      })),
    });
  }
};
