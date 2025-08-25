import { create } from "zustand";
import { useOrderStore } from "./useOrderStore";

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
  setActiveTableId: (tableId: string | null) => void;
  clearActiveTableId: () => void;
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
    set((state) => {
      // Normalize paid quantities once on opening modal to avoid recursive loops
      try {
        const { activeOrderId, orders, addItemToActiveOrder } = useOrderStore.getState();
        if (activeOrderId) {
          // Use the helper to compute updated items without writing inside setActiveOrder
          const normalize = (useOrderStore as any).getState().normalizePaidQuantitiesFromPayments;
          if (typeof normalize === "function") {
            const updatedItems = normalize(activeOrderId);
            if (updatedItems) {
              // Commit items update safely
              useOrderStore.setState((prev: any) => ({
                orders: prev.orders.map((o: any) =>
                  o.id === activeOrderId ? { ...o, items: updatedItems } : o
                ),
              }));
            }
          }
        }
      } catch (e) {
        // no-op safeguard
      }
      return {
        isOpen: true,
        paymentMethod: method,
        view: "review",
        activeTableId: tableId || null,
      };
    }),
  close: () => set({ isOpen: false, paymentMethod: null, activeTableId: null }),
  setView: (view) => set({ view }),
  setActiveTableId: (tableId) => set({ activeTableId: tableId }),

  clearActiveTableId: () => set({ activeTableId: null }),
}));
