import { eventBus, OrderPaidEvent } from "@/lib/eventBus";
import { toastService } from "@/lib/toastService";
import { CartItem, OrderPaymentTransactionDetails, SplitPaymentPath } from "@/lib/types";
import {
  getFailedPayments,
  getPendingPaymentsCount,
  OfflineOperation,
  retryFailedOperation,
} from "@/services/offlineSyncService";
import { OrderService } from "@/services/orderService";
import { trackCashPaymentInDrawer } from "@/services/paymentService";
import { useConflictStore } from "@/stores/useConflictStore";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { DejavooSaleTransactionResponse } from "@/types/dejavoo-spin-api";
import { create } from "zustand";
import {
  calculateItemEffectiveCashPrice,
  getOrderStoreSupabaseClient,
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
  | "pay-for-items"
  | "pre-auth"; // Pre-authorization (open/increase/close tab)

export interface Split {
  id: string;
  customerName: string;
  items: CartItem[];
  amount: number; // Default/card amount
  cashAmount?: number; // Cash amount (for dual-price compliance)
  status: "pending" | "paid";
  // FIXED: Removed splitSourceView from here. It belongs in the global store state, not per-guest.
}

// Snapshot of payment info captured at the moment of success
// This prevents real-time sync from overwriting the displayed amount
export interface CompletedPaymentInfo {
  totalPaid: number; // Total amount paid (sum of all payments on order)
  totalTips: number; // Total tips (sum of all tips on order)
  paymentMethod: string; // "Card" or "Cash"
  transactionId: string; // Order ID (last 6 chars used for display)
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
  "pre-auth": 2, // Pre-auth step
  "split-payment-success": 3,
  review: 3,
  success: 4,
};

const totalSteps = 4;

interface PaymentState {
  paymentMethod: PaymentMethod | null;
  view: PaymentView;
  activeTableId: string | null;
  isDirty: boolean;
  isOpen: boolean;
  splits: Split[];
  activeSplitId: string | null;
  splitSourceView: PaymentView | null; // FIXED: Added this missing property
  completedPaymentInfo: CompletedPaymentInfo | null; // Snapshot of payment info for success view
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
    initialView?: PaymentView,
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
  // referenceId: result.helpers?.getReferenceId(),
  // transactionNumber: result.helpers?.getTransactionNumber(),
  // invoiceNumber: result.helpers?.getInvoiceNumber(),
  // batchNumber: result.helpers?.getBatchNumber(),
  // traceNumber: result.helpers?.getTraceNumber(),
  // totalAmount: result.helpers?.getTotalAmount(),
  // baseAmount: result.helpers?.getBaseAmount(),
  // tipAmount: result.helpers?.getTipAmount(),
  // cardType: result.helpers?.getCardType(),
  // entryMode: result.helpers?.getEntryMode(),
  // resultCode: result.helpers?.getResultCode(),
  // statusCode: result.helpers?.getStatusCode(),
  // message: result.helpers?.getMessage(),
  // rrn: result.helpers?.getRRN(),
  startSplitPaymentFlow: (source: PaymentView) => void;
  handlePaymentCompletion: ({
    method, 
    tipAmount, 
    transactionDetails, 
    dejavooTransaction,
    amountOverride,
} : { 
  method: string, 
  tipAmount?: number, 
  transactionDetails?: OrderPaymentTransactionDetails, 
  dejavooTransaction?: DejavooSaleTransactionResponse,
  amountOverride?: number 
}) => Promise<void>;
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
  setPaymentClean: () => void; // New action to set isDirty to false
  markPaymentAsDirty: () => void; // New action to explicitly mark as dirty
  splitEvenly: (
    numberOfPeople: number,
    amountPerPerson: number,
    cashAmountPerPerson?: number,
  ) => void; // New action for evenly splitting with dual pricing
  resetSplits: () => void; // Action to clear splits when going back
  handleSuccessClose: () => void; // Action to run Done logic when success view is closed
  openPayForItems: () => void; // Action to open the pay-for-items split review view
  /** @deprecated No-op — Modal is always full height. Kept for call-site compat. */
  expandSheetToFull: () => void;
  /** @deprecated No-op — Modal is always full height. Kept for call-site compat. */
  collapseSheetToDefault: () => void;

  // Offline payment tracking
  pendingPaymentsCount: number;
  failedPayments: OfflineOperation[];
  refreshOfflinePaymentStatus: () => void;
  retryFailedPayment: (operationId: string) => Promise<void>;
  isPaymentQueued: boolean; // True if current payment was queued for offline sync

  // Pre-auth state
  preAuthMode: 'open' | 'capture' | 'increment' | null;
  preAuthPaymentId: string | null;
  setPreAuthMode: (mode: 'open' | 'capture' | 'increment' | null) => void;
  setPreAuthPaymentId: (id: string | null) => void;

  // Transaction processing state (prevents sheet dismissal during active transactions)
  isTransactionProcessing: boolean;
  setTransactionProcessing: (val: boolean) => void;

  // Phase 6: Payment locking
  lockedOrderId: string | null; // Currently locked order ID
  lockExpiresAt: string | null; // ISO timestamp when lock expires
  isLocking: boolean; // True while acquiring/releasing lock
  lockOrderForPayment: (
    orderId: string,
    expectedVersion: number,
  ) => Promise<boolean>;
  unlockOrderForPayment: (orderId: string) => Promise<void>;
  checkAndRefreshLock: () => Promise<boolean>; // Refresh lock if about to expire
}

export const usePaymentStore = create<PaymentState>((set, get) => ({
  paymentMethod: null,
  view: "review",
  activeTableId: null,
  isDirty: false,
  isOpen: false,
  splits: [],
  activeSplitId: null,
  splitSourceView: null, // Initialized here
  completedPaymentInfo: null, // Initialized here
  progress: { currentStep: 1, totalSteps: totalSteps },
  // Offline payment state
  pendingPaymentsCount: 0,
  failedPayments: [],
  isPaymentQueued: false,
  // Pre-auth state
  preAuthMode: null,
  preAuthPaymentId: null,
  setPreAuthMode: (mode) => set({ preAuthMode: mode }),
  setPreAuthPaymentId: (id) => set({ preAuthPaymentId: id }),
  // Transaction processing state
  isTransactionProcessing: false,
  setTransactionProcessing: (val) => set({ isTransactionProcessing: val }),

  // Phase 6: Payment locking state
  lockedOrderId: null,
  lockExpiresAt: null,
  isLocking: false,

  open: (method, tableId, initialView) => {
    // Block payments for closed orders
    const orderState = useOrderStore.getState();
    const activeOrder = orderState.activeOrderId
      ? orderState.ordersById[orderState.activeOrderId]
      : null;
    if (activeOrder?.check_status === "Closed") {
      toastService.show({
        title: "Check Closed",
        message: "This check is closed. Reopen it to process payments.",
        type: "warning",
      });
      return;
    }

    // OPTIMIZED: Update state BEFORE animation for instant UI response
    // This ensures the payment view is ready before the sheet animates open
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
    set({ isOpen: false });
  },

  setView: (view: PaymentView) => {
    set((state) => ({
      view,
      progress: {
        currentStep: paymentViewToStepMap[view] || state.progress.currentStep,
        totalSteps: totalSteps,
      },
    }));
  },

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
      completedPaymentInfo: null, // Clear payment info on reset
      progress: { currentStep: 1, totalSteps: totalSteps },
      isPaymentQueued: false,
      isTransactionProcessing: false,
    });
  },

  // Called when success view is dismissed by dragging down
  handleSuccessClose: () => {
    const { activeOrderId, ordersById, startNewOrder, setActiveOrder } =
      useOrderStore.getState();

    // OPTIMIZED: Use O(1) lookup instead of O(n) orders.find()
    const activeOrder = activeOrderId ? ordersById[activeOrderId] : undefined;

    // Use order's service_location_id instead of cleared activeTableId
    // This prevents race condition where close() clears activeTableId before sheet animation completes
    const tableId = activeOrder?.service_location_id;

    // For dine-in orders on a table, just close (table keeps the paid order)
    if (activeOrder?.order_type === "dine_in" && tableId) {
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
            updatedSplits.filter((sp) => sp.items.length > 0).length === 0,
        );
      }

      // If active split was removed, switch to first available
      const currentActiveSplitId = state.activeSplitId;
      const activeStillExists = updatedSplits.some(
        (s) => s.id === currentActiveSplitId,
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
        s.id === splitId ? { ...s, amount } : s,
      ),
      isDirty: true,
    }));
  },

  updateSplitCustomerName: (splitId, newName) => {
    set((state) => ({
      splits: state.splits.map((s) =>
        s.id === splitId ? { ...s, customerName: newName } : s,
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

  // No-ops — Modal is always full height. Kept for call-site compatibility.
  expandSheetToFull: () => {},
  collapseSheetToDefault: () => {},

  // --- PAYMENT LOOP LOGIC ---

  startSplitPaymentFlow: (source: PaymentView) => {
    const { splits } = get();

    // Get order and tax rates for tax calculation
    const { activeOrderId, ordersById } = useOrderStore.getState();
    // OPTIMIZED: Use O(1) lookup instead of O(n) orders.find()
    const activeOrder = activeOrderId ? ordersById[activeOrderId] : undefined;
    const taxRatesMap =
      require("@/stores/useStoreSettingsStore").useStoreSettingsStore.getState()
        .taxRatesMap;

    // Calculate order subtotal and discount for proportional tax calculation
    // Filter out voided items - they should not be included in totals
    const masterItems = (activeOrder?.items || []).filter(
      (item) => !item.is_voided,
    );

    // Card pricing subtotal
    const orderSubtotal = masterItems.reduce(
      (acc, item) => acc + item.price * item.quantity,
      0,
    );

    // Cash pricing subtotal - uses calculateItemEffectiveCashPrice to include modifiers and add-ons
    const orderCashSubtotal = masterItems.reduce(
      (acc, item) =>
        acc + calculateItemEffectiveCashPrice(item) * item.quantity,
      0,
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
    { method, tipAmount, transactionDetails, amountOverride, dejavooTransaction }: { method: string, tipAmount?: number, transactionDetails?: OrderPaymentTransactionDetails, amountOverride?: number, dejavooTransaction?: DejavooSaleTransactionResponse }
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

      // For split-by-item and pay-for-items payments, build item allocations with quantities
      // This allows the backend to track which specific items and quantities were paid
      let itemAllocations:
        | { itemId: string; quantity: number; amount?: number }[]
        | undefined;
      const isPerItemPayment =
        splitSourceView === "split-by-item" ||
        splitSourceView === "pay-for-items";
      if (isPerItemPayment && currentSplit.items.length > 0) {
        itemAllocations = currentSplit.items
          .map((item) => {
            // Calculate per-item amount: unit price * quantity
            // Use cash price when paying with cash, otherwise card price
            const unitPrice = isCashPayment
              ? (item.cashPrice ?? item.price ?? item.unitPrice ?? 0)
              : (item.price ?? item.unitPrice ?? 0);
            const amount = Math.round(unitPrice * item.quantity * 100) / 100;
            return {
              // Use local item.id as fallback for offline items without db_order_item_id.
              // The offline sync handler resolves local IDs to backend UUIDs via resolveItemId().
              itemId: item.db_order_item_id || item.id,
              quantity: item.quantity, // Use the quantity from the split (may be partial)
              amount: amount,
            };
          });

        // Only use itemAllocations if we actually have valid allocations
        if (itemAllocations.length === 0) {
          itemAllocations = undefined;
        }
      }

      // Use cash amount when paying with cash, otherwise card amount
      // For split-evenly: cashAmount is set when splits were created
      // For split-by-item: amount is calculated from items at startSplitPaymentFlow time
      const paymentAmount =
        amountOverride !== undefined
          ? amountOverride
          : isCashPayment && currentSplit.cashAmount !== undefined
            ? currentSplit.cashAmount
            : currentSplit.amount;

      // Include splitLabel and cash pricing flag for backend
      const detailsWithSplitLabel = {
        ...transactionDetails,
        splitLabel: currentSplit.customerName,
        isCashPriced: isCashPayment,
      };

      // Before payment: send items to kitchen if order is still in draft/pending
      // Must happen BEFORE addPaymentToOrder so items are still kitchen_status "new"
      // and sendNewItemsToKitchenForOrder actually executes (updates DB via update_order_status RPC)
      const prePaymentOrder = useOrderStore.getState().ordersById[activeOrderId];
      if (
        prePaymentOrder &&
        (prePaymentOrder.order_status === "draft" || prePaymentOrder.order_status === "pending")
      ) {
        useOrderStore.getState().sendNewItemsToKitchenForOrder(activeOrderId);
      }

      // Await payment and check for success
      // Only pass splitCount/splitPortionIndex for EVEN split payments
      // For per-item payments (split-by-item, pay-for-items), we pass itemAllocations instead
      const paymentSuccess = await addPaymentToOrder({
        orderId: activeOrderId,
        amount: paymentAmount,
        method: method as any, // method comes from handlePaymentCompletion ("Cash" or "Card")
        tipAmount,
        transactionDetails: detailsWithSplitLabel,
        dejavooTransaction,
        itemAllocations, // Pass item allocations with quantities for per-item payment tracking
        forceCardPricing: splitSourceView === "split-custom-amount", // Custom amounts always use card pricing
        // Only pass split count/index for even splits - NOT for per-item or custom-amount payments
        // Per-item payments use itemAllocations to track what was paid
        // Custom-amount payments use p_amount through the FULL/PARTIAL SQL path
        ...(isPerItemPayment || splitSourceView === "split-custom-amount"
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

      // Lock split payment path on first split payment
      if (splitSourceView) {
        const currentOrder = useOrderStore.getState().ordersById[activeOrderId];
        if (currentOrder && !currentOrder.split_payment_path) {
          useOrderStore.setState((state) => {
            const o = state.ordersById[activeOrderId];
            if (o) o.split_payment_path = splitSourceView as SplitPaymentPath;
          });

          // Persist to backend for multi-station sync
          const dbOrderId = currentOrder.db_order_id;
          if (dbOrderId) {
            const supabase = getOrderStoreSupabaseClient();
            if (supabase) {
              supabase
                .from("orders")
                .update({ split_payment_path: splitSourceView })
                .eq("id", dbOrderId)
                .then(({ error }) => {
                  if (error) console.warn("[PaymentStore] Failed to persist split_payment_path:", error.message);
                });
            }
          }
        }
      }

      // Track cash payment in drawer (fire-and-forget)
      if (isCashPayment) {
        try {
          const staffProfileId = useEmployeeStore.getState().loggedInEmployee?.profileId || "";
          const order = useOrderStore.getState().getOrder(activeOrderId);
          const dbOrderId = order?.db_order_id ?? activeOrderId;
          trackCashPaymentInDrawer(
            { amount_charged: paymentAmount, payment_id: "", change_given: 0 } as any,
            dbOrderId,
            staffProfileId,
          );
        } catch (e) {
          console.warn("[PaymentStore] Failed to track cash in drawer:", e);
        }
      }

      const updatedSplits = splits.map((s) =>
        s.id === activeSplitId ? { ...s, status: "paid" as const } : s,
      );

      // Find NEXT pending
      const nextPending = updatedSplits.find((s) => s.status === "pending");

      set({ splits: updatedSplits });

      if (nextPending) {
        set({ view: "split-payment-success" });
      } else {
        // All splits paid — kitchen send already happened before first split payment

        // Capture final order state
        const finalOrder = useOrderStore.getState().ordersById[activeOrderId];
        // Calculate effective total paid (subtract refunded amounts)
        const paymentsTotal = (finalOrder?.payments || []).reduce(
          (sum, p) => sum + (p.amount || 0) - (p.refundedAmount || 0),
          0,
        );
        const tipsTotal = (finalOrder?.payments || []).reduce(
          (sum, p) => sum + ((p as any)?.tipAmount || p?.tip_amount || 0),
          0,
        );

        // ================================================================
        // Emit order:paid event ONLY if order is actually fully paid
        // Custom amount splits may not cover the full bill
        // ================================================================
        const isOrderFullyPaid =
          finalOrder?.paid_status === "Paid" ||
          (finalOrder?.amount_due !== undefined && finalOrder.amount_due <= 0.01);

        if (isOrderFullyPaid) {
          const eventPayload: OrderPaidEvent = {
            orderId: activeOrderId,
            orderType: finalOrder?.order_type || "unknown",
            totalAmount: paymentsTotal,
            cashAmount: (finalOrder?.payments || [])
              .filter((p) => String(p.method).toLowerCase() === "cash")
              .reduce((sum, p) => sum + (p.amount || 0), 0),
            paymentMethod: method,
            sessionId: finalOrder?.session_id ?? undefined,
            tableId: finalOrder?.service_location_id ?? undefined,
          };

          eventBus.emit("order:paid", eventPayload);
        }

        // All configured splits are done — show success
        // Use paymentAmount/tipAmount (this split only), not paymentsTotal/tipsTotal (all splits)
        set({
          completedPaymentInfo: {
            totalPaid: paymentAmount,
            totalTips: tipAmount || 0,
            paymentMethod: method,
            transactionId: activeOrderId,
          },
          view: "success",
          activeSplitId: null,
        });
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
      // Or use explicit amount override if provided (prevents race conditions)
      const paymentAmount =
        amountOverride !== undefined
          ? amountOverride
          : isCashPayment
            ? activeOrderOutstandingCash
            : activeOrderOutstandingTotal;
      // Include cash pricing flag in transaction details
      const detailsWithCashFlag = {
        ...transactionDetails,
        isCashPriced: isCashPayment,
      };

      // Must happen BEFORE addPaymentToOrder so items are still kitchen_status "new"
      // and sendNewItemsToKitchenForOrder actually finds items to send to KDS
      if (
        currentOrder &&
        (currentOrder.order_status === "draft" || currentOrder.order_status === "pending")
      ) {
        sendNewItemsToKitchenForOrder(activeOrderId);
      }

      // Now add the payment — this synchronously marks items kitchen_status "sent"
      const paymentSuccess = await addPaymentToOrder({
        orderId: activeOrderId,
        amount: paymentAmount,
        method: method as any,
        tipAmount,
        transactionDetails: detailsWithCashFlag,
        dejavooTransaction,
      });

      // If payment failed, close the payment sheet (error toast already shown by syncPaymentToBackend)
      if (!paymentSuccess) {
        close();
        return;
      }

      // Track cash payment in drawer (fire-and-forget)
      if (isCashPayment) {
        try {
          const staffProfileId = useEmployeeStore.getState().loggedInEmployee?.profileId || "";
          const order = useOrderStore.getState().getOrder(activeOrderId);
          const dbOrderId = order?.db_order_id ?? activeOrderId;
          trackCashPaymentInDrawer(
            { amount_charged: paymentAmount, payment_id: "", change_given: 0 } as any,
            dbOrderId,
            staffProfileId,
          );
        } catch (e) {
          console.warn("[PaymentStore] Failed to track cash in drawer:", e);
        }
      }

      // Refresh order state after payment
      const updatedOrder = useOrderStore.getState().ordersById[activeOrderId];

      // Capture payment info for success view — use this payment's exact
      // amount/tip directly. Do NOT sum all payments: by the time
      // syncPaymentToBackend resolves, realtime broadcasts may have merged
      // extra entries into the array, inflating the displayed total.
      const finalOrder = useOrderStore.getState().ordersById[activeOrderId];

      // ================================================================
      // NEW (Phase 4.2): Emit order:paid event
      // ================================================================
      // Subscribers handle: archiving takeout orders, updating table status,
      // analytics, inventory deduction, etc.
      // Kitchen send is fire-and-forget inline (parallelized with payment RPC).
      const orderPaymentsTotal = (finalOrder?.payments || []).reduce(
        (sum, p) => sum + (p.amount || 0) - (p.refundedAmount || 0),
        0,
      );
      const eventPayload: OrderPaidEvent = {
        orderId: activeOrderId,
        orderType: finalOrder?.order_type || "unknown",
        totalAmount: orderPaymentsTotal,
        cashAmount: (finalOrder?.payments || [])
          .filter((p) => String(p.method).toLowerCase() === "cash")
          .reduce((sum, p) => sum + (p.amount || 0), 0),
        paymentMethod: method,
        sessionId: finalOrder?.session_id ?? undefined,
        tableId: finalOrder?.service_location_id ?? undefined,
      };

      eventBus.emit("order:paid", eventPayload);

      set({
        completedPaymentInfo: {
          totalPaid: paymentAmount,   // exactly what was charged this payment
          totalTips: tipAmount || 0,  // exactly this payment's tip
          paymentMethod: method,
          transactionId: activeOrderId,
        },
        view: "success",
      });
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
          get().handlePaymentCompletion({
            method: "Card",
            tipAmount: details.tipAmount,
          });
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

  // ============================================================================
  // Phase 6: Payment Locking Methods
  // ============================================================================

  lockOrderForPayment: async (orderId: string, expectedVersion: number) => {
    const { lockedOrderId, isLocking } = get();

    // Already locking or already have this order locked
    if (isLocking) return false;
    if (lockedOrderId === orderId) return true;

    set({ isLocking: true });

    try {
      const supabase = getOrderStoreSupabaseClient();
      const stationId = useOrderStore.getState().currentStationId;

      if (!supabase) {
        console.warn("[PaymentLocking] No Supabase client available");
        set({ isLocking: false });
        return false;
      }

      if (!stationId) {
        console.warn("[PaymentLocking] No station ID available");
        set({ isLocking: false });
        return false;
      }

      const { data, error } = await OrderService.lockOrderForPayment(
        supabase,
        orderId,
        expectedVersion,
        stationId,
        60, // 60 second lock duration
      );

      if (error || !data?.success) {
        const errorCode = data?.error || "UNKNOWN_ERROR";

        // Handle specific error types
        if (errorCode === "VERSION_MISMATCH") {
          toastService.show({
            title: "Version Mismatch",
            type: "error",
            message: "Order was modified. Please refresh and try again.",
          });
        } else if (errorCode === "ORDER_LOCKED_FOR_PAYMENT") {
          toastService.show({
            title: "Order Locked",
            type: "error",
            message: `Order is being paid by another station`,
          });
        } else if (errorCode === "ORDER_LOCKED_BY_TRANSACTION") {
          toastService.show({
            title: "Order Busy",
            type: "error",
            message: "Order is being modified. Please wait.",
          });
        }

        set({ isLocking: false });
        return false;
      }

      // Lock acquired successfully
      set({
        lockedOrderId: orderId,
        lockExpiresAt: data.lock_expires_at,
        isLocking: false,
      });

      // Update conflict store with lock info
      useConflictStore.getState().setPaymentLock({
        orderId,
        stationId,
        lockedAt: new Date().toISOString(),
        expiresAt: data.lock_expires_at ?? new Date().toISOString(),
      });

      console.log("[PaymentLocking] Lock acquired:", orderId);
      return true;
    } catch (error) {
      console.error("[PaymentLocking] Error acquiring lock:", error);
      set({ isLocking: false });
      return false;
    }
  },

  unlockOrderForPayment: async (orderId: string) => {
    const { lockedOrderId } = get();

    // Only unlock if we have this order locked
    if (lockedOrderId !== orderId) {
      return;
    }

    try {
      const supabase = getOrderStoreSupabaseClient();
      const stationId = useOrderStore.getState().currentStationId;

      if (!supabase) {
        console.warn("[PaymentLocking] No Supabase client for unlock");
        return;
      }

      if (!stationId) {
        console.warn("[PaymentLocking] No station ID for unlock");
        return;
      }

      await OrderService.unlockOrderForPayment(supabase, orderId, stationId);

      // Clear local lock state
      set({
        lockedOrderId: null,
        lockExpiresAt: null,
      });

      // Clear from conflict store
      useConflictStore.getState().clearPaymentLock(orderId);

      console.log("[PaymentLocking] Lock released:", orderId);
    } catch (error) {
      console.error("[PaymentLocking] Error releasing lock:", error);
      // Clear local state anyway - lock will expire
      set({
        lockedOrderId: null,
        lockExpiresAt: null,
      });
    }
  },

  checkAndRefreshLock: async () => {
    const { lockedOrderId, lockExpiresAt } = get();

    if (!lockedOrderId || !lockExpiresAt) {
      return true; // No lock to refresh
    }

    // Check if lock is about to expire (within 15 seconds)
    const expiresAt = new Date(lockExpiresAt).getTime();
    const now = Date.now();
    const timeRemaining = expiresAt - now;

    if (timeRemaining > 15000) {
      return true; // Still have plenty of time
    }

    if (timeRemaining <= 0) {
      // Lock has expired
      set({
        lockedOrderId: null,
        lockExpiresAt: null,
      });
      return false;
    }

    // Try to refresh the lock by acquiring a new one
    const order = useOrderStore.getState().ordersById[lockedOrderId];
    if (!order) {
      return false;
    }

    const version = (order as any).sync_version ?? 0;
    return await get().lockOrderForPayment(lockedOrderId, version);
  },
}));
