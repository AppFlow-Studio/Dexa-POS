import { MOCK_INVENTORY_ITEMS, MOCK_VENDORS } from "@/lib/mockData";
import { CartItem, ExternalExpense, InventoryItem, POLineItem, PurchaseOrder, Vendor } from "@/lib/types";
import { create } from "zustand";
import { useMenuStore } from "./useMenuStore";

// --- STORE INTERFACE ---
interface InventoryState {
  inventoryItems: InventoryItem[];
  vendors: Vendor[];
  purchaseOrders: PurchaseOrder[];
  externalExpenses: ExternalExpense[];

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
  // External expense actions
  addExternalExpense: (expense: Omit<ExternalExpense, "id" | "expenseNumber">) => void;
  updateExternalExpense: (expenseId: string, updates: Partial<Omit<ExternalExpense, "id" | "expenseNumber">>) => void;
  removeExternalExpense: (expenseId: string) => void;
  // --- NEW ACTIONS ---
  decrementStockFromSale: (soldItems: CartItem[]) => void;
  decrementStockFromItem: (cartItem: CartItem) => void;
  getLowStockItems: () => InventoryItem[];
}

// --- STORE CREATION ---
export const useInventoryStore = create<InventoryState>((set, get) => ({
  inventoryItems: MOCK_INVENTORY_ITEMS,
  vendors: MOCK_VENDORS,
  externalExpenses: [
    {
      id: "expense_1",
      expenseNumber: "EXP-0001",
      totalAmount: 89.25,
      purchasedByEmployeeId: "emp_seed_1",
      purchasedByEmployeeName: "John Smith",
      purchasedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
      items: [
        {
          inventoryItemId: "inv_1", // Tomatoes
          itemName: "Fresh Tomatoes",
          quantity: 5,
          unitPrice: 3.50,
          totalAmount: 17.50,
          notes: "Organic variety"
        },
        {
          inventoryItemId: "inv_3", // Lettuce
          itemName: "Organic Lettuce",
          quantity: 3,
          unitPrice: 4.25,
          totalAmount: 12.75,
          notes: "Mixed greens"
        },
        {
          inventoryItemId: "inv_5", // Onions
          itemName: "Red Onions",
          quantity: 2,
          unitPrice: 2.50,
          totalAmount: 5.00,
          notes: "Large size"
        },
        {
          inventoryItemId: "inv_7", // Cheese
          itemName: "Mozzarella Cheese",
          quantity: 2,
          unitPrice: 27.00,
          totalAmount: 54.00,
          notes: "Fresh mozzarella"
        }
      ],
      notes: "Vendor delivery was delayed, had to purchase from local grocery store",
      relatedPOId: "po_seed_1",
      relatedPONumber: "PO-0001",
      storeName: "Fresh Market Grocery",
      storeLocation: "123 Main Street"
    },
    {
      id: "expense_2",
      expenseNumber: "EXP-0002",
      totalAmount: 45.80,
      purchasedByEmployeeId: "emp_seed_2",
      purchasedByEmployeeName: "Sarah Johnson",
      purchasedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
      items: [
        {
          inventoryItemId: "inv_2", // Potatoes
          itemName: "Russet Potatoes",
          quantity: 10,
          unitPrice: 1.25,
          totalAmount: 12.50,
          notes: "Large bag"
        },
        {
          inventoryItemId: "inv_4", // Carrots
          itemName: "Carrots",
          quantity: 3,
          unitPrice: 2.75,
          totalAmount: 8.25,
          notes: "Organic"
        },
        {
          inventoryItemId: "inv_6", // Garlic
          itemName: "Garlic",
          quantity: 1,
          unitPrice: 3.50,
          totalAmount: 3.50,
          notes: "Fresh bulbs"
        },
        {
          inventoryItemId: "inv_8", // Olive Oil
          itemName: "Extra Virgin Olive Oil",
          quantity: 1,
          unitPrice: 21.55,
          totalAmount: 21.55,
          notes: "Premium quality"
        }
      ],
      notes: "Emergency purchase for weekend rush",
      relatedPOId: "po_seed_2",
      relatedPONumber: "PO-0002",
      storeName: "Quick Stop Market",
      storeLocation: "456 Oak Avenue"
    },
    {
      id: "expense_3",
      expenseNumber: "EXP-0003",
      totalAmount: 28.90,
      purchasedByEmployeeId: "emp_seed_3",
      purchasedByEmployeeName: "Mike Wilson",
      purchasedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
      items: [
        {
          inventoryItemId: "inv_9", // Bread
          itemName: "Artisan Bread",
          quantity: 2,
          unitPrice: 4.50,
          totalAmount: 9.00,
          notes: "Sourdough"
        },
        {
          inventoryItemId: "inv_10", // Butter
          itemName: "Unsalted Butter",
          quantity: 2,
          unitPrice: 4.95,
          totalAmount: 9.90,
          notes: "European style"
        },
        {
          inventoryItemId: "inv_11", // Eggs
          itemName: "Free Range Eggs",
          quantity: 1,
          unitPrice: 10.00,
          totalAmount: 10.00,
          notes: "Dozen large"
        }
      ],
      notes: "Standalone purchase for special menu item",
      storeName: "Artisan Bakery",
      storeLocation: "789 Pine Street"
    },
    {
      id: "expense_4",
      expenseNumber: "EXP-0004",
      totalAmount: 67.80,
      purchasedByEmployeeId: "emp_seed_1",
      purchasedByEmployeeName: "John Smith",
      purchasedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days ago
      items: [
        {
          inventoryItemId: "inv_7", // Cheese
          itemName: "Mozzarella Cheese",
          quantity: 3,
          unitPrice: 22.60,
          totalAmount: 67.80,
          notes: "Vendor quality issue, had to source alternative supplier"
        }
      ],
      notes: "Vendor quality issue, had to source alternative supplier",
      relatedPOId: "po_seed_3",
      relatedPONumber: "PO-0003",
      storeName: "Cheese & More",
      storeLocation: "321 Cheese Lane"
    },
    {
      id: "expense_5",
      expenseNumber: "EXP-0005",
      totalAmount: 156.45,
      purchasedByEmployeeId: "emp_seed_4",
      purchasedByEmployeeName: "Emily Davis",
      purchasedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(), // 4 days ago
      items: [
        {
          inventoryItemId: "inv_9", // Bread
          itemName: "Artisan Bread",
          quantity: 5,
          unitPrice: 4.50,
          totalAmount: 22.50,
          notes: "Various types"
        },
        {
          inventoryItemId: "inv_1", // Tomatoes
          itemName: "Cherry Tomatoes",
          quantity: 4,
          unitPrice: 3.75,
          totalAmount: 15.00,
          notes: "Heirloom variety"
        },
        {
          inventoryItemId: "inv_3", // Lettuce
          itemName: "Mixed Greens",
          quantity: 6,
          unitPrice: 4.50,
          totalAmount: 27.00,
          notes: "Spring mix"
        },
        {
          inventoryItemId: "inv_5", // Onions
          itemName: "Sweet Onions",
          quantity: 3,
          unitPrice: 2.25,
          totalAmount: 6.75,
          notes: "Vidalia"
        },
        {
          inventoryItemId: "inv_7", // Cheese
          itemName: "Assorted Cheeses",
          quantity: 2,
          unitPrice: 42.60,
          totalAmount: 85.20,
          notes: "Cheese platter selection"
        }
      ],
      notes: "Standalone purchase for catering event",
      storeName: "Gourmet Market",
      storeLocation: "555 Food Court"
    },
    {
      id: "expense_6",
      expenseNumber: "EXP-0006",
      totalAmount: 35.60,
      purchasedByEmployeeId: "emp_seed_2",
      purchasedByEmployeeName: "Sarah Johnson",
      purchasedAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(), // 6 days ago
      items: [
        {
          inventoryItemId: "inv_2", // Potatoes
          itemName: "Russet Potatoes",
          quantity: 1,
          unitPrice: 35.60,
          totalAmount: 35.60,
          notes: "Vendor couldn't fulfill order, emergency replacement"
        }
      ],
      notes: "Vendor couldn't fulfill order, emergency replacement",
      relatedPOId: "po_seed_4",
      relatedPONumber: "PO-0004",
      storeName: "Farm Fresh Produce",
      storeLocation: "999 Farm Road"
    }
  ],
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
      createdByEmployeeId: "emp_seed_1",
      createdByEmployeeName: "John Smith",
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
      createdByEmployeeId: "emp_seed_2",
      createdByEmployeeName: "Sarah Johnson",
    };
    const po3: PurchaseOrder = {
      id: `po_seed_3`,
      poNumber: makePoNumber(2),
      vendorId: v1,
      status: "Pending Delivery",
      items: pick(2),
      originalItems: pick(2),
      createdAt: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 2).toISOString(),
      createdByEmployeeId: "emp_seed_3",
      createdByEmployeeName: "Mike Wilson",
    };
    const po4: PurchaseOrder = {
      id: `po_seed_4`,
      poNumber: makePoNumber(3),
      vendorId: v3,
      status: "Draft",
      items: pick(5),
      originalItems: pick(5),
      createdAt: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 1).toISOString(),
      createdByEmployeeId: "emp_seed_4",
      createdByEmployeeName: "Emily Davis",
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

  addExternalExpense: (expense) => {
    const existingExpenses = get().externalExpenses;
    const nextExpenseNumber = `EXP-${String(existingExpenses.length + 1).padStart(4, '0')}`;

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
            const currentDecrement = stockUpdates[recipeItem.inventoryItemId] || 0;
            stockUpdates[recipeItem.inventoryItemId] =
              currentDecrement + recipeItem.quantity * cartItem.quantity;
          });
          console.log("Found recipe", menuItem.recipe);
          console.log("Stock updates", stockUpdates);
        }
        // Simple item depletion: deplete the menu item's own stock
        const currentDecrement = menuItemStockUpdates[menuItem.id] || 0;
        menuItemStockUpdates[menuItem.id] = currentDecrement + cartItem.quantity;
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
    Object.entries(menuItemStockUpdates).forEach(([menuItemId, quantityToDecrement]) => {
      const menuItem = menuItems.find((mi) => mi.id === menuItemId);
      if (menuItem && menuItem.stockQuantity !== undefined) {
        const newStockQuantity = Math.max(0, menuItem.stockQuantity - quantityToDecrement);
        updateMenuItem(menuItemId, { stockQuantity: newStockQuantity });
      }
    });

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
            stockQuantity: Math.max(0, invItem.stockQuantity - totalToDecrement),
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
      const newStockQuantity = Math.max(0, menuItem.stockQuantity - cartItem.quantity);
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
