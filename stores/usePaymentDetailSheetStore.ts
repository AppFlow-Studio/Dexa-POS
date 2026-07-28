import { BottomSheetMethods } from "@/components/ui/bottomSheet";
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
  clearBottomSheetRef: (ref: React.RefObject<BottomSheetMethods>) => void;
}

export const usePaymentDetailSheetStore = create<PaymentDetailSheetState>(
  (set, get) => ({
    isOpen: false,
    orderId: null,
    initialView: "summary",
    bottomSheetRef: null,

    setBottomSheetRef: (ref) => set({ bottomSheetRef: ref }),

    // Only clear if the stored ref is still the one this owner registered, so a
    // stale owner unmounting after a newer owner mounted doesn't wipe the live ref.
    clearBottomSheetRef: (ref) => {
      if (get().bottomSheetRef === ref) set({ bottomSheetRef: null });
    },

    open: (orderId: string, initialView?: PaymentDetailView) => {
      set({ isOpen: true, orderId, initialView: initialView || "summary" });
    },

    close: () => {
      // Just update state - Modal is controlled by isOpen state
      set({ isOpen: false, orderId: null, initialView: "summary" });
    },
  })
);
