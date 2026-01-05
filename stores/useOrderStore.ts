import { mmkvStorage } from "@/lib/storage";
import { toastService } from "@/lib/toastService";
import { CartItem, Discount, OrderAppliedDiscount, OrderProfile, PaymentType } from "@/lib/types";
import type {
  AddOrderItemParams,
  CreateOrderParams,
  OrderType as DbOrderType
} from "@/types/db-order-management-types";
import { TaxRatesMap } from "@/types/menu";
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

import {
  mapLocalToBackend,
  registerLocalId
} from "@/lib/offlineIdRegistry";
import { queueFailedOperation } from "@/services/offlineSyncInit";
import {
  getIsOnline,
  queueOperation
} from "@/services/offlineSyncService";
import { OrderDiscountService } from "@/services/orderDiscountService";
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
  // Cash pricing totals
  cash_subtotal: number;
  cash_tax_amount: number;
  cash_total_amount: number;
  // Outstanding cash totals (unpaid items using cash pricing)
  cash_outstanding_subtotal: number;
  cash_outstanding_tax: number;
  cash_outstanding_total: number;
}

function round2(num: number): number {
  return Math.round(num * 100) / 100;
}

/**
 * Calculate the effective cash price for a single cart item.
 * This calculates: cash price (base) + size modifier + all modifier options + all add-ons
 * 
 * @param item - The cart item to calculate the price for
 * @returns The effective unit price for the item using cash pricing (before quantity multiplication)
 * 
 * Exported for use in split payment calculations (SplitByItemView, usePaymentStore)
 */
export function calculateItemEffectiveCashPrice(item: CartItem): number {
  // Start with the base/cash price (originalPrice is the cash/base price)
  // Use originalPrice first, then fallback to cashPrice if available, then regular price
  let effectivePrice = item.originalPrice || item.cashPrice || item.price || 0;

  // Add size modifier if present
  if (item.customizations?.size?.priceModifier) {
    effectivePrice += item.customizations.size.priceModifier;
  }

  // Add all modifier options
  if (item.customizations?.modifiers) {
    for (const modifierGroup of item.customizations.modifiers) {
      for (const option of modifierGroup.options) {
        effectivePrice += option.price || 0;
      }
    }
  }

  // Add all add-ons
  if (item.customizations?.addOns) {
    for (const addOn of item.customizations.addOns) {
      effectivePrice += addOn.price || 0;
    }
  }

  return round2(effectivePrice);
}

/**
 * Calculate all order totals - PURE FUNCTION, SYNCHRONOUS
 * This replaces the async recalculateTotals for instant UI updates.
 * Uses per-item tax rates based on tax_category.
 */
function calculateOrderTotals(
  items: CartItem[],
  checkDiscount: Discount | null | undefined,
  payments: { amount: number }[],
  taxRatesMap: TaxRatesMap // Map of tax_category -> rate percentage
): OrderTotals {
  // ============================================================================
  // SINGLE-PASS OPTIMIZATION: Calculate all values in ONE loop iteration
  // Previous: 8 separate loops/reduces = O(8n)
  // Now: 1 loop = O(n)
  // ============================================================================
  
  // First pass accumulators
  let subtotal = 0;
  let itemDiscountsTotal = 0;
  let cash_subtotal = 0;
  
  // We need subtotals first to calculate proportional discounts for taxes
  // So we collect per-item data for the tax calculation phase
  interface ItemTaxData {
    itemSubtotal: number;
    itemCashSubtotal: number;
    unpaidQty: number;
    unpaidSubtotal: number;
    unpaidCashSubtotal: number;
    taxRateDecimal: number;
    isTaxExempt: boolean;
  }
  const itemsData: ItemTaxData[] = [];
  
  // SINGLE PASS: Collect all item data at once
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    
    // Skip voided items
    if (item.is_voided) continue;
    
    // Calculate card price subtotal
    const itemSubtotal = item.price * item.quantity;
    subtotal += itemSubtotal;
    
    // Calculate item-level discounts
    if (item.appliedDiscount) {
      itemDiscountsTotal += item.originalPrice * item.appliedDiscount.value * item.quantity;
    }
    
    // Calculate cash price subtotal
    const effectiveCashPrice = calculateItemEffectiveCashPrice(item);
    const itemCashSubtotal = effectiveCashPrice * item.quantity;
    cash_subtotal += itemCashSubtotal;
    
    // Calculate unpaid quantities
    const unpaidQty = item.quantity - (item.paidQuantity || 0);
    const unpaidSubtotal = unpaidQty > 0 ? unpaidQty * item.price : 0;
    const unpaidCashSubtotal = unpaidQty > 0 ? unpaidQty * effectiveCashPrice : 0;
    
    // Get tax rate
    const taxCategory = item.tax_category || "standard";
    const taxRatePercent = taxRatesMap[taxCategory] ?? 0;
    const taxRateDecimal = taxRatePercent / 100;
    
    // Store for second phase (tax calculations need complete subtotals)
    itemsData.push({
      itemSubtotal,
      itemCashSubtotal,
      unpaidQty,
      unpaidSubtotal,
      unpaidCashSubtotal,
      taxRateDecimal,
      isTaxExempt: item.is_tax_exempt || false,
    });
  }
  
  // Calculate check-level discount
  const subtotalAfterItemDiscounts = subtotal - itemDiscountsTotal;
  let checkDiscountAmount = 0;
  if (checkDiscount) {
    if (checkDiscount.type === "percentage") {
      checkDiscountAmount = subtotalAfterItemDiscounts * checkDiscount.value;
    } else {
      checkDiscountAmount = checkDiscount.value;
    }
  }
  const discount_amount = round2(itemDiscountsTotal + checkDiscountAmount);
  
  // SECOND PHASE: Calculate taxes and outstanding amounts
  // (Needs discount_amount and subtotals from first phase)
  let tax_amount = 0;
  let outstanding_subtotal = 0;
  let outstanding_tax = 0;
  let cash_tax_amount = 0;
  let cash_outstanding_subtotal = 0;
  let cash_outstanding_tax = 0;
  
  for (let i = 0; i < itemsData.length; i++) {
    const data = itemsData[i];
    
    // Skip tax calculation for tax-exempt items
    if (!data.isTaxExempt && data.taxRateDecimal > 0) {
      // Card price tax
      const itemDiscountProportion = subtotal > 0 ? data.itemSubtotal / subtotal : 0;
      const itemDiscountAmount = discount_amount * itemDiscountProportion;
      const itemTaxableAmount = Math.max(0, data.itemSubtotal - itemDiscountAmount);
      tax_amount += itemTaxableAmount * data.taxRateDecimal;
      
      // Cash price tax
      const cashDiscountProportion = cash_subtotal > 0 ? data.itemCashSubtotal / cash_subtotal : 0;
      const cashItemDiscountAmount = discount_amount * cashDiscountProportion;
      const cashItemTaxableAmount = Math.max(0, data.itemCashSubtotal - cashItemDiscountAmount);
      cash_tax_amount += cashItemTaxableAmount * data.taxRateDecimal;
    }
    
    // Outstanding calculations
    if (data.unpaidQty > 0) {
      outstanding_subtotal += data.unpaidSubtotal;
      cash_outstanding_subtotal += data.unpaidCashSubtotal;
      
      if (!data.isTaxExempt && data.taxRateDecimal > 0) {
        // Outstanding card tax
        const outstandingDiscountProportion = subtotal > 0 ? data.unpaidSubtotal / subtotal : 0;
        const outstandingDiscountAmount = discount_amount * outstandingDiscountProportion;
        const outstandingTaxableAmount = Math.max(0, data.unpaidSubtotal - outstandingDiscountAmount);
        outstanding_tax += outstandingTaxableAmount * data.taxRateDecimal;
        
        // Outstanding cash tax
        const cashOutstandingDiscountProportion = cash_subtotal > 0 ? data.unpaidCashSubtotal / cash_subtotal : 0;
        const cashOutstandingDiscountAmount = discount_amount * cashOutstandingDiscountProportion;
        const cashOutstandingTaxableAmount = Math.max(0, data.unpaidCashSubtotal - cashOutstandingDiscountAmount);
        cash_outstanding_tax += cashOutstandingTaxableAmount * data.taxRateDecimal;
      }
    }
  }
  
  // Round all tax values
  tax_amount = round2(tax_amount);
  outstanding_subtotal = round2(outstanding_subtotal);
  outstanding_tax = round2(outstanding_tax);
  cash_tax_amount = round2(cash_tax_amount);
  cash_outstanding_subtotal = round2(cash_outstanding_subtotal);
  cash_outstanding_tax = round2(cash_outstanding_tax);
  
  // Calculate totals
  const taxableAmount = Math.max(0, subtotal - discount_amount);
  const total_amount = round2(taxableAmount + tax_amount);
  
  const proportionOutstanding = subtotal > 0 ? outstanding_subtotal / subtotal : 0;
  const outstandingDiscount = discount_amount * proportionOutstanding;
  const outstandingSubtotalAfterDiscount = outstanding_subtotal - outstandingDiscount;
  const outstanding_total = round2(outstandingSubtotalAfterDiscount + outstanding_tax);
  
  // Cash totals
  const cashTaxableAmount = Math.max(0, cash_subtotal - discount_amount);
  const cash_total_amount = round2(cashTaxableAmount + cash_tax_amount);
  
  const cash_proportionOutstanding = cash_subtotal > 0 ? cash_outstanding_subtotal / cash_subtotal : 0;
  const cash_outstandingDiscount = discount_amount * cash_proportionOutstanding;
  const cash_outstandingSubtotalAfterDiscount = cash_outstanding_subtotal - cash_outstandingDiscount;
  const cash_outstanding_total = round2(cash_outstandingSubtotalAfterDiscount + cash_outstanding_tax);

  return {
    subtotal: round2(subtotal),
    discount_amount,
    tax_amount,
    total_amount,
    outstanding_subtotal,
    outstanding_tax,
    outstanding_total,
    cash_subtotal: round2(cash_subtotal),
    cash_tax_amount,
    cash_total_amount,
    cash_outstanding_subtotal,
    cash_outstanding_tax,
    cash_outstanding_total,
  };
}

// Module-level Supabase client for backend sync
// Components register the client via setOrderStoreSupabaseClient
let _supabaseClient: SupabaseClient | null = null;

export const setOrderStoreSupabaseClient = (client: SupabaseClient | null) => {
  _supabaseClient = client;
};

export const getOrderStoreSupabaseClient = () => _supabaseClient;

// ============================================================================
// PER-ORDER CREATION LOCK - Prevents race conditions when adding items rapidly
// ============================================================================
// Maps local order ID -> Promise that resolves to db_order_id (or null on failure)
// This ensures only ONE order creation happens even when multiple items are added simultaneously
const pendingOrderCreations: Map<string, Promise<string | null>> = new Map();

// Track creation timestamps for deduplication
const orderCreationTimestamps: Map<string, number> = new Map();

// Time after which a stale creation promise should be cleared
const ORDER_CREATION_TIMEOUT_MS = 30000; // 30 seconds

// ============================================================================
// PER-ORDER ITEM ADDITION QUEUE - Serializes item additions to prevent race conditions
// ============================================================================
// Maps local order ID -> Promise chain for sequential item additions
// This prevents overwhelming the database with concurrent item additions and ensures
// calculate_order_totals_fast always sees all previously added items
const pendingItemAdditions: Map<string, Promise<void>> = new Map();

/**
 * Queues an item addition to run after any pending additions complete.
 * This prevents race conditions where concurrent item additions cause
 * order totals to be calculated incorrectly.
 * 
 * Flow:
 * 1. Check if there's an existing queue for this order
 * 2. Chain the new addition to run after the existing queue completes
 * 3. Store the new chain as the current queue
 * 4. Wait for our addition to complete and return the result
 * 
 * @param orderId - The local order ID
 * @param addFn - The function that performs the item addition
 * @returns Promise<boolean> - true if item was added successfully
 */
const queueItemAddition = async (
  orderId: string,
  addFn: () => Promise<boolean>
): Promise<boolean> => {
  // Get existing queue or start with resolved promise
  const existingQueue = pendingItemAdditions.get(orderId) || Promise.resolve();

  let result = false;

  // Chain our addition to run after any pending ones
  const newQueue = existingQueue
    .then(async () => {
      try {
        result = await addFn();
      } catch (error) {
        console.error('[queueItemAddition] Error adding item:', error);
        result = false;
      }
    })
    .catch((error) => {
      console.error('[queueItemAddition] Queue error:', error);
    });

  // Store the new chain
  pendingItemAdditions.set(orderId, newQueue);

  // Wait for our addition to complete
  await newQueue;

  // Clean up the map if the queue is empty (no more pending operations)
  // This prevents memory leaks for orders that are no longer being modified
  const currentQueue = pendingItemAdditions.get(orderId);
  if (currentQueue === newQueue) {
    // We're the last in the chain, safe to clean up after a small delay
    setTimeout(() => {
      if (pendingItemAdditions.get(orderId) === newQueue) {
        pendingItemAdditions.delete(orderId);
      }
    }, 100);
  }

  return result;
};

// Type for the setOrderDbId callback
type SetOrderDbIdFn = (
  localOrderId: string,
  dbOrderId: string,
  orderNumber: string,
  displayNumber: string,
  createdAt: string
) => void;

/**
 * Ensures an order exists in the database, with lock protection against race conditions.
 * 
 * OFFLINE-FIRST BEHAVIOR:
 * - If online and order has db_order_id, returns it immediately
 * - If online and creation in progress, waits for that promise
 * - If online and no creation in progress, creates order and returns db_order_id
 * - If OFFLINE, queues create_order operation and returns a special marker
 *   indicating items should proceed with local ID tracking
 * 
 * @returns db_order_id if successful, "pending_offline" if queued for later,
 *          null if failed (critical error, not just offline)
 */
const ensureOrderCreated = async (
  order: OrderProfile,
  setOrderDbId: SetOrderDbIdFn
): Promise<string | null> => {
  const supabase = _supabaseClient;
  const isNetworkOnline = getIsOnline();

  const selectedStore = useStoreSettingsStore.getState().selectedStore;
  if (!selectedStore) {
    console.log("[ensureOrderCreated] No store selected");
    return null;
  }

  // FAST PATH: Order already has db_order_id
  // Re-check from store in case it was set by another call
  const currentOrder = useOrderStore.getState().ordersById[order.id];
  if (currentOrder?.db_order_id) {
    console.log(`[ensureOrderCreated] Order ${order.id} already has db_order_id: ${currentOrder.db_order_id}`);
    return currentOrder.db_order_id;
  }

  // ========================================================================
  // OFFLINE MODE: Queue order creation and return special marker
  // ========================================================================
  if (!supabase || !isNetworkOnline) {
    console.log("[ensureOrderCreated] ====== OFFLINE MODE ======");
    console.log(`[ensureOrderCreated] Order ID: ${order.id}`);
    console.log(`[ensureOrderCreated] Order Type: ${order.order_type}`);
    console.log(`[ensureOrderCreated] Store: ${selectedStore?.id}`);

    // Check if we've already queued this order
    const existingQueuedOrder = pendingOrderCreations.get(order.id);
    if (existingQueuedOrder) {
      console.log(`[ensureOrderCreated] Already queued - returning pending_offline`);
      return "pending_offline";
    }

    // RACE CONDITION FIX: Set placeholder promise BEFORE queueing to prevent duplicate queues
    // If we set this AFTER queueOperation, another concurrent call could slip through
    pendingOrderCreations.set(order.id, Promise.resolve("pending_offline"));

    // Build the create order params for later execution
    const createOrderParams: CreateOrderParams = {
      p_merchant_id: selectedStore.merchant_id,
      p_location_id: selectedStore.id,
      p_order_type: order.order_type
        ? order.order_type === "Takeaway"
          ? "takeout"
          : order.order_type === "Dine In"
            ? "dine_in"
            : (order.order_type.toLowerCase() as DbOrderType)
        : ("dine_in" as DbOrderType),
      p_table_number: order.service_location_id || undefined,
      p_created_by_staff_id: undefined,
    };

    console.log(`[ensureOrderCreated] Queueing create_order operation...`);
    console.log(`[ensureOrderCreated] Params:`, JSON.stringify(createOrderParams, null, 2));

    // Queue the create_order operation
    const operationId = await queueOperation({
      type: "create_order",
      params: {
        localOrderId: order.id,
        createOrderParams,
      },
      localOrderId: order.id,
      contextSnapshot: {
        order_type: order.order_type,
        service_location_id: order.service_location_id,
        storeId: selectedStore.id,
        merchantId: selectedStore.merchant_id,
      },
    });

    // Mark order as pending sync
    useOrderStore.setState((state) => {
      const existingOrder = state.ordersById[order.id];
      if (!existingOrder) return state;

      return {
        ordersById: {
          ...state.ordersById,
          [order.id]: {
            ...existingOrder,
            sync_status: "pending",
            _offlineOperationId: operationId,
          },
        },
      };
    });

    // Register in ID registry for future lookups
    await registerLocalId(order.id, "order");
    console.log(`[ensureOrderCreated] Registered local ID: ${order.id}`);

    console.log(`[ensureOrderCreated] ====== QUEUED SUCCESSFULLY ======`);
    console.log(`[ensureOrderCreated] Operation ID: ${operationId}`);
    console.log(`[ensureOrderCreated] Local Order ID: ${order.id}`);
    return "pending_offline";
  }

  // ========================================================================
  // ONLINE MODE: Create order normally
  // ========================================================================

  // CHECK FOR EXISTING LOCK: Another call is already creating this order
  const existingPromise = pendingOrderCreations.get(order.id);
  if (existingPromise) {
    // Check if it's a stale promise (older than timeout)
    const creationStarted = orderCreationTimestamps.get(order.id);
    const now = Date.now();

    if (creationStarted && (now - creationStarted) < ORDER_CREATION_TIMEOUT_MS) {
      // Still within timeout - wait for existing promise
      console.log(`[ensureOrderCreated] Waiting for pending creation for order ${order.id} (${Math.round((now - creationStarted) / 1000)}s old)`);
      const result = await existingPromise;
      // After waiting, re-check the store for the db_order_id (it should be set now)
      const updatedOrder = useOrderStore.getState().ordersById[order.id];
      return updatedOrder?.db_order_id || result;
    } else {
      // Stale promise - clear it and retry
      console.log(`[ensureOrderCreated] Clearing stale creation promise for order ${order.id}`);
      pendingOrderCreations.delete(order.id);
      orderCreationTimestamps.delete(order.id);
    }
  }

  // ACQUIRE LOCK: We are the first caller - create the order
  console.log(`[ensureOrderCreated] Acquiring lock and creating order ${order.id}`);

  // Record creation start time for timeout tracking
  orderCreationTimestamps.set(order.id, Date.now());

  const creationPromise = (async (): Promise<string | null> => {
    try {
      // Double-check in case another call snuck in
      const recheckOrder = useOrderStore.getState().ordersById[order.id];
      if (recheckOrder?.db_order_id) {
        return recheckOrder.db_order_id;
      }

      const createOrderParams: CreateOrderParams = {
        p_merchant_id: selectedStore.merchant_id,
        p_location_id: selectedStore.id,
        p_order_type: order.order_type
          ? order.order_type === "Takeaway"
            ? "takeout"
            : order.order_type === "Dine In"
              ? "dine_in"
              : (order.order_type.toLowerCase() as DbOrderType)
          : ("dine_in" as DbOrderType),
        p_table_number: order.service_location_id || undefined,
        p_created_by_staff_id: undefined,
      };

      console.log("[ensureOrderCreated] Creating order with params:", JSON.stringify(createOrderParams, null, 2));

      const { data: createResult, error: createError } = await OrderService.createOrder(supabase, createOrderParams);

      console.log("[ensureOrderCreated] createOrder Result:", createResult);

      if (createError) {
        console.error("[ensureOrderCreated] Failed to create order:", createError);

        // Network error - queue for offline retry
        if (createError.message?.includes("network") || createError.code === "NETWORK_ERROR") {
          console.log("[ensureOrderCreated] Network error - switching to offline mode");

          // Queue the operation for later
          await queueOperation({
            type: "create_order",
            params: {
              localOrderId: order.id,
              createOrderParams,
            },
            localOrderId: order.id,
          });

          await registerLocalId(order.id, "order");
          return "pending_offline";
        }

        return null;
      }

      if (createResult) {
        const orderData = (Array.isArray(createResult) ? createResult[0] : createResult) as any;
        const backendId = orderData.order_id || orderData.id;

        if (backendId) {
          console.log(`[ensureOrderCreated] Order created successfully, ID: ${backendId}`);

          // Update the store with the new db_order_id
          setOrderDbId(
            order.id,
            backendId,
            orderData.order_number,
            orderData.display_number,
            orderData.created_at || new Date().toISOString()
          );

          // Register mapping in ID registry
          await mapLocalToBackend(order.id, backendId);

          return backendId;
        } else {
          console.error("[ensureOrderCreated] createOrder result invalid:", createResult);
          return null;
        }
      }

      console.warn("[ensureOrderCreated] createOrder returned no data and no error");
      return null;
    } finally {
      // RELEASE LOCK: Always clean up, even on error
      pendingOrderCreations.delete(order.id);
      orderCreationTimestamps.delete(order.id);
      console.log(`[ensureOrderCreated] Released lock for order ${order.id}`);
    }
  })();

  // Store the promise so other calls can wait on it
  pendingOrderCreations.set(order.id, creationPromise);

  return creationPromise;
};

// Helper to sync item to backend - OFFLINE-FIRST: Does NOT remove items on failure
const addItemToBackend = async (
  order: OrderProfile,
  item: CartItem,
  setOrderDbId: (
    id: string,
    dbId: string,
    number: string,
    display: string,
    createdAt: string
  ) => void,
  markItemFailed: (itemId: string, error: string) => void, // Changed from removeItem to markItemFailed
  onSyncComplete?: (orderId: string) => void, // Callback after successful sync
  options?: {
    isMerge?: boolean; // If true, update quantity instead of creating new item
    addedQuantity?: number; // The quantity being added (for merge operations)
  }
): Promise<boolean> => {
  const { isMerge = false, addedQuantity = item.quantity } = options || {};
  const supabase = _supabaseClient;
  const isNetworkOnline = getIsOnline();

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

  // ========================================================================
  // OFFLINE MODE: Ensure order is queued first, then queue item
  // ========================================================================
  if (!supabase || !isNetworkOnline) {
    console.log("[addItemToBackend] OFFLINE MODE - Processing item:", item.id);

    // CRITICAL: First ensure the order creation is queued
    // This must happen BEFORE queueing the item
    const orderResult = await ensureOrderCreated(order, setOrderDbId);
    console.log(`[addItemToBackend] OFFLINE - ensureOrderCreated returned: ${orderResult}`);

    // Register item in ID registry for tracking
    await registerLocalId(item.id, "item", order.id);

    // Queue appropriate operation based on merge status
    console.log('[addItemToBackend] item', item);
    
    let itemOpId: string;
    if (isMerge && item.db_order_item_id) {
      // MERGE CASE: Queue quantity update operation
      console.log(`[addItemToBackend] OFFLINE MERGE - Queueing quantity update for: ${item.db_order_item_id}`);
      itemOpId = await queueOperation({
        type: "update_item_quantity",
        params: {
          localOrderId: order.id,
          localItemId: item.id,
          orderItemId: item.db_order_item_id, // Backend UUID for resolved items
          quantity: item.quantity, // New total quantity
        },
        localOrderId: order.id,
        localItemId: item.id,
        contextSnapshot: {
          orderType: order.order_type,
          course: useCoursingStore.getState().getWorkingCourse(order.id) || 1,
        },
      });
    } else {
      // NEW ITEM CASE: Queue add_item operation
      itemOpId = await queueOperation({
        type: "add_item",
        params: {
          localOrderId: order.id,
          localItemId: item.id,
          itemData: {
            menuItemId: item.menuItemId,
            locationExclusiveItemId: item.locationExclusiveItemId,
            name: item.name,
            quantity: item.quantity,
            price: item.price,
            cashPrice: item.cashPrice,
            originalPrice: item.originalPrice,
            customizations: item.customizations,
            category_name: item.category_name,
            is_open_item: item.is_open_item || false,
            open_item_name: item.open_item_name,
            open_item_price: item.open_item_price,
          },
        },
        localOrderId: order.id,
        localItemId: item.id,
        contextSnapshot: {
          orderType: order.order_type,
          course: useCoursingStore.getState().getWorkingCourse(order.id) || 1,
        },
      });
    }

    console.log(`[addItemToBackend] OFFLINE - Item queued: ${item.id} (op: ${itemOpId})`);

    // Mark item as pending sync in store
    useOrderStore.setState((state) => {
      const currentOrder = state.ordersById[order.id];
      if (!currentOrder) return state;

      const updatedItems = currentOrder.items.map((i) =>
        i.id === item.id ? { ...i, sync_status: "pending" as const } : i
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

    return true; // Return true so item stays in cart
  }

  console.log("[addItemToBackend] ONLINE MODE - Syncing item:", item.id);

  try {
    // ========================================================================
    // STEP 1: Ensure order exists in backend (with race condition protection)
    // ========================================================================
    // This uses a per-order lock to prevent multiple simultaneous order creations
    const dbOrderId = await ensureOrderCreated(order, setOrderDbId);

    // ========================================================================
    // HANDLE OFFLINE MODE RESULT FROM ensureOrderCreated
    // ========================================================================
    if (dbOrderId === "pending_offline") {
      console.log("[addItemToBackend] Order is pending offline sync, queueing item");

      // Register item in ID registry
      await registerLocalId(item.id, "item", order.id);

      // Queue the add_item operation (will be processed after order syncs)
      console.log('[addItemToBackend] item', item);

      await queueOperation({
        type: "add_item",
        params: {
          localOrderId: order.id,
          localItemId: item.id,
          itemData: {
            menuItemId: item.menuItemId,
            locationExclusiveItemId: item.locationExclusiveItemId,
            name: item.name,
            quantity: item.quantity,
            price: item.price,
            cashPrice: item.cashPrice,
            originalPrice: item.originalPrice,
            customizations: item.customizations,
            category_name: item.category_name,
          },
        },
        localOrderId: order.id,
        localItemId: item.id,
      });

      // Mark item as pending sync
      useOrderStore.setState((state) => {
        const currentOrder = state.ordersById[order.id];
        if (!currentOrder) return state;

        const updatedItems = currentOrder.items.map((i) =>
          i.id === item.id ? { ...i, sync_status: "pending" as const } : i
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

      return true; // Item is saved locally and queued for sync
    }

    // If order creation failed completely (not just offline), mark item as failed
    if (!dbOrderId) {
      console.error("[addItemToBackend] Order creation failed for order:", order.id);
      markItemFailed(item.id, "Order creation failed");
      await queueOperation({
        type: "add_item",
        params: {
          localOrderId: order.id,
          localItemId: item.id,
          itemData: {
            menuItemId: item.menuItemId,
            name: item.name,
            quantity: item.quantity,
            price: item.price,
            cashPrice: item.cashPrice,
            originalPrice: item.originalPrice,
            customizations: item.customizations,
            category_name: item.category_name,
          },
        },
        localOrderId: order.id,
        localItemId: item.id,
      });
      return false;
    }

    console.log(`[addItemToBackend] Order ${order.id} has db_order_id: ${dbOrderId}`);

    // ========================================================================
    // STEP 2: Add item to the existing order
    // ========================================================================

    // Open item branch
    if (item.is_open_item) {
      const addOpenParams = {
        p_order_id: dbOrderId,
        p_item_name: item.open_item_name || item.name,
        p_unit_price: item.price,
        p_quantity: item.quantity,
        p_special_instructions: item.customizations?.notes || undefined,
        p_is_tax_exempt: item.is_tax_exempt || undefined,
      };

      console.log(
        "[addItemToBackend] add_open_item_v2 params:",
        JSON.stringify(addOpenParams, null, 2)
      );
      const { data: addResult, error: addError } = await OrderService.addOpenItem(
        supabase,
        addOpenParams
      );

      if (addError) {
        console.error("Failed to add open item to backend:", addError);
        markItemFailed(item.id, addError.message || "Item sync failed");
        await queueOperation({
          type: "add_item",
          params: {
            localOrderId: order.id,
            localItemId: item.id,
            dbOrderId: dbOrderId,
            addItemParams: addOpenParams,
            is_open_item: true,
          },
          localOrderId: order.id,
          localItemId: item.id,
        });
        return false;
      }

      console.log("Open item synced to backend successfully:", addResult);

      if (addResult?.order_item_id) {
        useOrderStore.setState((state) => {
          const currentOrder = state.ordersById[order.id];
          if (!currentOrder) return state;

          const updatedItems = currentOrder.items.map((i) =>
            i.id === item.id
              ? {
                ...i,
                db_order_item_id: addResult.order_item_id,
                sync_status: "synced" as const,
              }
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
      }

      if (onSyncComplete) {
        onSyncComplete(order.id);
      }

      return true;
    }

    // ========================================================================
    // Regular menu item path
    // ========================================================================

    // ========================================================================
    // MERGE CASE: Item already exists in backend, just update quantity
    // ========================================================================
    if (isMerge && item.db_order_item_id) {
      console.log(`[addItemToBackend] MERGE MODE - Updating quantity for db_order_item_id: ${item.db_order_item_id}`);
      console.log(`[addItemToBackend] New total quantity: ${item.quantity}`);

      const { data: updateResult, error: updateError } = await OrderService.updateOrderItemQuantity(
        supabase,
        item.db_order_item_id,
        item.quantity // The new total quantity after merge
      );

      if (updateError) {
        console.error("Failed to update item quantity in backend:", updateError);
        markItemFailed(item.id, updateError.message || "Quantity update failed");
        // Queue for retry
        await queueOperation({
          type: "update_item_quantity",
          params: {
            localOrderId: order.id,
            localItemId: item.id,
            orderItemId: item.db_order_item_id, // Backend UUID for resolved items
            quantity: item.quantity,
          },
          localOrderId: order.id,
          localItemId: item.id,
        });
        return false;
      }

      console.log("Item quantity updated in backend successfully:", updateResult);

      // Update sync status to synced
      useOrderStore.setState((state) => {
        const currentOrder = state.ordersById[order.id];
        if (!currentOrder) return state;

        const updatedItems = currentOrder.items.map((i) =>
          i.id === item.id
            ? { ...i, sync_status: "synced" as const }
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

      if (onSyncComplete) {
        onSyncComplete(order.id);
      }

      return true;
    }

    // ========================================================================
    // NEW ITEM CASE: Add new item to backend
    // ========================================================================

    // Calculate effective cash price (base cash price + modifiers + add-ons)
    const effectiveCashPrice = calculateItemEffectiveCashPrice(item);

    // Card price is the effective price per unit (already includes modifiers)
    const cardUnitPrice = item.price;
    console.log('[addItemToBackend] item', item);

    const addItemParams: AddOrderItemParams = {
      p_order_id: dbOrderId,
      p_menu_item_id: item.menuItemId || undefined,
      p_location_exclusive_item_id: item.locationExclusiveItemId || undefined,
      p_quantity: item.quantity,

      // Item details
      p_item_name: item.name,
      p_category_name: item.category_name || "Uncategorized",

      // Prices (per unit, before quantity multiplication)
      p_unit_price: item.price, // Card price per unit (includes modifiers)
      p_cash_unit_price: item.originalPrice || item.cashPrice, // Cash price per unit (includes modifiers)

      // Size details
      p_selected_size_id: item.customizations?.size?.id || undefined,
      p_selected_size_name: item.customizations?.size?.name || undefined,
      p_size_price_modifier:
        item.customizations?.size?.priceModifier || undefined,

      // Instructions
      p_special_instructions: item.customizations?.notes || undefined,

      // Modifiers (pre-calculated prices)
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

      // Kitchen/Coursing
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
      // OFFLINE-FIRST: Keep item, mark as failed, queue for retry
      markItemFailed(item.id, addError.message || "Item sync failed");
      await queueOperation({
        type: "add_item",
        params: {
          localOrderId: order.id,
          localItemId: item.id,
          dbOrderId: dbOrderId,
          addItemParams,
        },
        localOrderId: order.id,
        localItemId: item.id,
      });
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
            ? { ...i, db_order_item_id: addResult.order_item_id, sync_status: "synced" as const }
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
  } catch (error: any) {
    console.error("Backend sync error:", error);
    // OFFLINE-FIRST: Keep item, mark as failed, queue for retry
    markItemFailed(item.id, error?.message || "Sync failed");
    await queueOperation({
      type: "add_item",
      params: {
        localOrderId: order.id,
        localItemId: item.id,
        itemData: {
          menuItemId: item.menuItemId,
          locationExclusiveItemId: item.locationExclusiveItemId,
          name: item.name,
          quantity: item.quantity,
          price: item.price,
          cashPrice: item.cashPrice,
          originalPrice: item.originalPrice,
          customizations: item.customizations,
          category_name: item.category_name,
        },
      },
      localOrderId: order.id,
      localItemId: item.id,
    });
    return false;
  }
};

// Interface for capturing previous state for rollback on sync failure
interface PaymentRollbackState {
  order: OrderProfile;
  activeOrderSubtotal: number;
  activeOrderTax: number;
  activeOrderTotal: number;
  activeOrderDiscount: number;
  activeOrderOutstandingSubtotal: number;
  activeOrderOutstandingTax: number;
  activeOrderOutstandingTotal: number;
  activeOrderTotalCash: number;
  activeOrderOutstandingCash: number;
}

// Backend sync helper - processes payment using process_payment_v2
const syncPaymentToBackend = async (
  order: OrderProfile,
  paymentDetails: {
    amount: number;
    method: PaymentType;
    tipAmount?: number;
    transactionDetails?: Record<string, any>;
    itemIds?: string[]; // Optional: db_order_item_ids for per-item payments
    splitCount?: number; // Optional: split count for split payments
    splitPortionIndex?: number; // Optional: split portion index for split payments
    localPaymentId?: string; // Unique local ID for matching payment during sync
    paymentTimestamp?: string; // Timestamp for fallback matching
  },
  rollbackState?: PaymentRollbackState // Previous state for reversion on failure
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

  // ========================================================================
  // OFFLINE-FIRST: Queue payment for later sync if order not in DB yet
  // ========================================================================
  if (!order.db_order_id) {
    console.log("[syncPaymentToBackend] Order has no db_order_id, queueing payment for later sync");

    const isCash = paymentDetails.method === "Cash";

    // Build terminal response for card payments
    const terminalResponse = !isCash && paymentDetails.transactionDetails
      ? {
        terminal_type: paymentDetails.transactionDetails.terminalType || "manual",
        authorization_code: paymentDetails.transactionDetails.authorizationCode,
        card_type: paymentDetails.transactionDetails.cardType,
        card_last_four: paymentDetails.transactionDetails.last4,
        transaction_id: paymentDetails.transactionDetails.transactionId,
      }
      : null;

    // Build payment params for process_payment_v2 (will be resolved when order syncs)
    const paymentParams = {
      p_order_id: order.id, // Will be resolved to db_order_id at sync time
      p_payment_method: isCash ? "cash" : "card",
      p_amount: paymentDetails.amount,
      p_tip_amount: paymentDetails.tipAmount || 0,
      p_amount_tendered: isCash
        ? paymentDetails.transactionDetails?.amountTendered || paymentDetails.amount
        : null,
      p_item_ids: paymentDetails.itemIds || null,
      p_terminal_response: terminalResponse,
      p_split_count: paymentDetails.splitCount || null,
      p_split_portion_index: paymentDetails.splitPortionIndex || null,
    };

    // Queue unified payment operation (will execute after order syncs)
    await queueOperation({
      type: "process_payment", // Unified payment type for process_payment_v2
      params: {
        params: paymentParams,
        localOrderId: order.id,
        localPaymentId: paymentDetails.localPaymentId, // For matching payment on sync success
        paymentTimestamp: paymentDetails.paymentTimestamp, // Fallback for matching
        terminalResponse, // Pass terminal response for card payments
      },
      localOrderId: order.id,
    });

    console.log(`[syncPaymentToBackend] Payment queued for order ${order.id}`);
    return true; // Return success - payment recorded locally and queued
  }

  try {
    // Determine if this is a cash or card payment
    const isCash = paymentDetails.method === "Cash";
    const paymentMethod = isCash ? "cash" : "card";

    // Build terminal response for card payments
    const terminalResponse = !isCash && paymentDetails.transactionDetails
      ? {
        terminal_type: paymentDetails.transactionDetails.terminalType || "manual",
        authorization_code: paymentDetails.transactionDetails.authorizationCode,
        card_type: paymentDetails.transactionDetails.cardType,
        card_last_four: paymentDetails.transactionDetails.last4,
        transaction_id: paymentDetails.transactionDetails.transactionId,
      }
      : null;

    // Call process_payment_v2 RPC directly
    console.log("[syncPaymentToBackend] Calling process_payment_v2:", {
      orderId: order.db_order_id,
      method: paymentMethod,
      amount: paymentDetails.amount,
      tipAmount: paymentDetails.tipAmount,
      itemIds: paymentDetails.itemIds,
      splitCount: paymentDetails.splitCount,
      splitPortionIndex: paymentDetails.splitPortionIndex,
    });

    const { data, error } = await supabase.rpc("process_payment_v2", {
      p_order_id: order.db_order_id,
      p_payment_method: paymentMethod,
      p_amount: paymentDetails.amount,
      p_tip_amount: paymentDetails.tipAmount || 0,
      p_amount_tendered: isCash
        ? paymentDetails.transactionDetails?.amountTendered || paymentDetails.amount
        : null,
      p_item_ids: paymentDetails.itemIds || null,
      p_terminal_response: terminalResponse,
      p_staff_id: null, // Could get from employee store if needed
      p_split_count: paymentDetails.splitCount || null,
      p_split_portion_index: paymentDetails.splitPortionIndex || null,
    });

    if (error) {
      console.error("[syncPaymentToBackend] Failed to process payment in backend:", error);

      // ========================================================================
      // DON'T REVERT - Keep local state and queue for retry
      // ========================================================================
      // Mark the payment as pending sync using localPaymentId for matching (not array index)
      useOrderStore.setState((state) => {
        const currentOrder = state.ordersById[order.id];
        if (!currentOrder) return state;

        const payments = [...(currentOrder.payments || [])];
        // FIXED: Find payment by localPaymentId or timestamp, not by array index
        // This prevents overwriting the wrong payment when multiple payments sync concurrently
        const paymentIndex = payments.findIndex(
          (p: any) =>
            p.localId === paymentDetails.localPaymentId ||
            p.timestamp === paymentDetails.paymentTimestamp
        );

        if (paymentIndex !== -1) {
          payments[paymentIndex] = {
            ...payments[paymentIndex],
            sync_status: "pending" as const,
            sync_error: error.message || "Sync failed",
            sync_attempt_count: ((payments[paymentIndex] as any).sync_attempt_count || 0) + 1,
          };
        }

        return {
          ordersById: {
            ...state.ordersById,
            [order.id]: { ...currentOrder, payments },
          },
        };
      });

      // Queue for retry - build payment params for process_payment_v2
      const isCash = paymentDetails.method === "Cash";
      const terminalResponse = !isCash && paymentDetails.transactionDetails
        ? {
          terminal_type: paymentDetails.transactionDetails.terminalType || "manual",
          authorization_code: paymentDetails.transactionDetails.authorizationCode,
          card_type: paymentDetails.transactionDetails.cardType,
          card_last_four: paymentDetails.transactionDetails.last4,
          transaction_id: paymentDetails.transactionDetails.transactionId,
        }
        : null;

      const paymentParams = {
        p_order_id: order.db_order_id,
        p_payment_method: isCash ? "cash" : "card",
        p_amount: paymentDetails.amount,
        p_tip_amount: paymentDetails.tipAmount || 0,
        p_amount_tendered: isCash
          ? paymentDetails.transactionDetails?.amountTendered || paymentDetails.amount
          : null,
        p_item_ids: paymentDetails.itemIds || null,
        p_terminal_response: terminalResponse,
        p_split_count: paymentDetails.splitCount || null,
        p_split_portion_index: paymentDetails.splitPortionIndex || null,
      };

      console.log("[syncPaymentToBackend] Queueing payment for retry:", paymentParams);

      await queueOperation({
        type: "process_payment",
        params: {
          params: paymentParams,
          localOrderId: order.id,
          localPaymentId: paymentDetails.localPaymentId, // For matching payment on sync success
          paymentTimestamp: paymentDetails.paymentTimestamp, // Fallback for matching
          terminalResponse,
        },
        localOrderId: order.id,
      });

      toastService.show({
        title: "Payment Saved",
        message: "Payment recorded locally. Will sync when connection restores.",
        type: "warning",
      });

      // Return true - payment is saved locally and queued for sync
      return true;
    }

    // Log successful payment with full response
    console.log("[syncPaymentToBackend] Payment synced successfully:", data);

    // ========================================================================
    // RECONCILE LOCAL STATE WITH BACKEND RESPONSE
    // ========================================================================
    if (data?.success) {
      const activeOrderId = useOrderStore.getState().activeOrderId;

      useOrderStore.setState((state) => {
        const currentOrder = state.ordersById[order.id];
        if (!currentOrder) return state;

        // Update items that were paid (mark paidQuantity)
        let updatedItems = currentOrder.items;
        if (data.items_covered && data.items_covered.length > 0) {
          updatedItems = currentOrder.items.map((item) => {
            if (item.db_order_item_id && data.items_covered.includes(item.db_order_item_id)) {
              return { ...item, paidQuantity: item.quantity }; // Mark as fully paid
            }
            return item;
          });
        }

        // Update the last payment with backend ID, items covered, and sync status
        let updatedPayments = currentOrder.payments || [];
        if (data.payment_id && updatedPayments.length > 0) {
          const lastPaymentIndex = updatedPayments.length - 1;
          updatedPayments = updatedPayments.map((p, i) =>
            i === lastPaymentIndex
              ? {
                ...p,
                id: data.payment_id,
                itemsCovered: data.items_covered || [],
                timestamp: new Date().toISOString(),
                sync_status: "synced" as const,
                sync_error: undefined,
              }
              : p
          );
        }

        return {
          ordersById: {
            ...state.ordersById,
            [order.id]: {
              ...currentOrder,
              items: updatedItems,
              payments: updatedPayments,
              // Backend is source of truth for payment status
              amount_paid: data.order_amount_paid,
              amount_due: data.order_amount_due, // Card price (always source of truth)
              cash_amount_due: data.order_cash_amount_due ?? data.unpaid_cash_total, // Cash price for discount display
              paid_status: data.order_fully_paid ? ("Paid" as const) : ("Pending" as const),
              check_status: data.order_fully_paid ? ("Closed" as const) : ("Opened" as const),
            },
          },
          // Update outstanding totals if this is the active order
          // Use backend's authoritative values for both card and cash outstanding
          ...(order.id === activeOrderId
            ? {
              // Use unpaid_card_total if available, otherwise fall back to order_amount_due
              activeOrderOutstandingTotal: data.unpaid_card_total ?? data.order_amount_due,
              // Use unpaid_cash_total for cash outstanding (always update, not just for cash payments)
              activeOrderOutstandingCash: data.order_cash_amount_due ?? data.unpaid_cash_total ?? data.order_amount_due,
            }
            : {}),
        };
      });
    }

    return true;
  } catch (error) {
    console.error("Backend payment sync error:", error);

    // REVERT OPTIMISTIC STATE ON FAILURE
    if (rollbackState) {
      console.log("[syncPaymentToBackend] Reverting to previous state due to sync error");
      const activeOrderId = useOrderStore.getState().activeOrderId;

      useOrderStore.setState((state) => ({
        ordersById: {
          ...state.ordersById,
          [order.id]: rollbackState.order,
        },
        // Revert active order totals if this was the active order
        ...(order.id === activeOrderId
          ? {
            activeOrderSubtotal: rollbackState.activeOrderSubtotal,
            activeOrderTax: rollbackState.activeOrderTax,
            activeOrderTotal: rollbackState.activeOrderTotal,
            activeOrderDiscount: rollbackState.activeOrderDiscount,
            activeOrderOutstandingSubtotal: rollbackState.activeOrderOutstandingSubtotal,
            activeOrderOutstandingTax: rollbackState.activeOrderOutstandingTax,
            activeOrderOutstandingTotal: rollbackState.activeOrderOutstandingTotal,
            activeOrderTotalCash: rollbackState.activeOrderTotalCash,
            activeOrderOutstandingCash: rollbackState.activeOrderOutstandingCash,
          }
          : {}),
      }));
    }

    toastService.show({
      title: "Payment Failed",
      message: "Failed to sync payment to server. Changes have been reverted.",
      type: "error",
    });
    return false;
  }
};

// Tax calculation is now handled in recalculateTotals using dynamic rate from store settings

interface OrderState {
  // === OPTIMIZED DATA STRUCTURE (O(1) lookup) ===
  ordersById: Record<string, OrderProfile>;
  ordersByDbId: Record<string, OrderProfile>; // O(1) lookup by db_order_id
  orderIds: string[]; // Maintains insertion order for iteration
  activeOrderId: string | null;

  // === BACKWARD COMPATIBLE GETTER ===
  // Consumers can still use: const orders = useOrderStore(state => state.orders)
  orders: OrderProfile[];

  // === OFFLINE SYNC STATE ===
  isOnline: boolean;
  pendingSyncCount: number;

  // === SYNC TRACKING STATE ===
  // Maps itemId -> sync promise for pending operations
  pendingSyncOperations: Map<string, Promise<boolean>>;

  // Sync barrier methods
  hasPendingSyncs: (orderId: string) => boolean;
  waitForPendingSyncs: (orderId: string) => Promise<void>;
  getSyncStatus: (orderId: string) => { pending: number; failed: number; synced: number };
  updateItemSyncStatus: (
    orderId: string,
    itemId: string,
    status: "pending" | "syncing" | "synced" | "failed",
    error?: string
  ) => void;
  registerSyncOperation: (itemId: string, promise: Promise<boolean>) => void;
  unregisterSyncOperation: (itemId: string) => void;

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
  // Cash pricing total (using cash prices + modifiers + add-ons)
  activeOrderTotalCash: number;
  // Outstanding cash totals (unpaid items using cash pricing)
  activeOrderOutstandingCash: number;

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
  removeItemFromActiveOrder: (itemId: string, voidReason?: string) => void;
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
    itemIds?: string[]; // Optional: db_order_item_ids for per-item payments
    splitCount?: number; // Optional: split count for split payments
    splitPortionIndex?: number; // Optional: split portion index for split payments
  }) => Promise<boolean>; // Returns true if sync succeeded, false if failed (state reverted)
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
  sendNewItemsToKitchen: () => Promise<void>;
  sendNewItemsToKitchenForOrder: (orderId: string) => Promise<void>;
  transferOrderToTable: (orderId: string, newTableId: string) => void;
  generateCartItemId: (
    menuItemId: string,
    customizations: CartItem["customizations"],
    isDraft?: boolean
  ) => string;
  deleteOrder: (orderId: string) => void;
  clearCart: () => void;
  voidOrder: (orderId: string) => void;

  // Payment void action - reverts payment and restores items to unpaid
  voidPayment: (orderId: string, paymentIndex: number) => Promise<boolean>;
  voidAllPayments: (orderId: string) => Promise<boolean>;

  // O(1) Getter for order by db_order_id
  getOrderByDbId: (dbOrderId: string) => OrderProfile | undefined;

  // === OFFLINE-FIRST HELPER METHODS ===
  // Update local order with DB order ID after successful sync
  updateOrderDbId: (localOrderId: string, dbOrderId: string) => void;
  // Update local order with backend-generated data after sync (order_number, display_number, etc.)
  updateOrderFromSync: (localOrderId: string, backendData: {
    order_number?: number | string;
    display_number?: string;
    opened_at?: string;
    total_amount?: number;
    total_tax?: number;
    subtotal?: number;
    cash_total?: number;
    cash_tax_amount?: number;
    cash_subtotal?: number;
  }) => void;
  // Update local item with DB item ID after successful sync
  updateItemDbId: (orderId: string, localItemId: string, dbItemId: string) => void;
  // Get all orders that have items with failed sync status
  getOrdersWithFailedSyncs: () => Array<{ localId: string; dbId: string | undefined }>;
  // Update order from reconciliation data
  updateOrderFromReconciliation: (localOrderId: string, updates: Partial<OrderProfile>) => void;
  // Retry failed syncs for an order
  retryFailedSyncs: (orderId: string) => Promise<void>;
  // Sync order from database (manual refresh)
  syncOrderFromDatabase: (orderId: string) => Promise<{ success: boolean; error?: string }>;
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
              // Get tax rates map from store settings for per-item tax calculation
              const storeSettings = useStoreSettingsStore.getState();
              const taxRatesMap = storeSettings.taxRatesMap;

              // Filter out voided items - they should not be included in totals
              const activeItems = activeOrder.items.filter(
                (item) => !item.is_voided
              );

              // Subtotal must reflect modifiers (size/add-ons) captured in item.price
              const subtotal = activeItems.reduce(
                (acc, item) => acc + item.price * item.quantity,
                0
              );

              const itemDiscountsTotal = activeItems.reduce((acc, item) => {
                if (item.appliedDiscount) {
                  return (
                    acc +
                    item.originalPrice *
                    item.appliedDiscount.value *
                    item.quantity
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

              const totalDiscountAmount =
                itemDiscountsTotal + checkDiscountAmount;
              const finalSubtotal = subtotal - totalDiscountAmount;

              // Calculate local tax using per-item tax rates
              let localTax = 0;
              for (const item of activeItems) {
                if (item.is_tax_exempt) continue;
                const taxCategory = item.tax_category || "standard";
                const taxRatePercent = taxRatesMap[taxCategory] ?? 0;
                const taxRateDecimal = taxRatePercent / 100;

                const itemSubtotal = item.price * item.quantity;
                const itemDiscountProportion =
                  subtotal > 0 ? itemSubtotal / subtotal : 0;
                const itemDiscountAmount =
                  totalDiscountAmount * itemDiscountProportion;
                const itemTaxableAmount = Math.max(
                  0,
                  itemSubtotal - itemDiscountAmount
                );

                localTax += itemTaxableAmount * taxRateDecimal;
              }
              let localTotal = finalSubtotal + localTax;

              // If order has a db_order_id, call backend to calculate tax
              let backendTaxAmount: number | undefined;
              const supabase = _supabaseClient;
              if (supabase && activeOrder.db_order_id) {
                try {
                  const { data, error } = await OrderService.calculateOrderTax(
                    supabase,
                    activeOrder.db_order_id
                  );

                  console.log("Backend tax calculation response:", data);

                  if (!error && data && data.success) {
                    backendTaxAmount = data.tax_amount;
                    console.log("Using backend tax:", data.tax_amount);
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

              // Use backend tax if available, otherwise use local calculation
              const tax =
                backendTaxAmount !== undefined ? backendTaxAmount : localTax;
              const total = finalSubtotal + tax;

              // Compute outstanding subtotal (unpaid amount) used for badges/logic
              // Use activeItems (voided items filtered out)
              let outstandingSubtotal = 0;
              let outstandingTax = 0;
              for (const item of activeItems) {
                const unpaidQty = item.quantity - (item.paidQuantity || 0);
                if (unpaidQty <= 0) continue;

                const itemSubtotal = unpaidQty * item.price;
                outstandingSubtotal += itemSubtotal;

                if (!item.is_tax_exempt) {
                  const taxCategory = item.tax_category || "standard";
                  const taxRatePercent = taxRatesMap[taxCategory] ?? 0;
                  const taxRateDecimal = taxRatePercent / 100;

                  const itemDiscountProportion =
                    subtotal > 0 ? itemSubtotal / subtotal : 0;
                  const itemDiscountAmount =
                    totalDiscountAmount * itemDiscountProportion;
                  const itemTaxableAmount = Math.max(
                    0,
                    itemSubtotal - itemDiscountAmount
                  );

                  outstandingTax += itemTaxableAmount * taxRateDecimal;
                }
              }

              // Calculate the final outstanding total, including discounts
              const proportionOfSubtotalOutstanding =
                subtotal > 0 ? outstandingSubtotal / subtotal : 0;
              const outstandingDiscountAmount =
                totalDiscountAmount * proportionOfSubtotalOutstanding;
              const outstandingSubtotalAfterDiscount =
                outstandingSubtotal - outstandingDiscountAmount;
              const outstandingTotal =
                outstandingSubtotalAfterDiscount + outstandingTax;

              // === CASH PRICING CALCULATIONS ===
              // Calculate cash subtotal using cash prices (originalPrice + modifiers + add-ons)
              const cashSubtotal = activeItems.reduce(
                (acc, item) => {
                  const effectiveCashPrice = calculateItemEffectiveCashPrice(item);
                  return acc + effectiveCashPrice * item.quantity;
                },
                0
              );

              // Calculate cash tax (same discount logic, but using cash subtotal)
              let cashTax = 0;
              for (const item of activeItems) {
                if (item.is_tax_exempt) continue;
                const taxCategory = item.tax_category || "standard";
                const taxRatePercent = taxRatesMap[taxCategory] ?? 0;
                const taxRateDecimal = taxRatePercent / 100;

                // Calculate item's taxable amount using cash price
                const effectiveCashPrice = calculateItemEffectiveCashPrice(item);
                const itemCashSubtotal = effectiveCashPrice * item.quantity;

                // Apply proportional discount to this item (based on cash subtotal)
                const itemDiscountProportion = cashSubtotal > 0 ? itemCashSubtotal / cashSubtotal : 0;
                const itemDiscountAmount = totalDiscountAmount * itemDiscountProportion;
                const itemTaxableAmount = Math.max(0, itemCashSubtotal - itemDiscountAmount);

                // Calculate tax for this item
                cashTax += itemTaxableAmount * taxRateDecimal;
              }

              // Calculate cash total (cash subtotal - discount + cash tax)
              const cashTaxableAmount = Math.max(0, cashSubtotal - totalDiscountAmount);
              const cashTotal = cashTaxableAmount + cashTax;

              // Outstanding cash totals (unpaid items only using cash pricing)
              let cashOutstandingSubtotal = 0;
              let cashOutstandingTax = 0;
              for (const item of activeItems) {
                const unpaidQty = item.quantity - (item.paidQuantity || 0);
                if (unpaidQty <= 0) continue;

                // Use cash price for unpaid quantity
                const effectiveCashPrice = calculateItemEffectiveCashPrice(item);
                const itemCashSubtotal = unpaidQty * effectiveCashPrice;
                cashOutstandingSubtotal += itemCashSubtotal;

                if (!item.is_tax_exempt) {
                  const taxCategory = item.tax_category || "standard";
                  const taxRatePercent = taxRatesMap[taxCategory] ?? 0;
                  const taxRateDecimal = taxRatePercent / 100;

                  // Apply proportional discount (based on cash subtotal)
                  const itemDiscountProportion = cashSubtotal > 0 ? itemCashSubtotal / cashSubtotal : 0;
                  const itemDiscountAmount = totalDiscountAmount * itemDiscountProportion;
                  const itemTaxableAmount = Math.max(0, itemCashSubtotal - itemDiscountAmount);

                  cashOutstandingTax += itemTaxableAmount * taxRateDecimal;
                }
              }

              // Calculate the final cash outstanding total, including discounts
              const cashProportionOutstanding =
                cashSubtotal > 0 ? cashOutstandingSubtotal / cashSubtotal : 0;
              const cashOutstandingDiscountAmount =
                totalDiscountAmount * cashProportionOutstanding;
              const cashOutstandingSubtotalAfterDiscount =
                cashOutstandingSubtotal - cashOutstandingDiscountAmount;
              const cashOutstandingTotal =
                cashOutstandingSubtotalAfterDiscount + cashOutstandingTax;

              // Ensure no undefined values propagate
              const safeSubtotal = Number(finalSubtotal) || 0;
              const safeTax = Number(tax) || 0;
              const safeTotal = Number(total) || 0;
              const safeDiscount = Number(totalDiscountAmount) || 0;
              const safeCashTotal = Number(cashTotal) || 0;
              const safeCashOutstandingTotal = Number(cashOutstandingTotal) || 0;

              // RE-CHECK if this order is still the active one AFTER async operations
              // This is crucial because the active order might have changed while we were awaiting
              const stillActiveAfterAsync = orderId === get().activeOrderId;

              // PRIORITY: If order has backend-synced amount_due, use it as the authoritative value
              // Backend is source of truth after payments have been processed
              const hasBackendAmountDue = activeOrder.amount_due !== undefined && activeOrder.amount_due >= 0;
              const finalOutstandingTotal = hasBackendAmountDue ? activeOrder.amount_due : outstandingTotal;
              const finalCashOutstandingTotal = hasBackendAmountDue ? activeOrder.cash_amount_due ?? activeOrder.amount_due : safeCashOutstandingTotal;

              // Only update active order derived state if this order is still the active one
              if (stillActiveAfterAsync) {
                set({
                  activeOrderSubtotal: safeSubtotal,
                  activeOrderTax: safeTax,
                  activeOrderTotal: safeTotal,
                  activeOrderDiscount: safeDiscount,
                  activeOrderOutstandingSubtotal: hasBackendAmountDue ? activeOrder.amount_due! : outstandingSubtotal,
                  activeOrderOutstandingTax: hasBackendAmountDue ? 0 : outstandingTax, // Tax included in backend amount_due
                  activeOrderOutstandingTotal: finalOutstandingTotal,
                  activeOrderTotalCash: safeCashTotal,
                  activeOrderOutstandingCash: finalCashOutstandingTotal,
                });
              }

              // Update order with backend-calculated totals if we got them
              if (backendTaxAmount !== undefined) {
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
                  activeOrderTotalCash: 0,
                  activeOrderOutstandingCash: 0,
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
          ordersByDbId: {}, // O(1) lookup by db_order_id
          orderIds: [],
          activeOrderId: null,
          // Explicitly maintain orders array for reactivity (synced via subscription below)
          orders: [],
          // Offline sync state
          isOnline: true,
          pendingSyncCount: 0,
          // Sync tracking state
          pendingSyncOperations: new Map<string, Promise<boolean>>(),
          activeOrderSubtotal: 0,
          activeOrderTax: 0,
          activeOrderTotal: 0,
          activeOrderDiscount: 0,
          activeOrderOutstandingSubtotal: 0,
          activeOrderOutstandingTax: 0,
          activeOrderOutstandingTotal: 0,
          activeOrderTotalCash: 0,
          activeOrderOutstandingCash: 0,
          pendingTableSelection: null,

          // --- OFFLINE SYNC ACTIONS ---
          setOnlineStatus: (isOnline: boolean) => set({ isOnline }),
          setPendingSyncCount: (count: number) =>
            set({ pendingSyncCount: count }),

          // --- SYNC BARRIER METHODS ---
          hasPendingSyncs: (orderId: string) => {
            const order = get().ordersById[orderId];
            if (!order) return false;
            // Check if any non-draft items have pending or syncing status
            return order.items.some(
              (item) =>
                !item.isDraft &&
                (item.sync_status === "pending" || item.sync_status === "syncing")
            );
          },

          waitForPendingSyncs: async (orderId: string) => {
            const { pendingSyncOperations, ordersById } = get();
            const order = ordersById[orderId];
            if (!order) return;

            // Get all item IDs with pending sync status
            const pendingItemIds = order.items
              .filter(
                (item) =>
                  !item.isDraft &&
                  (item.sync_status === "pending" || item.sync_status === "syncing")
              )
              .map((item) => item.id);

            // Wait for all pending sync operations
            const promises: Promise<boolean>[] = [];
            for (const itemId of pendingItemIds) {
              const promise = pendingSyncOperations.get(itemId);
              if (promise) {
                promises.push(promise);
              }
            }

            if (promises.length > 0) {
              console.log(
                `[SyncBarrier] Waiting for ${promises.length} pending sync operations...`
              );
              await Promise.all(promises);
              console.log("[SyncBarrier] All sync operations completed");
            }
          },

          getSyncStatus: (orderId: string) => {
            const order = get().ordersById[orderId];
            if (!order)
              return { pending: 0, failed: 0, synced: 0 };

            let pending = 0;
            let failed = 0;
            let synced = 0;

            for (const item of order.items) {
              if (item.isDraft) continue; // Skip draft items
              switch (item.sync_status) {
                case "pending":
                case "syncing":
                  pending++;
                  break;
                case "failed":
                  failed++;
                  break;
                case "synced":
                  synced++;
                  break;
                default:
                  // Items without sync_status are treated as synced (legacy items)
                  synced++;
              }
            }

            return { pending, failed, synced };
          },

          updateItemSyncStatus: (
            orderId: string,
            itemId: string,
            status: "pending" | "syncing" | "synced" | "failed",
            error?: string
          ) => {
            set((state) => {
              const order = state.ordersById[orderId];
              if (!order) return state;

              const updatedItems = order.items.map((item) =>
                item.id === itemId
                  ? {
                    ...item,
                    sync_status: status,
                    sync_error: error,
                    sync_retry_count:
                      status === "failed"
                        ? (item.sync_retry_count || 0) + 1
                        : item.sync_retry_count,
                  }
                  : item
              );

              return {
                ordersById: {
                  ...state.ordersById,
                  [orderId]: {
                    ...order,
                    items: updatedItems,
                  },
                },
              };
            });
          },

          registerSyncOperation: (itemId: string, promise: Promise<boolean>) => {
            get().pendingSyncOperations.set(itemId, promise);
          },

          unregisterSyncOperation: (itemId: string) => {
            get().pendingSyncOperations.delete(itemId);
          },

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
            // Convert array to ordersById and ordersByDbId structures
            const ordersById: Record<string, OrderProfile> = {};
            const ordersByDbId: Record<string, OrderProfile> = {};
            const orderIds: string[] = [];
            for (const order of sanitizedOrders) {
              ordersById[order.id] = order;
              if (order.db_order_id) {
                ordersByDbId[order.db_order_id] = order;
              }
              orderIds.push(order.id);
            }
            set({ ordersById, ordersByDbId, orderIds });
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
              activeOrderTotalCash: 0,
              activeOrderOutstandingCash: 0,
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

            // ================================================================
            // FAST PATH: Draft items skip all expensive operations
            // ================================================================
            if (newItem.isDraft) {
              const draftCartItem: CartItem = {
                ...newItem,
                paidQuantity: 0,
                // No kitchen_status or sync_status for drafts
              };
              
              // Single minimal state update - no totals calculation
              set((state) => ({
                ordersById: {
                  ...state.ordersById,
                  [activeOrderId]: {
                    ...state.ordersById[activeOrderId],
                    items: [...state.ordersById[activeOrderId].items, draftCartItem],
                  },
                },
              }));
              return; // Early exit - no sync, no totals
            }

            // ================================================================
            // REGULAR PATH: Non-draft items with deferred totals
            // ================================================================
            const coursingState = useCoursingStore.getState();
            const currentCourse =
              coursingState.getForOrder(activeOrderId)?.workingCourse ?? 1;
            const newItemKey = generateItemCompositeKey(
              newItem.menuItemId,
              newItem.customizations
            );

            let updatedCart: CartItem[] = activeOrder.items;

            // 1. Remove any existing drafts for this MenuItemId
            updatedCart = updatedCart.filter(
              (item) =>
                !(item.isDraft && item.menuItemId === newItem.menuItemId)
            );

            // 2. Find a potential candidate for merging
            const mergeCandidate = updatedCart.find((cartItem) => {
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
              const existingItemKey = generateItemCompositeKey(
                cartItem.menuItemId,
                cartItem.customizations
              );
              return existingItemKey === newItemKey;
            });

            // Track the item ID for sync operations and whether this is a merge
            let syncItemId: string;
            let isMergeOperation = false;
            let mergedItemWithNewQuantity: CartItem | null = null;

            if (mergeCandidate) {
              // 3. Merge: update quantity
              syncItemId = mergeCandidate.id;
              isMergeOperation = true;
              const newQuantity = mergeCandidate.quantity + newItem.quantity;
              
              updatedCart = updatedCart.map((item) => {
                if (item.id === mergeCandidate.id) {
                  const updatedItem = {
                    ...item,
                    quantity: newQuantity,
                    sync_status: "pending" as const,
                  };
                  mergedItemWithNewQuantity = updatedItem;
                  return updatedItem;
                }
                return item;
              });
            } else {
              // 4. New item: add to cart
              syncItemId = newItem.id;
              const newCartItem: CartItem = {
                ...newItem,
                paidQuantity: 0,
                item_status:
                  activeOrder.order_type === "Dine In"
                    ? "preparing"
                    : undefined,
                kitchen_status: "new" as const,
                sync_status: "pending" as const,
              };
              updatedCart = [...updatedCart, newCartItem];
              coursingState.setItemCourse(
                activeOrderId,
                newCartItem.id,
                currentCourse
              );
            }

            // ================================================================
            // STEP 1: Update items IMMEDIATELY (instant UI response)
            // ================================================================
            set((state) => ({
              ordersById: {
                ...state.ordersById,
                [activeOrderId]: {
                  ...state.ordersById[activeOrderId],
                  items: updatedCart,
                },
              },
            }));

            // ================================================================
            // STEP 2: Defer totals calculation to microtask (non-blocking)
            // ================================================================
            const orderIdForTotals = activeOrderId;
            const cartForTotals = updatedCart;
            const discountForTotals = activeOrder.checkDiscount;
            const paymentsForTotals = activeOrder.payments || [];
            
            queueMicrotask(() => {
              const taxRatesMap = useStoreSettingsStore.getState().taxRatesMap;
              const totals = calculateOrderTotals(
                cartForTotals,
                discountForTotals,
                paymentsForTotals,
                taxRatesMap
              );

              // Update totals in a separate setState
              set((state) => {
                // Verify order still exists (might have been deleted)
                if (!state.ordersById[orderIdForTotals]) return state;
                
                return {
                  ordersById: {
                    ...state.ordersById,
                    [orderIdForTotals]: {
                      ...state.ordersById[orderIdForTotals],
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
                  activeOrderTotalCash: totals.cash_total_amount,
                  activeOrderOutstandingCash: totals.cash_outstanding_total,
                };
              });
            });

            // 7. Background sync with promise tracking for sync barriers
            // Use the merged item with updated quantity, or the new item
            const itemToSync = isMergeOperation && mergedItemWithNewQuantity 
              ? mergedItemWithNewQuantity 
              : (mergeCandidate || newItem);

            if (!itemToSync.isDraft) {
              const orderToSync = get().ordersById[activeOrderId];
              if (orderToSync) {
                const updateItemSyncStatusAction = get().updateItemSyncStatus;
                const registerSyncOp = get().registerSyncOperation;
                const unregisterSyncOp = get().unregisterSyncOperation;
                const currentOrderId = activeOrderId;

                // OFFLINE-FIRST: Mark item as failed instead of removing it
                const markItemFailedAction = (itemId: string, error: string) => {
                  updateItemSyncStatusAction(currentOrderId, itemId, "failed", error);
                };

                const setOrderDbIdAction = (
                  orderId: string,
                  dbOrderId: string,
                  orderNumber: string,
                  displayNumber: string,
                  createdAt: string
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
                        // Set opened_at from backend's created_at (when 1st item was added)
                        opened_at:
                          state.ordersById[orderId]?.opened_at || createdAt,
                      },
                    },
                  }));
                };

                // Create and track the sync promise - wrapped in queue to serialize additions
                // Pass isMerge flag for merge candidates that already have db_order_item_id
                const syncPromise = queueItemAddition(currentOrderId, () =>
                  addItemToBackend(
                    orderToSync,
                    itemToSync,
                    setOrderDbIdAction,
                    markItemFailedAction, // Changed from removeItemAction
                    undefined, // No need to recalculate - already done synchronously
                    {
                      isMerge: isMergeOperation && !!itemToSync.db_order_item_id,
                      addedQuantity: newItem.quantity,
                    }
                  )
                )
                  .then((success) => {
                    if (success) {
                      // Update item sync status to synced
                      updateItemSyncStatusAction(
                        currentOrderId,
                        syncItemId,
                        "synced"
                      );
                    } else {
                      // Update item sync status to failed
                      updateItemSyncStatusAction(
                        currentOrderId,
                        syncItemId,
                        "failed",
                        "Backend sync failed"
                      );
                    }
                    return success;
                  })
                  .catch((err) => {
                    console.error("Background sync failed:", err);
                    updateItemSyncStatusAction(
                      currentOrderId,
                      syncItemId,
                      "failed",
                      err?.message || "Unknown error"
                    );
                    return false;
                  })
                  .finally(() => {
                    // Unregister the sync operation when done
                    unregisterSyncOp(syncItemId);
                  });

                // Register the sync promise for barrier tracking
                registerSyncOp(syncItemId, syncPromise);
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
            const taxRatesMap = useStoreSettingsStore.getState().taxRatesMap;
            const totals = calculateOrderTotals(
              updatedItems,
              order.checkDiscount,
              order.payments || [],
              taxRatesMap
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
              activeOrderTotalCash: totals.cash_total_amount,
              activeOrderOutstandingCash: totals.cash_outstanding_total,
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

            // recalculateTotals(activeOrderId);
          },

          removeItemFromActiveOrder: (itemId, voidReason) => {
            const { activeOrderId, ordersById } = get();
            if (!activeOrderId) return;

            const order = ordersById[activeOrderId]; // O(1) lookup
            if (!order) return;

            const itemToHandle = order.items.find((i) => i.id === itemId);
            if (!itemToHandle) return;

            // Check if item is a kitchen item (sent/ready/served) - should mark as voided, not remove
            const isKitchenItem =
              itemToHandle.kitchen_status === "sent" ||
              itemToHandle.kitchen_status === "ready" ||
              itemToHandle.kitchen_status === "served";

            let updatedItems: typeof order.items;

            if (isKitchenItem && !itemToHandle.isDraft) {
              // Kitchen items: mark as voided instead of removing
              updatedItems = order.items.map((i) =>
                i.id === itemId
                  ? {
                    ...i,
                    is_voided: true,
                    void_reason: voidReason || "User voided",
                  }
                  : i
              );
            } else {
              // Draft/new items: remove completely
              updatedItems = order.items.filter((i) => i.id !== itemId);
            }

            // Calculate totals SYNCHRONOUSLY
            const taxRatesMap = useStoreSettingsStore.getState().taxRatesMap;
            const totals = calculateOrderTotals(
              updatedItems,
              order.checkDiscount,
              order.payments || [],
              taxRatesMap
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
              activeOrderTotalCash: totals.cash_total_amount,
              activeOrderOutstandingCash: totals.cash_outstanding_total,
            }));

            // Background sync (fire-and-forget)
            if (itemToHandle?.db_order_item_id && _supabaseClient) {
              const dbItemId = itemToHandle.db_order_item_id;
              const reason = voidReason || "User removed";
              OrderService.voidOrderItem(
                _supabaseClient,
                dbItemId,
                reason
              ).catch(async (err) => {
                console.error("Failed to void item:", err);
                // Queue for offline retry
                await queueOperation({
                  type: "void_item",
                  params: { orderItemId: dbItemId, reason },
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

            const itemToConfirm = order.items.find((i) => i.id === itemId);
            console.log('[confirmDraftItem] itemToConfirm', itemToConfirm)
            if (!itemToConfirm) return;

            const updatedItems = order.items.map((i) =>
              i.id === itemId
                ? {
                  ...i,
                  isDraft: false,
                  kitchen_status: "new" as const,
                  sync_status: "pending" as const,
                }
                : i
            );

            // Calculate totals
            const taxRatesMap = useStoreSettingsStore.getState().taxRatesMap;
            const totals = calculateOrderTotals(
              updatedItems,
              order.checkDiscount,
              order.payments || [],
              taxRatesMap
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
              activeOrderTotalCash: totals.cash_total_amount,
              activeOrderOutstandingCash: totals.cash_outstanding_total,
            }));

            // Sync the confirmed item to backend
            const orderToSync = get().ordersById[activeOrderId];
            if (orderToSync) {
              const updateItemSyncStatusAction = get().updateItemSyncStatus;
              const registerSyncOp = get().registerSyncOperation;
              const unregisterSyncOp = get().unregisterSyncOperation;
              const currentOrderId = activeOrderId;

              // OFFLINE-FIRST: Mark item as failed instead of removing it
              const markItemFailedAction = (itemIdToMark: string, error: string) => {
                updateItemSyncStatusAction(currentOrderId, itemIdToMark, "failed", error);
              };

              const setOrderDbIdAction = (
                orderId: string,
                dbOrderId: string,
                orderNumber: string,
                displayNumber: string,
                createdAt: string
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
                      opened_at:
                        state.ordersById[orderId]?.opened_at || createdAt,
                    },
                  },
                }));
              };

              // Create and track the sync promise - wrapped in queue to serialize additions
              const syncPromise = queueItemAddition(currentOrderId, () =>
                addItemToBackend(
                  orderToSync,
                  { ...itemToConfirm, isDraft: false },
                  setOrderDbIdAction,
                  markItemFailedAction, // Changed from removeItemAction
                  undefined
                )
              )
                .then((success) => {
                  if (success) {
                    updateItemSyncStatusAction(
                      currentOrderId,
                      itemId,
                      "synced"
                    );
                  } else {
                    updateItemSyncStatusAction(
                      currentOrderId,
                      itemId,
                      "failed",
                      "Backend sync failed"
                    );
                  }
                  return success;
                })
                .catch((err) => {
                  console.error("Confirm draft sync failed:", err);
                  updateItemSyncStatusAction(
                    currentOrderId,
                    itemId,
                    "failed",
                    err?.message || "Unknown error"
                  );
                  return false;
                })
                .finally(() => {
                  unregisterSyncOp(itemId);
                });

              // Register the sync promise for barrier tracking
              registerSyncOp(itemId, syncPromise);
            }
          },

          updateActiveOrderDetails: (details) => {
            const { activeOrderId, ordersById } = get();
            if (!activeOrderId) return;

            const order = ordersById[activeOrderId];
            if (!order) return;

            // Update local state immediately
            set((state) => ({
              ordersById: {
                ...state.ordersById,
                [activeOrderId]: {
                  ...state.ordersById[activeOrderId],
                  ...details,
                },
              },
            }));

            // Sync to backend (fire-and-forget, non-blocking)
            const supabase = _supabaseClient;
            if (supabase && order.db_order_id) {
              // Sync customer_name to orders table
              if (details.customer_name !== undefined) {
                supabase
                  .from("orders")
                  .update({ customer_name: details.customer_name, customer_id: details.customer_id })
                  .eq("id", order.db_order_id)
                  .then(({ error }) => {
                    if (error)
                      console.error("Failed to sync customer_name:", error);
                    else console.log("Synced customer_name to backend");
                  });
              }

              // Sync guest_count to table_sessions.party_size
              if (
                details.guest_count !== undefined &&
                order.service_location_id
              ) {
                // Get session ID from the table via floor plan store
                const table =
                  useFloorPlanStore.getState().tablesById[
                  order.service_location_id
                  ];
                const sessionId = table?.session?.id;

                if (sessionId) {
                  supabase
                    .from("table_sessions")
                    .update({ party_size: details.guest_count })
                    .eq("id", sessionId)
                    .then(({ error }) => {
                      if (error)
                        console.error("Failed to sync guest_count:", error);
                      else console.log("Synced guest_count to backend");
                    });
                }
              }
            }
          },

          applyDiscountToCheck: (orderId, discountInput) => {
            console.log('[applyDiscountToCheck] discountInput', discountInput);
            const order = get().ordersById[orderId];
            if (!order) return;

            // Normalize incoming discount
            const isRecord = (discountInput as any).discount_type !== undefined;
            const normalizedDiscount: Discount = isRecord
              ? {
                id: (discountInput as any).id,
                label: (discountInput as any).name,
                value:
                  (discountInput as any).discount_type === "percentage"
                    ? (discountInput as any).discount_value / 100
                    : (discountInput as any).discount_value,
                type:
                  (discountInput as any).discount_type === "percentage"
                    ? "percentage"
                    : "fixed",
              }
              : (discountInput as Discount);

            const taxRatesMap = useStoreSettingsStore.getState().taxRatesMap;
            const totals = calculateOrderTotals(
              order.items,
              normalizedDiscount,
              order.payments || [],
              taxRatesMap
            );

            // Build applied discount metadata for syncing
            const preDiscountSubtotal = totals.subtotal;
            const calculatedAmount = normalizedDiscount.type === "percentage"
              ? preDiscountSubtotal * normalizedDiscount.value
              : normalizedDiscount.value;

            // Get staff ID from employee store
            const staffId = useEmployeeStore.getState().loggedInEmployee?.profileId ?? null;

            // Build discount name
            const discountName = isRecord
              ? (discountInput as any).name ?? normalizedDiscount.label ?? "Discount"
              : normalizedDiscount.label ?? "Discount";

            // Get discount_value in raw form (percentage as 10 for 10%, fixed as dollar amount)
            const rawDiscountValue = isRecord
              ? (discountInput as any).discount_value
              : normalizedDiscount.type === "percentage"
                ? normalizedDiscount.value * 100
                : normalizedDiscount.value;

            const applied: OrderAppliedDiscount = {
              local_id: `discount_${Date.now()}`,
              discount_id: isRecord ? (discountInput as any).id ?? null : null,
              discount_type: normalizedDiscount.type === "percentage" ? "percentage" : "fixed",
              discount_value: rawDiscountValue,
              discount_name: discountName,
              source: "preset",
              calculated_amount: Math.round(calculatedAmount * 100) / 100,
              pre_discount_subtotal: preDiscountSubtotal,
              applied_by_staff_profiles_id: staffId,
              applied_at: new Date().toISOString(),
              sync_status: order.db_order_id ? "pending" : "pending",
            };

            // Update state optimistically
            set((state) => ({
              ordersById: {
                ...state.ordersById,
                [orderId]: {
                  ...state.ordersById[orderId],
                  checkDiscount: normalizedDiscount,
                  applied_discounts: [
                    ...(state.ordersById[orderId].applied_discounts || []).filter(
                      (d) => d.source !== "preset"
                    ),
                    applied,
                  ],
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
                  activeOrderTotalCash: totals.cash_total_amount,
                  activeOrderOutstandingCash: totals.cash_outstanding_total,
                }
                : {}),
            }));

            // Sync via RPC or queue for offline
            const supabase = _supabaseClient;
            const dbOrderId = order.db_order_id;
            const isOnline = getIsOnline();

            if (supabase && dbOrderId && isOnline && staffId) {
              console.log('[applyDiscountToCheck] syncing discount via RPC', applied);
              OrderDiscountService.applyDiscount(supabase, {
                order_id: dbOrderId,
                staff_id: staffId,
                discount_id: applied.discount_id,
                discount_name: discountName,
                discount_type: applied.discount_type,
                discount_value: applied.discount_value,
                source: applied.source as "preset" | "custom" | "promo_code",
                reason: null,
                applied_to_item_ids: null,
                approved_by_staff_id: applied.approved_by_staff_profiles_id ?? null,
              }).then((result) => {
                if (result.success && result.order_discount_id) {
                  // Update local state with backend order_discount_id and mark as synced
                  set((state) => {
                    const existingOrder = state.ordersById[orderId];
                    if (!existingOrder?.applied_discounts) return state;
                    return {
                      ordersById: {
                        ...state.ordersById,
                        [orderId]: {
                          ...existingOrder,
                          applied_discounts: existingOrder.applied_discounts.map((d) =>
                            d.local_id === applied.local_id
                              ? { ...d, order_discount_id: result.order_discount_id, sync_status: "synced" as const }
                              : d
                          ),
                        },
                      },
                    };
                  });
                  console.log('[applyDiscountToCheck] RPC success, order_discount_id:', result.order_discount_id);
                } else if (result.requires_approval) {
                  console.warn('[applyDiscountToCheck] Discount requires manager approval');
                  // Could emit an event or show a toast here
                } else if (!result.success) {
                  console.error('[applyDiscountToCheck] RPC failed:', result.error);
                  // Queue for retry
                  queueOperation({
                    type: "apply_discount",
                    params: {
                      localOrderId: orderId,
                      discount: applied,
                    },
                    localOrderId: orderId,
                  } as any);
                }
              }).catch((err) => {
                console.error("Failed to sync discount via RPC, queueing:", err);
                queueOperation({
                  type: "apply_discount",
                  params: {
                    localOrderId: orderId,
                    discount: applied,
                  },
                  localOrderId: orderId,
                } as any);
              });
            } else {
              // Offline or no db_order_id yet - queue for later
              queueOperation({
                type: "apply_discount",
                params: {
                  localOrderId: orderId,
                  discount: applied,
                },
                localOrderId: orderId,
              } as any);
            }
          },

          removeCheckDiscount: (orderId) => {
            const order = get().ordersById[orderId];
            if (!order) return;

            // Get applied discounts that need to be voided
            const discountsToVoid = (order.applied_discounts || []).filter(
              (d) => d.source === "preset" && d.order_discount_id
            );

            const taxRatesMap = useStoreSettingsStore.getState().taxRatesMap;
            const totals = calculateOrderTotals(
              order.items,
              null,
              order.payments || [],
              taxRatesMap
            );

            // Update state optimistically
            set((state) => ({
              ordersById: {
                ...state.ordersById,
                [orderId]: {
                  ...state.ordersById[orderId],
                  checkDiscount: null,
                  applied_discounts: [],
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
                  activeOrderTotalCash: totals.cash_total_amount,
                  activeOrderOutstandingCash: totals.cash_outstanding_total,
                }
                : {}),
            }));

            // Void discounts on backend
            const supabase = _supabaseClient;
            const dbOrderId = order.db_order_id;
            const staffId = useEmployeeStore.getState().loggedInEmployee?.profileId ?? null;
            const isOnline = getIsOnline();

            if (supabase && dbOrderId && isOnline && staffId && discountsToVoid.length > 0) {
              // Void each synced discount
              for (const discount of discountsToVoid) {
                if (discount.order_discount_id) {
                  OrderDiscountService.voidDiscount(supabase, {
                    order_id: dbOrderId,
                    staff_id: staffId,
                    order_discount_id: discount.order_discount_id,
                    void_reason: null,
                  }).then((result) => {
                    if (!result.success) {
                      console.error('[removeCheckDiscount] Failed to void discount:', result.error);
                    } else {
                      console.log('[removeCheckDiscount] Successfully voided discount:', discount.order_discount_id);
                    }
                  }).catch((err) => {
                    console.error('[removeCheckDiscount] RPC error:', err);
                    // Queue for retry
                    queueOperation({
                      type: "void_discount",
                      params: {
                        localOrderId: orderId,
                        order_discount_id: discount.order_discount_id,
                        void_reason: null,
                      },
                      localOrderId: orderId,
                    } as any);
                  });
                }
              }
            } else if (discountsToVoid.length > 0) {
              // Offline - queue void operations
              for (const discount of discountsToVoid) {
                if (discount.order_discount_id) {
                  queueOperation({
                    type: "void_discount",
                    params: {
                      localOrderId: orderId,
                      order_discount_id: discount.order_discount_id,
                      void_reason: null,
                    },
                    localOrderId: orderId,
                  } as any);
                }
              }
            }
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

            const taxRatesMap = useStoreSettingsStore.getState().taxRatesMap;
            const totals = calculateOrderTotals(
              updatedItems,
              order.checkDiscount,
              order.payments || [],
              taxRatesMap
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
                  activeOrderTotalCash: totals.cash_total_amount,
                  activeOrderOutstandingCash: totals.cash_outstanding_total,
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

            const taxRatesMap = useStoreSettingsStore.getState().taxRatesMap;
            const totals = calculateOrderTotals(
              updatedItems,
              order.checkDiscount,
              order.payments || [],
              taxRatesMap
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
                  activeOrderTotalCash: totals.cash_total_amount,
                  activeOrderOutstandingCash: totals.cash_outstanding_total,
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
              activeOrderTotalCash: 0,
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

          addPaymentToOrder: async ({
            orderId,
            amount,
            method,
            cardBrand,
            last4,
            tipAmount,
            transactionDetails,
            itemIds, // NEW: Optional array of db_order_item_ids for per-item payments
            splitCount, // NEW: Optional split count for split payments
            splitPortionIndex, // NEW: Optional split portion index for split payments
          }) => {
            // ================================================================
            // OFFLINE-FIRST: Process payment locally, sync in background
            // ================================================================
            // We NO LONGER block on pending syncs - payments proceed immediately
            // Local state is updated optimistically, backend sync happens later
            // This allows payments to work even when offline or with slow network

            const order = get().ordersById[orderId]; // O(1) lookup
            if (!order) return false;

            // ================================================================
            // CAPTURE PREVIOUS STATE FOR ROLLBACK ON SYNC FAILURE
            // ================================================================
            const rollbackState: PaymentRollbackState = {
              order: { ...order },
              activeOrderSubtotal: get().activeOrderSubtotal,
              activeOrderTax: get().activeOrderTax,
              activeOrderTotal: get().activeOrderTotal,
              activeOrderDiscount: get().activeOrderDiscount,
              activeOrderOutstandingSubtotal: get().activeOrderOutstandingSubtotal,
              activeOrderOutstandingTax: get().activeOrderOutstandingTax,
              activeOrderOutstandingTotal: get().activeOrderOutstandingTotal,
              activeOrderTotalCash: get().activeOrderTotalCash,
              activeOrderOutstandingCash: get().activeOrderOutstandingCash,
            };

            // Generate unique local ID and timestamp for this payment
            // This is critical for matching payments during sync (prevents collapse issue)
            const localPaymentId = `payment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const paymentTimestamp = new Date().toISOString();

            const newPayment = {
              localId: localPaymentId,  // Unique local identifier for sync matching
              amount,
              method,
              timestamp: paymentTimestamp,
              sync_status: "pending" as const,
              ...(cardBrand && { cardBrand }),
              ...(last4 && { last4 }),
              ...(tipAmount && { tipAmount }),
              ...(transactionDetails && { transactionDetails }),
              // Track split info for reconciliation
              ...(splitPortionIndex && { splitPortionIndex }),
              ...(splitCount && { splitCount }),
              ...(itemIds && { itemsCovered: itemIds }),
            };

            const newPayments = [...(order.payments || []), newPayment];

            // Mark items as paid based on itemIds (per-item) or FIFO order (default)
            let updatedItems: typeof order.items;

            // SPLIT PAYMENT FIX: Always mark PAID items as preparing, not just when order is draft/pending
            // This ensures items paid in subsequent splits (when order is already "preparing") also get updated
            // Each item's status is updated individually based on whether IT is being paid now

            if (itemIds && itemIds.length > 0) {
              // Per-item payment: Mark specific items as paid
              updatedItems = order.items.map((item) => {
                if (item.db_order_item_id && itemIds.includes(item.db_order_item_id)) {
                  // Update this item's status to preparing if it's currently "new"
                  const shouldUpdateThisItem = item.kitchen_status === "new" || !item.kitchen_status;
                  return {
                    ...item,
                    paidQuantity: item.quantity, // Fully paid
                    // Update kitchen and item status for items that haven't been sent yet
                    ...(shouldUpdateThisItem && {
                      kitchen_status: "sent" as const,
                      item_status: "Preparing" as const,
                    }),
                  };
                }
                return item;
              });
            } else {
              // Default FIFO: Mark items as paid in order until amount is exhausted
              let remaining = amount;
              updatedItems = order.items.map((item) => {
                const unitPrice = item.price;
                const unpaidQty = item.quantity - (item.paidQuantity || 0);
                if (remaining <= 0 || unpaidQty <= 0) return item;

                const maxCoverQty = Math.min(
                  unpaidQty,
                  Math.floor(remaining / unitPrice + 1e-6)
                );
                if (maxCoverQty <= 0) return item;
                remaining -= maxCoverQty * unitPrice;
                // Update this item's status to preparing if it's currently "new"
                const shouldUpdateThisItem = item.kitchen_status === "new" || !item.kitchen_status;
                return {
                  ...item,
                  paidQuantity: (item.paidQuantity || 0) + maxCoverQty,
                  // Update kitchen and item status for items that haven't been sent yet
                  ...(shouldUpdateThisItem && {
                    kitchen_status: "sent" as const,
                    item_status: "Preparing" as const,
                  }),
                };
              });
            }

            // Calculate totals
            const taxRatesMap = useStoreSettingsStore.getState().taxRatesMap;
            const totals = calculateOrderTotals(
              updatedItems,
              order.checkDiscount,
              newPayments,
              taxRatesMap
            );

            // Determine if order is fully paid based on outstanding amount
            const isFullyPaid = totals.outstanding_total <= 0.01; // Allow tiny rounding margin

            // Determine new order status:
            // - If order is in "draft" and payment is made, move to "preparing"
            // - If order is already "preparing" or later, keep current status
            // - If order is fully paid, it stays at current status (kitchen flow continues)
            const currentStatus = order.order_status;
            const shouldUpdateToPreparingStatus = currentStatus === "draft" || currentStatus === "pending";
            const newOrderStatus = shouldUpdateToPreparingStatus ? "preparing" : currentStatus;

            // Set opened_at timestamp when transitioning to preparing (if not already set)
            const shouldSetOpenedAt = shouldUpdateToPreparingStatus && !order.opened_at;
            const newOpenedAt = shouldSetOpenedAt ? new Date().toISOString() : order.opened_at;

            // Single atomic update with optimistic payment status
            set((state) => ({
              ordersById: {
                ...state.ordersById,
                [orderId]: {
                  ...state.ordersById[orderId],
                  payments: newPayments,
                  items: updatedItems,
                  total_amount: method === 'Cash' ? totals.cash_total_amount : totals.total_amount,
                  total_tax: method === 'Cash' ? totals.cash_tax_amount : totals.tax_amount,
                  total_discount: totals.discount_amount,
                  // Update order_status to "preparing" if it was in draft/pending
                  order_status: newOrderStatus,
                  // Set opened_at timestamp when transitioning
                  opened_at: newOpenedAt,
                  // Optimistic update based on calculated outstanding
                  paid_status: isFullyPaid ? ("Paid" as const) : ("Pending" as const),
                  check_status: isFullyPaid ? ("Closed" as const) : ("Opened" as const),
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
                  activeOrderTotalCash: totals.cash_total_amount,
                  activeOrderOutstandingCash: totals.cash_outstanding_total,
                }
                : {}),
            }));

            // Sync to backend - await result and return success/failure
            // Pass rollbackState to revert optimistic updates on sync failure
            // For offline/per-item flows, ensure we pass local IDs when db_order_item_id is not available.
            // This allows the offline queue to resolve them later when items sync.
            const paymentItemIds = itemIds
              ? itemIds.map((rawId) => {
                const item = order.items.find(
                  (i) => i.db_order_item_id === rawId || i.id === rawId
                );
                // Prefer backend ID if present, otherwise use local ID
                return item?.db_order_item_id || item?.id || rawId;
              })
              : undefined;

            const syncSuccess = await syncPaymentToBackend(
              order,
              {
                amount,
                method,
                tipAmount,
                transactionDetails,
                itemIds: paymentItemIds, // Pass item IDs for per-item payment tracking (local or backend)
                splitCount, // Pass split count for split payments
                splitPortionIndex, // Pass split portion index for split payments
                localPaymentId, // Unique local ID for matching payment during sync
                paymentTimestamp, // Timestamp for fallback matching
              },
              rollbackState // Previous state for rollback on failure
            );

            return syncSuccess;
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
            const taxRatesMap = useStoreSettingsStore.getState().taxRatesMap;
            const totals = calculateOrderTotals(
              order.items,
              order.checkDiscount,
              order.payments || [],
              taxRatesMap
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
                (() => {
                  // Calculate per-item tax if total_tax not set
                  const taxRatesMap =
                    useStoreSettingsStore.getState().taxRatesMap;
                  let taxSum = 0;
                  for (const item of order.items) {
                    if (item.is_tax_exempt) continue;
                    const taxCategory = item.tax_category || "standard";
                    const taxRatePercent = taxRatesMap[taxCategory] ?? 0;
                    taxSum +=
                      item.price * item.quantity * (taxRatePercent / 100);
                  }
                  return taxSum;
                })(),
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
              activeOrderTotalCash: 0,
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
          sendNewItemsToKitchen: async () => {
            // ================================================================
            // OFFLINE-FIRST: Update local state immediately
            // ================================================================
            // Kitchen operations work with local state - no need to wait for sync
            // Backend status update is queued for later
            // Kitchen display/printer uses local state directly

            const { activeOrderId, ordersById } = get();
            if (!activeOrderId) return;

            const currentOrder = ordersById[activeOrderId];
            if (!currentOrder) return;

            // Work with current local state (no blocking on syncs)
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
            // recalculateTotals(activeOrderId);

            // ================================================================
            // OFFLINE-FIRST: Queue or sync backend operation
            // ================================================================
            // Local state is already updated above - now handle backend sync
            const supabase = getOrderStoreSupabaseClient();
            const isOnlineNow = get().isOnline;

            // Get local item IDs for queuing (will be resolved to db_order_item_ids during sync)
            const localItemIds = newItems.map((item) => item.id);

            if (isOnlineNow && supabase && currentOrder.db_order_id) {
              // Online + order synced: sync immediately
              // Update order status
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
                    // Queue for retry
                    queueFailedOperation(
                      "send_to_kitchen",
                      { localOrderId: activeOrderId, localItemIds },
                      activeOrderId
                    );
                  }
                });

              // Bulk update item statuses to 'sent' with sent_to_kitchen_at timestamp
              const dbItemIds = newItems
                .map((item) => item.db_order_item_id)
                .filter((id): id is string => !!id);

              if (dbItemIds.length > 0) {
                OrderService.bulkUpdateOrderItemStatus(
                  supabase,
                  dbItemIds,
                  "sent"
                ).catch((err) => {
                  console.error("Failed to bulk update item statuses:", err);
                });
              }
            } else {
              // Offline or order not synced: queue for later
              console.log("[sendNewItemsToKitchen] Queueing send_to_kitchen operation for later sync");
              queueFailedOperation(
                "send_to_kitchen",
                { localOrderId: activeOrderId, localItemIds },
                activeOrderId
              );
            }

            toastService.show({
              title: "Items Sent",
              message: `${newItems.length} new item${newItems.length > 1 ? "s" : ""
                } sent to the kitchen.`,
              type: "success",
            });
          },

          sendNewItemsToKitchenForOrder: async (orderId: string) => {
            // ================================================================
            // OFFLINE-FIRST: Update local state immediately
            // ================================================================
            // Kitchen operations work with local state - no need to wait for sync
            // Backend status update is queued for later (fire-and-forget)

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

            // ================================================================
            // OFFLINE-FIRST: Queue or sync backend operation
            // ================================================================
            // Local state is already updated above - now handle backend sync
            const supabase = getOrderStoreSupabaseClient();
            const isOnlineNow = get().isOnline;

            // Get items that need to be sent
            const newItems = order.items.filter(
              (item) => !item.kitchen_status || item.kitchen_status === "new"
            );
            const localItemIds = newItems.map((item) => item.id);

            if (isOnlineNow && supabase && order.db_order_id) {
              // Online + order synced: sync immediately
              // Update order status
              supabase
                .rpc("update_order_status", {
                  p_order_id: order.db_order_id,
                  p_new_status: "preparing",
                })
                .then(({ error }) => {
                  if (error) {
                    console.error("Failed to sync status for order:", error);
                    // Queue for retry
                    queueFailedOperation(
                      "send_to_kitchen",
                      { localOrderId: orderId, localItemIds },
                      orderId
                    );
                  }
                });

              // Bulk update item statuses to 'sent' with sent_to_kitchen_at timestamp
              const dbItemIds = newItems
                .map((item) => item.db_order_item_id)
                .filter((id): id is string => !!id);

              if (dbItemIds.length > 0) {
                OrderService.bulkUpdateOrderItemStatus(
                  supabase,
                  dbItemIds,
                  "sent"
                ).catch((err) => {
                  console.error("Failed to bulk update item statuses:", err);
                });
              }
            } else {
              // Offline or order not synced: queue for later
              console.log("[sendNewItemsToKitchenForOrder] Queueing send_to_kitchen operation for later sync");
              queueFailedOperation(
                "send_to_kitchen",
                { localOrderId: orderId, localItemIds },
                orderId
              );
            }

            // Show toast after the state update
            toastService.show({
              title: "Items Sent",
              message: "New items have been sent to the kitchen.",
              type: "success",
            });

            // recalculateTotals(orderId);
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

          // ============================================================================
          // VOID PAYMENT - Reverts a payment and restores items to unpaid status
          // ============================================================================
          voidPayment: async (orderId: string, paymentIndex: number): Promise<boolean> => {
            const { ordersById, activeOrderId } = get();
            const order = ordersById[orderId];

            if (!order || !order.payments?.[paymentIndex]) {
              console.error("[voidPayment] Order or payment not found");
              return false;
            }

            const paymentToVoid = order.payments[paymentIndex];
            const originalOrder = { ...order };

            // 1. OPTIMISTIC UPDATE: Remove payment and restore paidQuantity
            const updatedPayments = order.payments.filter((_, i) => i !== paymentIndex);

            // Restore paidQuantity for items covered by this payment
            const updatedItems = order.items.map((item) => {
              if (paymentToVoid.itemsCovered?.includes(item.db_order_item_id || "")) {
                return { ...item, paidQuantity: 0 }; // Reset to unpaid
              }
              return item;
            });

            // Recalculate totals after removing payment
            const taxRatesMap = useStoreSettingsStore.getState().taxRatesMap;
            const totals = calculateOrderTotals(
              updatedItems,
              order.checkDiscount,
              updatedPayments,
              taxRatesMap
            );

            // Calculate new amounts
            const newAmountPaid = updatedPayments.reduce((acc, p) => acc + p.amount + (p.tip_amount || 0), 0);
            const newAmountDue = totals.total_amount - newAmountPaid;
            const isStillPaid = newAmountDue < 0.01;

            set((state) => ({
              ordersById: {
                ...state.ordersById,
                [orderId]: {
                  ...order,
                  payments: updatedPayments,
                  items: updatedItems,
                  amount_paid: newAmountPaid,
                  amount_due: newAmountDue,
                  paid_status: isStillPaid ? ("Paid" as const) : ("Pending" as const),
                  check_status: isStillPaid ? ("Closed" as const) : ("Opened" as const),
                },
              },
              // Update active order totals if this is the active order
              ...(orderId === activeOrderId
                ? {
                  activeOrderOutstandingTotal: totals.outstanding_total,
                  activeOrderOutstandingSubtotal: totals.outstanding_subtotal,
                  activeOrderOutstandingTax: totals.outstanding_tax,
                  activeOrderOutstandingCash: totals.cash_outstanding_total,
                }
                : {}),
            }));

            // 2. SYNC TO BACKEND
            const supabase = getOrderStoreSupabaseClient();
            if (supabase && order.db_order_id && paymentToVoid.id) {
              try {
                // Call the void_payment RPC
                const { error } = await supabase.rpc("void_payment", {
                  p_payment_id: paymentToVoid.id,
                  p_void_reason: "User voided from split review",
                });

                if (error) {
                  console.error("[voidPayment] Backend sync failed:", error);
                  // Rollback on failure
                  set((state) => ({
                    ordersById: { ...state.ordersById, [orderId]: originalOrder },
                  }));
                  toastService.show({
                    title: "Void Failed",
                    message: error.message || "Failed to void payment. Please try again.",
                    type: "error",
                  });
                  return false;
                }

                console.log("[voidPayment] Payment voided successfully");
                toastService.show({
                  title: "Payment Voided",
                  message: "Payment has been voided. Items are now available for payment.",
                  type: "success",
                });
                return true;
              } catch (err) {
                console.error("[voidPayment] Error:", err);
                // Rollback on error
                set((state) => ({
                  ordersById: { ...state.ordersById, [orderId]: originalOrder },
                }));
                toastService.show({
                  title: "Void Failed",
                  message: "An error occurred. Please try again.",
                  type: "error",
                });
                return false;
              }
            }

            // If no backend sync needed (no db_order_id or payment.id), just succeed locally
            toastService.show({
              title: "Payment Voided",
              message: "Payment has been voided locally.",
              type: "success",
            });
            return true;
          },

          // Void all payments for an order
          voidAllPayments: async (orderId: string): Promise<boolean> => {
            const { ordersById } = get();
            const order = ordersById[orderId];

            if (!order?.payments?.length) return true;

            // Void each payment in reverse order to maintain index consistency
            for (let i = order.payments.length - 1; i >= 0; i--) {
              const success = await get().voidPayment(orderId, i);
              if (!success) {
                return false; // Stop if any void fails
              }
            }

            return true;
          },

          // O(1) Getter for order by db_order_id
          getOrderByDbId: (dbOrderId: string) => get().ordersByDbId[dbOrderId],

          // === OFFLINE-FIRST HELPER METHODS ===

          // Update local order with DB order ID after successful sync
          updateOrderDbId: (localOrderId: string, dbOrderId: string) => {
            set((state) => {
              const order = state.ordersById[localOrderId];
              if (!order) return state;

              const updatedOrder = {
                ...order,
                db_order_id: dbOrderId,
                sync_status: "synced" as const,
              };

              return {
                ordersById: {
                  ...state.ordersById,
                  [localOrderId]: updatedOrder,
                },
                ordersByDbId: {
                  ...state.ordersByDbId,
                  [dbOrderId]: updatedOrder,
                },
              };
            });
            console.log(`[updateOrderDbId] Updated order ${localOrderId} with db_order_id: ${dbOrderId}`);
          },

          // Update local order with backend-generated data after sync
          updateOrderFromSync: (localOrderId: string, backendData: {
            order_number?: number | string;
            display_number?: string;
            opened_at?: string;
            total_amount?: number;
            total_tax?: number;
            subtotal?: number;
            cash_total?: number;
            cash_tax_amount?: number;
            cash_subtotal?: number;
          }) => {
            set((state) => {
              const order = state.ordersById[localOrderId];
              if (!order) return state;

              // Convert order_number to string if provided (backend returns number)
              const orderNumberStr = backendData.order_number !== undefined
                ? String(backendData.order_number)
                : undefined;

              const updatedOrder: OrderProfile = {
                ...order,
                ...(orderNumberStr !== undefined && { order_number: orderNumberStr }),
                ...(backendData.display_number !== undefined && { display_number: backendData.display_number }),
                ...(backendData.opened_at !== undefined && { opened_at: backendData.opened_at }),
                ...(backendData.total_amount !== undefined && { total_amount: backendData.total_amount }),
                ...(backendData.total_tax !== undefined && { total_tax: backendData.total_tax }),
                ...(backendData.subtotal !== undefined && { subtotal: backendData.subtotal }),
                ...(backendData.cash_total !== undefined && { cash_total: backendData.cash_total }),
                ...(backendData.cash_tax_amount !== undefined && { cash_tax_amount: backendData.cash_tax_amount }),
                ...(backendData.cash_subtotal !== undefined && { cash_subtotal: backendData.cash_subtotal }),
              };

              // Also update ordersByDbId if this order has a db_order_id
              const updatedOrdersByDbId = order.db_order_id
                ? { ...state.ordersByDbId, [order.db_order_id]: updatedOrder }
                : state.ordersByDbId;

              return {
                ordersById: {
                  ...state.ordersById,
                  [localOrderId]: updatedOrder,
                },
                ordersByDbId: updatedOrdersByDbId,
              };
            });
            console.log(`[updateOrderFromSync] Updated order ${localOrderId} with backend data:`, backendData);
          },

          // Update local item with DB item ID after successful sync
          updateItemDbId: (orderId: string, localItemId: string, dbItemId: string) => {
            set((state) => {
              const order = state.ordersById[orderId];
              if (!order) return state;

              const updatedItems = order.items.map((item) =>
                item.id === localItemId
                  ? { ...item, db_order_item_id: dbItemId, sync_status: "synced" as const }
                  : item
              );

              return {
                ordersById: {
                  ...state.ordersById,
                  [orderId]: {
                    ...order,
                    items: updatedItems,
                  },
                },
              };
            });
            console.log(`[updateItemDbId] Updated item ${localItemId} with db_order_item_id: ${dbItemId}`);
          },

          // Get all orders that have items with failed sync status
          getOrdersWithFailedSyncs: () => {
            const { ordersById } = get();
            const ordersWithFailedSyncs: Array<{ localId: string; dbId: string | undefined }> = [];

            for (const orderId of Object.keys(ordersById)) {
              const order = ordersById[orderId];
              const hasFailedItems = order.items.some(
                (item) => item.sync_status === "failed" || item.sync_status === "pending"
              );

              if (hasFailedItems || order.sync_status === "failed") {
                ordersWithFailedSyncs.push({
                  localId: orderId,
                  dbId: order.db_order_id,
                });
              }
            }

            return ordersWithFailedSyncs;
          },

          // Update order from reconciliation data
          updateOrderFromReconciliation: (localOrderId: string, updates: Partial<OrderProfile>) => {
            set((state) => {
              const order = state.ordersById[localOrderId];
              if (!order) return state;

              const updatedOrder = {
                ...order,
                ...updates,
              };

              const newOrdersByDbId = { ...state.ordersByDbId };
              if (updatedOrder.db_order_id) {
                newOrdersByDbId[updatedOrder.db_order_id] = updatedOrder;
              }

              return {
                ordersById: {
                  ...state.ordersById,
                  [localOrderId]: updatedOrder,
                },
                ordersByDbId: newOrdersByDbId,
              };
            });
            console.log(`[updateOrderFromReconciliation] Updated order ${localOrderId}`);
          },

          // Retry failed syncs for an order
          retryFailedSyncs: async (orderId: string) => {
            const { ordersById, updateItemSyncStatus, registerSyncOperation, unregisterSyncOperation } = get();
            const order = ordersById[orderId];
            if (!order) {
              console.log(`[retryFailedSyncs] Order ${orderId} not found`);
              return;
            }

            const failedItems = order.items.filter(
              (item) => item.sync_status === "failed" && !item.isDraft
            );

            if (failedItems.length === 0) {
              console.log(`[retryFailedSyncs] No failed items to retry for order ${orderId}`);
              return;
            }

            console.log(`[retryFailedSyncs] Retrying ${failedItems.length} failed items for order ${orderId}`);

            for (const item of failedItems) {
              // Mark as syncing
              updateItemSyncStatus(orderId, item.id, "syncing");

              // Create the sync promise
              const markItemFailedAction = (itemId: string, error: string) => {
                updateItemSyncStatus(orderId, itemId, "failed", error);
              };

              const setOrderDbIdAction = (
                id: string,
                dbOrderId: string,
                orderNumber: string,
                displayNumber: string,
                createdAt: string
              ) => {
                set((state) => ({
                  ordersById: {
                    ...state.ordersById,
                    [id]: {
                      ...state.ordersById[id],
                      db_order_id: dbOrderId,
                      order_number: orderNumber,
                      display_number: displayNumber,
                      sync_status: "synced" as const,
                      opened_at: state.ordersById[id]?.opened_at || createdAt,
                    },
                  },
                }));
              };

              // Wrapped in queue to serialize additions during retry
              const syncPromise = queueItemAddition(orderId, () =>
                addItemToBackend(
                  order,
                  item,
                  setOrderDbIdAction,
                  markItemFailedAction,
                  undefined
                )
              )
                .then((success) => {
                  if (success) {
                    updateItemSyncStatus(orderId, item.id, "synced");
                  }
                  return success;
                })
                .catch((err) => {
                  console.error(`[retryFailedSyncs] Retry failed for item ${item.id}:`, err);
                  updateItemSyncStatus(orderId, item.id, "failed", err?.message || "Retry failed");
                  return false;
                })
                .finally(() => {
                  unregisterSyncOperation(item.id);
                });

              registerSyncOperation(item.id, syncPromise);
            }
          },

          // ============================================================================
          // MANUAL ORDER SYNC FROM DATABASE
          // ============================================================================
          /**
           * Manually syncs an order from the database to fix local state inconsistencies.
           * Fetches order, items, and payments from DB and updates local state.
           * 
           * @param orderId - The local order ID to sync
           * @returns Promise with success status and optional error message
           */
          syncOrderFromDatabase: async (orderId: string): Promise<{ success: boolean; error?: string }> => {
            const supabase = _supabaseClient;
            if (!supabase) {
              console.log("[syncOrderFromDatabase] No Supabase client available");
              return { success: false, error: "No database connection" };
            }

            const order = get().ordersById[orderId];
            if (!order) {
              return { success: false, error: "Order not found locally" };
            }

            if (!order.db_order_id) {
              return { success: false, error: "Order not synced to database yet" };
            }

            console.log(`[syncOrderFromDatabase] Syncing order ${orderId} (db: ${order.db_order_id})`);

            try {
              // 1. Fetch order from database
              const { data: dbOrder, error: orderError } = await supabase
                .from("orders")
                .select("*")
                .eq("id", order.db_order_id)
                .single();

              if (orderError) {
                console.error("[syncOrderFromDatabase] Order fetch error:", orderError);
                throw new Error(orderError.message);
              }

              if (!dbOrder) {
                throw new Error("Order not found in database");
              }

              // 2. Fetch order items from database
              const { data: dbItems, error: itemsError } = await supabase
                .from("order_items")
                .select("*")
                .eq("order_id", order.db_order_id)
                .eq("is_voided", false);

              if (itemsError) {
                console.error("[syncOrderFromDatabase] Items fetch error:", itemsError);
                throw new Error(itemsError.message);
              }

              // 3. Fetch payments from database
              const { data: dbPayments, error: paymentsError } = await supabase
                .from("order_payments")
                .select("*")
                .eq("order_id", order.db_order_id)
                .eq("status", "captured");

              if (paymentsError) {
                console.error("[syncOrderFromDatabase] Payments fetch error:", paymentsError);
                // Non-fatal - continue without payments
              }

              console.log("[syncOrderFromDatabase] Fetched data:", {
                order: dbOrder,
                items: dbItems?.length || 0,
                payments: dbPayments?.length || 0,
              });

              // 4. Update local state with database values
              set((state) => {
                const localOrder = state.ordersById[orderId];
                if (!localOrder) return state;

                // Map database items to local items format
                // Match by db_order_item_id, update quantities and prices
                const syncedItems = localOrder.items.map((localItem) => {
                  const dbItem = dbItems?.find(
                    (db) => db.id === localItem.db_order_item_id
                  );
                  if (dbItem) {
                    return {
                      ...localItem,
                      quantity: dbItem.quantity,
                      paidQuantity: dbItem.paid_quantity || 0,
                      price: dbItem.unit_price,
                      cashPrice: dbItem.cash_price,
                      is_voided: dbItem.is_voided,
                      sync_status: "synced" as const,
                      sync_error: undefined,
                    };
                  }
                  return localItem;
                });

                // Also add any items from DB that aren't in local state
                const localItemDbIds = new Set(
                  localOrder.items
                    .map((i) => i.db_order_item_id)
                    .filter(Boolean)
                );
                const newItemsFromDb: CartItem[] =
                  dbItems
                    ?.filter((dbItem) => !localItemDbIds.has(dbItem.id))
                    .map((dbItem) => ({
                      id: `db_${dbItem.id}`,
                      db_order_item_id: dbItem.id,
                      menuItemId: dbItem.menu_item_id || "",
                      name: dbItem.item_name || "Unknown Item",
                      price: dbItem.unit_price || 0,
                      cashPrice: dbItem.cash_price || dbItem.unit_price || 0,
                      originalPrice: dbItem.cash_price || dbItem.unit_price || 0,
                      quantity: dbItem.quantity || 1,
                      paidQuantity: dbItem.paid_quantity || 0,
                      category_name: dbItem.category_name || "Uncategorized",
                      is_voided: dbItem.is_voided || false,
                      sync_status: "synced" as const,
                      courseNumber: dbItem.course_number || 1,
                      customizations: {}, // Empty customizations object
                      modifiers: [],
                      addOns: [],
                      // Required CartItem financial fields
                      subtotal: dbItem.subtotal || (dbItem.unit_price * dbItem.quantity) || 0,
                      cashSubtotal: dbItem.cash_subtotal || (dbItem.cash_price * dbItem.quantity) || 0,
                      taxRate: dbItem.tax_rate || 0,
                      taxAmount: dbItem.tax_amount || 0,
                      cashTaxAmount: dbItem.cash_tax_amount || 0,
                    })) || [];

                const allItems = [...syncedItems, ...newItemsFromDb];

                // Map payments from database
                const syncedPayments =
                  dbPayments?.map((p) => ({
                    id: p.id,
                    amount: p.amount,
                    method: (p.payment_method === "card" ? "Card" : "Cash") as PaymentType,
                    cardBrand: p.card_brand,
                    last4: p.card_last4,
                    tip_amount: p.tip_amount,
                    itemsCovered: p.item_ids || [],
                    timestamp: p.created_at,
                    isVoided: p.status === "voided",
                  })) || localOrder.payments;

                // Determine payment status
                const isPaid = dbOrder.payment_status === "paid";
                const isPartiallyPaid =
                  dbOrder.amount_paid > 0 && dbOrder.amount_due > 0;

                return {
                  ordersById: {
                    ...state.ordersById,
                    [orderId]: {
                      ...localOrder,
                      items: allItems,
                      payments: syncedPayments,
                      // Use database as source of truth for financial data
                      amount_paid: dbOrder.amount_paid || 0,
                      amount_due: dbOrder.amount_due || 0,
                      cash_amount_due: dbOrder.cash_total
                        ? dbOrder.cash_total - (dbOrder.amount_paid || 0)
                        : undefined,
                      total_amount: dbOrder.card_total || dbOrder.total_amount,
                      total_tax: dbOrder.card_tax_amount || dbOrder.tax_amount,
                      subtotal: dbOrder.card_subtotal || dbOrder.subtotal,
                      paid_status: isPaid ? ("Paid" as const) : ("Pending" as const),
                      check_status: isPaid ? ("Closed" as const) : ("Opened" as const),
                      sync_status: "synced" as const,
                    },
                  },
                  // Update outstanding totals if this is the active order
                  ...(orderId === state.activeOrderId
                    ? {
                      activeOrderOutstandingTotal: dbOrder.amount_due || 0,
                      activeOrderOutstandingCash: dbOrder.cash_total
                        ? dbOrder.cash_total - (dbOrder.amount_paid || 0)
                        : dbOrder.amount_due || 0,
                      activeOrderTotal: dbOrder.card_total || dbOrder.total_amount || 0,
                      activeOrderTax: dbOrder.card_tax_amount || dbOrder.tax_amount || 0,
                      activeOrderSubtotal: dbOrder.card_subtotal || dbOrder.subtotal || 0,
                    }
                    : {}),
                };
              });

              console.log("[syncOrderFromDatabase] Successfully synced order from database");
              return { success: true };
            } catch (error: any) {
              console.error("[syncOrderFromDatabase] Error:", error);
              return { success: false, error: error?.message || "Sync failed" };
            }
          },
        };
      },
      {
        name: "order-store-storage",
        storage: createJSONStorage(() => mmkvStorage),
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
// This subscription automatically updates 'orders' and 'ordersByDbId' whenever 'ordersById' changes.
useOrderStore.subscribe(
  (state) => state.ordersById,
  (ordersById) => {
    // Sync orders array for backward compatibility
    const orders = Object.values(ordersById);
    // Build ordersByDbId index for O(1) lookup by db_order_id
    const ordersByDbId: Record<string, OrderProfile> = {};
    for (const order of orders) {
      if (order.db_order_id) {
        ordersByDbId[order.db_order_id] = order;
      }
    }
    useOrderStore.setState({ orders, ordersByDbId });
  }
);
