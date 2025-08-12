import { create } from "zustand";

type PaymentMethod = "Card" | "Cash" | "Split";
type PaymentView = "review" | "cash" | "card" | "split" | "success";

interface PaymentState {
  isOpen: boolean;
  paymentMethod: PaymentMethod | null;
  view: PaymentView;
  activeTableId: string | null;
  // Actions
  // The tableId parameter should be optional
  open: (method: PaymentMethod, tableId?: string | null) => void;
  close: () => void;
  setView: (view: PaymentView) => void;
}

export const usePaymentStore = create<PaymentState>((set) => ({
  isOpen: false,
  paymentMethod: null,
  view: "review",
  activeTableId: null,
  open: (
    method,
    tableId // tableId can be undefined or null
  ) =>
    set({
      isOpen: true,
      paymentMethod: method,
      view: "review",
      activeTableId: tableId || null, // Ensure it's stored as null if not provided
    }),
  close: () => set({ isOpen: false, paymentMethod: null, activeTableId: null }),
  setView: (view) => set({ view }),
}));
