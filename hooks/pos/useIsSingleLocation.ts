import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { resolveIsSingleLocation } from "@/lib/menu/singleLocationScope";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
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
 * Merchant admins count all active merchant locations because they may not have
 * location_members rows. Other staff count their active accessible locations.
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
  const merchantId = useStoreSettingsStore(
    (state) => state.selectedStore?.merchant_id,
  );

  const { data, isLoading } = useQuery({
    queryKey: ["single_location_scope", userId, merchantId],
    queryFn: () =>
      resolveIsSingleLocation(
        supabase,
        userId as string,
        merchantId as string,
      ),
    enabled: !!userId && !!merchantId,
    networkMode: "offlineFirst",
    staleTime: Infinity,
    gcTime: 1000 * 60 * 60 * 2,
  });

  return {
    // Fail closed unless the resolver positively confirms a single location.
    isSingleLocation: data === true,
    isLoading,
  };
};
