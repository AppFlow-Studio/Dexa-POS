import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import {
  INVENTORY_ITEM_COLUMNS,
  mapInventorySyncPayload,
  VENDOR_COLUMNS,
  type DirectInventoryRow,
  type InventorySyncData,
  type RawInventorySync,
  type RawVendorRow,
  type RpcInventoryRow,
} from "@/lib/inventory/inventorySyncPayload";
import { useQuery } from "@tanstack/react-query";

/**
 * What the query yields: the mapped catalog the store consumes, plus the RAW
 * rows it was mapped from.
 *
 * The raw rows ride along because the local mirror stores THEM, not the mapped
 * result — so a catalog read back from disk goes through the same
 * `mapInventorySyncPayload` a live one does, and the two cannot diverge. See
 * lib/db/descriptors/inventory.ts.
 */
export type InventorySyncResult = InventorySyncData & { raw: RawInventorySync };

export const useInventorySync = (locationId: string | null) => {
  const supabase = useSupabaseClient();

  return useQuery<InventorySyncResult>({
    queryKey: ["inventory_sync", locationId],
    queryFn: async () => {
      if (!locationId) throw new Error("Location ID required");

      // The resolved catalog: stock, effective cost and effective reorder point
      // joined server-side out of the per-location override tables.
      const { data: itemsData, error: itemsError } = await supabase.rpc(
        "get_pos_inventory_sync",
        { p_location_id: locationId },
      );

      if (itemsError) {
        console.error("Inventory sync error:", itemsError);
        throw itemsError;
      }

      // Fetch the live item rows directly so recent stock/item writes are
      // visible immediately even if the sync RPC lags behind. These rows are
      // also the row UNIVERSE — an RPC row with no direct row is not active at
      // this location.
      const { data: itemRows } = await supabase
        .from("inventory_items")
        .select(INVENTORY_ITEM_COLUMNS)
        .eq("location_id", locationId)
        .eq("is_active", true);

      // Vendors scoped to the active location.
      const { data: vendorsData, error: vendorsError } = await supabase
        .from("vendors")
        .select(VENDOR_COLUMNS)
        .eq("location_id", locationId)
        .eq("is_active", true);

      if (vendorsError) {
        console.warn("Vendors fetch error:", vendorsError);
      }

      const raw: RawInventorySync = {
        rpcRows: (itemsData as RpcInventoryRow[] | null) ?? [],
        itemRows: (itemRows as unknown as DirectInventoryRow[] | null) ?? [],
        vendorRows: (vendorsData as unknown as RawVendorRow[] | null) ?? [],
      };

      return { ...mapInventorySyncPayload(raw, locationId), raw };
    },
    enabled: !!locationId,
    networkMode: "offlineFirst",
    staleTime: Infinity, // Broadcast/manual-invalidation controls updates
    // Stock is the one mirrored thing that genuinely moves during service, and
    // `staleTime: Infinity` alone means a session-long cache: open Inventory an
    // hour into service and you are reading boot-time stock. Refetching on
    // entry is the smallest cadence that makes the numbers current exactly
    // where someone is looking at them, and it is what makes the freshness
    // stamp mean something rather than always reading "an hour ago".
    refetchOnMount: "always",
    gcTime: 1000 * 60 * 60 * 2, // 2 hours — matches usePosSync, prevents cold-cache on idle
  });
};
