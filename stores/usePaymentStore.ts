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
  handlePaymentCompletion: (
    method: string,
    tipAmount?: number,
    transactionDetails?: Record<string, any>
  ) => void;
  moveToNextSplit: () => void;
  processManualCardPayment(details: {
    cardBrand: string;
    last4: string;
    tipAmount?: number;
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
  resetSplits: () => void; // Action to clear splits when going back
  handleSuccessClose: () => void; // Action to run Done logic when success view is closed by dragging
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

  // Called when success view is dismissed by dragging down
  handleSuccessClose: () => {
    const { activeTableId } = get();
    const { activeOrderId, orders, startNewOrder, setActiveOrder } =
      useOrderStore.getState();

    const activeOrder = orders.find((o) => o.id === activeOrderId);

    // For dine-in orders on a table, just close (table keeps the paid order)
    if (activeOrder?.order_type === "Dine In" && activeTableId) {
      get().close();
      return;
    }

    // For quick service / takeout, start a new order immediately
    setTimeout(() => {
      const newOrder = startNewOrder();
      setActiveOrder(newOrder.id);
    }, 100);

    get().close();
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
    set((state) => {
      const updatedSplits = state.splits.map((s) => {
        if (s.id !== splitId) return s;

        // Check if item already exists in this split
        const existingItemIndex = s.items.findIndex((i) => i.id === item.id);

        if (existingItemIndex >= 0) {
          // Increment quantity of existing item
          const updatedItems = [...s.items];
          updatedItems[existingItemIndex] = {
            ...updatedItems[existingItemIndex],
            quantity: updatedItems[existingItemIndex].quantity + 1,
          };
          return { ...s, items: updatedItems };
        } else {
          // Add new item with quantity 1
          return { ...s, items: [...s.items, { ...item, quantity: 1 }] };
        }
      });

      return { splits: updatedSplits, isDirty: true };
    });
  },

  unassignItemFromSplit: (splitId, itemId) => {
    set((state) => {
      let updatedSplits = state.splits.map((s) => {
        if (s.id !== splitId) return s;

        const existingItemIndex = s.items.findIndex((i) => i.id === itemId);
        if (existingItemIndex < 0) return s;

        const existingItem = s.items[existingItemIndex];

        if (existingItem.quantity > 1) {
          // Decrement quantity by 1
          const updatedItems = [...s.items];
          updatedItems[existingItemIndex] = {
            ...updatedItems[existingItemIndex],
            quantity: updatedItems[existingItemIndex].quantity - 1,
          };
          return { ...s, items: updatedItems };
        } else {
          // Remove item entirely when quantity becomes 0
          return { ...s, items: s.items.filter((i) => i.id !== itemId) };
        }
      });

      // Auto-remove empty guests (but keep at least one guest)
      if (updatedSplits.length > 1) {
        updatedSplits = updatedSplits.filter(
          (s) =>
            s.items.length > 0 ||
            updatedSplits.filter((sp) => sp.items.length > 0).length === 0
        );
      }

      // If active split was removed, switch to first available
      const currentActiveSplitId = state.activeSplitId;
      const activeStillExists = updatedSplits.some(
        (s) => s.id === currentActiveSplitId
      );
      const newActiveSplitId = activeStillExists
        ? currentActiveSplitId
        : updatedSplits[0]?.id || null;

      return {
        splits: updatedSplits,
        activeSplitId: newActiveSplitId,
        isDirty: true,
      };
    });
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

  resetSplits: () => {
    set({ splits: [], activeSplitId: null, isDirty: false });
  },

  // --- PAYMENT LOOP LOGIC ---

  startSplitPaymentFlow: (source: PaymentView) => {
    const { splits } = get();

    // Get order and tax rates for tax calculation
    const { activeOrderId, orders } = useOrderStore.getState();
    const activeOrder = orders.find((o) => o.id === activeOrderId);
    const taxRatesMap =
      require("@/stores/useStoreSettingsStore").useStoreSettingsStore.getState()
        .taxRatesMap;

    // Calculate order subtotal and discount for proportional tax calculation
    const masterItems = activeOrder?.items || [];
    const orderSubtotal = masterItems.reduce(
      (acc, item) => acc + item.price * item.quantity,
      0
    );
    const itemDiscountsTotal = masterItems.reduce((acc, item) => {
      if (item.appliedDiscount) {
        return (
          acc + item.originalPrice * item.appliedDiscount.value * item.quantity
        );
      }
      return acc;
    }, 0);
    const subtotalAfterItemDiscounts = orderSubtotal - itemDiscountsTotal;
    let checkDiscountAmount = 0;
    if (activeOrder?.checkDiscount) {
      checkDiscountAmount =
        subtotalAfterItemDiscounts * activeOrder.checkDiscount.value;
    }
    const orderDiscountAmount = itemDiscountsTotal + checkDiscountAmount;

    // Helper function to calculate tax for split items (same logic as useOrderStore)
    const calculateSplitAmount = (items: typeof masterItems): number => {
      let subtotal = 0;
      let tax = 0;

      for (const item of items) {
        const itemSubtotal = item.price * item.quantity;
        subtotal += itemSubtotal;

        // Skip tax-exempt items
        if (item.is_tax_exempt) continue;

        // Get the tax rate for this item's category (default to "standard" if not set)
        const taxCategory = item.tax_category || "standard";
        const taxRatePercent = taxRatesMap[taxCategory] ?? 0;
        const taxRateDecimal = taxRatePercent / 100;

        // Apply proportional discount to this item
        const itemDiscountProportion =
          orderSubtotal > 0 ? itemSubtotal / orderSubtotal : 0;
        const itemDiscountAmt = orderDiscountAmount * itemDiscountProportion;
        const itemTaxableAmount = Math.max(0, itemSubtotal - itemDiscountAmt);

        // Calculate tax for this item
        tax += itemTaxableAmount * taxRateDecimal;
      }

      // Round to 2 decimal places
      return Math.round((subtotal + tax) * 100) / 100;
    };

    // 1. Recalculate amounts if needed (Split by Item logic - now includes tax)
    const updatedSplits = splits.map((split) => {
      // If we have items but 0 amount, assume we need to calculate price from items (with tax)
      if (split.items.length > 0 && split.amount === 0) {
        const calculatedAmount = calculateSplitAmount(split.items);
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

  handlePaymentCompletion: (
    method: string,
    tipAmount?: number,
    transactionDetails?: Record<string, any>
  ) => {
    const { activeSplitId, splits } = get();
    const { activeOrderId, addPaymentToOrder, markOrderAsPaid } =
      useOrderStore.getState();

    if (!activeOrderId) return;

    if (activeSplitId) {
      // SPLIT FLOW
      const currentSplit = splits.find((s) => s.id === activeSplitId);
      if (!currentSplit) return;

      // Include splitLabel for backend
      const detailsWithSplitLabel = {
        ...transactionDetails,
        splitLabel: currentSplit.customerName,
      };

      addPaymentToOrder({
        orderId: activeOrderId,
        amount: currentSplit.amount,
        method: method as any,
        tipAmount,
        transactionDetails: detailsWithSplitLabel,
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
      const {
        activeOrderOutstandingTotal,
        orders,
        sendNewItemsToKitchenForOrder,
      } = useOrderStore.getState();
      const currentOrder = orders.find((o) => o.id === activeOrderId);

      addPaymentToOrder({
        orderId: activeOrderId,
        amount: activeOrderOutstandingTotal,
        method: method as any,
        tipAmount,
        transactionDetails,
      });
      markOrderAsPaid(activeOrderId);

      // If order was in draft status, send it to kitchen
      if (currentOrder?.order_status === "draft") {
        sendNewItemsToKitchenForOrder(activeOrderId);
      }

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
          get().handlePaymentCompletion("Card", details.tipAmount);
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
