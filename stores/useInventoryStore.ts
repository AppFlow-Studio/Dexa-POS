import { MOCK_INVENTORY_ITEMS, MOCK_VENDORS } from "@/lib/mockData";
import { CartItem, InventoryItem, PurchaseOrder, Vendor } from "@/lib/types";
import { create } from "zustand";
import { useMenuStore } from "./useMenuStore";

// --- STORE INTERFACE ---
interface InventoryState {
  inventoryItems: InventoryItem[];
  vendors: Vendor[];
  purchaseOrders: PurchaseOrder[];

  // --- ACTIONS ---
  addInventoryItem: (itemData: Omit<InventoryItem, "id">) => void;
  updateInventoryItem: (
    itemId: string,
    updates: Omit<InventoryItem, "id">
  ) => void;
  deleteInventoryItem: (itemId: string) => void;

  createPurchaseOrder: (
    po: Omit<PurchaseOrder, "id" | "poNumber" | "createdAt">
  ) => void;
  receivePurchaseOrder: (poId: string) => void;
  // --- NEW ACTIONS ---
  decrementStockFromSale: (soldItems: CartItem[]) => void;
  getLowStockItems: () => InventoryItem[];
}

// --- STORE CREATION ---
export const useInventoryStore = create<InventoryState>((set, get) => ({
  inventoryItems: MOCK_INVENTORY_ITEMS,
  vendors: MOCK_VENDORS,
  purchaseOrders: [],

  addInventoryItem: (itemData) => {
    const newItem: InventoryItem = {
      ...itemData,
      id: `inv_${Date.now()}`, // Simple unique ID
    };
    set((state) => ({ inventoryItems: [newItem, ...state.inventoryItems] }));
  },

  createPurchaseOrder: (poData) => {
    const newPO: PurchaseOrder = {
      ...poData,
      id: `po_${Date.now()}`,
      poNumber: `PO-${get().purchaseOrders.length + 1}`,
      createdAt: new Date().toISOString(),
    };
    set((state) => ({ purchaseOrders: [newPO, ...state.purchaseOrders] }));
  },

  updateInventoryItem: (itemId, updates) => {
    set((state) => ({
      inventoryItems: state.inventoryItems.map((item) =>
        item.id === itemId ? { ...item, ...updates } : item
      ),
    }));
  },

  deleteInventoryItem: (itemId) => {
    set((state) => ({
      inventoryItems: state.inventoryItems.filter((item) => item.id !== itemId),
    }));
  },

  receivePurchaseOrder: (poId) => {
    const po = get().purchaseOrders.find((p) => p.id === poId);
    if (!po || po.status === "Received") return;

    const updatedItems = get().inventoryItems.map((item) => {
      const poItem = po.items.find((p) => p.inventoryItemId === item.id);
      if (poItem) {
        return {
          ...item,
          stockQuantity: item.stockQuantity + poItem.quantity,
        };
      }
      return item;
    });

    set((state) => ({
      inventoryItems: updatedItems,
      purchaseOrders: state.purchaseOrders.map((p) =>
        p.id === poId
          ? { ...p, status: "Received", receivedAt: new Date().toISOString() }
          : p
      ),
    }));
  },

  // --- NEW: Real-time stock deduction logic ---
  decrementStockFromSale: (soldItems) => {
    const { menuItems } = useMenuStore.getState();
    const currentInventory = get().inventoryItems;

    const stockUpdates: Record<string, number> = {};

    soldItems.forEach((cartItem) => {
      const menuItem = menuItems.find((mi) => mi.id === cartItem.menuItemId);
      if (menuItem?.recipe) {
        menuItem.recipe.forEach((recipeItem) => {
          const currentDecrement =
            stockUpdates[recipeItem.inventoryItemId] || 0;
          stockUpdates[recipeItem.inventoryItemId] =
            currentDecrement + recipeItem.quantity * cartItem.quantity;
        });
      }
    });

    const updatedInventory = currentInventory.map((invItem) => {
      const totalToDecrement = stockUpdates[invItem.id];
      if (totalToDecrement) {
        return {
          ...invItem,
          stockQuantity: invItem.stockQuantity - totalToDecrement,
        };
      }
      return invItem;
    });

    set({ inventoryItems: updatedInventory });
  },

  // --- NEW: Selector for low stock items ---
  getLowStockItems: () => {
    return get().inventoryItems.filter(
      (item) => item.stockQuantity <= item.reorderThreshold
    );
  },
}));
