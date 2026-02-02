import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { PosSyncData } from "@/types/menu";
import { useQuery, useQueryClient } from "@tanstack/react-query";

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

      // Fetch Menu, Ingredients, and Modifier Ingredients in parallel
      const [syncResult, menuItemIngredientsResult, modifierIngredientsResult] =
        await Promise.all([
          supabase.rpc("get_pos_full_sync", {
            p_location_id: locationId,
          }),
          supabase.from("menu_item_ingredients").select("*"),
          supabase.from("modifier_group_item_ingredients").select("*"),
        ]);

      if (syncResult.error) {
        // Log this to Sentry immediately - critical failure
        console.error("POS SYNC FAILED:", syncResult.error);
        throw syncResult.error;
      }

      const data = syncResult.data as unknown as PosSyncData;

      console.log("DEBUG: Synced Menu Data:", data.menus?.[0]);

      // Attach ingredients to the sync data object
      return {
        ...data,
        menu_item_ingredients: menuItemIngredientsResult.data || [],
        modifier_group_item_ingredients: modifierIngredientsResult.data || [],
      };
    },

    // Only run if we have a locationId
    enabled: !!locationId,

    // CRITICAL OFFLINE SETTINGS
    networkMode: "offlineFirst", // Serve from cache if no internet
    staleTime: Infinity, // Data never becomes "stale" automatically. We control updates.
    gcTime: 1000 * 60 * 60 * 24, // Keep in garbage collection for 24 hours
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
