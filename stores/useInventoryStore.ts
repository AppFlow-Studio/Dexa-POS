import { MOCK_INVENTORY_ITEMS, MOCK_VENDORS } from "@/lib/mockData";
import { CartItem, InventoryItem, POLineItem, PurchaseOrder, Vendor } from "@/lib/types";
import { create } from "zustand";
import { useMenuStore } from "./useMenuStore";

// --- STORE INTERFACE ---
interface InventoryState {
  inventoryItems: InventoryItem[];
  vendors: Vendor[];
  purchaseOrders: PurchaseOrder[];

  // --- ACTIONS ---
  addVendor: (vendorData: Omit<Vendor, "id">) => void;
  updateVendor: (vendorId: string, updates: Omit<Vendor, "id">) => void;
  deleteVendor: (vendorId: string) => void;

  addInventoryItem: (itemData: Omit<InventoryItem, "id">) => void;
  updateInventoryItem: (
    itemId: string,
    updates: Omit<InventoryItem, "id">
  ) => void;
  deleteInventoryItem: (itemId: string) => void;

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
  logDeliveryForPO: (poId: string, data: { photos?: string[]; deliveredAt?: string; notes?: string; receivedItems: POLineItem[] }) => void; // -> Awaiting Payment
  logPaymentForPO: (poId: string, data: { method: "Card" | "Cash"; amount: number; paidAt?: string; cardLast4?: string; paidToEmployee?: string }) => void; // -> Paid
  cancelPurchaseOrder: (poId: string) => void; // -> Cancelled
  // --- NEW ACTIONS ---
  decrementStockFromSale: (soldItems: CartItem[]) => void;
  getLowStockItems: () => InventoryItem[];
}

// --- STORE CREATION ---
export const useInventoryStore = create<InventoryState>((set, get) => ({
  inventoryItems: MOCK_INVENTORY_ITEMS,
  vendors: MOCK_VENDORS,
  purchaseOrders: (() => {
    const items = MOCK_INVENTORY_ITEMS;
    const vendors = MOCK_VENDORS;
    if (!vendors.length || !items.length) return [] as PurchaseOrder[];
    const now = new Date();
    const makePoNumber = (idx: number) => {
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const seq = String(idx + 1).padStart(3, "0");
      return `PO-${yyyy}-${mm}-${seq}`;
    };
    const makeLine = (invId: string, qty: number) => {
      const inv = items.find((i) => i.id === invId)!;
      return { inventoryItemId: inv.id, quantity: qty, cost: inv.cost };
    };
    const pick = (n: number, category?: string) => {
      const pool = category ? items.filter((i) => i.category === category) : items;
      return pool.slice(0, Math.min(n, pool.length)).map((i, idx) => makeLine(i.id, 5 + idx));
    };
    const v1 = vendors[0]?.id;
    const v2 = vendors[1]?.id || vendors[0]?.id;
    const v3 = vendors[2]?.id || vendors[0]?.id;

    const po1: PurchaseOrder = {
      id: `po_seed_1`,
      poNumber: makePoNumber(0),
      vendorId: v1,
      status: "Awaiting Payment",
      items: pick(3),
      originalItems: pick(3),
      receivedItems: pick(2),
      createdAt: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 10).toISOString(),
      deliveryLoggedAt: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 7).toISOString(),
      deliveryPhotos: [],
    };
    const po2: PurchaseOrder = {
      id: `po_seed_2`,
      poNumber: makePoNumber(1),
      vendorId: v2,
      status: "Paid",
      items: pick(4),
      originalItems: pick(4),
      receivedItems: pick(4),
      createdAt: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 20).toISOString(),
      deliveryLoggedAt: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 18).toISOString(),
      deliveryPhotos: [],
      payment: { method: "Card", amount: 250, paidAt: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 17).toISOString(), cardLast4: "1234", paidToEmployee: "John Smith" },
    };
    const po3: PurchaseOrder = {
      id: `po_seed_3`,
      poNumber: makePoNumber(2),
      vendorId: v1,
      status: "Pending Delivery",
      items: pick(2),
      originalItems: pick(2),
      createdAt: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 2).toISOString(),
    };
    const po4: PurchaseOrder = {
      id: `po_seed_4`,
      poNumber: makePoNumber(3),
      vendorId: v3,
      status: "Draft",
      items: pick(5),
      originalItems: pick(5),
      createdAt: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 1).toISOString(),
    };
    return [po4, po3, po2, po1];
  })(),
  addVendor: (vendorData) => {
    const newVendor: Vendor = {
      ...vendorData,
      id: `vendor_${Date.now()}`,
    };
    set((state) => ({ vendors: [newVendor, ...state.vendors] }));
  },
  updateVendor: (vendorId, updates) => {
    set((state) => ({
      vendors: state.vendors.map((v) =>
        v.id === vendorId ? { ...v, ...updates } : v
      ),
    }));
  },
  deleteVendor: (vendorId) => {
    set((state) => ({
      vendors: state.vendors.filter((v) => v.id !== vendorId),
      // Also clear this vendor from any items that were assigned to it
      inventoryItems: state.inventoryItems.map((item) =>
        item.vendorId === vendorId ? { ...item, vendorId: null } : item
      ),
    }));
  },

  addInventoryItem: (itemData) => {
    const newItem: InventoryItem = {
      ...itemData,
      id: `inv_${Date.now()}`, // Simple unique ID
    };
    set((state) => ({ inventoryItems: [newItem, ...state.inventoryItems] }));
  },

  createPurchaseOrder: (poData) => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const sequence = (get().purchaseOrders.length + 1).toString().padStart(3, "0");
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

  submitPurchaseOrder: (poId) => {
    set((state) => ({
      purchaseOrders: state.purchaseOrders.map((p) =>
        p.id === poId && p.status === "Draft" ? { ...p, status: "Pending Delivery" } : p
      ),
    }));
  },

  logDeliveryForPO: (poId, data) => {
    const po = get().purchaseOrders.find((p) => p.id === poId);
    if (!po) return;
    // Update inventory quantities for delivered items
    const received = data.receivedItems && data.receivedItems.length > 0 ? data.receivedItems : po.items;
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

  // Real-time stock deduction logic ---
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

  // --- Selector for low stock items ---
  getLowStockItems: () => {
    return get().inventoryItems.filter(
      (item) => item.stockQuantity <= item.reorderThreshold
    );
  },
}));
