import { MENU_IMAGE_MAP, MOCK_MENU_ITEMS } from "@/lib/mockData";
import { InventoryItem, MenuItemType } from "@/lib/types";
import { create } from "zustand";

interface InventoryState {
  inventoryItems: InventoryItem[];
  addItem: (
    newItemData: Omit<InventoryItem, "id" | "serialNo" | "lastUpdate">
  ) => void;
}

// Transform the initial menu items into the inventory format
const initialInventoryItems: InventoryItem[] = MOCK_MENU_ITEMS.map(
  (item, index) => ({
    id: item.id,
    serialNo: (index + 1).toString().padStart(3, "0"),
    name: item.name,
    image: item.image
      ? MENU_IMAGE_MAP[item.image as keyof typeof MENU_IMAGE_MAP]
      : undefined,
    description: item.description || "No description available",
    stock: Math.floor(Math.random() * 200) + 50, // Random initial stock
    unit: "PCs",
    lastUpdate: new Date().toLocaleString("en-US", {
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }),
    status: Math.random() > 0.8 ? "Out of Stock" : "Active",
    category: item.category,
    modifier:
      item.modifiers && item.modifiers.length > 0 ? "Customizable" : "None",
    availability: true,
  })
);

export const useInventoryStore = create<InventoryState>((set, get) => ({
  inventoryItems: initialInventoryItems,

  addItem: (newItemData) => {
    const newId = `item_${Date.now()}`;
    const newSerialNo = (get().inventoryItems.length + 1)
      .toString()
      .padStart(3, "0");

    // Create the new inventory item
    const newInventoryItem: InventoryItem = {
      ...newItemData,
      id: newId,
      serialNo: newSerialNo,
      lastUpdate: new Date().toLocaleString("en-US", {
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      }),
    };

    // Also create a corresponding menu item
    const newMenuItem: MenuItemType = {
      id: newId,
      name: newItemData.name,
      description: newItemData.description,
      price: 0, // Assuming price is managed elsewhere or needs to be added
      meal: ["Lunch", "Dinner"], // Default meal assignment
      category: newItemData.category as any,
      cardBgColor: "bg-gray-50",
    };

    // Add the new item to the inventory state
    set((state) => ({
      inventoryItems: [...state.inventoryItems, newInventoryItem],
    }));

    // Add the new item to the mock menu data in memory
    MOCK_MENU_ITEMS.push(newMenuItem);
  },
}));
