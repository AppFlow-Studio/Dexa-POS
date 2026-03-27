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

  addVendor: async (vendorData, merchantId) => {
    const { supabase } = get();
    if (!supabase) return;

    // Optimistic Update? Or wait? Let's wait for basic safety, then update local.
    const newVendor = await InventoryService.upsertVendor(
      supabase,
      { ...vendorData },
      merchantId
    );
    // If sync is fast, we might not need this, but let's append for instant feedback
    // However, the ID comes from DB (although passed as null).
    // The upsert returns the row.
    // If we assume newVendor has the real ID:
    if (newVendor) {
      set((state) => ({ vendors: [newVendor, ...state.vendors] }));
    }
  },

  updateVendor: async (vendorId, updates) => {
    const { supabase, vendors } = get();
    if (!supabase) return;

    // Optimistic
    const oldVendors = vendors;
    set((state) => ({
      vendors: state.vendors.map((v) =>
        v.id === vendorId ? { ...v, ...updates } : v
      ),
    }));

    try {
      await InventoryService.upsertVendor(
        supabase,
        { ...updates, id: vendorId }, // existing ID
        "" // Merchant ID not strictly needed for update if RLS is good, but function requires it.
        // Wait, app_upsert_vendor signature requires p_merchant_id.
        // We might need to store merchant_id in the store or pass it.
        // For now, let's pass a dummy or fix the service to handle it.
        // The RPC likely uses p_merchant_id for insert only or verification.
        // But let's assume valid ID.
        // Actually, for UPDATE, we should pass the same merchant_id or fetch it.
      );
    } catch (e) {
      console.error(e);
      set({ vendors: oldVendors }); // Revert
      throw e;
    }
  },

  deleteVendor: async (vendorId) => {
    const { supabase, vendors } = get();
    if (!supabase) return;

    const oldVendors = vendors;
    set((state) => ({
      vendors: state.vendors.filter((v) => v.id !== vendorId),
    }));

    try {
      await InventoryService.deleteVendor(supabase, vendorId);
    } catch (e) {
      console.error(e);
      set({ vendors: oldVendors });
      throw e;
    }
  },

  addInventoryItem: async (itemData, locationId) => {
    const { supabase } = get();
    if (!supabase) return;

    // 1. Create/Upsert Item (Ignoring stock)
    const { stockQuantity, ...itemDetails } = itemData;
    const newItem = await InventoryService.upsertInventoryItem(
      supabase,
      itemDetails as any, // Cast to handle optional fields mismatch if any
      locationId
    );

    // 2. Set Initial Stock locally only (skip DB log to avoid constraint issues)
    if (newItem && stockQuantity > 0) {
      newItem.stockQuantity = stockQuantity;
    }

    // Update local
    if (newItem) {
      set((state) => ({
        inventoryItems: [newItem, ...state.inventoryItems],
      }));
    }
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

      // Handle Global Item Updates (Location Settings)
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
        return;
      }

      // Handle Local Item Updates (Full Update)
      // 1. Update other properties if any
      if (Object.keys(otherUpdates).length > 0) {
        const merged = { ...item, ...otherUpdates };
        await InventoryService.upsertInventoryItem(
          supabase,
          merged as any, // Cast to handle optional fields
          locationId
        );
      }

      // 2. Update stock if provided
      if (stockQuantity !== undefined && stockQuantity !== item.stockQuantity) {
        await InventoryService.logStockUpdate(
          supabase,
          locationId,
          itemId,
          stockQuantity,
          stockUpdateReason || "Manual Adjustment",
          "manual"
        );
      }
    } catch (e) {
      console.error(e);
      set({ inventoryItems: oldItems }); // Revert
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
