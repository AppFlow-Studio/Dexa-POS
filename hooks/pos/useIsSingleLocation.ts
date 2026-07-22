import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { useAuth } from "@clerk/clerk-expo";
import { useQuery } from "@tanstack/react-query";

/**
 * Determines whether the current merchant operates a single location.
 *
 * Mirrors the website's single-location gate: single-location merchants edit
 * their menu against the GLOBAL core (`location_id = null`), so on the POS their
 * global items must be editable. Multi-location merchants must NOT edit the
 * global core directly — they use per-location overrides instead.
 *
 * Uses the existing `get_user_accessible_locations` RPC (see store-select.tsx)
 * and caches it with the same offline-first settings as `usePosSync`.
 *
 * IMPORTANT: defaults to `false` (treat as multi-location) while loading or on
 * error, so we never accidentally allow a multi-location user to mutate the
 * global menu core.
 */
export const useIsSingleLocation = (): {
  isSingleLocation: boolean;
  isLoading: boolean;
} => {
  const supabase = useSupabaseClient();
  const { userId } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["accessible_locations", userId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "get_user_accessible_locations",
        { p_user_id: userId as string },
      );
      if (error) throw error;
      return (data ?? []) as { location_id: string }[];
    },
    enabled: !!userId,
    networkMode: "offlineFirst",
    staleTime: Infinity,
    gcTime: 1000 * 60 * 60 * 2,
  });

  return {
    // Default to multi-location (false) unless we positively know there's <= 1.
    isSingleLocation: (data?.length ?? 0) > 0 && (data as any[]).length <= 1,
    isLoading,
  };
};
