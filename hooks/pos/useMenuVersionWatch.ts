import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { connectionQuality } from "@/lib/network/connectionQuality";
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

/**
 * How far apart a location's stations spread their refetch after the token
 * moves. Every station polls on its own 5-minute clock, but foreground and
 * reconnect line them up, and one menu edit then sent all of them for the full
 * menu in the same second. A price change that lands up to 90 s later is a
 * fair price for that.
 */
export const MENU_VERSION_INVALIDATE_JITTER_MS = 90_000;

export const menuInvalidateJitterMs = (
  rand: () => number = Math.random,
): number => Math.floor(rand() * MENU_VERSION_INVALIDATE_JITTER_MS);

/**
 * The probe token that a bootstrap envelope's `version` corresponds to.
 *
 * The two are not the same string. Staging, 2026-09-26:
 *   probe v2   20260924T225435.390337-362-7cefc89f…
 *   envelope   20260924T225435.390337-362-channels-v3-station-scopes-7cefc89f…
 * The envelope carries a format marker between the watermark and the scope
 * hash. Comparing them directly is always "different".
 *
 * A v3 envelope has no marker (its `version` IS get_pos_menu_version_v3), so
 * this returns it unchanged and it compares equal to the v3 token.
 */
export const probeVersionFromEnvelope = (
  envelopeVersion: string | null | undefined,
): string | null =>
  envelopeVersion
    ? envelopeVersion.replace(/-channels-v\d+-station-scopes-/, "-")
    : null;

export type MenuVersionAction =
  /** Take the token as the baseline; nothing to fetch. */
  | "adopt"
  | "noop"
  /** The station is in slow mode: hold the refetch, look again next tick. */
  | "defer_slow"
  | "already_pending"
  | "schedule";

export function decideMenuVersionAction(input: {
  seen: { locationId: string; version: string } | null;
  locationId: string;
  remoteVersion: string;
  /** probeVersionFromEnvelope(version of the menu currently applied). */
  appliedProbeVersion: string | null;
  isSlow: boolean;
  hasPending: boolean;
}): MenuVersionAction {
  const { seen, locationId, remoteVersion } = input;

  // First observation for this location: the menu on screen came from the
  // boot fetch, and fetching here would make every cold start pay twice.
  if (!seen || seen.locationId !== locationId) return "adopt";
  if (seen.version === remoteVersion) return "noop";
  // The menu on screen already is this version: a manual sync fetched it.
  if (input.appliedProbeVersion === remoteVersion) return "adopt";
  if (input.hasPending) return "already_pending";
  if (input.isSlow) return "defer_slow";
  return "schedule";
}

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

  const { data: remoteVersion, dataUpdatedAt } = useQuery({
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
  const pendingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // `dataUpdatedAt` is a dependency on purpose. The token is the same string
  // tick after tick, so without it this would run once per change and never
  // again: a refetch held for slow mode, or one that failed, would wait for
  // the NEXT menu edit. With it, every probe re-evaluates. No loop: this only
  // ever invalidates `pos_sync`, never the probe.
  useEffect(() => {
    if (!locationId || !remoteVersion) return;

    const seen = seenRef.current;
    const appliedVersion =
      queryClient.getQueryData<{ version?: string | null }>([
        "pos_sync",
        locationId,
      ])?.version ?? null;

    const action = decideMenuVersionAction({
      seen,
      locationId,
      remoteVersion,
      appliedProbeVersion: probeVersionFromEnvelope(appliedVersion),
      isSlow: connectionQuality.isSlow(),
      hasPending: pendingRef.current !== null,
    });

    if (action === "adopt") {
      seenRef.current = { locationId, version: remoteVersion };
      return;
    }
    if (action === "defer_slow") {
      // `seen` stays where it is, so the next probe asks again.
      console.log("[MenuVersionWatch] menu version changed — deferring", {
        reason: "slow connection",
        to: remoteVersion,
      });
      return;
    }
    if (action !== "schedule") return;

    const inMs = menuInvalidateJitterMs();
    console.log("[MenuVersionWatch] menu version changed — refetching menu", {
      from: seen?.version,
      to: remoteVersion,
      inMs,
    });

    pendingRef.current = setTimeout(() => {
      pendingRef.current = null;
      // Slow mode may have started while this waited.
      if (connectionQuality.isSlow()) return;

      void queryClient
        .invalidateQueries({ queryKey: ["pos_sync", locationId] })
        .then(() => {
          // invalidateQueries resolves whether the refetch worked or not.
          // Recording the version first, as this used to, left a station on
          // the old menu until the next edit whenever the refetch failed.
          const state = queryClient.getQueryState(["pos_sync", locationId]);
          if (state?.status !== "error") {
            seenRef.current = { locationId, version: remoteVersion };
          }
        });
    }, inMs);
  }, [locationId, remoteVersion, dataUpdatedAt, queryClient]);

  // A pending refetch belongs to its location: drop it when that changes or
  // the hook unmounts, and at no other time.
  useEffect(
    () => () => {
      if (pendingRef.current) {
        clearTimeout(pendingRef.current);
        pendingRef.current = null;
      }
    },
    [locationId],
  );
}
