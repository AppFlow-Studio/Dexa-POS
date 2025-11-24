import { toastService } from "@/lib/toastService";
import { create } from "zustand";
import { useOrderStore } from "./useOrderStore";

type PaymentMethod = "Card" | "Cash" | "Split";
type PaymentView =
  | "review"
  | "cash"
  | "card"
  | "split"
  | "success"
  | "cardOptions"
  | "manual";

interface PaymentState {
  isOpen: boolean;
  paymentMethod: PaymentMethod | null;
  view: PaymentView;
  activeTableId: string | null;
  // Actions
  open: (
    method: PaymentMethod,
    tableId?: string | null,
    initialView?: PaymentView
  ) => void;
  close: () => void;
  setView: (view: PaymentView) => void;
  setActiveTableId: (tableId: string | null) => void;
  clearActiveTableId: () => void;
  processManualCardPayment(details: {
    cardBrand: string;
    last4: string;
  }): Promise<boolean>;
}

export const usePaymentStore = create<PaymentState>((set) => ({
  isOpen: false,
  paymentMethod: null,
  view: "review",
  activeTableId: null,
  open: (
    method,
    tableId, // tableId can be undefined or null
    initialView // Add initialView here
  ) =>
    set((state) => {
      // Normalize paid quantities once on opening modal to avoid recursive loops
      try {
        const { activeOrderId } = useOrderStore.getState();
        if (activeOrderId) {
          // Use the helper to compute updated items without writing inside setActiveOrder
          const normalize = (useOrderStore as any).getState()
            .normalizePaidQuantitiesFromPayments;
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
        view: method === "Card" ? "cardOptions" : initialView || "review", // Use initialView or default to "review"
        activeTableId: tableId || null,
      };
    }),
  close: () => set({ isOpen: false, paymentMethod: null }),
  setView: (view) => set({ view }),
  setActiveTableId: (tableId) => set({ activeTableId: tableId }),
  clearActiveTableId: () => set({ activeTableId: null }),

  processManualCardPayment: async (details) => {
    return new Promise((resolve) => {
      try {
        const {
          activeOrderId,
          activeOrderOutstandingTotal,
          addPaymentToOrder,
          markOrderAsPaid,
        } = useOrderStore.getState();

        if (!activeOrderId) {
          throw new Error("No active order to process payment for.");
        }

        // Simulate network delay
        setTimeout(() => {
          addPaymentToOrder({
            orderId: activeOrderId,
            amount: activeOrderOutstandingTotal,
            method: "Card",
            cardBrand: details.cardBrand,
            last4: details.last4,
          });

          markOrderAsPaid(activeOrderId);

          resolve(true); // Indicate success
        }, 2000);
      } catch (error: any) {
        toastService.show({
          title: "Payment Failed",
          message:
            error.message || "An unexpected error occurred during payment.",
          type: "error",
        });
        resolve(false); // Indicate failure
      }
    });
  },
}));
