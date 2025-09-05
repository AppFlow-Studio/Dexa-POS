import { CartItem, MenuItemType } from "@/lib/types";
import { create } from "zustand";

interface ModifierSidebarState {
    isOpen: boolean;
    mode: "add" | "edit" | "view" | "fullscreen";
    menuItem: MenuItemType | null;
    cartItem: CartItem | null;
    openToAdd: (item: MenuItemType, orderId: string | null) => void;
    openToEdit: (item: CartItem, orderId: string | null) => void;
    openToView: (item: CartItem, orderId: string | null) => void;
    openFullscreen: (item: MenuItemType, orderId: string | null) => void;
    openFullscreenEdit: (item: CartItem, orderId: string | null) => void;
    close: () => void;
}

export const useModifierSidebarStore = create<ModifierSidebarState>((set) => ({
    isOpen: false,
    mode: "add",
    menuItem: null,
    cartItem: null,

    openToAdd: (item: MenuItemType, orderId: string | null) => {
        set({
            isOpen: true,
            mode: "add",
            menuItem: item,
            cartItem: null,
        });
    },

    openToEdit: (item: CartItem, orderId: string | null) => {
        set({
            isOpen: true,
            mode: "edit",
            menuItem: null,
            cartItem: item,
        });
    },

    openToView: (item: CartItem, orderId: string | null) => {
        set({
            isOpen: true,
            mode: "view",
            menuItem: null,
            cartItem: item,
        });
    },

    openFullscreen: (item: MenuItemType, orderId: string | null) => {
        set({
            isOpen: true,
            mode: "fullscreen",
            menuItem: item,
            cartItem: null,
        });
    },

    openFullscreenEdit: (item: CartItem, orderId: string | null) => {
        // Find the menu item for this cart item to get modifiers
        const { MOCK_MENU_ITEMS } = require("@/lib/mockData");
        const menuItem = MOCK_MENU_ITEMS.find((menuItem: MenuItemType) => menuItem.id === item.menuItemId);

        set({
            isOpen: true,
            mode: "fullscreen",
            menuItem: menuItem || null,
            cartItem: item,
        });
    },

    close: () => {
        set({
            isOpen: false,
            mode: "add",
            menuItem: null,
            cartItem: null,
        });
    },
}));
