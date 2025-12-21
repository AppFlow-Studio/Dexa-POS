import { toastService } from "@/lib/toastService";
import { CartItem, Discount, OrderProfile, PaymentType } from "@/lib/types";
import type {
  AddOrderItemParams,
  CreateOrderParams,
  OrderType as DbOrderType,
  ProcessPaymentParams,
} from "@/types/db-order-management-types";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { SupabaseClient } from "@supabase/supabase-js";
import { create } from "zustand";
import {
  createJSONStorage,
  persist,
  subscribeWithSelector,
} from "zustand/middleware";
import { useCoursingStore } from "./useCoursingStore";
import { useEmployeeStore } from "./useEmployeeStore";
import { useInventoryStore } from "./useInventoryStore";
import { usePreviousOrdersStore } from "./usePreviousOrdersStore";

import { queueOperation } from "@/services/offlineSyncService";
import { OrderService } from "@/services/orderService";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useFloorPlanStore } from "./useFloorPlanStore";

// ============================================================================
// PURE CALCULATION FUNCTIONS (No async, no side effects)
// ============================================================================

interface OrderTotals {
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  outstanding_subtotal: number;
  outstanding_tax: number;
  outstanding_total: number;
}

function round2(num: number): number {
  return Math.round(num * 100) / 100;
}

/**
 * Calculate all order totals - PURE FUNCTION, SYNCHRONOUS
 * This replaces the async recalculateTotals for instant UI updates.
 */
function calculateOrderTotals(
  items: CartItem[],
  checkDiscount: Discount | null | undefined,
  payments: { amount: number }[],
  taxRatePercent: number
): OrderTotals {
  const taxRate = taxRatePercent / 100;

  // Subtotal (all items with their effective prices)
  const subtotal = items.reduce(
    (acc, item) => acc + item.price * item.quantity,
    0
  );

  // Item-level discounts
  const itemDiscountsTotal = items.reduce((acc, item) => {
    if (item.appliedDiscount) {
      return (
        acc + item.originalPrice * item.appliedDiscount.value * item.quantity
      );
    }
    return acc;
  }, 0);

  const subtotalAfterItemDiscounts = subtotal - itemDiscountsTotal;

  // Check-level discount
  let checkDiscountAmount = 0;
  if (checkDiscount) {
    if (checkDiscount.type === "percentage") {
      checkDiscountAmount = subtotalAfterItemDiscounts * checkDiscount.value;
    } else {
      checkDiscountAmount = checkDiscount.value;
    }
  }

  const discount_amount = round2(itemDiscountsTotal + checkDiscountAmount);
  const taxableAmount = Math.max(0, subtotal - discount_amount);
  const tax_amount = round2(taxableAmount * taxRate);
  const total_amount = round2(taxableAmount + tax_amount);

  // Outstanding (unpaid items only)
  const outstanding_subtotal = items.reduce((acc, item) => {
    const unpaidQty = item.quantity - (item.paidQuantity || 0);
    return acc + unpaidQty * item.price;
  }, 0);

  const proportionOutstanding =
    subtotal > 0 ? outstanding_subtotal / subtotal : 0;
  const outstandingDiscount = discount_amount * proportionOutstanding;
  const outstandingSubtotalAfterDiscount =
    outstanding_subtotal - outstandingDiscount;
  const outstanding_tax = round2(outstandingSubtotalAfterDiscount * taxRate);
  const outstanding_total = round2(
    outstandingSubtotalAfterDiscount + outstanding_tax
  );

  return {
    subtotal: round2(subtotal),
    discount_amount,
    tax_amount,
    total_amount,
    outstanding_subtotal: round2(outstanding_subtotal),
    outstanding_tax,
    outstanding_total,
  };
}

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
      p_price_paid: item.originalPrice, // Default to original price (no item-level discount yet)
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

      // Kitchen/Coursing
      p_prep_station: undefined,
      p_course_number:
        useCoursingStore.getState().getWorkingCourse(order.id) || 1, // Use working course or default to 1
    };

    console.log(
      "Adding item to backend with params:",
      JSON.stringify(addItemParams, null, 2)
    );
    console.log("Calling OrderService.addOrderItem now...");
    const { data: addResult, error: addError } =
      await OrderService.addOrderItem(supabase, addItemParams);

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

    console.log("Item synced to backend successfully:", addResult);

    // Store the backend order_item_id on the local CartItem for future updates/voids
    if (addResult?.order_item_id) {
      useOrderStore.setState((state) => {
        const currentOrder = state.ordersById[order.id];
        if (!currentOrder) return state;

        const updatedItems = currentOrder.items.map((i) =>
          i.id === item.id
            ? { ...i, db_order_item_id: addResult.order_item_id }
            : i
        );

        return {
          ordersById: {
            ...state.ordersById,
            [order.id]: {
              ...currentOrder,
              items: updatedItems,
            },
          },
        };
      });
      console.log(
        `Saved db_order_item_id: ${addResult.order_item_id} for item: ${item.id}`
      );
    }

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

    // If backend says order is NOT fully paid, revert optimistic status
    if (data?.order_fully_paid === false) {
      useOrderStore.setState((state) => ({
        ordersById: {
          ...state.ordersById,
          [order.id]: {
            ...state.ordersById[order.id],
            paid_status: "Unpaid" as const,
            check_status: "Opened" as const,
          },
        },
      }));
    }

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
  // === OPTIMIZED DATA STRUCTURE (O(1) lookup) ===
  ordersById: Record<string, OrderProfile>;
  orderIds: string[]; // Maintains insertion order for iteration
  activeOrderId: string | null;

  // === BACKWARD COMPATIBLE GETTER ===
  // Consumers can still use: const orders = useOrderStore(state => state.orders)
  orders: OrderProfile[];

  // === OFFLINE SYNC STATE ===
  isOnline: boolean;
  pendingSyncCount: number;

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

  // --- OFFLINE SYNC ACTIONS ---
  setOnlineStatus: (isOnline: boolean) => void;
  setPendingSyncCount: (count: number) => void;

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

export const useOrderStore = create<OrderState>()(
  subscribeWithSelector(
    persist(
      (set, get) => {
        // --- PRIVATE HELPER FUNCTION ---
        // This function calculates and sets the totals for the currently active order.

        // Helper function to sync order status based on item statuses
        const syncOrderStatus = (orderId: string) => {
          const { orders } = get();
          // console.log('[syncOrderStatus] orders', orders)
          const order = orders.find((o) => o.id === orderId);
          if (!order || !order.items.length) return;

          // Only sync order status for orders that are assigned to tables or in kitchen workflow
          // Don't sync for orders that are still being built
          if (
            order.order_status === "draft" ||
            order.service_location_id === null
          ) {
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
        const normalizePaidQuantitiesFromPayments = (
          orderId: string | null
        ) => {
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

        // Re-entry guard to prevent infinite loops when state updates trigger re-calculations
        let isRecalculating = false;

        const recalculateTotals = async (orderId: string | null) => {
          // Prevent re-entry - if already recalculating, skip
          if (isRecalculating) {
            console.log("Skipping recalculateTotals - already in progress");
            return;
          }
          isRecalculating = true;

          try {
            const { orders, activeOrderId: currentActiveOrderId } = get();
            const activeOrder = orders.find((o) => o.id === orderId);

            // Safety check: Only update derived state if this orderId is still the active order
            // This prevents stale async calculations from overwriting the current order's totals
            const isStillActiveOrder = orderId === currentActiveOrderId;

            // Only calculate if order exists and has items - empty orders reset to 0 immediately
            if (
              activeOrder &&
              activeOrder.items &&
              activeOrder.items.length > 0
            ) {
              // Get dynamic tax rate from store settings (convert from percentage to decimal)
              const storeSettings = useStoreSettingsStore.getState();
              const taxRateDecimal =
                (storeSettings.defaultTaxRate || 8.25) / 100;

              // Subtotal must reflect modifiers (size/add-ons) captured in item.price
              const subtotal = activeOrder.items.reduce(
                (acc, item) => acc + item.price * item.quantity,
                0
              );

              const itemDiscountsTotal = activeOrder.items.reduce(
                (acc, item) => {
                  if (item.appliedDiscount) {
                    return (
                      acc +
                      item.originalPrice *
                      item.appliedDiscount.value *
                      item.quantity
                    );
                  }
                  return acc;
                },
                0
              );

              const subtotalAfterItemDiscounts = subtotal - itemDiscountsTotal;

              let checkDiscountAmount = 0;
              if (activeOrder.checkDiscount) {
                checkDiscountAmount =
                  subtotalAfterItemDiscounts * activeOrder.checkDiscount.value;
              }

              const totalDiscountAmount =
                itemDiscountsTotal + checkDiscountAmount;
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
                    console.warn(
                      "Failed to calculate tax from backend:",
                      error
                    );
                  }
                } catch (err) {
                  console.warn("Backend tax calculation error:", err);
                }
              }

              // Use backend values if available, otherwise use local calculation
              const usedSubtotal =
                backendSubtotal !== undefined ? backendSubtotal : finalSubtotal;
              const tax =
                backendTaxAmount !== undefined ? backendTaxAmount : localTax;
              const total = usedSubtotal + tax;

              // Compute outstanding subtotal (unpaid amount) used for badges/logic
              const outstandingSubtotal = activeOrder.items.reduce(
                (acc, item) => {
                  const unpaidQty = item.quantity - (item.paidQuantity || 0);
                  return acc + unpaidQty * item.price;
                },
                0
              );

              // This is a fair way to distribute a check-level discount.
              const proportionOfSubtotalOutstanding =
                subtotal > 0 ? outstandingSubtotal / subtotal : 0;
              const outstandingDiscountAmount =
                totalDiscountAmount * proportionOfSubtotalOutstanding;

              // Calculate the final outstanding total, including discounts
              const outstandingSubtotalAfterDiscount =
                outstandingSubtotal - outstandingDiscountAmount;
              const outstandingTax =
                outstandingSubtotalAfterDiscount * taxRateDecimal;
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
              if (
                backendSubtotal !== undefined ||
                backendTaxAmount !== undefined
              ) {
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
                if (
                  outstandingSubtotal <= 1e-6 &&
                  activeOrder.paid_status !== "Paid"
                ) {
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
          } finally {
            isRecalculating = false;
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
          const compositeKey = generateItemCompositeKey(
            menuItemId,
            customizations
          );
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
          // --- INITIAL STATE (OPTIMIZED STRUCTURE) ---
          ordersById: {},
          orderIds: [],
          activeOrderId: null,
          // Explicitly maintain orders array for reactivity (synced via subscription below)
          orders: [],
          // Offline sync state
          isOnline: true,
          pendingSyncCount: 0,
          activeOrderSubtotal: 0,
          activeOrderTax: 0,
          activeOrderTotal: 0,
          activeOrderDiscount: 0,
          activeOrderOutstandingSubtotal: 0,
          activeOrderOutstandingTax: 0,
          activeOrderOutstandingTotal: 0,
          pendingTableSelection: null,

          // --- OFFLINE SYNC ACTIONS ---
          setOnlineStatus: (isOnline: boolean) => set({ isOnline }),
          setPendingSyncCount: (count: number) =>
            set({ pendingSyncCount: count }),

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
            // Convert array to ordersById structure
            const ordersById: Record<string, OrderProfile> = {};
            const orderIds: string[] = [];
            for (const order of sanitizedOrders) {
              ordersById[order.id] = order;
              orderIds.push(order.id);
            }
            set({ ordersById, orderIds });
          },

          setActiveOrder: (orderId) => {
            // Immediately reset totals to 0 before async recalculation
            // This ensures UI shows 0 for new/empty orders without delay
            set({
              activeOrderId: orderId,
              activeOrderSubtotal: 0,
              activeOrderTax: 0,
              activeOrderTotal: 0,
              activeOrderDiscount: 0,
              activeOrderOutstandingSubtotal: 0,
              activeOrderOutstandingTax: 0,
              activeOrderOutstandingTotal: 0,
            });
            // Then recalculate actual values async
            recalculateTotals(orderId);
          },

          startNewOrder: (details) => {
            const { activeEmployeeId, employees } = useEmployeeStore.getState();
            const activeEmployee = employees.find(
              (e) => e.id === activeEmployeeId
            );

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
            set((state) => ({
              ordersById: { ...state.ordersById, [newOrder.id]: newOrder },
              orderIds: [...state.orderIds, newOrder.id],
            }));
            return newOrder;
          },

          addItemToActiveOrder: (newItem) => {
            const { activeOrderId, ordersById } = get();
            if (!activeOrderId) return;

            const activeOrder = ordersById[activeOrderId]; // O(1) lookup
            if (!activeOrder) return;

            const coursingState = useCoursingStore.getState();
            const currentCourse =
              coursingState.getForOrder(activeOrderId)?.workingCourse ?? 1;
            const newItemKey = generateItemCompositeKey(
              newItem.menuItemId,
              newItem.customizations
            );

            let updatedCart: CartItem[] = activeOrder.items;

            // 1. If newItem is NOT a draft, remove any existing drafts for this MenuItemId
            if (!newItem.isDraft) {
              updatedCart = updatedCart.filter(
                (item) =>
                  !(item.isDraft && item.menuItemId === newItem.menuItemId)
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
                  activeOrder.order_type === "Dine In"
                    ? "preparing"
                    : undefined,
                kitchen_status: newItem.isDraft ? undefined : ("new" as const),
              };
              updatedCart = [...updatedCart, newCartItem];
              coursingState.setItemCourse(
                activeOrderId,
                newCartItem.id,
                currentCourse
              );
            }

            // 5. Calculate totals SYNCHRONOUSLY (no await, instant!)
            const taxRate =
              useStoreSettingsStore.getState().defaultTaxRate || 8.25;
            const totals = calculateOrderTotals(
              updatedCart,
              activeOrder.checkDiscount,
              activeOrder.payments || [],
              taxRate
            );

            // 6. SINGLE ATOMIC UPDATE (items + totals together = 1 re-render)
            set((state) => ({
              ordersById: {
                ...state.ordersById,
                [activeOrderId]: {
                  ...state.ordersById[activeOrderId],
                  items: updatedCart,
                  total_amount: totals.total_amount,
                  total_tax: totals.tax_amount,
                  total_discount: totals.discount_amount,
                },
              },
              // Also update cached active order totals in same update
              activeOrderSubtotal: totals.subtotal,
              activeOrderTax: totals.tax_amount,
              activeOrderTotal: totals.total_amount,
              activeOrderDiscount: totals.discount_amount,
              activeOrderOutstandingSubtotal: totals.outstanding_subtotal,
              activeOrderOutstandingTax: totals.outstanding_tax,
              activeOrderOutstandingTotal: totals.outstanding_total,
            }));

            // 7. Background sync (fire-and-forget, non-blocking)
            const itemToSync = mergeCandidate || newItem;
            if (!itemToSync.isDraft) {
              const orderToSync = get().ordersById[activeOrderId];
              if (orderToSync) {
                const removeItemAction = get().removeItemFromActiveOrder;
                const setOrderDbIdAction = (
                  orderId: string,
                  dbOrderId: string,
                  orderNumber: string,
                  displayNumber: string
                ) => {
                  set((state) => ({
                    ordersById: {
                      ...state.ordersById,
                      [orderId]: {
                        ...state.ordersById[orderId],
                        db_order_id: dbOrderId,
                        order_number: orderNumber,
                        display_number: displayNumber,
                        sync_status: "synced" as const,
                      },
                    },
                  }));
                };

                // Fire async sync (don't await - optimistic)
                addItemToBackend(
                  orderToSync,
                  itemToSync,
                  setOrderDbIdAction,
                  removeItemAction,
                  undefined // No need to recalculate - already done synchronously
                ).catch((err) => console.error("Background sync failed:", err));
              }
            }
          },

          updateItemInActiveOrder: (updatedItem) => {
            const { activeOrderId, ordersById } = get();
            if (!activeOrderId) return;

            const order = ordersById[activeOrderId]; // O(1) lookup
            if (!order) return;

            const originalItem = order.items.find(
              (i) => i.id === updatedItem.id
            );

            // Update items
            const updatedItems = order.items.map((i) =>
              i.id === updatedItem.id ? updatedItem : i
            );

            // Calculate totals SYNCHRONOUSLY
            const taxRate =
              useStoreSettingsStore.getState().defaultTaxRate || 8.25;
            const totals = calculateOrderTotals(
              updatedItems,
              order.checkDiscount,
              order.payments || [],
              taxRate
            );

            // SINGLE ATOMIC UPDATE
            set((state) => ({
              ordersById: {
                ...state.ordersById,
                [activeOrderId]: {
                  ...state.ordersById[activeOrderId],
                  items: updatedItems,
                  total_amount: totals.total_amount,
                  total_tax: totals.tax_amount,
                  total_discount: totals.discount_amount,
                },
              },
              activeOrderSubtotal: totals.subtotal,
              activeOrderTax: totals.tax_amount,
              activeOrderTotal: totals.total_amount,
              activeOrderDiscount: totals.discount_amount,
              activeOrderOutstandingSubtotal: totals.outstanding_subtotal,
              activeOrderOutstandingTax: totals.outstanding_tax,
              activeOrderOutstandingTotal: totals.outstanding_total,
            }));

            // Background sync (fire-and-forget)
            const dbOrderItemId =
              updatedItem.db_order_item_id || originalItem?.db_order_item_id;
            console.log("dbOrderItemId", dbOrderItemId);

            if (dbOrderItemId && _supabaseClient) {
              const orderId = activeOrderId;

              // 1. Sync quantity change (independent check)
              if (
                originalItem &&
                updatedItem.quantity !== originalItem.quantity
              ) {
                OrderService.updateOrderItemQuantity(
                  _supabaseClient,
                  dbOrderItemId,
                  updatedItem.quantity
                ).catch(async (err) => {
                  console.error("Failed to sync quantity:", err);
                  // Queue for offline retry
                  await queueOperation({
                    type: "update_item_quantity",
                    params: {
                      orderItemId: dbOrderItemId,
                      quantity: updatedItem.quantity,
                    },
                    localOrderId: orderId,
                    localItemId: updatedItem.id,
                  });
                });
              }

              // 2. Sync instructions change (independent check)
              const instructionsChanged =
                updatedItem.customizations?.notes !==
                originalItem?.customizations?.notes;

              if (instructionsChanged) {
                OrderService.updateOrderItem(_supabaseClient, {
                  p_order_item_id: dbOrderItemId,
                  p_special_instructions:
                    updatedItem.customizations?.notes || null,
                }).catch(async (err) => {
                  console.error("Failed to sync item update:", err);
                  // Queue for offline retry
                  await queueOperation({
                    type: "update_item",
                    params: {
                      orderItemId: dbOrderItemId,
                      specialInstructions:
                        updatedItem.customizations?.notes || null,
                    },
                    localOrderId: orderId,
                    localItemId: updatedItem.id,
                  });
                });
              }

              // 3. Sync modifiers/add-ons change (independent check)
              const originalMods = JSON.stringify({
                mods: originalItem?.customizations?.modifiers,
                addons: originalItem?.customizations?.addOns,
              });
              const newMods = JSON.stringify({
                mods: updatedItem.customizations?.modifiers,
                addons: updatedItem.customizations?.addOns,
              });

              if (originalMods !== newMods) {
                // Construct flat list of modifiers for the backend
                const allModifiers: any[] = [];

                // Add standard modifiers
                updatedItem.customizations?.modifiers?.forEach((group) => {
                  group.options.forEach((opt) => {
                    allModifiers.push({
                      modifier_group_id: group.categoryId,
                      modifier_item_id: opt.id,
                      modifier_group_name: group.categoryName,
                      modifier_name: opt.name,
                      price_modifier: opt.price,
                      quantity: 1,
                    });
                  });
                });

                // Add Add-ons (treated as modifiers in "Add-ons" group)
                updatedItem.customizations?.addOns?.forEach((addon) => {
                  allModifiers.push({
                    modifier_item_id: addon.id,
                    modifier_group_name: "Add-ons",
                    modifier_name: addon.name,
                    price_modifier: addon.price,
                    quantity: 1,
                  });
                });

                OrderService.replaceOrderItemModifiers(
                  _supabaseClient,
                  dbOrderItemId,
                  allModifiers
                ).catch(async (err) => {
                  console.error("Failed to sync modifiers:", err);
                  // Queue for offline retry
                  await queueOperation({
                    type: "replace_modifiers",
                    params: {
                      orderItemId: dbOrderItemId,
                      modifiers: allModifiers,
                    },
                    localOrderId: orderId,
                    localItemId: updatedItem.id,
                  });
                });
              }
            }
          },

          updateItemStatusInActiveOrder: (itemId, status) => {
            const { activeOrderId, ordersById } = get();
            if (!activeOrderId) return;

            const activeOrder = ordersById[activeOrderId]; // O(1) lookup
            if (!activeOrder) return;

            // Find the item being updated
            const itemToUpdate = activeOrder.items.find((i) => i.id === itemId);

            // Trigger inventory depletion when an item is marked as "ready" or "served"
            if ((status === "ready" || status === "served") && itemToUpdate) {
              useInventoryStore.getState().decrementStockFromItem(itemToUpdate);
            }

            const order = activeOrder;
            const updatedItems = order.items.map((i) => {
              if (i.id === itemId) {
                const updatedItem = { ...i, item_status: status };
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

            let newOrderStatus = order.order_status;
            if (
              order.order_type === "Dine In" &&
              order.order_status !== "draft" &&
              order.service_location_id !== null
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

              if (allItemsServed && updatedItems.length > 0) {
                newOrderStatus = "completed";
              } else if (allItemsReady && updatedItems.length > 0) {
                newOrderStatus = "ready";
              } else if (anyItemsPreparing) {
                newOrderStatus = "preparing";
              }
            }

            set((state) => ({
              ordersById: {
                ...state.ordersById,
                [activeOrderId]: {
                  ...state.ordersById[activeOrderId],
                  items: updatedItems,
                  order_status: newOrderStatus,
                },
              },
            }));

            recalculateTotals(activeOrderId);
          },

          removeItemFromActiveOrder: (itemId) => {
            const { activeOrderId, ordersById } = get();
            if (!activeOrderId) return;

            const order = ordersById[activeOrderId]; // O(1) lookup
            if (!order) return;

            const itemToRemove = order.items.find((i) => i.id === itemId);
            const updatedItems = order.items.filter((i) => i.id !== itemId);

            // Calculate totals SYNCHRONOUSLY
            const taxRate =
              useStoreSettingsStore.getState().defaultTaxRate || 8.25;
            const totals = calculateOrderTotals(
              updatedItems,
              order.checkDiscount,
              order.payments || [],
              taxRate
            );

            // SINGLE ATOMIC UPDATE (instant UI)
            set((state) => ({
              ordersById: {
                ...state.ordersById,
                [activeOrderId]: {
                  ...state.ordersById[activeOrderId],
                  items: updatedItems,
                  total_amount: totals.total_amount,
                  total_tax: totals.tax_amount,
                  total_discount: totals.discount_amount,
                },
              },
              activeOrderSubtotal: totals.subtotal,
              activeOrderTax: totals.tax_amount,
              activeOrderTotal: totals.total_amount,
              activeOrderDiscount: totals.discount_amount,
              activeOrderOutstandingSubtotal: totals.outstanding_subtotal,
              activeOrderOutstandingTax: totals.outstanding_tax,
              activeOrderOutstandingTotal: totals.outstanding_total,
            }));

            // Background sync (fire-and-forget)
            if (itemToRemove?.db_order_item_id && _supabaseClient) {
              const dbItemId = itemToRemove.db_order_item_id;
              OrderService.voidOrderItem(
                _supabaseClient,
                dbItemId,
                "User removed"
              ).catch(async (err) => {
                console.error("Failed to void item:", err);
                // Queue for offline retry
                await queueOperation({
                  type: "void_item",
                  params: { orderItemId: dbItemId, reason: "User removed" },
                  localOrderId: activeOrderId,
                  localItemId: itemId,
                });
              });
            }
          },

          confirmDraftItem: (itemId) => {
            const { activeOrderId, ordersById } = get();
            if (!activeOrderId) return;

            const order = ordersById[activeOrderId];
            if (!order) return;

            const updatedItems = order.items.map((i) =>
              i.id === itemId
                ? { ...i, isDraft: false, kitchen_status: "new" as const }
                : i
            );

            // Calculate totals
            const taxRate =
              useStoreSettingsStore.getState().defaultTaxRate || 8.25;
            const totals = calculateOrderTotals(
              updatedItems,
              order.checkDiscount,
              order.payments || [],
              taxRate
            );

            set((state) => ({
              ordersById: {
                ...state.ordersById,
                [activeOrderId]: {
                  ...state.ordersById[activeOrderId],
                  items: updatedItems,
                  total_amount: totals.total_amount,
                  total_tax: totals.tax_amount,
                  total_discount: totals.discount_amount,
                },
              },
              activeOrderSubtotal: totals.subtotal,
              activeOrderTax: totals.tax_amount,
              activeOrderTotal: totals.total_amount,
              activeOrderDiscount: totals.discount_amount,
              activeOrderOutstandingSubtotal: totals.outstanding_subtotal,
              activeOrderOutstandingTax: totals.outstanding_tax,
              activeOrderOutstandingTotal: totals.outstanding_total,
            }));
          },

          updateActiveOrderDetails: (details) => {
            const { activeOrderId } = get();
            if (!activeOrderId) return;

            set((state) => ({
              ordersById: {
                ...state.ordersById,
                [activeOrderId]: {
                  ...state.ordersById[activeOrderId],
                  ...details,
                },
              },
            }));
          },

          applyDiscountToCheck: (orderId, discount) => {
            const order = get().ordersById[orderId];
            if (!order) return;

            const taxRate =
              useStoreSettingsStore.getState().defaultTaxRate || 8.25;
            const totals = calculateOrderTotals(
              order.items,
              discount,
              order.payments || [],
              taxRate
            );

            set((state) => ({
              ordersById: {
                ...state.ordersById,
                [orderId]: {
                  ...state.ordersById[orderId],
                  checkDiscount: discount,
                  total_amount: totals.total_amount,
                  total_tax: totals.tax_amount,
                  total_discount: totals.discount_amount,
                },
              },
              ...(orderId === get().activeOrderId
                ? {
                  activeOrderSubtotal: totals.subtotal,
                  activeOrderTax: totals.tax_amount,
                  activeOrderTotal: totals.total_amount,
                  activeOrderDiscount: totals.discount_amount,
                  activeOrderOutstandingSubtotal: totals.outstanding_subtotal,
                  activeOrderOutstandingTax: totals.outstanding_tax,
                  activeOrderOutstandingTotal: totals.outstanding_total,
                }
                : {}),
            }));
          },

          removeCheckDiscount: (orderId) => {
            const order = get().ordersById[orderId];
            if (!order) return;

            const taxRate =
              useStoreSettingsStore.getState().defaultTaxRate || 8.25;
            const totals = calculateOrderTotals(
              order.items,
              null,
              order.payments || [],
              taxRate
            );

            set((state) => ({
              ordersById: {
                ...state.ordersById,
                [orderId]: {
                  ...state.ordersById[orderId],
                  checkDiscount: null,
                  total_amount: totals.total_amount,
                  total_tax: totals.tax_amount,
                  total_discount: totals.discount_amount,
                },
              },
              ...(orderId === get().activeOrderId
                ? {
                  activeOrderSubtotal: totals.subtotal,
                  activeOrderTax: totals.tax_amount,
                  activeOrderTotal: totals.total_amount,
                  activeOrderDiscount: totals.discount_amount,
                  activeOrderOutstandingSubtotal: totals.outstanding_subtotal,
                  activeOrderOutstandingTax: totals.outstanding_tax,
                  activeOrderOutstandingTotal: totals.outstanding_total,
                }
                : {}),
            }));
          },

          applyDiscountToItem: (orderId, itemId) => {
            const order = get().ordersById[orderId];
            if (!order) return;

            const updatedItems = order.items.map((item) => {
              if (item.id === itemId && item.availableDiscount) {
                return { ...item, appliedDiscount: item.availableDiscount };
              }
              return item;
            });

            const taxRate =
              useStoreSettingsStore.getState().defaultTaxRate || 8.25;
            const totals = calculateOrderTotals(
              updatedItems,
              order.checkDiscount,
              order.payments || [],
              taxRate
            );

            set((state) => ({
              ordersById: {
                ...state.ordersById,
                [orderId]: {
                  ...state.ordersById[orderId],
                  items: updatedItems,
                  total_amount: totals.total_amount,
                  total_tax: totals.tax_amount,
                  total_discount: totals.discount_amount,
                },
              },
              ...(orderId === get().activeOrderId
                ? {
                  activeOrderSubtotal: totals.subtotal,
                  activeOrderTax: totals.tax_amount,
                  activeOrderTotal: totals.total_amount,
                  activeOrderDiscount: totals.discount_amount,
                  activeOrderOutstandingSubtotal: totals.outstanding_subtotal,
                  activeOrderOutstandingTax: totals.outstanding_tax,
                  activeOrderOutstandingTotal: totals.outstanding_total,
                }
                : {}),
            }));
          },

          removeDiscountFromItem: (orderId, itemId) => {
            const order = get().ordersById[orderId];
            if (!order) return;

            const updatedItems = order.items.map((item) =>
              item.id === itemId ? { ...item, appliedDiscount: null } : item
            );

            const taxRate =
              useStoreSettingsStore.getState().defaultTaxRate || 8.25;
            const totals = calculateOrderTotals(
              updatedItems,
              order.checkDiscount,
              order.payments || [],
              taxRate
            );

            set((state) => ({
              ordersById: {
                ...state.ordersById,
                [orderId]: {
                  ...state.ordersById[orderId],
                  items: updatedItems,
                  total_amount: totals.total_amount,
                  total_tax: totals.tax_amount,
                  total_discount: totals.discount_amount,
                },
              },
              ...(orderId === get().activeOrderId
                ? {
                  activeOrderSubtotal: totals.subtotal,
                  activeOrderTax: totals.tax_amount,
                  activeOrderTotal: totals.total_amount,
                  activeOrderDiscount: totals.discount_amount,
                  activeOrderOutstandingSubtotal: totals.outstanding_subtotal,
                  activeOrderOutstandingTax: totals.outstanding_tax,
                  activeOrderOutstandingTotal: totals.outstanding_total,
                }
                : {}),
            }));
          },

          assignOrderToTable: (orderId, tableId) => {
            set((state) => ({
              ordersById: {
                ...state.ordersById,
                [orderId]: {
                  ...state.ordersById[orderId],
                  service_location_id: tableId,
                },
              },
            }));
          },

          assignActiveOrderToTable: (tableId) => {
            const { activeOrderId, ordersById } = get();
            if (!activeOrderId) return;

            const orderToAssign = ordersById[activeOrderId]; // O(1) lookup
            if (!orderToAssign || orderToAssign.items.length === 0) {
              console.warn("Cannot assign an empty order to a table.");
              toastService.show({
                title: "Empty Cart",
                message: "Cannot assign an empty order to a table.",
                type: "error",
              });
              return;
            }

            // For dine-in orders, check if the order is paid before assigning
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

            // Create new order for next customer
            const newGlobalOrder: OrderProfile = {
              id: `order_${Date.now()}`,
              service_location_id: null,
              order_status: "draft",
              check_status: "Opened",
              paid_status: "Unpaid",
              items: [],
              opened_at: new Date().toISOString(),
            };

            // Single atomic update
            set((state) => ({
              ordersById: {
                ...state.ordersById,
                [activeOrderId]: {
                  ...state.ordersById[activeOrderId],
                  service_location_id: tableId,
                  order_type: "Dine In" as const,
                  order_status: "preparing" as const,
                },
                [newGlobalOrder.id]: newGlobalOrder,
              },
              orderIds: [...state.orderIds, newGlobalOrder.id],
              activeOrderId: newGlobalOrder.id,
              // Reset active order totals for new empty order
              activeOrderSubtotal: 0,
              activeOrderTax: 0,
              activeOrderTotal: 0,
              activeOrderDiscount: 0,
              activeOrderOutstandingSubtotal: 0,
              activeOrderOutstandingTax: 0,
              activeOrderOutstandingTotal: 0,
            }));

            // Background sync
            const supabase = getOrderStoreSupabaseClient();
            if (supabase && orderToAssign.db_order_id) {
              OrderService.updateOrderStatus(
                supabase,
                orderToAssign.db_order_id,
                "preparing"
              ).catch((err) => console.error("Failed to sync status:", err));
            }
          },

          updateOrderStatus: (orderId, status) => {
            const order = get().ordersById[orderId]; // O(1) lookup

            // Sync to backend in background
            const supabase = getOrderStoreSupabaseClient();
            if (supabase && order?.db_order_id) {
              const dbOrderId = order.db_order_id;
              OrderService.updateOrderStatus(supabase, dbOrderId, status).catch(
                async (err) => {
                  console.error("Failed to sync status:", err);
                  // Queue for offline retry
                  await queueOperation({
                    type: "update_order_status",
                    params: { orderId: dbOrderId, status },
                    localOrderId: orderId,
                  });
                }
              );
            }

            set((state) => ({
              ordersById: {
                ...state.ordersById,
                [orderId]: {
                  ...state.ordersById[orderId],
                  order_status: status,
                  ...(status === "completed" || status === "void"
                    ? { check_status: "Closed" as const }
                    : {}),
                },
              },
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
            const order = get().ordersById[orderId]; // O(1) lookup
            if (!order) return;

            const newPayment = {
              amount,
              method,
              ...(cardBrand && { cardBrand }),
              ...(last4 && { last4 }),
              ...(tipAmount && { tipAmount }),
              ...(transactionDetails && { transactionDetails }),
            };

            const newPayments = [...(order.payments || []), newPayment];

            // Mark items as paid in FIFO order
            let remaining = amount;
            const updatedItems = order.items.map((item) => {
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

            // Calculate totals
            const taxRate =
              useStoreSettingsStore.getState().defaultTaxRate || 8.25;
            const totals = calculateOrderTotals(
              updatedItems,
              order.checkDiscount,
              newPayments,
              taxRate
            );

            // Single atomic update with optimistic payment status
            set((state) => ({
              ordersById: {
                ...state.ordersById,
                [orderId]: {
                  ...state.ordersById[orderId],
                  payments: newPayments,
                  items: updatedItems,
                  total_amount: totals.total_amount,
                  total_tax: totals.tax_amount,
                  total_discount: totals.discount_amount,
                  // Optimistic update: assume payment completes the order
                  paid_status: "Paid" as const,
                  check_status: "Closed" as const,
                },
              },
              ...(orderId === get().activeOrderId
                ? {
                  activeOrderSubtotal: totals.subtotal,
                  activeOrderTax: totals.tax_amount,
                  activeOrderTotal: totals.total_amount,
                  activeOrderDiscount: totals.discount_amount,
                  activeOrderOutstandingSubtotal: totals.outstanding_subtotal,
                  activeOrderOutstandingTax: totals.outstanding_tax,
                  activeOrderOutstandingTotal: totals.outstanding_total,
                }
                : {}),
            }));

            // Background sync (fire-and-forget)
            syncPaymentToBackend(order, {
              amount,
              method,
              tipAmount,
              transactionDetails,
            }).catch((err) =>
              console.error("Background payment sync failed:", err)
            );
          },

          markOrderAsPaid: (orderId: string) => {
            const { ordersById, activeOrderDiscount } = get();
            const order = ordersById[orderId]; // O(1) lookup
            if (!order) return;

            // Trigger inventory depletion when order is paid
            if (
              order.items.length > 0 &&
              order.order_status !== "ready" &&
              order.order_status !== "completed"
            ) {
              useInventoryStore.getState().decrementStockFromSale(order.items);
            }

            // Calculate using sync function
            const taxRate =
              useStoreSettingsStore.getState().defaultTaxRate || 8.25;
            const totals = calculateOrderTotals(
              order.items,
              order.checkDiscount,
              order.payments || [],
              taxRate
            );

            set((state) => ({
              ordersById: {
                ...state.ordersById,
                [orderId]: {
                  ...state.ordersById[orderId],
                  paid_status: "Paid" as const,
                  check_status: "Closed" as const,
                  total_amount: totals.total_amount,
                  total_tax: totals.tax_amount,
                  total_discount: totals.discount_amount,
                },
              },
            }));
          },

          setPendingTableSelection: (tableId) => {
            set({ pendingTableSelection: tableId });
          },

          syncOrderStatus: (orderId) => {
            syncOrderStatus(orderId);
          },

          archiveOrder: (orderId: string) => {
            const { ordersById, orderIds } = get();
            const order = ordersById[orderId];

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
                ((useStoreSettingsStore.getState().defaultTaxRate || 8.25) /
                  100),
            };

            // Save to previous orders
            const { addOrderToHistory } = usePreviousOrdersStore.getState();
            addOrderToHistory(finalOrder);

            // Finally, remove the order from the active orders list
            // Finally, remove the order from the active orders list
            // Update ordersById and orderIds
            const { [orderId]: removed, ...remainingOrdersById } =
              get().ordersById;
            const remainingOrderIds = get().orderIds.filter(
              (id) => id !== orderId
            );

            set((state) => ({
              ordersById: remainingOrdersById,
              orderIds: remainingOrderIds,
              activeOrderId:
                state.activeOrderId === orderId ? null : state.activeOrderId,
            }));

            recalculateTotals(null);

            return tableId;
          },
          setOpenedAt: (orderId, openedAt) => {
            set((state) => ({
              ordersById: {
                ...state.ordersById,
                [orderId]: {
                  ...state.ordersById[orderId],
                  opened_at: openedAt,
                },
              },
            }));
          },
          setClosedAt: (orderId, closedAt) => {
            set((state) => ({
              ordersById: {
                ...state.ordersById,
                [orderId]: {
                  ...state.ordersById[orderId],
                  closed_at: closedAt,
                },
              },
            }));
          },
          markAllItemsAsReady: (orderId) => {
            const { ordersById } = get();
            const order = ordersById[orderId];

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
              ordersById: {
                ...state.ordersById,
                [orderId]: {
                  ...state.ordersById[orderId],
                  items: updatedItems,
                  order_status: "ready" as const,
                },
              },
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
                  console.error(
                    "Failed to update backend order status:",
                    error
                  );
                }
              });
            }
          },

          markAllItemsAsServed: (orderId) => {
            const { ordersById } = get();
            const order = ordersById[orderId];

            if (!order) return;

            // Trigger inventory depletion when all items are marked as served
            if (order.items.length > 0) {
              useInventoryStore.getState().decrementStockFromSale(order.items);
            }

            // Create a new items array where every item's status is "Served"
            const updatedItems = order.items.map((item) => ({
              ...item,
              item_status: "served" as const,
              kitchen_status: "served" as const,
            }));

            set((state) => ({
              ordersById: {
                ...state.ordersById,
                [orderId]: {
                  ...state.ordersById[orderId],
                  items: updatedItems,
                  order_status: "completed" as const,
                },
              },
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
                  console.error(
                    "Failed to update backend order status:",
                    error
                  );
                }
              });
            }
          },
          consolidateOrdersForTables: (tableIds, tableNames) => {
            const { orders, startNewOrder } = get();
            const ordersToMerge = orders.filter(
              (o) =>
                o.service_location_id &&
                tableIds.includes(o.service_location_id)
            );

            const allItems = ordersToMerge.flatMap((o) => o.items);
            const oldOrderIds = ordersToMerge.map((o) => o.id);
            const primaryTableId = tableIds[0];

            // 1. Find the earliest start time ONLY if one already exists.
            const earliestStartTime = ordersToMerge.reduce(
              (earliest: number | null, currentOrder) => {
                if (currentOrder.opened_at) {
                  const currentOpenTime = new Date(
                    currentOrder.opened_at
                  ).getTime();
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
              const newOrdersById = { ...state.ordersById };
              // Remove old orders
              oldOrderIds.forEach((id) => delete newOrdersById[id]);
              // Add new order
              newOrdersById[newMergedOrderData.id] = newMergedOrderData;

              const newOrderIds = state.orderIds.filter(
                (id) => !oldOrderIds.includes(id)
              );
              newOrderIds.push(newMergedOrderData.id);

              return {
                ordersById: newOrdersById,
                orderIds: newOrderIds,
              };
            });

            const finalMergedOrderId = newMergedOrderData.id;
            return finalMergedOrderId;
          },

          fireActiveOrderToKitchen: () => {
            const { activeOrderId, ordersById, orderIds } = get();
            if (!activeOrderId) return;
            const currentOrder = ordersById[activeOrderId];
            if (!currentOrder) return;
            if ((currentOrder.items?.length || 0) === 0) return;
            // If already fired (not in Building), do nothing
            if (currentOrder.order_status !== "draft") return;

            // Calculate updates for local state
            const startTime = currentOrder.opened_at
              ? currentOrder.opened_at
              : new Date().toISOString();

            const updatedItems = currentOrder.items.map((item) => ({
              ...item,
              item_status: "Preparing" as const,
            }));

            const updatedCurrentOrder: OrderProfile = {
              ...currentOrder,
              items: updatedItems,
              order_status: "preparing" as const,
              check_status: "Opened" as const,
              paid_status:
                currentOrder.paid_status === "Paid" ? "Paid" : "Unpaid",
              order_type: currentOrder.order_type,
              opened_at: startTime,
            };

            const newOrder: OrderProfile = {
              id: `order_${Date.now()}`,
              service_location_id: null,
              order_status: "draft",
              check_status: "Opened",
              paid_status: "Unpaid",
              items: [],
              opened_at: new Date().toISOString(),
            };

            set((state) => ({
              ordersById: {
                ...state.ordersById,
                [activeOrderId]: updatedCurrentOrder,
                [newOrder.id]: newOrder,
              },
              orderIds: [...state.orderIds, newOrder.id],
              activeOrderId: newOrder.id,
              // Reset totals synchronously for the new empty order
              activeOrderSubtotal: 0,
              activeOrderTax: 0,
              activeOrderTotal: 0,
              activeOrderDiscount: 0,
              activeOrderOutstandingSubtotal: 0,
              activeOrderOutstandingTax: 0,
              activeOrderOutstandingTotal: 0,
            }));

            // Sync status to backend
            const supabase = getOrderStoreSupabaseClient();
            if (supabase && currentOrder.db_order_id) {
              OrderService.updateOrderStatus(
                supabase,
                currentOrder.db_order_id,
                "preparing"
              ).then(({ error }) => {
                if (error) {
                  // If order is already preparing (e.g. from previous sync), ignore the error
                  if (
                    error.code === "P0001" ||
                    error.message?.includes("already in preparing status")
                  ) {
                    return;
                  }
                  console.error(
                    "Failed to update backend order status:",
                    error
                  );
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
              ordersById: {
                ...state.ordersById,
                [orderId]: {
                  ...state.ordersById[orderId],
                  service_location_id: newTableId,
                },
              },
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
                const isNew =
                  !item.kitchen_status || item.kitchen_status === "new";
                const wasMerged = mergedItemIds.has(item.id);
                // Keep if it's not a new item and was not a merge target
                return !isNew && !wasMerged;
              }),
            ];

            // O(1) update via ordersById
            set((state) => ({
              ordersById: {
                ...state.ordersById,
                [activeOrderId]: {
                  ...state.ordersById[activeOrderId],
                  items: finalCart,
                  order_status: "preparing",
                },
              },
            }));

            // No need to manually update `orders` array - the subscription will handle it.

            // Recalculate totals after merging (if not already handled by subscription/update)
            // Actually, we should probably update totals in the object too if we want them consistent immediately
            // But since we have a pure calculator now, we can do it here:
            // const newTotals = calculateOrderTotals(...);
            // For now, let's keep minimal changes to fix the state status.
            recalculateTotals(activeOrderId);

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
                    console.error(
                      "Failed to update backend order status:",
                      error
                    );
                  }
                });
            }

            toastService.show({
              title: "Items Sent",
              message: `${newItems.length} new item${newItems.length > 1 ? "s" : ""
                } sent to the kitchen.`,
              type: "success",
            });
          },

          sendNewItemsToKitchenForOrder: (orderId: string) => {
            const order = get().ordersById[orderId];
            if (
              !order ||
              order.items.filter(
                (item) => !item.kitchen_status || item.kitchen_status === "new"
              ).length === 0
            ) {
              return; // No new items to send
            }

            const updatedItems = order.items.map((item) => {
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
              order.order_type === "Dine In" && !order.opened_at;

            const updatedOrder: OrderProfile = {
              ...order,
              items: updatedItems,
              order_status: "preparing",
              // Set opened_at timestamp if it's not already set for a Dine In order
              opened_at: shouldStartTimer
                ? new Date().toISOString()
                : order.opened_at,
            };

            // Update state
            set((state) => ({
              ordersById: {
                ...state.ordersById,
                [orderId]: updatedOrder,
              },
            }));

            // Sync to backend
            const supabase = getOrderStoreSupabaseClient();
            if (supabase && order.db_order_id) {
              supabase
                .rpc("update_order_status", {
                  p_order_id: order.db_order_id,
                  p_new_status: "preparing",
                })
                .then(({ error }) => {
                  if (error)
                    console.error("Failed to sync status for order:", error);
                });
            }

            // Show toast after the state update
            toastService.show({
              title: "Items Sent",
              message: "New items have been sent to the kitchen.",
              type: "success",
            });

            recalculateTotals(orderId);
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
            const { archiveOrder, ordersById } = get();
            const order = ordersById[orderId];


            // 1. Update the order's status locally
            set((state) => ({
              ordersById: {
                ...state.ordersById,
                [orderId]: {
                  ...state.ordersById[orderId],
                  order_status: "void",
                  check_status: "Closed",
                  items: state.ordersById[orderId].items.map((item) => ({
                    ...item,
                    is_voided: true,
                    void_reason: "Order voided",
                  })),
                },
              },

              ...(state.activeOrderId === orderId && {
                activeOrderId: null,
                activeOrderSubtotal: 0,
                activeOrderTax: 0,
                activeOrderTotal: 0,
                activeOrderDiscount: 0,
              }),
            }));

            // 2. Sync to backend first (fire-and-forget)
            const supabase = getOrderStoreSupabaseClient();
            if (supabase && order?.db_order_id) {
              OrderService.voidOrder(
                supabase,
                order.db_order_id,
                "Order voided"
              )
                .then(({ error }) => {
                  if (error) {

                    console.error("[useOrderStore.voidOrder] DB error:", error);
                    // Rollback optimistic update on failure
                    set((state) => ({
                      ordersById: {
                        ...state.ordersById,
                        [orderId]: order, // Restore original
                      },
                    }));
                    return false;

                  }
                })
                .catch((err) => console.error("Void order sync failed:", err));
            }
            // 3. Archive the order
            archiveOrder(orderId);
            // Offline mode - queue for sync
            // const syncQueue = get()._syncQueue || [];
            // set({
            //   _syncQueue: [
            //     ...syncQueue,
            //     {
            //       type: "VOID_ORDER",
            //       orderId,
            //       voidReason,
            //       timestamp: Date.now(),
            //     },
            //   ],
            // });
            
            // CRITICAL: Force floor plan refresh after void
            setTimeout(() => {
              useFloorPlanStore.getState().loadFloorPlanStatus();
            }, 100);
            return true;

          },
        };
      },
      {
        name: "order-store-storage",
        storage: createJSONStorage(() => AsyncStorage),
        partialize: (state: OrderState) => ({
          // Persist the optimized structure
          ordersById: state.ordersById,
          orderIds: state.orderIds,
          activeOrderId: state.activeOrderId,
        }),
        onRehydrateStorage: () => {
          return (state, error) => {
            if (error) {
              console.error("Error rehydrating order store:", error);
              return;
            }
            // After hydration, recalculate totals for the active order
            if (state?.activeOrderId) {
              // Small delay to ensure orders array is synced by subscription
              setTimeout(() => {
                useOrderStore.getState().setActiveOrder(state.activeOrderId);
              }, 100);
            }
          };
        },
      }
    )
  )
);

// ERROR FIX: The computed getter for 'orders' inside the store doesn't work because 'this'
// is not bound to the reactive state. We must synchronize the array explicitly.
// This subscription automatically updates 'orders' whenever 'ordersById' changes.
useOrderStore.subscribe(
  (state) => state.ordersById,
  (ordersById) => {
    useOrderStore.setState({ orders: Object.values(ordersById) });
  }
);
