import { toastService } from "@/lib/toastService";
import { CartItem } from "@/lib/types";
import { BottomSheetMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import React from "react"; // FIXED: Added React import
import { create } from "zustand";
import { useOrderStore } from "./useOrderStore";

type PaymentMethod = "Card" | "Cash" | "Split";
export type PaymentView =
  | "review"
  | "cash"
  | "card"
  | "success"
  | "cardOptions"
  | "manual"
  | "payment-method-selection"
  | "split-options"
  | "split-by-item"
  | "split-evenly"
  | "split"
  | "split-custom-amount"
  | "split-payment-success";

export interface Split {
  id: string;
  customerName: string;
  items: CartItem[];
  amount: number;
  status: "pending" | "paid";
  // FIXED: Removed splitSourceView from here. It belongs in the global store state, not per-guest.
}

const paymentViewToStepMap: Record<PaymentView, number> = {
  "payment-method-selection": 1,
  cardOptions: 2,
  card: 2,
  manual: 2,
  cash: 2,
  "split-options": 2,
  "split-by-item": 2,
  "split-evenly": 2,
  split: 2,
  "split-custom-amount": 2,
  "split-payment-success": 3,
  review: 3,
  success: 4,
};

const totalSteps = 4;

interface PaymentState {
  paymentBottomSheetRef: React.RefObject<BottomSheetMethods> | null;
  paymentMethod: PaymentMethod | null;
  view: PaymentView;
  activeTableId: string | null;
  isDirty: boolean;
  isOpen: boolean;
  splits: Split[];
  activeSplitId: string | null;
  splitSourceView: PaymentView | null; // FIXED: Added this missing property
  progress: {
    currentStep: number;
    totalSteps: number;
  };
  // Actions
  // setPaymentBottomSheetRef: (
  //   ref: React.RefObject<BottomSheetMethods> | null
  // ) => void;
  open: (
    method: PaymentMethod,
    tableId?: string | null,
    initialView?: PaymentView
  ) => void;
  close: () => void;
  setView: (view: PaymentView) => void;
  setActiveTableId: (tableId: string | null) => void;
  clearActiveTableId: () => void;
  // setIsDirty: (isDirty: boolean) => void;
  // setPaymentClean: () => void;
  // markPaymentAsDirty: () => void;
  // setPaymentProgress: (step: number, total: number) => void;
  // resetPaymentState: () => void;

  // // Split Actions
  // addSplit: (customerName: string) => void;
  // removeSplit: (splitId: string) => void;
  // assignItemToSplit: (splitId: string, item: CartItem) => void;
  // unassignItemFromSplit: (splitId: string, itemId: string) => void;
  // updateSplitAmount: (splitId: string, amount: number) => void;
  // updateSplitCustomerName: (splitId: string, newName: string) => void;
  // splitEvenly: (numberOfPeople: number, amountPerPerson: number) => void;

  // Flow Actions
  startSplitPaymentFlow: (source: PaymentView) => void;
  handlePaymentCompletion: (method: string) => void;
  moveToNextSplit: () => void;
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
  paymentBottomSheetRef: null,
  paymentMethod: null,
  view: "review",
  activeTableId: null,
  isDirty: false,
  isOpen: false,
  splits: [],
  activeSplitId: null,
  splitSourceView: null, // Initialized here
  progress: { currentStep: 1, totalSteps: totalSteps },

  setPaymentBottomSheetRef: (ref) => set({ paymentBottomSheetRef: ref }),

  open: (method, tableId, initialView) => {
    get().paymentBottomSheetRef?.current?.expand();
    set({
      isOpen: true,
      paymentMethod: method,
      view: initialView || "payment-method-selection",
      activeTableId: tableId || null,
      isDirty: false,
      splits: [],
      activeSplitId: null,
      splitSourceView: null, // Reset source
      progress: {
        currentStep:
          paymentViewToStepMap[initialView || "payment-method-selection"],
        totalSteps: totalSteps,
      },
    });
  },

  close: () => {
    get().resetPaymentState();
    get().paymentBottomSheetRef?.current?.close();
    set({ isOpen: false });
  },

  setView: (view) =>
    set((state) => ({
      view,
      progress: {
        currentStep: paymentViewToStepMap[view] || state.progress.currentStep,
        totalSteps: totalSteps,
      },
    })),

  setActiveTableId: (tableId) => set({ activeTableId: tableId }),
  clearActiveTableId: () => set({ activeTableId: null }),
  setIsDirty: (isDirty) => set({ isDirty }),
  setPaymentClean: () => set({ isDirty: false }),
  markPaymentAsDirty: () => set({ isDirty: true }),
  setPaymentProgress: (step, total) =>
    set({ progress: { currentStep: step, totalSteps: total } }),

  resetPaymentState: () => {
    set({
      paymentMethod: null,
      view: "payment-method-selection",
      activeTableId: null,
      isDirty: false,
      splits: [],
      activeSplitId: null,
      splitSourceView: null,
      progress: { currentStep: 1, totalSteps: totalSteps },
    });
  },

  // --- SPLIT ACTIONS ---

  addSplit: (customerName) => {
    set((state) => ({
      splits: [
        ...state.splits,
        {
          id: `split_${Date.now()}`,
          customerName,
          items: [],
          amount: 0,
          status: "pending",
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
          ? { ...s, items: [...s.items, { ...item, quantity: 1 }] }
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
    const newSplits: Split[] = [];
    for (let i = 0; i < numberOfPeople; i++) {
      newSplits.push({
        id: `split_${Date.now()}_${i}`,
        customerName: `Guest ${i + 1}`,
        items: [],
        amount: amountPerPerson,
        status: "pending",
      });
    }
    set({ splits: newSplits, isDirty: false });
  },

  // --- PAYMENT LOOP LOGIC ---

  startSplitPaymentFlow: (source: PaymentView) => {
    const { splits } = get();

    // 1. Recalculate amounts if needed (Split by Item logic)
    const updatedSplits = splits.map((split) => {
      // If we have items but 0 amount, assume we need to calculate price from items
      if (split.items.length > 0 && split.amount === 0) {
        const calculatedAmount = split.items.reduce(
          (acc, item) => acc + item.price * item.quantity,
          0
        );
        return { ...split, amount: calculatedAmount };
      }
      return split;
    });

    set({ splits: updatedSplits });

    const firstPending = updatedSplits.find((s) => s.status === "pending");

    if (firstPending) {
      set({
        activeSplitId: firstPending.id,
        view: "payment-method-selection",
        isDirty: false,
        splitSourceView: source, // Save the source here
      });
    } else {
      set({ view: "success" });
    }
  },

  handlePaymentCompletion: (method: string) => {
    const { activeSplitId, splits } = get();
    const { activeOrderId, addPaymentToOrder, markOrderAsPaid } =
      useOrderStore.getState();

    if (!activeOrderId) return;

    if (activeSplitId) {
      // SPLIT FLOW
      const currentSplit = splits.find((s) => s.id === activeSplitId);
      if (!currentSplit) return;

      addPaymentToOrder({
        orderId: activeOrderId,
        amount: currentSplit.amount,
        method: method as any,
      });

      const updatedSplits = splits.map((s) =>
        s.id === activeSplitId ? { ...s, status: "paid" as const } : s
      );

      // Find NEXT pending
      const nextPending = updatedSplits.find((s) => s.status === "pending");

      set({ splits: updatedSplits });

      if (nextPending) {
        set({ view: "split-payment-success" });
      } else {
        markOrderAsPaid(activeOrderId);
        set({ view: "success", activeSplitId: null });
      }
    } else {
      // STANDARD FLOW
      const { activeOrderOutstandingTotal } = useOrderStore.getState();
      addPaymentToOrder({
        orderId: activeOrderId,
        amount: activeOrderOutstandingTotal,
        method: method as any,
      });
      markOrderAsPaid(activeOrderId);
      set({ view: "success" });
    }
  },

  moveToNextSplit: () => {
    const { splits } = get();
    const nextPending = splits.find((s) => s.status === "pending");
    if (nextPending) {
      set({ activeSplitId: nextPending.id, view: "payment-method-selection" });
    }
  },

  processManualCardPayment: async (details) => {
    return new Promise((resolve) => {
      try {
        setTimeout(() => {
          get().handlePaymentCompletion("Card");
          resolve(true);
        }, 2000);
      } catch (error: any) {
        toastService.show({
          title: "Payment Failed",
          message: error.message || "Error processing payment.",
          type: "error",
        });
        resolve(false);
      }
    });
  },
}));
