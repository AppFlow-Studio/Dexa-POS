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

      const { data, error } = await supabase.rpc("get_pos_full_sync", {
        p_location_id: locationId,
      });

      if (error) {
        // Log this to Sentry immediately - critical failure
        console.error("POS SYNC FAILED:", error);
        throw error;
      }
      return data as unknown as PosSyncData;
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

  return (locationId: string) => {
    return queryClient.invalidateQueries({
      queryKey: ["pos_sync", locationId],
    });
  };
};
