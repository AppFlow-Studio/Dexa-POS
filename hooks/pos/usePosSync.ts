import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { DEADLINES } from "@/lib/network/deadlines";
import { withDeadline } from "@/lib/network/withDeadline";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import {
  ActiveModifierSnoozeSync,
  ActiveSnoozeSync,
  MenuItemIngredientSync,
  ModifierIngredientSync,
  PosSyncData,
  TaxRate,
} from "@/types/menu";
import { useQuery, useQueryClient } from "@tanstack/react-query";

/**
 * Raw envelope returned by `get_pos_bootstrap_v1`.
 *
 * Differs from `PosSyncData` in one place: `snoozes` arrives as the grouped
 * `{ items, modifiers }` object that `get_active_snoozes` produces, and is
 * flattened into the two arrays the menu store wants below.
 */
interface PosBootstrapPayload {
  version: string;
  generated_at: string;
  synced_at: string;
  location_id: string;
  menus: PosSyncData["menus"];
  menu_item_ingredients: MenuItemIngredientSync[] | null;
  modifier_group_item_ingredients: ModifierIngredientSync[] | null;
  tax_rates: TaxRate[] | null;
  snoozes: { items?: any[]; modifiers?: any[] } | null;
}

/**
 * Hook to sync POS data from the backend.
 *
 * ONE round trip: `get_pos_bootstrap_v1` returns the menu tree, recipes, tax
 * rates and active snoozes in a single versioned envelope. This replaced five
 * parallel requests (get_pos_full_sync + two recipe tables + tax_rates +
 * get_active_snoozes), two of which duplicated queries useStandaloneSync was
 * also running on the boot path.
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

      // Single round trip. Wrapped with deadline so bad WiFi falls back to
      // TanStack `offlineFirst` cache instead of hanging the UI.
      const result = await withDeadline(
        async (signal) =>
          await supabase
            .rpc("get_pos_bootstrap_v1", { p_location_id: locationId })
            .abortSignal(signal),
        DEADLINES.menuSync,
        "pos_sync",
      );

      if (result.error) {
        // Log this to Sentry immediately - critical failure
        console.error("POS SYNC FAILED:", result.error);
        throw result.error;
      }

      const data = result.data as unknown as PosBootstrapPayload | null;
      if (!data) throw new Error("get_pos_bootstrap_v1 returned no payload");

      // Tax rates now ride along in the envelope. The zero-row case is still
      // worth shouting about: it usually means a stale JWT or a location
      // outside the user's set rather than a genuinely untaxed location, and
      // setTaxRates preserves existing rates instead of zeroing tax.
      const taxRates = data.tax_rates ?? [];
      if (taxRates.length === 0) {
        console.warn(
          "tax_rates empty in bootstrap payload — preserving existing rates if any",
        );
      } else {
        console.log("DEBUG: Synced Tax Rates:", taxRates);
      }
      useStoreSettingsStore.getState().setTaxRates(taxRates);

      // Flatten active snoozes ({ items, modifiers }) into the two lists the
      // menu store stamps onto menu items + modifier options.
      const rawSnoozes = data.snoozes ?? {};
      const snoozes: ActiveSnoozeSync[] = (rawSnoozes.items ?? []).map(
        (s: any) => ({
          menu_item_id: s.menu_item_id,
          snoozed_until: s.snoozed_until ?? null,
          snooze_reason: s.snooze_reason ?? null,
        }),
      );
      const modifierSnoozes: ActiveModifierSnoozeSync[] = (
        rawSnoozes.modifiers ?? []
      ).map((m: any) => ({
        modifier_group_item_id: m.modifier_group_item_id,
        modifier_group_id: m.modifier_group_id ?? null,
        snoozed_until: m.snoozed_until ?? null,
        snooze_reason: m.snooze_reason ?? null,
      }));

      console.log("DEBUG: Synced Menu Data:", {
        version: data.version,
        menus: data.menus?.length ?? 0,
        firstMenu: data.menus?.[0],
      });

      return {
        version: data.version,
        synced_at: data.synced_at,
        location_id: data.location_id,
        menus: data.menus ?? [],
        snoozes,
        modifierSnoozes,
        menu_item_ingredients: data.menu_item_ingredients ?? [],
        modifier_group_item_ingredients:
          data.modifier_group_item_ingredients ?? [],
      };
    },

    // Only run if we have a locationId
    enabled: !!locationId,

    // CRITICAL OFFLINE SETTINGS
    networkMode: "offlineFirst", // Serve from cache if no internet
    staleTime: Infinity, // Data never becomes "stale" automatically. We control updates.
    gcTime: 1000 * 60 * 60 * 2, // Keep in garbage collection for 2 hours

    // Deliberate override of the client-wide `refetchOnReconnect: false`.
    // That default exists to stop a stale-query stampede on reconnect — but
    // `staleTime: Infinity` means a query holding data is never stale, so this
    // can ONLY fire when there is no menu at all (dataUpdatedAt === 0, i.e. the
    // boot sync failed). That is exactly the case the POS must recover from:
    // without it, three failed attempts left the menu permanently empty until
    // someone found Settings → Sync POS. One query, one refetch, no stampede.
    refetchOnReconnect: true,

    // Give the boot sync more room before it gives up. The provider layers a
    // backoff retry loop on top of this (see PosSyncProvider), so exhausting
    // the budget is no longer terminal — but every attempt spent here is one
    // the operator doesn't wait through.
    retry: 4,
    retryDelay: (attemptIndex) => Math.min(2_000 * 2 ** attemptIndex, 30_000),
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
