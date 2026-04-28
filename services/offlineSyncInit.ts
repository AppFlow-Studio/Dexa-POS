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

import { queryClient } from '@/contexts/TanstackProvider'
import { getDeviceId } from '@/lib/deviceId'
import {
  getKitchenSentStatus,
  getOrderSentStatus
} from '@/lib/kitchenStatusUtils'
import {
  forceSetLocalSequence,
  parseSequenceFromDisplayNumber
} from '@/lib/localOrderSequence'
import {
  initIdRegistry,
  isLocalId,
  isValidUUID,
  mapLocalToBackend,
  resolveToBackendId
} from '@/lib/offlineIdRegistry'
import { FloorPlanService } from '@/services/floorPlanService'
import {
  earnLoyaltyForOrder,
  findOrCreateCustomerByPhone
} from '@/services/loyalty/loyaltyService'
import {
  getFailedPayments,
  getIsOnline,
  getOfflineDurationMs,
  getPendingPaymentsCount,
  hasPendingOrderCreation,
  initOfflineSyncService,
  isServiceInitialized,
  OfflineOperation,
  OPERATION_PRIORITY,
  processQueueNow,
  queueDependentOperation,
  queueOperation
} from '@/services/offlineSyncService'
import { toIdempotencyKey } from '@/lib/network/idempotencyKey'
import { OrderDiscountService } from '@/services/orderDiscountService'
import { AddOpenItemParams, OrderService } from '@/services/orderService'
import { useCoursingStore } from '@/stores/useCoursingStore'
import { useEmployeeStore } from '@/stores/useEmployeeStore'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import { useSyncStatusStore } from '@/stores/useSyncStatusStore'
import type { AddOrderItemParams } from '@/types/db-order-management-types'
// NOTE: useOrderStore is NOT imported at top level to avoid circular dependency:
// offlineSyncInit ↔ useOrderStore (useOrderStore imports queueFailedOperation from this file).
// Same pattern as usePaymentStore below. Use lazy require() via _getOrderStore() at call site.
// NOTE: usePaymentStore is NOT imported at top level to avoid circular dependency:
// useOrderStore → offlineSyncInit → usePaymentStore → useOrderStore
// Instead, use lazy require() at call site.

function _getOrderStore () {
  return require('@/stores/useOrderStore').useOrderStore
}
function _getCalculatePaidStatus () {
  return require('@/stores/useOrderStore').calculatePaidStatusFromPayments
}

let _supabaseClient: any = null

function isAlreadyDoneSyncError (
  error: any,
  messageMatchers: string[] = []
): boolean {
  if (!error) return false

  const code = String(error.code ?? '')
  const message = String(error.message ?? '').toLowerCase()

  if (code === '23505') return true

  if (code === 'P0001') {
    if (message.includes('already')) return true
    if (messageMatchers.some(m => message.includes(m.toLowerCase()))) {
      return true
    }
  }

  return false
}

// Callback for failed payment notifications
let _onPaymentFailed: ((payment: OfflineOperation) => void) | null = null

/**
 * Set the Supabase client for backend operations.
 * Call this after Supabase is initialized.
 */
export function setOfflineSyncSupabaseClient (client: any): void {
  _supabaseClient = client
}

/**
 * Set a callback for when payment operations fail.
 */
export function setOnPaymentFailed (
  callback: (payment: OfflineOperation) => void
): void {
  _onPaymentFailed = callback
}

/**
 * Get the count of pending payment operations.
 */
export function getPendingPayments (): number {
  return getPendingPaymentsCount()
}

// Re-export so consumers can check init state without importing offlineSyncService directly
// (avoids circular dependency issues with module load order)
export { isServiceInitialized }

/**
 * Get all failed payment operations.
 */
export function getFailedPaymentOperations (): OfflineOperation[] {
  return getFailedPayments()
}

/**
 * Reconciliation sweep: find orders in unsyncedOrderIds that have no db_order_id
 * and no pending create_order in the queue, then re-queue create_order for them.
 *
 * This is a safety net for when create_order ops are lost (MMKV corruption,
 * dead-lettered, app restart edge cases).
 */
async function reconcileLostOrderCreations (): Promise<number> {
  const store = _getOrderStore().getState()
  const { unsyncedOrderIds, ordersById } = store
  const selectedStore = useStoreSettingsStore.getState().selectedStore

  if (!selectedStore) {
    console.log('[OfflineSync:reconcile] No store selected, skipping sweep')
    return 0
  }

  if (unsyncedOrderIds.length === 0) {
    return 0
  }

  console.log(
    `[OfflineSync:reconcile] Scanning ${unsyncedOrderIds.length} unsynced orders for lost create_order ops...`
  )

  let requeuedCount = 0

  for (const orderId of unsyncedOrderIds) {
    const order = ordersById[orderId]

    // Guard: order must exist in store
    if (!order) continue

    // Guard: already has db_order_id (shouldn't be in unsyncedOrderIds, but be safe)
    if (order.db_order_id) continue

    // Guard: already has a pending create_order in queue
    if (hasPendingOrderCreation(orderId)) continue

    // Guard: order was already synced (registry has mapping from create_order success)
    const backendId = resolveToBackendId(orderId)
    if (backendId) {
      console.log(
        `[OfflineSync:reconcile] Order ${orderId} already synced (registry: ${backendId}), skipping`
      )
      continue
    }

    // Guard: skip voided/cancelled orders — no point syncing them
    if (order.order_status === 'void' || order.order_status === 'cancelled')
      continue

    console.log(
      `[OfflineSync:reconcile] Order ${orderId} has no db_order_id and no pending create_order — re-queuing`
    )

    // Build createOrderParams mirroring ensureOrderCreated (useOrderStore.ts:609-622)
    await queueOperation({
      type: 'create_order',
      params: {
        localOrderId: orderId,
        createOrderParams: {
          p_merchant_id: selectedStore.merchant_id,
          p_location_id: selectedStore.id,
          p_order_type: order.order_type || 'dine_in',
          p_table_number: order.service_location_id || null,
          p_customer_name: order.customer_name || null,
          p_customer_phone: order.customer_phone || null,
          p_special_instructions: null,
          p_device_id: getDeviceId(),
          p_created_by_staff_id:
            useEmployeeStore.getState().loggedInEmployee?.profileId || null,
          p_station_id:
            useStoreSettingsStore.getState().selectedStation?.id || null
        }
      },
      localOrderId: orderId,
      contextSnapshot: {
        order_type: order.order_type,
        service_location_id: order.service_location_id,
        storeId: selectedStore.id,
        merchantId: selectedStore.merchant_id,
        reconciliation_sweep: true
      }
    })

    requeuedCount++
  }

  if (requeuedCount > 0) {
    console.log(
      `[OfflineSync:reconcile] Re-queued ${requeuedCount} lost create_order operations`
    )
  } else {
    console.log('[OfflineSync:reconcile] No lost create_order ops found')
  }

  return requeuedCount
}

/**
 * Initialize the offline sync system.
 * Call this once at app startup.
 */
export async function initializeOfflineSync (): Promise<void> {
  // Initialize the ID registry first
  await initIdRegistry()

  await initOfflineSyncService({
    onStatusChange: async isOnline => {
      // Lazy access: useOrderStore may be undefined at init time due to circular deps
      // (useOrderStore → offlineSyncInit → useOrderStore). By the time callbacks fire,
      // all modules are fully loaded.
      _getOrderStore().getState().setOnlineStatus(isOnline)

      // When we come back online, reconcile orders with failed syncs
      if (isOnline) {
        // Refresh stale data if offline for a significant period
        const offlineDurationMs = getOfflineDurationMs()
        const STALENESS_THRESHOLD_MS = 5 * 60 * 1000 // 5 minutes

        if (offlineDurationMs > STALENESS_THRESHOLD_MS) {
          console.log(
            `[OfflineSync] Offline for ${Math.round(
              offlineDurationMs / 1000
            )}s — refreshing menu data`
          )
          try {
            const { useMenuStore } = require('@/stores/useMenuStore')
            await useMenuStore.getState().fetchMenu?.()
          } catch (err) {
            console.warn('[OfflineSync] Menu refresh failed:', err)
          }
        }

        console.log(
          '[OfflineSync] Network restored, flushing queue before reconciliation...'
        )

        // Flush the queue FIRST so create_order ops complete before anything
        // tries to work with orders that don't have db_order_id yet
        await processQueueNow()

        // Reconciliation sweep: re-queue lost create_order ops
        const requeuedCount = await reconcileLostOrderCreations()
        if (requeuedCount > 0) {
          console.log(
            `[OfflineSync] Re-queued ${requeuedCount} lost create_order ops, flushing again...`
          )
          await processQueueNow()
        }

        // Drain customer create+link queue so temp IDs resolve
        // before update_order_details ops reference customer_id
        try {
          const { processCustomerQueue } = require('@/services/customer')
          await processCustomerQueue(_supabaseClient)
        } catch (err) {
          console.warn('[OfflineSync] Customer queue processing failed:', err)
        }

        // Get fresh state after queue flush
        const currentStore = _getOrderStore().getState()
        const failedOrders = currentStore.getOrdersWithFailedSyncs()

        if (failedOrders.length > 0) {
          console.log(
            `[OfflineSync] Found ${failedOrders.length} orders with failed syncs, retrying...`
          )

          for (const order of failedOrders) {
            try {
              await currentStore.retryFailedSyncs(order.localId)
              console.log(
                `[OfflineSync] Retried syncs for order ${order.localId}`
              )
            } catch (err) {
              console.error(
                `[OfflineSync] Failed to retry syncs for order ${order.localId}:`,
                err
              )
            }
          }
        } else {
          console.log('[OfflineSync] No orders with failed syncs found')
        }

        // Run reconciliation to fix any broken order-session relationships
        // This handles out-of-order syncing where orders and sessions sync separately
        console.log('[OfflineSync] Running relationship reconciliation...')
        await reconcileRelationships()

        // Reconcile table sessions with backend state
        console.log('[OfflineSync] Running table session reconciliation...')
        await reconcileTableSessions()

        // Immediately refresh floor plan statuses to eliminate 5-15s polling gap
        try {
          const { useFloorPlanStore } = require('@/stores/useFloorPlanStore')
          const floorPlanState = useFloorPlanStore.getState()
          if (floorPlanState.selectedLocationId) {
            floorPlanState.loadFloorPlanStatus()
          }
        } catch (fpErr) {
          console.warn(
            '[OfflineSync] Floor plan refresh on reconnect failed:',
            fpErr
          )
        }
      }
    },
    onQueueChange: count => {
      // Lazy access to avoid circular dep (same as onStatusChange above)
      _getOrderStore().getState().setPendingSyncCount(count)
      // Refresh payment store so "X payments queued" badge updates after sync
      // Lazy require to avoid circular dep: useOrderStore → offlineSyncInit → usePaymentStore → useOrderStore
      const { usePaymentStore } = require('@/stores/usePaymentStore')
      usePaymentStore.getState().refreshOfflinePaymentStatus()
    },
    onOperationFailed: op => {
      console.log('[OfflineSync] Operation failed permanently:', op.type, op.id)

      // Special handling for failed payments
      if (
        op.type === 'process_cash_payment' ||
        op.type === 'process_card_payment'
      ) {
        console.error('[OfflineSync] Payment failed:', op, _supabaseClient)
        _onPaymentFailed?.(op)
      }
    },
    executeOperation: async (op: OfflineOperation): Promise<boolean> => {
      return executeQueuedOperation(op)
    }
  })
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
function resolveOrderId (localOrderId: string): string | null {
  // First check if it's already a valid UUID (backend ID)
  if (isValidUUID(localOrderId)) {
    return localOrderId
  }

  // It's a local ID - need to resolve to backend ID
  // Try registry first (contains mappings from previous syncs)
  const fromRegistry = resolveToBackendId(localOrderId)
  if (fromRegistry) {
    console.log(
      `[resolveOrderId] Resolved ${localOrderId} from registry: ${fromRegistry}`
    )
    return fromRegistry
  }

  // Fall back to store lookup (order might have db_order_id set)
  const store = _getOrderStore().getState()
  const order = store.ordersById[localOrderId]
  if (order?.db_order_id) {
    console.log(
      `[resolveOrderId] Resolved ${localOrderId} from store: ${order.db_order_id}`
    )
    return order.db_order_id
  }

  // Check persistent localIdToDbOrderId mapping (survives rekey + pendingOrderCreations cleanup)
  const { getKnownDbOrderId } = require('@/stores/useOrderStore')
  const knownDbId = getKnownDbOrderId(localOrderId)
  if (knownDbId) {
    console.log(
      `[resolveOrderId] Resolved ${localOrderId} from localIdToDbOrderId: ${knownDbId}`
    )
    return knownDbId
  }

  // Order hasn't been synced yet
  console.log(
    `[resolveOrderId] Cannot resolve ${localOrderId} - order not synced yet`
  )
  return null
}

/**
 * Resolve a local item ID to backend UUID.
 *
 * @returns Backend UUID string, or null if item hasn't been synced yet
 */
function resolveItemId (
  localOrderId: string,
  localItemId: string
): string | null {
  // First check if it's already a valid UUID (backend ID)
  if (isValidUUID(localItemId)) {
    return localItemId
  }

  // Try registry first
  const fromRegistry = resolveToBackendId(localItemId)
  if (fromRegistry) return fromRegistry

  // Fall back to resilient store lookup.
  // Orders can be re-keyed from local id -> db_order_id after create_order sync,
  // so direct ordersById[localOrderId] may miss items queued pre-rekey.
  const store = _getOrderStore().getState()

  const directOrder = store.ordersById[localOrderId]
  const resolvedOrderId = resolveOrderId(localOrderId)
  const mappedOrder = resolvedOrderId ? store.ordersById[resolvedOrderId] : null
  const resilientOrder =
    typeof store.getOrder === 'function' ? store.getOrder(localOrderId) : null

  const candidateOrders = [directOrder, mappedOrder, resilientOrder].filter(
    Boolean
  ) as any[]

  for (const order of candidateOrders) {
    const item = order?.items?.find((i: any) => i.id === localItemId)
    if (item?.db_order_item_id) {
      return item.db_order_item_id
    }
  }

  // Final fallback: scan all loaded orders by local item id.
  // This guards against stale order keys during reconnect race windows.
  for (const order of Object.values(store.ordersById) as any[]) {
    const item = order?.items?.find((i: any) => i.id === localItemId)
    if (item?.db_order_item_id) {
      return item.db_order_item_id
    }
  }

  return null
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
function resolveSessionId (localSessionId: string): string | null {
  // First check if it's already a valid UUID (backend ID)
  if (isValidUUID(localSessionId)) {
    return localSessionId
  }

  // It's a local ID - try registry first
  const fromRegistry = resolveToBackendId(localSessionId)
  if (fromRegistry) {
    console.log(
      `[resolveSessionId] Resolved ${localSessionId} from registry: ${fromRegistry}`
    )
    return fromRegistry
  }

  // Fall back to FloorPlanStore lookup
  // TODO: Implement when FloorPlanStore has session lookup
  console.log(
    `[resolveSessionId] Cannot resolve ${localSessionId} - session not synced yet`
  )
  return null
}

/**
 * Execute a queued operation against the backend.
 * Returns true on success, false on failure.
 * Handles ID resolution from local to backend IDs.
 */
async function executeQueuedOperation (op: OfflineOperation): Promise<boolean> {
  console.log('[OfflineSync] Executing queued operation:', op.type)
  if (!_supabaseClient) {
    console.error('[OfflineSync] No Supabase client available')
    return false
  }

  try {
    switch (op.type) {
      case 'update_item_quantity': {
        const {
          orderItemId,
          quantity,
          localOrderId: paramsLocalOrderId,
          localItemId: paramsLocalItemId
        } = op.params

        const localOrderId = paramsLocalOrderId || op.localOrderId
        const localItemId = paramsLocalItemId || op.localItemId

        // Resolve item ID if it was a local ID
        const resolvedItemId =
          localItemId && localOrderId
            ? resolveItemId(localOrderId, localItemId)
            : orderItemId

        if (!resolvedItemId) {
          console.log(
            '[OfflineSync] update_item_quantity: Item not synced yet, will retry'
          )
          return false
        }

        const { error } = await OrderService.updateOrderItemQuantity(
          _supabaseClient,
          resolvedItemId,
          quantity
        )
        return !error
      }

      case 'update_item': {
        const { orderItemId, specialInstructions, localOrderId, localItemId } =
          op.params

        const resolvedItemId =
          localItemId && localOrderId
            ? resolveItemId(localOrderId, localItemId)
            : orderItemId

        if (!resolvedItemId) {
          console.log(
            '[OfflineSync] update_item: Item not synced yet, will retry'
          )
          return false
        }

        const { error } = await OrderService.updateOrderItem(_supabaseClient, {
          p_order_item_id: resolvedItemId,
          p_special_instructions: specialInstructions
        })
        return !error
      }

      case 'replace_modifiers': {
        const { orderItemId, modifiers, localOrderId, localItemId } = op.params

        const resolvedItemId =
          localItemId && localOrderId
            ? resolveItemId(localOrderId, localItemId)
            : orderItemId

        if (!resolvedItemId) {
          console.log(
            '[OfflineSync] replace_modifiers: Item not synced yet, will retry'
          )
          return false
        }

        const { error } = await OrderService.replaceOrderItemModifiers(
          _supabaseClient,
          resolvedItemId,
          modifiers
        )
        return !error
      }

      case 'apply_discount': {
        const { localOrderId, discount } = op.params
        const store = _getOrderStore().getState()
        const order = store.ordersById[localOrderId]
        const resolvedOrderId =
          order?.db_order_id || resolveOrderId(localOrderId)

        if (!resolvedOrderId) {
          console.log(
            '[OfflineSync] apply_discount: Order not synced yet, will retry'
          )
          return false
        }

        // Get staff ID - use from discount if available, otherwise get from employee store
        const staffId =
          discount.applied_by_staff_profiles_id ??
          useEmployeeStore.getState().loggedInEmployee?.profileId ??
          null

        if (!staffId) {
          console.warn(
            '[OfflineSync] apply_discount: No staff ID available, will retry'
          )
          return false
        }

        const result = await OrderDiscountService.applyDiscount(
          _supabaseClient,
          {
            order_id: resolvedOrderId,
            staff_id: staffId,
            discount_id: discount.discount_id ?? null,
            discount_name: discount.discount_name ?? 'Discount',
            discount_type: discount.discount_type,
            discount_value: discount.discount_value,
            source: discount.source ?? 'preset',
            reason: null,
            applied_to_item_ids: discount.applied_to_item_ids ?? null,
            approved_by_staff_id: discount.approved_by_staff_profiles_id ?? null
          }
        )

        if (result.success && result.order_discount_id) {
          // Mark local discount as synced with backend order_discount_id
          _getOrderStore().setState((state: any) => {
            const existingOrder = state.ordersById[localOrderId]
            if (!existingOrder?.applied_discounts) return state
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
                            sync_status: 'synced',
                            sync_error: null
                          }
                        : d
                  )
                }
              }
            }
          })
          return true
        } else if (result.requires_approval) {
          console.warn(
            '[OfflineSync] apply_discount: Requires manager approval'
          )
          // Don't retry - needs user intervention
          return true // Mark as "handled" to prevent infinite retries
        } else {
          const err = typeof result.error === 'string' ? result.error : ''
          if (
            err.includes('invalid input value for enum discount_type') ||
            err.includes('22P02')
          ) {
            console.error(
              '[OfflineSync] apply_discount: Non-retryable enum error, dropping op:',
              result.error
            )
            return true
          }
          console.error(
            '[OfflineSync] apply_discount: RPC failed:',
            result.error
          )
          return false
        }
      }

      case 'void_discount': {
        const { localOrderId, order_discount_id, void_reason } = op.params
        const store = _getOrderStore().getState()
        const order = store.ordersById[localOrderId]
        const resolvedOrderId =
          order?.db_order_id || resolveOrderId(localOrderId)

        if (!resolvedOrderId) {
          console.log(
            '[OfflineSync] void_discount: Order not synced yet, will retry'
          )
          return false
        }

        if (!order_discount_id) {
          console.log(
            '[OfflineSync] void_discount: No order_discount_id, skipping'
          )
          return true // Nothing to void
        }

        const staffId =
          useEmployeeStore.getState().loggedInEmployee?.profileId ?? null

        if (!staffId) {
          console.warn(
            '[OfflineSync] void_discount: No staff ID available, will retry'
          )
          return false
        }

        const result = await OrderDiscountService.voidDiscount(
          _supabaseClient,
          {
            order_id: resolvedOrderId,
            staff_id: staffId,
            order_discount_id: order_discount_id,
            void_reason: void_reason ?? null
          }
        )

        if (result.success) {
          console.log(
            '[OfflineSync] void_discount: Successfully voided',
            order_discount_id
          )
          return true
        } else {
          const err = typeof result.error === 'string' ? result.error : ''
          if (
            err.toLowerCase().includes('already voided') ||
            err.toLowerCase().includes('not found')
          ) {
            console.log(
              '[OfflineSync:void_discount] Already voided, treating as success'
            )
            return true
          }
          console.error(
            '[OfflineSync] void_discount: RPC failed:',
            result.error
          )
          return false
        }
      }

      case 'void_item': {
        const { orderItemId, reason, localOrderId, localItemId } = op.params

        const resolvedItemId =
          localItemId && localOrderId
            ? resolveItemId(localOrderId, localItemId)
            : orderItemId

        if (!resolvedItemId) {
          console.log(
            '[OfflineSync] void_item: Item not synced yet, will retry'
          )
          return false
        }

        const { error } = await OrderService.voidOrderItem(
          _supabaseClient,
          resolvedItemId,
          reason
        )
        if (error) {
          const msg = error.message?.toLowerCase() ?? ''
          if (
            msg.includes('not found') ||
            msg.includes('already voided') ||
            error.code === '23505'
          ) {
            console.log(
              '[OfflineSync:void_item] Already voided/not found, treating as success'
            )
            return true
          }
          return false
        }
        return true
      }

      case 'update_order_status': {
        const { orderId, status, reason, localOrderId } = op.params

        const resolvedOrderId = localOrderId
          ? resolveOrderId(localOrderId)
          : orderId

        if (!resolvedOrderId) {
          console.log(
            '[OfflineSync] update_order_status: Order not synced yet, will retry'
          )
          return false
        }

        const { error } = await OrderService.updateOrderStatus(
          _supabaseClient,
          resolvedOrderId,
          status,
          reason
        )
        return !error
      }

      // ================================================================
      // CHECK STATUS HANDLERS - Close/Reopen check
      // ================================================================
      case 'close_check': {
        const { p_order_id, p_staff_id } = op.params

        const resolvedOrderId = op.localOrderId
          ? resolveOrderId(op.localOrderId)
          : p_order_id

        if (!resolvedOrderId) {
          console.log(
            '[OfflineSync] close_check: Order not synced yet, will retry'
          )
          return false
        }

        const result = await OrderService.closeCheck(
          _supabaseClient,
          resolvedOrderId,
          p_staff_id
        )
        if (!result.success) {
          const err = typeof result.error === 'string' ? result.error : ''
          if (
            err.toLowerCase().includes('already closed') ||
            err.toLowerCase().includes('check is closed')
          ) {
            console.log(
              '[OfflineSync:close_check] Already closed, treating as success'
            )
            return true
          }
        }
        return result.success
      }

      case 'reopen_check': {
        const { p_order_id, p_staff_id, p_reason } = op.params

        const resolvedOrderId = op.localOrderId
          ? resolveOrderId(op.localOrderId)
          : p_order_id

        if (!resolvedOrderId) {
          console.log(
            '[OfflineSync] reopen_check: Order not synced yet, will retry'
          )
          return false
        }

        if (!p_staff_id) {
          console.log(
            '[OfflineSync] reopen_check: No staff ID provided, cannot reopen'
          )
          return false
        }

        const result = await OrderService.reopenCheck(
          _supabaseClient,
          resolvedOrderId,
          p_staff_id,
          p_reason
        )
        if (!result.success) {
          const err = typeof result.error === 'string' ? result.error : ''
          if (
            err.toLowerCase().includes('not closed') ||
            err.toLowerCase().includes('already open')
          ) {
            console.log(
              '[OfflineSync:reopen_check] Already open, treating as success'
            )
            return true
          }
        }
        return result.success
      }

      // ================================================================
      // UNIFIED PAYMENT HANDLER - Uses process_payment_v2
      // Handles: Full card, Full cash, Split, Per-item payments
      // ================================================================
      case 'process_payment':
      case 'process_cash_payment': // Legacy support
      case 'process_card_payment': {
        // Legacy support
        const {
          params: paymentParams,
          localOrderId,
          localPaymentId,
          paymentTimestamp,
          cardData,
          terminalResponse
        } = op.params

        // ============================================================
        // MIGRATE OLD PARAMETER NAMES FOR BACKWARDS COMPATIBILITY
        // ============================================================
        // Old queued payments may use p_item_ids instead of p_item_allocations
        if (paymentParams?.p_item_ids && !paymentParams?.p_item_allocations) {
          console.log(
            `[OfflineSync:payment] Migrating p_item_ids to p_item_allocations`
          )
          // Old format: p_item_ids was just an array of order_item_ids
          // New format: p_item_allocations is array of { order_item_id, quantity, amount? }
          paymentParams.p_item_allocations = paymentParams.p_item_ids.map(
            (id: string) => ({
              order_item_id: id,
              quantity: 1 // Default to 1 for old format
            })
          )
          delete paymentParams.p_item_ids
        }

        console.log(`[OfflineSync:payment] ====== PROCESSING PAYMENT ======`)
        console.log(`[OfflineSync:payment] Type: ${op.type}`)
        console.log(
          `[OfflineSync:payment] Local Order ID: ${localOrderId || 'N/A'}`
        )
        console.log(
          `[OfflineSync:payment] Order ID in params: ${
            paymentParams?.p_order_id || 'N/A'
          }`
        )
        console.log(
          `[OfflineSync:payment] Amount: ${paymentParams?.p_amount}, Method: ${paymentParams?.p_payment_method}`
        )

        // Resolve order ID if needed
        if (localOrderId && isLocalId(paymentParams.p_order_id)) {
          console.log(`[OfflineSync:payment] Order ID is local, resolving...`)
          const resolvedOrderId = resolveOrderId(localOrderId)
          if (!resolvedOrderId) {
            // ============================================================
            // CHECK FOR ORPHANED PAYMENTS
            // ============================================================
            // If there's no create_order pending AND order not in store,
            // this payment will never succeed - discard it
            const hasCreateOrderOp = hasPendingOrderCreation(localOrderId)
            const orderInStore =
              _getOrderStore().getState().ordersById[localOrderId]

            if (!hasCreateOrderOp && !orderInStore) {
              console.log(
                `[OfflineSync:payment] ORPHANED - Order ${localOrderId} has no create_order and not in store`
              )
              console.log(
                `[OfflineSync:payment] Discarding orphaned payment operation`
              )
              // Return true to remove this operation from queue (it will never succeed)
              return true
            }

            // Also check if order exists in store but has no db_order_id and no pending create_order
            if (
              orderInStore &&
              !orderInStore.db_order_id &&
              !hasCreateOrderOp
            ) {
              console.log(
                `[OfflineSync:payment] ORPHANED - Order ${localOrderId} has no db_order_id and no create_order`
              )
              console.log(
                `[OfflineSync:payment] Discarding orphaned payment operation`
              )
              return true
            }

            console.log(
              `[OfflineSync:payment] BLOCKED - Order ${localOrderId} not synced yet`
            )
            return false
          }
          paymentParams.p_order_id = resolvedOrderId
          console.log(`[OfflineSync:payment] Resolved to: ${resolvedOrderId}`)
        }

        // Resolve item allocations (support per-item/split-by-item payments queued with local IDs)
        if (
          paymentParams.p_item_allocations &&
          Array.isArray(paymentParams.p_item_allocations)
        ) {
          const resolvedAllocations: {
            order_item_id: string
            quantity: number
            amount?: number
          }[] = []
          for (const alloc of paymentParams.p_item_allocations) {
            const rawId = alloc.order_item_id
            // If already a UUID, keep it; otherwise resolve via registry/store
            if (isValidUUID(rawId)) {
              resolvedAllocations.push(alloc)
              continue
            }

            if (localOrderId) {
              const resolved = resolveItemId(localOrderId, rawId)
              if (resolved) {
                resolvedAllocations.push({
                  ...alloc,
                  order_item_id: resolved
                })
              } else {
                console.log(
                  `[OfflineSync:payment] Item ${rawId} not synced yet, will retry`
                )
                return false // wait for item sync
              }
            } else {
              console.log(
                `[OfflineSync:payment] No localOrderId to resolve item ${rawId}, will retry`
              )
              return false
            }
          }

          // Replace with resolved backend item IDs
          paymentParams.p_item_allocations = resolvedAllocations
        }

        // Build terminal response for card payments if we have card data
        let finalTerminalResponse = terminalResponse
        if (!finalTerminalResponse && cardData) {
          finalTerminalResponse = {
            card_last_four: cardData.lastFour,
            card_type: cardData.brand,
            transaction_id: cardData.transactionRef
          }
        }

        // Merge terminal response into params if exists
        const finalParams = {
          ...paymentParams,
          ...(finalTerminalResponse && {
            p_terminal_response: finalTerminalResponse
          })
        }

        // ============================================================
        // PRE-PAYMENT VALIDATION (Edge Case 4 — Payment Integrity)
        // Check if the order was voided/cancelled while we were offline
        // ============================================================
        if (finalParams.p_order_id && isValidUUID(finalParams.p_order_id)) {
          try {
            const { data: currentOrder } = await _supabaseClient
              .from('orders')
              .select('order_status')
              .eq('id', finalParams.p_order_id)
              .single()

            if (
              currentOrder?.order_status === 'void' ||
              currentOrder?.order_status === 'cancelled'
            ) {
              console.warn(
                `[OfflineSync:payment] Order ${finalParams.p_order_id} is ${currentOrder.order_status} — discarding payment`
              )
              return true // Discard
            }
          } catch (checkErr) {
            // Non-fatal — proceed with payment (RPC will validate)
            console.warn(
              '[OfflineSync:payment] Pre-payment status check failed:',
              checkErr
            )
          }
        }

        // ============================================================
        // DEFENSIVE AUTH-CHECK (Bad-WiFi Phase 2 — Wave 1)
        // ============================================================
        // Before replaying a queued payment, ask the server whether a payment
        // matching this op already landed. If yes, the previous attempt
        // succeeded but the response was lost — DISCARD the queued op rather
        // than re-charging the customer.
        //
        // Reuses the W2 idempotency-layer story (per-RPC keys close the same
        // gap from the other side). This Wave 1 check is purely defensive:
        // any error or false negative falls back to the existing behavior.
        //
        // Lookback window = max(time since op was queued + 5 min slack, 10 min).
        // ============================================================
        if (finalParams.p_order_id && isValidUUID(finalParams.p_order_id)) {
          try {
            const opAgeMs = Date.now() - new Date(op.timestamp).getTime()
            const lookbackSeconds = Math.max(
              600,
              Math.ceil(opAgeMs / 1000) + 300
            )
            const amountCents =
              typeof finalParams.p_amount === 'number' && finalParams.p_amount > 0
                ? Math.round(finalParams.p_amount * 100)
                : null

            const { data: authCheck, error: authCheckError } =
              await _supabaseClient.rpc('check_recent_payment', {
                p_order_id: finalParams.p_order_id,
                p_lookback_seconds: lookbackSeconds,
                p_amount_cents: amountCents,
                p_split_portion_index: finalParams.p_split_portion_index ?? null
              })

            if (authCheckError) {
              // Don't block on the safety check failing — it's defensive only
              console.warn(
                '[OfflineSync:payment] check_recent_payment failed; proceeding (defensive only):',
                authCheckError
              )
            } else if ((authCheck as any)?.matched) {
              console.warn(
                `[OfflineSync:payment] DUPLICATE-CHARGE PREVENTED — payment for order ${finalParams.p_order_id} (amount=${finalParams.p_amount ?? 'full-remaining'}, portion=${finalParams.p_split_portion_index ?? '-'}) already exists on server. Discarding queued op.`,
                authCheck
              )
              return true // discard queued op without replaying
            }
          } catch (checkErr) {
            console.warn(
              '[OfflineSync:payment] check_recent_payment threw; proceeding (defensive only):',
              checkErr
            )
          }
        }

        console.log(
          '[OfflineSync:payment] Calling process_payment_v8 with:',
          JSON.stringify({
            orderId: finalParams.p_order_id,
            method: finalParams.p_payment_method,
            amount: finalParams.p_amount,
            tip: finalParams.p_tip_amount || 0,
            hasTerminalResponse: !!finalParams.p_terminal_response
          })
        )

        const { data, error } = await OrderService.processPayment(
          _supabaseClient,
          finalParams
        )

        if (error) {
          // If the order is already paid, the desired state is already achieved — discard
          const errMsg = (error as any)?.message || String(error)
          const isNoUnpaidItemsError =
            (error as any)?.code === 'P0001' &&
            errMsg.toLowerCase().includes('no unpaid items remaining')
          if (
            errMsg.toLowerCase().includes('already paid') ||
            errMsg.toLowerCase().includes('already been paid') ||
            errMsg.toLowerCase().includes('fully paid')
          ) {
            console.warn(
              `[OfflineSync:payment] Order already paid — discarding operation as complete:`,
              errMsg
            )
            return true
          }

          if (isNoUnpaidItemsError) {
            // P0001 "No unpaid items remaining" means the payment state is already achieved —
            // either our queued operation was a duplicate of a successful direct call, or another
            // station paid first. Either way, the desired outcome (items paid) is already met.
            // Always discard as idempotent success to prevent infinite retries.
            console.warn(
              `[OfflineSync:payment] No unpaid items remaining — payment already processed (idempotent). Discarding operation as complete.`
            )
            return true
          }

          console.error(`[OfflineSync:payment] FAILED - Error:`, error)
          return false
        }

        console.log(`[OfflineSync:payment] SUCCESS!`)
        console.log(
          `[OfflineSync:payment] Response:`,
          JSON.stringify(data, null, 2)
        )

        // Sync order state from backend response if available
        if (localOrderId && data) {
          const store = _getOrderStore().getState()
          const order = store.ordersById[localOrderId]
          const responseData = data as any

          // Update local order with backend payment response data
          if (
            responseData.order_amount_due !== undefined ||
            responseData.order_amount_paid !== undefined
          ) {
            store.updateOrderFromSync(localOrderId, {
              total_amount:
                responseData.order_card_total || responseData.order_total,
              total_tax: responseData.order_card_tax || responseData.order_tax
            })
          }

          // ================================================================
          // Update order status to "preparing" if it was in draft/pending
          // This ensures payments from offline queue trigger proper workflow
          // ================================================================
          if (
            order &&
            (order.order_status === 'draft' || order.order_status === 'pending')
          ) {
            console.log(
              `[OfflineSync:payment] Updating order status: ${order.order_status} -> preparing`
            )

            // Update order status and item statuses
            const updatedItems = order.items.map((item: any) => ({
              ...item,
              kitchen_status: getKitchenSentStatus(),
              item_status: 'Preparing' as const
            }))

            _getOrderStore().setState((state: any) => {
              const currentOrder = state.ordersById[localOrderId]
              if (!currentOrder) return state

              return {
                ordersById: {
                  ...state.ordersById,
                  [localOrderId]: {
                    ...currentOrder,
                    order_status: 'preparing',
                    items: updatedItems,
                    // Set opened_at if not already set
                    opened_at:
                      currentOrder.opened_at || new Date().toISOString()
                  }
                }
              }
            })

            console.log(
              `[OfflineSync:payment] Order status updated to "preparing", ${updatedItems.length} items marked as sent`
            )
          }

          // Mark the specific payment as synced with backend payment_id, items covered,
          // and update order amounts — all in a single setState to avoid losing fields
          // (the previous 2-block approach would lose cash_amount_due from block 2 when block 3 re-spread).
          if (
            order &&
            (responseData.payment_id ||
              responseData.order_amount_paid !== undefined ||
              responseData.order_amount_due !== undefined)
          ) {
            _getOrderStore().setState((state: any) => {
              const currentOrder = state.ordersById[localOrderId]
              if (!currentOrder) return state

              const payments = [...(currentOrder.payments || [])]

              if (payments.length > 0) {
                // Find payment by localPaymentId or timestamp instead of using array index
                const paymentIndex = payments.findIndex(
                  (p: any) =>
                    (localPaymentId && p.localId === localPaymentId) ||
                    (paymentTimestamp && p.timestamp === paymentTimestamp)
                )

                // Fallback to last payment only if no match found (legacy operations)
                const targetIdx =
                  paymentIndex !== -1 ? paymentIndex : payments.length - 1

                console.log(
                  `[OfflineSync:payment] Updating payment at index ${targetIdx} (found by ${
                    paymentIndex !== -1 ? 'ID match' : 'fallback'
                  })`
                )

                payments[targetIdx] = {
                  ...payments[targetIdx],
                  // Assign backend payment_id if available
                  ...(responseData.payment_id && {
                    id: responseData.payment_id
                  }),
                  // Prefer local itemsCovered (built from paidQuantity deltas at payment time),
                  // then items_paid (per-payment quantities from backend JSON),
                  // then items_covered (flat UUID array) as last resort
                  itemsCovered:
                    payments[targetIdx].itemsCovered &&
                    payments[targetIdx].itemsCovered.length > 0
                      ? payments[targetIdx].itemsCovered
                      : responseData.items_paid &&
                        Array.isArray(responseData.items_paid) &&
                        responseData.items_paid.length > 0
                      ? responseData.items_paid.map((ip: any) => ({
                          itemId: ip.order_item_id ?? '',
                          itemName: ip.item_name || 'Unknown Item',
                          quantity: ip.quantity_paid ?? 0,
                          unitPrice: ip.unit_price ?? 0,
                          subtotal: ip.subtotal ?? 0
                        }))
                      : responseData.items_covered || [],
                  timestamp:
                    payments[targetIdx].timestamp || new Date().toISOString(),
                  sync_status: 'synced' as const,
                  sync_error: undefined
                }
              }

              // Calculate paid_status from LOCAL payments, not backend
              // This prevents flicker caused by stale/racing backend values
              const localPaidStatus = _getCalculatePaidStatus()(
                payments,
                currentOrder.total_amount || 0
              )

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
                    check_status: currentOrder.check_status ?? 'Opened'
                  }
                }
              }
            })
          }

          // Clean up persistableOrderIds if no more unsynced data remains
          const postSyncOrder =
            _getOrderStore().getState().ordersById[localOrderId]
          if (postSyncOrder) {
            const hasUnsyncedItems = postSyncOrder.items?.some(
              (item: any) => !item.db_order_item_id && !item.isDraft
            )
            const hasUnsyncedPayments = postSyncOrder.payments?.some(
              (p: any) =>
                p.sync_status === 'pending' || (!p.db_payment_id && !p.isVoided)
            )
            if (!hasUnsyncedItems && !hasUnsyncedPayments) {
              _getOrderStore().setState((state: any) => {
                delete state.persistableOrderIds[localOrderId]
              })
            }
          }

          // Trigger payment status sync from backend for fresh data
          // This ensures UI shows confirmed status after offline payment syncs
          console.log(
            `[OfflineSync:payment] Triggering payment status sync for order ${localOrderId}`
          )
          setTimeout(() => {
            _getOrderStore().getState().syncPaymentStatus(localOrderId)
          }, 300)

          // ============================================================
          // POST-PAYMENT OVERPAYMENT CHECK (Edge Case 4)
          // Verify totals to detect if another station also paid
          // ============================================================
          if (finalParams.p_order_id && isValidUUID(finalParams.p_order_id)) {
            try {
              const { data: updatedOrder } = await _supabaseClient
                .from('orders')
                .select('amount_paid, total_amount')
                .eq('id', finalParams.p_order_id)
                .single()

              if (
                updatedOrder &&
                updatedOrder.amount_paid > updatedOrder.total_amount
              ) {
                console.warn(
                  `[OfflineSync:payment] OVERPAYMENT detected: paid=${updatedOrder.amount_paid}, total=${updatedOrder.total_amount}`
                )
                const {
                  useConflictStore
                } = require('@/stores/useConflictStore')
                useConflictStore.getState().addPaymentConflict({
                  id: `overpayment_${Date.now()}`,
                  orderId: finalParams.p_order_id,
                  orderNumber:
                    postSyncOrder?.order_number ||
                    postSyncOrder?.display_number,
                  localVersion: 0,
                  serverVersion: 0,
                  conflictType: 'payment',
                  severity: 'critical',
                  localChanges: [],
                  serverChanges: [
                    {
                      field: 'amount_paid',
                      previousValue: updatedOrder.total_amount,
                      newValue: updatedOrder.amount_paid
                    }
                  ],
                  itemConflicts: [],
                  detectedAt: new Date().toISOString(),
                  autoResolved: false
                })
                const { useToastStore } = require('@/stores/useToastStore')
                useToastStore.getState().show({
                  title: 'Overpayment Detected',
                  message: 'Check order payments — possible duplicate payment',
                  type: 'error',
                  duration: 10000
                })
              }
            } catch (checkErr) {
              console.warn(
                '[OfflineSync:payment] Overpayment check failed:',
                checkErr
              )
            }
          }
        }

        return true
      }

      // === OFFLINE-FIRST OPERATION HANDLERS ===

      case 'create_order': {
        const { localOrderId } = op.params
        const store = _getOrderStore().getState()
        const selectedStore = useStoreSettingsStore.getState().selectedStore

        console.log(`[OfflineSync:create_order] ====== CREATING ORDER ======`)
        console.log(`[OfflineSync:create_order] Local ID: ${localOrderId}`)
        console.log(
          `[OfflineSync:create_order] Params:`,
          JSON.stringify(createOrderParams, null, 2)
        )

        if (!selectedStore) {
          console.error('[OfflineSync:create_order] FAILED - No store selected')
          return false
        }

        // Some older/fallback queued create_order ops can miss createOrderParams.
        // Rebuild them from current local order + store context so replay can continue.
        let createOrderParams = op.params.createOrderParams
        if (!createOrderParams) {
          const localOrder = store.ordersById[localOrderId]
          createOrderParams = {
            p_merchant_id: selectedStore.merchant_id,
            p_location_id: selectedStore.id,
            p_order_type: (localOrder?.order_type || 'dine_in') as any,
            p_table_number: localOrder?.service_location_id || null,
            p_customer_name: localOrder?.customer_name || null,
            p_customer_phone: localOrder?.customer_phone || null,
            p_special_instructions: null,
            p_device_id: getDeviceId(),
            p_created_by_staff_id:
              useEmployeeStore.getState().loggedInEmployee?.profileId || null,
            p_station_id:
              useStoreSettingsStore.getState().selectedStation?.id || null
          }
          console.warn(
            `[OfflineSync:create_order] Missing createOrderParams for ${localOrderId}; rebuilt fallback params`
          )
        }

        // Dedup guard: check if order was already created by a concurrent path
        const existingDbId = resolveOrderId(localOrderId)
        if (existingDbId) {
          console.log(
            `[OfflineSync:create_order] Order already exists: ${localOrderId} → ${existingDbId}, skipping RPC`
          )
          // Ensure local store is consistent
          if (!store.ordersById[existingDbId]?.db_order_id) {
            store.updateOrderDbId(localOrderId, existingDbId)
          }
          await mapLocalToBackend(localOrderId, existingDbId)
          return true
        }

        const { data, error } = await OrderService.createOrder(
          _supabaseClient,
          createOrderParams
        )

        if (error) {
          console.error('[OfflineSync:create_order] FAILED - DB Error:', error)
          return false
        }

        if (data) {
          const orderData = Array.isArray(data) ? data[0] : data
          if (!orderData) {
            console.error(
              '[OfflineSync:create_order] FAILED - Response data is empty/undefined'
            )
            return false
          }
          const backendId = orderData.order_id || orderData.id

          if (backendId) {
            // Update local order with backend ID
            store.updateOrderDbId(localOrderId, backendId)

            // Register in ID registry for future lookups
            await mapLocalToBackend(localOrderId, backendId)

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
              cash_subtotal: orderData.cash_subtotal
            })

            // Re-seed local counter to match DB-assigned sequence
            const dbSeq = parseSequenceFromDisplayNumber(
              orderData.display_number || `#${orderData.order_number}`
            )
            if (dbSeq > 0) {
              const stationNum =
                useStoreSettingsStore.getState().selectedStation
                  ?.station_number ?? null
              const selectedStore =
                useStoreSettingsStore.getState().selectedStore
              if (selectedStore?.id) {
                forceSetLocalSequence(selectedStore.id, stationNum, dbSeq)
              }
            }

            console.log(`[OfflineSync:create_order] SUCCESS!`)
            console.log(
              `[OfflineSync:create_order] ${localOrderId} → ${backendId}`
            )
            console.log(
              `[OfflineSync:create_order] Order number: ${
                orderData.order_number || orderData.display_number
              }`
            )

            // Invalidate orders query so hydrateWorkspace picks up the server version
            const locationId = createOrderParams.p_location_id
            if (locationId) {
              queryClient.invalidateQueries({
                queryKey: ['orders', 'active', locationId]
              })
            }
          } else {
            console.error(
              '[OfflineSync:create_order] FAILED - No backend ID in response:',
              orderData
            )
            return false
          }
        }

        return true
      }

      case 'add_item': {
        const {
          localOrderId,
          localItemId,
          dbOrderId,
          addItemParams,
          itemData
        } = op.params
        const store = _getOrderStore().getState()

        console.log(`[OfflineSync:add_item] ====== ADDING ITEM ======`)
        console.log(`[OfflineSync:add_item] Local Order ID: ${localOrderId}`)
        console.log(`[OfflineSync:add_item] Local Item ID: ${localItemId}`)
        console.log(
          `[OfflineSync:add_item] Item: ${
            itemData?.name || addItemParams?.p_item_name || 'unknown'
          }`
        )

        // Resolve backend order ID first — may have been rekeyed after create_order synced
        let actualDbOrderId = dbOrderId
        if (!actualDbOrderId) {
          actualDbOrderId = resolveOrderId(localOrderId)
        }

        if (!actualDbOrderId) {
          console.log(
            `[OfflineSync:add_item] BLOCKED - Waiting for order sync (${localOrderId})`
          )
          if (localItemId) {
            useSyncStatusStore.getState().setSyncStatus(localItemId, 'pending')
          }
          return false // Will be retried after order sync
        }

        // Determine the correct store key — after rekey it's the backend UUID
        const storeKey = store.ordersById[localOrderId]
          ? localOrderId
          : actualDbOrderId

        console.log(
          `[OfflineSync:add_item] Using db_order_id: ${actualDbOrderId}, store key: ${storeKey}`
        )

        const isOpenItem = itemData?.is_open_item || addItemParams?.is_open_item

        // Build params for open item vs regular item
        let params: AddOrderItemParams | AddOpenItemParams
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
              undefined
          } as AddOpenItemParams
        } else {
          // Build the item params if we only have itemData (queued from initial failure)
          if (addItemParams) {
            params = addItemParams
            // Update the order ID in case it changed
            ;(params as AddOrderItemParams).p_order_id = actualDbOrderId
          } else if (itemData) {
            // Build modifiers array, but set to undefined if empty
            const modifiersArray = itemData.customizations?.modifiers?.flatMap(
              (mod: any) =>
                mod.options.map((opt: any) => ({
                  modifier_group_id: mod.categoryId,
                  modifier_item_id: opt.id,
                  modifier_group_name: mod.categoryName,
                  modifier_name: opt.name,
                  price_modifier: opt.isNo ? 0 : opt.price,
                  quantity: 1,
                  is_no: opt.isNo || false
                }))
            )

            params = {
              p_order_id: actualDbOrderId,
              p_menu_item_id: itemData.menuItemId || undefined,
              p_location_exclusive_item_id:
                itemData.locationExclusiveItemId || undefined,
              p_quantity: itemData.quantity,
              p_item_name: itemData.name,
              p_category_name: itemData.category_name || 'Uncategorized',
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
              p_seat_number: itemData.seatNumber ?? undefined,
              p_menu_id: itemData.addedFromMenuId || undefined,
              p_menu_name: itemData.addedFromMenuId
                ? require('@/stores/useMenuStore')
                    .useMenuStore.getState()
                    .getMenuById(itemData.addedFromMenuId)?.name
                : undefined,
              p_category_id: itemData.addedFromCategoryId || undefined
            } as AddOrderItemParams
          } else {
            console.error('[OfflineSync] No item params available for add_item')
            return false
          }
        }

        // Wave 2.7: stable per-tap key for replay safety. Use the local
        // CartItem id (transformed to a deterministic UUID) so that the
        // first attempt and every queue replay submit the same key — the
        // server-side _idempotency_claim then dedupes, preventing the
        // duplicate-insert bug observed on bad WiFi.
        // Fall back to op.idempotencyKey (uuidv4 stamped at queue time)
        // if for some reason localItemId is missing.
        const idempotencyKeyOverride = localItemId
          ? toIdempotencyKey(localItemId)
          : op.idempotencyKey

        let data: any
        let error: any
        if (isOpenItem) {
          ;({ data, error } = await OrderService.addOpenItem(
            _supabaseClient,
            params as AddOpenItemParams,
            { keyOverride: idempotencyKeyOverride }
          ))
        } else {
          ;({ data, error } = await OrderService.addOrderItem(
            _supabaseClient,
            params as AddOrderItemParams,
            { keyOverride: idempotencyKeyOverride }
          ))
        }

        if (error) {
          console.error(`[OfflineSync:add_item] FAILED - DB Error:`, error)
          console.error(
            `[OfflineSync:add_item] Order: ${localOrderId}, Item: ${localItemId}`
          )
          if (localItemId) {
            useSyncStatusStore
              .getState()
              .setSyncStatus(
                localItemId,
                'failed',
                error?.message || 'Add item sync failed'
              )
          }
          return false
        }

        if (data?.order_item_id && localItemId) {
          // Update local item with backend ID
          store.updateItemDbId(storeKey, localItemId, data.order_item_id)

          // Phase 7D: Mark replayed offline item as synced in dedicated sync store.
          useSyncStatusStore.getState().setSyncStatus(localItemId, 'synced')

          // Register in ID registry
          await mapLocalToBackend(localItemId, data.order_item_id)

          console.log(`[OfflineSync:add_item] SUCCESS!`)
          console.log(
            `[OfflineSync:add_item] ${localItemId} → ${data.order_item_id}`
          )

          // Sync order totals from response if available
          const responseData = data as any
          if (
            responseData.order_card_total ||
            responseData.order_cash_total ||
            responseData.order_total
          ) {
            store.updateOrderFromSync(storeKey, {
              total_amount:
                responseData.order_card_total || responseData.order_total,
              total_tax: responseData.order_card_tax || responseData.order_tax,
              subtotal:
                responseData.order_card_subtotal || responseData.order_subtotal,
              cash_total: responseData.order_cash_total,
              cash_tax_amount: responseData.order_cash_tax,
              cash_subtotal: responseData.order_cash_subtotal
            })
            console.log(
              `[OfflineSync:add_item] Synced order totals: card=${responseData.order_card_total}, cash=${responseData.order_cash_total}`
            )
          }

          // Retroactively send to kitchen if item was fired during offline sync
          const latestStore = _getOrderStore().getState()
          const latestOrder = latestStore.ordersById[storeKey]
          const latestItem = latestOrder?.items.find(
            (i: any) => i.id === localItemId
          )
          if (
            latestItem?.kitchen_status === getKitchenSentStatus() &&
            data.order_item_id
          ) {
            console.log(
              `[OfflineSync:add_item] Item was fired during sync, retroactively sending to kitchen`
            )
            try {
              // Keep backend order out of draft before item kitchen status updates.
              const { error: statusError } =
                await OrderService.updateOrderStatus(
                  _supabaseClient,
                  actualDbOrderId,
                  getOrderSentStatus() as any
                )

              if (
                statusError &&
                statusError.code !== 'P0001' &&
                !statusError.message?.includes('already in')
              ) {
                throw statusError
              }

              const { error: kitchenError } =
                await OrderService.bulkUpdateOrderItemStatus(
                  _supabaseClient,
                  [data.order_item_id],
                  getKitchenSentStatus()
                )

              if (kitchenError) {
                throw kitchenError
              }
            } catch (retroErr) {
              console.warn(
                `[OfflineSync:add_item] Retroactive kitchen send failed, queuing send_to_kitchen:`,
                retroErr
              )
              // Queue send_to_kitchen as fallback — don't fail the add_item op (prevents duplicates)
              await queueFailedOperation(
                'send_to_kitchen',
                { localOrderId, localItemIds: [localItemId] },
                localOrderId
              )
            }
          }
        } else {
          console.warn(
            `[OfflineSync:add_item] No order_item_id in response — will retry`
          )
          console.warn(`[OfflineSync:add_item] Response:`, data)
          if (localItemId) {
            useSyncStatusStore
              .getState()
              .setSyncStatus(
                localItemId,
                'pending',
                'Waiting for backend item ID'
              )
          }
          return false // Retry — don't silently drop the item
        }

        return true
      }

      case 'seat_guests': {
        const {
          tableIds,
          guestCount,
          guestName,
          guestPhone,
          reservationId,
          waitlistId,
          createOrder,
          localSessionId
        } = op.params

        if (!_supabaseClient) {
          console.warn(
            '[OfflineSync:seat_guests] Supabase client not ready, will retry'
          )
          return false // Transient — client not initialized yet
        }
        if (!tableIds?.length) {
          console.error(
            '[OfflineSync:seat_guests] Missing tableIds — invalid operation, discarding'
          )
          return true // Invalid op — discard
        }

        const primaryTableId = tableIds[0]
        const additionalTableIds = tableIds.slice(1)

        // Resolve staff/merchant context — prefer values stored in queued op,
        // fall back to current store state for old queued ops missing new fields
        const merchantId =
          op.params.merchantId ||
          useStoreSettingsStore.getState().selectedStore?.merchant_id ||
          ''
        const staffId =
          op.params.staffId ??
          useEmployeeStore.getState().loggedInEmployee?.profileId ??
          null
        const serverStaffId = op.params.serverStaffId ?? staffId
        const deviceId = op.params.deviceId ?? null
        const stationId =
          op.params.stationId ??
          useStoreSettingsStore.getState().selectedStation?.id ??
          null

        // ============================================================
        // DUPLICATE SEATING CHECK (Edge Case 1)
        // Before calling seatGuests RPC, check if this table already
        // has an active session (another station seated while we were offline).
        // ============================================================
        let existingRemoteSession: any = null
        try {
          const { data: tableStatus } =
            await FloorPlanService.getLocationTableStatus(
              _supabaseClient,
              useStoreSettingsStore.getState().selectedStore?.id || ''
            )
          existingRemoteSession = tableStatus?.find(
            (row: any) => row.table_id === primaryTableId && row.session_id
          )

          if (existingRemoteSession?.session_id) {
            const {
              useTableSessionStore
            } = require('@/stores/useTableSessionStore')
            const sessionStoreState = useTableSessionStore.getState()
            const localSession = sessionStoreState.sessions[primaryTableId]
            const localOrder = localSession?.order_id
              ? _getOrderStore().getState().getOrder(localSession.order_id)
              : null
            const hasItems = (localOrder?.items?.length ?? 0) > 0

            if (!hasItems) {
              // No work done — accept the remote session, discard this op
              console.log(
                `[OfflineSync:seat_guests] Table already seated by another station (no items) — accepting remote`
              )
              sessionStoreState.batchDispatch([
                {
                  tableId: primaryTableId,
                  action: {
                    type: 'SYNC',
                    session: {
                      id: existingRemoteSession.session_id,
                      session_number: existingRemoteSession.session_number,
                      status: existingRemoteSession.session_status,
                      party_size: existingRemoteSession.party_size ?? 0,
                      guest_name: existingRemoteSession.guest_name,
                      order_id: existingRemoteSession.order_id,
                      server_staff_id:
                        existingRemoteSession.server_staff_id ?? undefined,
                      seated_at:
                        existingRemoteSession.seated_at ??
                        new Date().toISOString(),
                      current_course: existingRemoteSession.current_course ?? 1,
                      needs_attention:
                        existingRemoteSession.needs_attention ?? false,
                      is_vip: existingRemoteSession.is_vip ?? false
                    }
                  }
                }
              ])
              const { useToastStore } = require('@/stores/useToastStore')
              useToastStore.getState().show({
                title: 'Table Synced',
                message: 'Table already seated by another station',
                type: 'success'
              })
              return true // Discard op
            }

            // Has items — let seatGuests proceed to create a separate order
            console.log(
              `[OfflineSync:seat_guests] Table already seated but local has items — creating separate order`
            )
            const { useToastStore } = require('@/stores/useToastStore')
            useToastStore.getState().show({
              title: 'Order Saved',
              message: `Offline order for ${
                existingRemoteSession.table_name || 'table'
              } saved as separate order`,
              type: 'warning'
            })
            // Fall through to normal RPC
          }
        } catch (checkErr) {
          console.warn(
            '[OfflineSync:seat_guests] Duplicate check failed, proceeding:',
            checkErr
          )
          // Non-fatal — proceed with normal seat_guests
        }

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
            p_station_id: stationId
          }
        )

        if (error) {
          console.error('[OfflineSync:seat_guests] Error:', error)
          return false
        }

        if (data) {
          // Merge additional tables
          for (const extraTableId of additionalTableIds) {
            try {
              await FloorPlanService.mergeTableToSession(_supabaseClient, {
                p_session_id: data.session_id!,
                p_table_id: extraTableId
              })
            } catch (mergeErr) {
              console.warn(
                `[OfflineSync:seat_guests] Merge failed for ${extraTableId}, queueing retry`,
                mergeErr
              )
              queueOperation({
                type: 'merge_table',
                params: { sessionId: data.session_id!, tableId: extraTableId },
                localOrderId: op.localOrderId
              }).catch(e =>
                console.error(
                  '[OfflineSync:seat_guests] Failed to queue merge:',
                  e
                )
              )
            }
          }

          // Hydrate order from RPC response
          if (data.order_id) {
            const orderStore = _getOrderStore().getState()
            orderStore.hydrateOrderFromSeat({
              localOrderId: op.localOrderId,
              dbOrderId: data.order_id,
              sessionId: data.session_id!,
              orderNumber: data.order_number,
              displayNumber: data.display_number
            })
          }

          // Dispatch SESSION_CREATED for all tables with this local session
          const { useTableSessionStore } = await import(
            '@/stores/useTableSessionStore'
          )
          const sessionStore = useTableSessionStore.getState()
          const actions: Array<{
            tableId: string
            action: { type: 'SESSION_CREATED'; session: any }
          }> = []
          for (const tableId of tableIds) {
            const existing = sessionStore.sessions[tableId]
            if (existing?.id === localSessionId) {
              actions.push({
                tableId,
                action: {
                  type: 'SESSION_CREATED',
                  session: {
                    ...existing,
                    id: data.session_id!,
                    order_id: data.order_id,
                    session_number:
                      data.session_number ?? existing.session_number
                  }
                }
              })
            }
          }
          if (actions.length > 0) {
            sessionStore.batchDispatch(actions)
          }

          // If there was an existing remote session, restore it as the active
          // table session (the offline order is now a separate backend order)
          if (existingRemoteSession?.session_id) {
            const restoreActions: Array<{ tableId: string; action: any }> = []
            for (const tableId of tableIds) {
              restoreActions.push({
                tableId,
                action: {
                  type: 'SYNC',
                  session: {
                    id: existingRemoteSession.session_id,
                    session_number: existingRemoteSession.session_number,
                    status: existingRemoteSession.session_status,
                    party_size: existingRemoteSession.party_size ?? 0,
                    guest_name: existingRemoteSession.guest_name,
                    order_id: existingRemoteSession.order_id,
                    server_staff_id:
                      existingRemoteSession.server_staff_id ?? undefined,
                    seated_at:
                      existingRemoteSession.seated_at ??
                      new Date().toISOString(),
                    current_course: existingRemoteSession.current_course ?? 1,
                    needs_attention:
                      existingRemoteSession.needs_attention ?? false,
                    is_vip: existingRemoteSession.is_vip ?? false
                  }
                }
              })
            }
            sessionStore.batchDispatch(restoreActions)
            console.log(
              '[OfflineSync:seat_guests] Restored existing remote session after creating separate order'
            )
          }

          console.log('[OfflineSync:seat_guests] Completed successfully:', data)
        }

        return true
      }

      case 'merge_table': {
        const { sessionId, tableId } = op.params
        if (!sessionId || !tableId) {
          console.error(
            '[OfflineSync:merge_table] Missing sessionId or tableId — invalid operation, discarding'
          )
          return true
        }

        const resolvedMergeSessionId = resolveSessionId(sessionId) ?? sessionId
        if (!isValidUUID(resolvedMergeSessionId)) {
          console.log(
            `[OfflineSync:merge_table] Session ${sessionId} not synced yet`
          )
          return false
        }

        const { error: mergeError } =
          await FloorPlanService.mergeTableToSession(_supabaseClient, {
            p_session_id: resolvedMergeSessionId,
            p_table_id: tableId
          })

        if (mergeError) {
          if (mergeError.code === '23505') {
            console.log(
              '[OfflineSync:merge_table] Already merged (23505), treating as success'
            )
            return true
          }
          console.error('[OfflineSync:merge_table] Error:', mergeError)
          return false
        }

        console.log(
          `[OfflineSync:merge_table] Merged table ${tableId} into session ${resolvedMergeSessionId}`
        )
        return true
      }

      case 'unmerge_table': {
        const { sessionId, tableId } = op.params
        if (!sessionId || !tableId) {
          console.error(
            '[OfflineSync:unmerge_table] Missing params, discarding'
          )
          return true
        }

        const resolvedUnmergeSessionId =
          resolveSessionId(sessionId) ?? sessionId
        if (!isValidUUID(resolvedUnmergeSessionId)) {
          console.log(
            `[OfflineSync:unmerge_table] Session ${sessionId} not synced yet`
          )
          return false
        }

        const { error: unmergeError } =
          await FloorPlanService.unmergeTableFromSession(_supabaseClient, {
            p_session_id: resolvedUnmergeSessionId,
            p_table_id: tableId
          })

        if (unmergeError) {
          console.error('[OfflineSync:unmerge_table] Error:', unmergeError)
          return false
        }

        console.log(
          `[OfflineSync:unmerge_table] Unmerged table ${tableId} from session ${resolvedUnmergeSessionId}`
        )
        return true
      }

      case 'update_session_status': {
        const { sessionId, status, staffId } = op.params

        if (!sessionId || !status) {
          console.error(
            '[OfflineSync:update_session_status] Missing sessionId or status — invalid operation, discarding'
          )
          return true
        }

        const resolvedSessionId = resolveSessionId(sessionId) ?? sessionId

        if (!isValidUUID(resolvedSessionId)) {
          console.log(
            `[OfflineSync] update_session_status: session ${sessionId} not synced yet`
          )
          return false
        }

        const { error } = await FloorPlanService.updateTableSessionStatus(
          _supabaseClient,
          {
            p_session_id: resolvedSessionId,
            p_status: status,
            p_staff_id: staffId ?? undefined
          }
        )

        if (error) {
          console.error('[OfflineSync] update_session_status failed:', error)
          return false
        }

        console.log(
          `[OfflineSync] update_session_status: ${resolvedSessionId} → ${status}`
        )
        return true
      }

      // ================================================================
      // LINK ORDER TO SESSION - Bidirectional linking
      // ================================================================
      case 'link_order_to_session': {
        const { orderId, sessionId } = op.params

        console.log(
          '[OfflineSync:link_order_to_session] Linking order to session',
          {
            orderId,
            sessionId
          }
        )

        // Resolve IDs if they are local IDs
        const resolvedOrderId = resolveOrderId(orderId)
        if (!resolvedOrderId) {
          console.log(
            `[OfflineSync:link_order_to_session] BLOCKED - Order ${orderId} not synced yet`
          )
          return false
        }

        // Session ID should already be a backend UUID if from seatGuests
        // But check if it needs resolution
        const resolvedSessionId = sessionId // Assuming sessionId is already backend UUID

        try {
          // Call the RPC function to link bidirectionally
          const { data, error } = await _supabaseClient.rpc(
            'link_order_to_session',
            {
              p_order_id: resolvedOrderId,
              p_session_id: resolvedSessionId
            }
          )

          if (error) {
            if (error.code === '23505') {
              console.log(
                '[OfflineSync:link_order_to_session] Already linked (23505), treating as success'
              )
              return true
            }
            console.error(
              '[OfflineSync:link_order_to_session] RPC error:',
              error
            )
            return false
          }

          console.log(
            '[OfflineSync:link_order_to_session] Successfully linked:',
            data
          )
          return true
        } catch (err) {
          console.error('[OfflineSync:link_order_to_session] Exception:', err)
          return false
        }
      }

      // ================================================================
      // SEND TO KITCHEN - Updates order status + item statuses
      // ================================================================
      case 'send_to_kitchen': {
        const { localOrderId, localItemIds } = op.params

        console.log(
          `[OfflineSync:send_to_kitchen] ====== SENDING TO KITCHEN ======`
        )
        console.log(
          `[OfflineSync:send_to_kitchen] Local Order ID: ${localOrderId}`
        )
        console.log(
          `[OfflineSync:send_to_kitchen] Items to send: ${
            localItemIds?.length || 0
          }`
        )

        // Resolve order ID
        const resolvedOrderId = resolveOrderId(localOrderId)
        if (!resolvedOrderId) {
          console.log(
            `[OfflineSync:send_to_kitchen] BLOCKED - Order ${localOrderId} not synced yet`
          )
          return false
        }

        console.log(
          `[OfflineSync:send_to_kitchen] Resolved order: ${resolvedOrderId}`
        )

        try {
          const storeOrders = _getOrderStore().getState().ordersById
          const liveOrder = Object.values(storeOrders).find(
            (o: any) => o.db_order_id === resolvedOrderId
          ) as any

          // 1. Resolve item IDs FIRST (before any RPC calls)
          let resolvedItemIds: string[] = []
          let unresolvedLocalItemIds: string[] = []

          if (localItemIds && localItemIds.length > 0) {
            for (const localItemId of localItemIds) {
              const resolved = resolveItemId(localOrderId, localItemId)
              if (resolved) {
                resolvedItemIds.push(resolved)
              } else {
                unresolvedLocalItemIds.push(localItemId)
              }
            }

            console.log(
              `[OfflineSync:send_to_kitchen] Resolved ${resolvedItemIds.length}/${localItemIds.length} items` +
                (unresolvedLocalItemIds.length > 0
                  ? ` (${unresolvedLocalItemIds.length} unresolved)`
                  : '')
            )

            // If zero items resolved via ID map, try falling back to live store:
            // the items may have already synced and their local→db mapping was
            // never written to the resolveItemId map (race condition). Look up
            // db_order_item_id directly from ordersById for any matching local IDs.
            if (resolvedItemIds.length === 0) {
              if (liveOrder) {
                for (const localItemId of unresolvedLocalItemIds) {
                  const liveItem = liveOrder.items.find(
                    (i: any) => i.id === localItemId && i.db_order_item_id
                  )
                  if (liveItem?.db_order_item_id) {
                    resolvedItemIds.push(liveItem.db_order_item_id)
                  }
                }
              }
              // If still zero after live store fallback, items aren't synced yet — retry
              if (resolvedItemIds.length === 0) {
                console.log(
                  `[OfflineSync:send_to_kitchen] No items resolved yet, will retry`
                )
                return false
              }
              // Resolved via live store — clear unresolved list so we don't re-queue them
              unresolvedLocalItemIds = []
            }
          } else if (liveOrder?.items?.length) {
            // Fallback: legacy/older queued ops may not carry item IDs.
            // In that case, send all currently-fired items on the order.
            resolvedItemIds = liveOrder.items
              .filter(
                (i: any) =>
                  i.kitchen_status === getKitchenSentStatus() &&
                  !!i.db_order_item_id
              )
              .map((i: any) => i.db_order_item_id)

            const hasUnsyncedFiredItems = liveOrder.items.some(
              (i: any) =>
                i.kitchen_status === getKitchenSentStatus() &&
                !i.db_order_item_id
            )

            if (resolvedItemIds.length === 0 && hasUnsyncedFiredItems) {
              console.log(
                '[OfflineSync:send_to_kitchen] Fired items exist but item IDs are not synced yet, will retry'
              )
              return false
            }

            if (resolvedItemIds.length > 0) {
              console.log(
                `[OfflineSync:send_to_kitchen] Derived ${resolvedItemIds.length} fired items from live order state`
              )
            }
          }

          // Do NOT infer backend kitchen delivery from local optimistic statuses.
          // Local items are marked sent immediately offline, so filtering by local
          // state can incorrectly skip the actual backend KDS update after reconnect.

          // 2. Update order status
          // The bulk_update_order_item_status RPC sets sent_to_kitchen_at on the parent order,
          // which violates valid_status_transitions if the order is still in 'draft'.
          // So we must transition the order out of 'draft' before updating items.
          const currentOrder = Object.values(
            _getOrderStore().getState().ordersById
          ).find((o: any) => o.db_order_id === resolvedOrderId)
          const currentStatus = (currentOrder as any)?.order_status
          const targetOrderStatus = getOrderSentStatus()
          const backendStatus =
            currentStatus === 'draft'
              ? targetOrderStatus
              : currentStatus === 'sent_to_kitchen'
              ? 'sent_to_kitchen'
              : currentStatus === 'preparing'
              ? 'preparing'
              : 'preparing'

          const { error: statusError } = await OrderService.updateOrderStatus(
            _supabaseClient,
            resolvedOrderId,
            backendStatus as any
          )

          if (statusError) {
            // P0001 = raise exception from PL/pgSQL — typically "already in target status"
            if (statusError.code === 'P0001') {
              console.log(
                `[OfflineSync:send_to_kitchen] Order already in target status (P0001), treating as success`
              )
            } else {
              console.error(
                '[OfflineSync:send_to_kitchen] Failed to update order status:',
                statusError
              )
              return false
            }
          } else {
            console.log(
              `[OfflineSync:send_to_kitchen] Order status updated to "${backendStatus}"`
            )
          }

          const { data: backendOrder, error: verifyError } =
            await _supabaseClient
              .from('orders')
              .select('status')
              .eq('id', resolvedOrderId)
              .single()

          if (verifyError || backendOrder?.status === 'draft') {
            console.warn(
              '[OfflineSync:send_to_kitchen] Backend order remained draft after status update; deferring item sync',
              {
                resolvedOrderId,
                verifyError,
                backendStatus: backendOrder?.status
              }
            )
            return false
          }

          // 3. Update resolved item statuses
          if (resolvedItemIds.length > 0) {
            const { error: itemError } =
              await OrderService.bulkUpdateOrderItemStatus(
                _supabaseClient,
                resolvedItemIds,
                getKitchenSentStatus()
              )

            if (itemError) {
              console.error(
                '[OfflineSync:send_to_kitchen] Failed to update item statuses:',
                itemError
              )
              // Fatal - retry the whole operation so items get updated
              return false
            }

            console.log(
              `[OfflineSync:send_to_kitchen] ${resolvedItemIds.length} items marked as "sent"`
            )
          }

          // 4. Re-queue unresolved items so they aren't lost
          if (unresolvedLocalItemIds.length > 0) {
            console.log(
              `[OfflineSync:send_to_kitchen] Re-queuing ${unresolvedLocalItemIds.length} unresolved items`
            )
            await queueFailedOperation(
              'send_to_kitchen',
              { localOrderId, localItemIds: unresolvedLocalItemIds },
              localOrderId
            )
          }

          // Clear sync status for items that were successfully sent
          if (localItemIds?.length) {
            useSyncStatusStore.getState().clearAllForOrder(localItemIds)
          }

          // Log offline batch for KDS awareness
          if (op.params.offline_batch) {
            console.log(
              `[OfflineSync:send_to_kitchen] OFFLINE BATCH: ${resolvedItemIds.length} items synced from offline queue`
            )
          }

          console.log(`[OfflineSync:send_to_kitchen] SUCCESS!`)
          return true
        } catch (err) {
          console.error('[OfflineSync:send_to_kitchen] Error:', err)
          return false
        }
      }

      case 'fire_course': {
        const { dbOrderId, courseNumber, localOrderId } = op.params

        // Resolve order ID if needed
        let resolvedOrderId = dbOrderId
        if (!resolvedOrderId && localOrderId) {
          resolvedOrderId = resolveOrderId(localOrderId)
        }

        if (!resolvedOrderId) {
          console.log(
            '[OfflineSync] fire_course: No dbOrderId, will retry later'
          )
          return false
        }

        try {
          const { error } = await _supabaseClient.rpc('fire_course', {
            p_order_id: resolvedOrderId,
            p_course_number: courseNumber,
            p_staff_id:
              useEmployeeStore.getState().loggedInEmployee?.profileId ?? null
          })

          if (error) {
            // Idempotent success: already fired/already exists/already in target state.
            if (
              isAlreadyDoneSyncError(error, [
                'already fired',
                'already exists',
                'already in',
                'already sent'
              ])
            ) {
              console.log(
                `[OfflineSync] fire_course: Course ${courseNumber} already fired/exists for order ${resolvedOrderId}, treating as success`
              )
              return true
            }
            console.error('[OfflineSync] Failed to fire course:', error)
            return false
          }

          console.log(
            `[OfflineSync] Course ${courseNumber} fired for order ${resolvedOrderId}`
          )
          return true
        } catch (err) {
          console.error('[OfflineSync] Error firing course:', err)
          return false
        }
      }

      case 'set_item_seat': {
        const { dbItemId, seatNumber, localOrderId, localItemId } = op.params

        // Resolve item ID: prefer dbItemId, fall back to resolving local IDs
        let resolvedItemId = dbItemId
        if (
          (!resolvedItemId || !isValidUUID(resolvedItemId)) &&
          localOrderId &&
          localItemId
        ) {
          resolvedItemId = resolveItemId(localOrderId, localItemId)
        }

        if (!resolvedItemId || !isValidUUID(resolvedItemId)) {
          console.log(
            '[OfflineSync] set_item_seat: No valid item ID yet, will retry'
          )
          return false
        }

        try {
          const { error } = await _supabaseClient.rpc('set_item_seat', {
            p_order_item_id: resolvedItemId,
            p_seat_number: seatNumber
          })
          if (error) {
            console.error('[OfflineSync] Failed to set item seat:', error)
            return false
          }
          return true
        } catch (err) {
          console.error('[OfflineSync] Error setting item seat:', err)
          return false
        }
      }

      case 'remove_item': {
        const { orderItemId, localOrderId, localItemId } = op.params

        const resolvedItemId =
          localItemId && localOrderId
            ? resolveItemId(localOrderId, localItemId)
            : orderItemId

        if (!resolvedItemId) {
          // If item was never synced, we can just discard the operation
          console.log(
            '[OfflineSync] remove_item: Item never synced, discarding'
          )
          return true
        }

        const { error } = await OrderService.voidOrderItem(
          _supabaseClient,
          resolvedItemId,
          'Removed'
        )
        if (error) {
          const msg = error.message?.toLowerCase() ?? ''
          if (
            msg.includes('not found') ||
            msg.includes('already voided') ||
            error.code === '23505'
          ) {
            console.log(
              '[OfflineSync:remove_item] Already removed/not found, treating as success'
            )
            return true
          }
          return false
        }
        return true
      }

      case 'record_cash_drawer_operation': {
        const {
          id,
          cash_drawer_id,
          session_id,
          operation_type,
          amount,
          performed_by,
          performed_at,
          order_id,
          payment_id,
          balance_after,
          reason,
          approved_by
        } = op.params

        if (!_supabaseClient) {
          console.log(
            '[OfflineSync] record_cash_drawer_operation: No Supabase client'
          )
          return false
        }

        // Resolve order_id from local to backend UUID if needed
        let resolvedOrderId = order_id
        if (order_id && !isValidUUID(order_id)) {
          resolvedOrderId = resolveOrderId(order_id)
          if (!resolvedOrderId) {
            console.log(
              `[OfflineSync] record_cash_drawer_operation: order ${order_id} not synced yet, will retry`
            )
            return false
          }
        }

        // Resolve payment_id from local to backend UUID if needed
        let resolvedPaymentId = payment_id
        if (payment_id && !isValidUUID(payment_id)) {
          resolvedPaymentId = resolveToBackendId(payment_id) || payment_id
        }

        const { error } = await _supabaseClient
          .from('cash_drawer_operations')
          .insert({
            id,
            cash_drawer_id,
            session_id,
            operation_type,
            amount,
            performed_by,
            performed_at,
            order_id: resolvedOrderId,
            payment_id: resolvedPaymentId,
            balance_after,
            reason,
            approved_by
          })

        if (error) {
          if (error.code === '23505') {
            console.log(
              '[OfflineSync:record_cash_drawer_operation] Already recorded (23505), treating as success'
            )
            return true
          }
          console.error(
            '[OfflineSync] record_cash_drawer_operation failed:',
            error
          )
          return false
        }

        // Update session expected_cash
        if (balance_after != null) {
          await _supabaseClient
            .from('cash_drawer_sessions')
            .update({ expected_cash: balance_after })
            .eq('id', session_id)
        }

        return true
      }

      // ================================================================
      // PRE-AUTH OPERATION HANDLERS
      // ================================================================

      case 'process_preauth': {
        const { localOrderId, amount, terminalResponse, terminalType } =
          op.params

        // Resolve order ID
        let dbOrderId: string | undefined
        if (localOrderId) {
          const order = _getOrderStore().getState().ordersById[localOrderId]
          dbOrderId = order?.db_order_id
          if (!dbOrderId) {
            const resolved = resolveOrderId(localOrderId)
            if (!resolved) {
              console.log(
                '[OfflineSync:process_preauth] Order not synced yet, will retry'
              )
              return false
            }
            dbOrderId = resolved
          }
        }

        if (!dbOrderId) {
          console.error('[OfflineSync:process_preauth] No order ID available')
          return false
        }

        const { data: preauthData, error: preauthErr } =
          await _supabaseClient.rpc('process_preauth_v1', {
            p_order_id: dbOrderId,
            p_amount: amount,
            p_terminal_response: terminalResponse ?? null,
            p_staff_id: null,
            p_terminal_type: terminalType ?? 'dejavoo'
          })

        if (preauthErr) {
          console.error(
            '[OfflineSync:process_preauth] Failed:',
            preauthErr.message
          )
          return false
        }

        // Update local payment with backend payment ID
        const preauthResult = preauthData as {
          success: boolean
          payment_id?: string
        } | null
        if (
          preauthResult?.success &&
          preauthResult.payment_id &&
          localOrderId
        ) {
          _getOrderStore().setState((state: any) => {
            const order = state.ordersById[localOrderId]
            if (!order?.payments) return state
            const payments = order.payments.map((p: any) =>
              p.isPreAuth && !p.db_payment_id
                ? {
                    ...p,
                    db_payment_id: preauthResult.payment_id,
                    sync_status: 'synced' as const
                  }
                : p
            )
            return {
              ordersById: {
                ...state.ordersById,
                [localOrderId]: { ...order, payments }
              }
            }
          })
        }

        if (preauthResult && !preauthResult.success) {
          console.error(
            '[OfflineSync:process_preauth] RPC returned success=false:',
            preauthResult
          )
          return false // Retry instead of silently discarding
        }

        return true
      }

      case 'capture_preauth': {
        const { dbPaymentId, captureAmount, tipAmount, terminalResponse } =
          op.params

        if (!dbPaymentId) {
          console.error('[OfflineSync:capture_preauth] No dbPaymentId')
          return false
        }

        const { error: captureErr } = await _supabaseClient.rpc(
          'capture_preauth_v1',
          {
            p_payment_id: dbPaymentId,
            p_capture_amount: captureAmount,
            p_tip_amount: tipAmount ?? 0,
            p_terminal_response: terminalResponse ?? null,
            p_staff_id: null
          }
        )

        if (captureErr) {
          const msg = captureErr.message?.toLowerCase() ?? ''
          if (msg.includes('already captured') || msg.includes('not found')) {
            console.log(
              '[OfflineSync:capture_preauth] Already captured, treating as success'
            )
            return true
          }
          console.error(
            '[OfflineSync:capture_preauth] Failed:',
            captureErr.message
          )
          return false
        }

        return true
      }

      case 'increment_preauth': {
        const { dbPaymentId, newAmount, terminalResponse } = op.params

        if (!dbPaymentId) {
          console.error('[OfflineSync:increment_preauth] No dbPaymentId')
          return false
        }

        const { error: incErr } = await _supabaseClient.rpc(
          'update_preauth_amount_v1',
          {
            p_payment_id: dbPaymentId,
            p_new_amount: newAmount,
            p_terminal_response: terminalResponse ?? null
          }
        )

        if (incErr) {
          console.error(
            '[OfflineSync:increment_preauth] Failed:',
            incErr.message
          )
          return false
        }

        return true
      }

      case 'void_preauth': {
        const { dbPaymentId, reason } = op.params

        if (!dbPaymentId) {
          console.error('[OfflineSync:void_preauth] No dbPaymentId')
          return false
        }

        const { error: voidErr } = await _supabaseClient.rpc(
          'void_preauth_v1',
          {
            p_payment_id: dbPaymentId,
            p_staff_id: null,
            p_reason: reason ?? 'Pre-auth released'
          }
        )

        if (voidErr) {
          const msg = voidErr.message?.toLowerCase() ?? ''
          if (
            msg.includes('already voided') ||
            msg.includes('not found') ||
            voidErr.code === '23505'
          ) {
            console.log(
              '[OfflineSync:void_preauth] Already voided, treating as success'
            )
            return true
          }
          console.error('[OfflineSync:void_preauth] Failed:', voidErr.message)
          return false
        }

        return true
      }

      // ================================================================
      // PROCESS CASH REFUND (Phase 1: Offline cash refund support)
      // ================================================================
      case 'process_cash_refund': {
        const {
          dbOrderId,
          orderId,
          totalAmount,
          reason,
          perPaymentDetails,
          selectedItems,
          refundType,
          initiatedBy
        } = op.params

        console.log(
          `[OfflineSync:process_cash_refund] Processing offline cash refund for order ${dbOrderId}`
        )

        // Resolve order ID
        const resolvedRefundOrderId = resolveOrderId(orderId || dbOrderId)
        if (!resolvedRefundOrderId) {
          console.log(
            `[OfflineSync:process_cash_refund] BLOCKED - Order not synced yet`
          )
          return false
        }

        try {
          const reversalType =
            refundType === 'full'
              ? ('refund' as const)
              : ('partial_refund' as const)

          for (const detail of perPaymentDetails || []) {
            if (!detail.dbPaymentId) continue

            // 1. Create reversal record
            const { data: reversal, error: reversalError } =
              await OrderService.createReversal(_supabaseClient, {
                original_payment_id: detail.dbPaymentId,
                original_psp_reference: null,
                reversal_reference_id: null,
                reversal_type: selectedItems ? 'item_return' : reversalType,
                amount: detail.totalRefund,
                reason_code: reason,
                reason_description: reason,
                initiated_by: initiatedBy,
                approved_by: null
              })

            if (reversalError || !reversal) {
              console.error(
                '[OfflineSync:process_cash_refund] createReversal failed:',
                reversalError
              )
              return false
            }

            // 2. Apply refund to payment
            const { error: paymentError } =
              await OrderService.applyRefundToPayment(
                _supabaseClient,
                detail.dbPaymentId,
                detail.totalRefund,
                selectedItems ? 'item_return' : reversalType
              )

            if (paymentError) {
              console.error(
                '[OfflineSync:process_cash_refund] applyRefundToPayment failed:',
                paymentError
              )
            }

            // 3. Record refund items if item-level refund
            // Filter items to only those belonging to this payment's paymentIndex
            if (selectedItems && selectedItems.length > 0) {
              const itemsForThisPayment = selectedItems.filter(
                (item: any) =>
                  item.paymentIndex === undefined ||
                  item.paymentIndex === detail.paymentIndex
              )

              if (itemsForThisPayment.length > 0) {
                const refundItems = itemsForThisPayment.map((item: any) => ({
                  order_item_id: item.itemId,
                  quantity_refunded: item.quantity,
                  unit_price_refunded: 0,
                  subtotal_refunded: 0,
                  tax_refunded: 0,
                  total_refunded: 0,
                  refund_reason: reason
                }))

                await OrderService.recordRefundItems(
                  _supabaseClient,
                  reversal.id,
                  refundItems
                )
              }
            }
          }

          // 4. Update order payment status
          const { error: statusError } =
            await OrderService.updateOrderPaymentStatusAfterRefund(
              _supabaseClient,
              resolvedRefundOrderId
            )

          if (statusError) {
            console.error(
              '[OfflineSync:process_cash_refund] updateOrderPaymentStatus failed:',
              statusError
            )
          }

          // 5. Sync order from backend to reconcile temp IDs
          try {
            await _getOrderStore()
              .getState()
              .syncOrderFromBackendComplete(resolvedRefundOrderId)
          } catch (syncErr) {
            console.warn(
              '[OfflineSync:process_cash_refund] Background sync failed:',
              syncErr
            )
          }

          console.log(`[OfflineSync:process_cash_refund] SUCCESS`)
          return true
        } catch (err) {
          console.error('[OfflineSync:process_cash_refund] Error:', err)
          return false
        }
      }

      // ================================================================
      // TIP ADJUST DB FALLBACK (Phase 2)
      // ================================================================
      case 'tip_adjust_db': {
        const { dbOrderId, dbAdjustments, staffId } = op.params

        console.log(
          `[OfflineSync:tip_adjust_db] Persisting tip adjustments for order ${dbOrderId}`
        )

        if (!dbOrderId || !dbAdjustments?.length) {
          console.error(
            '[OfflineSync:tip_adjust_db] Missing dbOrderId or adjustments'
          )
          return false
        }

        try {
          const { adjustTips } = require('@/services/tipAdjustService')
          await adjustTips(_supabaseClient, dbOrderId, dbAdjustments, staffId)

          // Fire-and-forget sync to reconcile local state
          _getOrderStore()
            .getState()
            .syncOrderFromBackendComplete(dbOrderId)
            .catch((err: any) =>
              console.warn(
                '[OfflineSync:tip_adjust_db] Background sync failed:',
                err
              )
            )

          console.log(`[OfflineSync:tip_adjust_db] SUCCESS`)
          return true
        } catch (err) {
          console.error('[OfflineSync:tip_adjust_db] Error:', err)
          return false
        }
      }

      // ================================================================
      // UPDATE ORDER DETAILS (Phase 3: Customer assignment offline sync)
      // ================================================================
      case 'update_order_details': {
        const {
          customer_name,
          customer_id,
          customer_phone,
          customer_email,
          guest_count,
          service_location_id,
          db_order_id,
          order_type,
          delivery_address
        } = op.params

        // Resolve order ID (may have been local when queued)
        const resolvedDetailsOrderId =
          db_order_id && isValidUUID(db_order_id)
            ? db_order_id
            : resolveOrderId(op.localOrderId)

        if (!resolvedDetailsOrderId) {
          console.log(
            `[OfflineSync:update_order_details] BLOCKED - Order not synced yet`
          )
          return false
        }

        console.log(
          `[OfflineSync:update_order_details] Syncing details for order ${resolvedDetailsOrderId}`
        )

        try {
          // Update customer details on orders table
          if (customer_name !== undefined) {
            // Resolve customer_id: local IDs (local_customer_*) must not go to DB
            let resolvedCustomerId: string | null = customer_id ?? null
            if (resolvedCustomerId && !isValidUUID(resolvedCustomerId)) {
              // Try to resolve from customer cache
              try {
                const { getCachedCustomers } = require('@/services/customer')
                const cache = getCachedCustomers()
                const match = cache.find(
                  (c: any) =>
                    c.id === resolvedCustomerId ||
                    (c.local_temp_id && c.local_temp_id === resolvedCustomerId)
                )
                if (match && isValidUUID(match.id)) {
                  console.log(
                    `[OfflineSync:update_order_details] Resolved customer ${resolvedCustomerId} → ${match.id}`
                  )
                  resolvedCustomerId = match.id
                } else {
                  console.log(
                    `[OfflineSync:update_order_details] Customer ${resolvedCustomerId} not synced yet, sending null`
                  )
                  resolvedCustomerId = null
                }
              } catch {
                console.warn(
                  `[OfflineSync:update_order_details] Failed to resolve customer ID, sending null`
                )
                resolvedCustomerId = null
              }
            }

            const { error } = await _supabaseClient
              .from('orders')
              .update({
                customer_name,
                customer_id: resolvedCustomerId,
                customer_phone: customer_phone ?? null,
                customer_email: customer_email ?? null
              })
              .eq('id', resolvedDetailsOrderId)

            if (error) {
              console.error(
                '[OfflineSync:update_order_details] Customer update failed:',
                error
              )
              return false
            }
          }

          // Update order type and delivery address
          if (order_type !== undefined || delivery_address !== undefined) {
            const updateFields: Record<string, any> = {}
            if (order_type !== undefined)
              updateFields.order_type = order_type.toLowerCase()
            if (delivery_address !== undefined)
              updateFields.delivery_address = delivery_address

            const { error } = await _supabaseClient
              .from('orders')
              .update(updateFields)
              .eq('id', resolvedDetailsOrderId)

            if (error) {
              console.error(
                '[OfflineSync:update_order_details] Order type/address update failed:',
                error
              )
              return false
            }
          }

          // Update guest count on table_sessions if applicable
          if (guest_count !== undefined && service_location_id) {
            const { useFloorPlanStore } = require('@/stores/useFloorPlanStore')
            const table =
              useFloorPlanStore.getState().tablesById[service_location_id]
            const sessionId = table?.session?.id

            if (sessionId) {
              const { error } = await _supabaseClient
                .from('table_sessions')
                .update({ party_size: guest_count })
                .eq('id', sessionId)

              if (error) {
                console.error(
                  '[OfflineSync:update_order_details] Guest count update failed:',
                  error
                )
              }
            }
          }

          console.log(`[OfflineSync:update_order_details] SUCCESS`)
          return true
        } catch (err) {
          console.error('[OfflineSync:update_order_details] Error:', err)
          return false
        }
      }

      // ================================================================
      // EARN LOYALTY (Deferred sync after reconnect)
      // ================================================================
      case 'earn_loyalty': {
        const {
          db_order_id,
          local_order_id,
          customer_id,
          customer_phone,
          merchant_id
        } = op.params

        const resolvedOrderId =
          db_order_id && isValidUUID(db_order_id)
            ? db_order_id
            : resolveOrderId(local_order_id || op.localOrderId)

        if (!resolvedOrderId) {
          console.log(
            '[OfflineSync:earn_loyalty] BLOCKED - Order not synced yet'
          )
          return false
        }

        console.log(
          `[OfflineSync:earn_loyalty] Processing loyalty for order ${resolvedOrderId}`
        )

        try {
          let effectiveCustomerId: string | null =
            customer_id && isValidUUID(customer_id) ? customer_id : null

          // Fetch latest order customer fields when needed.
          if (!effectiveCustomerId) {
            const { data: orderRow, error: orderError } = await _supabaseClient
              .from('orders')
              .select('customer_id, customer_phone, merchant_id')
              .eq('id', resolvedOrderId)
              .maybeSingle()

            if (orderError) {
              console.warn(
                '[OfflineSync:earn_loyalty] Failed to fetch order customer fields:',
                orderError
              )
            } else if (
              orderRow?.customer_id &&
              isValidUUID(orderRow.customer_id)
            ) {
              effectiveCustomerId = orderRow.customer_id
            }

            // If no customer_id yet, resolve via phone and attach to order.
            if (!effectiveCustomerId) {
              const effectivePhone =
                (customer_phone as string | null | undefined)?.replace(
                  /\D/g,
                  ''
                ) ||
                (
                  orderRow?.customer_phone as string | null | undefined
                )?.replace(/\D/g, '') ||
                ''
              const effectiveMerchantId =
                (merchant_id as string | null | undefined) ||
                (orderRow?.merchant_id as string | null | undefined) ||
                null

              if (effectiveMerchantId && effectivePhone.length >= 10) {
                const { id: resolvedCustomerId } =
                  await findOrCreateCustomerByPhone(
                    effectivePhone,
                    effectiveMerchantId,
                    _supabaseClient
                  )
                effectiveCustomerId = resolvedCustomerId

                const { error: updateCustomerError } = await _supabaseClient
                  .from('orders')
                  .update({ customer_id: resolvedCustomerId })
                  .eq('id', resolvedOrderId)
                if (updateCustomerError) {
                  console.warn(
                    '[OfflineSync:earn_loyalty] Failed to persist resolved customer_id:',
                    updateCustomerError
                  )
                }
              }
            }
          }

          if (!effectiveCustomerId) {
            console.log(
              '[OfflineSync:earn_loyalty] BLOCKED - Missing customer context, will retry'
            )
            return false
          }

          const results = await earnLoyaltyForOrder(
            resolvedOrderId,
            _supabaseClient
          )
          console.log(
            `[OfflineSync:earn_loyalty] SUCCESS - programs processed: ${results.length}`
          )
          return true
        } catch (err) {
          console.error('[OfflineSync:earn_loyalty] Error:', err)
          return false
        }
      }

      default:
        console.warn('[OfflineSync] Unknown operation type:', op.type)
        return false
    }
  } catch (error) {
    console.error('[OfflineSync] Error executing operation:', op.type, error)
    return false
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
export async function reconcileRelationships (): Promise<void> {
  if (!_supabaseClient) {
    console.warn('[reconcile] No Supabase client available, skipping')
    return
  }

  console.log('[reconcile] ====== STARTING RECONCILIATION ======')

  try {
    // ================================================================
    // PASS 1: Find orders missing session_id
    // ================================================================
    const { ordersById } = _getOrderStore().getState()
    const orphanedOrders = (Object.values(ordersById) as any[]).filter(
      (order: any) => order.local_session_id && !order.session_id
    )

    console.log(
      `[reconcile] Found ${orphanedOrders.length} orders missing session_id`
    )

    for (const order of orphanedOrders) {
      try {
        // Try to resolve the local session ID to a backend UUID
        const backendSessionId = order.local_session_id
          ? resolveSessionId(order.local_session_id)
          : undefined

        if (backendSessionId) {
          console.log(
            `[reconcile] ✓ Linking order ${order.id} to session ${backendSessionId}`
          )

          // Call the RPC to set bidirectional link
          const { data, error } = await _supabaseClient.rpc(
            'link_order_to_session',
            {
              p_order_id: order.db_order_id,
              p_session_id: backendSessionId
            }
          )

          if (error) {
            console.error(
              `[reconcile] Failed to link order ${order.id}:`,
              error
            )
          } else {
            console.log(
              `[reconcile] Successfully linked order ${order.id}`,
              data
            )

            // Update local state
            _getOrderStore().setState((state: any) => ({
              ordersById: {
                ...state.ordersById,
                [order.id]: {
                  ...order,
                  session_id: backendSessionId
                }
              }
            }))
          }
        } else {
          console.warn(
            `[reconcile] ⚠ Session ${order.local_session_id} not synced yet, will retry later`
          )
        }
      } catch (err) {
        console.error(`[reconcile] Error processing order ${order.id}:`, err)
      }
    }

    // ================================================================
    // PASS 2: Resolve local order IDs in sessions to backend order IDs
    // ================================================================
    try {
      const { useTableSessionStore } = require('@/stores/useTableSessionStore')
      const sessionStore = useTableSessionStore.getState()

      let resolvedCount = 0
      for (const [tableId, session] of Object.entries(
        sessionStore.sessions
      ) as [string, any][]) {
        if (session.order_id && isLocalId(session.order_id)) {
          const resolved = resolveOrderId(session.order_id)
          if (resolved) {
            sessionStore.dispatch(tableId, {
              type: 'PATCH',
              updates: { order_id: resolved }
            })
            resolvedCount++
            console.log(
              `[reconcile] ✓ Resolved session order_id for table ${tableId}: ${session.order_id} → ${resolved}`
            )
          }
        }
      }
      if (resolvedCount > 0) {
        console.log(`[reconcile] Resolved ${resolvedCount} session order IDs`)
      }
    } catch (err) {
      console.warn('[reconcile] PASS 2 (session order IDs) failed:', err)
    }

    console.log('[reconcile] ====== RECONCILIATION COMPLETE ======')
  } catch (error) {
    console.error('[reconcile] Reconciliation failed:', error)
    // Don't throw - reconciliation will retry on next sync
  }
}

// ============================================================================
// TABLE SESSION RECONCILIATION
// ============================================================================

/**
 * Reconcile table sessions with backend state after reconnecting.
 *
 * Fetches all current sessions from backend and compares with local state.
 * Resolves duplicate sessions, lifecycle divergence, and orphaned local sessions.
 */
async function reconcileTableSessions (): Promise<void> {
  if (!_supabaseClient) {
    console.warn('[reconcileTableSessions] No Supabase client, skipping')
    return
  }

  const locationId = useStoreSettingsStore.getState().selectedStore?.id
  if (!locationId) {
    console.warn('[reconcileTableSessions] No location selected, skipping')
    return
  }

  console.log('[reconcileTableSessions] ====== STARTING ======')

  try {
    const { data: rows, error } = await FloorPlanService.getLocationTableStatus(
      _supabaseClient,
      locationId
    )

    if (error || !rows) {
      console.error(
        '[reconcileTableSessions] Failed to fetch backend sessions:',
        error
      )
      return
    }

    const { useTableSessionStore } = require('@/stores/useTableSessionStore')
    const sessionStore = useTableSessionStore.getState()
    const localSessions = sessionStore.sessions as Record<string, any>

    // Build remote session map: tableId -> row
    const remoteSessions = new Map<string, any>()
    for (const row of rows) {
      if (row.session_id) {
        remoteSessions.set(row.table_id, row)
      }
    }

    const {
      detectSessionConflict,
      getSessionConflictToastMessage
    } = require('@/services/sessionConflictDetectionService')
    const { useConflictStore } = require('@/stores/useConflictStore')
    const { useToastStore } = require('@/stores/useToastStore')
    const { getQueueSnapshot } = require('@/services/offlineSyncService')

    const dispatchActions: Array<{ tableId: string; action: any }> = []

    // Check local sessions against remote
    for (const [tableId, localSession] of Object.entries(localSessions) as [
      string,
      any
    ][]) {
      // Skip local sessions still pending sync — let the queue handler deal with them
      if (localSession.id?.startsWith('local_session_')) continue

      const remote = remoteSessions.get(tableId)

      if (!remote) {
        // Local session with no remote — check if there are queued ops for this table
        const queue = getQueueSnapshot()
        const hasQueuedOps = queue.some(
          (op: any) =>
            (op.type === 'seat_guests' ||
              op.type === 'update_session_status') &&
            (op.status === 'pending' ||
              op.status === 'processing' ||
              op.status === 'blocked') &&
            (op.params.tableIds?.includes(tableId) ||
              op.params.tableId === tableId)
        )

        if (!hasQueuedOps) {
          console.log(
            `[reconcileTableSessions] CLEAR orphaned local session for table ${tableId}`
          )
          dispatchActions.push({ tableId, action: { type: 'CLEAR' } })
        }
        continue
      }

      if (localSession.id !== remote.session_id) {
        // Different session IDs — detect conflict
        const orderStore = _getOrderStore().getState()
        const localOrder = localSession.order_id
          ? orderStore.getOrder(localSession.order_id)
          : null

        const conflict = detectSessionConflict(
          tableId,
          {
            id: localSession.id,
            status: localSession.status,
            orderId: localSession.order_id,
            hasItems: (localOrder?.items?.length ?? 0) > 0,
            hasPayments: (localOrder?.payments?.length ?? 0) > 0
          },
          {
            id: remote.session_id,
            status: remote.session_status,
            orderId: remote.order_id
          },
          remote.table_name
        )

        if (conflict) {
          useConflictStore.getState().addSessionConflict(conflict)

          // Show toast for auto-resolved conflicts
          if (conflict.autoResolved) {
            const toast = getSessionConflictToastMessage(conflict)
            useToastStore.getState().show({
              title: toast.title,
              message: toast.message,
              type: toast.type
            })
          }

          // Apply resolution: accept_remote syncs the remote session
          if (conflict.resolution === 'accept_remote') {
            dispatchActions.push({
              tableId,
              action: {
                type: 'SYNC',
                session: {
                  id: remote.session_id,
                  session_number: remote.session_number,
                  status: remote.session_status,
                  party_size: remote.party_size ?? 0,
                  guest_name: remote.guest_name,
                  order_id: remote.order_id,
                  server_staff_id: remote.server_staff_id ?? undefined,
                  seated_at: remote.seated_at ?? new Date().toISOString(),
                  current_course: remote.current_course ?? 1,
                  needs_attention: remote.needs_attention ?? false,
                  is_vip: remote.is_vip ?? false
                }
              }
            })
          }
          // create_separate: local order already synced via queue; accept remote session for the table
          if (conflict.resolution === 'create_separate') {
            dispatchActions.push({
              tableId,
              action: {
                type: 'SYNC',
                session: {
                  id: remote.session_id,
                  session_number: remote.session_number,
                  status: remote.session_status,
                  party_size: remote.party_size ?? 0,
                  guest_name: remote.guest_name,
                  order_id: remote.order_id,
                  server_staff_id: remote.server_staff_id ?? undefined,
                  seated_at: remote.seated_at ?? new Date().toISOString(),
                  current_course: remote.current_course ?? 1,
                  needs_attention: remote.needs_attention ?? false,
                  is_vip: remote.is_vip ?? false
                }
              }
            })
          }
        }
        continue
      }

      // Same session — no action needed, status transitions sync via queue
    }

    // Sync remote sessions that don't exist locally
    for (const [tableId, remote] of remoteSessions) {
      if (!localSessions[tableId]) {
        dispatchActions.push({
          tableId,
          action: {
            type: 'SYNC',
            session: {
              id: remote.session_id,
              session_number: remote.session_number,
              status: remote.session_status,
              party_size: remote.party_size ?? 0,
              guest_name: remote.guest_name,
              order_id: remote.order_id,
              server_staff_id: remote.server_staff_id ?? undefined,
              seated_at: remote.seated_at ?? new Date().toISOString(),
              current_course: remote.current_course ?? 1,
              needs_attention: remote.needs_attention ?? false,
              is_vip: remote.is_vip ?? false
            }
          }
        })
      }
    }

    if (dispatchActions.length > 0) {
      sessionStore.batchDispatch(dispatchActions)
      console.log(
        `[reconcileTableSessions] Applied ${dispatchActions.length} actions`
      )
    }

    console.log('[reconcileTableSessions] ====== COMPLETE ======')
  } catch (error) {
    console.error('[reconcileTableSessions] Failed:', error)
  }
}

/**
 * Helper to queue an operation when sync fails.
 * Use this in store actions when backend calls fail.
 */
export async function queueFailedOperation (
  type: OfflineOperation['type'],
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
    contextSnapshot
  })
}

/**
 * Queue an operation with a dependency on another operation.
 * The dependent operation will only execute after the dependency completes.
 */
export async function queueDependentFailedOperation (
  type: OfflineOperation['type'],
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
      contextSnapshot
    },
    dependsOnOperationId
  )
}

/**
 * Queue a payment operation with special handling.
 */
export async function queuePaymentOperation (
  type: 'process_cash_payment' | 'process_card_payment',
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
      transactionRef: cardData?.transactionRef
    },
    localOrderId
  })
}

/**
 * Check if we're currently online.
 */
export function isOnline (): boolean {
  return getIsOnline()
}

/**
 * Get the priority for an operation type.
 */
export function getOperationPriority (type: OfflineOperation['type']): number {
  return OPERATION_PRIORITY[type] ?? 99
}
