import { toastService } from "@/lib/toastService";
import { CartItem } from "@/lib/types";
import {
  getFailedPayments,
  getPendingPaymentsCount,
  OfflineOperation,
  retryFailedOperation,
} from "@/services/offlineSyncService";
import { BottomSheetMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import React from "react"; // FIXED: Added React import
import { create } from "zustand";
import {
  calculateItemEffectiveCashPrice,
  useOrderStore,
} from "./useOrderStore";

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
  | "split-payment-success"
  | "pay-for-items"; // NEW: Two-panel split review view

export interface Split {
  id: string;
  customerName: string;
  items: CartItem[];
  amount: number; // Default/card amount
  cashAmount?: number; // Cash amount (for dual-price compliance)
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
  "pay-for-items": 2, // NEW: Split review step
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
  ) => Promise<void>;
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
  splitEvenly: (
    numberOfPeople: number,
    amountPerPerson: number,
    cashAmountPerPerson?: number
  ) => void; // New action for evenly splitting with dual pricing
  resetSplits: () => void; // Action to clear splits when going back
  handleSuccessClose: () => void; // Action to run Done logic when success view is closed by dragging
  openPayForItems: () => void; // Action to open the pay-for-items split review view

  // Offline payment tracking
  pendingPaymentsCount: number;
  failedPayments: OfflineOperation[];
  refreshOfflinePaymentStatus: () => void;
  retryFailedPayment: (operationId: string) => Promise<void>;
  isPaymentQueued: boolean; // True if current payment was queued for offline sync
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
  // Offline payment state
  pendingPaymentsCount: 0,
  failedPayments: [],
  isPaymentQueued: false,

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
      isPaymentQueued: false,
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

  splitEvenly: (numberOfPeople, amountPerPerson, cashAmountPerPerson) => {
    const newSplits: Split[] = [];
    for (let i = 0; i < numberOfPeople; i++) {
      newSplits.push({
        id: `split_${Date.now()}_${i}`,
        customerName: `Guest ${i + 1}`,
        items: [],
        amount: amountPerPerson, // Card pricing (default)
        cashAmount: cashAmountPerPerson, // Cash pricing for dual-price compliance
        status: "pending",
      });
    }
    set({ splits: newSplits, isDirty: false });
  },

  resetSplits: () => {
    set({ splits: [], activeSplitId: null, isDirty: false });
  },

  // Open the two-panel pay-for-items split review view
  openPayForItems: () => {
    get().paymentBottomSheetRef?.current?.expand();
    set({
      isOpen: true,
      view: "pay-for-items",
      isDirty: false,
      splits: [],
      activeSplitId: null,
      splitSourceView: "pay-for-items",
      progress: {
        currentStep: paymentViewToStepMap["pay-for-items"],
        totalSteps: totalSteps,
      },
    });
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
    // Filter out voided items - they should not be included in totals
    const masterItems = (activeOrder?.items || []).filter(
      (item) => !item.is_voided
    );

    // Card pricing subtotal
    const orderSubtotal = masterItems.reduce(
      (acc, item) => acc + item.price * item.quantity,
      0
    );

    // Cash pricing subtotal - uses calculateItemEffectiveCashPrice to include modifiers and add-ons
    const orderCashSubtotal = masterItems.reduce(
      (acc, item) =>
        acc + calculateItemEffectiveCashPrice(item) * item.quantity,
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

    // Helper function to calculate tax for split items using CARD pricing
    const calculateSplitCardAmount = (items: typeof masterItems): number => {
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

    // Helper function to calculate tax for split items using CASH pricing
    // Uses calculateItemEffectiveCashPrice to include modifiers and add-ons
    const calculateSplitCashAmount = (items: typeof masterItems): number => {
      let subtotal = 0;
      let tax = 0;

      for (const item of items) {
        // Use the full effective cash price including modifiers and add-ons
        const itemCashPrice = calculateItemEffectiveCashPrice(item);
        const itemSubtotal = itemCashPrice * item.quantity;
        subtotal += itemSubtotal;

        // Skip tax-exempt items
        if (item.is_tax_exempt) continue;

        // Get the tax rate for this item's category (default to "standard" if not set)
        const taxCategory = item.tax_category || "standard";
        const taxRatePercent = taxRatesMap[taxCategory] ?? 0;
        const taxRateDecimal = taxRatePercent / 100;

        // Apply proportional discount to this item (based on cash subtotal)
        const itemDiscountProportion =
          orderCashSubtotal > 0 ? itemSubtotal / orderCashSubtotal : 0;
        const itemDiscountAmt = orderDiscountAmount * itemDiscountProportion;
        const itemTaxableAmount = Math.max(0, itemSubtotal - itemDiscountAmt);

        // Calculate tax for this item
        tax += itemTaxableAmount * taxRateDecimal;
      }

      // Round to 2 decimal places
      return Math.round((subtotal + tax) * 100) / 100;
    };

    // 1. Recalculate amounts if needed (Split by Item logic - now includes tax for both card and cash)
    const updatedSplits = splits.map((split) => {
      // If we have items but 0 amount, calculate price from items (with tax) for both card and cash
      if (split.items.length > 0 && split.amount === 0) {
        const cardAmount = calculateSplitCardAmount(split.items);
        const cashAmount = calculateSplitCashAmount(split.items);
        return { ...split, amount: cardAmount, cashAmount: cashAmount };
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

  handlePaymentCompletion: async (
    method: string,
    tipAmount?: number,
    transactionDetails?: Record<string, any>
  ) => {
    const { activeSplitId, splits, splitSourceView, close } = get();
    const { activeOrderId, addPaymentToOrder } = useOrderStore.getState();

    if (!activeOrderId) return;

    // Determine if this is a cash payment (for using cash pricing)
    const isCashPayment = method === "Cash";

    if (activeSplitId) {
      // SPLIT FLOW
      const currentSplit = splits.find((s) => s.id === activeSplitId);
      if (!currentSplit) return;

      // For split-by-item and pay-for-items payments, extract db_order_item_ids from the split items
      // This allows the backend to track which specific items were paid
      let itemIds: string[] | undefined;
      const isPerItemPayment =
        splitSourceView === "split-by-item" ||
        splitSourceView === "pay-for-items";
      if (isPerItemPayment && currentSplit.items.length > 0) {
        itemIds = currentSplit.items
          .map((item) => item.db_order_item_id)
          .filter((id): id is string => !!id);

        // Only use itemIds if we actually have valid IDs
        if (itemIds.length === 0) {
          itemIds = undefined;
        }
      }

      // Use cash amount when paying with cash, otherwise card amount
      // For split-evenly: cashAmount is set when splits were created
      // For split-by-item: amount is calculated from items at startSplitPaymentFlow time
      const paymentAmount =
        isCashPayment && currentSplit.cashAmount !== undefined
          ? currentSplit.cashAmount
          : currentSplit.amount;

      // Include splitLabel and cash pricing flag for backend
      const detailsWithSplitLabel = {
        ...transactionDetails,
        splitLabel: currentSplit.customerName,
        isCashPriced: isCashPayment,
      };

      // Await payment and check for success
      // Only pass splitCount/splitPortionIndex for EVEN split payments
      // For per-item payments (split-by-item, pay-for-items), we pass itemIds instead
      const paymentSuccess = await addPaymentToOrder({
        orderId: activeOrderId,
        amount: paymentAmount,
        method: method as any, // method comes from handlePaymentCompletion ("Cash" or "Card")
        tipAmount,
        transactionDetails: detailsWithSplitLabel,
        itemIds, // Pass item IDs for per-item payment tracking
        // Only pass split count/index for even splits - NOT for per-item payments
        // Per-item payments use itemIds to track what was paid
        ...(isPerItemPayment
          ? {}
          : {
              splitCount: splits.length,
              splitPortionIndex:
                splits.findIndex((s) => s.id === activeSplitId) + 1,
            }),
      });

      // If payment failed, close the payment sheet (error toast already shown by syncPaymentToBackend)
      if (!paymentSuccess) {
        close();
        return;
      }

      const updatedSplits = splits.map((s) =>
        s.id === activeSplitId ? { ...s, status: "paid" as const } : s
      );

      // Find NEXT pending
      const nextPending = updatedSplits.find((s) => s.status === "pending");

      set({ splits: updatedSplits });

      if (nextPending) {
        set({ view: "split-payment-success" });
      } else {
        // All splits paid - check if we need to send items to kitchen
        const { ordersById, sendNewItemsToKitchenForOrder } =
          useOrderStore.getState();
        const order = ordersById[activeOrderId];

        // If order was in draft status, send items to kitchen (preparing state)
        if (order?.order_status === "draft") {
          sendNewItemsToKitchenForOrder(activeOrderId);
        }

        // Order is fully paid - addPaymentToOrder already set the paid status
        set({ view: "success", activeSplitId: null });
      }
    } else {
      // STANDARD FLOW (full payment)
      const {
        activeOrderOutstandingTotal,
        activeOrderOutstandingCash,
        ordersById,
        sendNewItemsToKitchenForOrder,
      } = useOrderStore.getState();
      const currentOrder = ordersById[activeOrderId];

      // Use cash outstanding for cash payments, card outstanding for card payments
      const paymentAmount = isCashPayment
        ? activeOrderOutstandingCash
        : activeOrderOutstandingTotal;

      // Include cash pricing flag in transaction details
      const detailsWithCashFlag = {
        ...transactionDetails,
        isCashPriced: isCashPayment,
      };

      // Await payment and check for success
      const paymentSuccess = await addPaymentToOrder({
        orderId: activeOrderId,
        amount: paymentAmount,
        method: method as any,
        tipAmount,
        transactionDetails: detailsWithCashFlag,
      });

      // If payment failed, close the payment sheet (error toast already shown by syncPaymentToBackend)
      if (!paymentSuccess) {
        close();
        return;
      }

      // Refresh order state after payment
      const updatedOrder = useOrderStore.getState().ordersById[activeOrderId];

      // Payment succeeded - addPaymentToOrder already set the paid status
      // If order was in draft status, send it to kitchen
      if (currentOrder?.order_status === "draft") {
        sendNewItemsToKitchenForOrder(activeOrderId);
      }

      // If this is a takeaway/delivery order that's already ready and now paid, archive it
      // This triggers inventory deduction via archiveOrder
      if (
        updatedOrder &&
        (updatedOrder.order_type === "Takeaway" ||
          updatedOrder.order_type === "takeout" ||
          updatedOrder.order_type === "Delivery") &&
        updatedOrder.order_status === "ready" &&
        updatedOrder.paid_status === "Paid"
      ) {
        // Use a slight delay to ensure payment state is fully updated
        setTimeout(() => {
          useOrderStore.getState().archiveOrder(activeOrderId);
        }, 300);
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

  // --- OFFLINE PAYMENT ACTIONS ---

  refreshOfflinePaymentStatus: () => {
    set({
      pendingPaymentsCount: getPendingPaymentsCount(),
      failedPayments: getFailedPayments(),
    });
  },

  retryFailedPayment: async (operationId: string) => {
    try {
      await retryFailedOperation(operationId);
      get().refreshOfflinePaymentStatus();
      toastService.show({
        title: "Retrying Payment",
        message: "The payment will be processed when connection is restored.",
        type: "success",
      });
    } catch (error: any) {
      toastService.show({
        title: "Retry Failed",
        message: error.message || "Could not retry payment.",
        type: "error",
      });
    }
  },
}));
