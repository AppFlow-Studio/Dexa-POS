import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { useQuery } from "@tanstack/react-query";

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

export interface StandaloneSyncData {
  categories: StandaloneCategory[];
  items: StandaloneItem[];
  modifierGroups: StandaloneModifierGroup[];
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

  return useQuery<StandaloneSyncData>({
    queryKey: ["standalone_sync", merchantId, locationId],

    queryFn: async () => {
      if (!merchantId || !locationId) {
        throw new Error("Merchant ID and Location ID required");
      }
      console.log("merchantId", merchantId);
      console.log("locationId", locationId);
      // Fetch all 3 in parallel
      const [categoriesResult, itemsResult, modifiersResult] =
        await Promise.all([
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
          // This query matches the GetModifierGroups function that successfully fetches 8 groups
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
            // Note: We don't filter by merchant_id here - RLS will handle it
            // Get global groups (location_id IS NULL) + location-specific groups
            .or(`location_id.is.null,location_id.eq.${locationId}`)
            .order("display_order", { ascending: true, nullsFirst: false })
            .order("created_at", { ascending: false }),
        ]);

      console.log("modifiersResult", modifiersResult.data);
      // Log errors but don't fail completely
      if (categoriesResult.error) {
        console.error(
          "Categories standalone fetch error:",
          categoriesResult.error
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

      // Debug: Send standalone data to debug server
      const DEBUG_STANDALONE_URL = __DEV__
        ? "http://192.168.29.134:3456/debug/sync-data"
        : null;

      if (DEBUG_STANDALONE_URL) {
        fetch(DEBUG_STANDALONE_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            standaloneData: {
              items: itemsResult.data || [],
            },
            locationId,
            merchantId,
            timestamp: new Date().toISOString(),
          }),
        })
          .then((res) => res.json())
          .then((result) => {
            if (result.success) {
              console.log(
                "✅ Standalone data sent to debug server:",
                result.path
              );
            }
          })
          .catch((err) => {
            console.log("Debug server not running (optional):", err.message);
          });
      }

      return {
        categories: (categoriesResult.data || []) as StandaloneCategory[],
        items: (itemsResult.data || []) as StandaloneItem[],
        modifierGroups:
          (modifiersResult.data as unknown as StandaloneModifierGroup[]) || [],
      };
    },

    enabled: !!merchantId && !!locationId,

    // Same offline settings as main sync
    networkMode: "offlineFirst",
    staleTime: Infinity,
    gcTime: 1000 * 60 * 60 * 24, // 24 hours
  });
};
