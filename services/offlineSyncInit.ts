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
  isValidUUID,
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
import { OrderDiscountService } from "@/services/orderDiscountService";
import { AddOpenItemParams, OrderService } from "@/services/orderService";
import { useCoursingStore } from "@/stores/useCoursingStore";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
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
        console.error("[OfflineSync] Payment failed:", op, _supabaseClient);
        _onPaymentFailed?.(op);
      }
    },
    executeOperation: async (op: OfflineOperation): Promise<boolean> => {
      return executeQueuedOperation(op);
    },
  });
}

/**
 * Resolve a local order ID to backend UUID.
 * 
 * Strategy:
 * 1. If it's already a valid UUID, return it (it's a backend ID)
 * 2. If it's a local ID (order_xxx, local_order_xxx), resolve it
 * 3. Check the ID registry first (for mapped IDs)
 * 4. Fall back to store lookup (order.db_order_id)
 * 
 * @returns Backend UUID string, or null if order hasn't been synced yet
 */
function resolveOrderId(localOrderId: string): string | null {
  // First check if it's already a valid UUID (backend ID)
  if (isValidUUID(localOrderId)) {
    return localOrderId;
  }

  // It's a local ID - need to resolve to backend ID
  // Try registry first (contains mappings from previous syncs)
  const fromRegistry = resolveToBackendId(localOrderId);
  if (fromRegistry) {
    console.log(`[resolveOrderId] Resolved ${localOrderId} from registry: ${fromRegistry}`);
    return fromRegistry;
  }

  // Fall back to store lookup (order might have db_order_id set)
  const store = useOrderStore.getState();
  const order = store.ordersById[localOrderId];
  if (order?.db_order_id) {
    console.log(`[resolveOrderId] Resolved ${localOrderId} from store: ${order.db_order_id}`);
    return order.db_order_id;
  }

  // Order hasn't been synced yet
  console.log(`[resolveOrderId] Cannot resolve ${localOrderId} - order not synced yet`);
  return null;
}

/**
 * Resolve a local item ID to backend UUID.
 * 
 * @returns Backend UUID string, or null if item hasn't been synced yet
 */
function resolveItemId(
  localOrderId: string,
  localItemId: string
): string | null {
  // First check if it's already a valid UUID (backend ID)
  if (isValidUUID(localItemId)) {
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
  console.log("[OfflineSync] Executing queued operation:", op.type);
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

      case "apply_discount": {
        const { localOrderId, discount } = op.params;
        const store = useOrderStore.getState();
        const order = store.ordersById[localOrderId];
        const resolvedOrderId = order?.db_order_id || resolveOrderId(localOrderId);

        if (!resolvedOrderId) {
          console.log("[OfflineSync] apply_discount: Order not synced yet, will retry");
          return false;
        }

        // Get staff ID - use from discount if available, otherwise get from employee store
        const staffId = discount.applied_by_staff_profiles_id
          ?? useEmployeeStore.getState().loggedInEmployee?.profileId
          ?? null;

        if (!staffId) {
          console.warn("[OfflineSync] apply_discount: No staff ID available, will retry");
          return false;
        }

        const result = await OrderDiscountService.applyDiscount(_supabaseClient, {
          order_id: resolvedOrderId,
          staff_id: staffId,
          discount_id: discount.discount_id ?? null,
          discount_name: discount.discount_name ?? "Discount",
          discount_type: discount.discount_type,
          discount_value: discount.discount_value,
          source: discount.source ?? "preset",
          reason: null,
          applied_to_item_ids: discount.applied_to_item_ids ?? null,
          approved_by_staff_id: discount.approved_by_staff_profiles_id ?? null,
        });

        if (result.success && result.order_discount_id) {
          // Mark local discount as synced with backend order_discount_id
          useOrderStore.setState((state) => {
            const existingOrder = state.ordersById[localOrderId];
            if (!existingOrder?.applied_discounts) return state;
            return {
              ordersById: {
                ...state.ordersById,
                [localOrderId]: {
                  ...existingOrder,
                  applied_discounts: existingOrder.applied_discounts.map((d: any) =>
                    d.local_id === discount.local_id
                      ? { ...d, order_discount_id: result.order_discount_id, sync_status: "synced", sync_error: null }
                      : d
                  ),
                },
              },
            };
          });
          return true;
        } else if (result.requires_approval) {
          console.warn("[OfflineSync] apply_discount: Requires manager approval");
          // Don't retry - needs user intervention
          return true; // Mark as "handled" to prevent infinite retries
        } else {
          console.error("[OfflineSync] apply_discount: RPC failed:", result.error);
          return false;
        }
      }

      case "void_discount": {
        const { localOrderId, order_discount_id, void_reason } = op.params;
        const store = useOrderStore.getState();
        const order = store.ordersById[localOrderId];
        const resolvedOrderId = order?.db_order_id || resolveOrderId(localOrderId);

        if (!resolvedOrderId) {
          console.log("[OfflineSync] void_discount: Order not synced yet, will retry");
          return false;
        }

        if (!order_discount_id) {
          console.log("[OfflineSync] void_discount: No order_discount_id, skipping");
          return true; // Nothing to void
        }

        const staffId = useEmployeeStore.getState().loggedInEmployee?.profileId ?? null;

        if (!staffId) {
          console.warn("[OfflineSync] void_discount: No staff ID available, will retry");
          return false;
        }

        const result = await OrderDiscountService.voidDiscount(_supabaseClient, {
          order_id: resolvedOrderId,
          staff_id: staffId,
          order_discount_id: order_discount_id,
          void_reason: void_reason ?? null,
        });

        if (result.success) {
          console.log("[OfflineSync] void_discount: Successfully voided", order_discount_id);
          return true;
        } else {
          console.error("[OfflineSync] void_discount: RPC failed:", result.error);
          return false;
        }
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

      // ================================================================
      // UNIFIED PAYMENT HANDLER - Uses process_payment_v2
      // Handles: Full card, Full cash, Split, Per-item payments
      // ================================================================
      case "process_payment":
      case "process_cash_payment":   // Legacy support
      case "process_card_payment": { // Legacy support
        const {
          params: paymentParams,
          localOrderId,
          localPaymentId,
          paymentTimestamp,
          cardData,
          terminalResponse,
        } = op.params;

        console.log(`[OfflineSync:payment] ====== PROCESSING PAYMENT ======`);
        console.log(`[OfflineSync:payment] Type: ${op.type}`);
        console.log(`[OfflineSync:payment] Local Order ID: ${localOrderId || 'N/A'}`);
        console.log(`[OfflineSync:payment] Order ID in params: ${paymentParams?.p_order_id || 'N/A'}`);
        console.log(`[OfflineSync:payment] Amount: ${paymentParams?.p_amount}, Method: ${paymentParams?.p_payment_method}`);

        // Resolve order ID if needed
        if (localOrderId && isLocalId(paymentParams.p_order_id)) {
          console.log(`[OfflineSync:payment] Order ID is local, resolving...`);
          const resolvedOrderId = resolveOrderId(localOrderId);
          if (!resolvedOrderId) {
            console.log(`[OfflineSync:payment] BLOCKED - Order ${localOrderId} not synced yet`);
            return false;
          }
          paymentParams.p_order_id = resolvedOrderId;
          console.log(`[OfflineSync:payment] Resolved to: ${resolvedOrderId}`);
        }

        // Resolve item allocations (support per-item/split-by-item payments queued with local IDs)
        if (paymentParams.p_item_allocations && Array.isArray(paymentParams.p_item_allocations)) {
          const resolvedAllocations: { order_item_id: string; quantity: number; amount?: number }[] = [];
          for (const alloc of paymentParams.p_item_allocations) {
            const rawId = alloc.order_item_id;
            // If already a UUID, keep it; otherwise resolve via registry/store
            if (isValidUUID(rawId)) {
              resolvedAllocations.push(alloc);
              continue;
            }

            if (localOrderId) {
              const resolved = resolveItemId(localOrderId, rawId);
              if (resolved) {
                resolvedAllocations.push({
                  ...alloc,
                  order_item_id: resolved,
                });
              } else {
                console.log(
                  `[OfflineSync:payment] Item ${rawId} not synced yet, will retry`
                );
                return false; // wait for item sync
              }
            } else {
              console.log(
                `[OfflineSync:payment] No localOrderId to resolve item ${rawId}, will retry`
              );
              return false;
            }
          }

          // Replace with resolved backend item IDs
          paymentParams.p_item_allocations = resolvedAllocations;
        }

        // Build terminal response for card payments if we have card data
        let finalTerminalResponse = terminalResponse;
        if (!finalTerminalResponse && cardData) {
          finalTerminalResponse = {
            card_last_four: cardData.lastFour,
            card_type: cardData.brand,
            transaction_id: cardData.transactionRef,
          };
        }

        // Merge terminal response into params if exists
        const finalParams = {
          ...paymentParams,
          ...(finalTerminalResponse && { p_terminal_response: finalTerminalResponse }),
        };

        console.log("[OfflineSync:payment] Calling process_payment_v2 with:", JSON.stringify({
          orderId: finalParams.p_order_id,
          method: finalParams.p_payment_method,
          amount: finalParams.p_amount,
          tip: finalParams.p_tip_amount || 0,
          hasTerminalResponse: !!finalParams.p_terminal_response,
        }));

        const { data, error } = await OrderService.processPayment(
          _supabaseClient,
          finalParams
        );

        if (error) {
          console.error(`[OfflineSync:payment] FAILED - Error:`, error);
          return false;
        }

        console.log(`[OfflineSync:payment] SUCCESS!`);
        console.log(`[OfflineSync:payment] Response:`, JSON.stringify(data, null, 2));

        // Sync order state from backend response if available
        if (localOrderId && data) {
          const store = useOrderStore.getState();
          const order = store.ordersById[localOrderId];
          const responseData = data as any;

          // Update local order with backend payment response data
          if (responseData.order_amount_due !== undefined || responseData.order_amount_paid !== undefined) {
            store.updateOrderFromSync(localOrderId, {
              total_amount: responseData.order_card_total || responseData.order_total,
              total_tax: responseData.order_card_tax || responseData.order_tax,
            });
          }

          // ================================================================
          // Update order status to "preparing" if it was in draft/pending
          // This ensures payments from offline queue trigger proper workflow
          // ================================================================
          if (order && (order.order_status === "draft" || order.order_status === "pending")) {
            console.log(`[OfflineSync:payment] Updating order status: ${order.order_status} -> preparing`);

            // Update order status and item statuses
            const updatedItems = order.items.map(item => ({
              ...item,
              kitchen_status: "sent" as const,
              item_status: "Preparing" as const,
            }));

            useOrderStore.setState(state => {
              const currentOrder = state.ordersById[localOrderId];
              if (!currentOrder) return state;

              return {
                ordersById: {
                  ...state.ordersById,
                  [localOrderId]: {
                    ...currentOrder,
                    order_status: "preparing",
                    items: updatedItems,
                    // Set opened_at if not already set
                    opened_at: currentOrder.opened_at || new Date().toISOString(),
                  },
                },
              };
            });

            console.log(`[OfflineSync:payment] Order status updated to "preparing", ${updatedItems.length} items marked as sent`);
          }

          // Mark the specific payment as synced with backend payment_id and items covered
          // Uses localPaymentId or paymentTimestamp to find the correct payment (fixes split payment collapse)
          if (order && responseData.payment_id) {
            useOrderStore.setState((state) => {
              const currentOrder = state.ordersById[localOrderId];
              if (!currentOrder?.payments || currentOrder.payments.length === 0) {
                return state;
              }

              const payments = [...currentOrder.payments];

              // Find payment by localPaymentId or timestamp instead of using array index
              const paymentIndex = payments.findIndex(
                (p: any) =>
                  (localPaymentId && p.localId === localPaymentId) ||
                  (paymentTimestamp && p.timestamp === paymentTimestamp)
              );

              // Fallback to last payment only if no match found (legacy operations)
              const targetIdx = paymentIndex !== -1 ? paymentIndex : payments.length - 1;

              console.log(`[OfflineSync:payment] Updating payment at index ${targetIdx} (found by ${paymentIndex !== -1 ? 'ID match' : 'fallback'})`);

              payments[targetIdx] = {
                ...payments[targetIdx],
                id: responseData.payment_id,
                itemsCovered: responseData.items_covered || payments[targetIdx].itemsCovered || [],
                timestamp: payments[targetIdx].timestamp || new Date().toISOString(),
                sync_status: "synced" as const,
                sync_error: undefined,
              };

              return {
                ordersById: {
                  ...state.ordersById,
                  [localOrderId]: {
                    ...currentOrder,
                    payments,
                    amount_paid: responseData.order_amount_paid ?? currentOrder.amount_paid,
                    amount_due: responseData.order_amount_due ?? currentOrder.amount_due,
                    cash_amount_due: responseData.order_cash_amount_due ?? currentOrder.cash_amount_due,
                    paid_status: responseData.order_fully_paid ? ("Paid" as const) : (currentOrder.paid_status ?? "Pending"),
                    check_status: responseData.order_fully_paid ? ("Closed" as const) : (currentOrder.check_status ?? "Opened"),
                  },
                },
              };
            });
          }

          // Also update payment amounts from backend
          if (responseData.order_amount_paid !== undefined || responseData.order_amount_due !== undefined) {
            useOrderStore.setState(state => {
              const currentOrder = state.ordersById[localOrderId];
              if (!currentOrder) return state;

              // Mark the specific payment as synced (find by localPaymentId or timestamp)
              const payments = [...(currentOrder.payments || [])];
              if (payments.length > 0) {
                // Find payment by localPaymentId or timestamp instead of using array index
                const paymentIndex = payments.findIndex(
                  (p: any) =>
                    (localPaymentId && p.localId === localPaymentId) ||
                    (paymentTimestamp && p.timestamp === paymentTimestamp)
                );

                // Fallback to last payment only if no match found (legacy operations)
                const targetIdx = paymentIndex !== -1 ? paymentIndex : payments.length - 1;

                payments[targetIdx] = {
                  ...payments[targetIdx],
                  sync_status: "synced" as const,
                  sync_error: undefined,
                };
              }

              return {
                ordersById: {
                  ...state.ordersById,
                  [localOrderId]: {
                    ...currentOrder,
                    payments,
                    amount_paid: responseData.order_amount_paid ?? currentOrder.amount_paid,
                    amount_due: responseData.order_amount_due ?? currentOrder.amount_due,
                    paid_status: responseData.order_fully_paid ? ("Paid" as const) : ("Pending" as const),
                    check_status: responseData.order_fully_paid ? ("Closed" as const) : ("Opened" as const),
                  },
                },
              };
            });
          }
        }

        return true;
      }

      // === OFFLINE-FIRST OPERATION HANDLERS ===

      case "create_order": {
        const { localOrderId, createOrderParams } = op.params;
        const store = useOrderStore.getState();
        const selectedStore = useStoreSettingsStore.getState().selectedStore;

        console.log(`[OfflineSync:create_order] ====== CREATING ORDER ======`);
        console.log(`[OfflineSync:create_order] Local ID: ${localOrderId}`);
        console.log(`[OfflineSync:create_order] Params:`, JSON.stringify(createOrderParams, null, 2));

        if (!selectedStore) {
          console.error("[OfflineSync:create_order] FAILED - No store selected");
          return false;
        }

        const { data, error } = await OrderService.createOrder(
          _supabaseClient,
          createOrderParams
        );

        if (error) {
          console.error("[OfflineSync:create_order] FAILED - DB Error:", error);
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

            // Update local order with backend-generated data (order_number, display_number, etc.)
            store.updateOrderFromSync(localOrderId, {
              order_number: orderData.order_number,
              display_number: orderData.display_number || `#${orderData.order_number}`,
              opened_at: orderData.created_at,
              // Sync totals if available
              total_amount: orderData.card_total || orderData.total_amount,
              total_tax: orderData.card_tax_amount || orderData.tax_amount,
              subtotal: orderData.card_subtotal || orderData.subtotal,
              cash_total: orderData.cash_total,
              cash_tax_amount: orderData.cash_tax_amount,
              cash_subtotal: orderData.cash_subtotal,
            });

            console.log(`[OfflineSync:create_order] SUCCESS!`);
            console.log(`[OfflineSync:create_order] ${localOrderId} → ${backendId}`);
            console.log(`[OfflineSync:create_order] Order number: ${orderData.order_number || orderData.display_number}`);
          } else {
            console.error("[OfflineSync:create_order] FAILED - No backend ID in response:", orderData);
            return false;
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

        console.log(`[OfflineSync:add_item] ====== ADDING ITEM ======`);
        console.log(`[OfflineSync:add_item] Local Order ID: ${localOrderId}`);
        console.log(`[OfflineSync:add_item] Local Item ID: ${localItemId}`);
        console.log(`[OfflineSync:add_item] Item: ${itemData?.name || addItemParams?.p_item_name || 'unknown'}`);

        // Check if order exists and get its db_order_id
        const order = store.ordersById[localOrderId];
        if (!order) {
          console.error(`[OfflineSync:add_item] FAILED - Order ${localOrderId} not found in store`);
          console.log(`[OfflineSync:add_item] Available orders:`, Object.keys(store.ordersById));
          return false;
        }

        console.log(`[OfflineSync:add_item] Order in store: db_order_id=${order.db_order_id || 'NONE'}`);

        // Resolve the order ID - check registry, then store
        let actualDbOrderId = dbOrderId || order.db_order_id;
        if (!actualDbOrderId) {
          actualDbOrderId = resolveOrderId(localOrderId);
          console.log(`[OfflineSync:add_item] Resolved from registry: ${actualDbOrderId || 'NOT_FOUND'}`);
        }

        if (!actualDbOrderId) {
          console.log(`[OfflineSync:add_item] BLOCKED - Waiting for order sync`);
          console.log(`[OfflineSync:add_item] Order ${localOrderId} has no db_order_id yet`);
          return false; // Will be retried after order sync
        }

        console.log(`[OfflineSync:add_item] Using db_order_id: ${actualDbOrderId}`);

        const isOpenItem = itemData?.is_open_item || addItemParams?.is_open_item;

        // Build params for open item vs regular item
        let params: AddOrderItemParams | AddOpenItemParams;
        if (isOpenItem) {
          params = {
            p_order_id: actualDbOrderId,
            p_item_name: itemData?.open_item_name || itemData?.name || addItemParams?.p_item_name,
            p_unit_price: itemData?.open_item_price ?? itemData?.unitPrice ?? addItemParams?.p_unit_price ?? 0,
            p_quantity: itemData?.quantity ?? addItemParams?.p_quantity ?? 1,
            p_special_instructions: itemData?.customizations?.notes ?? addItemParams?.p_special_instructions,
            p_is_tax_exempt: itemData?.is_tax_exempt ?? addItemParams?.p_is_tax_exempt ?? false,
          } as AddOpenItemParams;
        } else {
          // Build the item params if we only have itemData (queued from initial failure)
          if (addItemParams) {
            params = addItemParams;
            // Update the order ID in case it changed
            (params as AddOrderItemParams).p_order_id = actualDbOrderId;
          } else if (itemData) {
            // Build modifiers array, but set to undefined if empty
            const modifiersArray = itemData.customizations?.modifiers?.flatMap(
              (mod: any) =>
                mod.options.map((opt: any) => ({
                  modifier_group_id: mod.categoryId,
                  modifier_item_id: opt.id,
                  modifier_group_name: mod.categoryName,
                  modifier_name: opt.name,
                  price_modifier: opt.price,
                  quantity: 1,
                }))
            );

            params = {
              p_order_id: actualDbOrderId,
              p_menu_item_id: itemData.menuItemId || undefined,
              p_location_exclusive_item_id: itemData.locationExclusiveItemId || undefined,
              p_quantity: itemData.quantity,
              p_item_name: itemData.name,
              p_category_name: itemData.category_name || "Uncategorized",
              // Use card price for p_unit_price and cash price for p_cash_unit_price
              // Fall back to originalPrice if specific prices not available
              p_unit_price: itemData.price ?? itemData.originalPrice ?? 0,
              p_cash_unit_price: itemData.cashPrice ?? itemData.price ?? itemData.originalPrice,
              p_selected_size_id: itemData.customizations?.size?.id || undefined,
              p_selected_size_name:
                itemData.customizations?.size?.name || undefined,
              p_size_price_modifier:
                itemData.customizations?.size?.priceModifier || undefined,
              p_special_instructions:
                itemData.customizations?.notes || undefined,
              // Set to undefined if empty array to avoid function signature mismatch
              p_modifiers: modifiersArray && modifiersArray.length > 0 ? modifiersArray : undefined,
              p_course_number:
                useCoursingStore.getState().getWorkingCourse(localOrderId) || 1,
            } as AddOrderItemParams;
          } else {
            console.error("[OfflineSync] No item params available for add_item");
            return false;
          }
        }

        let data: any;
        let error: any;
        if (isOpenItem) {
          ({ data, error } = await OrderService.addOpenItem(
            _supabaseClient,
            params as AddOpenItemParams
          ));
        } else {
          ({ data, error } = await OrderService.addOrderItem(
            _supabaseClient,
            params as AddOrderItemParams
          ));
        }

        if (error) {
          console.error(`[OfflineSync:add_item] FAILED - DB Error:`, error);
          console.error(`[OfflineSync:add_item] Order: ${localOrderId}, Item: ${localItemId}`);
          return false;
        }

        if (data?.order_item_id && localItemId) {
          // Update local item with backend ID
          store.updateItemDbId(localOrderId, localItemId, data.order_item_id);

          // Register in ID registry
          await mapLocalToBackend(localItemId, data.order_item_id);

          console.log(`[OfflineSync:add_item] SUCCESS!`);
          console.log(`[OfflineSync:add_item] ${localItemId} → ${data.order_item_id}`);

          // Sync order totals from response if available
          const responseData = data as any;
          if (responseData.order_card_total || responseData.order_cash_total || responseData.order_total) {
            store.updateOrderFromSync(localOrderId, {
              total_amount: responseData.order_card_total || responseData.order_total,
              total_tax: responseData.order_card_tax || responseData.order_tax,
              subtotal: responseData.order_card_subtotal || responseData.order_subtotal,
              cash_total: responseData.order_cash_total,
              cash_tax_amount: responseData.order_cash_tax,
              cash_subtotal: responseData.order_cash_subtotal,
            });
            console.log(`[OfflineSync:add_item] Synced order totals: card=${responseData.order_card_total}, cash=${responseData.order_cash_total}`);
          }
        } else {
          console.log(`[OfflineSync:add_item] Completed but no order_item_id returned`);
          console.log(`[OfflineSync:add_item] Response:`, data);
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

      // ================================================================
      // SEND TO KITCHEN - Updates order status + item statuses
      // ================================================================
      case "send_to_kitchen": {
        const { localOrderId, localItemIds } = op.params;

        console.log(`[OfflineSync:send_to_kitchen] ====== SENDING TO KITCHEN ======`);
        console.log(`[OfflineSync:send_to_kitchen] Local Order ID: ${localOrderId}`);
        console.log(`[OfflineSync:send_to_kitchen] Items to send: ${localItemIds?.length || 0}`);

        // Resolve order ID
        const resolvedOrderId = resolveOrderId(localOrderId);
        if (!resolvedOrderId) {
          console.log(`[OfflineSync:send_to_kitchen] BLOCKED - Order ${localOrderId} not synced yet`);
          return false;
        }

        console.log(`[OfflineSync:send_to_kitchen] Resolved order: ${resolvedOrderId}`);

        try {
          // 1. Update order status to "preparing"
          const { error: statusError } = await OrderService.updateOrderStatus(
            _supabaseClient,
            resolvedOrderId,
            "preparing"
          );

          if (statusError) {
            console.error("[OfflineSync:send_to_kitchen] Failed to update order status:", statusError);
            return false;
          }

          console.log(`[OfflineSync:send_to_kitchen] Order status updated to "preparing"`);

          // 2. Resolve and update item statuses
          if (localItemIds && localItemIds.length > 0) {
            const resolvedItemIds = localItemIds
              .map((localItemId: string) => resolveItemId(localOrderId, localItemId))
              .filter((id: string | null): id is string => !!id);

            if (resolvedItemIds.length > 0) {
              const { error: itemError } = await OrderService.bulkUpdateOrderItemStatus(
                _supabaseClient,
                resolvedItemIds,
                "sent"
              );

              if (itemError) {
                console.error("[OfflineSync:send_to_kitchen] Failed to update item statuses:", itemError);
                // Non-fatal - order status already updated
              } else {
                console.log(`[OfflineSync:send_to_kitchen] ${resolvedItemIds.length} items marked as "sent"`);
              }
            } else {
              console.log(`[OfflineSync:send_to_kitchen] No items could be resolved (may not be synced yet)`);
            }
          }

          console.log(`[OfflineSync:send_to_kitchen] SUCCESS!`);
          return true;
        } catch (err) {
          console.error("[OfflineSync:send_to_kitchen] Error:", err);
          return false;
        }
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
