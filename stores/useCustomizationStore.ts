import { MOCK_MENU_ITEMS } from "@/lib/mockData";
import { CartItem, MenuItemType } from "@/lib/types";
import { create } from "zustand";

type DialogMode = "add" | "edit" | "view";

interface CustomizationState {
  isOpen: boolean;
  mode: DialogMode;
  menuItem: MenuItemType | null; // The original menu item (for price, options, etc.)
  cartItem: CartItem | null; // The existing cart item if in 'edit' mode
  activeOrderId: string | null; // The ID of the order to add/update items in

  // Actions
  openToAdd: (menuItem: MenuItemType, orderId: string | null) => void;
  openToEdit: (cartItem: CartItem, orderId: string | null) => void;
  openToView: (cartItem: CartItem) => void;

  close: () => void;
}

export const useCustomizationStore = create<CustomizationState>((set) => ({
  isOpen: false,
  mode: "add",
  menuItem: null,
  cartItem: null, // The existing cart item if in 'edit' mode
  activeOrderId: null, // The ID of the order to add/update items in

  openToAdd: (menuItem, orderId) =>
    set({
      isOpen: true,
      mode: "add",
      menuItem: menuItem,
      cartItem: null,
      // 3. Store the activeOrderId
      activeOrderId: orderId,
    }),

  openToEdit: (cartItem, orderId) =>
    set({
      isOpen: true,
      mode: "edit",
      menuItem:
        MOCK_MENU_ITEMS.find((mi) => mi.id === cartItem.menuItemId) || null,
      cartItem: cartItem,
      // 3. Store the activeOrderId
      activeOrderId: orderId,
    }),

  openToView: (cartItem) =>
    set({
      isOpen: true,
      mode: "view", // Set the new mode
      menuItem:
        MOCK_MENU_ITEMS.find((mi) => mi.id === cartItem.menuItemId) || null,
      cartItem: cartItem,
      activeOrderId: null, // No order context needed for just viewing
    }),

  close: () =>
    set({
      isOpen: false,
      menuItem: null,
      cartItem: null,
      activeOrderId: null,
    }),
}));
