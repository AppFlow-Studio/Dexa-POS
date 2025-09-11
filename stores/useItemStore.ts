import { MOCK_MENU_ITEMS } from "@/lib/mockData";
import { MenuItemType } from "@/lib/types";
import { toast } from "@backpackapp-io/react-native-toast";
import { create } from "zustand";

interface ItemState {
  items: MenuItemType[];
  addItem: (
    newItemData: Omit<MenuItemType, "id" | "serialNo" | "lastUpdate">
  ) => void;
  updateItem: (itemId: string, updates: Partial<MenuItemType>) => void;
  decreaseStock: (itemId: string, quantity: number) => void;
  increaseStock: (itemId: string, quantity: number) => void;
  deleteItem: (itemId: string) => void;
  getLowStockItems: () => MenuItemType[];
}

export const useItemStore = create<ItemState>((set, get) => ({
  items: MOCK_MENU_ITEMS, // The single source of truth

  addItem: (newItemData) => {
    const newId = `item_${Date.now()}`;
    const newSerialNo = (get().items.length + 1).toString().padStart(3, "0");

    const newItem: MenuItemType = {
      ...newItemData,
      id: newId,
      serialNo: newSerialNo,

      lastUpdate: new Date().toLocaleString("en-US", {
        /* ... format options */
      }),
    };

    set((state) => ({
      items: [...state.items, newItem],
    }));
  },

  updateItem: (itemId, updates) => {
    set((state) => ({
      items: state.items.map((item) =>
        item.id === itemId
          ? { ...item, ...updates, lastUpdate: new Date().toLocaleString() }
          : item
      ),
    }));
    toast.success("Item updated successfully!");
  },
  decreaseStock: (itemId, quantity) => {
    set((state) => ({
      items: state.items.map((item) => {
        if (item.id === itemId) {
          const newStock = Math.max(0, item.stock - quantity); // Calculate new stock
          return {
            ...item,
            stock: newStock,
            // --- NEW: Update status based on new stock level ---
            status: newStock === 0 ? "Out of Stock" : item.status,
          };
        }
        return item;
      }),
    }));
  },

  increaseStock: (itemId, quantity) => {
    set((state) => ({
      items: state.items.map((item) => {
        if (item.id === itemId) {
          const newStock = item.stock + quantity;
          return {
            ...item,
            stock: newStock,
            // Update status if it was previously Out of Stock ---
            status:
              item.status === "Out of Stock" && newStock > 0
                ? "Active"
                : item.status,
          };
        }
        return item;
      }),
    }));
  },

  deleteItem: (itemId) => {
    set((state) => ({
      items: state.items.filter((item) => item.id !== itemId),
    }));
    toast.success("Item successfully deleted.");
  },

  getLowStockItems: () => {
    return get().items.filter(
      (item) => item.parLevel && item.stock < item.parLevel
    );
  },
}));
