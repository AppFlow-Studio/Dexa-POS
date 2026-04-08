import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { InventoryItem, InventoryUnitType, Vendor } from "@/lib/types";
import { useQuery } from "@tanstack/react-query";

interface InventorySyncResponse {
  vendors: {
    id: string;
    name: string;
    contact_name: string;
    email: string | null;
    phone: string | null;
    address: string | null;
    website: string | null;
    is_active: boolean;
  }[];
  inventory_items: {
    id: string;
    name: string;
    category: string;
    description: string | null;
    image_url: string | null;
    stock_quantity: number;
    unit: string;
    unit_type: string;
    reorder_threshold: number;
    cost: number;
    vendor_id: string | null;
  }[];
  menu_recipes: {
    menu_item_id: string;
    inventory_item_id: string;
    quantity_used: number;
  }[];
  modifier_recipes: {
    modifier_group_item_id: string;
    inventory_item_id: string;
    quantity_used: number;
  }[];
}

export const useInventorySync = (locationId: string | null) => {
  const supabase = useSupabaseClient();

  return useQuery({
    queryKey: ["inventory_sync", locationId],
    queryFn: async () => {
      if (!locationId) throw new Error("Location ID required");
      console.log("Location ID:", locationId);

      const { data, error } = await supabase.rpc("get_pos_inventory_sync", {
        p_location_id: locationId,
      });

      if (error) {
        console.error("Inventory sync error:", error);
        throw error;
      }

      const response = data as InventorySyncResponse;

      // Transform Backend Snail_Case -> Frontend CamelCase
      const vendors: Vendor[] = (response.vendors || []).map((v) => ({
        id: v.id,
        name: v.name,
        contactName: v.contact_name,
        email: v.email,
        phone: v.phone,
        address: v.address,
        website: v.website,
        description: "",
      }));

      const inventoryItems: InventoryItem[] = (
        response.inventory_items || []
      ).map((i) => ({
        id: i.id,
        name: i.name,
        category: i.category,
        description: i.description,
        image: i.image_url,
        stockQuantity: i.stock_quantity,
        unit: i.unit,
        unitType: i.unit_type as InventoryUnitType,
        reorderThreshold: i.reorder_threshold,
        cost: i.cost,
        vendorId: i.vendor_id,
        locationId: (i as any).location_id,
        isGlobal: (i as any).is_global,
        stockTrackingMode: "quantity", // Inventory items are always quantity tracked
      }));

      return {
        vendors,
        inventoryItems,
        menuRecipes: response.menu_recipes || [],
        modifierRecipes: response.modifier_recipes || [],
      };
    },
    enabled: !!locationId,
  });
};
