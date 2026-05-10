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

const normalizeInventoryTrackingMode = (
  mode: string | null | undefined,
  currentStock?: number | null,
  reorderPoint?: number | null
): InventoryItem["stockTrackingMode"] => {
  if (mode === "stock_tracking") return "quantity";
  if (
    mode === "in_stock" &&
    (currentStock !== null && currentStock !== undefined ||
      reorderPoint !== null && reorderPoint !== undefined)
  ) {
    return "quantity";
  }
  if (mode === "in_stock" || mode === "out_of_stock") return mode;
  return "quantity";
};

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

      // Fetch the live item rows directly so recent stock/item writes are
      // visible immediately even if the sync RPC lags behind.
      const { data: itemRows } = await supabase
        .from("inventory_items")
        .select(
          "id, name, category, current_stock, unit_type, reorder_point, cost_per_unit, vendor_id, stock_mode"
        )
        .eq("location_id", locationId)
        .eq("is_active", true);

      const itemRowMap = new Map((itemRows ?? []).map((row) => [row.id, row]));

      // Fetch vendors scoped to the active location
      const { data: vendorsData, error: vendorsError } = await supabase
        .from("vendors")
        .select("id, name, contact_name, email, phone, address_line1, city, state, zip_code")
        .eq("location_id", locationId)
        .eq("is_active", true);

      if (vendorsError) {
        console.warn("Vendors fetch error:", vendorsError);
      }

      const rows = (itemsData as RpcInventoryRow[] | null) ?? [];

      const inventoryItems: InventoryItem[] = rows.filter((i) => itemRowMap.has(i.id)).map((i) => {
        const directRow = itemRowMap.get(i.id);
        return {
          id: i.id,
          name: directRow?.name ?? i.name,
          category: directRow?.category ?? "",
          description: null,
          image: null,
          stockQuantity: i.stock_quantity ?? directRow?.current_stock ?? 0,
          unit: directRow?.unit_type ?? i.unit_type,
          unitType: (directRow?.unit_type ?? i.unit_type) as InventoryUnitType,
          reorderThreshold:
            directRow?.reorder_point ??
            i.effective_reorder_point ??
            i.reorder_point ??
            0,
          cost: directRow?.cost_per_unit ?? i.effective_cost ?? 0,
          vendorId: directRow?.vendor_id ?? null,
          locationId: locationId,
          isGlobal: false,
          stockTrackingMode: normalizeInventoryTrackingMode(
            directRow?.stock_mode,
            directRow?.current_stock,
            directRow?.reorder_point
          ),
        };
      });

      const rpcItemIds = new Set(inventoryItems.map((item) => item.id));
      const missingDirectItems: InventoryItem[] = (itemRows ?? [])
        .filter((row) => !rpcItemIds.has(row.id))
        .map((row) => ({
          id: row.id,
          name: row.name,
          category: row.category ?? "",
          description: null,
          image: null,
          stockQuantity: row.current_stock ?? 0,
          unit: row.unit_type,
          unitType: row.unit_type as InventoryUnitType,
          reorderThreshold: row.reorder_point ?? 0,
          cost: row.cost_per_unit ?? 0,
          vendorId: row.vendor_id ?? null,
          locationId: locationId,
          isGlobal: false,
          stockTrackingMode: normalizeInventoryTrackingMode(
            row.stock_mode,
            row.current_stock,
            row.reorder_point
          ),
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
        inventoryItems: [...inventoryItems, ...missingDirectItems],
        menuRecipes: [] as any[],
        modifierRecipes: [] as any[],
      };
    },
    enabled: !!locationId,
  });
};
