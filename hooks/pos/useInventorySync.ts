import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { InventoryItem, InventoryUnitType } from "@/lib/types";
import { useQuery } from "@tanstack/react-query";

interface RpcInventoryRow {
  id: string;
  name: string;
  sku: string | null;
  unit_type: string;
  stock_mode: string | null;
  reorder_point: number | null;
  reorder_quantity: number | null;
  is_active: boolean;
  updated_at: string | null;
  stock_quantity: number;
  effective_cost: number;
  effective_reorder_point: number | null;
}

export const useInventorySync = (locationId: string | null) => {
  const supabase = useSupabaseClient();

  return useQuery({
    queryKey: ["inventory_sync", locationId],
    queryFn: async () => {
      if (!locationId) throw new Error("Location ID required");

      // Fetch inventory items via RPC
      const { data: itemsData, error: itemsError } = await supabase.rpc(
        "get_pos_inventory_sync",
        { p_location_id: locationId }
      );

      if (itemsError) {
        console.error("Inventory sync error:", itemsError);
        throw itemsError;
      }

      // Fetch vendor_id mapping from inventory_items (RPC doesn't return it)
      const { data: itemVendorRows } = await supabase
        .from("inventory_items")
        .select("id, vendor_id")
        .eq("is_active", true);

      const vendorIdMap: Record<string, string | null> = {};
      for (const row of itemVendorRows ?? []) {
        vendorIdMap[row.id] = row.vendor_id ?? null;
      }

      // Fetch vendors for this location's merchant
      const { data: locationRow } = await supabase
        .from("locations")
        .select("merchant_id")
        .eq("id", locationId)
        .single();

      const { data: vendorsData, error: vendorsError } = locationRow
        ? await supabase
            .from("vendors")
            .select("id, name, contact_name, email, phone, address_line1, city, state, zip_code")
            .eq("merchant_id", locationRow.merchant_id)
            .eq("is_active", true)
        : { data: [], error: null };

      if (vendorsError) {
        console.warn("Vendors fetch error:", vendorsError);
      }

      const rows = (itemsData as RpcInventoryRow[] | null) ?? [];

      const inventoryItems: InventoryItem[] = rows.map((i) => ({
        id: i.id,
        name: i.name,
        category: "",
        description: null,
        image: null,
        stockQuantity: i.stock_quantity ?? 0,
        unit: i.unit_type,
        unitType: i.unit_type as InventoryUnitType,
        reorderThreshold: i.effective_reorder_point ?? i.reorder_point ?? 0,
        cost: i.effective_cost ?? 0,
        vendorId: vendorIdMap[i.id] ?? null,
        locationId: locationId,
        isGlobal: false,
        stockTrackingMode: "quantity" as const,
      }));

      const vendors = (vendorsData ?? []).map((v) => ({
        id: v.id,
        name: v.name,
        contactName: v.contact_name ?? "",
        email: v.email ?? null,
        phone: v.phone ?? null,
        address: [v.address_line1, v.city, v.state].filter(Boolean).join(", ") || null,
        website: null,
        description: "",
      }));

      return {
        vendors,
        inventoryItems,
        menuRecipes: [] as any[],
        modifierRecipes: [] as any[],
      };
    },
    enabled: !!locationId,
  });
};
