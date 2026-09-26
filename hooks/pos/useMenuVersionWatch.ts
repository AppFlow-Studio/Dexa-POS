import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import {
  rpcWithVersionFallback,
  type RpcResult,
} from "@/lib/network/rpcVersionFallback";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

/**
 * Keeps menu structure and PRICES current without an app restart.
 *
 * `usePosSync` is `staleTime: Infinity` — deliberately, since a full menu
 * rebuild is expensive — so a price edited on the website never reached a
 * running station. The 86/availability half of this problem was already solved
 * by useMenuSnoozeReconcile's own poll; this is the other half.
 *
 * WHY A PROBE AND NOT `refetchInterval` ON usePosSync
 * Putting `refetchInterval: 60_000` on usePosSync would also work — PosSyncProvider
 * already compares the returned watermark and skips the rebuild when it matches
 * ("menu version unchanged — skipping rebuild"). But that pulls the ENTIRE menu
 * tree every minute purely to compare one string, all day, on every station, and
 * throws it away ~always. The version compare saves the store rebuild; it does
 * not save the transfer.
 *
 * So this polls `get_pos_menu_version_v3` — the same watermark with none of the
 * payload — and only invalidates `pos_sync` when the token actually moves. The
 * expensive fetch then happens exactly when there is something to fetch.
 *
 * WHY v3. `get_pos_menu_version_v1` is a verbatim copy of get_pos_bootstrap_v1's
 * watermark and stays that way. v2 folds in the per-station menu scope hash;
 * v3 adds a content hash of the location's menu/category schedules and is
 * byte-identical to get_pos_bootstrap_v3's `version`. Pointing this at an
 * older probe would leave it blind to scope or schedule edits.
 *
 * The invalidate is all this does: PosSyncProvider owns applying the payload,
 * writing the snapshots and stamping freshness. One transform, one owner.
 */

/**
 * Menu/price edits are rare and deliberate, so this polls far less often than
 * the 60s snooze reconcile beside it: an 86 is a mid-service decision, a price
 * change is not. The probe also runs on reconnect, on foreground (the
 * `pos.menu-version-probe` resume task in PosSyncProvider — `refetchOnWindowFocus`
 * is inert in RN without a focusManager), and Settings → "Check for menu
 * changes" forces it, so a manager who just edited a price or a schedule is
 * never actually waiting out this interval.
 */
export const MENU_VERSION_POLL_MS = 5 * 60_000;

export const menuVersionQueryKey = (locationId: string | null | undefined) =>
  ["menu_version", locationId] as const;

/**
 * The live menu watermark — equal to the `version` of the `pos_sync` payload
 * when both come from v3. Falls back to the v2 probe where the v3 migration
 * has not landed. Shared by this watcher and the manual "Check for menu
 * changes" actions so they always ask the same function.
 */
export async function fetchMenuVersion(
  supabase: SupabaseClient,
  locationId: string,
): Promise<string | null> {
  const { data, error } = await rpcWithVersionFallback<string>(
    "get_pos_menu_version_v3",
    () =>
      supabase.rpc("get_pos_menu_version_v3", {
        p_location_id: locationId,
      }) as unknown as Promise<RpcResult<string>>,
    () =>
      supabase.rpc("get_pos_menu_version_v2", {
        p_location_id: locationId,
      }) as unknown as Promise<RpcResult<string>>,
  );
  if (error) throw error;
  return data ?? null;
}

export function useMenuVersionWatch(locationId: string | undefined | null) {
  const supabase = useSupabaseClient();
  const queryClient = useQueryClient();

  const { data: remoteVersion } = useQuery({
    queryKey: menuVersionQueryKey(locationId),
    enabled: !!locationId && !!supabase,
    // The probe IS the freshness check, so it must never be served from cache:
    // a stale-but-fresh-enough token would defeat the entire point.
    staleTime: 0,
    refetchInterval: MENU_VERSION_POLL_MS,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    // Offline: keep the last token rather than erroring. Nothing invalidates
    // while offline (the compare below can only match), and the reconnect
    // refetch is what catches up.
    networkMode: "offlineFirst",
    // A probe that fails is not worth retrying hard — the next tick costs the
    // same as a retry, and foreground/reconnect both force one sooner.
    retry: 1,
    queryFn: () => fetchMenuVersion(supabase, locationId as string),
  });

  // The version last SEEN by this hook — not the one applied to the store.
  // PosSyncProvider owns that (appliedMenuVersionRef) and re-compares anyway, so
  // tracking it here only prevents re-invalidating the same change every tick
  // while the refetch is still in flight.
  const seenRef = useRef<{ locationId: string; version: string } | null>(null);

  useEffect(() => {
    if (!locationId || !remoteVersion) return;

    const seen = seenRef.current;

    // First observation for this location: adopt as the baseline. Do NOT
    // invalidate — the menu currently on screen came from the boot fetch, and
    // firing here would make every cold start pay a second full menu pull.
    if (!seen || seen.locationId !== locationId) {
      seenRef.current = { locationId, version: remoteVersion };
      return;
    }

    if (seen.version === remoteVersion) return;

    // The watermark moved: prices, availability, schedules, or the menu tree
    // itself changed server-side. Record it BEFORE invalidating so a slow
    // refetch cannot re-trigger on the next tick.
    seenRef.current = { locationId, version: remoteVersion };

    console.log("[MenuVersionWatch] menu version changed — refetching menu", {
      from: seen.version,
      to: remoteVersion,
    });

    void queryClient.invalidateQueries({
      queryKey: ["pos_sync", locationId],
    });
  }, [locationId, remoteVersion, queryClient]);
}
