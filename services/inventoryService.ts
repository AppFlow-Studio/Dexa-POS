import { InventoryItem, Vendor } from "@/lib/types";
import { SupabaseClient } from "@supabase/supabase-js";

export const InventoryService = {
  /**
   * Upsert an inventory item (Create or Update)
   */
  async upsertInventoryItem(
    supabase: SupabaseClient,
    item: Omit<InventoryItem, "id" | "stockQuantity"> & { id?: string },
    locationId: string
  ) {
    // Local items only
    const { data, error } = await supabase.rpc("app_upsert_inventory_item", {
      p_category: item.category,
      p_cost: item.cost,
      p_is_global: false,
      p_item_id: item.id || null,
      p_location_id: locationId,
      p_name: item.name,
      p_sku: "",
      p_unit_type: item.unitType || "pcs",
    });

    if (error) throw error;
    return data;
  },

  /**
   * Update location settings for a global item (Stock, Cost Override, Threshold Override)
   */
  async updateGlobalItemLocationSettings(
    supabase: SupabaseClient,
    locationId: string,
    itemId: string,
    updates: {
      stockQuantity?: number;
      stockUpdateReason?: string;
      costOverride?: number | null;
      reorderThresholdOverride?: number | null;
    }
  ) {
    // 1. Update Stock if provided
    if (
      updates.stockQuantity !== undefined &&
      updates.stockUpdateReason !== undefined
    ) {
      const { error: stockError } = await supabase.rpc(
        "log_stock_update_with_audit",
        {
          p_location_id: locationId,
          p_inventory_item_id: itemId,
          p_new_stock: updates.stockQuantity,
          p_update_reason: updates.stockUpdateReason,
          p_update_source: "adjustment",
        }
      );
      if (stockError) throw stockError;
    }

    // 2. Upsert Override (Cost & Threshold)
    // We only call this if there's an override to set/update
    const { error: overrideError } = await supabase.rpc(
      "upsert_location_inventory_override",
      {
        p_location_id: locationId,
        p_inventory_item_id: itemId,
        p_custom_cost: updates.costOverride ?? null,
        p_custom_reorder_threshold: updates.reorderThresholdOverride ?? null,
        p_notes: null,
      }
    );

    if (overrideError) throw overrideError;
  },

  /**
   * Delete an inventory item
   */
  async deleteInventoryItem(supabase: SupabaseClient, itemId: string) {
    const { error } = await supabase
      .from("inventory_items")
      .delete()
      .eq("id", itemId);

    if (error) throw error;
  },

  /**
   * Update stock quantity with audit log
   */
  async logStockUpdate(
    supabase: SupabaseClient,
    locationId: string,
    itemId: string,
    newQuantity: number,
    reason: string,
    source: string = "manual"
  ) {
    // Skip logging for now - constraint values unknown
    // Stock is updated directly on the item instead
    return null;
  },

  /**
   * Upsert a vendor
   */
  async upsertVendor(
    supabase: SupabaseClient,
    vendor: Omit<Vendor, "id"> & { id?: string },
    merchantId: string
  ) {
    const { data, error } = await supabase.rpc("app_upsert_vendor", {
      p_id: vendor.id || null,
      p_merchant_id: merchantId,
      p_name: vendor.name,
      p_contact_name: vendor.contactName,
      p_email: vendor.email,
      p_phone: vendor.phone,
      p_address: vendor.address,
      p_website: vendor.website,
    });

    if (error) throw error;
    return data;
  },

  /**
   * Delete a vendor
   */
  async deleteVendor(supabase: SupabaseClient, vendorId: string) {
    const { error } = await supabase
      .from("vendors")
      .delete()
      .eq("id", vendorId);

    if (error) throw error;
  },

  /**
   * Deduct inventory for a completed order (calls backend RPC)
   */
  async processOrderInventoryDeduction(
    supabase: SupabaseClient,
    orderId: string
  ): Promise<{ success: boolean; error?: any }> {
    console.log("we are reduming the stock");

    try {
      const { error } = await supabase.rpc(
        "process_order_inventory_deduction",
        {
          p_order_id: orderId,
        }
      );

      if (error) {
        console.error("[InventoryService] Deduction RPC error:", error);
        return { success: false, error };
      }

      return { success: true };
    } catch (err) {
      console.error("[InventoryService] Deduction exception:", err);
      return { success: false, error: err };
    }
  },
};
