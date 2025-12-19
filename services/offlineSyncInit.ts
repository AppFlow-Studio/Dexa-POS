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
import { OrderService } from "@/services/orderService";
import { useOrderStore } from "@/stores/useOrderStore";

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
    onStatusChange: (isOnline) => {
      store.setOnlineStatus(isOnline);
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
