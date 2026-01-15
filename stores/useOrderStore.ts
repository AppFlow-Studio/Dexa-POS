import { mmkvStorage } from "@/lib/storage";
import { toastService } from "@/lib/toastService";
import { CartItem, Discount, OrderAppliedDiscount, OrderProfile, PaymentType } from "@/lib/types";
import type {
  AddOrderItemParams,
  CreateOrderParams,
  OrderType as DbOrderType,
} from "@/types/db-order-management-types";
import { TaxRatesMap } from "@/types/menu";
import type { ItemPaymentAllocation, OrderTotals } from "@/types/order-calculations";
import type { Station } from "@/types/station";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
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
// import {
//   mapLocalToBackend,
//   registerLocalId
// } from "@/lib/offlineIdRegistry";
// Import pure calculation functions from order-calculator module
import { mapLocalToBackend, registerLocalId } from "@/lib/offlineIdRegistry";
import {
  applyPaymentToItems,
  calculateItemEffectiveCashPrice as calculateItemEffectiveCashPriceFromModule,
  calculateOrderTotals as calculateOrderTotalsFromModule,
  calculatePaidStatus,
  distributeDiscountToItems as distributeDiscountToItemsFromModule,
  invalidateCalculationCache
} from "@/lib/order-calculator";
import { queueFailedOperation } from "@/services/offlineSyncInit";
import {
  getIsOnline,
  queueOperation
} from "@/services/offlineSyncService";
import { OrderDiscountService } from "@/services/orderDiscountService";
import { paymentPreviewService } from "@/services/paymentPreviewService";
import {
  mapOrderType,
  mapPaymentStatus,
  normalizeFetchedOrder,
  transformBroadcastItems,
  transformBroadcastToOrder,
  type FetchedOrderData,
} from "@/utils/orderTransformers";
import { useSyncStatusStore } from "./useSyncStatusStore";
// import { queueFailedOperation } from "@/services/offlineSyncInit";
// import { getIsOnline, queueOperation } from "@/services/offlineSyncService";
import {
  BroadcastOrderData,
  OrderBroadcastPayload,
} from "@/hooks/realtime/useOrdersRealtime";
import { OrderService } from "@/services/orderService";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useFloorPlanStore } from "./useFloorPlanStore";
// Phase 6: Conflict detection imports
import {
  detectConflict
} from "@/services/conflictDetectionService";
import { useConflictStore } from "@/stores/useConflictStore";
import {
  generateConflictToast,
  isConflictCritical
} from "@/types/conflict-resolution";

// ============================================================================
// PURE CALCULATION FUNCTIONS (Delegating to order-calculator module)
// ============================================================================
// NOTE: The actual implementations are in @/lib/order-calculator.ts
// These re-exports maintain backward compatibility for existing imports.

/**
 * Calculate the effective cash price for a single cart item.
 * @see @/lib/order-calculator.ts for implementation
 * @deprecated Import from @/lib/order-calculator instead
 */
export const calculateItemEffectiveCashPrice = calculateItemEffectiveCashPriceFromModule;

/**
 * Calculate paid_status PURELY from the order's payments array.
 * @see @/lib/order-calculator.ts for implementation
 * @deprecated Import from @/lib/order-calculator instead
 */
export const calculatePaidStatusFromPayments = calculatePaidStatus;

/**
 * Distribute an order-level discount proportionally to individual items.
 * @see @/lib/order-calculator.ts for implementation
 * @deprecated Import from @/lib/order-calculator instead
 */
export const distributeDiscountToItems = distributeDiscountToItemsFromModule;

/**
 * Calculate all order totals - PURE FUNCTION, SYNCHRONOUS
 * This is a wrapper around the module function for backward compatibility.
 * @see @/lib/order-calculator.ts for implementation
 */
function calculateOrderTotals(
  items: CartItem[],
  checkDiscount: Discount | null | undefined,
  payments: { amount: number }[],
  taxRatesMap: TaxRatesMap
): OrderTotals {
  return calculateOrderTotalsFromModule({
    items,
    checkDiscount: checkDiscount ?? null,
    taxRatesMap,
    payments,
  });
}

// ============================================================================
// HELPER FUNCTIONS FOR ITEM SYNC AND BROADCAST
// ============================================================================

/**
 * Transform backend OrderItemModifier[] to CartItem modifiers format.
 * Groups modifiers by modifier_group_name into categories with options.
 */
function transformBackendModifiers(
  backendModifiers: Array<{
    modifier_item_id: string;
    modifier_name: string;
    modifier_group_id: string;
    modifier_group_name: string;
    price_modifier: number;
    quantity: number;
  }> | undefined
): CartItem['customizations']['modifiers'] {
  if (!backendModifiers || backendModifiers.length === 0) return undefined;

  const grouped = new Map<string, {
    categoryId: string;
    categoryName: string;
    options: { id: string; name: string; price: number }[];
  }>();

  for (const mod of backendModifiers) {
    const groupKey = mod.modifier_group_name;

    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, {
        categoryId: mod.modifier_group_id || groupKey,
        categoryName: mod.modifier_group_name,
        options: [],
      });
    }

    // Handle quantity > 1 by adding option multiple times
    for (let i = 0; i < mod.quantity; i++) {
      grouped.get(groupKey)!.options.push({
        id: mod.modifier_item_id,
        name: mod.modifier_name,
        price: mod.price_modifier,
      });
    }
  }

  return Array.from(grouped.values());
}

/**
 * Detect if item-level data has changed between local and backend.
 * Checks subtotals, tax amounts, quantities, modifiers (not just item counts).
 *
 * Performance: O(n) single pass with early exit.
 * Used by: noMeaningfulChange check in broadcast handler.
 */
function hasItemLevelChanges(
  localItems: CartItem[],
  backendItems: BroadcastOrderData["order_items"] | undefined
): boolean {
  if (!backendItems || localItems.length !== backendItems.length) {
    return true;
  }

  // Build map of backend items by db ID for O(1) lookup
  const backendMap = new Map<string, NonNullable<BroadcastOrderData["order_items"]>[0]>();
  for (const bItem of backendItems) {
    backendMap.set(bItem.id, bItem);
  }

  // Check each local item against backend
  for (const localItem of localItems) {
    if (!localItem.db_order_item_id) {
      continue; // Pending item (not yet synced), skip comparison
    }

    const backendItem = backendMap.get(localItem.db_order_item_id);
    if (!backendItem) {
      return true; // Item missing from backend (shouldn't happen)
    }

    // Compare critical financial fields (backend is source of truth)
    if (
      localItem.quantity !== backendItem.quantity ||
      localItem.subtotal !== backendItem.subtotal ||
      localItem.cashSubtotal !== backendItem.cash_subtotal ||
      localItem.taxAmount !== backendItem.tax_amount ||
      localItem.cashTaxAmount !== backendItem.cash_tax_amount
    ) {
      return true; // Financial data differs
    }

    // Check modifier structure (count comparison, not deep equality)
    const localModCount = localItem.customizations?.modifiers?.reduce(
      (sum, group) => sum + group.options.length,
      0
    ) ?? 0;
    const backendModCount = backendItem.modifiers?.length ?? 0;

    if (localModCount !== backendModCount) {
      return true; // Modifier count changed
    }
  }

  return false; // No meaningful item-level changes detected
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

// ============================================================================
// DRAFT ORDER CLEANUP CONFIGURATION
// ============================================================================
const DRAFT_CLEANUP_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const DRAFT_CLEANUP_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
let draftCleanupInterval: NodeJS.Timeout | null = null;

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
/**
 * PERFORMANCE FIX: Run item additions in parallel instead of serializing.
 *
 * Previous behavior: Serialized all additions (5 items = 5× network latency)
 * New behavior: Run additions concurrently (5 items ≈ 1× network latency)
 *
 * This is safe because:
 * 1. ensureOrderCreated() already handles order creation race conditions
 * 2. Each item addition is atomic at the database level (single RPC call)
 * 3. Item IDs are unique, so concurrent additions don't conflict
 *
 * We still track pending additions for waitForPendingSyncs() to work.
 */
const queueItemAddition = async (
  orderId: string,
  addFn: () => Promise<boolean>
): Promise<boolean> => {
  // Track this addition in the pending map (for sync barrier support)
  const additionPromise = (async () => {
    try {
      return await addFn();
    } catch (error) {
      console.error("[queueItemAddition] Error adding item:", error);
      return false;
    }
  })();

  // Store the promise (overwrites previous, but that's fine - we only need to track "any pending")
  pendingItemAdditions.set(orderId, additionPromise);

  // Run immediately without waiting for other additions
  const result = await additionPromise;

  // Clean up after completion (with small delay to prevent race with other additions)
  setTimeout(() => {
    const current = pendingItemAdditions.get(orderId);
    if (current === additionPromise) {
      pendingItemAdditions.delete(orderId);
    }
  }, 50);

  return result;
};

// Type for the setOrderDbId callback
type SetOrderDbIdFn = (
  localOrderId: string,
  dbOrderId: string,
  orderNumber: string,
  displayNumber: string,
  createdAt: string,
  syncVersion?: number
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
    console.log(
      `[ensureOrderCreated] Order ${order.id} already has db_order_id: ${currentOrder.db_order_id}`
    );
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
      console.log(
        `[ensureOrderCreated] Already queued - returning pending_offline`
      );
      return "pending_offline";
    }

    // RACE CONDITION FIX: Set placeholder promise BEFORE queueing to prevent duplicate queues
    // If we set this AFTER queueOperation, another concurrent call could slip through
    pendingOrderCreations.set(order.id, Promise.resolve("pending_offline"));

    // Build the create order params for later execution
    // NOTE: Pass null (not undefined) for all optional params so Supabase RPC includes them
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
      p_table_number: order.service_location_id || null,
      p_customer_name: null,
      p_customer_phone: null,
      p_special_instructions: null,
      p_device_id: null,
      p_created_by_staff_id: useEmployeeStore.getState().loggedInEmployee?.profileId || null,
      p_station_id: useStoreSettingsStore.getState().selectedStation?.id || null,
    };

    console.log(`[ensureOrderCreated] Queueing create_order operation...`);
    console.log(
      `[ensureOrderCreated] Params:`,
      JSON.stringify(createOrderParams, null, 2)
    );

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

    if (creationStarted && now - creationStarted < ORDER_CREATION_TIMEOUT_MS) {
      // Still within timeout - wait for existing promise
      console.log(
        `[ensureOrderCreated] Waiting for pending creation for order ${
          order.id
        } (${Math.round((now - creationStarted) / 1000)}s old)`
      );
      const result = await existingPromise;
      // After waiting, re-check the store for the db_order_id (it should be set now)
      const updatedOrder = useOrderStore.getState().ordersById[order.id];
      return updatedOrder?.db_order_id || result;
    } else {
      // Stale promise - clear it and retry
      console.log(
        `[ensureOrderCreated] Clearing stale creation promise for order ${order.id}`
      );
      pendingOrderCreations.delete(order.id);
      orderCreationTimestamps.delete(order.id);
    }
  }

  // ACQUIRE LOCK: We are the first caller - create the order
  console.log(
    `[ensureOrderCreated] Acquiring lock and creating order ${order.id}`
  );

  // Record creation start time for timeout tracking
  orderCreationTimestamps.set(order.id, Date.now());

  const creationPromise = (async (): Promise<string | null> => {
    try {
      // Double-check in case another call snuck in
      const recheckOrder = useOrderStore.getState().ordersById[order.id];
      if (recheckOrder?.db_order_id) {
        return recheckOrder.db_order_id;
      }

      // NOTE: Pass null (not undefined) for all optional params so Supabase RPC includes them
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
        p_table_number: order.service_location_id || null,
        p_customer_name: null,
        p_customer_phone: null,
        p_special_instructions: null,
        p_device_id: null,
        p_created_by_staff_id: useEmployeeStore.getState().loggedInEmployee?.profileId || null,
        p_station_id: useStoreSettingsStore.getState().selectedStation?.id || null,
     
      };

      console.log(
        "[ensureOrderCreated] Creating order with params:",
        JSON.stringify(createOrderParams, null, 2)
      );

      const { data: createResult, error: createError } =
        await OrderService.createOrder(supabase, createOrderParams);

      console.log("[ensureOrderCreated] createOrder Result:", createResult);

      if (createError) {
        console.error(
          "[ensureOrderCreated] Failed to create order:",
          createError
        );

        // Network error - queue for offline retry
        if (
          createError.message?.includes("network") ||
          createError.code === "NETWORK_ERROR"
        ) {
          console.log(
            "[ensureOrderCreated] Network error - switching to offline mode"
          );

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
        const orderData = (
          Array.isArray(createResult) ? createResult[0] : createResult
        ) as any;
        const backendId = orderData.order_id || orderData.id;

        if (backendId) {
          console.log(
            `[ensureOrderCreated] Order created successfully, ID: ${backendId}`
          );

          // Update the store with the new db_order_id
          setOrderDbId(
            order.id,
            backendId,
            orderData.order_number,
            orderData.display_number,
            orderData.created_at || new Date().toISOString(),
            orderData.sync_version // Pass sync_version from backend response
          );

          // Register mapping in ID registry
          await mapLocalToBackend(order.id, backendId);

          return backendId;
        } else {
          console.error(
            "[ensureOrderCreated] createOrder result invalid:",
            createResult
          );
          return null;
        }
      }

      console.warn(
        "[ensureOrderCreated] createOrder returned no data and no error"
      );
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
    console.log(
      `[addItemToBackend] OFFLINE - ensureOrderCreated returned: ${orderResult}`
    );

    // Register item in ID registry for tracking
    await registerLocalId(item.id, "item", order.id);

    // Queue appropriate operation based on merge status
    console.log('[addItemToBackend] item 1', item);
    
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
            unitPrice: item.baseCardPrice ?? item.price,
            cashPrice: item.baseCashPrice,
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

    console.log(
      `[addItemToBackend] OFFLINE - Item queued: ${item.id} (op: ${itemOpId})`
    );

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
      console.log(
        "[addItemToBackend] Order is pending offline sync, queueing item"
      );

      // Register item in ID registry
      await registerLocalId(item.id, "item", order.id);

      // Queue the add_item operation (will be processed after order syncs)
      console.log('[addItemToBackend] item 2', item);

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
            price: item.baseCardPrice,
            cashPrice: item.baseCashPrice,
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
      console.error(
        "[addItemToBackend] Order creation failed for order:",
        order.id
      );
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
            price: item.baseCardPrice,
            cashPrice: item.baseCashPrice,
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

    console.log(
      `[addItemToBackend] Order ${order.id} has db_order_id: ${dbOrderId}`
    );

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
        // Phase 7D: Set sync status in dedicated store (not on item)
        useSyncStatusStore.getState().setSyncStatus(item.id, "synced");

        // Invalidate calculation cache after item sync
        invalidateCalculationCache();

        // Apply any queued backend updates now that local sync is complete
        useOrderStore.getState().applyQueuedUpdates(order.id);
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

      // Phase 7D: Set sync status in dedicated store (not on item)
      // No need to update ordersById here - quantity is already correct
      useSyncStatusStore.getState().setSyncStatus(item.id, "synced");

      // Invalidate calculation cache after item quantity update
      invalidateCalculationCache();

      // Apply any queued backend updates now that local sync is complete
      useOrderStore.getState().applyQueuedUpdates(order.id);

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
    console.log('[addItemToBackend] item 3', item);
    console.log('[addItemToBackend] effectiveCashPrice (base + modifiers):', effectiveCashPrice);
    console.log('[addItemToBackend] item.originalPrice (base only):', item.originalPrice);
    console.log('[addItemToBackend] item.cashPrice (base only):', item.cashPrice);

    const addItemParams: AddOrderItemParams = {
      p_order_id: dbOrderId,
      p_menu_item_id: item.menuItemId || undefined,
      p_location_exclusive_item_id: item.locationExclusiveItemId || undefined,
      p_quantity: item.quantity,

      // Item details
      p_item_name: item.name,
      p_category_name: item.category_name || "Uncategorized",

      // Prices (per unit, before quantity multiplication)
      p_unit_price: item.baseCardPrice ?? item.originalPrice, // Card base price (modifiers added by backend)
      p_cash_unit_price: item.baseCashPrice || item.originalPrice, // Cash base price (modifiers added by backend)

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
            ? {
                ...i,
                db_order_item_id: addResult.order_item_id,
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
      // Phase 7D: Set sync status in dedicated store (not on item)
      useSyncStatusStore.getState().setSyncStatus(item.id, "synced");

      // Invalidate calculation cache after new item added
      invalidateCalculationCache();

      // Apply any queued backend updates now that local sync is complete
      useOrderStore.getState().applyQueuedUpdates(order.id);

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
          price: item.baseCardPrice,
          cashPrice: item.baseCashPrice,
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
    itemAllocations?: { itemId: string; quantity: number; amount?: number }[]; // Per-item allocations with quantities
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
    console.log(
      "[syncPaymentToBackend] Order has no db_order_id, queueing payment for later sync"
    );

    const isCash = paymentDetails.method === "Cash";

    // Build terminal response for card payments
    const terminalResponse =
      !isCash && paymentDetails.transactionDetails
        ? {
            terminal_type:
              paymentDetails.transactionDetails.terminalType || "manual",
            authorization_code:
              paymentDetails.transactionDetails.authorizationCode,
            card_type: paymentDetails.transactionDetails.cardType,
            card_last_four: paymentDetails.transactionDetails.last4,
            transaction_id: paymentDetails.transactionDetails.transactionId,
          }
        : null;

    // Build item allocations for per-item payments (convert to backend format)
    const itemAllocations = paymentDetails.itemAllocations?.map(alloc => ({
      order_item_id: alloc.itemId,
      quantity: alloc.quantity,
      amount: alloc.amount,
    })) || null;

    // Build payment params for process_payment_v2 (will be resolved when order syncs)
    const paymentParams = {
      p_order_id: order.id, // Will be resolved to db_order_id at sync time
      p_payment_method: isCash ? "cash" : "card",
      p_amount: paymentDetails.amount,
      p_tip_amount: paymentDetails.tipAmount || 0,
      p_amount_tendered: isCash
        ? paymentDetails.transactionDetails?.amountTendered ||
          paymentDetails.amount
        : null,
      p_item_allocations: itemAllocations,
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
    const terminalResponse =
      !isCash && paymentDetails.transactionDetails
        ? {
            terminal_type:
              paymentDetails.transactionDetails.terminalType || "manual",
            authorization_code:
              paymentDetails.transactionDetails.authorizationCode,
            card_type: paymentDetails.transactionDetails.cardType,
            card_last_four: paymentDetails.transactionDetails.last4,
            transaction_id: paymentDetails.transactionDetails.transactionId,
          }
        : null;

    // Build item allocations for per-item payments (convert to backend format)
    // Filter out undefined amount values to avoid JSON serialization issues
    const itemAllocationsForRpc = paymentDetails.itemAllocations?.map(alloc => ({
      order_item_id: alloc.itemId,
      quantity: alloc.quantity,
      ...(alloc.amount !== undefined && { amount: alloc.amount }),
    })) || null;

    // Call process_payment_v2 RPC directly
    console.log("[syncPaymentToBackend] Calling process_payment_v5:", {
      orderId: order.db_order_id,
      method: paymentMethod,
      amount: paymentDetails.amount,
      tipAmount: paymentDetails.tipAmount,
      itemAllocations: itemAllocationsForRpc,
      splitCount: paymentDetails.splitCount,
      splitPortionIndex: paymentDetails.splitPortionIndex,
    });

    const { data, error } = await supabase.rpc("process_payment_v5", {
      p_order_id: order.db_order_id,
      p_payment_method: paymentMethod,
      p_amount: paymentDetails.amount,
      p_tip_amount: paymentDetails.tipAmount || 0,
      p_amount_tendered: isCash
        ? paymentDetails.transactionDetails?.amountTendered ||
          paymentDetails.amount
        : null,
      p_item_allocations: itemAllocationsForRpc,
      p_terminal_response: terminalResponse,
      p_staff_id: null, // Could get from employee store if needed
      p_split_count: paymentDetails.splitCount || null,
      p_split_portion_index: paymentDetails.splitPortionIndex || null,
    });

    if (error) {
      console.error(
        "[syncPaymentToBackend] Failed to process payment in backend:",
        error
      );

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
      const isCashRetry = paymentDetails.method === "Cash";
      const terminalResponseRetry = !isCashRetry && paymentDetails.transactionDetails
        ? {
          terminal_type: paymentDetails.transactionDetails.terminalType || "manual",
          authorization_code: paymentDetails.transactionDetails.authorizationCode,
          card_type: paymentDetails.transactionDetails.cardType,
          card_last_four: paymentDetails.transactionDetails.last4,
          transaction_id: paymentDetails.transactionDetails.transactionId,
        }
        : null;

      // Build item allocations for retry
      const itemAllocationsRetry = paymentDetails.itemAllocations?.map(alloc => ({
        order_item_id: alloc.itemId,
        quantity: alloc.quantity,
        amount: alloc.amount,
      })) || null;

      const paymentParams = {
        p_order_id: order.db_order_id,
        p_payment_method: isCashRetry ? "cash" : "card",
        p_amount: paymentDetails.amount,
        p_tip_amount: paymentDetails.tipAmount || 0,
        p_amount_tendered: isCashRetry
          ? paymentDetails.transactionDetails?.amountTendered || paymentDetails.amount
          : null,
        p_item_allocations: itemAllocationsRetry,
        p_terminal_response: terminalResponseRetry,
        p_split_count: paymentDetails.splitCount || null,
        p_split_portion_index: paymentDetails.splitPortionIndex || null,
      };

      console.log(
        "[syncPaymentToBackend] Queueing payment for retry:",
        paymentParams
      );

      await queueOperation({
        type: "process_payment",
        params: {
          params: paymentParams,
          localOrderId: order.id,
          localPaymentId: paymentDetails.localPaymentId, // For matching payment on sync success
          paymentTimestamp: paymentDetails.paymentTimestamp, // Fallback for matching
          terminalResponse: terminalResponseRetry,
        },
        localOrderId: order.id,
      });

      toastService.show({
        title: "Payment Saved",
        message:
          "Payment recorded locally. Will sync when connection restores.",
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

        // DON'T re-increment paidQuantity here - addPaymentToOrder already did the optimistic update
        // The sync function should only update payment records, not re-apply item changes
        // This prevents the double-counting bug where paidQuantity gets incremented twice
        let updatedItems = currentOrder.items;

        // Only update items if backend returns authoritative paid_quantity values (error recovery/sync)
        // This handles edge cases where optimistic update might have been wrong
        if (data.updated_items && Array.isArray(data.updated_items) && data.updated_items.length > 0) {
          const backendItemMap = new Map<string, number>(
            data.updated_items.map((item: { id: string; paid_quantity: number }) =>
              [item.id, item.paid_quantity] as [string, number]
            )
          );
          updatedItems = currentOrder.items.map((item) => {
            const backendPaidQty = backendItemMap.get(item.db_order_item_id || "");
            if (typeof backendPaidQty === "number") {
              return { ...item, paidQuantity: backendPaidQty };
            }
            return item;
          });
        }

        // Update the last payment with backend ID and sync status
        // Keep local itemsCovered (with quantities) instead of backend's items_covered (just IDs)
        let updatedPayments = currentOrder.payments || [];
        if (data.payment_id && updatedPayments.length > 0) {
          const lastPaymentIndex = updatedPayments.length - 1;
          updatedPayments = updatedPayments.map((p, i) =>
            i === lastPaymentIndex
              ? {
                ...p,
                id: data.payment_id,
                // Keep existing itemsCovered (with quantities) from optimistic update
                // Only set from backend if local is missing
                itemsCovered: p.itemsCovered || (data.items_covered?.map((id: string) => ({ itemId: id, quantity: 1 })) ?? []),
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
              paid_status: data.order_fully_paid ? ("Paid" as const) : ("Partial" as const),
              check_status: currentOrder.check_status || "Opened",
              // PRESERVE order_status - payment sync should not affect kitchen/preparation status
              order_status: data.order_status || currentOrder.order_status,
            },
          },
          // Update outstanding totals if this is the active order
          // Use backend's authoritative values for both card and cash outstanding
          ...(order.id === activeOrderId
            ? {
                // Use unpaid_card_total if available, otherwise fall back to order_amount_due
                activeOrderOutstandingTotal:
                  data.unpaid_card_total ?? data.order_amount_due,
                // Use unpaid_cash_total for cash outstanding (always update, not just for cash payments)
                activeOrderOutstandingCash:
                  data.order_cash_amount_due ??
                  data.unpaid_cash_total ??
                  data.order_amount_due,
              }
            : {}),
        };
      });

      // Invalidate calculation cache after successful payment sync
      invalidateCalculationCache();

      // Apply any queued backend updates now that payment sync is complete
      useOrderStore.getState().applyQueuedUpdates(order.id);

      console.log('[OrderStore] Cache invalidated after payment sync');
    }

    return true;
  } catch (error) {
    console.error("Backend payment sync error:", error);

    // REVERT OPTIMISTIC STATE ON FAILURE
    if (rollbackState) {
      console.log(
        "[syncPaymentToBackend] Reverting to previous state due to sync error"
      );
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
              activeOrderOutstandingSubtotal:
                rollbackState.activeOrderOutstandingSubtotal,
              activeOrderOutstandingTax:
                rollbackState.activeOrderOutstandingTax,
              activeOrderOutstandingTotal:
                rollbackState.activeOrderOutstandingTotal,
              activeOrderTotalCash: rollbackState.activeOrderTotalCash,
              activeOrderOutstandingCash:
                rollbackState.activeOrderOutstandingCash,
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

// Tax calculation is handled in calculateOrderTotals (lib/order-calculator.ts) using dynamic rate from store settings

// ============================================================================
// QUEUED UPDATE INTERFACE (Phase 3: Race Condition Prevention)
// ============================================================================
/**
 * Represents a backend update that was queued because local changes were pending.
 * These updates are applied after local changes sync to prevent race conditions.
 */
interface QueuedUpdate {
  orderId: string; // Local order ID
  timestamp: number; // When the update was queued
  updates: Partial<OrderProfile>; // Backend fields to update
  source: 'broadcast' | 'payment_sync' | 'reconciliation'; // Where the update came from
}

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

  // === PAYMENT SYNC STATE ===
  // Tracks whether we're syncing payment status from backend
  paymentSyncStatus: "idle" | "syncing" | "error";

  // === SYNC TRACKING STATE ===
  // Maps itemId -> sync promise for pending operations
  pendingSyncOperations: Map<string, Promise<boolean>>;

  // === QUEUED BACKEND UPDATES (Phase 3: Race Condition Prevention) ===
  // Maps local orderId -> queued update (backend updates delayed while local changes pending)
  pendingBackendUpdates: Map<string, QueuedUpdate>;

  // Sync barrier methods
  hasPendingSyncs: (orderId: string) => boolean;
  waitForPendingSyncs: (orderId: string) => Promise<void>;
  getSyncStatus: (orderId: string) => {
    pending: number;
    failed: number;
    synced: number;
  };
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

  // === STATION CONTEXT ===
  currentStationId: string | null;
  currentStation: Station | null;
  remoteOrdersEnabled: boolean;
  isLoadingPreviousOrders: boolean;
  lastReconciliationAt: string | null;

  // === WORKING SET (Phase 5) ===
  // Orders the user is actively working on - persists across restarts, clears on logout
  workingSetOrderIds: string[]; // db_order_ids in working set

  // --- OFFLINE SYNC ACTIONS ---
  setOnlineStatus: (isOnline: boolean) => void;
  setPendingSyncCount: (count: number) => void;

  // --- STATION ACTIONS ---
  setCurrentStation: (station: Station) => void;

  // --- WORKING SET ACTIONS (Phase 5) ---
  addToWorkingSet: (dbOrderId: string) => void;
  removeFromWorkingSet: (dbOrderId: string) => void;
  clearWorkingSet: () => void;
  isInWorkingSet: (dbOrderId: string) => boolean;

  // --- ACTIONS ---
  setActiveOrder: (orderId: string | null) => void;
  startNewOrder: (details?: {
    tableId?: string;
    guestCount?: number;
  }) => OrderProfile;
  addItemToActiveOrder: (newItem: CartItem) => void;
  updateItemInActiveOrder: (updatedItem: CartItem) => void;
  applyBackendItemData: (
    itemId: string,
    backendData: {
      card_subtotal?: number;
      card_tax_amount?: number;
      unit_price?: number;
      cash_unit_price?: number;
      cash_subtotal?: number;
      cash_tax_amount?: number;
      quantity?: number;
      discount_amount?: number;
      discount_cash_amount?: number;
      modifiers?: Array<{
        modifier_item_id: string;
        modifier_name: string;
        modifier_group_id: string;
        modifier_group_name: string;
        price_modifier: number;
        quantity: number;
      }>;
      sync_version?: number;
    }
  ) => void;
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
    itemAllocations?: { itemId: string; quantity: number; amount?: number }[]; // Optional: per-item allocations with quantities
    splitCount?: number; // Optional: split count for split payments
    splitPortionIndex?: number; // Optional: split portion index for split payments
  }) => Promise<boolean>; // Returns true if sync succeeded, false if failed (state reverted)
  setOrders: (orders: OrderProfile[]) => void;

  markOrderAsPaid: (orderId: string) => void;
  setPendingTableSelection: (tableId: string | null) => void;
  syncOrderStatus: (orderId: string) => void;

  archiveOrder: (orderId: string) => string | null; // Returns the tableId if it exists
  cleanupAbandonedDrafts: () => void;
  startDraftCleanup: () => void;
  stopDraftCleanup: () => void;
  cleanupDraftDuplicates: () => void;
  markAllItemsAsReady: (orderId: string) => void;
  markAllItemsAsServed: (orderId: string) => void;
  // Course-specific KDS functions
  markCourseItemsAsCooking: (orderId: string, itemIds: string[]) => void;
  markCourseItemsAsReady: (orderId: string, itemIds: string[]) => void;
  markCourseItemsAsServed: (orderId: string, itemIds: string[]) => void;
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
  updateOrderFromSync: (
    localOrderId: string,
    backendData: {
      order_number?: number | string;
      display_number?: string;
      opened_at?: string;
      total_amount?: number;
      total_tax?: number;
      subtotal?: number;
      cash_total?: number;
      cash_tax_amount?: number;
      cash_subtotal?: number;
    }
  ) => void;
  // Update local item with DB item ID after successful sync
  updateItemDbId: (
    orderId: string,
    localItemId: string,
    dbItemId: string
  ) => void;
  // Get all orders that have items with failed sync status
  getOrdersWithFailedSyncs: () => Array<{
    localId: string;
    dbId: string | undefined;
  }>;
  // Update order from reconciliation data
  updateOrderFromReconciliation: (
    localOrderId: string,
    updates: Partial<OrderProfile>
  ) => void;
  // Retry failed syncs for an order
  retryFailedSyncs: (orderId: string) => Promise<void>;
  // Sync order from database (manual refresh)
  syncOrderFromDatabase: (orderId: string) => Promise<{ success: boolean; error?: string }>;
  // Prefetch multiple orders by their database IDs (for cache warming)
  prefetchOrders: (orderIds: string[]) => Promise<void>;
  // Sync payment status from backend (shows loading state during sync)
  syncPaymentStatus: (orderId: string) => Promise<void>;

  // === NEW: Order Calculation Actions ===
  // Recalculate order totals and update state (call after any item/discount change)
  recalculateOrder: (orderId: string) => OrderTotals;
  // Mark items as paid after a successful payment
  markItemsPaid: (orderId: string, allocations: ItemPaymentAllocation[]) => void;
  // Sync order from backend after payment to ensure consistency
  syncOrderFromBackend: (orderId: string) => Promise<void>;

  // === QUEUED UPDATE ACTIONS (Phase 3: Race Condition Prevention) ===
  // Apply queued backend updates after local sync completes
  applyQueuedUpdates: (orderId: string) => void;
  // Clean up stale queued updates (older than TTL)
  cleanupStaleQueuedUpdates: () => void;

  // === REALTIME SUBSCRIPTION STATE (DISABLED - using useOrdersRealtime hook instead) ===
    // REMOVED: Duplicate realtime subscription (now handled by LocationRealtimeProvider with useOrdersRealtime hook)
    // orderRealtimeChannel: RealtimeChannel | null;
    // orderRealtimeStatus: 'connected' | 'reconnecting' | 'disconnected';
    // orderRealtimeError: string | null;
    // _orderLocationId: string | null;
    // _orderReconnectAttempts: number;
    // _orderReconnectTimeout: ReturnType<typeof setTimeout> | null;
    // _isOrderCleaningUp: boolean;

    // REMOVED: Realtime actions (now handled by useOrdersRealtime hook)
    // setupOrderRealtimeSubscriptions: (locationId: string) => void;
    // cleanupOrderRealtime: () => void;
    // manualOrderReconnect: () => void;

    // REMOVED: Internal realtime handlers (now handled by useOrdersRealtime hook)
    // _handleOrderBroadcast: (payload: OrderBroadcastPayload) => void;
    // _handleItemBroadcast: (payload: OrderItemBroadcastPayload) => void;
    // _handlePaymentBroadcast: (payload: PaymentBroadcastPayload) => void;
    // _debouncedOrderRefresh: (dbOrderId: string) => void;
    // _handleOrderReconnect: (locationId: string) => void;

    // === ORDER VISIBILITY & MANAGEMENT (Phase 5) ===
    isOrderVisible: (
      backendOrder: BroadcastOrderData,
      currentLocationId: string
    ) => boolean;
    upsertOrder: (backendOrder: BroadcastOrderData, sourceStationName?: string | null) => void;
    removeOrder: (dbOrderId: string) => void;

    // @deprecated - use isOrderVisible instead
    _shouldAcceptRemoteOrder: (
      backendOrder: BroadcastOrderData,
      currentLocationId: string
    ) => boolean;
    // @deprecated - use upsertOrder instead
    _createRemoteOrder: (backendOrder: BroadcastOrderData) => void;
    // @deprecated - use upsertOrder instead
    _updateRemoteOrder: (backendOrder: BroadcastOrderData) => void;
    // @deprecated - use removeOrder instead
    _removeRemoteOrder: (dbOrderId: string) => void;

    // === FETCH & RECONCILIATION ===
    fetchVisibleOrders: (options?: {
      limit?: number;
      includeCompleted?: boolean;
    }) => Promise<void>;
    // @deprecated - use fetchVisibleOrders instead
    fetchRemoteOrders: (options?: {
      limit?: number;
      includeCompleted?: boolean;
    }) => Promise<void>;
    fetchOwnStationOrders: () => Promise<void>;
    reconcileOrders: () => Promise<void>;
    _createLocalOrderFromServer: (serverOrder: FetchedOrderData) => void;
    _cleanupStaleRemoteOrders: (locationId: string) => Promise<void>;
}

// Debounced refresh helper (per-order)
const orderRefreshTimeouts: Record<string, ReturnType<typeof setTimeout>> = {};

// PERFORMANCE: Per-order broadcast throttle to prevent rapid-fire updates
const lastBroadcastTime: Record<string, number> = {};
const BROADCAST_THROTTLE_MS = 500; // Max 1 update per 500ms per order

const createDebouncedOrderRefresh = (get: () => OrderState) => {
  return (orderId: string) => {
    // Clear existing timeout for this order
    if (orderRefreshTimeouts[orderId]) {
      clearTimeout(orderRefreshTimeouts[orderId]);
    }
    
    orderRefreshTimeouts[orderId] = setTimeout(() => {
      const state = get();
      const order = Object.values(state.ordersById).find(
        o => o.db_order_id === orderId || o.id === orderId
      );
      
      if (order) {
        // Sync this specific order from backend
        state.syncOrderFromDatabase(order.id);
      }
      
      delete orderRefreshTimeouts[orderId];
    }, 500); // 500ms debounce (increased from 300ms for performance)
  };
};

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
          // REMOVED: Realtime subscription state (now handled by useOrdersRealtime hook)
          // orderRealtimeChannel: null,
          // Sync tracking state
          pendingSyncOperations: new Map<string, Promise<boolean>>(),
          // Queued backend updates (Phase 3: Race Condition Prevention)
          pendingBackendUpdates: new Map<string, QueuedUpdate>(),
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

          // === STATION CONTEXT ===
          currentStationId: null,
          currentStation: null,
          remoteOrdersEnabled: false,
          isLoadingPreviousOrders: false,
          lastReconciliationAt: null,

          // === WORKING SET (Phase 5) ===
          workingSetOrderIds: [],

          // Payment sync status for loading UI
          paymentSyncStatus: "idle",

          // --- OFFLINE SYNC ACTIONS ---
          setOnlineStatus: (isOnline: boolean) => set({ isOnline }),
          setPendingSyncCount: (count: number) =>
            set({ pendingSyncCount: count }),

          // --- STATION ACTIONS ---
          setCurrentStation: (station) => {
            console.log(
              `[OrderStore] Station context set: ${station.station_name} (${station.view_scope || "own"})`
            );
            set({
              currentStationId: station.id,
              currentStation: station,
              remoteOrdersEnabled: station.view_scope !== "own",
            });
          },

          // --- WORKING SET ACTIONS (Phase 5) ---
          addToWorkingSet: (dbOrderId: string) => {
            const current = get().workingSetOrderIds;
            if (!current.includes(dbOrderId)) {
              set({ workingSetOrderIds: [...current, dbOrderId] });
              console.log(`[WorkingSet] Added order ${dbOrderId}`);
            }
          },

          removeFromWorkingSet: (dbOrderId: string) => {
            set({
              workingSetOrderIds: get().workingSetOrderIds.filter(
                (id) => id !== dbOrderId
              ),
            });
            console.log(`[WorkingSet] Removed order ${dbOrderId}`);
          },

          clearWorkingSet: () => {
            set({ workingSetOrderIds: [] });
            console.log("[WorkingSet] Cleared");
          },

          isInWorkingSet: (dbOrderId: string) => {
            return get().workingSetOrderIds.includes(dbOrderId);
          },

          // --- REALTIME SUBSCRIPTION METHODS ---
          // REMOVED: Duplicate realtime subscription (now handled by LocationRealtimeProvider with useOrdersRealtime hook)
          // This function is kept as a stub for backward compatibility but does nothing
          setupOrderRealtimeSubscriptions: async (locationId: string) => {
            console.warn(
              '[OrderRealtime] setupOrderRealtimeSubscriptions is disabled. ' +
              'Realtime subscriptions are now handled by LocationRealtimeProvider with useOrdersRealtime hook.'
            );
            // No-op: Realtime subscription is now handled by React Query hook
          },

          // ============================================================================
          // ORDER BROADCAST HANDLER (Phase 2: Remote Order Management)
          // ============================================================================

          _handleOrderBroadcast: (payload: OrderBroadcastPayload) => {
            const { operation, data } = payload;
            const backendOrder = data.order;
            const dbOrderId = backendOrder?.id;

            if (!dbOrderId) {
              console.warn("[OrderBroadcast] No order ID in payload");
              return;
            }

            // PERFORMANCE: Throttle broadcasts per-order to prevent rapid-fire updates
            const now = Date.now();
            if (lastBroadcastTime[dbOrderId] && now - lastBroadcastTime[dbOrderId] < BROADCAST_THROTTLE_MS) {
              return; // Skip - too soon since last update for this order
            }
            lastBroadcastTime[dbOrderId] = now;

            const state = get();
            const { currentStationId } = state;
            const localOrder = state.ordersByDbId[dbOrderId];
            const currentLocationId =
              useStoreSettingsStore.getState().selectedStore?.id;

            // DECISION POINT 1: Is this our own station's order?
            const isOwnStationOrder = backendOrder.station_id === currentStationId;

            // PERFORMANCE FIX: Skip broadcast processing while user has pending local changes
            // This prevents cascading re-renders during rapid item additions
            if (isOwnStationOrder && localOrder) {
              const hasPendingItems = localOrder.items.some(
                (item) => !item.db_order_item_id && !item.isDraft
              );
              if (hasPendingItems) {
                // Let local sync complete first - broadcast will arrive again after sync
                return;
              }
            }

            if (isOwnStationOrder || localOrder) {
              // ═══════════════════════════════════════════════════════════
              // OWN STATION ORDER - Use existing local order handling
              // ═══════════════════════════════════════════════════════════

              switch (operation) {
                case "INSERT":
                  if (!localOrder) {
                    console.log(
                      "[OrderBroadcast] Own INSERT confirmed:",
                      dbOrderId
                    );
                    // Order creation is handled by sync response, not broadcast
                  }
                  break;

                case "UPDATE":
                  if (localOrder) {
                    const localOrderId = localOrder.id;

                    // Phase 7D: Check for pending local changes using db_order_item_id
                    // Items without db_order_item_id are pending (not yet synced)
                    const hasPendingChanges =
                      !localOrder.db_order_id || // Order not yet created in backend
                      localOrder.items.some(
                        (item) => !item.db_order_item_id && !item.isDraft
                      );

                    // PERFORMANCE: Skip update if no meaningful data changed
                    // Compare key fields that actually affect UI
                    const noMeaningfulChange =
                      localOrder.amount_paid === backendOrder.amount_paid &&
                      localOrder.order_status === backendOrder.status &&
                      localOrder.total_amount === backendOrder.card_total &&
                      localOrder.items.length === (backendOrder.order_items?.length ?? localOrder.items.length) &&
                      !hasItemLevelChanges(localOrder.items, backendOrder.order_items); // NEW: Check item-level changes

                    if (noMeaningfulChange && !hasPendingChanges) {
                      // No meaningful change - skip state update to prevent re-renders
                      return;
                    }

                    // ═══════════════════════════════════════════════════════════
                    // Phase 6: Conflict Detection
                    // ═══════════════════════════════════════════════════════════
                    const serverOrderForConflict = {
                      ...backendOrder,
                      sync_version: backendOrder.sync_version ?? 0,
                      total_amount: backendOrder.card_total,
                      amount_paid: backendOrder.amount_paid,
                      order_status: backendOrder.status,
                      paid_status: mapPaymentStatus(backendOrder.payment_status),
                      total_discount: backendOrder.discount_amount,
                      items: backendOrder.order_items
                        ? transformBroadcastItems(backendOrder.order_items)
                        : [],
                      _sourceStationName: backendOrder.station_name,
                    };

                    const conflict = detectConflict(
                      localOrder,
                      serverOrderForConflict as any
                    );

                    if (conflict) {
                      // Add source station info
                      conflict.sourceStationName = backendOrder.station_name;
                      conflict.sourceStationId = backendOrder.station_id;

                      if (isConflictCritical(conflict)) {
                        // Payment conflict - needs modal
                        useConflictStore.getState().addPaymentConflict(conflict);
                        console.log(
                          "[OrderBroadcast] Payment conflict detected:",
                          conflict.conflictType
                        );
                      } else {
                        // Non-critical - record and show toast
                        useConflictStore.getState().recordConflict(conflict);

                        // Show toast notification for significant conflicts
                        const toastData = generateConflictToast(conflict);
                        if (conflict.severity !== "info") {
                          toastService.show({
                            type: toastData.type === "error" ? "error" : "info",
                            message: toastData.message,
                            duration: toastData.duration ?? 5000,
                          });
                        }
                      }
                    }

                    // Phase 2.5: Transform fresh items from broadcast (if available)
                    const broadcastItems = backendOrder.order_items
                      ? transformBroadcastItems(backendOrder.order_items)
                      : null;

                    set((state) => {
                      const existingOrder = state.ordersById[localOrderId];
                      if (!existingOrder) return state;

                      // Phase 2.5: Merge broadcast items with local items
                      // Strategy: Keep pending local items, update synced items from broadcast
                      let mergedItems = existingOrder.items;
                      if (broadcastItems && broadcastItems.length > 0 && !hasPendingChanges) {
                        // Build a map of broadcast items by db_order_item_id
                        const broadcastItemMap = new Map(
                          broadcastItems.map((item) => [
                            item.db_order_item_id,
                            item,
                          ])
                        );

                        // Phase 7D: Use db_order_item_id check instead of sync_status
                        // Items without db_order_item_id haven't synced to backend yet
                        // and must be preserved during broadcast merge
                        const localPendingItems = existingOrder.items.filter(
                          (item) =>
                            !item.db_order_item_id || // Not yet synced
                            item.isDraft
                        );

                        // Use broadcast items for all synced items (they have modifiers)
                        // Preserve local item IDs for items we already have
                        const updatedSyncedItems = broadcastItems.map(
                          (broadcastItem) => {
                            // Find if we have a local item with this db_order_item_id
                            const localItem = existingOrder.items.find(
                              (li) =>
                                li.db_order_item_id ===
                                broadcastItem.db_order_item_id
                            );
                            // Phase 7D: Check db_order_item_id instead of sync_status
                            if (localItem && localItem.db_order_item_id) {
                              // Merge: keep local ID but update everything else from broadcast
                              return {
                                ...broadcastItem,
                                id: localItem.id, // Keep local ID
                              };
                            }
                            return broadcastItem;
                          }
                        );

                        // Combine: synced items from broadcast + local pending items
                        mergedItems = [...updatedSyncedItems, ...localPendingItems];
                      }

                      // Build updated order
                      const updatedOrder: OrderProfile = {
                        ...existingOrder,

                        // Always update payment-related fields (backend is source of truth)
                        amount_paid: backendOrder.amount_paid,
                        amount_due: backendOrder.amount_due,
                        cash_amount_due: backendOrder.cash_amount_due,
                        paid_status: mapPaymentStatus(
                          backendOrder.payment_status
                        ),

                        // Update items with merged data (Phase 2.5)
                        items: mergedItems,

                        // UPDATE sync_version from broadcast to prevent false conflict detection
                        sync_version: backendOrder.sync_version ?? existingOrder.sync_version ?? 0,

                        // Update totals if no pending changes
                        ...(!hasPendingChanges
                          ? {
                              // Status
                              order_status: backendOrder.status,
                              check_status: backendOrder.check_status || existingOrder.check_status || "Opened",

                              // Card totals (default display)
                              total_amount: backendOrder.card_total,
                              total_tax: backendOrder.card_tax_amount,

                              // Timestamps
                              sent_to_kitchen_at:
                                backendOrder.sent_to_kitchen_at ||
                                existingOrder.sent_to_kitchen_at,
                            }
                          : {}),
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
                        // Update derived state if active order AND no pending changes
                        // PERFORMANCE FIX: Don't overwrite local totals while user is actively editing
                        ...(localOrderId === state.activeOrderId && !hasPendingChanges
                          ? {
                              activeOrderTotal: backendOrder.card_total,
                              activeOrderTax: backendOrder.card_tax_amount,
                              activeOrderSubtotal: backendOrder.card_subtotal,
                              activeOrderDiscount: backendOrder.discount_amount,
                              activeOrderOutstandingTotal:
                                backendOrder.amount_due,
                              activeOrderOutstandingCash:
                                backendOrder.cash_amount_due,
                              activeOrderTotalCash: backendOrder.cash_total,
                            }
                          : {}),
                      };
                    });

                    // === PHASE 3: Queue updates if local changes pending ===
                    if (hasPendingChanges) {
                      // Queue backend updates that were skipped due to pending local changes
                      const queuedUpdate: QueuedUpdate = {
                        orderId: localOrderId,
                        timestamp: Date.now(),
                        updates: {
                          // Order status and totals (skipped above when hasPendingChanges)
                          order_status: backendOrder.status,
                          check_status: backendOrder.check_status || localOrder.check_status || "Opened",
                          total_amount: backendOrder.card_total,
                          total_tax: backendOrder.card_tax_amount,
                          sent_to_kitchen_at: backendOrder.sent_to_kitchen_at || localOrder.sent_to_kitchen_at,
                          // Active order derived state (if applicable)
                          ...(localOrderId === get().activeOrderId ? {
                            _queuedActiveOrderState: {
                              activeOrderTotal: backendOrder.card_total,
                              activeOrderTax: backendOrder.card_tax_amount,
                              activeOrderSubtotal: backendOrder.card_subtotal,
                              activeOrderDiscount: backendOrder.discount_amount,
                              activeOrderOutstandingTotal: backendOrder.amount_due,
                              activeOrderOutstandingCash: backendOrder.cash_amount_due,
                              activeOrderTotalCash: backendOrder.cash_total,
                            }
                          } : {}),
                        },
                        source: 'broadcast',
                      };

                      set((state) => {
                        const newMap = new Map(state.pendingBackendUpdates);
                        newMap.set(localOrderId, queuedUpdate);
                        return { pendingBackendUpdates: newMap };
                      });

                      console.log('[OrderBroadcast] Queued backend update due to pending changes:', {
                        orderId: localOrderId,
                        fields: Object.keys(queuedUpdate.updates),
                      });
                    }

                    // Invalidate calculation cache after broadcast update
                    invalidateCalculationCache();

                    // Full sync if status changed
                    if (localOrder.order_status !== backendOrder.status) {
                      get()._debouncedOrderRefresh(dbOrderId);
                    }
                  }
                  break;

                case "DELETE":
                  if (localOrder) {
                    console.log("[OrderBroadcast] Own DELETE:", dbOrderId);
                    // Could archive or remove the local order
                  }
                  break;
              }
              return;
            }

            // DECISION POINT 2: Should we accept this remote order?
            if (
              !currentLocationId ||
              !state._shouldAcceptRemoteOrder(backendOrder, currentLocationId)
            ) {
              console.log("[OrderBroadcast] Rejected (view_scope):", dbOrderId);
              return;
            }

            // ═══════════════════════════════════════════════════════════
            // REMOTE ORDER - Handle differently
            // ═══════════════════════════════════════════════════════════

            switch (operation) {
              case "INSERT":
                // DEDUPLICATION: Only create if order doesn't exist locally
                const existingOrder = state.ordersByDbId[dbOrderId];
                if (existingOrder) {
                  console.log("[OrderBroadcast] Remote INSERT - order already exists:", dbOrderId);
                  return; // Skip duplicate creation
                }
                console.log("[OrderBroadcast] Remote INSERT - creating:", dbOrderId);
                state._createRemoteOrder(backendOrder);
                break;

              case "UPDATE":
                console.log("[OrderBroadcast] Remote UPDATE:", dbOrderId);
                state._updateRemoteOrder(backendOrder);
                break;

              case "DELETE":
                console.log("[OrderBroadcast] Remote DELETE:", dbOrderId);
                state._removeRemoteOrder(dbOrderId);
                break;
            }
          },

          // ============================================================================
          // REMOTE ORDER VIEW SCOPE FILTER (Phase 2)
          // ============================================================================

          _shouldAcceptRemoteOrder: (backendOrder, currentLocationId) => {
            const { currentStation, currentStationId } = get();

            // 1. If no currentStation set, reject all remote orders
            if (!currentStation || !currentStationId) {
              console.log("[RemoteOrder] No station context, rejecting");
              return false;
            }

            // 2. If order is from our own station, this isn't a "remote" order
            if (backendOrder.station_id === currentStationId) {
              return false;
            }

            // 3. Check view_scope
            const viewScope = currentStation.view_scope || "own";

            switch (viewScope) {
              case "own":
                // Never accept remote orders
                return false;

              case "location":
                // Accept all orders from this location
                return backendOrder.location_id === currentLocationId;

              case "online":
                // Accept only online/delivery orders from this location
                return (
                  backendOrder.location_id === currentLocationId &&
                  ["delivery", "takeout"].includes(backendOrder.order_type)
                );

              default:
                return false;
            }
          },

          // ============================================================================
          // ORDER VISIBILITY & MANAGEMENT (Phase 5)
          // ============================================================================

          /**
           * Check if an order should be visible to this station.
           * Simplified: includes own station orders, no ownership distinction.
           */
          isOrderVisible: (backendOrder, currentLocationId) => {
            const { currentStation, currentStationId } = get();

            // No station context = only show local orders
            if (!currentStation || !currentStationId) {
              return false;
            }

            // Check view_scope
            const viewScope = currentStation.view_scope || "own";

            switch (viewScope) {
              case "own":
                // Only our station's orders
                return backendOrder.station_id === currentStationId;

              case "location":
                // All orders from this location
                return backendOrder.location_id === currentLocationId;

              case "online":
                // Our station's orders + online orders from this location
                return (
                  backendOrder.station_id === currentStationId ||
                  (backendOrder.location_id === currentLocationId &&
                    ["delivery", "takeout"].includes(backendOrder.order_type))
                );

              default:
                return backendOrder.station_id === currentStationId;
            }
          },

          /**
           * Unified upsert for any order (from broadcast or fetch).
           * Uses db_order_id directly as local ID - no ownership flags.
           */
          upsertOrder: (backendOrder, sourceStationName) => {
            const dbOrderId = backendOrder.id;

            // ============================================================================
            // DEDUPLICATION: Check if order already exists before creating
            // ============================================================================
            const existingByDbId = get().ordersByDbId[dbOrderId];
            const existingById = get().ordersById[dbOrderId]; // Since db_order_id = id for remote orders
            const existing = existingByDbId || existingById;

            if (existing) {
              // Don't overwrite orders with pending local changes
              if (existing.sync_status === "pending") {
                console.log("[UpsertOrder] Skipping - has pending sync:", dbOrderId);
                return;
              }

              // Order already exists - this will be an update operation
              console.log("[UpsertOrder] Updating existing order:", dbOrderId);
            }

            // Transform to OrderProfile
            const orderProfile = transformBroadcastToOrder(backendOrder, sourceStationName);

            // Upsert to both maps
            set((state) => ({
              ordersById: {
                ...state.ordersById,
                [orderProfile.id]: orderProfile,
              },
              ordersByDbId: {
                ...state.ordersByDbId,
                [dbOrderId]: orderProfile,
              },
              // Only add to orderIds if new
              orderIds: existing
                ? state.orderIds
                : [...state.orderIds, orderProfile.id],
            }));

            console.log(
              existing ? "[UpsertOrder] Updated:" : "[UpsertOrder] Created:",
              dbOrderId
            );
          },

          /**
           * Remove an order by its database ID.
           */
          removeOrder: (dbOrderId) => {
            const existing = get().ordersByDbId[dbOrderId];
            if (!existing) {
              console.log("[RemoveOrder] Not found:", dbOrderId);
              return;
            }

            const localId = existing.id;

            set((state) => {
              const { [localId]: removedById, ...restById } = state.ordersById;
              const { [dbOrderId]: removedByDbId, ...restByDbId } = state.ordersByDbId;

              return {
                ordersById: restById,
                ordersByDbId: restByDbId,
                orderIds: state.orderIds.filter((id) => id !== localId),
                // Also remove from working set
                workingSetOrderIds: state.workingSetOrderIds.filter((id) => id !== dbOrderId),
              };
            });

            console.log("[RemoveOrder] Removed:", dbOrderId);
          },

          // ============================================================================
          // DEPRECATED REMOTE ORDER CRUD ACTIONS (Phase 2)
          // Use upsertOrder and removeOrder instead
          // ============================================================================

          _createRemoteOrder: (backendOrder) => {
            // Deprecated: now just calls upsertOrder
            get().upsertOrder(backendOrder);
          },

          _updateRemoteOrder: (backendOrder) => {
            // Deprecated: now just calls upsertOrder
            get().upsertOrder(backendOrder);
          },

          _removeRemoteOrder: (dbOrderId) => {
            // Deprecated: now just calls removeOrder
            get().removeOrder(dbOrderId);
          },

          // ====================================================================
          // PHASE 3: INITIAL FETCH & RECONCILIATION
          // ====================================================================

          /**
           * Fetch visible orders from other stations based on view_scope.
           * Phase 5: Simplified - uses upsertOrder, no remote ID prefix.
           */
          fetchVisibleOrders: async (options) => {
            const { currentStation, currentStationId } = get();
            const locationId =
              useStoreSettingsStore.getState().selectedStore?.id;

            // Guard: No station context
            if (!currentStation || !currentStationId || !locationId) {
              console.warn("[FetchVisible] No station context, skipping");
              return;
            }

            // Guard: View scope doesn't allow other station orders
            if (currentStation.view_scope === "own") {
              console.log(
                '[FetchVisible] view_scope is "own", no other station orders needed'
              );
              return;
            }

            set({ isLoadingPreviousOrders: true });

            try {
              const supabase = _supabaseClient;
              if (!supabase) {
                throw new Error("Supabase client not available");
              }

              // Build base query
              let query = supabase
                .from("orders")
                .select(
                  `
                  *,
                  order_items (
                    *,
                    order_item_modifiers (*)
                  ),
                  stations:station_id (name)
                `
                )
                .eq("location_id", locationId)
                .neq("station_id", currentStationId) // Exclude our own station
                .order("created_at", { ascending: false })
                .limit(options?.limit ?? 50);

              // Apply view_scope specific filters
              if (currentStation.view_scope === "online") {
                query = query.in("order_type", ["delivery", "takeout"]);
              }

              // Optionally exclude completed orders
              if (!options?.includeCompleted) {
                query = query.not(
                  "status",
                  "in",
                  '("completed","voided","cancelled")'
                );
              }

              const { data, error } = await query;

              if (error) throw error;

              console.log(
                `[FetchVisible] Fetched ${data?.length ?? 0} orders from other stations`
              );

              // Upsert each order
              for (const fetchedOrder of data ?? []) {
                const normalized = normalizeFetchedOrder(
                  fetchedOrder as FetchedOrderData
                );
                const sourceStationName = fetchedOrder.stations?.name ?? null;

                // Use unified upsertOrder (handles idempotency, passes station name)
                get().upsertOrder(normalized, sourceStationName);
              }

              // Update reconciliation timestamp
              set({ lastReconciliationAt: new Date().toISOString() });
            } catch (error) {
              console.error("[FetchVisible] Error:", error);
              // Don't throw - other station orders are non-critical
            } finally {
              set({ isLoadingPreviousOrders: false });
            }
          },

          // @deprecated - use fetchVisibleOrders instead
          fetchRemoteOrders: async (options) => {
            return get().fetchVisibleOrders(options);
          },

          /**
           * Fetch own station orders not in local store (handles orphaned orders).
           * Orphaned orders are server orders for our station that don't exist locally
           * (e.g., after app reinstall or created on another device with same station).
           */
          fetchOwnStationOrders: async () => {
            const { currentStation, currentStationId, ordersByDbId } = get();
            const locationId =
              useStoreSettingsStore.getState().selectedStore?.id;

            if (!currentStation || !currentStationId || !locationId) {
              console.warn("[FetchOwn] No station context, skipping");
              return;
            }

            try {
              const supabase = _supabaseClient;
              if (!supabase) {
                throw new Error("Supabase client not available");
              }

              // Fetch active orders from our station
              const { data, error } = await supabase
                .from("orders")
                .select(
                  `
                  *,
                  order_items (
                    *,
                    order_item_modifiers (*)
                  )
                `
                )
                .eq("location_id", locationId)
                .eq("station_id", currentStationId)
                .not("status", "in", '("completed","voided","cancelled")')
                .order("created_at", { ascending: false });

              if (error) throw error;

              console.log(
                `[FetchOwn] Fetched ${data?.length ?? 0} own station orders`
              );

              // Check for orphaned orders (on server but not locally)
              for (const serverOrder of data ?? []) {
                const existsLocally = ordersByDbId[serverOrder.id];

                if (!existsLocally) {
                  console.log(
                    `[FetchOwn] Found orphaned order: ${serverOrder.id}`
                  );
                  // Create as local order (full editing capability)
                  get()._createLocalOrderFromServer(
                    serverOrder as FetchedOrderData
                  );
                }
              }
            } catch (error) {
              console.error("[FetchOwn] Error:", error);
            }
          },

          /**
           * Create a local order from server data (for orphaned orders).
           * These are our station's orders that we don't have locally.
           */
          _createLocalOrderFromServer: (serverOrder) => {
            // Generate a local ID that indicates this came from server
            const localId = `local_order_${serverOrder.id}`;

            // Check if already exists
            if (
              get().ordersById[localId] ||
              get().ordersByDbId[serverOrder.id]
            ) {
              console.log("[CreateFromServer] Already exists:", serverOrder.id);
              return;
            }

            // Normalize and transform items
            const normalized = normalizeFetchedOrder(serverOrder);
            const items = transformBroadcastItems(normalized.order_items);

            // Map to local OrderProfile format
            const localOrder: OrderProfile = {
              id: localId,
              db_order_id: serverOrder.id,
              order_number: serverOrder.order_number,
              display_number: serverOrder.display_number,

              // Station tracking - this IS our station
              station_id: serverOrder.station_id ?? null,

              // Order info
              order_type: mapOrderType(serverOrder.order_type),
              order_status: serverOrder.status as OrderProfile["order_status"],
              check_status: serverOrder.check_status || "Opened",
              paid_status: mapPaymentStatus(serverOrder.payment_status),
              service_location_id: serverOrder.table_number ?? null,
              customer_name: "",

              // Financial - use server values
              total_amount:
                serverOrder.card_total ?? serverOrder.total_amount ?? 0,
              total_tax:
                serverOrder.card_tax_amount ?? serverOrder.tax_amount ?? 0,
              total_discount: serverOrder.discount_amount ?? 0,
              amount_paid: serverOrder.amount_paid ?? 0,
              amount_due: serverOrder.amount_due ?? 0,
              cash_amount_due: serverOrder.cash_amount_due ?? 0,

              // Items
              items,

              // Timestamps
              opened_at: serverOrder.created_at,
              sent_to_kitchen_at: serverOrder.sent_to_kitchen_at ?? undefined,
              closed_at: serverOrder.completed_at ?? undefined,

              // Sync status - already synced since from DB
              sync_status: "synced",
              sync_version: serverOrder.sync_version ?? 1,

              // Station tracking (for display)
              _sourceStationId: serverOrder.station_id ?? null,
              _sourceStationName: null,
            };

            // Add to store
            set((state) => ({
              ordersById: {
                ...state.ordersById,
                [localId]: localOrder,
              },
              ordersByDbId: {
                ...state.ordersByDbId,
                [serverOrder.id]: localOrder,
              },
              orderIds: [...state.orderIds, localId],
            }));

            console.log("[CreateFromServer] Created local order:", localId);
          },

          /**
           * Clean up orders from other stations that no longer exist on server.
           * Phase 5: Simplified - uses db_order_id directly, no remote prefix.
           */
          _cleanupStaleRemoteOrders: async (locationId) => {
            const { currentStationId, ordersById } = get();

            if (!currentStationId) return;

            try {
              const supabase = _supabaseClient;
              if (!supabase) {
                throw new Error("Supabase client not available");
              }

              // Fetch active order IDs from server (other stations only)
              const { data, error } = await supabase
                .from("orders")
                .select("id")
                .eq("location_id", locationId)
                .neq("station_id", currentStationId)
                .not("status", "in", '("completed","voided","cancelled")');

              if (error) throw error;

              // Build set of valid db_order_ids from server
              const serverDbIds = new Set((data ?? []).map((o) => o.id));

              // Find local orders from other stations that no longer exist on server
              const otherStationOrders = Object.values(ordersById).filter(
                (o) =>
                  o.station_id !== currentStationId &&
                  o.db_order_id &&
                  !["completed", "voided", "cancelled"].includes(
                    o.order_status ?? ""
                  )
              );

              for (const order of otherStationOrders) {
                if (order.db_order_id && !serverDbIds.has(order.db_order_id)) {
                  console.log(
                    `[Cleanup] Removing stale order: ${order.db_order_id}`
                  );
                  get().removeOrder(order.db_order_id);
                }
              }
            } catch (error) {
              console.error("[Cleanup] Error:", error);
            }
          },

          /**
           * Full reconciliation action - called on reconnect or manual refresh.
           */
          reconcileOrders: async () => {
            const { currentStation, currentStationId, lastReconciliationAt } =
              get();
            const locationId =
              useStoreSettingsStore.getState().selectedStore?.location_id;

            if (!currentStation || !currentStationId || !locationId) {
              console.warn("[Reconcile] No station context");
              return;
            }

            console.log("[Reconcile] Starting reconciliation...");
            console.log("[Reconcile] Last reconciliation:", lastReconciliationAt);

            set({ isLoadingPreviousOrders: true });

            try {
              // STEP 1: Fetch own station orders (handles orphaned orders)
              await get().fetchOwnStationOrders();

              // STEP 2: Fetch remote orders (if view_scope allows)
              if (currentStation.view_scope !== "own") {
                await get().fetchRemoteOrders();
              }

              // STEP 3: Clean up stale remote orders
              await get()._cleanupStaleRemoteOrders(locationId);

              // Update reconciliation timestamp
              set({ lastReconciliationAt: new Date().toISOString() });

              console.log("[Reconcile] Completed successfully");
            } catch (error) {
              console.error("[Reconcile] Error:", error);
            } finally {
              set({ isLoadingPreviousOrders: false });
            }
          },

          // ====================================================================
          // DEBOUNCED REFRESH
          // ====================================================================

          _debouncedOrderRefresh: createDebouncedOrderRefresh(get),
          
          // ====================================================================
          // RECONNECTION LOGIC
          // ====================================================================
          
          // REMOVED: Reconnect logic (now handled by useOrdersRealtime hook)
          _handleOrderReconnect: (locationId: string) => {
            console.warn('[OrderRealtime] _handleOrderReconnect is disabled. Reconnection is now handled by useOrdersRealtime hook.');
            // No-op: Reconnection is now handled by React Query hook
          },

        

          // REMOVED: Cleanup logic (now handled by useOrdersRealtime hook)
          cleanupOrderRealtime: () => {
            console.warn('[OrderRealtime] cleanupOrderRealtime is disabled. Cleanup is now handled by useOrdersRealtime hook.');
            // No-op: Cleanup is now handled by React Query hook
          },

          // --- SYNC BARRIER METHODS ---
          hasPendingSyncs: (orderId: string) => {
            const order = get().ordersById[orderId];
            if (!order) return false;
            // Phase 7D: Check sync store for pending status
            const syncStore = useSyncStatusStore.getState();
            return order.items.some((item) => {
              if (item.isDraft) return false;
              const status = syncStore.itemSyncStatus.get(item.id);
              return status === "pending" || status === "syncing";
            });
          },

          waitForPendingSyncs: async (orderId: string) => {
            const { pendingSyncOperations, ordersById } = get();
            const order = ordersById[orderId];
            if (!order) return;

            // Phase 7D: Get item IDs with pending sync status from sync store
            const syncStore = useSyncStatusStore.getState();
            const pendingItemIds = order.items
              .filter((item) => {
                if (item.isDraft) return false;
                const status = syncStore.itemSyncStatus.get(item.id);
                return status === "pending" || status === "syncing";
              })
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
            if (!order) return { pending: 0, failed: 0, synced: 0 };

            // Phase 7D: Check sync store for status instead of item properties
            const syncStore = useSyncStatusStore.getState();
            let pending = 0;
            let failed = 0;
            let synced = 0;

            for (const item of order.items) {
              if (item.isDraft) continue; // Skip draft items

              const status = syncStore.itemSyncStatus.get(item.id);
              switch (status) {
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
                  // Items without sync status in store are treated as synced
                  // (they have db_order_item_id or are legacy items)
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
            // Phase 7D: Redirect to dedicated sync status store
            // This prevents ordersById from changing on every sync status update,
            // eliminating the render cascade that blocked touch events.
            // Only BillItem subscribes to the sync store for UI indicators.
            useSyncStatusStore.getState().setSyncStatus(itemId, status, error);
          },

          registerSyncOperation: (
            itemId: string,
            promise: Promise<boolean>
          ) => {
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
            // Handle null/undefined orderId - reset all derived state
            if (!orderId) {
              set({
                activeOrderId: null,
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
              return;
            }

            // Set active order ID first
            set({ activeOrderId: orderId });

            // Phase 5: Auto-add to working set when setting active order
            const order = get().ordersById[orderId];
            if (order?.db_order_id) {
              get().addToWorkingSet(order.db_order_id);
            }

            // Synchronously calculate and update all derived state - instant!
            get().recalculateOrder(orderId);
          },

          startNewOrder: (details) => {
            const { activeEmployeeId, employees } = useEmployeeStore.getState();
            const activeEmployee = employees.find(
              (e) => e.id === activeEmployeeId
            );

            // Phase 1 Foundation: Get station context for new orders
            const { currentStationId, currentStation } = get();

            const newOrder: OrderProfile = {
              id: `order_${Date.now()}`,
              service_location_id: details?.tableId || null,
              order_status: "draft",
              customer_name: "",
              check_status: "Opened",
              paid_status: "Unpaid",
              sync_version: 0, // Initialize at 0 for new orders (before backend creation)
              order_type: details?.tableId ? "Dine In" : "Takeaway",
              items: [],
              opened_at: null,
              guest_count: details?.guestCount || 1,
              server_name: activeEmployee?.fullName || "Unknown",

              // Financial fields - initialize to 0 for new orders
              total_amount: 0,
              total_tax: 0,
              total_discount: 0,
              amount_due: 0,
              cash_amount_due: 0,
              amount_paid: 0,

              // Station tracking
              station_id: currentStationId,
              _sourceStationId: currentStationId,
              _sourceStationName: currentStation?.station_name || null,
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

            // Phase 5: Any visible order can be modified - no ownership guard needed

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
                    last_activity_at: new Date().toISOString(),
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
            // SINGLE BATCHED UPDATE: Items + Totals together (no double render)
            // Performance fix: Removed queueMicrotask - now synchronous
            // calculateOrderTotals is O(n) and takes <5ms for typical orders
            // ================================================================
            const taxRatesMap = useStoreSettingsStore.getState().taxRatesMap;
            const totals = calculateOrderTotals(
              updatedCart,
              activeOrder.checkDiscount,
              activeOrder.payments || [],
              taxRatesMap
            );

            set((state) => ({
              ordersById: {
                ...state.ordersById,
                [activeOrderId]: {
                  ...state.ordersById[activeOrderId],
                  items: updatedCart,
                  total_amount: totals.total_amount,
                  total_tax: totals.tax_amount,
                  total_discount: totals.discount_amount,
                  // Keep amount_due in sync with outstanding_total for OrderBadge display
                  amount_due: totals.outstanding_total,
                  cash_amount_due: totals.cash_outstanding_total,
                  last_activity_at: new Date().toISOString(),
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

            // 7. Background sync with promise tracking for sync barriers
            // Use the merged item with updated quantity, or the new item
            const itemToSync = isMergeOperation && mergedItemWithNewQuantity
              ? mergedItemWithNewQuantity
              : (mergeCandidate || newItem);

            if (!itemToSync.isDraft) {
              // Phase 7D: Set pending status in sync store for BillItem indicator
              useSyncStatusStore.getState().setSyncStatus(syncItemId, "pending");
              const orderToSync = get().ordersById[activeOrderId];
              if (orderToSync) {
                const updateItemSyncStatusAction = get().updateItemSyncStatus;
                const registerSyncOp = get().registerSyncOperation;
                const unregisterSyncOp = get().unregisterSyncOperation;
                const currentOrderId = activeOrderId;

                // OFFLINE-FIRST: Mark item as failed instead of removing it
                const markItemFailedAction = (
                  itemId: string,
                  error: string
                ) => {
                  updateItemSyncStatusAction(
                    currentOrderId,
                    itemId,
                    "failed",
                    error
                  );
                };

                const setOrderDbIdAction = (
                  orderId: string,
                  dbOrderId: string,
                  orderNumber: string,
                  displayNumber: string,
                  createdAt: string,
                  syncVersion?: number
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
                        sync_version: syncVersion ?? 1, // Store sync_version from backend
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
                    // Phase 7C: Removed redundant "synced" call - addItemToBackend
                    // already sets sync status to "synced" via useSyncStatusStore
                    if (!success) {
                      // Only need to set failed status here
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

            // Phase 5: Any visible order can be modified - no ownership guard needed

            const originalItem = order.items.find(
              (i) => i.id === updatedItem.id
            );

            // Update items
            const updatedItems = order.items.map((i) =>
              i.id === updatedItem.id ? updatedItem : i
            );
            console.log("updatedItems [updateItemInActiveOrder]",updatedItems.length , updatedItems);

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
                  // Keep amount_due in sync with outstanding_total for OrderBadge display
                  amount_due: totals.outstanding_total,
                  cash_amount_due: totals.cash_outstanding_total,
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
              console.log("syncing item update", updatedItem);
              console.log("originalItem", originalItem);  
              console.log("updatedItem", updatedItem);
              console.log("originalItem quantity", originalItem?.quantity);
              console.log("updatedItem quantity", updatedItem.quantity);
              console.log("originalItem quantity !== updatedItem quantity", originalItem?.quantity !== updatedItem.quantity);
              // 1. Sync quantity change (independent check)
              if (
                originalItem &&
                updatedItem.quantity !== originalItem.quantity
              ) {
                OrderService.updateOrderItemQuantity(
                  _supabaseClient,
                  dbOrderItemId,
                  updatedItem.quantity
                )
                  .then((response) => {
                    if (response.data && response.data.success) {
                      // SUCCESS: Apply backend-calculated data immediately
                      console.log('[updateOrderItemQuantity] Sync succeeded, applying backend data');

                      try {
                        get().applyBackendItemData(updatedItem.id, {
                          quantity: response.data.quantity,

                          // Card pricing
                          card_subtotal: response.data.card_subtotal,
                          card_tax_amount: response.data.card_tax_amount,
                          unit_price: response.data.unit_price,

                          // Cash pricing
                          cash_unit_price: response.data.cash_unit_price,
                          cash_subtotal: response.data.cash_subtotal,
                          cash_tax_amount: response.data.cash_tax_amount,

                          // Discounts
                          discount_amount: response.data.discount_amount,
                          discount_cash_amount: response.data.discount_cash_amount,

                          sync_version: response.data.sync_version,
                        });
                      } catch (err) {
                        console.error('[updateOrderItemQuantity] Failed to apply backend data:', err);
                      }
                    }
                  })
                  .catch(async (err) => {
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
              const originalNotes = originalItem?.customizations?.notes?.trim() == undefined ? '' : originalItem?.customizations?.notes?.trim();
              const instructionsChanged =
                updatedItem.customizations?.notes?.trim() !==
                originalNotes;
              if (instructionsChanged) {
                OrderService.updateOrderItem(_supabaseClient, {
                  p_order_item_id: dbOrderItemId,
                  p_special_instructions:
                    updatedItem.customizations?.notes || null,
                })
                  .then((response) => {
                    if (response.data && response.data.success) {
                      // SUCCESS: Apply backend data (instructions don't change pricing, but include for consistency)
                      console.log('[updateOrderItem] Sync succeeded');

                      try {
                        get().applyBackendItemData(updatedItem.id, {
                          // Include any pricing data returned (for consistency)
                          card_subtotal: response.data.card_subtotal,
                          cash_subtotal: response.data.cash_subtotal,
                          card_tax_amount: response.data.card_tax_amount,
                          cash_tax_amount: response.data.cash_tax_amount,
                          sync_version: response.data.sync_version,
                        });
                      } catch (err) {
                        console.error('[updateOrderItem] Failed to apply backend data:', err);
                      }
                    }
                  })
                  .catch(async (err) => {
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
                )
                  .then((response) => {
                    if (response.data && response.data.success) {
                      // SUCCESS: Apply backend-calculated data immediately
                      console.log('[replaceOrderItemModifiers] Sync succeeded, applying backend data');

                      try {
                        get().applyBackendItemData(updatedItem.id, {
                          // Card pricing
                          card_subtotal: response.data.card_subtotal ?? response.data.new_subtotal,
                          card_tax_amount: response.data.card_tax_amount ?? response.data.tax_update,
                          unit_price: response.data.new_unit_price,

                          // Cash pricing
                          cash_unit_price: response.data.cash_unit_price,
                          cash_subtotal: response.data.cash_subtotal,
                          cash_tax_amount: response.data.cash_tax_amount,

                          // Discounts
                          discount_amount: response.data.discount_amount,
                          discount_cash_amount: response.data.discount_cash_amount,

                          // Modifiers (full array from backend)
                          modifiers: response.data.modifiers,

                          // Sync version for conflict detection
                          sync_version: response.data.sync_version,
                        });
                      } catch (err) {
                        // Don't propagate - broadcast will catch it later
                        console.error('[replaceOrderItemModifiers] Failed to apply backend data:', err);
                      }
                    }
                  })
                  .catch(async (err) => {
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

          /**
           * Apply backend-calculated item data to local item.
           * Called after successful sync operations (replaceModifiers, updateQuantity, updateItem).
           *
           * Merges backend financial calculations into local item while preserving
           * local UI state (selection, draft status, etc.).
           *
           * Handles sync_version to prevent applying stale data (race conditions).
           */
          applyBackendItemData: (
            itemId: string,
            backendData: {
              // Card pricing (primary)
              card_subtotal?: number;
              card_tax_amount?: number;
              unit_price?: number;

              // Cash pricing
              cash_unit_price?: number;
              cash_subtotal?: number;
              cash_tax_amount?: number;

              // Other fields
              quantity?: number;
              discount_amount?: number;
              discount_cash_amount?: number;

              // Modifiers (only from replaceOrderItemModifiers)
              modifiers?: Array<{
                modifier_item_id: string;
                modifier_name: string;
                modifier_group_id: string;
                modifier_group_name: string;
                price_modifier: number;
                quantity: number;
              }>;

              // Sync tracking
              sync_version?: number;
            }
          ) => {
            const { activeOrderId, ordersById } = get();
            if (!activeOrderId) {
              console.warn('[applyBackendItemData] No active order');
              return;
            }

            const order = ordersById[activeOrderId];
            if (!order) {
              console.warn('[applyBackendItemData] Active order not found');
              return;
            }

            // Check sync_version to prevent applying stale data
            if (backendData.sync_version !== undefined) {
              const currentOrderVersion = order.sync_version ?? 0;

              if (backendData.sync_version < currentOrderVersion) {
                // Backend version is older - skip stale data
                // This can happen if broadcast arrives before delayed sync callback
                console.warn(
                  `[applyBackendItemData] Skipping stale backend data for item ${itemId} ` +
                  `(backend v${backendData.sync_version} < local v${currentOrderVersion})`
                );
                return;
              }
            }

            // Find and update the item
            const itemIndex = order.items.findIndex(item => item.id === itemId);
            if (itemIndex === -1) {
              console.warn(`[applyBackendItemData] Item ${itemId} not found in order`);
              return;
            }

            const currentItem = order.items[itemIndex];

            // Merge backend data into item (only provided fields)
            const updatedItem: CartItem = {
              ...currentItem,

              // Backend-calculated financial fields (card pricing)
              ...(backendData.card_subtotal !== undefined && {
                subtotal: backendData.card_subtotal
              }),
              ...(backendData.card_tax_amount !== undefined && {
                taxAmount: backendData.card_tax_amount
              }),
              ...(backendData.unit_price !== undefined && {
                price: backendData.unit_price,
                unitPrice: backendData.unit_price,
              }),

              // Backend-calculated financial fields (cash pricing)
              ...(backendData.cash_unit_price !== undefined && {
                cashPrice: backendData.cash_unit_price
              }),
              ...(backendData.cash_subtotal !== undefined && {
                cashSubtotal: backendData.cash_subtotal
              }),
              ...(backendData.cash_tax_amount !== undefined && {
                cashTaxAmount: backendData.cash_tax_amount
              }),

              // Other fields
              ...(backendData.quantity !== undefined && {
                quantity: backendData.quantity
              }),
              ...(backendData.discount_amount !== undefined && {
                discount_amount: backendData.discount_amount
              }),
              ...(backendData.discount_cash_amount !== undefined && {
                discount_cash_amount: backendData.discount_cash_amount
              }),

              // Update modifiers if provided (from replaceOrderItemModifiers)
              ...(backendData.modifiers !== undefined && {
                customizations: {
                  ...currentItem.customizations,
                  modifiers: transformBackendModifiers(backendData.modifiers),
                },
              }),

              // Mark as synced
              sync_status: 'synced' as const,
            };

            // Create updated items array
            const updatedItems = [...order.items];
            updatedItems[itemIndex] = updatedItem;

            // Recalculate order totals with updated items
            const taxRatesMap = useStoreSettingsStore.getState().taxRatesMap;
            const totals = calculateOrderTotals(
              updatedItems,
              order.checkDiscount,
              order.payments || [],
              taxRatesMap
            );

            // Single atomic state update
            set((state) => ({
              ordersById: {
                ...state.ordersById,
                [activeOrderId]: {
                  ...state.ordersById[activeOrderId],
                  items: updatedItems,

                  // Update order-level totals from calculation
                  total_amount: totals.total_amount,
                  total_tax: totals.tax_amount,
                  total_discount: totals.discount_amount,
                  amount_due: totals.outstanding_total,
                  cash_amount_due: totals.cash_outstanding_total,

                  // Update sync_version if provided
                  ...(backendData.sync_version !== undefined && {
                    sync_version: backendData.sync_version,
                  }),
                },
              },

              // Update derived active order state
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

            console.log(`[applyBackendItemData] Applied backend data to item ${itemId}`, {
              card_subtotal: backendData.card_subtotal,
              cash_subtotal: backendData.cash_subtotal,
              sync_version: backendData.sync_version,
            });
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
            // console.log('[removeItemFromActiveOrder] itemId', itemId);
            // console.log('[removeItemFromActiveOrder] voidReason', voidReason);
            const { activeOrderId, ordersById } = get();
            if (!activeOrderId) return;

            const order = ordersById[activeOrderId]; // O(1) lookup
            if (!order) return;

            // Phase 5: Any visible order can be modified - no ownership guard needed

            const itemToHandle = order.items.find((i) => i.id === itemId);
            if (!itemToHandle) return;
            // console.log('[removeItemFromActiveOrder] itemToHandle', itemToHandle);
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
                  // Keep amount_due in sync with outstanding_total for OrderBadge display
                  amount_due: totals.outstanding_total,
                  cash_amount_due: totals.cash_outstanding_total,
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
            console.log("[confirmDraftItem] itemToConfirm", itemToConfirm);
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
                  // Keep amount_due in sync with outstanding_total for OrderBadge display
                  amount_due: totals.outstanding_total,
                  cash_amount_due: totals.cash_outstanding_total,
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

            // Phase 7D: Set pending status in sync store for BillItem indicator
            useSyncStatusStore.getState().setSyncStatus(itemId, "pending");

            // Sync the confirmed item to backend
            const orderToSync = get().ordersById[activeOrderId];
            if (orderToSync) {
              const updateItemSyncStatusAction = get().updateItemSyncStatus;
              const registerSyncOp = get().registerSyncOperation;
              const unregisterSyncOp = get().unregisterSyncOperation;
              const currentOrderId = activeOrderId;

              // OFFLINE-FIRST: Mark item as failed instead of removing it
              const markItemFailedAction = (
                itemIdToMark: string,
                error: string
              ) => {
                updateItemSyncStatusAction(
                  currentOrderId,
                  itemIdToMark,
                  "failed",
                  error
                );
              };

              const setOrderDbIdAction = (
                orderId: string,
                dbOrderId: string,
                orderNumber: string,
                displayNumber: string,
                createdAt: string,
                syncVersion?: number
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
                      sync_version: syncVersion ?? 1, // Store sync_version from backend
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
                  // Phase 7C: Removed redundant "synced" call - addItemToBackend
                  // already sets sync status to "synced" via useSyncStatusStore
                  if (!success) {
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

            // Update state optimistically - distribute discount to items locally
            // This ensures split payment views show correct prices even before RPC completes
            const itemsWithDistributedDiscount = distributeDiscountToItems(
              order.items,
              totals.discount_amount
            );

            set((state) => ({
              ordersById: {
                ...state.ordersById,
                [orderId]: {
                  ...state.ordersById[orderId],
                  items: itemsWithDistributedDiscount,
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
                  // Keep amount_due in sync with outstanding_total for OrderBadge display
                  amount_due: totals.outstanding_total,
                  cash_amount_due: totals.cash_outstanding_total,
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
                  // Update local state with backend order_discount_id, mark as synced,
                  // and merge affected_items with authoritative discount values from backend
                  set((state) => {
                    const existingOrder = state.ordersById[orderId];
                    if (!existingOrder?.applied_discounts) return state;

                    // Define type for affected items from backend
                    interface AffectedItemFromBackend {
                      id: string;
                      discount_amount: number;
                      subtotal: number;
                      cash_subtotal: number;
                      tax_amount: number;
                      cash_tax_amount: number;
                    }

                    // Build map of affected items by db_order_item_id
                    const affectedMap = new Map<string, AffectedItemFromBackend>(
                      (result.affected_items || []).map((ai: AffectedItemFromBackend) => [ai.id, ai])
                    );

                    // Update items with authoritative discount values from backend
                    const updatedItems = existingOrder.items.map(item => {
                      const affected = affectedMap.get(item.db_order_item_id || "");
                      if (affected) {
                        return {
                          ...item,
                          discount_amount: affected.discount_amount,
                          discount_cash_amount: affected.discount_amount, // Use same for now, backend doesn't return separate cash
                          subtotal: affected.subtotal,
                          cashSubtotal: affected.cash_subtotal,
                          taxAmount: affected.tax_amount,
                          cashTaxAmount: affected.cash_tax_amount,
                        };
                      }
                      return item;
                    });

                    return {
                      ordersById: {
                        ...state.ordersById,
                        [orderId]: {
                          ...existingOrder,
                          items: updatedItems,
                          applied_discounts: existingOrder.applied_discounts.map((d) =>
                            d.local_id === applied.local_id
                              ? { ...d, order_discount_id: result.order_discount_id, sync_status: "synced" as const }
                              : d
                          ),
                        },
                      },
                    };
                  });
                  console.log('[applyDiscountToCheck] RPC success, order_discount_id:', result.order_discount_id, 'affected_items:', result.affected_items?.length);
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
                  // Keep amount_due in sync with outstanding_total for OrderBadge display
                  amount_due: totals.outstanding_total,
                  cash_amount_due: totals.cash_outstanding_total,
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
                  // Keep amount_due in sync with outstanding_total for OrderBadge display
                  amount_due: totals.outstanding_total,
                  cash_amount_due: totals.cash_outstanding_total,
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
                  // Keep amount_due in sync with outstanding_total for OrderBadge display
                  amount_due: totals.outstanding_total,
                  cash_amount_due: totals.cash_outstanding_total,
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
            itemAllocations, // Per-item allocations with quantities for partial payments
            splitCount, // Optional: split count for split payments
            splitPortionIndex, // Optional: split portion index for split payments
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
              activeOrderOutstandingSubtotal:
                get().activeOrderOutstandingSubtotal,
              activeOrderOutstandingTax: get().activeOrderOutstandingTax,
              activeOrderOutstandingTotal: get().activeOrderOutstandingTotal,
              activeOrderTotalCash: get().activeOrderTotalCash,
              activeOrderOutstandingCash: get().activeOrderOutstandingCash,
            };

            // Generate unique local ID and timestamp for this payment
            // This is critical for matching payments during sync (prevents collapse issue)
            const localPaymentId = `payment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const paymentTimestamp = new Date().toISOString();

            // Build itemsCovered from itemAllocations for payment tracking (with quantities)
            const itemsCovered = itemAllocations?.map(alloc => ({
              itemId: alloc.itemId,
              quantity: alloc.quantity,
            }));

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
              ...(itemsCovered && { itemsCovered }),
            };

            const newPayments = [...(order.payments || []), newPayment];

            // Mark items as paid based on itemAllocations (per-item with quantities) or FIFO order (default)
            let updatedItems: typeof order.items;

            // SPLIT PAYMENT FIX: Always mark PAID items as preparing, not just when order is draft/pending
            // This ensures items paid in subsequent splits (when order is already "preparing") also get updated
            // Each item's status is updated individually based on whether IT is being paid now

            if (itemAllocations && itemAllocations.length > 0) {
              // Build a map for quick lookup: itemId -> quantity being paid
              const allocationMap = new Map(
                itemAllocations.map(alloc => [alloc.itemId, alloc.quantity])
              );

              console.log('[allocationMap | addPaymentToOrder] allocationMap', allocationMap);
              // Per-item payment: Increment paidQuantity by the specified quantity (not full quantity)
              updatedItems = order.items.map((item) => {
                const quantityToPay = allocationMap.get(item.db_order_item_id || "");
                if (quantityToPay !== undefined && quantityToPay > 0) {
                  const newPaidQty = Math.min(
                    (item.paidQuantity || 0) + quantityToPay,
                    item.quantity // Don't exceed total quantity
                  );
                  const isFullyPaid = newPaidQty >= item.quantity;
                  // Update this item's status to preparing if it's currently "new"
                  const shouldUpdateThisItem = item.kitchen_status === "new" || !item.kitchen_status;
                  return {
                    ...item,
                    paidQuantity: newPaidQty,
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
            const shouldUpdateToPreparingStatus =
              currentStatus === "draft" || currentStatus === "pending";
            const newOrderStatus = shouldUpdateToPreparingStatus
              ? "preparing"
              : currentStatus;

            // Set opened_at timestamp when transitioning to preparing (if not already set)
            const shouldSetOpenedAt =
              shouldUpdateToPreparingStatus && !order.opened_at;
            const newOpenedAt = shouldSetOpenedAt
              ? new Date().toISOString()
              : order.opened_at;

            // Single atomic update with optimistic payment status
            set((state) => ({
              ordersById: {
                ...state.ordersById,
                [orderId]: {
                  ...state.ordersById[orderId],
                  payments: newPayments,
                  items: updatedItems,
                  total_amount:
                    method === "Cash"
                      ? totals.cash_total_amount
                      : totals.total_amount,
                  total_tax:
                    method === "Cash"
                      ? totals.cash_tax_amount
                      : totals.tax_amount,
                  total_discount: totals.discount_amount,
                  // Update order_status to "preparing" if it was in draft/pending
                  order_status: newOrderStatus,
                  // Set opened_at timestamp when transitioning
                  opened_at: newOpenedAt,
                  // Optimistic update based on calculated outstanding
                  paid_status: isFullyPaid
                    ? ("Paid" as const)
                    : ("Pending" as const),
                  check_status: state.ordersById[orderId].check_status || "Opened",
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
            // For offline/per-item flows, ensure we pass backend IDs when available.
            // This allows the offline queue to resolve them later when items sync.
            const paymentItemAllocations = itemAllocations
              ? itemAllocations.map((alloc) => {
                const item = order.items.find(
                  (i) => i.db_order_item_id === alloc.itemId || i.id === alloc.itemId
                );
                // Prefer backend ID if present, otherwise use local ID
                return {
                  itemId: item?.db_order_item_id || item?.id || alloc.itemId,
                  quantity: alloc.quantity,
                  amount: alloc.amount,
                };
              })
              : undefined;

            const syncSuccess = await syncPaymentToBackend(
              order,
              {
                amount,
                method,
                tipAmount,
                transactionDetails,
                itemAllocations: paymentItemAllocations, // Pass item allocations for per-item payment tracking
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

            // Note: Inventory deduction is handled by archiveOrder when order is archived/completed

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
                  check_status: state.ordersById[orderId].check_status || "Opened",
                  total_amount: totals.total_amount,
                  total_tax: totals.tax_amount,
                  total_discount: totals.discount_amount,
                  // Fully paid orders have 0 outstanding
                  amount_due: 0,
                  cash_amount_due: 0,
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

            if (!order) {
              console.warn(`[archiveOrder] Order ${orderId} not found`);
              return null;
            }

            // Validate order is in archivable state
            const isArchivable =
              ["void", "completed", "cancelled"].includes(order.order_status as string) ||
              order.check_status === "Closed" ||
              order.paid_status === "Paid";

            if (!isArchivable) {
              console.warn(
                `[archiveOrder] Order ${orderId} not archivable:`,
                { order_status: order.order_status, check_status: order.check_status, paid_status: order.paid_status }
              );
              return null;
            }

            console.log(`[archiveOrder] Archiving order ${orderId}`, {
              status: order.order_status,
              check_status: order.check_status,
              total: order.total_amount,
              items: order.items.length,
            });

            // Trigger stock deduction: Local + Backend
            if (order.items.length > 0) {
              try {
                // 1. Update local store immediately
                useInventoryStore.getState().decrementStockFromSale(order.items);
                console.log(`[archiveOrder] Local inventory decremented`);

                // 2. Sync to backend (non-blocking)
                if (order.db_order_id) {
                  const supabase = getOrderStoreSupabaseClient();
                  if (supabase) {
                    supabase
                      .rpc("process_order_inventory_deduction", {
                        p_order_id: order.db_order_id,
                      })
                      .then(({ error }) => {
                        if (error) {
                          console.error(
                            "[archiveOrder] Backend inventory deduction failed:",
                            error
                          );
                          // Queue for retry if needed
                        } else {
                          console.log(
                            "[archiveOrder] Backend inventory deduction successful"
                          );
                        }
                      });
                  }
                }
              } catch (err) {
                console.error("[archiveOrder] Inventory deduction error:", err);
                // Continue archiving despite error
              }
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

            // Audit log
            console.log(`[archiveOrder] Successfully archived`, {
              orderId,
              db_order_id: order.db_order_id,
              final_status: finalOrder.order_status,
              total: finalOrder.total_amount,
              items: order.items.length,
              table_id: tableId,
            });

            // Finally, remove the order from the active orders list
            // Finally, remove the order from the active orders list
            // Update ordersById and orderIds
            const { [orderId]: removed, ...remainingOrdersById } =
              get().ordersById;
            const remainingOrderIds = get().orderIds.filter(
              (id) => id !== orderId
            );

            set((state) => {
              const wasActiveOrder = state.activeOrderId === orderId;
              return {
                ordersById: remainingOrdersById,
                orderIds: remainingOrderIds,
                activeOrderId: wasActiveOrder ? null : state.activeOrderId,
                // Reset derived state if this was the active order
                ...(wasActiveOrder
                  ? {
                      activeOrderSubtotal: 0,
                      activeOrderTax: 0,
                      activeOrderTotal: 0,
                      activeOrderDiscount: 0,
                      activeOrderOutstandingSubtotal: 0,
                      activeOrderOutstandingTax: 0,
                      activeOrderOutstandingTotal: 0,
                      activeOrderTotalCash: 0,
                      activeOrderOutstandingCash: 0,
                    }
                  : {}),
              };
            });

            return tableId;
          },

          /**
           * Clean up abandoned draft orders
           * Removes draft orders inactive for > 30 minutes with no db_id
           */
          cleanupAbandonedDrafts: () => {
            const { ordersById, orderIds } = get();
            const now = Date.now();
            const idsToRemove: string[] = [];

            Object.values(ordersById).forEach((order) => {
              // Only process draft orders without backend ID
              if (order.order_status !== "draft" || order.db_order_id) return;

              // Calculate inactivity duration
              const lastActivity = order.last_activity_at
                ? new Date(order.last_activity_at).getTime()
                : new Date(order.opened_at || 0).getTime();

              const inactivityMs = now - lastActivity;

              // Mark for removal if abandoned
              if (inactivityMs > DRAFT_CLEANUP_TIMEOUT_MS) {
                idsToRemove.push(order.id);
                console.log(
                  `[cleanupAbandonedDrafts] Removing abandoned draft: ${order.id}`,
                  `(inactive for ${Math.floor(inactivityMs / 60000)} minutes)`
                );
              }
            });

            // Remove abandoned drafts
            if (idsToRemove.length > 0) {
              const newOrdersById = { ...ordersById };
              idsToRemove.forEach(id => delete newOrdersById[id]);

              const newOrderIds = orderIds.filter(id => !idsToRemove.includes(id));

              set({
                ordersById: newOrdersById,
                orderIds: newOrderIds,
              });

              console.log(`[cleanupAbandonedDrafts] Removed ${idsToRemove.length} abandoned draft(s)`);
            }
          },

          /**
           * Start periodic draft cleanup (runs every 15 minutes)
           */
          startDraftCleanup: () => {
            // Run initial cleanup
            get().cleanupAbandonedDrafts();

            // Clear any existing interval
            if (draftCleanupInterval) {
              clearInterval(draftCleanupInterval);
            }

            // Schedule periodic cleanup
            draftCleanupInterval = setInterval(() => {
              get().cleanupAbandonedDrafts();
            }, DRAFT_CLEANUP_INTERVAL_MS);

            console.log("[startDraftCleanup] Started (runs every 15 minutes)");
          },

          /**
           * Stop periodic draft cleanup
           */
          stopDraftCleanup: () => {
            if (draftCleanupInterval) {
              clearInterval(draftCleanupInterval);
              draftCleanupInterval = null;
              console.log("[stopDraftCleanup] Stopped");
            }
          },

          /**
           * One-time cleanup: Remove duplicate draft orders
           * Keeps oldest order, removes subsequent duplicates with same display_number + station_id
           */
          cleanupDraftDuplicates: () => {
            const { ordersById, ordersByDbId, orderIds } = get();

            // Group drafts by display_number and station_id
            const draftGroups = new Map<string, OrderProfile[]>();

            Object.values(ordersById).forEach(order => {
              if (
                order.order_status === "draft" &&
                !order.db_order_id &&
                order.display_number &&
                order.station_id
              ) {
                const key = `${order.display_number}_${order.station_id}`;
                const group = draftGroups.get(key) || [];
                group.push(order);
                draftGroups.set(key, group);
              }
            });

            // For each group, keep oldest and remove rest
            const idsToRemove: string[] = [];

            draftGroups.forEach((orders, key) => {
              if (orders.length > 1) {
                // Sort by creation time (oldest first)
                orders.sort((a, b) =>
                  new Date(a.opened_at || 0).getTime() -
                  new Date(b.opened_at || 0).getTime()
                );

                // Keep first, remove rest
                const duplicates = orders.slice(1);
                duplicates.forEach(order => {
                  idsToRemove.push(order.id);
                  console.log(`[CleanupDuplicates] Removing duplicate: ${order.display_number} (${order.id})`);
                });
              }
            });

            // Remove duplicates
            if (idsToRemove.length > 0) {
              const newOrdersById = { ...ordersById };
              const newOrdersByDbId = { ...ordersByDbId };

              idsToRemove.forEach(id => {
                const order = ordersById[id];
                delete newOrdersById[id];
                if (order?.db_order_id) {
                  delete newOrdersByDbId[order.db_order_id];
                }
              });

              set({
                ordersById: newOrdersById,
                ordersByDbId: newOrdersByDbId,
                orderIds: orderIds.filter(id => !idsToRemove.includes(id)),
              });

              console.log(`[CleanupDuplicates] Removed ${idsToRemove.length} duplicate drafts`);
            } else {
              console.log(`[CleanupDuplicates] No duplicates found`);
            }
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

            // Simple map updates all items to ready without merging/consolidating
            // This preserves course info and individual item tracking
            const updatedItems = order.items.map((item) => {
              if (item.isDraft) return item;
              return {
                ...item,
                item_status: "ready" as const,
                kitchen_status: "ready" as const,
              };
            });

            // Force update order status to ready + update items
            // This ensures "Mark as Done" turns the order green and enables payment
            set((state) => ({
              ordersById: {
                ...state.ordersById,
                [orderId]: {
                  ...state.ordersById[orderId],
                  items: updatedItems,
                  order_status: "ready",
                },
              },
            }));

            // Sync item statuses and order status to backend
            const supabase = getOrderStoreSupabaseClient();
            if (supabase && order.db_order_id) {
              const dbItemIds = updatedItems
                .filter((item) => !item.isDraft && item.db_order_item_id)
                .map((item) => item.db_order_item_id as string);

              if (dbItemIds.length > 0) {
                OrderService.bulkUpdateOrderItemStatus(
                  supabase,
                  dbItemIds,
                  "ready"
                ).catch((err) => {
                  console.error(
                    "Failed to update backend item statuses to ready:",
                    err
                  );
                });

                // Explicitly sync order status to ready
                OrderService.updateOrderStatus(
                  supabase,
                  order.db_order_id,
                  "ready"
                ).catch((err) => {
                  console.error(
                    "Failed to update backend order status to ready:",
                    err
                  );
                });
              }
            }
          },

          markAllItemsAsServed: (orderId) => {
            const { ordersById } = get();
            const order = ordersById[orderId];

            if (!order) return;

            // Note: Inventory deduction is handled by archiveOrder when order is archived/completed

            // Create a new items array where every item's kitchen_status is "served"
            const updatedItems = order.items.map((item) => ({
              ...item,
              item_status: "served" as const,
              kitchen_status: "served" as const,
            }));

            // KDS BEHAVIOR: Only update item kitchen_status, NOT order_status
            // Order status is managed by payment/checkout workflow, not kitchen
            set((state) => ({
              ordersById: {
                ...state.ordersById,
                [orderId]: {
                  ...state.ordersById[orderId],
                  items: updatedItems,
                  // Do NOT change order_status here - kitchen tracks items, not order lifecycle
                },
              },
            }));

            // Sync item statuses to backend (not order status)
            const supabase = getOrderStoreSupabaseClient();
            if (supabase && order.db_order_id) {
              const dbItemIds = updatedItems
                .map((item) => item.db_order_item_id)
                .filter((id): id is string => !!id);

              if (dbItemIds.length > 0) {
                OrderService.bulkUpdateOrderItemStatus(
                  supabase,
                  dbItemIds,
                  "served"
                ).catch((err) => {
                  console.error(
                    "Failed to update backend item statuses to served:",
                    err
                  );
                });
              }
            }
          },

          markCourseItemsAsCooking: (orderId, itemIds) => {
            const { ordersById } = get();
            const order = ordersById[orderId];
            if (!order) return;

            // Updated items list: only items in the provided list get updated
            const updatedItems = order.items.map((item) => {
              if (itemIds.includes(item.id)) {
                return {
                  ...item,
                  item_status: "preparing" as const,
                  kitchen_status: "preparing" as const,
                };
              }
              return item;
            });

            set((state) => ({
              ordersById: {
                ...state.ordersById,
                [orderId]: {
                  ...state.ordersById[orderId],
                  items: updatedItems,
                },
              },
            }));

            // Sync to backend
            const supabase = getOrderStoreSupabaseClient();
            if (supabase && order.db_order_id) {
              const targetItems = updatedItems.filter((item) =>
                itemIds.includes(item.id)
              );
              const dbItemIds = targetItems
                .map((item) => item.db_order_item_id)
                .filter((id): id is string => !!id);

              if (dbItemIds.length > 0) {
                OrderService.bulkUpdateOrderItemStatus(
                  supabase,
                  dbItemIds,
                  "preparing"
                ).catch((err) => {
                  console.error(
                    "Failed to update backend items to preparing:",
                    err
                  );
                });
              }
            }
          },

          markCourseItemsAsReady: (orderId, itemIds) => {
            const { ordersById } = get();
            const order = ordersById[orderId];
            if (!order) return;

            const updatedItems = order.items.map((item) => {
              if (itemIds.includes(item.id)) {
                return {
                  ...item,
                  item_status: "ready" as const,
                  kitchen_status: "ready" as const,
                };
              }
              return item;
            });

            set((state) => ({
              ordersById: {
                ...state.ordersById,
                [orderId]: {
                  ...state.ordersById[orderId],
                  items: updatedItems,
                },
              },
            }));

            // Sync to backend
            const supabase = getOrderStoreSupabaseClient();
            if (supabase && order.db_order_id) {
              const targetItems = updatedItems.filter((item) =>
                itemIds.includes(item.id)
              );
              const dbItemIds = targetItems
                .map((item) => item.db_order_item_id)
                .filter((id): id is string => !!id);

              if (dbItemIds.length > 0) {
                OrderService.bulkUpdateOrderItemStatus(
                  supabase,
                  dbItemIds,
                  "ready"
                ).catch((err) => {
                  console.error(
                    "Failed to update backend items to ready:",
                    err
                  );
                });
              }
            }
          },

          markCourseItemsAsServed: (orderId, itemIds) => {
            const { ordersById } = get();
            const order = ordersById[orderId];
            if (!order) return;

            const updatedItems = order.items.map((item) => {
              if (itemIds.includes(item.id)) {
                return {
                  ...item,
                  item_status: "served" as const,
                  kitchen_status: "served" as const,
                };
              }
              return item;
            });

            // Check if ALL items in the order are now served
            const allItemsServed = updatedItems.every(
              (item) => item.kitchen_status === "served"
            );

            // If all items served, set order_status to "ready" (ready for payment/pickup)
            const newOrderStatus = allItemsServed
              ? "ready"
              : order.order_status;

            set((state) => ({
              ordersById: {
                ...state.ordersById,
                [orderId]: {
                  ...state.ordersById[orderId],
                  items: updatedItems,
                  order_status: newOrderStatus as any,
                },
              },
            }));

            // Sync to backend
            const supabase = getOrderStoreSupabaseClient();
            if (supabase && order.db_order_id) {
              // Update item statuses
              const targetItems = updatedItems.filter((item) =>
                itemIds.includes(item.id)
              );
              const dbItemIds = targetItems
                .map((item) => item.db_order_item_id)
                .filter((id): id is string => !!id);

              if (dbItemIds.length > 0) {
                OrderService.bulkUpdateOrderItemStatus(
                  supabase,
                  dbItemIds,
                  "served"
                ).catch((err) => {
                  console.error(
                    "Failed to update backend items to served:",
                    err
                  );
                });
              }

              // If all items served, also update order status to 'ready'
              if (allItemsServed) {
                OrderService.updateOrderStatus(
                  supabase,
                  order.db_order_id,
                  "ready"
                ).catch((err) => {
                  console.error(
                    "Failed to update backend order status to ready:",
                    err
                  );
                });
              }
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
                currentOrder.paid_status === "Paid" ? "Paid" : currentOrder.paid_status === "Partial" ? "Partial" : "Unpaid",
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
              console.log(
                "[sendNewItemsToKitchen] Queueing send_to_kitchen operation for later sync"
              );
              queueFailedOperation(
                "send_to_kitchen",
                { localOrderId: activeOrderId, localItemIds },
                activeOrderId
              );
            }

            toastService.show({
              title: "Items Sent",
              message: `${newItems.length} new item${
                newItems.length > 1 ? "s" : ""
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
              // IMPORTANT: Await status update to prevent race condition with realtime
              // If we don't await, realtime might receive payment update with old status
              // and overwrite our local "preparing" status back to "draft"
              const { error } = await supabase.rpc("update_order_status", {
                p_order_id: order.db_order_id,
                p_new_status: "preparing",
              });

              if (error) {
                console.error("Failed to sync status for order:", error);
                // Queue for retry
                queueFailedOperation(
                  "send_to_kitchen",
                  { localOrderId: orderId, localItemIds },
                  orderId
                );
              }

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
              console.log(
                "[sendNewItemsToKitchenForOrder] Queueing send_to_kitchen operation for later sync"
              );
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
            const order = get().ordersById[activeOrderId];

            // Update ordersById (not deprecated orders array)
            set((state) => ({
              ordersById: {
                ...state.ordersById,
                [activeOrderId]: {
                  ...state.ordersById[activeOrderId],
                  items: [],
                },
              },
            }));

            const supabase = getOrderStoreSupabaseClient();
            if (supabase && order?.db_order_id) {
              OrderService.removeOrderItemsBatch(
                supabase,
                order.items.map((item) => item.id)
              )
                .then(({ error }) => {
                  if (error) {
                    console.error("[useOrderStore.voidOrder] DB error:", error);
                    // Rollback optimistic update on failure
                    set((state) => ({
                      ordersById: {
                        ...state.ordersById,
                        [activeOrderId]: order, // Restore original
                      },
                    }));
                    return false;
                  }
                })
                .catch((err) => console.error("Void order sync failed:", err));
            }

            // Synchronously recalculate (will result in all zeros)
            get().recalculateOrder(activeOrderId);

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

            // OPTIMISTIC UPDATE (Phase 1.3): Instead of full refresh, update affected table optimistically
            // Find and clear the table session for this order
            const { tables, tablesById } = useFloorPlanStore.getState();
            const affectedTable = Object.values(tablesById).find(
              t => t.session?.order_id === order.db_order_id
            );
            if (affectedTable) {
              useFloorPlanStore.setState((state) => {
                const newTables = state.tables.map(t =>
                  t.id === affectedTable.id
                    ? { ...t, session: undefined } // Clear session
                    : t
                );
                return {
                  tables: newTables,
                  tablesById: tables.reduce((acc, table) => {
                    acc[table.id] = table;
                    return acc;
                  }, {} as Record<string, typeof tables[0]>),
                };
              });
            }
            // Let realtime sync handle the rest (debounced)
            return true;
          },

          // ============================================================================
          // VOID PAYMENT - Reverts a payment and restores items to unpaid status
          // ============================================================================
          voidPayment: async (
            orderId: string,
            paymentIndex: number
          ): Promise<boolean> => {
            const { ordersById, activeOrderId } = get();
            const order = ordersById[orderId];

            if (!order || !order.payments?.[paymentIndex]) {
              console.error("[voidPayment] Order or payment not found");
              return false;
            }

            const paymentToVoid = order.payments[paymentIndex];
            const originalOrder = { ...order };

            // 1. OPTIMISTIC UPDATE: Remove payment and restore paidQuantity
            const updatedPayments = order.payments.filter(
              (_, i) => i !== paymentIndex
            );

            // Restore paidQuantity for items covered by this payment
            // Build a map from itemId -> quantity to restore
            const itemsCoveredMap = new Map<string, number>();
            if (paymentToVoid.itemsCovered) {
              for (const covered of paymentToVoid.itemsCovered) {
                // Handle both old format (string) and new format ({itemId, quantity})
                if (typeof covered === 'string') {
                  // Old format: assume full quantity was paid (for backward compatibility)
                  itemsCoveredMap.set(covered, Infinity);
                } else {
                  itemsCoveredMap.set(covered.itemId, covered.quantity);
                }
              }
            }
            const updatedItems = order.items.map((item) => {
              const quantityToRestore = itemsCoveredMap.get(item.db_order_item_id || "");
              if (quantityToRestore !== undefined) {
                // Decrement by specific quantity (not reset to 0)
                const newPaidQty = quantityToRestore === Infinity
                  ? 0 // Old format: reset completely
                  : Math.max(0, (item.paidQuantity || 0) - quantityToRestore);
                return { ...item, paidQuantity: newPaidQty };
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
            const newAmountPaid = updatedPayments.reduce(
              (acc, p) => acc + p.amount + (p.tip_amount || 0),
              0
            );
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
                  paid_status: isStillPaid
                    ? ("Paid" as const)
                    : ("Pending" as const),
                  check_status: isStillPaid
                    ? ("Closed" as const)
                    : ("Opened" as const),
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
                    ordersById: {
                      ...state.ordersById,
                      [orderId]: originalOrder,
                    },
                  }));
                  toastService.show({
                    title: "Void Failed",
                    message:
                      error.message ||
                      "Failed to void payment. Please try again.",
                    type: "error",
                  });
                  return false;
                }

                console.log("[voidPayment] Payment voided successfully");
                toastService.show({
                  title: "Payment Voided",
                  message:
                    "Payment has been voided. Items are now available for payment.",
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
            console.log(
              `[updateOrderDbId] Updated order ${localOrderId} with db_order_id: ${dbOrderId}`
            );
          },

          // Update local order with backend-generated data after sync
          updateOrderFromSync: (
            localOrderId: string,
            backendData: {
              order_number?: number | string;
              display_number?: string;
              opened_at?: string;
              total_amount?: number;
              total_tax?: number;
              subtotal?: number;
              cash_total?: number;
              cash_tax_amount?: number;
              cash_subtotal?: number;
            }
          ) => {
            set((state) => {
              const order = state.ordersById[localOrderId];
              if (!order) return state;

              // Convert order_number to string if provided (backend returns number)
              const orderNumberStr =
                backendData.order_number !== undefined
                  ? String(backendData.order_number)
                  : undefined;

              const updatedOrder: OrderProfile = {
                ...order,
                ...(orderNumberStr !== undefined && {
                  order_number: orderNumberStr,
                }),
                ...(backendData.display_number !== undefined && {
                  display_number: backendData.display_number,
                }),
                ...(backendData.opened_at !== undefined && {
                  opened_at: backendData.opened_at,
                }),
                ...(backendData.total_amount !== undefined && {
                  total_amount: backendData.total_amount,
                }),
                ...(backendData.total_tax !== undefined && {
                  total_tax: backendData.total_tax,
                }),
                ...(backendData.subtotal !== undefined && {
                  subtotal: backendData.subtotal,
                }),
                ...(backendData.cash_total !== undefined && {
                  cash_total: backendData.cash_total,
                }),
                ...(backendData.cash_tax_amount !== undefined && {
                  cash_tax_amount: backendData.cash_tax_amount,
                }),
                ...(backendData.cash_subtotal !== undefined && {
                  cash_subtotal: backendData.cash_subtotal,
                }),
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
            console.log(
              `[updateOrderFromSync] Updated order ${localOrderId} with backend data:`,
              backendData
            );
          },

          // Update local item with DB item ID after successful sync
          updateItemDbId: (
            orderId: string,
            localItemId: string,
            dbItemId: string
          ) => {
            set((state) => {
              const order = state.ordersById[orderId];
              if (!order) return state;

              const updatedItems = order.items.map((item) =>
                item.id === localItemId
                  ? {
                      ...item,
                      db_order_item_id: dbItemId,
                      sync_status: "synced" as const,
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
            console.log(
              `[updateItemDbId] Updated item ${localItemId} with db_order_item_id: ${dbItemId}`
            );
          },

          // Get all orders that have items with failed sync status
          getOrdersWithFailedSyncs: () => {
            const { ordersById } = get();
            // Phase 7D: Check sync store for failed/pending status
            const syncStore = useSyncStatusStore.getState();
            const ordersWithFailedSyncs: Array<{
              localId: string;
              dbId: string | undefined;
            }> = [];

            for (const orderId of Object.keys(ordersById)) {
              const order = ordersById[orderId];
              const hasFailedItems = order.items.some((item) => {
                const status = syncStore.itemSyncStatus.get(item.id);
                return status === "failed" || status === "pending";
              });

              if (hasFailedItems) {
                ordersWithFailedSyncs.push({
                  localId: orderId,
                  dbId: order.db_order_id,
                });
              }
            }

            return ordersWithFailedSyncs;
          },

          // Update order from reconciliation data
          updateOrderFromReconciliation: (
            localOrderId: string,
            updates: Partial<OrderProfile>
          ) => {
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
            console.log(
              `[updateOrderFromReconciliation] Updated order ${localOrderId}`
            );
          },

          // Retry failed syncs for an order
          retryFailedSyncs: async (orderId: string) => {
            const {
              ordersById,
              updateItemSyncStatus,
              registerSyncOperation,
              unregisterSyncOperation,
            } = get();
            const order = ordersById[orderId];
            if (!order) {
              console.log(`[retryFailedSyncs] Order ${orderId} not found`);
              return;
            }

            // Phase 7D: Check sync store for failed status
            const syncStore = useSyncStatusStore.getState();
            const failedItems = order.items.filter((item) => {
              if (item.isDraft) return false;
              return syncStore.itemSyncStatus.get(item.id) === "failed";
            });

            if (failedItems.length === 0) {
              console.log(
                `[retryFailedSyncs] No failed items to retry for order ${orderId}`
              );
              return;
            }

            console.log(
              `[retryFailedSyncs] Retrying ${failedItems.length} failed items for order ${orderId}`
            );

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
                createdAt: string,
                syncVersion?: number
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
                      sync_version: syncVersion ?? 1, // Store sync_version from backend
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
                  // Phase 7C: Removed redundant "synced" call - addItemToBackend
                  // already sets sync status to "synced" via useSyncStatusStore
                  return success;
                })
                .catch((err) => {
                  console.error(
                    `[retryFailedSyncs] Retry failed for item ${item.id}:`,
                    err
                  );
                  updateItemSyncStatus(
                    orderId,
                    item.id,
                    "failed",
                    err?.message || "Retry failed"
                  );
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
          syncOrderFromDatabase: async (
            dbOrderIdOrLocalId: string
          ): Promise<string | null> => {
            const supabase = _supabaseClient;
            if (!supabase) {
              console.log(
                "[syncOrderFromDatabase] No Supabase client available"
              );
              return null;
            }

            // Check if we have this order locally (by local ID or db_order_id)
            let order = get().ordersById[dbOrderIdOrLocalId];
            let localOrderId = dbOrderIdOrLocalId;
            let isNewOrder = false;

            if (!order) {
              // Try to find by db_order_id
              const orderByDbId = Object.values(get().ordersById).find(
                (o) => o.db_order_id === dbOrderIdOrLocalId
              );
              if (orderByDbId) {
                order = orderByDbId;
                localOrderId = orderByDbId.id;
              } else {
                // Creating new order - generate a local ID
                localOrderId = `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                isNewOrder = true;
              }
            }

            // Determine which database ID to use for fetching
            const dbOrderId = order?.db_order_id || dbOrderIdOrLocalId;

            console.log(
              `[syncOrderFromDatabase] Syncing order (local: ${localOrderId}, db: ${dbOrderId})`
            );

            try {
              // 1. Fetch order from database
              const { data: dbOrder, error: orderError } = await supabase
                .from("orders")
                .select("*")
                .eq("id", dbOrderId)
                .single();

              if (orderError) {
                console.error(
                  "[syncOrderFromDatabase] Order fetch error:",
                  orderError
                );
                throw new Error(orderError.message);
              }

              if (!dbOrder) {
                throw new Error("Order not found in database");
              }

              // 2. Fetch order items from database
              const { data: dbItems, error: itemsError } = await supabase
                .from("order_items")
                .select("*")
                .eq("order_id", dbOrderId)
                .eq("is_voided", false);

              if (itemsError) {
                console.error(
                  "[syncOrderFromDatabase] Items fetch error:",
                  itemsError
                );
                throw new Error(itemsError.message);
              }

              // 3. Fetch payments from database
              const { data: dbPayments, error: paymentsError } = await supabase
                .from("order_payments")
                .select("*")
                .eq("order_id", dbOrderId)
                .eq("status", "captured");

              // 4. Fetch items payment allocations from database
              const { data: dbItemPayments, error: itemPaymentsError } = await supabase
                .from("order_item_payments")
                .select("*")
                .eq("order_id", dbOrderId);

              if (paymentsError) {
                console.error(
                  "[syncOrderFromDatabase] Payments fetch error:",
                  paymentsError
                );
                // Non-fatal - continue without payments
              }

              console.log("[syncOrderFromDatabase] Fetched data:", {
                order: dbOrder,
                items: dbItems?.length || 0,
                payments: dbPayments?.length || 0,
              });

              // 4. Update local state with database values
              set((state) => {
                const localOrder = state.ordersById[localOrderId];

                // If order doesn't exist locally, we need to create it from DB data
                // Otherwise, sync existing order with DB data
                const syncedItems = localOrder
                  ? localOrder.items.map((localItem) => {
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
                      // Preserve course number from backend to prevent items being grouped into course 1
                      courseNumber: dbItem.course_number || localItem.courseNumber || 1,
                      // Sync discount distribution fields from backend
                      discount_amount: dbItem.discount_amount ?? 0,
                      discount_cash_amount: dbItem.discount_cash_amount ?? dbItem.discount_amount ?? 0,
                      subtotal: dbItem.subtotal,
                      cashSubtotal: dbItem.cash_subtotal,
                      taxAmount: dbItem.tax_amount,
                      cashTaxAmount: dbItem.cash_tax_amount,
                      sync_status: "synced" as const,
                      sync_error: undefined,
                    };
                  }
                  return localItem;
                })
                  : []; // If no local order, start with empty array

                // Also add any items from DB that aren't in local state
                const localItemDbIds = new Set(
                  (localOrder?.items || [])
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
                      // For open items, use open_item_name; otherwise use item_name
                      name: dbItem.is_open_item ? (dbItem.open_item_name || "Open Item") : (dbItem.item_name || "Unknown Item"),
                      // For open items, use open_item_price; otherwise use unit_price
                      price: dbItem.is_open_item ? (dbItem.open_item_price || 0) : (dbItem.unit_price || 0),
                      unitPrice: dbItem.is_open_item ? (dbItem.open_item_price || 0) : (dbItem.unit_price || 0),
                      cashPrice: dbItem.cash_price || dbItem.cash_unit_price || (dbItem.is_open_item ? dbItem.open_item_price : dbItem.unit_price) || 0,
                      originalPrice: dbItem.cash_price || dbItem.cash_unit_price || (dbItem.is_open_item ? dbItem.open_item_price : dbItem.unit_price) || 0,
                      quantity: dbItem.quantity || 1,
                      paidQuantity: dbItem.paid_quantity || 0,
                      // Preserve course number from backend to prevent items being grouped into course 1
                      courseNumber: dbItem.course_number || 1,
                      category_name: dbItem.category_name || "Uncategorized",
                      is_voided: dbItem.is_voided || false,
                      sync_status: "synced" as const,
                      customizations: {
                        notes: dbItem.special_instructions || undefined,
                      },
                      // Open item support
                      is_open_item: dbItem.is_open_item || false,
                      open_item_name: dbItem.open_item_name || undefined,
                      open_item_price: dbItem.open_item_price || undefined,
                      // Required CartItem financial fields
                      subtotal:
                        dbItem.subtotal ||
                        dbItem.unit_price * dbItem.quantity ||
                        0,
                      cashSubtotal:
                        dbItem.cash_subtotal ||
                        dbItem.cash_price * dbItem.quantity ||
                        0,
                      taxRate: dbItem.tax_rate || 0,
                      taxAmount: dbItem.tax_amount || 0,
                      cashTaxAmount: dbItem.cash_tax_amount || 0,
                      // Discount distribution fields
                      discount_amount: dbItem.discount_amount ?? 0,
                      discount_cash_amount: dbItem.discount_cash_amount ?? dbItem.discount_amount ?? 0,
                    })) || [];

                const allItems = [...syncedItems, ...newItemsFromDb];

                // Map payments from database
                const syncedPayments =
                  dbPayments?.map((p) => ({
                    id: p.id,
                    amount: p.amount,
                    method: (p.payment_method === "card"
                      ? "Card"
                      : "Cash") as PaymentType,
                    cardBrand: p.card_brand,
                    last4: p.card_last4,
                    tip_amount: p.tip_amount,
                    // Convert backend item_ids to new format with quantities
                    // Backend doesn't store quantities per payment, so default to 1
                    itemsCovered: (p.item_ids || []).map((itemId: string) => ({ itemId, quantity: 1 })),
                    timestamp: p.created_at,
                    isVoided: p.status === "voided",
                  })) || localOrder?.payments || [];

                // ================================================================
                // CALCULATE paid_status FROM LOCAL PAYMENTS ONLY
                // ================================================================
                // CRITICAL: Use local payments array as single source of truth
                // This prevents flicker caused by stale/racing backend values
                const orderTotalAmount = dbOrder.card_total || dbOrder.total_amount || 0;
                const syncedPaidStatus = calculatePaidStatusFromPayments(
                  syncedPayments,
                  orderTotalAmount
                );
                const isPaid = syncedPaidStatus === "Paid";

                // Create base order profile (either update existing or create new)
                const baseOrderProfile = localOrder || {
                  id: localOrderId,
                  db_order_id: dbOrderId,
                  service_location_id: dbOrder.table_id || dbOrder.service_location_id,
                  order_status: (dbOrder.status as any) || "preparing",
                  order_type: "Dine In",
                  opened_at: dbOrder.created_at,
                };

                // If creating new order, add to orderIds array
                const newOrderIds = localOrder
                  ? state.orderIds
                  : [...state.orderIds, localOrderId];

                return {
                  ordersById: {
                    ...state.ordersById,
                    [localOrderId]: {
                      ...baseOrderProfile,
                      items: allItems,
                      payments: syncedPayments,
                      // Use database as source of truth for financial data
                      amount_paid: dbOrder.amount_paid || 0,
                      amount_due: dbOrder.amount_due || 0,
                      cash_amount_due: dbOrder.cash_amount_due,  // Direct from DB - authoritative
                      total_amount: dbOrder.card_total || dbOrder.total_amount,
                      total_tax: dbOrder.card_tax_amount || dbOrder.tax_amount,
                      subtotal: dbOrder.card_subtotal || dbOrder.subtotal,
                      paid_status: syncedPaidStatus,
                      check_status: isPaid ? ("Closed" as const) : ("Opened" as const),
                      sync_status: "synced" as const,
                    },
                  },
                  orderIds: newOrderIds,
                  // Update outstanding totals if this is the active order
                  ...(localOrderId === state.activeOrderId
                    ? {
                        activeOrderOutstandingTotal: dbOrder.amount_due || 0,
                        // Priority: backend cash_amount_due > current local value > card amount_due
                        activeOrderOutstandingCash:
                          dbOrder.cash_amount_due ??
                          state.activeOrderOutstandingCash ??
                          dbOrder.amount_due ??
                          0,
                        activeOrderTotal:
                          dbOrder.card_total || dbOrder.total_amount || 0,
                        activeOrderTax:
                          dbOrder.card_tax_amount || dbOrder.tax_amount || 0,
                        activeOrderSubtotal:
                          dbOrder.card_subtotal || dbOrder.subtotal || 0,
                      }
                    : {}),
                };
              });

              console.log(
                "[syncOrderFromDatabase] Successfully synced order from database"
              );
              return localOrderId;
            } catch (error: any) {
              console.error("[syncOrderFromDatabase] Error:", error);
              return null;
            }
          },

          // ============================================================================
          // PAYMENT STATUS SYNC WITH LOADING STATE
          // ============================================================================
          /**
           * Syncs payment status from backend with loading state for UI feedback.
           * Shows spinner during sync instead of potentially incorrect status.
           *
           * @param orderId - The local order ID to sync payment status for
           */
          syncPaymentStatus: async (orderId: string): Promise<void> => {
            const supabase = _supabaseClient;
            if (!supabase) {
              console.log("[syncPaymentStatus] No Supabase client available");
              return;
            }

            const order = get().ordersById[orderId];
            if (!order || !order.db_order_id) {
              console.log("[syncPaymentStatus] Order not found or not synced to DB");
              return;
            }

            console.log(`[syncPaymentStatus] Starting sync for order ${orderId}`);
            set({ paymentSyncStatus: "syncing" });

            try {
              // Fetch fresh payment data from backend
              const { data: dbOrder, error: orderError } = await supabase
                .from("orders")
                .select("payment_status, amount_due, cash_amount_due, amount_paid, card_total, cash_total, total_amount")
                .eq("id", order.db_order_id)
                .single();

              if (orderError) throw orderError;

              // Fetch fresh payments list
              const { data: dbPayments, error: paymentsError } = await supabase
                .from("order_payments")
                .select("*")
                .eq("order_id", order.db_order_id)
                .eq("status", "captured");

              if (paymentsError) {
                console.warn("[syncPaymentStatus] Payments fetch error:", paymentsError);
              }

              // Map payments to local format
              const syncedPayments = dbPayments?.map((p) => ({
                id: p.id,
                amount: p.amount,
                method: (p.payment_method === "card" ? "Card" : "Cash") as PaymentType,
                cardBrand: p.card_brand,
                last4: p.card_last4,
                tip_amount: p.tip_amount,
                itemsCovered: (p.item_ids || []).map((itemId: string) => ({ itemId, quantity: 1 })),
                timestamp: p.created_at,
                isVoided: p.status === "voided",
              })) || [];

              // Calculate status from fresh payments
              const orderTotalAmount = dbOrder.card_total || dbOrder.total_amount || 0;
              const freshPaidStatus = calculatePaidStatusFromPayments(syncedPayments, orderTotalAmount);
              const isPaid = freshPaidStatus === "Paid";

              console.log("[syncPaymentStatus] Fresh status:", {
                paidStatus: freshPaidStatus,
                amountDue: dbOrder.amount_due,
                amountPaid: dbOrder.amount_paid,
                paymentsCount: syncedPayments.length,
              });

              // Update order with fresh backend values
              set((state) => ({
                paymentSyncStatus: "idle",
                ordersById: {
                  ...state.ordersById,
                  [orderId]: {
                    ...state.ordersById[orderId],
                    amount_due: dbOrder.amount_due ?? 0,
                    cash_amount_due: dbOrder.cash_amount_due,
                    amount_paid: dbOrder.amount_paid ?? 0,
                    paid_status: freshPaidStatus,
                    check_status: isPaid ? ("Closed" as const) : ("Opened" as const),
                    payments: syncedPayments.length > 0 ? syncedPayments : state.ordersById[orderId]?.payments,
                  },
                },
                // Update outstanding totals if this is the active order
                ...(orderId === state.activeOrderId
                  ? {
                      activeOrderOutstandingTotal: dbOrder.amount_due ?? 0,
                      activeOrderOutstandingCash: dbOrder.cash_amount_due,
                    }
                  : {}),
              }));

              console.log("[syncPaymentStatus] Successfully synced payment status");
            } catch (error: any) {
              console.error("[syncPaymentStatus] Error:", error);
              set({ paymentSyncStatus: "error" });
              // Auto-reset to idle after 3 seconds on error
              setTimeout(() => {
                set({ paymentSyncStatus: "idle" });
              }, 3000);
            }
          },

          // Prefetch multiple orders by their database IDs for cache warming
          prefetchOrders: async (orderIds: string[]): Promise<void> => {
            const supabase = _supabaseClient;
            if (!supabase || orderIds.length === 0) return;

            // Filter out already cached orders (check by db_order_id)
            const uncachedIds = orderIds.filter((id) => {
              const exists = get().ordersByDbId[id];
              return !exists;
            });

            if (uncachedIds.length === 0) {
              // console.log("[prefetchOrders] All orders already cached");
              return;
            }

            console.log("[prefetchOrders] Fetching", uncachedIds.length, "orders");

            try {
              // Batch fetch orders with items
              const { data, error } = await supabase
                .from("orders")
                .select("*, order_items(*)")
                .in("id", uncachedIds);

              if (error) {
                console.error("[prefetchOrders] Fetch error:", error);
                return;
              }

              if (!data || data.length === 0) {
                console.log("[prefetchOrders] No orders found");
                return;
              }

              // Transform and inject into store
              const newOrders: Record<string, OrderProfile> = {};
              const newOrderIds: string[] = [];

              for (const order of data) {
                const localId = `prefetch_${order.id}_${Date.now()}`;
                const orderProfile: OrderProfile = {
                  id: localId,
                  db_order_id: order.id,
                  order_number: order.order_number,
                  display_number: order.display_number,
                  sync_status: "synced",
                  service_location_id: order.table_id || "",
                  order_status: order.status || "draft",
                  check_status: order.status === "completed" ? "Closed" : "Opened",
                  paid_status:
                    order.payment_status === "paid"
                      ? "Paid"
                      : order.payment_status === "partial"
                        ? "Partial"
                        : "Unpaid",
                  order_type: (order.order_type as any) || "Dine In",
                  items:
                    (order.order_items || []).map((item: any) => ({
                      id: `item_${item.id}`,
                      isDraft: false,
                      menuItemId: item.menu_item_id || "",
                      // For open items, use open_item_name; otherwise use item_name
                      name: item.is_open_item ? (item.open_item_name || "Open Item") : (item.item_name || "Unknown Item"),
                      // For open items, use open_item_price; otherwise use unit_price
                      price: item.is_open_item ? (item.open_item_price || 0) : (item.unit_price || 0),
                      unitPrice: item.is_open_item ? (item.open_item_price || 0) : (item.unit_price || 0),
                      cashPrice: item.cash_price || item.cash_unit_price || (item.is_open_item ? item.open_item_price : item.unit_price) || 0,
                      originalPrice: item.cash_price || item.cash_unit_price || (item.is_open_item ? item.open_item_price : item.unit_price) || 0,
                      quantity: item.quantity || 1,
                      paidQuantity: item.paid_quantity || 0,
                      db_order_item_id: item.id,
                      courseNumber: item.course_number || 1,
                      category_name: item.category_name || "Uncategorized",
                      item_status: item.item_status || "pending",
                      kitchen_status: item.item_status || "pending",
                      is_voided: item.is_voided || false,
                      // Open item support
                      is_open_item: item.is_open_item || false,
                      open_item_name: item.open_item_name || undefined,
                      open_item_price: item.open_item_price || undefined,
                      customizations: {
                        notes: item.special_instructions || undefined,
                        modifiers: [],
                      },
                      // Financial fields
                      subtotal: item.subtotal || ((item.is_open_item ? item.open_item_price : item.unit_price) * item.quantity) || 0,
                      cashSubtotal: item.cash_subtotal || (item.cash_price * item.quantity) || 0,
                      taxRate: item.tax_rate || 0,
                      taxAmount: item.tax_amount || 0,
                      cashTaxAmount: item.cash_tax_amount || 0,
                      // Discount distribution fields
                      discount_amount: item.discount_amount ?? 0,
                      discount_cash_amount: item.discount_cash_amount ?? item.discount_amount ?? 0,
                    })) || [],
                  payments: [],
                  opened_at: order.created_at,
                  amount_due: order.amount_due,
                  cash_amount_due: order.cash_amount_due,
                  amount_paid: order.amount_paid,
                };

                newOrders[localId] = orderProfile;
                newOrderIds.push(localId);
              }

              // Merge into store
              set((state) => ({
                ordersById: { ...state.ordersById, ...newOrders },
                orderIds: [...state.orderIds, ...newOrderIds],
              }));

              // console.log("[prefetchOrders] Prefetched", newOrderIds.length, "orders");
            } catch (error: any) {
              console.error("[prefetchOrders] Error:", error);
            }
          },

          // ============================================================================
          // NEW: Order Calculation Actions
          // ============================================================================

          /**
           * Recalculate order totals and update state.
           * Call this after any item/discount change for instant UI updates.
           *
           * @param orderId - The local order ID to recalculate
           * @returns The calculated OrderTotals
           */
          recalculateOrder: (orderId: string): OrderTotals => {
            const order = get().ordersById[orderId];
            if (!order) {
              return {
                subtotal: 0,
                discount_amount: 0,
                tax_amount: 0,
                total_amount: 0,
                outstanding_subtotal: 0,
                outstanding_tax: 0,
                outstanding_total: 0,
                cash_subtotal: 0,
                cash_tax_amount: 0,
                cash_total_amount: 0,
                cash_outstanding_subtotal: 0,
                cash_outstanding_tax: 0,
                cash_outstanding_total: 0,
              };
            }

            const taxRatesMap = useStoreSettingsStore.getState().taxRatesMap;
            const totals = calculateOrderTotals(
              order.items,
              order.checkDiscount ?? null,
              order.payments ?? [],
              taxRatesMap
            );

            // PRIORITY: If order has backend-synced amount_due, use it as authoritative
            // This is crucial after payments have been processed
            const hasBackendAmountDue =
              order.amount_due !== undefined && order.amount_due >= 0;

            const finalOutstandingTotal = hasBackendAmountDue
              ? order.amount_due
              : totals.outstanding_total;

            const finalCashOutstandingTotal =
              order.cash_amount_due !== undefined && order.cash_amount_due >= 0
                ? order.cash_amount_due
                : totals.cash_outstanding_total;

            // Update order with new totals (use backend values for outstanding if available)
            set((state) => ({
              ordersById: {
                ...state.ordersById,
                [orderId]: {
                  ...state.ordersById[orderId],
                  total_amount: totals.total_amount,
                  total_tax: totals.tax_amount,
                  total_discount: totals.discount_amount,
                  amount_due: finalOutstandingTotal,
                  cash_amount_due: finalCashOutstandingTotal,
                },
              },
              // Update active order derived state if this is the active order
              ...(orderId === state.activeOrderId
                ? {
                    activeOrderSubtotal: totals.subtotal,
                    activeOrderTax: totals.tax_amount,
                    activeOrderTotal: totals.total_amount,
                    activeOrderDiscount: totals.discount_amount,
                    activeOrderOutstandingSubtotal: totals.outstanding_subtotal,
                    activeOrderOutstandingTax: totals.outstanding_tax,
                    activeOrderOutstandingTotal: finalOutstandingTotal,
                    activeOrderTotalCash: totals.cash_total_amount,
                    activeOrderOutstandingCash: finalCashOutstandingTotal,
                  }
                : {}),
            }));

            // Auto-manage paid_status from payments
            const hasItems = (order.items?.length || 0) > 0;
            if (hasItems) {
              const correctPaidStatus = calculatePaidStatusFromPayments(
                order.payments,
                totals.total_amount
              );
              if (correctPaidStatus !== order.paid_status) {
                set((state) => ({
                  ordersById: {
                    ...state.ordersById,
                    [orderId]: {
                      ...state.ordersById[orderId],
                      paid_status: correctPaidStatus,
                    },
                  },
                }));
              }
            }

            // Invalidate payment preview cache
            paymentPreviewService.invalidateCache(orderId);

            return totals;
          },

          /**
           * Mark items as paid after a successful payment.
           * Updates paidQuantity on items and recalculates totals.
           *
           * @param orderId - The local order ID
           * @param allocations - Array of item payment allocations
           */
          markItemsPaid: (orderId: string, allocations: ItemPaymentAllocation[]): void => {
            const order = get().ordersById[orderId];
            if (!order) return;

            const updatedItems = applyPaymentToItems(order.items, allocations);

            set((state) => ({
              ordersById: {
                ...state.ordersById,
                [orderId]: {
                  ...state.ordersById[orderId],
                  items: updatedItems,
                },
              },
            }));

            // Recalculate after marking paid
            get().recalculateOrder(orderId);
          },

          /**
           * Sync order from backend after payment to ensure consistency.
           * Fetches fresh data from backend and updates local state.
           *
           * @param orderId - The local order ID to sync
           */
          syncOrderFromBackend: async (orderId: string): Promise<void> => {
            const order = get().ordersById[orderId];
            if (!order?.db_order_id) {
              console.log("[syncOrderFromBackend] Order not found or not synced to DB");
              return;
            }

            const supabase = _supabaseClient;
            if (!supabase || !getIsOnline()) {
              console.log("[syncOrderFromBackend] Offline or no client");
              return;
            }

            try {
              // Fetch fresh order data
              const { data: dbOrder, error: orderError } = await supabase
                .from("orders")
                .select(`
                  id, total_amount, subtotal, tax_amount, discount_amount,
                  amount_paid, amount_due, payment_status,
                  card_total, cash_total, cash_amount_due
                `)
                .eq("id", order.db_order_id)
                .single();

              if (orderError) throw orderError;

              // Fetch fresh item data
              const { data: dbItems, error: itemsError } = await supabase
                .from("order_items")
                .select("id, paid_quantity, subtotal, tax_amount, discount_amount")
                .eq("order_id", order.db_order_id);

              if (itemsError) throw itemsError;

              // Update local state with backend values
              set((state) => {
                const currentOrder = state.ordersById[orderId];
                if (!currentOrder) return state;

                // Update items with backend paid_quantity
                const updatedItems = currentOrder.items.map((item) => {
                  const dbItem = dbItems?.find(
                    (di) => di.id === item.db_order_item_id
                  );
                  if (!dbItem) return item;
                  return {
                    ...item,
                    paidQuantity: dbItem.paid_quantity ?? item.paidQuantity,
                    subtotal: dbItem.subtotal ?? item.subtotal,
                    taxAmount: dbItem.tax_amount ?? item.taxAmount,
                    discount_amount: dbItem.discount_amount ?? item.discount_amount,
                  };
                });

                const paidStatus =
                  dbOrder.payment_status === "paid"
                    ? "Paid"
                    : dbOrder.payment_status === "partial"
                      ? "Partial"
                      : "Pending";

                return {
                  ordersById: {
                    ...state.ordersById,
                    [orderId]: {
                      ...currentOrder,
                      items: updatedItems,
                      total_amount: dbOrder.card_total ?? dbOrder.total_amount,
                      total_tax: dbOrder.tax_amount,
                      total_discount: dbOrder.discount_amount,
                      amount_paid: dbOrder.amount_paid,
                      amount_due: dbOrder.amount_due,
                      cash_amount_due: dbOrder.cash_amount_due,
                      paid_status: paidStatus,
                    },
                  },
                  // Update active order derived state if this is the active order
                  ...(orderId === state.activeOrderId
                    ? {
                        activeOrderTotal: dbOrder.card_total ?? dbOrder.total_amount,
                        activeOrderTax: dbOrder.tax_amount,
                        activeOrderDiscount: dbOrder.discount_amount,
                        activeOrderOutstandingTotal: dbOrder.amount_due,
                        activeOrderOutstandingCash: dbOrder.cash_amount_due,
                      }
                    : {}),
                };
              });

              // Invalidate cache
              paymentPreviewService.invalidateCache(orderId);

              console.log("[syncOrderFromBackend] Successfully synced order", orderId);
            } catch (error: any) {
              console.error("[syncOrderFromBackend] Error:", error);
            }
          },

          // ===================================================================
          // QUEUED UPDATE ACTIONS (Phase 3: Race Condition Prevention)
          // ===================================================================

          /**
           * Apply queued backend updates after local sync completes.
           * Called after item sync to apply updates that were queued while local changes were pending.
           *
           * @param orderId - The local order ID to apply queued updates for
           */
          applyQueuedUpdates: (orderId: string) => {
            const { pendingBackendUpdates, ordersById } = get();
            const queuedUpdate = pendingBackendUpdates.get(orderId);

            if (!queuedUpdate) {
              // No queued updates for this order
              return;
            }

            const order = ordersById[orderId];
            if (!order) {
              console.warn('[applyQueuedUpdates] Order not found:', orderId);
              // Clean up orphaned queue entry
              set((state) => {
                const newMap = new Map(state.pendingBackendUpdates);
                newMap.delete(orderId);
                return { pendingBackendUpdates: newMap };
              });
              return;
            }

            console.log('[applyQueuedUpdates] Applying queued update for order:', orderId, {
              source: queuedUpdate.source,
              queuedAt: new Date(queuedUpdate.timestamp).toISOString(),
              fields: Object.keys(queuedUpdate.updates)
            });

            // Apply the queued updates
            set((state) => {
              const updatedOrder = { ...order, ...queuedUpdate.updates };

              // Remove from queue
              const newMap = new Map(state.pendingBackendUpdates);
              newMap.delete(orderId);

              return {
                ordersById: {
                  ...state.ordersById,
                  [orderId]: updatedOrder,
                },
                // Update ordersByDbId if db_order_id exists
                ...(updatedOrder.db_order_id ? {
                  ordersByDbId: {
                    ...state.ordersByDbId,
                    [updatedOrder.db_order_id]: updatedOrder,
                  }
                } : {}),
                pendingBackendUpdates: newMap,
              };
            });

            console.log('[applyQueuedUpdates] Successfully applied queued updates for order:', orderId);
          },

          /**
           * Clean up stale queued updates (older than 5 minutes).
           * Called periodically to prevent memory leaks from abandoned updates.
           */
          cleanupStaleQueuedUpdates: () => {
            const TTL_MS = 5 * 60 * 1000; // 5 minutes
            const now = Date.now();

            set((state) => {
              const newMap = new Map(state.pendingBackendUpdates);
              let cleanedCount = 0;

              for (const [orderId, update] of newMap.entries()) {
                if (now - update.timestamp > TTL_MS) {
                  console.log('[cleanupStaleQueuedUpdates] Removing stale update:', {
                    orderId,
                    age: Math.round((now - update.timestamp) / 1000),
                    source: update.source,
                  });
                  newMap.delete(orderId);
                  cleanedCount++;
                }
              }

              if (cleanedCount > 0) {
                console.log('[cleanupStaleQueuedUpdates] Cleaned up', cleanedCount, 'stale updates');
                return { pendingBackendUpdates: newMap };
              }

              return state; // No changes
            });
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
          // Persist working set (Phase 5)
          workingSetOrderIds: state.workingSetOrderIds,
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

// OPTIMIZED: Only sync ordersByDbId (O(n) on keys only, not full array recreation)
// Removed 'orders' array sync - use Object.values(ordersById) when iteration is needed
// This eliminates O(n) array recreation on every order change
useOrderStore.subscribe(
  (state) => state.ordersById,
  (ordersById) => {
    // Build ordersByDbId index for O(1) lookup by db_order_id
    const ordersByDbId: Record<string, OrderProfile> = {};
    for (const id in ordersById) {
      const order = ordersById[id];
      if (order.db_order_id) {
        ordersByDbId[order.db_order_id] = order;
      }
    }
    useOrderStore.setState({ ordersByDbId });
  }
);

// ============================================================================
// PHASE 1 FOUNDATION: Auto-sync station context from useStoreSettingsStore
// ============================================================================
// This ensures order store has station context when selectedStation changes
// Station context includes view_scope and capabilities for station-based order management

// Track previous station to detect changes
let _previousSelectedStationId: string | null = null;

// Initial sync on module load
const initialStation = useStoreSettingsStore.getState().selectedStation;
if (initialStation) {
  const station: Station = {
    id: initialStation.id,
    station_name: initialStation.station_name,
    station_type: initialStation.station_type as Station["station_type"],
    station_number: initialStation.station_number,
    is_active: true,
    is_available: true,
    current_session: null,
    view_scope: initialStation.view_scope,
    can_create_orders: initialStation.can_create_orders,
    can_process_payments: initialStation.can_process_payments,
    can_void_orders: initialStation.can_void_orders,
    can_apply_discounts: initialStation.can_apply_discounts,
    can_update_kitchen_status: initialStation.can_update_kitchen_status,
  };
  // Defer to avoid circular dependency during initialization
  setTimeout(() => {
    useOrderStore.getState().setCurrentStation(station);
  }, 0);
  _previousSelectedStationId = initialStation.id;
}

// Subscribe to changes
useStoreSettingsStore.subscribe((state) => {
  const selectedStation = state.selectedStation;
  const currentStationId = selectedStation?.id || null;

  // Only update if station changed
  if (currentStationId !== _previousSelectedStationId) {
    _previousSelectedStationId = currentStationId;

    if (selectedStation) {
      // Convert SelectedStation to Station format with capability fields
      const station: Station = {
        id: selectedStation.id,
        station_name: selectedStation.station_name,
        station_type: selectedStation.station_type as Station["station_type"],
        station_number: selectedStation.station_number,
        is_active: true,
        is_available: true,
        current_session: null,
        // Phase 1 Foundation: view_scope and capabilities from SelectedStation
        view_scope: selectedStation.view_scope,
        can_create_orders: selectedStation.can_create_orders,
        can_process_payments: selectedStation.can_process_payments,
        can_void_orders: selectedStation.can_void_orders,
        can_apply_discounts: selectedStation.can_apply_discounts,
        can_update_kitchen_status: selectedStation.can_update_kitchen_status,
      };
      useOrderStore.getState().setCurrentStation(station);

      // Phase 3: Trigger initial order fetch after station is set
      // Small delay to ensure station context is fully applied
      setTimeout(async () => {
        const orderStore = useOrderStore.getState();

        // Fetch orphaned orders from our station (handles app reinstall scenario)
        await orderStore.fetchOwnStationOrders();

        // Fetch remote orders based on view_scope
        await orderStore.fetchRemoteOrders();

        // Set initial reconciliation timestamp
        useOrderStore.setState({ lastReconciliationAt: new Date().toISOString() });

        console.log("[OrderStore] Initial order fetch completed for station:", station.station_name);
      }, 100);
    } else {
      // Clear station context when station is deselected
      useOrderStore.setState({
        currentStationId: null,
        currentStation: null,
        remoteOrdersEnabled: false,
      });
      console.log("[OrderStore] Station context cleared");
    }
  }
});


// ============================================================================
// HELPER FUNCTIONS (add outside store)
// ============================================================================

function mapBackendOrderStatus(status: string): OrderProfile['order_status'] {
  const map: Record<string, OrderProfile['order_status']> = {
    'draft': 'draft',
    'pending': 'pending',
    'preparing': 'preparing',
    'ready': 'ready',
    'completed': 'completed',
    'cancelled': 'cancelled',
    'refunded': 'refunded',
    'void': 'void',
  };
  return map[status] || 'pending';
}

// mapPaymentStatus is now imported from @/utils/orderTransformers