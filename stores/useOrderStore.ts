import { toastService } from "@/lib/toastService";
import { CartItem, Discount, OrderProfile, PaymentType } from "@/lib/types";
import type {
  AddOrderItemParams,
  CreateOrderParams,
  OrderType as DbOrderType,
  ProcessPaymentParams,
} from "@/types/db-order-management-types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { create } from "zustand";
import { useCoursingStore } from "./useCoursingStore";
import { useEmployeeStore } from "./useEmployeeStore";
import { useInventoryStore } from "./useInventoryStore";
import { usePreviousOrdersStore } from "./usePreviousOrdersStore";

import { OrderService } from "@/services/orderService";
import { useStoreSettingsStore } from "./useStoreSettingsStore";

// Module-level Supabase client for backend sync
// Components register the client via setOrderStoreSupabaseClient
let _supabaseClient: SupabaseClient | null = null;

export const setOrderStoreSupabaseClient = (client: SupabaseClient | null) => {
  _supabaseClient = client;
};

export const getOrderStoreSupabaseClient = () => _supabaseClient;

// Helper to sync item to backend
const addItemToBackend = async (
  order: OrderProfile,
  item: CartItem,
  setOrderDbId: (
    id: string,
    dbId: string,
    number: string,
    display: string
  ) => void,
  removeItem: (itemId: string) => void,
  onSyncComplete?: (orderId: string) => void // Callback after successful sync
): Promise<boolean> => {
  const supabase = _supabaseClient;
  if (!supabase) {
    console.log("Backend sync skipped: No Supabase client registered");
    return true;
  }

  const selectedStore = useStoreSettingsStore.getState().selectedStore;
  if (!selectedStore) {
    console.log("Backend sync skipped: No store selected");
    return true;
  }

  // If item is draft (missing required fields), skip sync
  if (item.isDraft) {
    console.log("Backend sync skipped: Item is draft");
    return true;
  }

  try {
    let dbOrderId = order.db_order_id;

    // Create order if it doesn't exist
    if (!dbOrderId) {
      const createOrderParams: CreateOrderParams = {
        p_merchant_id: selectedStore.merchant_id,
        p_location_id: selectedStore.id,
        // Map local order types to backend enum values
        p_order_type: order.order_type
          ? order.order_type === "Takeaway"
            ? "takeout"
            : order.order_type === "Dine In"
              ? "dine_in"
              : (order.order_type.toLowerCase() as DbOrderType)
          : ("dine_in" as DbOrderType),
        p_table_number: order.service_location_id || undefined, // Simple mapping for now
        p_created_by_staff_id: undefined, // Could get from employee store if needed
      };

      console.log(
        "Creating order in backend with params:",
        JSON.stringify(createOrderParams, null, 2)
      );

      const { data: createResult, error: createError } =
        await OrderService.createOrder(supabase, createOrderParams);

      console.log("createOrder Result:", createResult);
      console.log("createOrder Error:", createError);

      if (createError) {
        console.error("Failed to create order in backend:", createError);
        toastService.show({
          title: "Sync Error",
          message:
            "Failed to create order on server: " +
            (createError.message || createError.code),
          type: "error",
        });
        // Rollback: remove the item since order creation failed
        removeItem(item.id);
        return false;
      }

      if (createResult) {
        // Store the backend IDs
        // Handle if createResult is an array (some RPCs return arrays)
        const orderData = (
          Array.isArray(createResult) ? createResult[0] : createResult
        ) as any;

        // The RPC seems to return order_id instead of id based on logs
        const backendId = orderData.order_id || orderData.id;

        if (backendId) {
          dbOrderId = backendId;
          console.log("Order created successfully, ID:", dbOrderId);

          setOrderDbId(
            order.id,
            backendId,
            orderData.order_number,
            orderData.display_number
          );
        } else {
          console.error("createOrder result invalid:", createResult);
        }
      } else {
        console.warn(
          "createOrder returned no data and no error. This is unexpected."
        );
      }
    }

    // Add item to backend
    // Debug logging for specific error tracking
    if (!dbOrderId) {
      console.error("Critical: dbOrderId is missing before adding item!", {
        orderId: order.id,
      });
      // We can't proceed without an order ID
      removeItem(item.id);
      return false;
    }

    const addItemParams: AddOrderItemParams = {
      p_order_id: dbOrderId,
      p_menu_item_id: item.menuItemId || undefined,
      p_quantity: item.quantity,

      // Item details
      p_item_name: item.name,
      p_category_name: item.category_name || "Uncategorized",
      p_unit_price: item.originalPrice, // Providing effective unit price
      p_cash_price: item.originalPrice, // Assuming cash price same as unit price for now if not available
      p_use_cash_price: true, // Defaulting to true as per request

      // Size details
      p_selected_size_id: item.customizations?.size?.id || undefined,
      p_selected_size_name: item.customizations?.size?.name || undefined,
      p_size_price_modifier:
        item.customizations?.size?.priceModifier || undefined,

      p_special_instructions: item.customizations?.notes || undefined,
      p_modifiers: item.customizations?.modifiers?.flatMap((mod) =>
        mod.options.map((opt) => ({
          modifier_group_id: mod.categoryId,
          modifier_item_id: opt.id,
          modifier_group_name: mod.categoryName,
          modifier_name: opt.name,
          price_modifier: opt.price,
          quantity: 1,
        }))
      ),
      p_location_exclusive_item_id: item.locationExclusiveItemId || undefined,

      // Kitchen/Coursing (Placeholder logic - update with real data if available)
      p_prep_station: undefined,
      p_course_number: 1, // Default to course 1
    };

    console.log(
      "Adding item to backend with params:",
      JSON.stringify(addItemParams, null, 2)
    );
    const { error: addError } = await OrderService.addOrderItem(
      supabase,
      addItemParams
    );

    if (addError) {
      console.error("Failed to add item to backend:", addError);
      toastService.show({
        title: "Sync Error",
        message:
          "Failed to sync item to server: " +
          (addError.message || addError.code),
        type: "error",
      });
      // Rollback: remove the item
      removeItem(item.id);
      return false;
    }

    console.log("Item synced to backend successfully");

    // Trigger recalculation now that db_order_id is available
    if (onSyncComplete) {
      onSyncComplete(order.id);
    }

    return true;
  } catch (error) {
    console.error("Backend sync error:", error);
    toastService.show({
      title: "Sync Error",
      message: "Failed to sync to server",
      type: "error",
    });
    // Rollback
    removeItem(item.id);
    return false;
  }
};

// Backend sync helper - processes payment
const syncPaymentToBackend = async (
  order: OrderProfile,
  paymentDetails: {
    amount: number;
    method: PaymentType;
    tipAmount?: number;
    transactionDetails?: Record<string, any>;
  }
): Promise<boolean> => {
  const supabase = _supabaseClient;
  if (!supabase) {
    console.log("Backend sync skipped: No Supabase client registered");
    return true;
  }

  const selectedStore = useStoreSettingsStore.getState().selectedStore;
  if (!selectedStore) {
    console.log("Backend sync skipped: No store selected");
    return true;
  }

  // If order doesn't have a DB ID yet (e.g. strict offline mode until payment), we can't sync payment
  if (!order.db_order_id) {
    console.warn("Backend sync skipped: Order has no db_order_id");
    return true;
  }

  try {
    // Map local PaymentType to backend PaymentMethod
    let backendMethod: any = "external";
    if (paymentDetails.method === "Cash") {
      backendMethod = "cash";
    } else if (paymentDetails.method === "Card") {
      // Check if it was a specific terminal integration
      if (paymentDetails.transactionDetails?.terminalType === "spinapi") {
        backendMethod = "card_spinapi";
      } else if (
        paymentDetails.transactionDetails?.terminalType === "dvpaylite"
      ) {
        backendMethod = "card_dvpaylite";
      } else {
        backendMethod = "card_manual";
      }
    }

    const paymentParams: ProcessPaymentParams = {
      p_order_id: order.db_order_id,
      p_payment_method: backendMethod,
      p_amount: paymentDetails.amount,
      p_tip_amount: paymentDetails.tipAmount || 0,
      // Add amount tendered for cash payments (for change calculation)
      p_amount_tendered: paymentDetails.transactionDetails?.amountTendered,
      // Add split label for split payments
      p_split_label: paymentDetails.transactionDetails?.splitLabel,
      p_terminal_type:
        (paymentDetails.transactionDetails?.terminalType as any) || "manual",
      p_terminal_id: paymentDetails.transactionDetails?.terminalId || "POS-001", // Placeholder
      p_transaction_details: paymentDetails.transactionDetails,
    };

    console.log("Processing payment in backend:", paymentParams);
    const { data, error } = await OrderService.processPayment(
      supabase,
      paymentParams
    );

    if (error) {
      console.error("Failed to process payment in backend:", error);
      toastService.show({
        title: "Sync Error",
        message: "Failed to sync payment to server",
        type: "error",
      });
      return false;
    }

    // Log successful payment with details (payment_id can be used for void)
    console.log("Payment synced to backend successfully:", {
      payment_id: data?.payment_id,
      amount_applied: data?.amount_applied,
      change_given: data?.change_given,
      order_fully_paid: data?.order_fully_paid,
    });
    return true;
  } catch (error) {
    console.error("Backend payment sync error:", error);
    toastService.show({
      title: "Sync Error",
      message: "Failed to sync payment to server",
      type: "error",
    });
    return false;
  }
};

// Tax calculation is now handled in recalculateTotals using dynamic rate from store settings

interface OrderState {
  orders: OrderProfile[];
  activeOrderId: string | null;

  // --- DERIVED STATE (Totals for the ACTIVE order) ---
  // These values will be automatically updated by the store's actions.
  activeOrderSubtotal: number;
  activeOrderTax: number;
  activeOrderTotal: number;
  activeOrderDiscount: number;
  // Outstanding (unpaid) totals for the ACTIVE order
  activeOrderOutstandingSubtotal: number;
  activeOrderOutstandingTax: number;
  activeOrderOutstandingTotal: number;

  // --- PENDING TABLE SELECTION ---
  pendingTableSelection: string | null; // Store pending table selection

  // --- ACTIONS ---
  setActiveOrder: (orderId: string | null) => void;
  startNewOrder: (details?: {
    tableId?: string;
    guestCount?: number;
  }) => OrderProfile;
  addItemToActiveOrder: (newItem: CartItem) => void;
  updateItemInActiveOrder: (updatedItem: CartItem) => void;
  removeItemFromActiveOrder: (itemId: string) => void;
  confirmDraftItem: (itemId: string) => void;
  updateItemStatusInActiveOrder: (
    itemId: string,
    status: "preparing" | "ready" | "served"
  ) => void;
  setOpenedAt: (orderId: string, openedAt: string) => void;
  setClosedAt: (orderId: string, closedAt: string) => void;
  updateActiveOrderDetails: (details: Partial<OrderProfile>) => void;
  applyDiscountToCheck: (orderId: string, discount: Discount) => void;
  removeCheckDiscount: (orderId: string) => void;
  applyDiscountToItem: (orderId: string, itemId: string) => void;
  removeDiscountFromItem: (orderId: string, itemId: string) => void;
  assignOrderToTable: (orderId: string, tableId: string) => void;
  assignActiveOrderToTable: (tableId: string) => void;
  updateOrderStatus: (
    orderId: string,
    status: OrderProfile["order_status"]
  ) => void;
  addPaymentToOrder: (details: {
    orderId: string;
    amount: number;
    method: PaymentType;
    cardBrand?: string;
    last4?: string;
    tipAmount?: number;
    transactionDetails?: Record<string, any>;
  }) => void;
  setOrders: (orders: OrderProfile[]) => void;

  markOrderAsPaid: (orderId: string) => void;
  setPendingTableSelection: (tableId: string | null) => void;
  syncOrderStatus: (orderId: string) => void;

  archiveOrder: (orderId: string) => string | null; // Returns the tableId if it exists
  markAllItemsAsReady: (orderId: string) => void;
  markAllItemsAsServed: (orderId: string) => void;
  consolidateOrdersForTables: (
    tableIds: string[],
    tableNames: string[]
  ) => string;
  fireActiveOrderToKitchen: () => void;
  sendNewItemsToKitchen: () => void;
  sendNewItemsToKitchenForOrder: (orderId: string) => void;
  transferOrderToTable: (orderId: string, newTableId: string) => void;
  generateCartItemId: (
    menuItemId: string,
    customizations: CartItem["customizations"],
    isDraft?: boolean
  ) => string;
  deleteOrder: (orderId: string) => void;
  clearCart: () => void;
  voidOrder: (orderId: string) => void;
}

export const useOrderStore = create<OrderState>((set, get) => {
  // --- PRIVATE HELPER FUNCTION ---
  // This function calculates and sets the totals for the currently active order.

  // Helper function to sync order status based on item statuses
  const syncOrderStatus = (orderId: string) => {
    const { orders } = get();
    const order = orders.find((o) => o.id === orderId);
    if (!order || !order.items.length) return;

    // Only sync order status for orders that are assigned to tables or in kitchen workflow
    // Don't sync for orders that are still being built
    if (order.order_status === "draft" || order.service_location_id === null) {
      return;
    }

    // For dine-in orders, sync based on individual item statuses
    if (order.order_type === "Dine In") {
      const allItemsReady = order.items.every(
        (item) => item.item_status === "ready"
      );
      const anyItemsPreparing = order.items.some(
        (item) => item.item_status === "preparing"
      );

      let newOrderStatus = order.order_status;
      if (allItemsReady) {
        newOrderStatus = "ready";
      } else if (anyItemsPreparing) {
        newOrderStatus = "preparing";
      }

      if (newOrderStatus !== order.order_status) {
        set((state) => ({
          orders: state.orders.map((o) =>
            o.id === orderId ? { ...o, order_status: newOrderStatus } : o
          ),
        }));
      }
    }
    // For takeaway orders, the order status is managed manually (not based on item statuses)
  };
  const normalizePaidQuantitiesFromPayments = (orderId: string | null) => {
    if (!orderId) return;
    const { orders } = get();
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;
    const totalPaid = (order.payments || []).reduce(
      (acc, p) => acc + p.amount,
      0
    );
    // Calculate how many units should be marked paid across items FIFO
    let remaining = totalPaid;
    const updatedItems = order.items.map((item) => {
      const unitPrice = item.price;
      const currentPaid = item.paidQuantity || 0;
      const unpaidQty = item.quantity - currentPaid;
      if (remaining <= 0 || unpaidQty <= 0) return item;
      const canCover = Math.min(
        unpaidQty,
        Math.floor(remaining / unitPrice + 1e-6)
      );
      if (canCover <= 0) return item;
      remaining -= canCover * unitPrice;
      return { ...item, paidQuantity: currentPaid + canCover };
    });

    // Return updated items so callers can set state when safe
    return updatedItems;
  };

  const recalculateTotals = async (orderId: string | null) => {
    const { orders, activeOrderId: currentActiveOrderId } = get();
    const activeOrder = orders.find((o) => o.id === orderId);

    // Safety check: Only update derived state if this orderId is still the active order
    // This prevents stale async calculations from overwriting the current order's totals
    const isStillActiveOrder = orderId === currentActiveOrderId;

    // Only calculate if order exists and has items - empty orders reset to 0 immediately
    if (activeOrder && activeOrder.items && activeOrder.items.length > 0) {
      // Get dynamic tax rate from store settings (convert from percentage to decimal)
      const storeSettings = useStoreSettingsStore.getState();
      const taxRateDecimal = (storeSettings.defaultTaxRate || 8.25) / 100;

      // Subtotal must reflect modifiers (size/add-ons) captured in item.price
      const subtotal = activeOrder.items.reduce(
        (acc, item) => acc + item.price * item.quantity,
        0
      );

      const itemDiscountsTotal = activeOrder.items.reduce((acc, item) => {
        if (item.appliedDiscount) {
          return (
            acc +
            item.originalPrice * item.appliedDiscount.value * item.quantity
          );
        }
        return acc;
      }, 0);

      const subtotalAfterItemDiscounts = subtotal - itemDiscountsTotal;

      let checkDiscountAmount = 0;
      if (activeOrder.checkDiscount) {
        checkDiscountAmount =
          subtotalAfterItemDiscounts * activeOrder.checkDiscount.value;
      }

      const totalDiscountAmount = itemDiscountsTotal + checkDiscountAmount;
      const finalSubtotal = subtotal - totalDiscountAmount;

      // Calculate local tax as fallback
      let localTax = finalSubtotal * taxRateDecimal;
      let localTotal = finalSubtotal + localTax;

      // If order has a db_order_id, call backend to calculate tax
      let backendTaxAmount: number | undefined;
      let backendSubtotal: number | undefined;
      const supabase = _supabaseClient;
      if (supabase && activeOrder.db_order_id) {
        try {
          const { data, error } = await OrderService.calculateOrderTax(
            supabase,
            activeOrder.db_order_id,
            taxRateDecimal
          );

          console.log("Backend tax calculation response:", data);

          if (!error && data && data.success) {
            backendTaxAmount = data.tax_amount;
            backendSubtotal = data.subtotal;
            console.log("Using backend values:", {
              order_id: data.order_id,
              subtotal: data.subtotal,
              tax_rate: data.tax_rate,
              tax_amount: data.tax_amount,
            });
          } else if (error) {
            console.warn("Failed to calculate tax from backend:", error);
          }
        } catch (err) {
          console.warn("Backend tax calculation error:", err);
        }
      }

      // Use backend values if available, otherwise use local calculation
      const usedSubtotal =
        backendSubtotal !== undefined ? backendSubtotal : finalSubtotal;
      const tax = backendTaxAmount !== undefined ? backendTaxAmount : localTax;
      const total = usedSubtotal + tax;

      // Compute outstanding subtotal (unpaid amount) used for badges/logic
      const outstandingSubtotal = activeOrder.items.reduce((acc, item) => {
        const unpaidQty = item.quantity - (item.paidQuantity || 0);
        return acc + unpaidQty * item.price;
      }, 0);

      // This is a fair way to distribute a check-level discount.
      const proportionOfSubtotalOutstanding =
        subtotal > 0 ? outstandingSubtotal / subtotal : 0;
      const outstandingDiscountAmount =
        totalDiscountAmount * proportionOfSubtotalOutstanding;

      // Calculate the final outstanding total, including discounts
      const outstandingSubtotalAfterDiscount =
        outstandingSubtotal - outstandingDiscountAmount;
      const outstandingTax = outstandingSubtotalAfterDiscount * taxRateDecimal;
      const outstandingTotal =
        outstandingSubtotalAfterDiscount + outstandingTax;

      // Ensure no undefined values propagate - use backend subtotal when available
      const safeSubtotal = Number(usedSubtotal) || 0;
      const safeTax = Number(tax) || 0;
      const safeTotal = Number(total) || 0;
      const safeDiscount = Number(totalDiscountAmount) || 0;

      // RE-CHECK if this order is still the active one AFTER async operations
      // This is crucial because the active order might have changed while we were awaiting
      const stillActiveAfterAsync = orderId === get().activeOrderId;

      // Only update active order derived state if this order is still the active one
      if (stillActiveAfterAsync) {
        set({
          activeOrderSubtotal: safeSubtotal,
          activeOrderTax: safeTax,
          activeOrderTotal: safeTotal,
          activeOrderDiscount: safeDiscount,
          activeOrderOutstandingSubtotal: outstandingSubtotal,
          activeOrderOutstandingTax: outstandingTax,
          activeOrderOutstandingTotal: outstandingTotal,
        });
      }

      // Update order with backend-calculated totals if we got them
      if (backendSubtotal !== undefined || backendTaxAmount !== undefined) {
        set((state) => ({
          orders: state.orders.map((o) =>
            o.id === orderId
              ? {
                  ...o,
                  total_tax: safeTax,
                  total_amount: safeTotal,
                  // Store subtotal for reference (if field exists on OrderProfile)
                }
              : o
          ),
        }));
      }

      // Auto-manage paid_status only when there are items and at least one payment
      const hasItems = (activeOrder.items?.length || 0) > 0;
      const hasPayments = (activeOrder.payments?.length || 0) > 0;
      if (hasItems && hasPayments) {
        if (outstandingSubtotal <= 1e-6 && activeOrder.paid_status !== "Paid") {
          set((state) => ({
            orders: state.orders.map((o) =>
              o.id === orderId ? { ...o, paid_status: "Paid" } : o
            ),
          }));
        } else if (
          outstandingSubtotal > 1e-6 &&
          activeOrder.paid_status === "Paid"
        ) {
          // If new items were added after full payment, reflect Pending
          set((state) => ({
            orders: state.orders.map((o) =>
              o.id === orderId ? { ...o, paid_status: "Pending" } : o
            ),
          }));
        }
      }
    } else {
      // Only reset if this order is still the active one
      if (isStillActiveOrder) {
        set({
          activeOrderSubtotal: 0,
          activeOrderTax: 0,
          activeOrderTotal: 0,
          activeOrderDiscount: 0,
          activeOrderOutstandingSubtotal: 0,
          activeOrderOutstandingTax: 0,
          activeOrderOutstandingTotal: 0,
        });
      }
    }
  };

  // --- Helper function to generate a unique composite key for cart items ---
  const generateItemCompositeKey = (
    menuItemId: string,
    customizations: CartItem["customizations"]
  ): string => {
    const keyParts: string[] = [menuItemId];

    // Add size information
    if (customizations.size?.id) {
      keyParts.push(`size:${customizations.size.id}`);
    }

    // Add notes
    if (customizations.notes) {
      keyParts.push(`notes:${customizations.notes.trim()}`);
    }

    // Add add-ons (sorted for consistency)
    if (customizations.addOns && customizations.addOns.length > 0) {
      const addOnIds = customizations.addOns.map((a) => a.id).sort();
      keyParts.push(`addons:${addOnIds.join(",")}`);
    }

    // Add modifiers (sorted for consistency)
    if (customizations.modifiers && customizations.modifiers.length > 0) {
      const modifierKeys = customizations.modifiers
        .map(
          (mod) =>
            `${mod.categoryId}:${mod.options
              .map((opt) => opt.id)
              .sort()
              .join(",")}`
        )
        .sort();
      keyParts.push(`modifiers:${modifierKeys.join("|")}`);
    }

    return keyParts.join("|");
  };

  // --- Helper function to generate a unique CartItem ID ---
  const generateCartItemId = (
    menuItemId: string,
    customizations: CartItem["customizations"],
    isDraft: boolean = false
  ): string => {
    const compositeKey = generateItemCompositeKey(menuItemId, customizations);
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substr(2, 9);

    if (isDraft) {
      return `draft_${compositeKey}_${timestamp}`;
    }

    return `${compositeKey}_${timestamp}_${randomSuffix}`;
  };

  // --- Helper function to check for deep equality of customizations ---
  const areCustomizationsEqual = (
    custA: CartItem["customizations"],
    custB: CartItem["customizations"]
  ): boolean => {
    // 1. Check if sizes are the same
    if (custA.size?.id !== custB.size?.id) {
      return false;
    }
    // 2. Check if notes are the same
    if (custA.notes !== custB.notes) {
      return false;
    }
    // 3. Check if add-ons are the same (must have same add-ons in any order)
    const addOnsA = custA.addOns?.map((a) => a.id).sort() || [];
    const addOnsB = custB.addOns?.map((a) => a.id).sort() || [];
    if (
      addOnsA.length !== addOnsB.length ||
      !addOnsA.every((id, index) => id === addOnsB[index])
    ) {
      return false;
    }
    // 4. Check if modifiers are the same
    const modifiersA =
      custA.modifiers
        ?.map((mod) => ({
          categoryId: mod.categoryId,
          options: mod.options.map((opt) => opt.id).sort(),
        }))
        .sort((a, b) => a.categoryId.localeCompare(b.categoryId)) || [];
    const modifiersB =
      custB.modifiers
        ?.map((mod) => ({
          categoryId: mod.categoryId,
          options: mod.options.map((opt) => opt.id).sort(),
        }))
        .sort((a, b) => a.categoryId.localeCompare(b.categoryId)) || [];

    if (modifiersA.length !== modifiersB.length) {
      return false;
    }

    for (let i = 0; i < modifiersA.length; i++) {
      if (
        modifiersA[i].categoryId !== modifiersB[i].categoryId ||
        modifiersA[i].options.length !== modifiersB[i].options.length ||
        !modifiersA[i].options.every(
          (opt, idx) => opt === modifiersB[i].options[idx]
        )
      ) {
        return false;
      }
    }

    // 5. If all checks pass, they are equal
    return true;
  };

  return {
    // --- INITIAL STATE ---
    orders: [],
    activeOrderId: null,
    activeOrderSubtotal: 0,
    activeOrderTax: 0,
    activeOrderTotal: 0,
    activeOrderDiscount: 0,
    activeOrderOutstandingSubtotal: 0,
    activeOrderOutstandingTax: 0,
    activeOrderOutstandingTotal: 0,
    pendingTableSelection: null,

    // --- PUBLIC ACTIONS ---
    setOrders: (newOrders) => {
      // Sanitize orders to ensure no undefined numbers propagate from backend
      const sanitizedOrders = newOrders.map((o) => ({
        ...o,
        total_amount: o.total_amount ?? 0,
        total_tax: o.total_tax ?? 0,
        total_discount: o.total_discount ?? 0,
        items: o.items || [],
      }));
      set({ orders: sanitizedOrders });
    },
    setActiveOrder: (orderId) => {
      set({ activeOrderId: orderId });
      // Avoid mutating orders here to prevent effects that depend on `orders` from looping
      // Totals are derived and safe to compute
      recalculateTotals(orderId);
    },

    startNewOrder: (details) => {
      const { activeEmployeeId, employees } = useEmployeeStore.getState();
      const activeEmployee = employees.find((e) => e.id === activeEmployeeId);

      const newOrder: OrderProfile = {
        id: `order_${Date.now()}`,
        service_location_id: details?.tableId || null,
        order_status: "draft",
        customer_name: "",
        check_status: "Opened",
        paid_status: "Unpaid",
        order_type: details?.tableId ? "Dine In" : "Takeaway",
        items: [],
        opened_at: null,
        guest_count: details?.guestCount || 1,
        server_name: activeEmployee?.fullName || "Unknown",
      };
      set((state) => ({ orders: [...state.orders, newOrder] }));
      return newOrder;
    },

    addItemToActiveOrder: (newItem) => {
      const { activeOrderId, orders } = get();
      if (!activeOrderId) return;

      const activeOrder = orders.find((o) => o.id === activeOrderId);
      if (!activeOrder) return;

      const coursingState = useCoursingStore.getState();
      const currentCourse =
        coursingState.getForOrder(activeOrderId)?.currentCourse ?? 1;
      const newItemKey = generateItemCompositeKey(
        newItem.menuItemId,
        newItem.customizations
      );

      let updatedCart: CartItem[] = activeOrder.items;

      // 1. If newItem is NOT a draft, remove any existing drafts for this MenuItemId
      if (!newItem.isDraft) {
        updatedCart = updatedCart.filter(
          (item) => !(item.isDraft && item.menuItemId === newItem.menuItemId)
        );
      }

      // 2. Find a potential candidate for merging with the (possibly filtered) cart
      const mergeCandidate = updatedCart.find((cartItem) => {
        // Must be a "new" item, not a draft, and in the same course
        if (
          cartItem.isDraft ||
          (cartItem.kitchen_status && cartItem.kitchen_status !== "new")
        ) {
          return false;
        }
        const existingItemCourse =
          coursingState.getForOrder(activeOrderId)?.itemCourseMap?.[
            cartItem.id
          ] ?? 1;
        if (existingItemCourse !== currentCourse) {
          return false;
        }
        // Must have the exact same customizations
        const existingItemKey = generateItemCompositeKey(
          cartItem.menuItemId,
          cartItem.customizations
        );
        return existingItemKey === newItemKey;
      });

      if (mergeCandidate) {
        // 3. If a candidate exists, create a new cart array with the updated quantity
        updatedCart = updatedCart.map((item) =>
          item.id === mergeCandidate.id
            ? { ...item, quantity: item.quantity + newItem.quantity }
            : item
        );
      } else {
        // 4. If no candidate, create a new item and add it to a new cart array
        const newCartItem: CartItem = {
          ...newItem,
          paidQuantity: 0,
          item_status:
            activeOrder.order_type === "Dine In" ? "preparing" : undefined,
          kitchen_status: newItem.isDraft ? undefined : ("new" as const), // Only mark as 'new' if not a draft
        };
        updatedCart = [...updatedCart, newCartItem];
        coursingState.setItemCourse(
          activeOrderId,
          newCartItem.id,
          currentCourse
        );
      }

      // 5. Update the state with the new cart array
      set((state) => ({
        orders: state.orders.map((o) =>
          o.id === activeOrderId ? { ...o, items: updatedCart } : o
        ),
      }));

      recalculateTotals(activeOrderId);

      // 6. Async backend sync (optimistic UI - local update already done)
      // Only sync non-draft items
      const itemToSync = mergeCandidate || newItem;
      if (!itemToSync.isDraft) {
        const orderToSync = get().orders.find((o) => o.id === activeOrderId);
        if (orderToSync) {
          const removeItemAction = get().removeItemFromActiveOrder;
          const setOrderDbIdAction = (
            orderId: string,
            dbOrderId: string,
            orderNumber: string,
            displayNumber: string
          ) => {
            set((state) => ({
              orders: state.orders.map((o) =>
                o.id === orderId
                  ? {
                      ...o,
                      db_order_id: dbOrderId,
                      order_number: orderNumber,
                      display_number: displayNumber,
                      sync_status: "synced" as const,
                    }
                  : o
              ),
            }));
          };

          // Fire async sync (don't await - optimistic)
          // Pass recalculateTotals as callback to be called after sync completes
          addItemToBackend(
            orderToSync,
            itemToSync,
            setOrderDbIdAction,
            removeItemAction,
            recalculateTotals // Callback to recalculate totals after db_order_id is available
          ).catch((err) => console.error("Background sync failed:", err));
        }
      }
    },

    updateItemInActiveOrder: (updatedItem) => {
      const { activeOrderId } = get();

      if (!activeOrderId) return;
      set((state) => ({
        orders: state.orders.map((o) =>
          o.id === activeOrderId
            ? {
                ...o,
                items: o.items.map((i) =>
                  i.id === updatedItem.id ? updatedItem : i
                ),
              }
            : o
        ),
      }));
      recalculateTotals(activeOrderId);
    },

    updateItemStatusInActiveOrder: (itemId, status) => {
      const { activeOrderId, orders } = get();
      if (!activeOrderId) return;

      const activeOrder = orders.find((o) => o.id === activeOrderId);
      if (!activeOrder) return;

      // Find the item being updated
      const itemToUpdate = activeOrder.items.find((i) => i.id === itemId);

      // Trigger inventory depletion when an item is marked as "ready" or "served"
      if ((status === "ready" || status === "served") && itemToUpdate) {
        useInventoryStore.getState().decrementStockFromItem(itemToUpdate);
      }

      set((state) => {
        const updatedOrders = state.orders.map((o) => {
          if (o.id === activeOrderId) {
            const updatedItems = o.items.map((i) => {
              if (i.id === itemId) {
                const updatedItem = { ...i, item_status: status };

                // Update kitchen_status based on item_status
                if (
                  status === "preparing" &&
                  (!i.kitchen_status || i.kitchen_status === "new")
                ) {
                  updatedItem.kitchen_status = "sent";
                } else if (status === "ready") {
                  updatedItem.kitchen_status = "ready";
                } else if (status === "served") {
                  updatedItem.kitchen_status = "served";
                }

                return updatedItem;
              }
              return i;
            });

            // Only sync order status for dine-in orders that are assigned to tables
            // Don't sync for orders that are still being built or takeaway orders
            if (
              o.order_type === "Dine In" &&
              o.order_status !== "draft" &&
              o.service_location_id !== null
            ) {
              const allItemsServed = updatedItems.every(
                (item) => item.item_status === "served"
              );
              const allItemsReady = updatedItems.every(
                (item) =>
                  item.item_status === "ready" || item.item_status === "served"
              );
              const anyItemsPreparing = updatedItems.some(
                (item) => item.item_status === "preparing"
              );

              let newOrderStatus = o.order_status;
              if (allItemsServed && updatedItems.length > 0) {
                newOrderStatus = "completed";
              } else if (allItemsReady && updatedItems.length > 0) {
                newOrderStatus = "ready";
              } else if (anyItemsPreparing) {
                newOrderStatus = "preparing";
              }

              return {
                ...o,
                items: updatedItems,
                order_status: newOrderStatus,
              };
            }

            // For orders still being built or takeaway orders, just update the items without changing order status
            return {
              ...o,
              items: updatedItems,
            };
          }
          return o;
        });

        return { orders: updatedOrders };
      });
    },

    removeItemFromActiveOrder: (itemId) => {
      const { activeOrderId, orders } = get();
      if (!activeOrderId) return;

      const order = orders.find((o) => o.id === activeOrderId);
      if (!order) return;

      const itemToRemove = order.items.find((i) => i.id === itemId);

      // If item is already synced (has kitchen status other than 'new' or order has db_id), try to void on backend
      if (itemToRemove && !itemToRemove.isDraft && order.db_order_id) {
        const supabase = getOrderStoreSupabaseClient();
        // We don't have the order_item_id mapped in CartItem usually...
        // Assuming CartItem.id MIGHT correspond to order_item_id if fetched from backend,
        // OR we need to find the backend ID.
        // If we don't have backend ID for item, we can't void it via RPC.
        // For now, proceeding with local removal and attempting RPC if feasible.
        // But checking `useOrders.ts`, voidItem takes `orderItemId`.
        // If local items don't have real DB IDs, this will fail.
        // Assuming hydrated orders have correct IDs.

        if (supabase) {
          OrderService.voidOrderItem(supabase, itemId, "User removed").then(
            ({ error }) => {
              if (error) console.error("Failed to void item:", error);
              else {
                // Trigger total recalc after void
                recalculateTotals(activeOrderId);
              }
            }
          );
        }
      }

      set((state) => ({
        orders: state.orders.map((o) =>
          o.id === activeOrderId
            ? { ...o, items: o.items.filter((i) => i.id !== itemId) }
            : o
        ),
      }));
      recalculateTotals(activeOrderId);
    },

    confirmDraftItem: (itemId) => {
      const { activeOrderId } = get();
      if (!activeOrderId) return;

      set((state) => ({
        orders: state.orders.map((o) =>
          o.id === activeOrderId
            ? {
                ...o,
                items: o.items.map((i) =>
                  i.id === itemId ? { ...i, isDraft: false } : i
                ),
              }
            : o
        ),
      }));
      recalculateTotals(activeOrderId);
    },

    updateActiveOrderDetails: (details) => {
      const { activeOrderId } = get();
      if (!activeOrderId) return;

      set((state) => ({
        orders: state.orders.map((o) =>
          o.id === activeOrderId ? { ...o, ...details } : o
        ),
      }));
    },

    applyDiscountToCheck: (orderId, discount) => {
      set((state) => ({
        orders: state.orders.map((o) =>
          o.id === orderId ? { ...o, checkDiscount: discount } : o
        ),
      }));
      recalculateTotals(get().activeOrderId);
    },

    removeCheckDiscount: (orderId) => {
      set((state) => ({
        orders: state.orders.map((o) =>
          o.id === orderId ? { ...o, checkDiscount: null } : o
        ),
      }));
      recalculateTotals(get().activeOrderId);
    },

    applyDiscountToItem: (orderId, itemId) => {
      set((state) => ({
        orders: state.orders.map((o) => {
          if (o.id === orderId) {
            return {
              ...o,
              items: o.items.map((item) => {
                if (item.id === itemId && item.availableDiscount) {
                  return { ...item, appliedDiscount: item.availableDiscount };
                }
                return item;
              }),
            };
          }
          return o;
        }),
      }));
      recalculateTotals(get().activeOrderId);
    },

    removeDiscountFromItem: (orderId, itemId) => {
      set((state) => ({
        orders: state.orders.map((o) => {
          if (o.id === orderId) {
            return {
              ...o,
              items: o.items.map((item) =>
                item.id === itemId ? { ...item, appliedDiscount: null } : item
              ),
            };
          }
          return o;
        }),
      }));
      recalculateTotals(get().activeOrderId);
    },

    assignOrderToTable: (orderId, tableId) => {
      set((state) => ({
        orders: state.orders.map((o) =>
          o.id === orderId ? { ...o, service_location_id: tableId } : o
        ),
      }));
    },

    assignActiveOrderToTable: (tableId) => {
      const { activeOrderId, orders } = get();
      if (!activeOrderId) return;

      const orderToAssign = orders.find((o) => o.id === activeOrderId);
      if (!orderToAssign || orderToAssign.items.length === 0) {
        console.warn("Cannot assign an empty order to a table.");
        toastService.show({
          title: "Empty Cart",
          message: "Cannot assign an empty order to a table.",
          type: "error",
        });
        return;
      }

      // For dine-in orders, check if the order is paid before assigning to table
      if (
        orderToAssign.order_type === "Dine In" &&
        orderToAssign.paid_status !== "Paid"
      ) {
        toastService.show({
          title: "Payment Required",
          message:
            "This order must be paid before it can be assigned to a table.",
          type: "error",
        });
        return;
      }

      // Update the current order with the table ID and set status to Preparing
      const updatedOrders = orders.map((o) =>
        o.id === activeOrderId
          ? {
              ...o,
              service_location_id: tableId,
              order_type: "Dine In" as const,
              order_status: "preparing" as const,
            }
          : o
      );

      // Sync status change to backend
      const supabase = getOrderStoreSupabaseClient();
      if (supabase && orderToAssign.db_order_id) {
        OrderService.updateOrderStatus(
          supabase,
          orderToAssign.db_order_id,
          "preparing"
        ).then(({ error }) => {
          if (error) {
            console.error("Failed to update backend order status:", error);
          }
        });
      }

      // Create a new, empty global "walk-in" order for the next customer
      const newGlobalOrder: OrderProfile = {
        id: `order_${Date.now()}`,
        service_location_id: null,
        order_status: "draft",
        check_status: "Opened",
        paid_status: "Unpaid",
        items: [],
        opened_at: new Date().toISOString(),
      };

      set({
        orders: [...updatedOrders, newGlobalOrder],
        // Set the new global order as the active one for the home screen
        activeOrderId: newGlobalOrder.id,
      });

      // Recalculate totals, which will now be zero for the active (new global) order
      recalculateTotals(get().activeOrderId);
    },

    updateOrderStatus: (orderId, status) => {
      const { orders } = get();
      const order = orders.find((o) => o.id === orderId);

      // Sync to backend if possible
      const supabase = getOrderStoreSupabaseClient();
      if (supabase && order?.db_order_id) {
        OrderService.updateOrderStatus(
          supabase,
          order.db_order_id,
          status
        ).then(({ error }) => {
          if (error)
            console.error("Failed to update status on backend:", error);
        });
      }

      set((state) => ({
        orders: state.orders.map((o) => {
          if (o.id !== orderId) return o;
          // Keep check_status in sync for terminal states
          const next: Partial<OrderProfile> = { order_status: status } as any;
          if (status === "completed" || status === "void") {
            (next as any).check_status = "Closed";
          }
          return { ...o, ...next };
        }),
      }));
    },

    addPaymentToOrder: ({
      orderId,
      amount,
      method,
      cardBrand,
      last4,
      tipAmount,
      transactionDetails,
    }) => {
      set((state) => ({
        orders: state.orders.map((o) => {
          if (o.id === orderId) {
            const newPayment = {
              amount,
              method,
              ...(cardBrand && { cardBrand }),
              ...(last4 && { last4 }),
              ...(tipAmount && { tipAmount }),
              ...(transactionDetails && { transactionDetails }),
            };

            const newPayments = [...(o.payments || []), newPayment];

            // Mark items as paid in FIFO order until amount is exhausted
            let remaining = amount;
            const updatedItems = o.items.map((item) => {
              const unitPrice = item.price;
              const unpaidQty = item.quantity - (item.paidQuantity || 0);
              if (remaining <= 0 || unpaidQty <= 0) return item;

              const maxCoverQty = Math.min(
                unpaidQty,
                Math.floor(remaining / unitPrice + 1e-6)
              );
              if (maxCoverQty <= 0) return item;
              remaining -= maxCoverQty * unitPrice;
              return {
                ...item,
                paidQuantity: (item.paidQuantity || 0) + maxCoverQty,
              };
            });

            // Sync payment to backend (optimistic)
            const paymentDetails = {
              amount,
              method,
              tipAmount,
              transactionDetails,
            };
            // Don't await sync - UI should be responsive
            syncPaymentToBackend(o, paymentDetails).catch((err) =>
              console.error("Background payment sync failed:", err)
            );

            return { ...o, payments: newPayments, items: updatedItems };
          }
          return o;
        }),
      }));
    },

    markOrderAsPaid: (orderId: string) => {
      const { orders, activeOrderDiscount } = get();
      const order = orders.find((o) => o.id === orderId);
      if (!order) return;

      // Trigger inventory depletion when order is paid (alternative trigger point)
      if (
        order.items.length > 0 &&
        order.order_status !== "ready" &&
        order.order_status !== "completed"
      ) {
        useInventoryStore.getState().decrementStockFromSale(order.items);
      }

      // Calculate total based on items (this is the subtotal)
      const subtotal = order.items.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0
      );

      // The final subtotal is the subtotal MINUS the calculated discount
      const finalSubtotal = subtotal - activeOrderDiscount;
      // Use dynamic tax rate from store settings
      const taxRateDecimal =
        (useStoreSettingsStore.getState().defaultTaxRate || 8.25) / 100;
      const tax = finalSubtotal * taxRateDecimal;
      const total = finalSubtotal + tax;

      set((state) => ({
        orders: state.orders.map((o) =>
          o.id === orderId
            ? {
                ...o,
                paid_status: "Paid",
                check_status: "Closed",
                total_amount: total, // Save the correct final total
                total_tax: tax,
                total_discount: activeOrderDiscount, // Save the discount amount
              }
            : o
        ),
      }));
    },

    setPendingTableSelection: (tableId) => {
      set({ pendingTableSelection: tableId });
    },

    syncOrderStatus: (orderId) => {
      syncOrderStatus(orderId);
    },

    archiveOrder: (orderId: string) => {
      const { orders } = get();
      const order = orders.find((o) => o.id === orderId);

      if (!order) return null;

      // Trigger stock deduction before archiving
      if (order.items.length > 0) {
        useInventoryStore.getState().decrementStockFromSale(order.items);
      }

      const tableId = order.service_location_id;

      // Ensure the order has a final status. If not "Voided", set it to "Closed".
      const finalOrder = {
        ...order,
        order_status:
          order.order_status === "void"
            ? ("void" as const)
            : ("completed" as const),
        closed_at: order.closed_at || new Date().toISOString(),
        total_amount:
          order.total_amount ||
          order.items.reduce(
            (sum, item) => sum + item.price * item.quantity,
            0
          ) ||
          0,
        total_tax:
          order.total_tax ||
          (order.items.reduce(
            (sum, item) => sum + item.price * item.quantity,
            0
          ) || 0) *
            ((useStoreSettingsStore.getState().defaultTaxRate || 8.25) / 100),
      };

      // Save to previous orders
      const { addOrderToHistory } = usePreviousOrdersStore.getState();
      addOrderToHistory(finalOrder);

      // Finally, remove the order from the active orders list
      set((state) => ({
        orders: state.orders.filter((o) => o.id !== orderId),
        activeOrderId:
          state.activeOrderId === orderId ? null : state.activeOrderId,
      }));

      recalculateTotals(null);

      return tableId;
    },
    setOpenedAt: (orderId, openedAt) => {
      set((state) => ({
        orders: state.orders.map((o) =>
          o.id === orderId ? { ...o, opened_at: openedAt } : o
        ),
      }));
    },
    setClosedAt: (orderId, closedAt) => {
      set((state) => ({
        orders: state.orders.map((o) =>
          o.id === orderId ? { ...o, closed_at: closedAt } : o
        ),
      }));
    },
    markAllItemsAsReady: (orderId) => {
      const { orders } = get();
      const order = orders.find((o) => o.id === orderId);

      if (!order) return;

      if (order.items.length > 0) {
        useInventoryStore.getState().decrementStockFromSale(order.items);
      }

      const mergedItemsMap = new Map<string, CartItem>();

      for (const item of order.items) {
        // Don't process draft items
        if (item.isDraft) continue;

        const itemKey = generateItemCompositeKey(
          item.menuItemId,
          item.customizations
        );

        if (mergedItemsMap.has(itemKey)) {
          // If this item already exists in our map, just update its quantity
          const existingItem = mergedItemsMap.get(itemKey)!;
          existingItem.quantity += item.quantity;
        } else {
          // If it's the first time we've seen this item, add it to the map
          // and set its status to Ready.
          mergedItemsMap.set(itemKey, {
            ...item,
            item_status: "ready" as const,
            kitchen_status: "ready" as const,
          });
        }
      }

      // Convert the map back to an array of items
      const updatedItems = Array.from(mergedItemsMap.values());

      set((state) => ({
        orders: state.orders.map((o) => {
          if (o.id === orderId) {
            return {
              ...o,
              items: updatedItems, // Use the new, consolidated list
              order_status: "ready" as const,
            };
          }
          return o;
        }),
      }));

      // Sync status to backend
      const supabase = getOrderStoreSupabaseClient();
      if (supabase && order.db_order_id) {
        OrderService.updateOrderStatus(
          supabase,
          order.db_order_id,
          "ready"
        ).then(({ error }) => {
          if (error) {
            console.error("Failed to update backend order status:", error);
          }
        });
      }
    },

    markAllItemsAsServed: (orderId) => {
      const { orders } = get();
      const order = orders.find((o) => o.id === orderId);

      if (!order) return;

      // Trigger inventory depletion when all items are marked as served
      if (order.items.length > 0) {
        useInventoryStore.getState().decrementStockFromSale(order.items);
      }

      set((state) => ({
        orders: state.orders.map((order) => {
          if (order.id === orderId) {
            // Create a new items array where every item's status is "Served"
            const updatedItems = order.items.map((item) => ({
              ...item,
              item_status: "served" as const, // Use 'as const' for strict typing
              kitchen_status: "served" as const, // Update kitchen status to served
            }));

            // Return the order with the updated items and the overall order status also set to "Served"
            return {
              ...order,
              items: updatedItems,
              order_status: "completed" as const,
            };
          }
          return order;
        }),
      }));

      // Sync status to backend
      const supabase = getOrderStoreSupabaseClient();
      if (supabase && order.db_order_id) {
        OrderService.updateOrderStatus(
          supabase,
          order.db_order_id,
          "completed"
        ).then(({ error }) => {
          if (error) {
            console.error("Failed to update backend order status:", error);
          }
        });
      }
    },
    consolidateOrdersForTables: (tableIds, tableNames) => {
      const { orders, startNewOrder } = get();
      const ordersToMerge = orders.filter(
        (o) => o.service_location_id && tableIds.includes(o.service_location_id)
      );

      const allItems = ordersToMerge.flatMap((o) => o.items);
      const oldOrderIds = ordersToMerge.map((o) => o.id);
      const primaryTableId = tableIds[0];

      // 1. Find the earliest start time ONLY if one already exists.
      const earliestStartTime = ordersToMerge.reduce(
        (earliest: number | null, currentOrder) => {
          if (currentOrder.opened_at) {
            const currentOpenTime = new Date(currentOrder.opened_at).getTime();
            // If earliest is null or current time is earlier, update.
            if (earliest === null || currentOpenTime < earliest) {
              return currentOpenTime;
            }
          }
          return earliest;
        },
        null // Initialize with null
      );

      const newMergedOrderData = {
        id: `order_${Date.now()}`,
        service_location_id: primaryTableId,
        order_status: "preparing" as const,
        order_type: "Dine In" as const,
        check_status: "Opened" as const,
        paid_status: "Unpaid" as const,
        items: allItems,
        server_name: ordersToMerge[0]?.server_name || "Unknown",
        guest_count: ordersToMerge.reduce(
          (sum, o) => sum + (o.guest_count || 1),
          0
        ),
        opened_at: earliestStartTime
          ? new Date(earliestStartTime).toISOString()
          : null,
        customer_name: `Merged Table (${tableNames.join(", ")})`,
      };

      set((state) => {
        const newOrdersList = state.orders.filter(
          (o) => !oldOrderIds.includes(o.id)
        );
        newOrdersList.push(newMergedOrderData);
        return { orders: newOrdersList };
      });

      const finalMergedOrderId = newMergedOrderData.id;
      return finalMergedOrderId;
    },

    fireActiveOrderToKitchen: () => {
      const { activeOrderId, orders } = get();
      if (!activeOrderId) return;
      const currentOrder = orders.find((o) => o.id === activeOrderId);
      if (!currentOrder) return;
      if ((currentOrder.items?.length || 0) === 0) return;
      // If already fired (not in Building), do nothing
      if (currentOrder.order_status !== "draft") return;

      const updatedOrders = orders.map((o) => {
        if (o.id !== activeOrderId) return o;
        const startTime = o.opened_at ? o.opened_at : new Date().toISOString();
        const updatedItems = o.items.map((item) => ({
          ...item,
          item_status: "Preparing" as const,
        }));
        return {
          ...o,
          items: updatedItems,
          order_status: "preparing" as const,
          check_status: "Opened" as const,
          paid_status: o.paid_status === "Paid" ? "Paid" : "Unpaid",
          order_type: o.order_type,
          opened_at: startTime,
        } as OrderProfile;
      });

      const newOrder: OrderProfile = {
        id: `order_${Date.now()}`,
        service_location_id: null,
        order_status: "draft",
        check_status: "Opened",
        paid_status: "Unpaid",
        items: [],
        opened_at: new Date().toISOString(),
      };

      set({
        orders: [...updatedOrders, newOrder],
        activeOrderId: newOrder.id,
        // Reset totals synchronously for the new empty order
        activeOrderSubtotal: 0,
        activeOrderTax: 0,
        activeOrderTotal: 0,
        activeOrderDiscount: 0,
        activeOrderOutstandingSubtotal: 0,
        activeOrderOutstandingTax: 0,
        activeOrderOutstandingTotal: 0,
      });
      // recalculateTotals is no longer needed here since we reset above

      // Sync status to backend
      const supabase = getOrderStoreSupabaseClient();
      if (supabase && currentOrder.db_order_id) {
        OrderService.updateOrderStatus(
          supabase,
          currentOrder.db_order_id,
          "preparing"
        ).then(({ error }) => {
          if (error) {
            console.error("Failed to update backend order status:", error);
          }
        });
      }

      toastService.show({
        title: "Order Sent",
        message: "The order has been successfully sent to the kitchen.",
        type: "success",
      });
    },
    transferOrderToTable: (orderId, newTableId) => {
      set((state) => ({
        orders: state.orders.map((order) =>
          order.id === orderId
            ? { ...order, service_location_id: newTableId }
            : order
        ),
      }));
    },
    sendNewItemsToKitchen: () => {
      const { activeOrderId, orders } = get();
      if (!activeOrderId) return;

      const currentOrder = orders.find((o) => o.id === activeOrderId);
      if (!currentOrder) return;

      const newItems = currentOrder.items.filter(
        (item) => !item.kitchen_status || item.kitchen_status === "new"
      );

      if (newItems.length === 0) return;

      let cartToProcess = [...currentOrder.items];
      const itemsToKeep: CartItem[] = [];
      const mergedItemIds = new Set<string>();

      // Iterate through each new item to see if it can be merged
      for (const newItem of newItems) {
        // Find a candidate for merging (must be already 'sent' and identical)
        const mergeCandidate = cartToProcess.find((item) => {
          if (item.id === newItem.id) return false; // Don't match self
          if (item.kitchen_status !== "sent") return false; // Must be already sent

          const key1 = generateItemCompositeKey(
            item.menuItemId,
            item.customizations
          );
          const key2 = generateItemCompositeKey(
            newItem.menuItemId,
            newItem.customizations
          );

          return key1 === key2;
        });

        if (mergeCandidate) {
          // If we found a match, update its quantity in the final list
          const existingInFinal = itemsToKeep.find(
            (i) => i.id === mergeCandidate.id
          );
          if (existingInFinal) {
            existingInFinal.quantity += newItem.quantity;
          } else {
            const updatedCandidate = {
              ...mergeCandidate,
              quantity: mergeCandidate.quantity + newItem.quantity,
            };
            itemsToKeep.push(updatedCandidate);
          }
          mergedItemIds.add(mergeCandidate.id); // Mark original as processed
        } else {
          // If no merge candidate, just mark this new item as 'sent' and add it
          itemsToKeep.push({
            ...newItem,
            kitchen_status: "sent",
            item_status: "preparing",
          });
        }
      }

      // Add back all items that were not part of the merge logic (drafts, other sent items)
      const finalCart = [
        ...itemsToKeep,
        ...cartToProcess.filter((item) => {
          const isNew = !item.kitchen_status || item.kitchen_status === "new";
          const wasMerged = mergedItemIds.has(item.id);
          // Keep if it's not a new item and was not a merge target
          return !isNew && !wasMerged;
        }),
      ];

      set((state) => ({
        orders: state.orders.map((o) => {
          if (o.id === activeOrderId) {
            return {
              ...o,
              items: finalCart, // Use the newly constructed final cart
              order_status: "preparing",
            };
          }
          return o;
        }),
      }));

      recalculateTotals(activeOrderId); // Recalculate totals after merging

      // Sync the status change to the backend ("Preparing")
      const supabase = getOrderStoreSupabaseClient();
      if (supabase && currentOrder.db_order_id) {
        supabase
          .rpc("update_order_status", {
            p_order_id: currentOrder.db_order_id,
            p_new_status: "preparing",
          })
          .then(({ error }) => {
            if (error) {
              console.error("Failed to update backend order status:", error);
            }
          });
      }

      toastService.show({
        title: "Items Sent",
        message: `${newItems.length} new item${
          newItems.length > 1 ? "s" : ""
        } sent to the kitchen.`,
        type: "success",
      });
    },

    sendNewItemsToKitchenForOrder: (orderId: string) => {
      set((state) => {
        const order = state.orders.find((o) => o.id === orderId);
        if (
          !order ||
          order.items.filter(
            (item) => !item.kitchen_status || item.kitchen_status === "new"
          ).length === 0
        ) {
          return state; // No new items to send, no state change
        }

        return {
          orders: state.orders.map((o) => {
            if (o.id === orderId) {
              const updatedItems = o.items.map((item) => {
                if (!item.kitchen_status || item.kitchen_status === "new") {
                  return {
                    ...item,
                    kitchen_status: "sent" as const,
                    item_status: "Preparing" as const,
                  };
                }
                return item;
              });

              // Check if the timer needs to be started
              const shouldStartTimer =
                o.order_type === "Dine In" && !o.opened_at;

              return {
                ...o,
                items: updatedItems,
                order_status: "preparing",
                // Set opened_at timestamp if it's not already set for a Dine In order
                opened_at: shouldStartTimer
                  ? new Date().toISOString()
                  : o.opened_at,
              } as OrderProfile;
            }
            return o;
          }),
        };
      });

      // Show toast after the state update
      toastService.show({
        title: "Items Sent",
        message: "New items have been sent to the kitchen.",
        type: "success",
      });
    },

    generateCartItemId: (menuItemId, customizations, isDraft = false) => {
      return generateCartItemId(menuItemId, customizations, isDraft);
    },
    deleteOrder: (orderId: string) => {
      set((state) => ({
        orders: state.orders.filter((o) => o.id !== orderId),
      }));
    },
    clearCart: () => {
      const { activeOrderId } = get();
      if (!activeOrderId) return;

      set((state) => ({
        orders: state.orders.map(
          (o) => (o.id === activeOrderId ? { ...o, items: [] } : o) // Set items to an empty array
        ),
      }));

      // After clearing the cart, recalculate totals to update them to $0.00
      recalculateTotals(activeOrderId);

      toastService.show({
        title: "Cart Cleared",
        message: "All items have been removed from the current order.",
        type: "success",
      });
    },
    voidOrder: (orderId: string) => {
      const { archiveOrder } = get();

      // Update the order's status
      set((state) => ({
        orders: state.orders.map((o) =>
          o.id === orderId
            ? { ...o, order_status: "void", check_status: "Closed" }
            : o
        ),
      }));

      // Directly call archiveOrder after the state has been updated
      archiveOrder(orderId);
    },
  };
});
