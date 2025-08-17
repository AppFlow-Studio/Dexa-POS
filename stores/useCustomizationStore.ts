import { MOCK_MENU_ITEMS } from "@/lib/mockData";
import { CartItem, MenuItemType } from "@/lib/types";
import { create } from "zustand";

type DialogMode = "add" | "edit";

interface CustomizationState {
  isOpen: boolean;
  mode: DialogMode;
  menuItem: MenuItemType | null; // The original menu item (for price, options, etc.)
  cartItem: CartItem | null; // The existing cart item if in 'edit' mode
  tableId: string | null; // The table to add/update the item on

  // Actions
  openToAdd: (menuItem: MenuItemType, tableId?: string) => void;
  openToEdit: (cartItem: CartItem, tableId?: string) => void;
  close: () => void;
}

export const useCustomizationStore = create<CustomizationState>((set) => ({
  isOpen: false,
  mode: "add",
  menuItem: null,
  cartItem: null,
  tableId: null,

  openToAdd: (menuItem, tableId) =>
    set({
      isOpen: true,
      mode: "add",
      menuItem: menuItem,
      cartItem: null, // Ensure cartItem is null in 'add' mode
      tableId: tableId || null,
    }),

  openToEdit: (cartItem, tableId) =>
    set({
      isOpen: true,
      mode: "edit",
      // In edit mode, we still need the original MenuItem for its options (sizes, addOns)
      menuItem:
        MOCK_MENU_ITEMS.find((mi) => mi.id === cartItem.menuItemId) || null,
      cartItem: cartItem,
      tableId: tableId || null,
    }),

  close: () =>
    set({
      isOpen: false,
      menuItem: null,
      cartItem: null,
      tableId: null,
    }),
}));
