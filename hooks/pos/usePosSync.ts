import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { DEADLINES } from "@/lib/network/deadlines";
import { withDeadline } from "@/lib/network/withDeadline";
import { PosSyncData } from "@/types/menu";
import { useQuery, useQueryClient } from "@tanstack/react-query";

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
 * Hook to sync POS data from the backend.
 * This fetches the full menu hierarchy for a given location.
 *
 * @param locationId - The UUID of the location to sync data for
 * @returns TanStack Query result with PosSyncData
 */
export const usePosSync = (locationId: string | null) => {
  const supabase = useSupabaseClient();

  return useQuery<PosSyncData>({
    // Unique key for this location's full data
    queryKey: ["pos_sync", locationId],

    queryFn: async () => {
      if (!locationId) throw new Error("Location ID required");

      // Fetch Menu, Ingredients, and Modifier Ingredients in parallel.
      // Wrapped with deadline so bad WiFi falls back to TanStack `offlineFirst` cache
      // instead of hanging the UI. See plan: lets-look-into-this-stateless-blossom.md.
      const [syncResult, menuItemIngredientsResult, modifierIngredientsResult] =
        await withDeadline(
          (signal) =>
            Promise.all([
              supabase
                .rpc("get_pos_full_sync", { p_location_id: locationId })
                .abortSignal(signal),
              supabase
                .from("menu_item_recipes")
                .select("id, menu_item_id, inventory_item_id, quantity_used")
                .abortSignal(signal),
              supabase
                .from("modifier_group_item_recipes")
                .select("id, modifier_group_item_id, inventory_item_id, quantity_used")
                .abortSignal(signal),
            ]),
          DEADLINES.menuSync,
          "pos_sync",
        );

      if (syncResult.error) {
        // Log this to Sentry immediately - critical failure
        console.error("POS SYNC FAILED:", syncResult.error);
        throw syncResult.error;
      }

      const data = syncResult.data as unknown as PosSyncData;

      if (menuItemIngredientsResult.error) {
        console.warn(
          "menu_item_ingredients fetch warning:",
          menuItemIngredientsResult.error,
        );
      }

      if (modifierIngredientsResult.error) {
        console.warn(
          "modifier_group_item_ingredients fetch warning:",
          modifierIngredientsResult.error,
        );
      }

      console.log("DEBUG: Synced Menu Data:", data.menus?.[0]);

      // Keep recipe data returned by the RPC as the source of truth.
      // Only fall back to direct table queries when they actually return rows.
      return {
        ...data,
        menu_item_ingredients:
          menuItemIngredientsResult.data &&
          menuItemIngredientsResult.data.length > 0
            ? (menuItemIngredientsResult.data as MenuItemRecipeRow[])
                .filter((row) => !!row.inventory_item_id)
                .map((row) => ({
                  id: row.id,
                  menu_item_id: row.menu_item_id,
                  inventory_item_id: row.inventory_item_id as string,
                  quantity: row.quantity_used ?? 0,
                }))
            : data.menu_item_ingredients || [],
        modifier_group_item_ingredients:
          modifierIngredientsResult.data &&
          modifierIngredientsResult.data.length > 0
            ? (
                modifierIngredientsResult.data as ModifierGroupItemRecipeRow[]
              ).map((row) => ({
                id: row.id,
                modifier_group_item_id: row.modifier_group_item_id,
                inventory_item_id: row.inventory_item_id,
                quantity: row.quantity_used ?? 0,
              }))
            : data.modifier_group_item_ingredients || [],
      };
    },

    // Only run if we have a locationId
    enabled: !!locationId,

    // CRITICAL OFFLINE SETTINGS
    networkMode: "offlineFirst", // Serve from cache if no internet
    staleTime: Infinity, // Data never becomes "stale" automatically. We control updates.
    gcTime: 1000 * 60 * 60 * 2, // Keep in garbage collection for 2 hours
  });
};

/**
 * Helper hook to manually trigger a sync (e.g., Pull-to-Refresh or "Sync" button)
 *
 * @returns Function to invalidate and refetch POS data for a location
 */
export const useTriggerPosSync = () => {
  const queryClient = useQueryClient();

  return (locationId: string, merchantId?: string) => {
    const promises = [
      queryClient.invalidateQueries({
        queryKey: ["pos_sync", locationId],
      }),
    ];
    if (merchantId) {
      promises.push(
        queryClient.invalidateQueries({
          queryKey: ["standalone_sync", merchantId, locationId],
        }),
      );
    }
    return Promise.all(promises);
  };
};
