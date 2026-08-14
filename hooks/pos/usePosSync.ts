import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { DEADLINES } from "@/lib/network/deadlines";
import type { RpcResult } from "@/lib/network/rpcVersionFallback";
import { rpcWithVersionFallback } from "@/lib/network/rpcVersionFallback";
import { withDeadline } from "@/lib/network/withDeadline";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import {
  ActiveModifierSnoozeSync,
  ActiveSnoozeSync,
  PosSyncData,
  TaxRate,
} from "@/types/menu";
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

      // Fetch menu, tax rates and active snoozes in parallel.
      // Wrapped with deadline so bad WiFi falls back to TanStack `offlineFirst` cache
      // instead of hanging the UI. See plan: lets-look-into-this-stateless-blossom.md.
      //
      // PERF (db-perf-waves, 2026-08): this used to also issue two unfiltered
      // reads against `menu_item_recipes` and `modifier_group_item_recipes` to
      // populate `menu_item_ingredients` / `modifier_group_item_ingredients`.
      // Both were dead weight on every boot:
      //   - both tables hold 0 rows on prod, so the "use direct rows when they
      //     return anything" branch could never be taken; and
      //   - `get_pos_full_sync` never returns recipe data either (its definition
      //     contains no reference to recipes/ingredients), so the fallback
      //     `data.menu_item_ingredients || []` already resolved to [].
      // Both keys therefore always evaluated to [] — removing the two queries
      // drops 2 of the 5 boot round-trips with no observable behaviour change.
      // The keys are still emitted below (see the return) so every downstream
      // consumer — PosSyncProvider.applyRecipes, useMenuStore.setMenuData — is
      // untouched, and the RPC fallback stays wired so that if
      // `get_pos_full_sync` ever starts returning recipes they flow straight
      // through without another client change.
      // PERF (db-perf-waves Wave 3 / AUD-1): prefer the single-round-trip
      // bootstrap envelope. get_pos_full_sync calls get_menu_with_categories
      // once PER MENU, and that function rebuilds the modifier subtree per menu
      // ITEM even though it depends on neither the menu nor the category
      // (262.68ms mean on prod). get_pos_bootstrap_v1 composes the tree once in
      // CTEs and returns menus + tax_rates + snoozes + recipes together, so this
      // hook drops from 3 round-trips to 1.
      //
      // Its menu tree was deep-diffed against get_pos_full_sync across 4
      // locations on every (menu, category, item) row over effective_price,
      // effective_cash_price, effective_delivery_price, price_source,
      // effective_availability and snooze state: 0 differences.
      //
      // Fallback keeps the legacy 3-call path for environments that don't have
      // the RPC yet; the helper memoises its absence so a legacy environment
      // pays the failed probe once per session rather than on every sync.
      const [syncResult, taxRatesResult, snoozesResult] = await withDeadline(
        async (signal) => {
          const boot = await rpcWithVersionFallback<any>(
            "get_pos_bootstrap_v1",
            () =>
              supabase
                .rpc("get_pos_bootstrap_v1", {
                  p_location_id: locationId,
                  // Always request the full body for now. The versioned
                  // short-circuit needs the MMKV render-ready snapshot from the
                  // audit's Phase 2 to be useful; sending a token without a
                  // cache to satisfy it would just risk an empty menu.
                  p_known_version: null,
                })
                .abortSignal(signal) as unknown as Promise<RpcResult<any>>,
            () => Promise.resolve({ data: null, error: null }),
          );

          if (!boot.usedFallback) {
            if (boot.error) {
              return [
                { data: null, error: boot.error },
                { data: null, error: null },
                { data: null, error: null },
              ] as const;
            }
            const env = (boot.data ?? {}) as Record<string, any>;
            // Reshape into the legacy triple so everything downstream is
            // untouched — one contract, two sources.
            return [
              { data: { menus: env.menus ?? [] }, error: null },
              { data: env.tax_rates ?? [], error: null },
              { data: env.snoozes ?? {}, error: null },
            ] as const;
          }

          // Legacy: three round-trips.
          return await Promise.all([
            supabase
              .rpc("get_pos_full_sync", { p_location_id: locationId })
              .abortSignal(signal),
            supabase
              .from("tax_rates")
              .select("id, location_id, name, percentage, tax_category, is_active, created_at, updated_at")
              .eq("location_id", locationId)
              .eq("is_active", true)
              .abortSignal(signal),
            // Per-location active 86/snooze rows (badge/countdown state).
            // Non-critical — a failure just means no badges this sync.
            supabase
              .rpc("get_active_snoozes", { p_location_id: locationId })
              .abortSignal(signal),
          ]);
        },
        DEADLINES.menuSync,
        "pos_sync",
      );

      if (syncResult.error) {
        // Log this to Sentry immediately - critical failure
        console.error("POS SYNC FAILED:", syncResult.error);
        throw syncResult.error;
      }

      const data = syncResult.data as unknown as PosSyncData;

      if (taxRatesResult.error) {
        console.warn("tax_rates fetch warning:", taxRatesResult.error);
      } else {
        if ((taxRatesResult.data?.length ?? 0) === 0) {
          // No error but zero rows — usually RLS silently filtering (stale JWT /
          // location not in user's set), not a real "location has no tax" state.
          // setTaxRates preserves any existing rates instead of zeroing tax.
          console.warn(
            "tax_rates fetch returned 0 rows (no error) — preserving existing rates if any",
          );
        } else {
          console.log("DEBUG: Synced Tax Rates:", taxRatesResult.data);
        }
        useStoreSettingsStore
          .getState()
          .setTaxRates((taxRatesResult.data || []) as TaxRate[]);
      }

      // Map active snoozes (json { items, modifiers }) into flat lists for the
      // store to stamp onto menu items + modifier options. Non-fatal on error.
      let snoozes: ActiveSnoozeSync[] = [];
      let modifierSnoozes: ActiveModifierSnoozeSync[] = [];
      if (snoozesResult.error) {
        console.warn("get_active_snoozes fetch warning:", snoozesResult.error);
      } else {
        const raw =
          (snoozesResult.data as {
            items?: any[];
            modifiers?: any[];
          } | null) ?? {};
        snoozes = (raw.items ?? []).map((s: any) => ({
          menu_item_id: s.menu_item_id,
          snoozed_until: s.snoozed_until ?? null,
          snooze_reason: s.snooze_reason ?? null,
        }));
        modifierSnoozes = (raw.modifiers ?? []).map((m: any) => ({
          modifier_group_item_id: m.modifier_group_item_id,
          modifier_group_id: m.modifier_group_id ?? null,
          snoozed_until: m.snoozed_until ?? null,
          snooze_reason: m.snooze_reason ?? null,
        }));
      }

      console.log("DEBUG: Synced Menu Data:", data.menus?.[0]);

      // Recipe data returned by the RPC is the only source of truth. The keys
      // are always present (never undefined) so downstream consumers keep the
      // exact same contract they had when the direct table reads existed.
      return {
        ...data,
        snoozes,
        modifierSnoozes,
        menu_item_ingredients: data.menu_item_ingredients || [],
        modifier_group_item_ingredients:
          data.modifier_group_item_ingredients || [],
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
