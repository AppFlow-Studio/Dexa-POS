import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { useSession } from "@clerk/clerk-expo";
import { useQuery } from "@tanstack/react-query";

import { MenuItemIngredientSync, ModifierIngredientSync } from "@/types/menu";

interface MenuItemRecipeRow {
  id: string;
  menu_item_id: string;
  inventory_item_id: string | null;
  quantity_used: number | null;
}

interface ModifierGroupItemRecipeRow {
  id: string;
  modifier_group_item_id: string;
  inventory_item_id: string;
  quantity_used: number;
}

/**
 * Types for standalone data (not part of menu hierarchy)
 */
export interface StandaloneCategory {
  id: string;
  name: string;
  description: string | null;
  image: string | null;
  location_id: string | null; // null = global, UUID = local
  location_name: string | null;
  is_active: boolean;
  item_count: number;
  items: StandaloneCategoryItem[];
}

export interface StandaloneCategoryItem {
  menu_item_id: string;
  display_order: number;
  menu_item: {
    id: string;
    name: string;
    effective_price: number;
    effective_cash_price: number | null;
    effective_availability: boolean;
  };
}

export interface StandaloneItem {
  id: string;
  name: string;
  description: string | null;
  image: string | null;
  base_price: number;
  base_cash_price: number | null;
  effective_price: number;
  effective_cash_price: number | null;
  effective_availability: boolean;
  stock_tracking_mode: string | null;
  // Location ownership - null = global (merchant-wide), UUID = local to that location
  location_id: string | null;
  categories: {
    id: string;
    name: string;
    location_id: string | null;
  }[];
}

export interface StandaloneModifierGroup {
  id: string;
  name: string;
  description: string | null;
  is_required: boolean;
  min_selections: number;
  max_selections: number | null;
  display_order: number | null;
  is_active: boolean;
  location_id: string | null; // null = global, UUID = local
  modifier_group_items: StandaloneModifierItem[];
  // Expanded fields for deep sync
  location_name?: { name: string };
  menu_item_modifier_groups?: {
    id: string;
    menu_item: {
      id: string;
      name: string;
      price: number;
      image?: string;
      availability?: boolean;
    };
  }[];
  location_override?: {
    id: string;
    is_active: boolean;
    location_id: string;
  }[];
}

export interface StandaloneModifierItem {
  id: string;
  name: string;
  price_modifier: number;
  is_active: boolean;
  is_default: boolean;
  display_order: number | null;
}

/**
 * Standalone menu - fetched directly without is_active filter
 * to show both active and inactive menus
 */
export interface StandaloneMenu {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  location_id: string | null;
  display_order: number | null;
  created_at: string;
  // Categories linked to this menu
  menu_categories?: {
    category_id: string;
    display_order: number | null;
    is_active: boolean;
  }[];
}

export interface StandaloneSyncData {
  categories: StandaloneCategory[];
  items: StandaloneItem[];
  modifierGroups: StandaloneModifierGroup[];
  menus: StandaloneMenu[];
  menu_item_ingredients: MenuItemIngredientSync[];
  modifier_group_item_ingredients: ModifierIngredientSync[];
}

/**
 * Hook to fetch ALL standalone entities (categories, items, modifiers)
 * that may not be part of any menu hierarchy.
 *
 * @param merchantId - The merchant UUID
 * @param locationId - The location UUID
 */
export const useStandaloneSync = (
  merchantId: string | null,
  locationId: string | null
) => {
  const supabase = useSupabaseClient();
  const { session, isLoaded: isSessionLoaded } = useSession();

  return useQuery<StandaloneSyncData>({
    queryKey: ["standalone_sync", merchantId, locationId],

    queryFn: async () => {
      if (!merchantId || !locationId) {
        throw new Error("Merchant ID and Location ID required");
      }
      console.log("merchantId", merchantId);
      console.log("locationId", locationId);
      // Fetch all 4 in parallel
      const [
        categoriesResult,
        itemsResult,
        modifiersResult,
        menusResult,
        menuItemIngredientsResult,
        modifierIngredientsResult,
      ] = await Promise.all([
        // 1. Categories via RPC
        supabase.rpc("get_categories_for_location", {
          p_merchant_id: merchantId,
          p_location_id: locationId,
        }),

        // 2. Items via RPC
        supabase.rpc("get_items_for_location_library", {
          p_merchant_id: merchantId,
          p_location_id: locationId,
        }),

        // 3. Modifiers via direct query (matching working implementation from menu/index.tsx)
        supabase
          .from("modifier_groups")
          .select(
            `
          *,
          location_name:locations(name),
          modifier_group_items(*),
          menu_item_modifier_groups(
            id,
            menu_item:menu_items(id, name, price)
          ),
          location_override:location_modifier_group_overrides!left(
            id,
            is_active,
            location_id
          )
        `
          )
          // Note: We don't have merchant_id filter here - the RLS will handle it
          .or(`location_id.is.null,location_id.eq.${locationId}`)
          .order("display_order", { ascending: true, nullsFirst: false })
          .order("created_at", { ascending: false }),

        // 4. Menus via direct query (like website - NO is_active filter)
        supabase
          .from("menus")
          .select(
            `
              id, name, description, is_active, location_id, display_order, created_at,
              menu_categories(category_id, display_order, is_active)
            `
          )
          .eq("merchant_id", merchantId)
          .or(`location_id.is.null,location_id.eq.${locationId}`)
          .order("display_order", { ascending: true, nullsFirst: false })
          .order("created_at", { ascending: false }),

        // 5. Menu Item Recipes
        supabase
          .from("menu_item_recipes")
          .select("id, menu_item_id, inventory_item_id, quantity_used")
          .eq("merchant_id", merchantId),

        // 6. Modifier Group Item Recipes
        supabase
          .from("modifier_group_item_recipes")
          .select("id, modifier_group_item_id, inventory_item_id, quantity_used")
          .eq("merchant_id", merchantId),
      ]);
      // Log errors but don't fail completely
      if (categoriesResult.error) {
        console.error(
          "Categories standalone fetch error:",
          categoriesResult.error
        );
      }
      if (menuItemIngredientsResult.error) {
        console.error(
          "Menu Item Ingredients fetch error:",
          menuItemIngredientsResult.error
        );
      }
      if (modifierIngredientsResult.error) {
        console.error(
          "Modifier Ingredients fetch error:",
          modifierIngredientsResult.error
        );
      }
      if (itemsResult.error) {
        console.error("Items standalone fetch error:", itemsResult.error);
      }
      if (modifiersResult.error) {
        console.error(
          "Modifiers standalone fetch error:",
          modifiersResult.error
        );
      }
      if (menusResult.error) {
        console.error("Menus standalone fetch error:", menusResult.error);
      }

      // Debug: Log ingredient counts
      console.log("DEBUG: useStandaloneSync raw results:", {
        menuItemIngredients: menuItemIngredientsResult.data?.length,
        modifierIngredients: modifierIngredientsResult.data?.length,
        items: itemsResult.data?.length,
      });

      // Debug: Send standalone data to debug server
      // const DEBUG_STANDALONE_URL = __DEV__
      //   ? "http://192.168.29.134:3456/debug/sync-data"
      //   : null;

      // if (DEBUG_STANDALONE_URL) {
      //   fetch(DEBUG_STANDALONE_URL, {
      //     method: "POST",
      //     headers: { "Content-Type": "application/json" },
      //     body: JSON.stringify({
      //       standaloneData: {
      //         items: itemsResult.data || [],
      //       },
      //       locationId,
      //       merchantId,
      //       timestamp: new Date().toISOString(),
      //     }),
      //   })
      //     .then((res) => res.json())
      //     .then((result) => {
      //       if (result.success) {
      //         console.log(
      //           "✅ Standalone data sent to debug server:",
      //           result.path
      //         );
      //       }
      //     })
      //     .catch((err) => {
      //       console.log("Debug server not running (optional):", err.message);
      //     });
      // }

      return {
        categories: (categoriesResult.data || []) as StandaloneCategory[],
        items: (itemsResult.data || []) as StandaloneItem[],
        modifierGroups:
          (modifiersResult.data as unknown as StandaloneModifierGroup[]) || [],
        menus: (menusResult.data || []) as StandaloneMenu[],
        menu_item_ingredients: (
          (menuItemIngredientsResult.data as MenuItemRecipeRow[] | null) || []
        )
          .filter((row) => !!row.inventory_item_id)
          .map((row) => ({
            id: row.id,
            menu_item_id: row.menu_item_id,
            inventory_item_id: row.inventory_item_id as string,
            quantity: row.quantity_used ?? 0,
          })),
        modifier_group_item_ingredients: (
          (modifierIngredientsResult.data as
            | ModifierGroupItemRecipeRow[]
            | null) || []
        ).map((row) => ({
          id: row.id,
          modifier_group_item_id: row.modifier_group_item_id,
          inventory_item_id: row.inventory_item_id,
          quantity: row.quantity_used ?? 0,
        })),
      };
    },

    // Wait for session to be loaded and have a valid token before querying
    enabled: !!merchantId && !!locationId && isSessionLoaded && !!session,

    // Same offline settings as main sync
    networkMode: "offlineFirst",
    staleTime: Infinity,
    gcTime: 1000 * 60 * 60 * 24, // 24 hours
  });
};
