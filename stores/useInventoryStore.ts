import {
  CartItem,
  ExternalExpense,
  InventoryItem,
  POLineItem,
  PurchaseOrder,
  Vendor,
} from "@/lib/types";
import { InventoryService } from "@/services/inventoryService";
import { SupabaseClient } from "@supabase/supabase-js";
import { create } from "zustand";
import { useMenuStore } from "./useMenuStore";

// --- STORE INTERFACE ---
interface InventoryState {
  supabase: SupabaseClient | null;
  inventoryItems: InventoryItem[];
  vendors: Vendor[];
  purchaseOrders: PurchaseOrder[];
  externalExpenses: ExternalExpense[];

  // --- ACTIONS ---
  setSupabaseClient: (client: SupabaseClient) => void;
  setInventoryData: (data: {
    items: InventoryItem[];
    vendors: Vendor[];
  }) => void; // Called by sync loop
  fetchInventoryItems: (locationId: string) => Promise<void>;
  fetchVendors: (merchantId: string) => Promise<void>;

  // Async Actions (Call Backend + Optimistic Update)
  addVendor: (
    vendorData: Omit<Vendor, "id">,
    merchantId: string
  ) => Promise<void>;
  updateVendor: (
    vendorId: string,
    updates: Omit<Vendor, "id">
  ) => Promise<void>;
  deleteVendor: (vendorId: string) => Promise<void>;

  addInventoryItem: (
    itemData: Omit<InventoryItem, "id">,
    locationId: string
  ) => Promise<void>;
  updateInventoryItem: (
    itemId: string,
    updates: Partial<InventoryItem>,
    locationId: string
  ) => Promise<void>;
  deleteInventoryItem: (itemId: string) => Promise<void>;

  createPurchaseOrder: (
    po: Omit<PurchaseOrder, "id" | "poNumber" | "createdAt">
  ) => void;
  updatePurchaseOrder: (
    poId: string,
    updates: Partial<Omit<PurchaseOrder, "id">>
  ) => void;
  deletePurchaseOrder: (poId: string) => void;
  // New lifecycle actions
  submitPurchaseOrder: (poId: string) => void; // Draft -> Pending Delivery
  logDeliveryForPO: (
    poId: string,
    data: {
      photos?: string[];
      deliveredAt?: string;
      notes?: string;
      receivedItems: POLineItem[];
    }
  ) => void; // -> Awaiting Payment
  logPaymentForPO: (
    poId: string,
    data: {
      method: "Card" | "Cash";
      amount: number;
      paidAt?: string;
      cardLast4?: string;
      paidToEmployee?: string;
    }
  ) => void; // -> Paid
  cancelPurchaseOrder: (poId: string) => void; // -> Cancelled
  // External expense actions
  addExternalExpense: (
    expense: Omit<ExternalExpense, "id" | "expenseNumber">
  ) => void;
  updateExternalExpense: (
    expenseId: string,
    updates: Partial<Omit<ExternalExpense, "id" | "expenseNumber">>
  ) => void;
  removeExternalExpense: (expenseId: string) => void;
  // --- NEW ACTIONS ---
  decrementStockFromSale: (soldItems: CartItem[]) => void;
  decrementStockFromItem: (cartItem: CartItem) => void;
  getLowStockItems: () => InventoryItem[];
}

// --- STORE CREATION ---
export const useInventoryStore = create<InventoryState>((set, get) => ({
  supabase: null,
  inventoryItems: [],
  vendors: [],
  purchaseOrders: [], // TODO: Wire up POs to backend later
  externalExpenses: [], // TODO: Wire up to backend later

  setSupabaseClient: (client) => set({ supabase: client }),

  setInventoryData: ({ items, vendors }) => {
    set({ inventoryItems: items, vendors: vendors });
  },

  fetchInventoryItems: async (locationId) => {
    const { supabase } = get();
    if (!supabase) return;

    const { data, error } = await supabase.rpc('get_pos_inventory_sync', {
      p_location_id: locationId,
    });

    if (error) {
      console.error('[InventoryStore] fetchInventoryItems error:', error);
      return;
    }

    // RPC returns a flat JSON array of inventory rows
    const rows = (data as any[]) ?? [];

    const inventoryItems: InventoryItem[] = rows.map((i: any) => ({
      id: i.id,
      name: i.name,
      category: '',
      description: null,
      image: null,
      stockQuantity: i.stock_quantity ?? 0,
      unit: i.unit_type,
      unitType: i.unit_type,
      reorderThreshold: i.effective_reorder_point ?? i.reorder_point ?? 0,
      cost: i.effective_cost ?? 0,
      vendorId: null,
      locationId,
      isGlobal: false,
      stockTrackingMode: 'quantity' as const,
    }));

    // Fetch vendor_id mapping
    const { data: itemVendorRows } = await supabase
      .from('inventory_items')
      .select('id, vendor_id')
      .eq('is_active', true);

    const vendorIdMap: Record<string, string | null> = {};
    for (const row of itemVendorRows ?? []) {
      vendorIdMap[row.id] = row.vendor_id ?? null;
    }

    // Re-map vendorId onto items
    const itemsWithVendor = inventoryItems.map(i => ({
      ...i,
      vendorId: vendorIdMap[i.id] ?? null,
    }));

    // Fetch vendors filtered by merchant
    const { data: locationRow } = await supabase
      .from('locations')
      .select('merchant_id')
      .eq('id', locationId)
      .single();

    const { data: vendorsData } = locationRow
      ? await supabase
          .from('vendors')
          .select('id, name, contact_name, email, phone, address_line1, city, state, zip_code')
          .eq('merchant_id', locationRow.merchant_id)
          .eq('is_active', true)
      : { data: [] };

    const vendors: Vendor[] = (vendorsData ?? []).map((v: any) => ({
      id: v.id,
      name: v.name,
      contactName: v.contact_name ?? '',
      email: v.email ?? null,
      phone: v.phone ?? null,
      address: [v.address_line1, v.city, v.state].filter(Boolean).join(', ') || null,
      website: null,
      description: '',
    }));

    set({ inventoryItems: itemsWithVendor, vendors });
  },

  fetchVendors: async (merchantId) => {
    const { supabase } = get();
    if (!supabase || !merchantId) return;

    const { data, error } = await supabase
      .from('vendors')
      .select('id, name, contact_name, email, phone, address_line1, city, state, zip_code')
      .eq('merchant_id', merchantId)
      .eq('is_active', true);

    if (error) {
      console.error('[InventoryStore] fetchVendors error:', error);
      return;
    }

    const vendors: Vendor[] = (data ?? []).map((v: any) => ({
      id: v.id,
      name: v.name,
      contactName: v.contact_name ?? '',
      email: v.email ?? null,
      phone: v.phone ?? null,
      address: [v.address_line1, v.city, v.state].filter(Boolean).join(', ') || null,
      website: null,
      description: '',
    }));

    set({ vendors });
  },

  addVendor: async (vendorData, merchantId) => {
    const { supabase } = get();
    if (!supabase || !merchantId) return;

    const { error } = await supabase.from('vendors').insert({
      merchant_id: merchantId,
      name: vendorData.name,
      contact_name: vendorData.contactName || null,
      email: vendorData.email || null,
      phone: vendorData.phone || null,
      address_line1: vendorData.address || null,
      is_active: true,
    });

    if (error) {
      console.error('[InventoryStore] addVendor error:', error);
      throw error;
    }

    await get().fetchVendors(merchantId);
  },

  updateVendor: async (vendorId, updates) => {
    const { supabase } = get();
    if (!supabase) return;

    // Optimistic update for instant UI feedback
    set((state) => ({
      vendors: state.vendors.map((v) =>
        v.id === vendorId ? { ...v, ...updates } : v
      ),
    }));

    const { error } = await supabase.from('vendors').update({
      name: updates.name,
      contact_name: updates.contactName || null,
      email: updates.email || null,
      phone: updates.phone || null,
      address_line1: updates.address || null,
    }).eq('id', vendorId);

    if (error) {
      console.error('[InventoryStore] updateVendor error:', error);
      throw error;
    }
  },

  deleteVendor: async (vendorId) => {
    const { supabase, vendors } = get();
    if (!supabase) return;

    // Optimistic removal
    set((state) => ({
      vendors: state.vendors.filter((v) => v.id !== vendorId),
    }));

    const { error } = await supabase
      .from('vendors')
      .update({ is_active: false })
      .eq('id', vendorId);

    if (error) {
      console.error('[InventoryStore] deleteVendor error:', error);
      set({ vendors }); // revert
      throw error;
    }
  },

  addInventoryItem: async (itemData, locationId) => {
    const { supabase } = get();
    if (!supabase) return;

    const { stockQuantity, ...itemDetails } = itemData;
    const newItem = await InventoryService.upsertInventoryItem(
      supabase,
      itemDetails as any,
      locationId
    );

    // The RPC doesn't support vendor_id — patch it directly after creation
    const newItemId = newItem?.id ?? newItem;
    if (newItemId && itemData.vendorId) {
      await supabase
        .from('inventory_items')
        .update({ vendor_id: itemData.vendorId })
        .eq('id', newItemId);
    }

    // Re-fetch to get the real item back with correct shape
    await get().fetchInventoryItems(locationId);
    // Invalidate TanStack query cache so PosSyncProvider also sees fresh data
    const { queryClient } = require('@/contexts/TanstackProvider') as typeof import('@/contexts/TanstackProvider');
    queryClient.invalidateQueries({ queryKey: ['inventory_sync', locationId] });
  },

  updateInventoryItem: async (itemId, updates, locationId) => {
    const { supabase, inventoryItems } = get();
    if (!supabase) return;

    const oldItems = inventoryItems;
    const item = oldItems.find((i) => i.id === itemId);
    if (!item) return;

    // Optimistic Update
    set((state) => ({
      inventoryItems: state.inventoryItems.map((i) =>
        i.id === itemId ? { ...i, ...updates } : i
      ),
    }));

    try {
      const { stockQuantity, stockUpdateReason, ...otherUpdates } = updates;

      if (item.isGlobal) {
        await InventoryService.updateGlobalItemLocationSettings(
          supabase,
          locationId,
          itemId,
          {
            stockQuantity:
              stockQuantity !== item.stockQuantity ? stockQuantity : undefined,
            stockUpdateReason: stockUpdateReason,
            costOverride:
              updates.cost !== undefined && updates.cost !== item.cost
                ? updates.cost
                : undefined,
            reorderThresholdOverride:
              updates.reorderThreshold !== undefined &&
              updates.reorderThreshold !== item.reorderThreshold
                ? updates.reorderThreshold
                : undefined,
          }
        );
      } else {
        if (Object.keys(otherUpdates).length > 0) {
          const merged = { ...item, ...otherUpdates };
          await InventoryService.upsertInventoryItem(supabase, merged as any, locationId);
        }

        // Patch vendor_id directly since the RPC doesn't support it
        if ('vendorId' in updates) {
          await supabase
            .from('inventory_items')
            .update({ vendor_id: updates.vendorId ?? null })
            .eq('id', itemId);
        }

        if (stockQuantity !== undefined && stockQuantity !== item.stockQuantity) {
          const { error: stockError } = await supabase
            .from("inventory_items")
            .update({ current_stock: stockQuantity })
            .eq("id", itemId);
          if (stockError) throw stockError;
        }
      }

      // Re-fetch to sync real state
      await get().fetchInventoryItems(locationId);
      const { queryClient } = require('@/contexts/TanstackProvider') as typeof import('@/contexts/TanstackProvider');
      queryClient.invalidateQueries({ queryKey: ['inventory_sync', locationId] });
    } catch (e) {
      console.error(e);
      set({ inventoryItems: oldItems });
      throw e;
    }
  },

  deleteInventoryItem: async (itemId) => {
    const { supabase, inventoryItems } = get();
    if (!supabase) return;

    const oldItems = inventoryItems;
    set((state) => ({
      inventoryItems: state.inventoryItems.filter((i) => i.id !== itemId),
    }));

    try {
      await InventoryService.deleteInventoryItem(supabase, itemId);
    } catch (e) {
      console.error(e);
      set({ inventoryItems: oldItems });
      throw e;
    }
  },

  createPurchaseOrder: (poData) => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const sequence = (get().purchaseOrders.length + 1)
      .toString()
      .padStart(3, "0");
    const poNumber = `PO-${yyyy}-${mm}-${sequence}`;
    const newPO: PurchaseOrder = {
      ...poData,
      id: `po_${Date.now()}`,
      poNumber,
      createdAt: now.toISOString(),
      originalItems: poData.items,
    };
    set((state) => ({ purchaseOrders: [newPO, ...state.purchaseOrders] }));
  },
  updatePurchaseOrder: (poId, updates) => {
    set((state) => ({
      purchaseOrders: state.purchaseOrders.map((po) => {
        if (po.id === poId && po.status === "Draft") {
          return { ...po, ...updates };
        }
        return po;
      }),
    }));
  },

  deletePurchaseOrder: (poId) => {
    const po = get().purchaseOrders.find((p) => p.id === poId);
    if (po?.status !== "Draft") {
      console.warn("Cannot delete a PO that is not in Draft status.");
      return;
    }
    set((state) => ({
      purchaseOrders: state.purchaseOrders.filter((p) => p.id !== poId),
    }));
  },

  submitPurchaseOrder: (poId) => {
    set((state) => ({
      purchaseOrders: state.purchaseOrders.map((p) =>
        p.id === poId && p.status === "Draft"
          ? { ...p, status: "Pending Delivery" }
          : p
      ),
    }));
  },

  logDeliveryForPO: (poId, data) => {
    const po = get().purchaseOrders.find((p) => p.id === poId);
    if (!po) return;
    // Update inventory quantities for delivered items
    const received =
      data.receivedItems && data.receivedItems.length > 0
        ? data.receivedItems
        : po.items;
    const updatedItems = get().inventoryItems.map((item) => {
      const poItem = received.find((x) => x.inventoryItemId === item.id);
      if (poItem) {
        return { ...item, stockQuantity: item.stockQuantity + poItem.quantity };
      }
      return item;
    });

    set((state) => ({
      inventoryItems: updatedItems,
      purchaseOrders: state.purchaseOrders.map((p) =>
        p.id === poId
          ? {
              ...p,
              status: "Awaiting Payment",
              deliveryLoggedAt: data.deliveredAt || new Date().toISOString(),
              deliveryPhotos: data.photos || p.deliveryPhotos,
              originalItems: p.originalItems || p.items,
              receivedItems: received,
              discrepancyNotes: data.notes,
            }
          : p
      ),
    }));
  },

  logPaymentForPO: (poId, data) => {
    const po = get().purchaseOrders.find((p) => p.id === poId);
    if (!po) return;
    set((state) => ({
      purchaseOrders: state.purchaseOrders.map((p) =>
        p.id === poId
          ? {
              ...p,
              status: "Paid",
              payment: {
                method: data.method,
                amount: data.amount,
                paidAt: data.paidAt || new Date().toISOString(),
                cardLast4: data.cardLast4,
                paidToEmployee: data.paidToEmployee,
              },
            }
          : p
      ),
    }));
  },
  cancelPurchaseOrder: (poId) => {
    set((state) => ({
      purchaseOrders: state.purchaseOrders.map((p) =>
        p.id === poId ? { ...p, status: "Cancelled" } : p
      ),
    }));
  },

  addExternalExpense: (expense) => {
    const existingExpenses = get().externalExpenses;
    const nextExpenseNumber = `EXP-${String(
      existingExpenses.length + 1
    ).padStart(4, "0")}`;

    const newExpense: ExternalExpense = {
      ...expense,
      id: `expense_${Date.now()}`,
      expenseNumber: nextExpenseNumber,
    };
    set((state) => ({
      externalExpenses: [newExpense, ...state.externalExpenses],
    }));
  },

  updateExternalExpense: (expenseId, updates) => {
    set((state) => ({
      externalExpenses: state.externalExpenses.map((expense) =>
        expense.id === expenseId ? { ...expense, ...updates } : expense
      ),
    }));
  },

  removeExternalExpense: (expenseId) => {
    set((state) => ({
      externalExpenses: state.externalExpenses.filter(
        (expense) => expense.id !== expenseId
      ),
    }));
  },

  // Real-time stock deduction logic ---
  decrementStockFromSale: (soldItems) => {
    const { menuItems, updateMenuItem } = useMenuStore.getState();
    const currentInventory = get().inventoryItems;

    const stockUpdates: Record<string, number> = {};
    const menuItemStockUpdates: Record<string, number> = {};

    soldItems.forEach((cartItem) => {
      const menuItem = menuItems.find((mi) => mi.id === cartItem.menuItemId);
      if (!menuItem) return;
      // Check if menu item has a recipe
      if (
        menuItem.stockTrackingMode === "quantity" &&
        menuItem.stockQuantity !== undefined
      ) {
        if (menuItem.recipe && menuItem.recipe.length > 0) {
          // Recipe-based depletion: deplete ingredients according to recipe

          menuItem.recipe.forEach((recipeItem) => {
            const currentDecrement =
              stockUpdates[recipeItem.inventoryItemId] || 0;
            stockUpdates[recipeItem.inventoryItemId] =
              currentDecrement + recipeItem.quantity * cartItem.quantity;
          });
          console.log("Found recipe", menuItem.recipe);
          console.log("Stock updates", stockUpdates);
        }
        // Simple item depletion: deplete the menu item's own stock
        const currentDecrement = menuItemStockUpdates[menuItem.id] || 0;
        menuItemStockUpdates[menuItem.id] =
          currentDecrement + cartItem.quantity;
        console.log("Found quantity tracking mode", menuItem.stockTrackingMode);
        console.log("Menu item stock updates", menuItemStockUpdates);
      }
      // If stockTrackingMode is "in_stock" or "out_of_stock", no quantity tracking needed
    });

    // Update inventory items (for recipe-based items)
    const updatedInventory = currentInventory.map((invItem) => {
      const totalToDecrement = stockUpdates[invItem.id];
      if (totalToDecrement) {
        return {
          ...invItem,
          stockQuantity: Math.max(0, invItem.stockQuantity - totalToDecrement),
        };
      }
      return invItem;
    });

    // Update menu items (for simple items with quantity tracking)
    Object.entries(menuItemStockUpdates).forEach(
      ([menuItemId, quantityToDecrement]) => {
        const menuItem = menuItems.find((mi) => mi.id === menuItemId);
        if (menuItem && menuItem.stockQuantity !== undefined) {
          const newStockQuantity = Math.max(
            0,
            menuItem.stockQuantity - quantityToDecrement
          );
          updateMenuItem(menuItemId, { stockQuantity: newStockQuantity });
        }
      }
    );

    set({ inventoryItems: updatedInventory });
  },

  // Single item stock deduction logic ---
  decrementStockFromItem: (cartItem) => {
    const { menuItems, updateMenuItem } = useMenuStore.getState();
    const currentInventory = get().inventoryItems;

    const menuItem = menuItems.find((mi) => mi.id === cartItem.menuItemId);
    if (!menuItem) return;

    // Check if menu item has a recipe
    if (menuItem.recipe && menuItem.recipe.length > 0) {
      // Recipe-based depletion: deplete ingredients according to recipe
      const stockUpdates: Record<string, number> = {};

      menuItem.recipe.forEach((recipeItem) => {
        const currentDecrement = stockUpdates[recipeItem.inventoryItemId] || 0;
        stockUpdates[recipeItem.inventoryItemId] =
          currentDecrement + recipeItem.quantity * cartItem.quantity;
      });

      // Update inventory items
      const updatedInventory = currentInventory.map((invItem) => {
        const totalToDecrement = stockUpdates[invItem.id];
        if (totalToDecrement) {
          return {
            ...invItem,
            stockQuantity: Math.max(
              0,
              invItem.stockQuantity - totalToDecrement
            ),
          };
        }
        return invItem;
      });

      set({ inventoryItems: updatedInventory });
    } else if (
      menuItem.stockTrackingMode === "quantity" &&
      menuItem.stockQuantity !== undefined
    ) {
      // Simple item depletion: deplete the menu item's own stock
      const newStockQuantity = Math.max(
        0,
        menuItem.stockQuantity - cartItem.quantity
      );
      updateMenuItem(menuItem.id, { stockQuantity: newStockQuantity });
    }
    // If stockTrackingMode is "in_stock" or "out_of_stock", no quantity tracking needed
  },

  // --- Selector for low stock items ---
  getLowStockItems: () => {
    return get().inventoryItems.filter(
      (item) => item.stockQuantity <= item.reorderThreshold
    );
  },
}));
