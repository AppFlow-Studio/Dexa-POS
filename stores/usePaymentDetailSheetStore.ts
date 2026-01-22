import { BottomSheetMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import React from "react";
import { create } from "zustand";

interface PaymentDetailSheetState {
  isOpen: boolean;
  orderId: string | null;
  bottomSheetRef: React.RefObject<BottomSheetMethods> | null;

  // Actions
  open: (orderId: string) => void;
  close: () => void;
  setBottomSheetRef: (ref: React.RefObject<BottomSheetMethods>) => void;
}

export const usePaymentDetailSheetStore = create<PaymentDetailSheetState>(
  (set, get) => ({
    isOpen: false,
    orderId: null,
    bottomSheetRef: null,

    setBottomSheetRef: (ref) => set({ bottomSheetRef: ref }),

    open: (orderId: string) => {
      set({ isOpen: true, orderId });
    },

    close: () => {
      // Just update state - Modal is controlled by isOpen state
      set({ isOpen: false, orderId: null });
    },
  })
);
