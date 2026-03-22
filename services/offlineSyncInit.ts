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
import { FloorPlanService } from "@/services/floorPlanService";
import {
    getFailedPayments,
    getIsOnline,
    getPendingPaymentsCount,
    hasPendingOrderCreation,
    initOfflineSyncService,
    OfflineOperation,
    OPERATION_PRIORITY,
    queueDependentOperation,
    queueOperation,
} from "@/services/offlineSyncService";
import { OrderDiscountService } from "@/services/orderDiscountService";
import { getKitchenSentStatus } from "@/lib/kitchenStatusUtils";
import { AddOpenItemParams, OrderService } from "@/services/orderService";
import { useCoursingStore } from "@/stores/useCoursingStore";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import {
    calculatePaidStatusFromPayments,
    useOrderStore,
} from "@/stores/useOrderStore";
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
  callback: (payment: OfflineOperation) => void,
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
          "[OfflineSync] Network restored, checking for orders with failed syncs...",
        );

        // Get fresh state after status update
        const currentStore = useOrderStore.getState();
        const failedOrders = currentStore.getOrdersWithFailedSyncs();

        if (failedOrders.length > 0) {
          console.log(
            `[OfflineSync] Found ${failedOrders.length} orders with failed syncs, retrying...`,
          );

          for (const order of failedOrders) {
            try {
              await currentStore.retryFailedSyncs(order.localId);
              console.log(
                `[OfflineSync] Retried syncs for order ${order.localId}`,
              );
            } catch (err) {
              console.error(
                `[OfflineSync] Failed to retry syncs for order ${order.localId}:`,
                err,
              );
            }
          }
        } else {
          console.log("[OfflineSync] No orders with failed syncs found");
        }

        // NEW: Run reconciliation to fix any broken order-session relationships
        // This handles out-of-order syncing where orders and sessions sync separately
        console.log("[OfflineSync] Running relationship reconciliation...");
        await reconcileRelationships();
      }
    },
    onQueueChange: (count) => {
      store.setPendingSyncCount(count);
    },
    onOperationFailed: (op) => {
      console.log(
        "[OfflineSync] Operation failed permanently:",
        op.type,
        op.id,
      );

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
    console.log(
      `[resolveOrderId] Resolved ${localOrderId} from registry: ${fromRegistry}`,
    );
    return fromRegistry;
  }

  // Fall back to store lookup (order might have db_order_id set)
  const store = useOrderStore.getState();
  const order = store.ordersById[localOrderId];
  if (order?.db_order_id) {
    console.log(
      `[resolveOrderId] Resolved ${localOrderId} from store: ${order.db_order_id}`,
    );
    return order.db_order_id;
  }

  // Order hasn't been synced yet
  console.log(
    `[resolveOrderId] Cannot resolve ${localOrderId} - order not synced yet`,
  );
  return null;
}

/**
 * Resolve a local item ID to backend UUID.
 *
 * @returns Backend UUID string, or null if item hasn't been synced yet
 */
function resolveItemId(
  localOrderId: string,
  localItemId: string,
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
 * Resolve a local session ID to backend UUID.
 *
 * Strategy:
 * 1. If it's already a valid UUID, return it (it's a backend ID)
 * 2. If it's a local ID, resolve it via registry
 * 3. Fall back to FloorPlanStore lookup
 *
 * @returns Backend UUID string, or null if session hasn't been synced yet
 */
function resolveSessionId(localSessionId: string): string | null {
  // First check if it's already a valid UUID (backend ID)
  if (isValidUUID(localSessionId)) {
    return localSessionId;
  }

  // It's a local ID - try registry first
  const fromRegistry = resolveToBackendId(localSessionId);
  if (fromRegistry) {
    console.log(
      `[resolveSessionId] Resolved ${localSessionId} from registry: ${fromRegistry}`,
    );
    return fromRegistry;
  }

  // Fall back to FloorPlanStore lookup
  // TODO: Implement when FloorPlanStore has session lookup
  console.log(
    `[resolveSessionId] Cannot resolve ${localSessionId} - session not synced yet`,
  );
  return null;
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
            "[OfflineSync] update_item_quantity: Item not synced yet, will retry",
          );
          return false;
        }

        const { error } = await OrderService.updateOrderItemQuantity(
          _supabaseClient,
          resolvedItemId,
          quantity,
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
            "[OfflineSync] update_item: Item not synced yet, will retry",
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
            "[OfflineSync] replace_modifiers: Item not synced yet, will retry",
          );
          return false;
        }

        const { error } = await OrderService.replaceOrderItemModifiers(
          _supabaseClient,
          resolvedItemId,
          modifiers,
        );
        return !error;
      }

      case "apply_discount": {
        const { localOrderId, discount } = op.params;
        const store = useOrderStore.getState();
        const order = store.ordersById[localOrderId];
        const resolvedOrderId =
          order?.db_order_id || resolveOrderId(localOrderId);

        if (!resolvedOrderId) {
          console.log(
            "[OfflineSync] apply_discount: Order not synced yet, will retry",
          );
          return false;
        }

        // Get staff ID - use from discount if available, otherwise get from employee store
        const staffId =
          discount.applied_by_staff_profiles_id ??
          useEmployeeStore.getState().loggedInEmployee?.profileId ??
          null;

        if (!staffId) {
          console.warn(
            "[OfflineSync] apply_discount: No staff ID available, will retry",
          );
          return false;
        }

        const result = await OrderDiscountService.applyDiscount(
          _supabaseClient,
          {
            order_id: resolvedOrderId,
            staff_id: staffId,
            discount_id: discount.discount_id ?? null,
            discount_name: discount.discount_name ?? "Discount",
            discount_type: discount.discount_type,
            discount_value: discount.discount_value,
            source: discount.source ?? "preset",
            reason: null,
            applied_to_item_ids: discount.applied_to_item_ids ?? null,
            approved_by_staff_id:
              discount.approved_by_staff_profiles_id ?? null,
          },
        );

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
                  applied_discounts: existingOrder.applied_discounts.map(
                    (d: any) =>
                      d.local_id === discount.local_id
                        ? {
                            ...d,
                            order_discount_id: result.order_discount_id,
                            sync_status: "synced",
                            sync_error: null,
                          }
                        : d,
                  ),
                },
              },
            };
          });
          return true;
        } else if (result.requires_approval) {
          console.warn(
            "[OfflineSync] apply_discount: Requires manager approval",
          );
          // Don't retry - needs user intervention
          return true; // Mark as "handled" to prevent infinite retries
        } else {
          console.error(
            "[OfflineSync] apply_discount: RPC failed:",
            result.error,
          );
          return false;
        }
      }

      case "void_discount": {
        const { localOrderId, order_discount_id, void_reason } = op.params;
        const store = useOrderStore.getState();
        const order = store.ordersById[localOrderId];
        const resolvedOrderId =
          order?.db_order_id || resolveOrderId(localOrderId);

        if (!resolvedOrderId) {
          console.log(
            "[OfflineSync] void_discount: Order not synced yet, will retry",
          );
          return false;
        }

        if (!order_discount_id) {
          console.log(
            "[OfflineSync] void_discount: No order_discount_id, skipping",
          );
          return true; // Nothing to void
        }

        const staffId =
          useEmployeeStore.getState().loggedInEmployee?.profileId ?? null;

        if (!staffId) {
          console.warn(
            "[OfflineSync] void_discount: No staff ID available, will retry",
          );
          return false;
        }

        const result = await OrderDiscountService.voidDiscount(
          _supabaseClient,
          {
            order_id: resolvedOrderId,
            staff_id: staffId,
            order_discount_id: order_discount_id,
            void_reason: void_reason ?? null,
          },
        );

        if (result.success) {
          console.log(
            "[OfflineSync] void_discount: Successfully voided",
            order_discount_id,
          );
          return true;
        } else {
          console.error(
            "[OfflineSync] void_discount: RPC failed:",
            result.error,
          );
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
            "[OfflineSync] void_item: Item not synced yet, will retry",
          );
          return false;
        }

        const { error } = await OrderService.voidOrderItem(
          _supabaseClient,
          resolvedItemId,
          reason,
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
            "[OfflineSync] update_order_status: Order not synced yet, will retry",
          );
          return false;
        }

        const { error } = await OrderService.updateOrderStatus(
          _supabaseClient,
          resolvedOrderId,
          status,
          reason,
        );
        return !error;
      }

      // ================================================================
      // CHECK STATUS HANDLERS - Close/Reopen check
      // ================================================================
      case "close_check": {
        const { p_order_id, p_staff_id } = op.params;

        const resolvedOrderId = op.localOrderId
          ? resolveOrderId(op.localOrderId)
          : p_order_id;

        if (!resolvedOrderId) {
          console.log(
            "[OfflineSync] close_check: Order not synced yet, will retry",
          );
          return false;
        }

        const result = await OrderService.closeCheck(
          _supabaseClient,
          resolvedOrderId,
          p_staff_id,
        );
        return result.success;
      }

      case "reopen_check": {
        const { p_order_id, p_staff_id, p_reason } = op.params;

        const resolvedOrderId = op.localOrderId
          ? resolveOrderId(op.localOrderId)
          : p_order_id;

        if (!resolvedOrderId) {
          console.log(
            "[OfflineSync] reopen_check: Order not synced yet, will retry",
          );
          return false;
        }

        if (!p_staff_id) {
          console.log(
            "[OfflineSync] reopen_check: No staff ID provided, cannot reopen",
          );
          return false;
        }

        const result = await OrderService.reopenCheck(
          _supabaseClient,
          resolvedOrderId,
          p_staff_id,
          p_reason,
        );
        return result.success;
      }

      // ================================================================
      // UNIFIED PAYMENT HANDLER - Uses process_payment_v2
      // Handles: Full card, Full cash, Split, Per-item payments
      // ================================================================
      case "process_payment":
      case "process_cash_payment": // Legacy support
      case "process_card_payment": {
        // Legacy support
        const {
          params: paymentParams,
          localOrderId,
          localPaymentId,
          paymentTimestamp,
          cardData,
          terminalResponse,
        } = op.params;

        // ============================================================
        // MIGRATE OLD PARAMETER NAMES FOR BACKWARDS COMPATIBILITY
        // ============================================================
        // Old queued payments may use p_item_ids instead of p_item_allocations
        if (paymentParams?.p_item_ids && !paymentParams?.p_item_allocations) {
          console.log(
            `[OfflineSync:payment] Migrating p_item_ids to p_item_allocations`,
          );
          // Old format: p_item_ids was just an array of order_item_ids
          // New format: p_item_allocations is array of { order_item_id, quantity, amount? }
          paymentParams.p_item_allocations = paymentParams.p_item_ids.map(
            (id: string) => ({
              order_item_id: id,
              quantity: 1, // Default to 1 for old format
            }),
          );
          delete paymentParams.p_item_ids;
        }

        console.log(`[OfflineSync:payment] ====== PROCESSING PAYMENT ======`);
        console.log(`[OfflineSync:payment] Type: ${op.type}`);
        console.log(
          `[OfflineSync:payment] Local Order ID: ${localOrderId || "N/A"}`,
        );
        console.log(
          `[OfflineSync:payment] Order ID in params: ${paymentParams?.p_order_id || "N/A"}`,
        );
        console.log(
          `[OfflineSync:payment] Amount: ${paymentParams?.p_amount}, Method: ${paymentParams?.p_payment_method}`,
        );

        // Resolve order ID if needed
        if (localOrderId && isLocalId(paymentParams.p_order_id)) {
          console.log(`[OfflineSync:payment] Order ID is local, resolving...`);
          const resolvedOrderId = resolveOrderId(localOrderId);
          if (!resolvedOrderId) {
            // ============================================================
            // CHECK FOR ORPHANED PAYMENTS
            // ============================================================
            // If there's no create_order pending AND order not in store,
            // this payment will never succeed - discard it
            const hasCreateOrderOp = hasPendingOrderCreation(localOrderId);
            const orderInStore =
              useOrderStore.getState().ordersById[localOrderId];

            if (!hasCreateOrderOp && !orderInStore) {
              console.log(
                `[OfflineSync:payment] ORPHANED - Order ${localOrderId} has no create_order and not in store`,
              );
              console.log(
                `[OfflineSync:payment] Discarding orphaned payment operation`,
              );
              // Return true to remove this operation from queue (it will never succeed)
              return true;
            }

            // Also check if order exists in store but has no db_order_id and no pending create_order
            if (
              orderInStore &&
              !orderInStore.db_order_id &&
              !hasCreateOrderOp
            ) {
              console.log(
                `[OfflineSync:payment] ORPHANED - Order ${localOrderId} has no db_order_id and no create_order`,
              );
              console.log(
                `[OfflineSync:payment] Discarding orphaned payment operation`,
              );
              return true;
            }

            console.log(
              `[OfflineSync:payment] BLOCKED - Order ${localOrderId} not synced yet`,
            );
            return false;
          }
          paymentParams.p_order_id = resolvedOrderId;
          console.log(`[OfflineSync:payment] Resolved to: ${resolvedOrderId}`);
        }

        // Resolve item allocations (support per-item/split-by-item payments queued with local IDs)
        if (
          paymentParams.p_item_allocations &&
          Array.isArray(paymentParams.p_item_allocations)
        ) {
          const resolvedAllocations: {
            order_item_id: string;
            quantity: number;
            amount?: number;
          }[] = [];
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
                  `[OfflineSync:payment] Item ${rawId} not synced yet, will retry`,
                );
                return false; // wait for item sync
              }
            } else {
              console.log(
                `[OfflineSync:payment] No localOrderId to resolve item ${rawId}, will retry`,
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
          ...(finalTerminalResponse && {
            p_terminal_response: finalTerminalResponse,
          }),
          // Pass idempotency key to prevent double-processing on retries
          ...(op.idempotencyKey && { p_idempotency_key: op.idempotencyKey }),
        };

        console.log(
          "[OfflineSync:payment] Calling process_payment_v7 with:",
          JSON.stringify({
            orderId: finalParams.p_order_id,
            method: finalParams.p_payment_method,
            amount: finalParams.p_amount,
            tip: finalParams.p_tip_amount || 0,
            hasTerminalResponse: !!finalParams.p_terminal_response,
          }),
        );

        const { data, error } = await OrderService.processPayment(
          _supabaseClient,
          finalParams,
        );

        if (error) {
          console.error(`[OfflineSync:payment] FAILED - Error:`, error);
          return false;
        }

        console.log(`[OfflineSync:payment] SUCCESS!`);
        console.log(
          `[OfflineSync:payment] Response:`,
          JSON.stringify(data, null, 2),
        );

        // Sync order state from backend response if available
        if (localOrderId && data) {
          const store = useOrderStore.getState();
          const order = store.ordersById[localOrderId];
          const responseData = data as any;

          // Update local order with backend payment response data
          if (
            responseData.order_amount_due !== undefined ||
            responseData.order_amount_paid !== undefined
          ) {
            store.updateOrderFromSync(localOrderId, {
              total_amount:
                responseData.order_card_total || responseData.order_total,
              total_tax: responseData.order_card_tax || responseData.order_tax,
            });
          }

          // ================================================================
          // Update order status to "preparing" if it was in draft/pending
          // This ensures payments from offline queue trigger proper workflow
          // ================================================================
          if (
            order &&
            (order.order_status === "draft" || order.order_status === "pending")
          ) {
            console.log(
              `[OfflineSync:payment] Updating order status: ${order.order_status} -> preparing`,
            );

            // Update order status and item statuses
            const updatedItems = order.items.map((item) => ({
              ...item,
              kitchen_status: getKitchenSentStatus(),
              item_status: "Preparing" as const,
            }));

            useOrderStore.setState((state) => {
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
                    opened_at:
                      currentOrder.opened_at || new Date().toISOString(),
                  },
                },
              };
            });

            console.log(
              `[OfflineSync:payment] Order status updated to "preparing", ${updatedItems.length} items marked as sent`,
            );
          }

          // Mark the specific payment as synced with backend payment_id and items covered
          // Uses localPaymentId or paymentTimestamp to find the correct payment (fixes split payment collapse)
          if (order && responseData.payment_id) {
            useOrderStore.setState((state) => {
              const currentOrder = state.ordersById[localOrderId];
              if (
                !currentOrder?.payments ||
                currentOrder.payments.length === 0
              ) {
                return state;
              }

              const payments = [...currentOrder.payments];

              // Find payment by localPaymentId or timestamp instead of using array index
              const paymentIndex = payments.findIndex(
                (p: any) =>
                  (localPaymentId && p.localId === localPaymentId) ||
                  (paymentTimestamp && p.timestamp === paymentTimestamp),
              );

              // Fallback to last payment only if no match found (legacy operations)
              const targetIdx =
                paymentIndex !== -1 ? paymentIndex : payments.length - 1;

              console.log(
                `[OfflineSync:payment] Updating payment at index ${targetIdx} (found by ${paymentIndex !== -1 ? "ID match" : "fallback"})`,
              );

              payments[targetIdx] = {
                ...payments[targetIdx],
                id: responseData.payment_id,
                itemsCovered:
                  responseData.items_covered ||
                  payments[targetIdx].itemsCovered ||
                  [],
                timestamp:
                  payments[targetIdx].timestamp || new Date().toISOString(),
                sync_status: "synced" as const,
                sync_error: undefined,
              };

              // Calculate paid_status from LOCAL payments, not backend
              // This prevents flicker caused by stale/racing backend values
              const localPaidStatus = calculatePaidStatusFromPayments(
                payments,
                currentOrder.total_amount || 0,
              );
              const isPaid = localPaidStatus === "Paid";

              return {
                ordersById: {
                  ...state.ordersById,
                  [localOrderId]: {
                    ...currentOrder,
                    payments,
                    amount_paid:
                      responseData.order_amount_paid ??
                      currentOrder.amount_paid,
                    amount_due:
                      responseData.order_amount_due ?? currentOrder.amount_due,
                    cash_amount_due:
                      responseData.order_cash_amount_due ??
                      currentOrder.cash_amount_due,
                    paid_status: localPaidStatus,
                    check_status: currentOrder.check_status ?? "Opened",
                  },
                },
              };
            });
          }

          // Also update payment amounts from backend
          if (
            responseData.order_amount_paid !== undefined ||
            responseData.order_amount_due !== undefined
          ) {
            useOrderStore.setState((state) => {
              const currentOrder = state.ordersById[localOrderId];
              if (!currentOrder) return state;

              // Mark the specific payment as synced (find by localPaymentId or timestamp)
              const payments = [...(currentOrder.payments || [])];
              if (payments.length > 0) {
                // Find payment by localPaymentId or timestamp instead of using array index
                const paymentIndex = payments.findIndex(
                  (p: any) =>
                    (localPaymentId && p.localId === localPaymentId) ||
                    (paymentTimestamp && p.timestamp === paymentTimestamp),
                );

                // Fallback to last payment only if no match found (legacy operations)
                const targetIdx =
                  paymentIndex !== -1 ? paymentIndex : payments.length - 1;

                payments[targetIdx] = {
                  ...payments[targetIdx],
                  sync_status: "synced" as const,
                  sync_error: undefined,
                };
              }

              // Calculate paid_status from LOCAL payments, not backend
              const localPaidStatus = calculatePaidStatusFromPayments(
                payments,
                currentOrder.total_amount || 0,
              );
              const isPaid = localPaidStatus === "Paid";

              return {
                ordersById: {
                  ...state.ordersById,
                  [localOrderId]: {
                    ...currentOrder,
                    payments,
                    amount_paid:
                      responseData.order_amount_paid ??
                      currentOrder.amount_paid,
                    amount_due:
                      responseData.order_amount_due ?? currentOrder.amount_due,
                    paid_status: localPaidStatus,
                    check_status: currentOrder.check_status ?? "Opened",
                  },
                },
              };
            });
          }

          // Trigger payment status sync from backend for fresh data
          // This ensures UI shows confirmed status after offline payment syncs
          console.log(
            `[OfflineSync:payment] Triggering payment status sync for order ${localOrderId}`,
          );
          setTimeout(() => {
            useOrderStore.getState().syncPaymentStatus(localOrderId);
          }, 300);
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
        console.log(
          `[OfflineSync:create_order] Params:`,
          JSON.stringify(createOrderParams, null, 2),
        );

        if (!selectedStore) {
          console.error(
            "[OfflineSync:create_order] FAILED - No store selected",
          );
          return false;
        }

        const { data, error } = await OrderService.createOrder(
          _supabaseClient,
          { ...createOrderParams, ...(op.idempotencyKey && { p_idempotency_key: op.idempotencyKey }) },
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
            // Use backendId since updateOrderDbId already rekeyed the order from localOrderId -> backendId
            store.updateOrderFromSync(backendId, {
              order_number: orderData.order_number,
              display_number:
                orderData.display_number || `#${orderData.order_number}`,
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
            console.log(
              `[OfflineSync:create_order] ${localOrderId} → ${backendId}`,
            );
            console.log(
              `[OfflineSync:create_order] Order number: ${orderData.order_number || orderData.display_number}`,
            );
          } else {
            console.error(
              "[OfflineSync:create_order] FAILED - No backend ID in response:",
              orderData,
            );
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
        console.log(
          `[OfflineSync:add_item] Item: ${itemData?.name || addItemParams?.p_item_name || "unknown"}`,
        );

        // Check if order exists and get its db_order_id
        const order = store.ordersById[localOrderId];
        if (!order) {
          console.error(
            `[OfflineSync:add_item] FAILED - Order ${localOrderId} not found in store`,
          );
          console.log(
            `[OfflineSync:add_item] Available orders:`,
            Object.keys(store.ordersById),
          );
          return false;
        }

        console.log(
          `[OfflineSync:add_item] Order in store: db_order_id=${order.db_order_id || "NONE"}`,
        );

        // Resolve the order ID - check registry, then store
        let actualDbOrderId = dbOrderId || order.db_order_id;
        if (!actualDbOrderId) {
          actualDbOrderId = resolveOrderId(localOrderId);
          console.log(
            `[OfflineSync:add_item] Resolved from registry: ${actualDbOrderId || "NOT_FOUND"}`,
          );
        }

        if (!actualDbOrderId) {
          console.log(
            `[OfflineSync:add_item] BLOCKED - Waiting for order sync`,
          );
          console.log(
            `[OfflineSync:add_item] Order ${localOrderId} has no db_order_id yet`,
          );
          return false; // Will be retried after order sync
        }

        console.log(
          `[OfflineSync:add_item] Using db_order_id: ${actualDbOrderId}`,
        );

        const isOpenItem =
          itemData?.is_open_item || addItemParams?.is_open_item;

        // Build params for open item vs regular item
        let params: AddOrderItemParams | AddOpenItemParams;
        if (isOpenItem) {
          params = {
            p_order_id: actualDbOrderId,
            p_item_name:
              itemData?.open_item_name ||
              itemData?.name ||
              addItemParams?.p_item_name,
            p_unit_price:
              itemData?.open_item_price ??
              itemData?.unitPrice ??
              addItemParams?.p_unit_price ??
              0,
            p_quantity: itemData?.quantity ?? addItemParams?.p_quantity ?? 1,
            p_special_instructions:
              itemData?.customizations?.notes ??
              addItemParams?.p_special_instructions,
            p_is_tax_exempt:
              itemData?.is_tax_exempt ??
              addItemParams?.p_is_tax_exempt ??
              false,
            p_seat_number:
              itemData?.seatNumber ??
              (addItemParams as AddOpenItemParams)?.p_seat_number ??
              undefined,
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
                })),
            );

            params = {
              p_order_id: actualDbOrderId,
              p_menu_item_id: itemData.menuItemId || undefined,
              p_location_exclusive_item_id:
                itemData.locationExclusiveItemId || undefined,
              p_quantity: itemData.quantity,
              p_item_name: itemData.name,
              p_category_name: itemData.category_name || "Uncategorized",
              // Use card price for p_unit_price and cash price for p_cash_unit_price
              // Fall back to originalPrice if specific prices not available
              p_unit_price: itemData.price ?? itemData.originalPrice ?? 0,
              p_cash_unit_price:
                itemData.cashPrice ?? itemData.price ?? itemData.originalPrice,
              p_selected_size_id:
                itemData.customizations?.size?.id || undefined,
              p_selected_size_name:
                itemData.customizations?.size?.name || undefined,
              p_size_price_modifier:
                itemData.customizations?.size?.priceModifier || undefined,
              p_special_instructions:
                itemData.customizations?.notes || undefined,
              // Set to undefined if empty array to avoid function signature mismatch
              p_modifiers:
                modifiersArray && modifiersArray.length > 0
                  ? modifiersArray
                  : undefined,
              p_course_number:
                useCoursingStore.getState().getWorkingCourse(localOrderId) || 1,
            } as AddOrderItemParams;
          } else {
            console.error(
              "[OfflineSync] No item params available for add_item",
            );
            return false;
          }
        }

        let data: any;
        let error: any;
        if (isOpenItem) {
          ({ data, error } = await OrderService.addOpenItem(
            _supabaseClient,
            params as AddOpenItemParams,
          ));
        } else {
          ({ data, error } = await OrderService.addOrderItem(
            _supabaseClient,
            params as AddOrderItemParams,
          ));
        }

        if (error) {
          console.error(`[OfflineSync:add_item] FAILED - DB Error:`, error);
          console.error(
            `[OfflineSync:add_item] Order: ${localOrderId}, Item: ${localItemId}`,
          );
          return false;
        }

        if (data?.order_item_id && localItemId) {
          // Update local item with backend ID
          store.updateItemDbId(localOrderId, localItemId, data.order_item_id);

          // Register in ID registry
          await mapLocalToBackend(localItemId, data.order_item_id);

          console.log(`[OfflineSync:add_item] SUCCESS!`);
          console.log(
            `[OfflineSync:add_item] ${localItemId} → ${data.order_item_id}`,
          );

          // Sync order totals from response if available
          const responseData = data as any;
          if (
            responseData.order_card_total ||
            responseData.order_cash_total ||
            responseData.order_total
          ) {
            store.updateOrderFromSync(localOrderId, {
              total_amount:
                responseData.order_card_total || responseData.order_total,
              total_tax: responseData.order_card_tax || responseData.order_tax,
              subtotal:
                responseData.order_card_subtotal || responseData.order_subtotal,
              cash_total: responseData.order_cash_total,
              cash_tax_amount: responseData.order_cash_tax,
              cash_subtotal: responseData.order_cash_subtotal,
            });
            console.log(
              `[OfflineSync:add_item] Synced order totals: card=${responseData.order_card_total}, cash=${responseData.order_cash_total}`,
            );
          }

          // Retroactively send to kitchen if item was fired during offline sync
          const latestStore = useOrderStore.getState();
          const latestOrder = latestStore.ordersById[localOrderId];
          const latestItem = latestOrder?.items.find(
            (i) => i.id === localItemId,
          );
          if (latestItem?.kitchen_status === "sent" && data.order_item_id) {
            console.log(
              `[OfflineSync:add_item] Item was fired during sync, retroactively sending to kitchen`,
            );
            try {
              await OrderService.bulkUpdateOrderItemStatus(
                _supabaseClient,
                [data.order_item_id],
                getKitchenSentStatus(),
              );
            } catch (retroErr) {
              console.warn(
                `[OfflineSync:add_item] Retroactive kitchen send failed, queuing send_to_kitchen:`,
                retroErr,
              );
              // Queue send_to_kitchen as fallback — don't fail the add_item op (prevents duplicates)
              await queueFailedOperation(
                "send_to_kitchen",
                { localOrderId, localItemIds: [localItemId] },
                localOrderId,
              );
            }
          }
        } else {
          console.log(
            `[OfflineSync:add_item] Completed but no order_item_id returned`,
          );
          console.log(`[OfflineSync:add_item] Response:`, data);
        }

        return true;
      }

      case "seat_guests": {
        const {
          tableIds,
          guestCount,
          guestName,
          guestPhone,
          reservationId,
          waitlistId,
          createOrder,
          localSessionId,
        } = op.params;

        if (!_supabaseClient || !tableIds?.length) return true;

        const primaryTableId = tableIds[0];
        const additionalTableIds = tableIds.slice(1);

        // Resolve staff/merchant context — prefer values stored in queued op,
        // fall back to current store state for old queued ops missing new fields
        const merchantId =
          op.params.merchantId ||
          useStoreSettingsStore.getState().selectedStore?.merchant_id ||
          "";
        const staffId =
          op.params.staffId ??
          useEmployeeStore.getState().loggedInEmployee?.profileId ??
          null;
        const serverStaffId = op.params.serverStaffId ?? staffId;
        const deviceId = op.params.deviceId ?? null;
        const stationId =
          op.params.stationId ??
          useStoreSettingsStore.getState().selectedStation?.id ??
          null;

        const { data, error } = await FloorPlanService.seatGuests(
          _supabaseClient,
          {
            p_table_id: primaryTableId,
            p_merchant_id: merchantId,
            p_staff_id: staffId,
            p_server_staff_id: serverStaffId,
            p_party_size: guestCount,
            p_guest_name: guestName || null,
            p_guest_phone: guestPhone || null,
            p_reservation_id: reservationId || null,
            p_waitlist_id: waitlistId || null,
            p_create_order: createOrder ?? true,
            p_device_id: deviceId,
            p_station_id: stationId,
            ...(op.idempotencyKey && { p_idempotency_key: op.idempotencyKey }),
          },
        );

        if (error) {
          console.error("[OfflineSync:seat_guests] Error:", error);
          return false;
        }

        if (data) {
          // Merge additional tables
          for (const extraTableId of additionalTableIds) {
            try {
              await FloorPlanService.mergeTableToSession(_supabaseClient, {
                p_session_id: data.session_id!,
                p_table_id: extraTableId,
              });
            } catch (mergeErr) {
              console.warn(
                `[OfflineSync:seat_guests] Merge failed for ${extraTableId}, queueing retry`,
                mergeErr,
              );
              queueOperation({
                type: "merge_table",
                params: { sessionId: data.session_id!, tableId: extraTableId },
                localOrderId: op.localOrderId,
              }).catch((e) =>
                console.error(
                  "[OfflineSync:seat_guests] Failed to queue merge:",
                  e,
                ),
              );
            }
          }

          // Hydrate order from RPC response
          if (data.order_id) {
            const orderStore = useOrderStore.getState();
            orderStore.hydrateOrderFromSeat({
              localOrderId: op.localOrderId,
              dbOrderId: data.order_id,
              sessionId: data.session_id!,
              orderNumber: data.order_number,
              displayNumber: data.display_number,
            });
          }

          // Dispatch SESSION_CREATED for all tables with this local session
          const { useTableSessionStore } =
            await import("@/stores/useTableSessionStore");
          const sessionStore = useTableSessionStore.getState();
          const actions: Array<{
            tableId: string;
            action: { type: "SESSION_CREATED"; session: any };
          }> = [];
          for (const tableId of tableIds) {
            const existing = sessionStore.sessions[tableId];
            if (existing?.id === localSessionId) {
              actions.push({
                tableId,
                action: {
                  type: "SESSION_CREATED",
                  session: {
                    ...existing,
                    id: data.session_id!,
                    order_id: data.order_id,
                    session_number:
                      data.session_number ?? existing.session_number,
                  },
                },
              });
            }
          }
          if (actions.length > 0) {
            sessionStore.batchDispatch(actions);
          }

          console.log(
            "[OfflineSync:seat_guests] Completed successfully:",
            data,
          );
        }

        return true;
      }

      case "merge_table": {
        const { sessionId, tableId } = op.params;
        if (!sessionId || !tableId) return true;

        const resolvedMergeSessionId = resolveSessionId(sessionId) ?? sessionId;
        if (!isValidUUID(resolvedMergeSessionId)) {
          console.log(
            `[OfflineSync:merge_table] Session ${sessionId} not synced yet`,
          );
          return false;
        }

        const { error: mergeError } =
          await FloorPlanService.mergeTableToSession(_supabaseClient, {
            p_session_id: resolvedMergeSessionId,
            p_table_id: tableId,
          });

        if (mergeError) {
          console.error("[OfflineSync:merge_table] Error:", mergeError);
          return false;
        }

        console.log(
          `[OfflineSync:merge_table] Merged table ${tableId} into session ${resolvedMergeSessionId}`,
        );
        return true;
      }

      case "update_session_status": {
        const { sessionId, status, staffId } = op.params;

        if (!sessionId || !status) {
          console.warn("[OfflineSync] update_session_status: missing params");
          return true;
        }

        const resolvedSessionId = resolveSessionId(sessionId) ?? sessionId;

        if (!isValidUUID(resolvedSessionId)) {
          console.log(
            `[OfflineSync] update_session_status: session ${sessionId} not synced yet`,
          );
          return false;
        }

        const { error } = await FloorPlanService.updateTableSessionStatus(
          _supabaseClient,
          {
            p_session_id: resolvedSessionId,
            p_status: status,
            p_staff_id: staffId ?? undefined,
          },
        );

        if (error) {
          console.error("[OfflineSync] update_session_status failed:", error);
          return false;
        }

        console.log(
          `[OfflineSync] update_session_status: ${resolvedSessionId} → ${status}`,
        );
        return true;
      }

      // ================================================================
      // LINK ORDER TO SESSION - Bidirectional linking
      // ================================================================
      case "link_order_to_session": {
        const { orderId, sessionId } = op.params;

        console.log(
          "[OfflineSync:link_order_to_session] Linking order to session",
          {
            orderId,
            sessionId,
          },
        );

        // Resolve IDs if they are local IDs
        const resolvedOrderId = resolveOrderId(orderId);
        if (!resolvedOrderId) {
          console.log(
            `[OfflineSync:link_order_to_session] BLOCKED - Order ${orderId} not synced yet`,
          );
          return false;
        }

        // Session ID should already be a backend UUID if from seatGuests
        // But check if it needs resolution
        const resolvedSessionId = sessionId; // Assuming sessionId is already backend UUID

        try {
          // Call the RPC function to link bidirectionally
          const { data, error } = await _supabaseClient.rpc(
            "link_order_to_session",
            {
              p_order_id: resolvedOrderId,
              p_session_id: resolvedSessionId,
              ...(op.idempotencyKey && { p_idempotency_key: op.idempotencyKey }),
            },
          );

          if (error) {
            console.error(
              "[OfflineSync:link_order_to_session] RPC error:",
              error,
            );
            return false;
          }

          console.log(
            "[OfflineSync:link_order_to_session] Successfully linked:",
            data,
          );
          return true;
        } catch (err) {
          console.error("[OfflineSync:link_order_to_session] Exception:", err);
          return false;
        }
      }

      // ================================================================
      // SEND TO KITCHEN - Updates order status + item statuses
      // ================================================================
      case "send_to_kitchen": {
        const { localOrderId, localItemIds } = op.params;

        console.log(
          `[OfflineSync:send_to_kitchen] ====== SENDING TO KITCHEN ======`,
        );
        console.log(
          `[OfflineSync:send_to_kitchen] Local Order ID: ${localOrderId}`,
        );
        console.log(
          `[OfflineSync:send_to_kitchen] Items to send: ${localItemIds?.length || 0}`,
        );

        // Resolve order ID
        const resolvedOrderId = resolveOrderId(localOrderId);
        if (!resolvedOrderId) {
          console.log(
            `[OfflineSync:send_to_kitchen] BLOCKED - Order ${localOrderId} not synced yet`,
          );
          return false;
        }

        console.log(
          `[OfflineSync:send_to_kitchen] Resolved order: ${resolvedOrderId}`,
        );

        try {
          // 1. Resolve item IDs FIRST (before any RPC calls)
          let resolvedItemIds: string[] = [];
          let unresolvedLocalItemIds: string[] = [];

          if (localItemIds && localItemIds.length > 0) {
            for (const localItemId of localItemIds) {
              const resolved = resolveItemId(localOrderId, localItemId);
              if (resolved) {
                resolvedItemIds.push(resolved);
              } else {
                unresolvedLocalItemIds.push(localItemId);
              }
            }

            console.log(
              `[OfflineSync:send_to_kitchen] Resolved ${resolvedItemIds.length}/${localItemIds.length} items` +
                (unresolvedLocalItemIds.length > 0
                  ? ` (${unresolvedLocalItemIds.length} unresolved)`
                  : ""),
            );

            // If zero items resolved, retry later — don't update order status yet
            if (resolvedItemIds.length === 0) {
              console.log(
                `[OfflineSync:send_to_kitchen] No items resolved yet, will retry`,
              );
              return false;
            }
          }

          // 2. Update order status
          // The bulk_update_order_item_status RPC sets sent_to_kitchen_at on the parent order,
          // which violates valid_status_transitions if the order is still in 'draft'.
          // So we must transition the order out of 'draft' before updating items.
          const currentOrder = Object.values(
            useOrderStore.getState().ordersById,
          ).find((o) => o.db_order_id === resolvedOrderId);
          const currentStatus = currentOrder?.order_status;
          const backendStatus =
            currentStatus === "draft" ? "sent_to_kitchen"
            : currentStatus === "sent_to_kitchen" ? "sent_to_kitchen"
            : currentStatus === "preparing" ? "preparing"
            : "preparing";

          const { error: statusError } = await OrderService.updateOrderStatus(
            _supabaseClient,
            resolvedOrderId,
            backendStatus as any,
          );

          if (statusError) {
            // P0001 or "already in" means the order is already in the target status - not an error
            if (
              statusError.code === "P0001" ||
              statusError.message?.includes("already in")
            ) {
              console.log(
                `[OfflineSync:send_to_kitchen] Order already in target status, treating as success`,
              );
            } else {
              console.error(
                "[OfflineSync:send_to_kitchen] Failed to update order status:",
                statusError,
              );
              return false;
            }
          } else {
            console.log(
              `[OfflineSync:send_to_kitchen] Order status updated to "${backendStatus}"`,
            );
          }

          // 3. Update resolved item statuses
          if (resolvedItemIds.length > 0) {
            const { error: itemError } =
              await OrderService.bulkUpdateOrderItemStatus(
                _supabaseClient,
                resolvedItemIds,
                getKitchenSentStatus(),
              );

            if (itemError) {
              console.error(
                "[OfflineSync:send_to_kitchen] Failed to update item statuses:",
                itemError,
              );
              // Fatal - retry the whole operation so items get updated
              return false;
            }

            console.log(
              `[OfflineSync:send_to_kitchen] ${resolvedItemIds.length} items marked as "sent"`,
            );
          }

          // 4. Re-queue unresolved items so they aren't lost
          if (unresolvedLocalItemIds.length > 0) {
            console.log(
              `[OfflineSync:send_to_kitchen] Re-queuing ${unresolvedLocalItemIds.length} unresolved items`,
            );
            await queueFailedOperation(
              "send_to_kitchen",
              { localOrderId, localItemIds: unresolvedLocalItemIds },
              localOrderId,
            );
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
            "[OfflineSync] fire_course: No dbOrderId, will retry later",
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
            `[OfflineSync] Course ${courseNumber} fired for order ${resolvedOrderId}`,
          );
          return true;
        } catch (err) {
          console.error("[OfflineSync] Error firing course:", err);
          return false;
        }
      }

      case "set_item_seat": {
        const { dbItemId, seatNumber } = op.params;
        if (!dbItemId) {
          console.log("[OfflineSync] set_item_seat: No dbItemId, will retry later");
          return false;
        }
        try {
          const { error } = await _supabaseClient.rpc("set_item_seat", {
            p_order_item_id: dbItemId,
            p_seat_number: seatNumber,
          });
          if (error) {
            console.error("[OfflineSync] Failed to set item seat:", error);
            return false;
          }
          return true;
        } catch (err) {
          console.error("[OfflineSync] Error setting item seat:", err);
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
            "[OfflineSync] remove_item: Item never synced, discarding",
          );
          return true;
        }

        const { error } = await OrderService.voidOrderItem(
          _supabaseClient,
          resolvedItemId,
          "Removed",
        );
        return !error;
      }

      case "record_cash_drawer_operation": {
        const {
          id, cash_drawer_id, session_id, operation_type, amount,
          performed_by, performed_at, order_id, payment_id,
          balance_after, reason, approved_by,
        } = op.params;

        if (!_supabaseClient) {
          console.log("[OfflineSync] record_cash_drawer_operation: No Supabase client");
          return false;
        }

        const { error } = await _supabaseClient
          .from("cash_drawer_operations")
          .insert({
            id, cash_drawer_id, session_id, operation_type, amount,
            performed_by, performed_at, order_id, payment_id,
            balance_after, reason, approved_by,
          });

        if (error) {
          console.error("[OfflineSync] record_cash_drawer_operation failed:", error);
          return false;
        }

        // Update session expected_cash
        if (balance_after != null) {
          await _supabaseClient
            .from("cash_drawer_sessions")
            .update({ expected_cash: balance_after })
            .eq("id", session_id);
        }

        return true;
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

// ============================================================================
// RECONCILIATION LOGIC (Phase 3.2)
// ============================================================================

/**
 * Reconcile order-session relationships after out-of-order syncing.
 *
 * This function runs after each sync batch to fix broken links between orders
 * and sessions that occurred when one entity synced before the other.
 *
 * Example scenario:
 * 1. Offline: Create order (local_order_123) + session (local_session_456)
 * 2. Go online
 * 3. Order syncs first → gets UUID (uuid-abc)
 * 4. Session syncs second → still references local_order_123
 * 5. This function fixes the link by finding related entities and updating them
 */
export async function reconcileRelationships(): Promise<void> {
  if (!_supabaseClient) {
    console.warn("[reconcile] No Supabase client available, skipping");
    return;
  }

  console.log("[reconcile] ====== STARTING RECONCILIATION ======");

  try {
    // ================================================================
    // PASS 1: Find orders missing session_id
    // ================================================================
    const { ordersById } = useOrderStore.getState();
    const orphanedOrders = Object.values(ordersById).filter(
      (order) => order.local_session_id && !order.session_id,
    );

    console.log(
      `[reconcile] Found ${orphanedOrders.length} orders missing session_id`,
    );

    for (const order of orphanedOrders) {
      try {
        // Try to resolve the local session ID to a backend UUID
        const backendSessionId = order.local_session_id
          ? resolveSessionId(order.local_session_id)
          : undefined;

        if (backendSessionId) {
          console.log(
            `[reconcile] ✓ Linking order ${order.id} to session ${backendSessionId}`,
          );

          // Call the RPC to set bidirectional link
          const { data, error } = await _supabaseClient.rpc(
            "link_order_to_session",
            {
              p_order_id: order.db_order_id,
              p_session_id: backendSessionId,
            },
          );

          if (error) {
            console.error(
              `[reconcile] Failed to link order ${order.id}:`,
              error,
            );
          } else {
            console.log(
              `[reconcile] Successfully linked order ${order.id}`,
              data,
            );

            // Update local state
            useOrderStore.setState((state) => ({
              ordersById: {
                ...state.ordersById,
                [order.id]: {
                  ...order,
                  session_id: backendSessionId,
                },
              },
            }));
          }
        } else {
          console.warn(
            `[reconcile] ⚠ Session ${order.local_session_id} not synced yet, will retry later`,
          );
        }
      } catch (err) {
        console.error(`[reconcile] Error processing order ${order.id}:`, err);
      }
    }

    // ================================================================
    // PASS 2: Find sessions with local order IDs
    // ================================================================
    // This would require FloorPlanStore integration
    // For now, we rely on PASS 1 which handles most cases
    // TODO: Add FloorPlanStore reconciliation when available

    console.log("[reconcile] ====== RECONCILIATION COMPLETE ======");
  } catch (error) {
    console.error("[reconcile] Reconciliation failed:", error);
    // Don't throw - reconciliation will retry on next sync
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
  contextSnapshot?: Record<string, any>,
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
  contextSnapshot?: Record<string, any>,
): Promise<string> {
  return queueDependentOperation(
    {
      type,
      params,
      localOrderId,
      localItemId,
      contextSnapshot,
    },
    dependsOnOperationId,
  );
}

/**
 * Queue a payment operation with special handling.
 */
export async function queuePaymentOperation(
  type: "process_cash_payment" | "process_card_payment",
  paymentParams: Record<string, any>,
  localOrderId: string,
  cardData?: { lastFour?: string; brand?: string; transactionRef?: string },
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
