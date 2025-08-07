import { create } from "zustand";

type PaymentMethod = "Card" | "Cash" | "Split";
type PaymentView = "review" | "cash" | "card" | "split" | "success";

interface PaymentState {
  isOpen: boolean;
  paymentMethod: PaymentMethod | null;
  view: PaymentView;
  // Actions
  open: (method: PaymentMethod) => void;
  close: () => void;
  setView: (view: PaymentView) => void;
}

export const usePaymentStore = create<PaymentState>((set) => ({
  isOpen: false,
  paymentMethod: null,
  view: "review", // The initial view is always the item review
  open: (method) =>
    set({ isOpen: true, paymentMethod: method, view: "review" }),
  close: () => set({ isOpen: false, paymentMethod: null }),
  setView: (view) => set({ view }),
}));
