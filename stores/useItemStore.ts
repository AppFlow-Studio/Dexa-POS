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

  getLowStockItems: () => {
    return get().items.filter(
      (item) => item.parLevel && item.stock < item.parLevel
    );
  },
}));
