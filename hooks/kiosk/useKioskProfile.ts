import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { useKioskProfileStore } from "@/stores/useKioskProfileStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { normalizeKioskProfile, type KioskProfileRow } from "@/types/kiosk";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

// Kiosk config rarely changes; poll every few minutes to pick up edits made in
// the dashboard without requiring a kiosk reload.
const KIOSK_PROFILE_POLL_MS = 3 * 60_000;

export const kioskProfileQueryKeys = {
  forStation: (stationId: string | null, kioskProfileId: string | null) =>
    ["kiosk-profile", stationId ?? "", kioskProfileId ?? ""] as const,
};

/**
 * Resolves and keeps fresh the kiosk config for the selected (self_service)
 * station. Backed by TanStack Query with a polling refetch — edits to the
 * profile in the DB are reflected within KIOSK_PROFILE_POLL_MS, no reload.
 *
 * Resolution order:
 *   1. station.kiosk_profile_id  →  2. location's active profile  →  3. defaults
 *
 * Results are mirrored into useKioskProfileStore (persisted to MMKV) so the
 * kiosk can boot instantly/offline from the last known config.
 */
export function useKioskProfile() {
  const supabase = useSupabaseClient();
  const selectedStation = useStoreSettingsStore((s) => s.selectedStation);
  const locationId = useStoreSettingsStore((s) => s.selectedStore?.id ?? null);

  const config = useKioskProfileStore((s) => s.config);
  const status = useKioskProfileStore((s) => s.status);
  const error = useKioskProfileStore((s) => s.error);
  const applyRow = useKioskProfileStore((s) => s.applyRow);
  const setDefaultFor = useKioskProfileStore((s) => s.setDefaultFor);
  const setError = useKioskProfileStore((s) => s.setError);

  const stationId = selectedStation?.id ?? null;
  const kioskProfileId = selectedStation?.kiosk_profile_id ?? null;

  const query = useQuery({
    queryKey: kioskProfileQueryKeys.forStation(stationId, kioskProfileId),
    enabled: !!stationId && !!locationId,
    staleTime: KIOSK_PROFILE_POLL_MS,
    refetchInterval: KIOSK_PROFILE_POLL_MS,
    queryFn: async (): Promise<KioskProfileRow | null> => {
      if (!locationId) throw new Error("No location ID");

      // 1. Prefer the station's explicitly linked profile.
      if (kioskProfileId) {
        const { data, error } = await supabase
          .from("kiosk_profiles")
          .select("*")
          .eq("id", kioskProfileId)
          .maybeSingle();
        if (error) throw error;
        if (data) return data as KioskProfileRow;
      }

      // 2. Fall back to the location's active profile.
      const { data, error } = await supabase
        .from("kiosk_profiles")
        .select("*")
        .eq("location_id", locationId)
        .eq("is_active", true)
        .order("published_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as KioskProfileRow | null) ?? null;
    },
  });

  // Mirror query results into the persisted store.
  useEffect(() => {
    if (query.data) {
      applyRow(query.data);
    } else if (query.isSuccess && !query.data && locationId) {
      // No profile configured anywhere — run with safe defaults.
      setDefaultFor("", locationId);
    }
  }, [query.data, query.isSuccess, locationId, applyRow, setDefaultFor]);

  useEffect(() => {
    if (query.isError) {
      setError(
        query.error instanceof Error
          ? query.error.message
          : "Failed to load kiosk profile",
      );
    }
  }, [query.isError, query.error, setError]);

  return { config, status, error, isReady: status === "ready" && !!config };
}

// Re-exported so callers can normalize a row consistently if needed.
export { normalizeKioskProfile };
