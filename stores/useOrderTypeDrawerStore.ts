import { create } from "zustand";

interface OrderTypeDrawerState {
    isOpen: boolean;
    openDrawer: () => void;
    closeDrawer: () => void;
}

export const useOrderTypeDrawerStore = create<OrderTypeDrawerState>((set) => ({
    isOpen: false,
    openDrawer: () => set({ isOpen: true }),
    closeDrawer: () => set({ isOpen: false }),
}));
