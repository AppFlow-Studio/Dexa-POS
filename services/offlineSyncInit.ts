/**
 * Offline Sync Initialization
 *
 * Bridges the offlineSyncService with useOrderStore.
 * Call initializeOfflineSync() once at app startup (e.g., in _layout.tsx).
 */

import {
  OfflineOperation,
  getIsOnline,
  initOfflineSyncService,
  queueOperation,
} from "@/services/offlineSyncService";
import { AddOrderItemParams, OrderService } from "@/services/orderService";
import { useCoursingStore } from "@/stores/useCoursingStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";

let _supabaseClient: any = null;

/**
 * Set the Supabase client for backend operations.
 * Call this after Supabase is initialized.
 */
export function setOfflineSyncSupabaseClient(client: any): void {
  _supabaseClient = client;
}

/**
 * Initialize the offline sync system.
 * Call this once at app startup.
 */
export async function initializeOfflineSync(): Promise<void> {
  const store = useOrderStore.getState();

  await initOfflineSyncService({
    onStatusChange: async (isOnline) => {
      store.setOnlineStatus(isOnline);

      // When we come back online, reconcile orders with failed syncs
      if (isOnline) {
        console.log("[OfflineSync] Network restored, checking for orders with failed syncs...");

        // Get fresh state after status update
        const currentStore = useOrderStore.getState();
        const failedOrders = currentStore.getOrdersWithFailedSyncs();

        if (failedOrders.length > 0) {
          console.log(`[OfflineSync] Found ${failedOrders.length} orders with failed syncs, retrying...`);

          for (const order of failedOrders) {
            try {
              await currentStore.retryFailedSyncs(order.localId);
              console.log(`[OfflineSync] Retried syncs for order ${order.localId}`);
            } catch (err) {
              console.error(`[OfflineSync] Failed to retry syncs for order ${order.localId}:`, err);
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
    executeOperation: async (op: OfflineOperation): Promise<boolean> => {
      return executeQueuedOperation(op);
    },
  });
}

/**
 * Execute a queued operation against the backend.
 * Returns true on success, false on failure.
 */
async function executeQueuedOperation(op: OfflineOperation): Promise<boolean> {
  if (!_supabaseClient) {
    console.error("[OfflineSync] No Supabase client available");
    return false;
  }

  try {
    switch (op.type) {
      case "update_item_quantity": {
        const { orderItemId, quantity } = op.params;
        const { error } = await OrderService.updateOrderItemQuantity(
          _supabaseClient,
          orderItemId,
          quantity
        );
        return !error;
      }

      case "update_item": {
        const { orderItemId, specialInstructions } = op.params;
        const { error } = await OrderService.updateOrderItem(_supabaseClient, {
          p_order_item_id: orderItemId,
          p_special_instructions: specialInstructions,
        });
        return !error;
      }

      case "replace_modifiers": {
        const { orderItemId, modifiers } = op.params;
        const { error } = await OrderService.replaceOrderItemModifiers(
          _supabaseClient,
          orderItemId,
          modifiers
        );
        return !error;
      }

      case "void_item": {
        const { orderItemId, reason } = op.params;
        const { error } = await OrderService.voidOrderItem(
          _supabaseClient,
          orderItemId,
          reason
        );
        return !error;
      }

      case "update_order_status": {
        const { orderId, status, reason } = op.params;
        const { error } = await OrderService.updateOrderStatus(
          _supabaseClient,
          orderId,
          status,
          reason
        );
        return !error;
      }

      case "process_cash_payment": {
        const { params: paymentParams } = op.params;
        const { error } = await OrderService.processPayment(
          _supabaseClient,
          paymentParams
        );
        return !error;
      }

      // === NEW OFFLINE-FIRST OPERATION HANDLERS ===

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
            console.log(`[OfflineSync] Order ${localOrderId} synced with db_order_id: ${backendId}`);
          }
        }

        return true;
      }

      case "add_item": {
        const { localOrderId, localItemId, dbOrderId, addItemParams, itemData } = op.params;
        const store = useOrderStore.getState();

        // Check if order exists and get its db_order_id
        const order = store.ordersById[localOrderId];
        if (!order) {
          console.error(`[OfflineSync] Order ${localOrderId} not found for add_item`);
          return false;
        }

        // If we don't have a db_order_id yet, order needs to be created first
        const actualDbOrderId = dbOrderId || order.db_order_id;
        if (!actualDbOrderId) {
          console.log(`[OfflineSync] Order ${localOrderId} has no db_order_id yet, will retry after order sync`);
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
            p_cash_price: itemData.originalPrice,
            p_price_paid: itemData.originalPrice,
            p_use_cash_price: true,
            p_selected_size_id: itemData.customizations?.size?.id || undefined,
            p_selected_size_name: itemData.customizations?.size?.name || undefined,
            p_size_price_modifier: itemData.customizations?.size?.priceModifier || undefined,
            p_special_instructions: itemData.customizations?.notes || undefined,
            p_modifiers: itemData.customizations?.modifiers?.flatMap((mod: any) =>
              mod.options.map((opt: any) => ({
                modifier_group_id: mod.categoryId,
                modifier_item_id: opt.id,
                modifier_group_name: mod.categoryName,
                modifier_name: opt.name,
                price_modifier: opt.price,
                quantity: 1,
              }))
            ),
            p_course_number: useCoursingStore.getState().getWorkingCourse(localOrderId) || 1,
          };
        } else {
          console.error("[OfflineSync] No item params available for add_item");
          return false;
        }

        const { data, error } = await OrderService.addOrderItem(_supabaseClient, params);

        if (error) {
          console.error("[OfflineSync] Failed to add item:", error);
          return false;
        }

        if (data?.order_item_id && localItemId) {
          // Update local item with backend ID
          store.updateItemDbId(localOrderId, localItemId, data.order_item_id);
          console.log(`[OfflineSync] Item ${localItemId} synced with db_order_item_id: ${data.order_item_id}`);
        }

        return true;
      }

      case "seat_guests": {
        const { tableIds, guestCount, serverId, localSessionId } = op.params;
        // FloorPlanService would be called here - for now just log
        console.log("[OfflineSync] seat_guests operation:", { tableIds, guestCount, serverId, localSessionId });
        // This will be implemented when FloorPlanService is available
        // For now, return true to clear from queue as local state is already updated
        return true;
      }

      case "update_session_status": {
        const { sessionId, status } = op.params;
        console.log("[OfflineSync] update_session_status operation:", { sessionId, status });
        // This will be implemented when FloorPlanService is available
        return true;
      }

      case "fire_course": {
        const { dbOrderId, courseNumber } = op.params;

        if (!dbOrderId) {
          console.log("[OfflineSync] fire_course: No dbOrderId, will retry later");
          return false;
        }

        try {
          const { error } = await _supabaseClient.rpc("fire_course", {
            p_order_id: dbOrderId,
            p_course_number: courseNumber,
          });

          if (error) {
            console.error("[OfflineSync] Failed to fire course:", error);
            return false;
          }

          console.log(`[OfflineSync] Course ${courseNumber} fired for order ${dbOrderId}`);
          return true;
        } catch (err) {
          console.error("[OfflineSync] Error firing course:", err);
          return false;
        }
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
  localItemId?: string
): Promise<void> {
  await queueOperation({
    type,
    params,
    localOrderId,
    localItemId,
  });
}

/**
 * Check if we're currently online.
 */
export function isOnline(): boolean {
  return getIsOnline();
}
