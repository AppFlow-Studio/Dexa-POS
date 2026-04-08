import { BottomSheetMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import React from "react";
import { create } from "zustand";

type PaymentDetailView = "summary" | "refund" | "tipAdjust";

interface PaymentDetailSheetState {
  isOpen: boolean;
  orderId: string | null;
  initialView: PaymentDetailView;
  bottomSheetRef: React.RefObject<BottomSheetMethods> | null;

  // Actions
  open: (orderId: string, initialView?: PaymentDetailView) => void;
  close: () => void;
  setBottomSheetRef: (ref: React.RefObject<BottomSheetMethods>) => void;
}

export const usePaymentDetailSheetStore = create<PaymentDetailSheetState>(
  (set, get) => ({
    isOpen: false,
    orderId: null,
    initialView: "summary",
    bottomSheetRef: null,

    setBottomSheetRef: (ref) => set({ bottomSheetRef: ref }),

    open: (orderId: string, initialView?: PaymentDetailView) => {
      set({ isOpen: true, orderId, initialView: initialView || "summary" });
    },

    close: () => {
      // Just update state - Modal is controlled by isOpen state
      set({ isOpen: false, orderId: null, initialView: "summary" });
    },
  })
);
