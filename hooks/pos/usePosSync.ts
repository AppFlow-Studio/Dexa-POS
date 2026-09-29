import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import {
  bootstrapRetryDelayMs,
  classifyBootstrapError,
  shouldRetryBootstrap,
} from "@/lib/network/bootstrapRetryPolicy";
import { connectionQuality } from "@/lib/network/connectionQuality";
import { DEADLINES } from "@/lib/network/deadlines";
import { withDeadline } from "@/lib/network/withDeadline";
import {
  KEY_BOOTSTRAP_FETCH_MS,
  KEY_BOOTSTRAP_STATEMENT_TIMEOUT,
} from "@/lib/telemetry/keys";
import { recordCount, recordSpan } from "@/lib/telemetry/registry";
import { useMenuStore } from "@/stores/useMenuStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import {
  ActiveModifierSnoozeSync,
  ActiveSnoozeSync,
  MenuItemIngredientSync,
  ModifierIngredientSync,
  PosSyncData,
  StationMenuScopeMap,
  TaxRate,
} from "@/types/menu";
import * as Sentry from "@sentry/react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";

/**
 * What a 57014 cost the server: the authenticator role's statement_timeout.
 * 8 s on production, 15 s on staging (2026-09-26). Reported for the record;
 * the state machine counts timeouts and does not read the value.
 */
const SERVER_STATEMENT_TIMEOUT_MS = 8_000;
const TIMEOUT_REPORT_MIN_INTERVAL_MS = 5 * 60_000;
let lastTimeoutReportAt = 0;

/**
 * A statement timeout is the server saying it is overloaded.
 *
 * It reaches the connection-quality state machine here because nothing else
 * would take it there: the deadline wrapper only reports its OWN deadline, and
 * the bootstrap's is 60 s, so an 8 s server-side cancel passed as an ordinary
 * error. The menu version watcher holds its refetch while the station is in
 * slow mode, and that only works if this kind of failure can put it there.
 *
 * Sentry gets one message per five minutes per app session. During an
 * incident every station hits this on every attempt.
 */
function reportBootstrapStatementTimeout(background: boolean): void {
  connectionQuality.reportTimeout("pos_sync", SERVER_STATEMENT_TIMEOUT_MS);
  recordCount(KEY_BOOTSTRAP_STATEMENT_TIMEOUT);

  const now = Date.now();
  if (now - lastTimeoutReportAt < TIMEOUT_REPORT_MIN_INTERVAL_MS) return;
  lastTimeoutReportAt = now;
  try {
    Sentry.captureMessage("pos.bootstrap statement_timeout (57014)", {
      level: "warning",
      tags: {
        event: "pos_bootstrap_timeout",
        rpc: "get_pos_bootstrap_v2",
        background: String(background),
      },
    });
  } catch {
    // observability must never mask the failure itself
  }
}

/**
 * Raw envelope returned by `get_pos_bootstrap_v2`.
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
  /**
   * station_id -> { scope, menu_ids }. Null/absent from a server that has not
   * run the station-scope migration yet, which the store treats as "every
   * station shows all" — today's behaviour.
   */
  station_menu_scopes?: StationMenuScopeMap | null;
}

/**
 * Hook to sync POS data from the backend.
 *
 * ONE round trip: `get_pos_bootstrap_v2` returns the menu tree, recipes, tax
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
  const queryClient = useQueryClient();

  /**
   * Is a usable menu already on screen?
   *
   * The menu store counts, not only the query cache. There is no query
   * persister: a station that booted from its offline snapshot has an empty
   * query cache and a full menu grid, and must not be treated as a first load
   * with the full retry budget.
   */
  const hasMenuOnScreen = () =>
    queryClient.getQueryData(["pos_sync", locationId]) !== undefined ||
    useMenuStore.getState().menus.length > 0;

  return useQuery<PosSyncData>({
    // Unique key for this location's full data
    queryKey: ["pos_sync", locationId],

    queryFn: async () => {
      if (!locationId) throw new Error("Location ID required");

      const startedAt = performance.now();
      // Single round trip. v2 enriches the existing bootstrap with menu channel
      // visibility. Wrapped with deadline so bad WiFi falls back to
      // TanStack `offlineFirst` cache instead of hanging the UI.
      const result = await withDeadline(
        async (signal) =>
          await (supabase.rpc as any)("get_pos_bootstrap_v2", {
            p_location_id: locationId,
          }).abortSignal(signal),
        DEADLINES.menuSync,
        "pos_sync",
      );

      if (result.error) {
        // The HTTP status rides on the RESPONSE, not on the error object. The
        // retry policy needs both, so they travel together from here.
        const failure = { ...result.error, status: result.status };
        if (classifyBootstrapError(failure) === "statement_timeout") {
          reportBootstrapStatementTimeout(hasMenuOnScreen());
        }
        // Log this to Sentry immediately - critical failure
        console.error("POS SYNC FAILED:", failure);
        throw failure;
      }
      recordSpan(KEY_BOOTSTRAP_FETCH_MS, performance.now() - startedAt);

      const data = result.data as unknown as PosBootstrapPayload | null;
      if (!data) throw new Error("get_pos_bootstrap_v2 returned no payload");

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
        // Carried on PosSyncData so both offline snapshots (MMKV and the SQLite
        // mirror) persist it — an airplane-mode cold start must scope the menu
        // exactly as the last live sync did.
        station_menu_scopes: data.station_menu_scopes ?? {},
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

    // An empty menu grid keeps the room it had (4 retries): the provider layers
    // a backoff loop on top, so exhausting the budget is not terminal, but
    // every attempt spent here is one the operator doesn't wait through.
    //
    // A station that already shows a menu retries at most once, and never on
    // a statement timeout: see lib/network/bootstrapRetryPolicy.
    retry: (failureCount, error) =>
      shouldRetryBootstrap({
        failureCount,
        error,
        hasData: hasMenuOnScreen(),
        isSlow: connectionQuality.isSlow(),
      }),
    retryDelay: (failureCount, error) =>
      bootstrapRetryDelayMs(failureCount, error),
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
