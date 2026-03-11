import { BottomSheetMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import { create } from "zustand";

interface CustomerSheetState {
  isOpen: boolean;
  sheetRef: React.RefObject<BottomSheetMethods> | null;
  setSheetRef: (ref: React.RefObject<BottomSheetMethods>) => void;
  openSheet: () => void;
  closeSheet: () => void;
}

export const useCustomerSheetStore = create<CustomerSheetState>((set) => ({
  isOpen: false,
  sheetRef: null,
  setSheetRef: (ref) => set({ sheetRef: ref }),
  openSheet: () => {
    const { sheetRef } = useCustomerSheetStore.getState();
    sheetRef?.current?.expand();
    set({ isOpen: true });
  },
  closeSheet: () => {
    const { sheetRef } = useCustomerSheetStore.getState();
    sheetRef?.current?.close();
    set({ isOpen: false });
  },
}));
