import { useQuery } from "@tanstack/react-query";

import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import type { Station } from "@/types/station";

const STATIONS_STALE_MS = 30_000;

// Shared accessor for the per-location stations list. Backed by the
// get_location_stations_with_status RPC; consumers can read each station's
// current_receipt_printer_id to render claim chips on the Printers screen.
//
// The Settings → Stations screen has its own inline copy of this query;
// callsites that need to coordinate around station claims should use this
// hook so they share the TanStack cache.
export function useLocationStations() {
  const supabase = useSupabaseClient();
  const selectedStore = useStoreSettingsStore((s) => s.selectedStore);

  return useQuery({
    queryKey: ["location-stations", selectedStore?.id],
    queryFn: async (): Promise<Station[]> => {
      if (!selectedStore?.id) return [];
      const { data, error } = await supabase.rpc(
        "get_location_stations_with_status",
        { p_location_id: selectedStore.id },
      );
      if (error) throw error;
      return (data as Station[]) ?? [];
    },
    enabled: !!selectedStore?.id,
    staleTime: STATIONS_STALE_MS,
    refetchInterval: STATIONS_STALE_MS,
  });
}
