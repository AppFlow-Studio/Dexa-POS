import { useQuery } from "@tanstack/react-query";

import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";

export interface LocationCashDrawer {
  id: string;
  name: string;
  station_id: string | null;
  host_printer_id: string | null;
  is_active: boolean | null;
}

// Active cash drawers for the current location, including their host_printer_id
// binding. Powers the two-way "drawer ↔ printer" indicators (the "Drawer: X"
// chip on the Printers screen; the "Drawer host: Y" line in Cash Management).
//
// select('*') is deliberate — host_printer_id is simply absent (→ null) on a DB
// where the migration hasn't landed yet, instead of 400-ing on an explicit
// column list. Prod-safe with or without the migration.
export function useLocationCashDrawers() {
  const supabase = useSupabaseClient();
  const selectedStore = useStoreSettingsStore((s) => s.selectedStore);

  return useQuery({
    queryKey: ["location-cash-drawers", selectedStore?.id],
    queryFn: async (): Promise<LocationCashDrawer[]> => {
      if (!selectedStore?.id) return [];
      const { data, error } = await supabase
        .from("cash_drawers")
        .select("*")
        .eq("location_id", selectedStore.id)
        .eq("is_active", true);
      if (error) return [];
      return (data ?? []).map((d: any) => ({
        id: d.id,
        name: d.name,
        station_id: d.station_id ?? null,
        host_printer_id: d.host_printer_id ?? null,
        is_active: d.is_active ?? null,
      }));
    },
    enabled: !!selectedStore?.id,
    staleTime: 30_000,
  });
}
