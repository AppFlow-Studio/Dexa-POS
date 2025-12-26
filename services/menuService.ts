import { SupabaseClient } from "@supabase/supabase-js";

// ============================================================
// MENU SERVICE - Price Update Functions
// ============================================================

export type EditingLevel = 2 | 4 | 5;

export interface UpdateItemPriceParams {
  menuItemId: string;
  categoryId?: string | null;
  menuId?: string | null;
  locationId: string;
  price: number;
}

export interface ResetItemPriceParams {
  menuItemId: string;
  categoryId?: string | null;
  menuId?: string | null;
  locationId: string;
  targetLevel: 2 | 4;
}

export interface UpdateItemPriceResult {
  success: boolean;
  message?: string;
}

export interface ResetItemPriceResult {
  success: boolean;
  message?: string;
}

export const LEVEL_CONFIGS = {
  2: {
    label: "Location Price",
    icon: "📍",
    color: "#3b82f6",
    description: "Applies to all menus at your location",
  },
  4: {
    label: "Category Price",
    icon: "🏷️",
    color: "#a855f7",
    description: "Applies to this category at your location",
  },
  5: {
    label: "Menu Price",
    icon: "📋",
    color: "#f59e0b",
    description: "Applies to this menu only",
  },
} as const;

export class MenuService {
  /**
   * Determine which editing level based on context
   * Level 5: Has both menuId and categoryId (editing in a menu)
   * Level 4: Has categoryId only (editing in a category)
   * Level 2: Neither (editing in Items Library - location-wide)
   */
  static getEditingLevel({
    categoryId,
    menuId,
  }: {
    categoryId?: string | null;
    menuId?: string | null;
  }): EditingLevel {
    if (menuId && categoryId) {
      return 5;
    }
    if (categoryId) {
      return 4;
    }
    return 2;
  }

  /**
   * Get the level config for display purposes
   */
  static getLevelConfig(level: EditingLevel) {
    return LEVEL_CONFIGS[level];
  }

  /**
   * Update item price at the appropriate level
   * Uses upsert_category_item_override RPC function
   */
  static async updateItemPrice(
    client: SupabaseClient,
    params: UpdateItemPriceParams
  ): Promise<{ data: UpdateItemPriceResult | null; error: any }> {
    const { menuItemId, categoryId, menuId, locationId, price } = params;
    console.log("this is working", params);

    const { data, error } = await client.rpc("upsert_category_item_override", {
      p_menu_item_id: menuItemId,
      p_category_id: categoryId || null,
      p_menu_id: menuId || null,
      p_location_id: locationId,
      p_custom_price: price,
    });

    if (error) {
      console.error("Failed to update item price:", error);
      return { data: null, error };
    }

    return {
      data: { success: true, message: "Price updated successfully" },
      error: null,
    };
  }

  /**
   * Reset item price to lower level
   * Uses reset_category_item_to_level RPC function
   *
   * Level 5 can reset to Level 4 (category) or Level 2 (location)
   * Level 4 can reset to Level 2 (location)
   * Level 2 cannot reset (would need merchant admin)
   */
  static async resetItemPrice(
    client: SupabaseClient,
    params: ResetItemPriceParams
  ): Promise<{ data: ResetItemPriceResult | null; error: any }> {
    const { menuItemId, categoryId, menuId, locationId, targetLevel } = params;

    const { data, error } = await client.rpc("reset_category_item_to_level", {
      p_menu_item_id: menuItemId,
      p_category_id: categoryId || null,
      p_menu_id: menuId || null,
      p_location_id: locationId,
      p_target_level: targetLevel,
    });

    if (error) {
      console.error("Failed to reset item price:", error);
      return { data: null, error };
    }

    return {
      data: { success: true, message: "Price reset successfully" },
      error: null,
    };
  }

  /**
   * Get the target level for reset based on current level
   * Returns null if reset is not possible (Level 2)
   */
  static getResetTargetLevel(currentLevel: EditingLevel): 2 | 4 | null {
    if (currentLevel === 5) {
      return 4; // Reset menu price to category price
    }
    if (currentLevel === 4) {
      return 2; // Reset category price to location price
    }
    return null; // Level 2 cannot reset
  }

  /**
   * Get a user-friendly description for the reset action
   */
  static getResetDescription(currentLevel: EditingLevel): string | null {
    if (currentLevel === 5) {
      return "Reset to Category Price";
    }
    if (currentLevel === 4) {
      return "Reset to Location Price";
    }
    return null;
  }
}
