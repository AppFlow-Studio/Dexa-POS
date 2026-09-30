import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { useKioskProfileStore } from "@/stores/useKioskProfileStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import {
  DEFAULT_KIOSK_ORDERING,
  normalizeKioskOrderingSettings,
  normalizeKioskProfile,
  type KioskOrderingSettings,
  type KioskProfileRow,
} from "@/types/kiosk";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

// Kiosk config rarely changes; poll every few minutes to pick up edits made in
// the dashboard without requiring a kiosk reload.
const KIOSK_PROFILE_POLL_MS = 3 * 60_000;

/** Postgres "undefined_column" — stations.kiosk_settings not deployed yet. */
const PG_UNDEFINED_COLUMN = "42703";

interface KioskProfileQueryResult {
  row: KioskProfileRow | null;
  ordering: KioskOrderingSettings;
}

export const kioskProfileQueryKeys = {
  forStation: (stationId: string | null, kioskProfileId: string | null) =>
    ["kiosk-profile", stationId ?? "", kioskProfileId ?? ""] as const,
};

type Supabase = ReturnType<typeof useSupabaseClient>;

/**
 * The station's kiosk ordering settings. A missing column (migration not yet
 * deployed in this environment) reads as today's behaviour; any other error
 * throws so the last persisted config stays in force.
 */
async function fetchStationOrdering(
  supabase: Supabase,
  stationId: string,
): Promise<KioskOrderingSettings> {
  const { data, error } = await supabase
    .from("stations")
    .select("kiosk_settings")
    .eq("id", stationId)
    .maybeSingle();
  if (error) {
    if (error.code === PG_UNDEFINED_COLUMN) return DEFAULT_KIOSK_ORDERING;
    throw error;
  }
  return normalizeKioskOrderingSettings(
    (data as { kiosk_settings?: unknown } | null)?.kiosk_settings,
  );
}

async function fetchProfileRow(
  supabase: Supabase,
  locationId: string,
  kioskProfileId: string | null,
): Promise<KioskProfileRow | null> {
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
}

/**
 * Resolves and keeps fresh the kiosk config for the selected (self_service)
 * station. Backed by TanStack Query with a polling refetch — edits to the
 * profile in the DB are reflected within KIOSK_PROFILE_POLL_MS, no reload.
 *
 * Resolution order:
 *   1. station.kiosk_profile_id  →  2. location's active profile  →  3. defaults
 *
 * The station's own `kiosk_settings` (order types + seat selection, edited on
 * the website's station page) is fetched alongside and folded into the config
 * under the same idle-only apply gate.
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
  // A KDS never shows kiosk UI, so it shouldn't pay for the profile fetch and
  // its 3-minute poll.
  const isKDS = selectedStation?.station_type === "kds";

  const query = useQuery({
    queryKey: kioskProfileQueryKeys.forStation(stationId, kioskProfileId),
    enabled: !!stationId && !!locationId && !isKDS,
    staleTime: KIOSK_PROFILE_POLL_MS,
    refetchInterval: KIOSK_PROFILE_POLL_MS,
    queryFn: async (): Promise<KioskProfileQueryResult> => {
      if (!locationId) throw new Error("No location ID");
      if (!stationId) throw new Error("No station ID");

      const [row, ordering] = await Promise.all([
        fetchProfileRow(supabase, locationId, kioskProfileId),
        fetchStationOrdering(supabase, stationId),
      ]);
      return { row, ordering };
    },
  });

  // Mirror query results into the persisted store.
  useEffect(() => {
    if (!query.data) return;
    if (query.data.row) {
      applyRow(query.data.row, query.data.ordering);
    } else if (locationId) {
      // No profile configured anywhere — run with safe defaults.
      setDefaultFor("", locationId, query.data.ordering);
    }
  }, [query.data, locationId, applyRow, setDefaultFor]);

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
