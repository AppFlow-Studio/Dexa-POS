import { create } from "zustand";

interface CustomerSheetState {
  isOpen: boolean;
  openSheet: () => void;
  closeSheet: () => void;
}

export const useCustomerSheetStore = create<CustomerSheetState>((set) => ({
  isOpen: false,
  openSheet: () => set({ isOpen: true }),
  closeSheet: () => set({ isOpen: false }),
}));
