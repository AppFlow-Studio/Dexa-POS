import { toastService } from "@/lib/toastService";
import { CartItem } from "@/lib/types";
import { BottomSheetMethods } from "@gorhom/bottom-sheet/lib/typescript/types"; // Import BottomSheetMethods
import { create } from "zustand";
import { useOrderStore } from "./useOrderStore";

type PaymentMethod = "Card" | "Cash" | "Split";
export type PaymentView =
  | "review"
  | "cash"
  | "card"
  | "split"
  | "success"
  | "cardOptions"
  | "manual"
  | "payment-method-selection"
  | "split-options" // New view for initial split selection
  | "split-by-item"
  | "split-evenly"
  | "split-custom-amount";

export interface Split {
  id: string;
  customerName: string;
  items: CartItem[];
  amount: number;
}

const paymentViewToStepMap: Record<PaymentView, number> = {
  "payment-method-selection": 1,
  cardOptions: 2,
  card: 2, // Card payment view is part of method details
  manual: 2, // Manual card entry is part of method details
  cash: 2, // Cash payment is part of method details
  "split-options": 2, // Split options is part of method details
  "split-by-item": 2,
  "split-evenly": 2,
  "split-custom-amount": 2,
  review: 3,
  success: 4,
};
const totalSteps = 4; // Define total steps

interface PaymentState {
  paymentBottomSheetRef: React.RefObject<BottomSheetMethods> | null; // Add ref state
  paymentMethod: PaymentMethod | null;
  view: PaymentView;
  activeTableId: string | null;
  isDirty: boolean;
  splits: Split[];
  progress: {
    currentStep: number;
    totalSteps: number;
  };
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
  setIsDirty: (isDirty: boolean) => void;
  addSplit: (customerName: string) => void;
  removeSplit: (splitId: string) => void;
  assignItemToSplit: (splitId: string, item: CartItem) => void;
  unassignItemFromSplit: (splitId: string, itemId: string) => void;
  updateSplitAmount: (splitId: string, amount: number) => void;
  updateSplitCustomerName: (splitId: string, newName: string) => void;
  setPaymentProgress: (step: number, total: number) => void;
  resetPaymentState: () => void;
  setPaymentBottomSheetRef: (
    ref: React.RefObject<BottomSheetMethods> | null
  ) => void; // New action to set ref
  setPaymentClean: () => void; // New action to set isDirty to false
  markPaymentAsDirty: () => void; // New action to explicitly mark as dirty
  splitEvenly: (numberOfPeople: number, amountPerPerson: number) => void; // New action for evenly splitting
}

export const usePaymentStore = create<PaymentState>((set, get) => ({
  paymentBottomSheetRef: null, // Initial ref state
  paymentMethod: null,
  view: "review",
  activeTableId: null,
  isDirty: false,
  splits: [],
  progress: { currentStep: 1, totalSteps: totalSteps }, // Initialize progress

  setPaymentBottomSheetRef: (ref) => set({ paymentBottomSheetRef: ref }), // Implementation

  open: (
    method,
    tableId, // tableId can be undefined or null
    initialView // Add initialView here
  ) => {
    // Imperatively open the bottom sheet via ref
    get().paymentBottomSheetRef?.current?.expand(); // Or snapToIndex(0) if always starting at first point

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
      const newView = initialView || "payment-method-selection"; // Default to method selection
      return {
        paymentMethod: method,
        view: newView,
        activeTableId: tableId || null,
        isDirty: false,
        splits: [],
        progress: {
          currentStep: paymentViewToStepMap[newView],
          totalSteps: totalSteps,
        },
      };
    });
  },
  close: () => {
    get().resetPaymentState();
    get().paymentBottomSheetRef?.current?.close(); // Imperatively close the bottom sheet
  },
  setView: (view) =>
    set((state) => ({
      view,
      progress: {
        currentStep: paymentViewToStepMap[view],
        totalSteps: totalSteps,
      },
    })),
  setActiveTableId: (tableId) => set({ activeTableId: tableId }),
  clearActiveTableId: () => set({ activeTableId: null }),
  setIsDirty: (isDirty) => set({ isDirty }),
  setPaymentClean: () => set({ isDirty: false }), // Implementation of new action
  markPaymentAsDirty: () => set({ isDirty: true }), // Implementation of new action
  addSplit: (customerName) => {
    set((state) => ({
      splits: [
        ...state.splits,
        {
          id: `split_${Date.now()}`,
          customerName,
          items: [],
          amount: 0,
        },
      ],
      isDirty: true,
    }));
  },
  removeSplit: (splitId) => {
    set((state) => ({
      splits: state.splits.filter((s) => s.id !== splitId),
      isDirty: true,
    }));
  },
  assignItemToSplit: (splitId, item) => {
    set((state) => ({
      splits: state.splits.map((s) =>
        s.id === splitId
          ? { ...s, items: [...s.items, { ...item, quantity: 1 }] } // Assign 1 quantity for now
          : s
      ),
      isDirty: true,
    }));
  },
  unassignItemFromSplit: (splitId, itemId) => {
    set((state) => ({
      splits: state.splits.map((s) =>
        s.id === splitId
          ? { ...s, items: s.items.filter((item) => item.id !== itemId) }
          : s
      ),
      isDirty: true,
    }));
  },
  updateSplitAmount: (splitId, amount) => {
    set((state) => ({
      splits: state.splits.map((s) =>
        s.id === splitId ? { ...s, amount } : s
      ),
      isDirty: true,
    }));
  },
  updateSplitCustomerName: (splitId, newName) => {
    set((state) => ({
      splits: state.splits.map((s) =>
        s.id === splitId ? { ...s, customerName: newName } : s
      ),
      isDirty: true,
    }));
  },
  splitEvenly: (numberOfPeople, amountPerPerson) => {
    const currentSplits = get().splits;
    const { addSplit, updateSplitAmount } = get(); // Access other actions
    currentSplits.forEach((s) => get().removeSplit(s.id)); // Clear existing splits

    const newSplits = [];
    for (let i = 0; i < numberOfPeople; i++) {
      const customerName = `Guest ${i + 1}`;
      const newSplit: Split = {
        id: `split_${Date.now()}_${i}`,
        customerName,
        items: [],
        amount: amountPerPerson,
      };
      newSplits.push(newSplit);
    }
    set({ splits: newSplits, isDirty: false }); // Set new splits and mark clean
  },
  setPaymentProgress: (step, total) => {
    set({ progress: { currentStep: step, totalSteps: total } });
  },
  resetPaymentState: () => {
    set({
      paymentMethod: null,
      view: "payment-method-selection", // Reset to initial method selection view
      activeTableId: null,
      isDirty: false,
      splits: [],
      progress: { currentStep: 1, totalSteps: totalSteps },
    });
  },

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
