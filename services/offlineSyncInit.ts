/**
 * Offline Sync Initialization
 *
 * Bridges the offlineSyncService with useOrderStore.
 * Call initializeOfflineSync() once at app startup (e.g., in _layout.tsx).
 *
 * Enhanced with:
 * - ID resolution from local to backend IDs
 * - Payment special handling with notifications
 * - Dependency-aware operation execution
 */

import {
  initIdRegistry,
  isLocalId,
  mapLocalToBackend,
  resolveToBackendId,
} from "@/lib/offlineIdRegistry";
import {
  getFailedPayments,
  getIsOnline,
  getPendingPaymentsCount,
  initOfflineSyncService,
  OfflineOperation,
  OPERATION_PRIORITY,
  queueDependentOperation,
  queueOperation,
} from "@/services/offlineSyncService";
import { OrderService } from "@/services/orderService";
import { useCoursingStore } from "@/stores/useCoursingStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import type { AddOrderItemParams } from "@/types/db-order-management-types";

let _supabaseClient: any = null;

// Callback for failed payment notifications
let _onPaymentFailed: ((payment: OfflineOperation) => void) | null = null;

/**
 * Set the Supabase client for backend operations.
 * Call this after Supabase is initialized.
 */
export function setOfflineSyncSupabaseClient(client: any): void {
  _supabaseClient = client;
}

/**
 * Set a callback for when payment operations fail.
 */
export function setOnPaymentFailed(
  callback: (payment: OfflineOperation) => void
): void {
  _onPaymentFailed = callback;
}

/**
 * Get the count of pending payment operations.
 */
export function getPendingPayments(): number {
  return getPendingPaymentsCount();
}

/**
 * Get all failed payment operations.
 */
export function getFailedPaymentOperations(): OfflineOperation[] {
  return getFailedPayments();
}

/**
 * Initialize the offline sync system.
 * Call this once at app startup.
 */
export async function initializeOfflineSync(): Promise<void> {
  const store = useOrderStore.getState();

  // Initialize the ID registry first
  await initIdRegistry();

  await initOfflineSyncService({
    onStatusChange: async (isOnline) => {
      store.setOnlineStatus(isOnline);

      // When we come back online, reconcile orders with failed syncs
      if (isOnline) {
        console.log(
          "[OfflineSync] Network restored, checking for orders with failed syncs..."
        );

        // Get fresh state after status update
        const currentStore = useOrderStore.getState();
        const failedOrders = currentStore.getOrdersWithFailedSyncs();

        if (failedOrders.length > 0) {
          console.log(
            `[OfflineSync] Found ${failedOrders.length} orders with failed syncs, retrying...`
          );

          for (const order of failedOrders) {
            try {
              await currentStore.retryFailedSyncs(order.localId);
              console.log(
                `[OfflineSync] Retried syncs for order ${order.localId}`
              );
            } catch (err) {
              console.error(
                `[OfflineSync] Failed to retry syncs for order ${order.localId}:`,
                err
              );
            }
          }
        } else {
          console.log("[OfflineSync] No orders with failed syncs found");
        }
      }
    },
    onQueueChange: (count) => {
      store.setPendingSyncCount(count);
    },
    onOperationFailed: (op) => {
      console.log("[OfflineSync] Operation failed permanently:", op.type, op.id);

      // Special handling for failed payments
      if (
        op.type === "process_cash_payment" ||
        op.type === "process_card_payment"
      ) {
        console.error("[OfflineSync] Payment failed:", op);
        _onPaymentFailed?.(op);
      }
    },
    executeOperation: async (op: OfflineOperation): Promise<boolean> => {
      return executeQueuedOperation(op);
    },
  });
}

/**
 * Resolve a local ID to backend ID, looking up from store if not in registry.
 */
function resolveOrderId(localOrderId: string): string | null {
  // First check if it's already a backend ID
  if (!isLocalId(localOrderId)) {
    return localOrderId;
  }

  // Try registry first
  const fromRegistry = resolveToBackendId(localOrderId);
  if (fromRegistry) return fromRegistry;

  // Fall back to store lookup
  const store = useOrderStore.getState();
  const order = store.ordersById[localOrderId];
  return order?.db_order_id || null;
}

/**
 * Resolve a local item ID to backend ID.
 */
function resolveItemId(
  localOrderId: string,
  localItemId: string
): string | null {
  // First check if it's already a backend ID
  if (!isLocalId(localItemId)) {
    return localItemId;
  }

  // Try registry first
  const fromRegistry = resolveToBackendId(localItemId);
  if (fromRegistry) return fromRegistry;

  // Fall back to store lookup
  const store = useOrderStore.getState();
  const order = store.ordersById[localOrderId];
  const item = order?.items.find((i) => i.id === localItemId);
  return item?.db_order_item_id || null;
}

/**
 * Execute a queued operation against the backend.
 * Returns true on success, false on failure.
 * Handles ID resolution from local to backend IDs.
 */
async function executeQueuedOperation(op: OfflineOperation): Promise<boolean> {
  if (!_supabaseClient) {
    console.error("[OfflineSync] No Supabase client available");
    return false;
  }

  try {
    switch (op.type) {
      case "update_item_quantity": {
        const { orderItemId, quantity, localOrderId, localItemId } = op.params;

        // Resolve item ID if it was a local ID
        const resolvedItemId =
          localItemId && localOrderId
            ? resolveItemId(localOrderId, localItemId)
            : orderItemId;

        if (!resolvedItemId) {
          console.log(
            "[OfflineSync] update_item_quantity: Item not synced yet, will retry"
          );
          return false;
        }

        const { error } = await OrderService.updateOrderItemQuantity(
          _supabaseClient,
          resolvedItemId,
          quantity
        );
        return !error;
      }

      case "update_item": {
        const { orderItemId, specialInstructions, localOrderId, localItemId } =
          op.params;

        const resolvedItemId =
          localItemId && localOrderId
            ? resolveItemId(localOrderId, localItemId)
            : orderItemId;

        if (!resolvedItemId) {
          console.log(
            "[OfflineSync] update_item: Item not synced yet, will retry"
          );
          return false;
        }

        const { error } = await OrderService.updateOrderItem(_supabaseClient, {
          p_order_item_id: resolvedItemId,
          p_special_instructions: specialInstructions,
        });
        return !error;
      }

      case "replace_modifiers": {
        const { orderItemId, modifiers, localOrderId, localItemId } = op.params;

        const resolvedItemId =
          localItemId && localOrderId
            ? resolveItemId(localOrderId, localItemId)
            : orderItemId;

        if (!resolvedItemId) {
          console.log(
            "[OfflineSync] replace_modifiers: Item not synced yet, will retry"
          );
          return false;
        }

        const { error } = await OrderService.replaceOrderItemModifiers(
          _supabaseClient,
          resolvedItemId,
          modifiers
        );
        return !error;
      }

      case "void_item": {
        const { orderItemId, reason, localOrderId, localItemId } = op.params;

        const resolvedItemId =
          localItemId && localOrderId
            ? resolveItemId(localOrderId, localItemId)
            : orderItemId;

        if (!resolvedItemId) {
          console.log(
            "[OfflineSync] void_item: Item not synced yet, will retry"
          );
          return false;
        }

        const { error } = await OrderService.voidOrderItem(
          _supabaseClient,
          resolvedItemId,
          reason
        );
        return !error;
      }

      case "update_order_status": {
        const { orderId, status, reason, localOrderId } = op.params;

        const resolvedOrderId = localOrderId
          ? resolveOrderId(localOrderId)
          : orderId;

        if (!resolvedOrderId) {
          console.log(
            "[OfflineSync] update_order_status: Order not synced yet, will retry"
          );
          return false;
        }

        const { error } = await OrderService.updateOrderStatus(
          _supabaseClient,
          resolvedOrderId,
          status,
          reason
        );
        return !error;
      }

      case "process_cash_payment": {
        const { params: paymentParams, localOrderId } = op.params;

        // Resolve order ID if needed
        if (localOrderId && isLocalId(paymentParams.p_order_id)) {
          const resolvedOrderId = resolveOrderId(localOrderId);
          if (!resolvedOrderId) {
            console.log(
              "[OfflineSync] process_cash_payment: Order not synced yet, will retry"
            );
            return false;
          }
          paymentParams.p_order_id = resolvedOrderId;
        }

        const { error } = await OrderService.processPayment(
          _supabaseClient,
          paymentParams
        );

        if (error) {
          console.error("[OfflineSync] Cash payment failed:", error);
        }

        return !error;
      }

      case "process_card_payment": {
        const {
          params: paymentParams,
          localOrderId,
          cardData,
          transactionRef,
        } = op.params;

        // Resolve order ID if needed
        if (localOrderId && isLocalId(paymentParams.p_order_id)) {
          const resolvedOrderId = resolveOrderId(localOrderId);
          if (!resolvedOrderId) {
            console.log(
              "[OfflineSync] process_card_payment: Order not synced yet, will retry"
            );
            return false;
          }
          paymentParams.p_order_id = resolvedOrderId;
        }

        // For card payments, we include additional card data
        const cardPaymentParams = {
          ...paymentParams,
          p_transaction_ref: transactionRef,
          p_card_last_four: cardData?.lastFour,
          p_card_brand: cardData?.brand,
        };

        const { error } = await OrderService.processPayment(
          _supabaseClient,
          cardPaymentParams
        );

        if (error) {
          console.error("[OfflineSync] Card payment sync failed:", error);
          // Card payment failures are critical - don't silently discard
          return false;
        }

        console.log("[OfflineSync] Card payment synced successfully");
        return true;
      }

      // === OFFLINE-FIRST OPERATION HANDLERS ===

      case "create_order": {
        const { localOrderId, createOrderParams } = op.params;
        const store = useOrderStore.getState();
        const selectedStore = useStoreSettingsStore.getState().selectedStore;

        if (!selectedStore) {
          console.error("[OfflineSync] No store selected for create_order");
          return false;
        }

        const { data, error } = await OrderService.createOrder(
          _supabaseClient,
          createOrderParams
        );

        if (error) {
          console.error("[OfflineSync] Failed to create order:", error);
          return false;
        }

        if (data) {
          const orderData = Array.isArray(data) ? data[0] : data;
          const backendId = orderData.order_id || orderData.id;

          if (backendId) {
            // Update local order with backend ID
            store.updateOrderDbId(localOrderId, backendId);

            // Register in ID registry for future lookups
            await mapLocalToBackend(localOrderId, backendId);

            console.log(
              `[OfflineSync] Order ${localOrderId} synced with db_order_id: ${backendId}`
            );
          }
        }

        return true;
      }

      case "add_item": {
        const {
          localOrderId,
          localItemId,
          dbOrderId,
          addItemParams,
          itemData,
        } = op.params;
        const store = useOrderStore.getState();

        // Check if order exists and get its db_order_id
        const order = store.ordersById[localOrderId];
        if (!order) {
          console.error(
            `[OfflineSync] Order ${localOrderId} not found for add_item`
          );
          return false;
        }

        // Resolve the order ID - check registry, then store
        let actualDbOrderId = dbOrderId || order.db_order_id;
        if (!actualDbOrderId) {
          actualDbOrderId = resolveOrderId(localOrderId);
        }

        if (!actualDbOrderId) {
          console.log(
            `[OfflineSync] Order ${localOrderId} has no db_order_id yet, will retry after order sync`
          );
          return false; // Will be retried after order sync
        }

        // Build the item params if we only have itemData (queued from initial failure)
        let params: AddOrderItemParams;
        if (addItemParams) {
          params = addItemParams;
          // Update the order ID in case it changed
          params.p_order_id = actualDbOrderId;
        } else if (itemData) {
          params = {
            p_order_id: actualDbOrderId,
            p_menu_item_id: itemData.menuItemId || undefined,
            p_quantity: itemData.quantity,
            p_item_name: itemData.name,
            p_category_name: itemData.category_name || "Uncategorized",
            p_unit_price: itemData.originalPrice,
            p_cash_unit_price: itemData.originalPrice,
            p_selected_size_id: itemData.customizations?.size?.id || undefined,
            p_selected_size_name:
              itemData.customizations?.size?.name || undefined,
            p_size_price_modifier:
              itemData.customizations?.size?.priceModifier || undefined,
            p_special_instructions:
              itemData.customizations?.notes || undefined,
            p_modifiers: itemData.customizations?.modifiers?.flatMap(
              (mod: any) =>
                mod.options.map((opt: any) => ({
                  modifier_group_id: mod.categoryId,
                  modifier_item_id: opt.id,
                  modifier_group_name: mod.categoryName,
                  modifier_name: opt.name,
                  price_modifier: opt.price,
                  quantity: 1,
                }))
            ),
            p_course_number:
              useCoursingStore.getState().getWorkingCourse(localOrderId) || 1,
          };
        } else {
          console.error("[OfflineSync] No item params available for add_item");
          return false;
        }

        const { data, error } = await OrderService.addOrderItem(
          _supabaseClient,
          params
        );

        if (error) {
          console.error("[OfflineSync] Failed to add item:", error);
          return false;
        }

        if (data?.order_item_id && localItemId) {
          // Update local item with backend ID
          store.updateItemDbId(localOrderId, localItemId, data.order_item_id);

          // Register in ID registry
          await mapLocalToBackend(localItemId, data.order_item_id);

          console.log(
            `[OfflineSync] Item ${localItemId} synced with db_order_item_id: ${data.order_item_id}`
          );
        }

        return true;
      }

      case "seat_guests": {
        const { tableIds, guestCount, serverId, localSessionId } = op.params;
        // FloorPlanService would be called here - for now just log
        console.log("[OfflineSync] seat_guests operation:", {
          tableIds,
          guestCount,
          serverId,
          localSessionId,
        });
        // This will be implemented when FloorPlanService is available
        // For now, return true to clear from queue as local state is already updated
        return true;
      }

      case "update_session_status": {
        const { sessionId, status } = op.params;
        console.log("[OfflineSync] update_session_status operation:", {
          sessionId,
          status,
        });
        // This will be implemented when FloorPlanService is available
        return true;
      }

      case "fire_course": {
        const { dbOrderId, courseNumber, localOrderId } = op.params;

        // Resolve order ID if needed
        let resolvedOrderId = dbOrderId;
        if (!resolvedOrderId && localOrderId) {
          resolvedOrderId = resolveOrderId(localOrderId);
        }

        if (!resolvedOrderId) {
          console.log(
            "[OfflineSync] fire_course: No dbOrderId, will retry later"
          );
          return false;
        }

        try {
          const { error } = await _supabaseClient.rpc("fire_course", {
            p_order_id: resolvedOrderId,
            p_course_number: courseNumber,
          });

          if (error) {
            console.error("[OfflineSync] Failed to fire course:", error);
            return false;
          }

          console.log(
            `[OfflineSync] Course ${courseNumber} fired for order ${resolvedOrderId}`
          );
          return true;
        } catch (err) {
          console.error("[OfflineSync] Error firing course:", err);
          return false;
        }
      }

      case "remove_item": {
        const { orderItemId, localOrderId, localItemId } = op.params;

        const resolvedItemId =
          localItemId && localOrderId
            ? resolveItemId(localOrderId, localItemId)
            : orderItemId;

        if (!resolvedItemId) {
          // If item was never synced, we can just discard the operation
          console.log(
            "[OfflineSync] remove_item: Item never synced, discarding"
          );
          return true;
        }

        const { error } = await OrderService.voidOrderItem(
          _supabaseClient,
          resolvedItemId,
          "Removed"
        );
        return !error;
      }

      default:
        console.warn("[OfflineSync] Unknown operation type:", op.type);
        return false;
    }
  } catch (error) {
    console.error("[OfflineSync] Error executing operation:", op.type, error);
    return false;
  }
}

/**
 * Helper to queue an operation when sync fails.
 * Use this in store actions when backend calls fail.
 */
export async function queueFailedOperation(
  type: OfflineOperation["type"],
  params: Record<string, any>,
  localOrderId: string,
  localItemId?: string,
  contextSnapshot?: Record<string, any>
): Promise<string> {
  return queueOperation({
    type,
    params,
    localOrderId,
    localItemId,
    contextSnapshot,
  });
}

/**
 * Queue an operation with a dependency on another operation.
 * The dependent operation will only execute after the dependency completes.
 */
export async function queueDependentFailedOperation(
  type: OfflineOperation["type"],
  params: Record<string, any>,
  localOrderId: string,
  dependsOnOperationId: string,
  localItemId?: string,
  contextSnapshot?: Record<string, any>
): Promise<string> {
  return queueDependentOperation(
    {
      type,
      params,
      localOrderId,
      localItemId,
      contextSnapshot,
    },
    dependsOnOperationId
  );
}

/**
 * Queue a payment operation with special handling.
 */
export async function queuePaymentOperation(
  type: "process_cash_payment" | "process_card_payment",
  paymentParams: Record<string, any>,
  localOrderId: string,
  cardData?: { lastFour?: string; brand?: string; transactionRef?: string }
): Promise<string> {
  return queueOperation({
    type,
    params: {
      params: paymentParams,
      localOrderId,
      cardData,
      transactionRef: cardData?.transactionRef,
    },
    localOrderId,
  });
}

/**
 * Check if we're currently online.
 */
export function isOnline(): boolean {
  return getIsOnline();
}

/**
 * Get the priority for an operation type.
 */
export function getOperationPriority(type: OfflineOperation["type"]): number {
  return OPERATION_PRIORITY[type] ?? 99;
}
