import { getDeviceId } from '@/lib/deviceId'
import {
  getKitchenSentStatus,
  getOrderSentStatus
} from '@/lib/kitchenStatusUtils'
import {
  createLazyPersistStorage,
  getSyncJSON,
  setSyncJSON
} from '@/lib/storage'
import { toastService } from '@/lib/toastService'
import {
  CartItem,
  Discount,
  OrderAppliedDiscount,
  OrderPaymentItemCoverage,
  OrderPaymentTransactionDetails,
  OrderProfile,
  OrderProfilePayment,
  PaymentType
} from '@/lib/types'
import { OrderService } from '@/services/orderService'
import { useMenuStore } from '@/stores/useMenuStore'
import type {
  AddOrderItemParams,
  CreateOrderParams,
  OrderType as DbOrderType
} from '@/types/db-order-management-types'
import { TaxRatesMap } from '@/types/menu'
import type {
  ItemPaymentAllocation,
  OrderTotals
} from '@/types/order-calculations'
import type { Station } from '@/types/station'
import type { SupabaseClient } from '@supabase/supabase-js'
import { current, freeze, original } from 'immer'
import { create } from 'zustand'
import { persist, subscribeWithSelector } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { useCoursingStore } from './useCoursingStore'
import { useEmployeeStore } from './useEmployeeStore'
import { useInventoryStore } from './useInventoryStore'
import { usePreviousOrdersStore } from './usePreviousOrdersStore'
import { useTableSessionStore } from './useTableSessionStore'
// import {
//   mapLocalToBackend,
//   registerLocalId
// } from "@/lib/offlineIdRegistry";
// Import pure calculation functions from order-calculator module
import {
  forceSetLocalSequence,
  generateLocalOrderNumbers,
  parseSequenceFromDisplayNumber,
  seedLocalSequence
} from '@/lib/localOrderSequence'
import { mapLocalToBackend, registerLocalId } from '@/lib/offlineIdRegistry'
import {
  applyPaymentToItems,
  calculateItemEffectiveCashPrice as calculateItemEffectiveCashPriceFromModule,
  calculateOrderTotals as calculateOrderTotalsFromModule,
  calculatePaidStatus,
  distributeDiscountToItems as distributeDiscountToItemsFromModule,
  invalidateCalculationCache,
  scheduleCalculationCacheInvalidation
} from '@/lib/order-calculator'
import { normalizePlatform } from '@/lib/platformAliases'
import { queueFailedOperation } from '@/services/offlineSyncInit'
import {
  cancelOrderOperations,
  getIsOnline,
  cancelPendingByEntity,
  getDeadLetterOperations,
  getOperationsForOrder,
  getOrderCreationOperationId,
  getPendingOperations,
  processQueueNow,
  queueOperation,
  removeOperation,
  retryDeadLetterOperation,
  retrySyncForItem as retrySyncForItemQueue,
  dropQueuedOpsForItem,
  updateOperationParams
} from '@/services/offlineSyncService'
import { resolveBackendPrices } from '@/lib/cartItemPricing'
import { DEADLINES } from '@/lib/network/deadlines'
import { runWithDeadline } from '@/lib/network/runWithDeadline'
import { OrderDiscountService } from '@/services/orderDiscountService'
import { paymentPreviewService } from '@/services/paymentPreviewService'
import {
  deriveCashSavings,
  isHeaderOnlyBroadcast,
  mapBackendItemToCartItem,
  mapOrderType,
  mapPaymentStatus,
  normalizeFetchedOrder,
  transformBroadcastItems,
  transformBroadcastPaymentsToProfile,
  transformBroadcastToOrder,
  type BackendItemInput,
  type FetchedOrderData
} from '@/utils/orderTransformers'
import {
  toIdempotencyKey,
  toUpdateItemKey,
  toUpdateQuantityKey
} from '@/lib/network/idempotencyKey'
import { useSyncStatusStore } from './useSyncStatusStore'
// import { queueFailedOperation } from "@/services/offlineSyncInit";
// import { getIsOnline, queueOperation } from "@/services/offlineSyncService";
import {
  BroadcastOrderData,
  OrderBroadcastPayload
} from '@/hooks/realtime/useOrdersRealtime'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import { useFloorPlanStore } from './useFloorPlanStore'
// Phase 6: Conflict detection imports
import {
  clearItemPendingRemoval,
  isItemPendingRemoval,
  markItemPendingRemoval
} from '@/lib/pendingItemRemovals'
import {
  clearOrderPendingVoid,
  isOrderPendingVoid
} from '@/lib/pendingVoidOrderIds'
import { detectConflict } from '@/services/conflictDetectionService'
import { autoPrintKitchenTicketsIfEnabled } from '@/services/printing/autoPrintKitchen'
import { useConflictStore } from '@/stores/useConflictStore'
import {
  generateConflictToast,
  isConflictCritical
} from '@/types/conflict-resolution'
import { DejavooSaleTransactionResponse } from '@/types/dejavoo-spin-api'
import { restoreDiscountsFromBackend } from '@/utils/discountUtils'
import { isOrderReadOnly } from '@/lib/orderAccessControl'

// ============================================================================
// CART-EDIT OWNERSHIP GUARD (Lever 2)
// ============================================================================
// Defense-in-depth gate against mutating an order owned by another station.
// The user-facing UI gate (BillSection / MenuSection / etc. via
// useIsActiveOrderReadOnly) prevents users from reaching here, so this is the
// fallback that catches programmatic / racy callers. Lifecycle actions
// (markAllItemsAsReady, archiveOrder, updateOrderCheckStatus, kitchen-status
// batches) are NOT gated — they're progressive and station-agnostic.
function _checkCartEditable (
  state: { ordersById: Record<string, OrderProfile>; currentStationId: string | null; activeOrderId: string | null },
  orderId?: string | null
): boolean {
  const id = orderId ?? state.activeOrderId
  if (!id) return true
  const order = state.ordersById[id]
  if (isOrderReadOnly(order, state.currentStationId)) {
    if (__DEV__) {
      console.warn(
        '[Mutation blocked] read-only order — caller must claim_order first:',
        {
          orderId: id,
          ownerStation: order?.station_id,
          myStation: state.currentStationId
        }
      )
    }
    return false
  }
  return true
}

/**
 * Detects the typed error returned by mutation RPCs when the server's
 * station-id guard rejects a write because another station owns the order.
 *
 * The Postgres functions return `{ success: false, error: 'ORDER_OWNED_BY_OTHER_STATION', ... }`
 * via PostgREST as `data`, with `error` being null. Some legacy RPCs may
 * RAISE EXCEPTION instead, in which case the message lives on `error`.
 */
function _isOwnershipError (result: any, error: any): boolean {
  if (result && result.success === false && result.error === 'ORDER_OWNED_BY_OTHER_STATION') return true
  if (error && typeof error.message === 'string' && error.message.includes('ORDER_OWNED_BY_OTHER_STATION')) return true
  return false
}

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
export const calculateItemEffectiveCashPrice =
  calculateItemEffectiveCashPriceFromModule

/**
 * Calculate paid_status PURELY from the order's payments array.
 * @see @/lib/order-calculator.ts for implementation
 * @deprecated Import from @/lib/order-calculator instead
 */
export const calculatePaidStatusFromPayments = calculatePaidStatus

/**
 * Distribute an order-level discount proportionally to individual items.
 * @see @/lib/order-calculator.ts for implementation
 * @deprecated Import from @/lib/order-calculator instead
 */
export const distributeDiscountToItems = distributeDiscountToItemsFromModule

/**
 * Calculate the effective subtotal for a cart item after applying discounts.
 * Uses backend-synced discount_amount if available, otherwise calculates from price.
 * @param item - The cart item to calculate subtotal for
 * @returns The effective subtotal (price * quantity - discount)
 */
export function getItemEffectiveSubtotal (item: CartItem): number {
  const grossSubtotal = item.price * item.quantity
  const discountAmount = item.discount_amount ?? 0
  return Math.max(0, Math.round((grossSubtotal - discountAmount) * 100) / 100)
}

/**
 * Calculate the effective cash subtotal for a cart item after applying discounts.
 * Uses backend-synced discount_cash_amount if available, otherwise calculates from cashPrice.
 * @param item - The cart item to calculate cash subtotal for
 * @returns The effective cash subtotal (cashPrice * quantity - discount)
 */
export function getItemEffectiveCashSubtotal (item: CartItem): number {
  const grossCashSubtotal = (item.cashPrice || item.price) * item.quantity
  const discountAmount = item.discount_cash_amount ?? item.discount_amount ?? 0
  return Math.max(
    0,
    Math.round((grossCashSubtotal - discountAmount) * 100) / 100
  )
}

/**
 * Calculate all order totals - PURE FUNCTION, SYNCHRONOUS
 * This is a wrapper around the module function for backward compatibility.
 * @see @/lib/order-calculator.ts for implementation
 */
function calculateOrderTotals (
  items: CartItem[],
  checkDiscount: Discount | null | undefined,
  payments: {
    amount: number
    isVoided?: boolean
    refundedAmount?: number
    isCashPriced?: boolean
    cashSavings?: number
    isPreAuth?: boolean
  }[],
  taxRatesMap: TaxRatesMap
): OrderTotals {
  return calculateOrderTotalsFromModule({
    items,
    checkDiscount: checkDiscount ?? null,
    taxRatesMap,
    payments
  })
}

// ============================================================================
// HELPER FUNCTIONS FOR ITEM SYNC AND BROADCAST
// ============================================================================

/**
 * Restore checkDiscount and applied_discounts from backend order_discounts data.
 * Handles type conversions between DB format and local state format.
 */
// restoreDiscountsFromBackend extracted to @/utils/discountUtils.ts

/**
 * Transform backend OrderItemModifier[] to CartItem modifiers format.
 * Groups modifiers by modifier_group_name into categories with options.
 */
function transformBackendModifiers (
  backendModifiers:
    | Array<{
        modifier_item_id?: string
        modifier_name: string
        modifier_group_id?: string
        modifier_group_name: string
        price_modifier: number
        quantity: number
        is_no?: boolean
      }>
    | undefined
): CartItem['customizations']['modifiers'] {
  if (!backendModifiers || backendModifiers.length === 0) return undefined

  const grouped = new Map<
    string,
    {
      categoryId: string
      categoryName: string
      options: { id: string; name: string; price: number; isNo?: boolean }[]
    }
  >()

  for (const mod of backendModifiers) {
    const groupKey = mod.modifier_group_name

    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, {
        categoryId: mod.modifier_group_id || groupKey,
        categoryName: mod.modifier_group_name,
        options: []
      })
    }

    // Handle quantity > 1 by adding option multiple times
    for (let i = 0; i < mod.quantity; i++) {
      grouped.get(groupKey)!.options.push({
        id: mod.modifier_item_id || mod.modifier_name, // Fallback to name if no ID
        name: mod.modifier_name,
        price: mod.price_modifier,
        isNo: mod.is_no || undefined
      })
    }
  }

  return Array.from(grouped.values())
}

/** Rank kitchen statuses for "who's further ahead" comparisons */
const KITCHEN_STATUS_RANK: Record<string, number> = {
  new: 0,
  sent: 1,
  preparing: 2,
  ready: 3,
  served: 4
}

/**
 * Detect if item-level data has changed between local and backend.
 * Checks subtotals, tax amounts, quantities, modifiers (not just item counts).
 *
 * Performance: O(n) single pass with early exit.
 * Used by: noMeaningfulChange check in broadcast handler.
 */
function hasItemLevelChanges (
  localItems: CartItem[],
  backendItems: BroadcastOrderData['order_items'] | undefined,
  broadcastVersion?: number
): boolean {
  // v2 (header-only) broadcasts intentionally omit items — not a change signal
  if ((broadcastVersion ?? 1) >= 2) return false

  if (!backendItems || localItems.length !== backendItems.length) {
    return true
  }

  // Build map of backend items by db ID for O(1) lookup
  const backendMap = new Map<
    string,
    NonNullable<BroadcastOrderData['order_items']>[0]
  >()
  for (const bItem of backendItems) {
    backendMap.set(bItem.id, bItem)
  }

  // Check each local item against backend
  for (const localItem of localItems) {
    if (!localItem.db_order_item_id) {
      continue // Pending item (not yet synced), skip comparison
    }

    const backendItem = backendMap.get(localItem.db_order_item_id)
    if (!backendItem) {
      return true // Item missing from backend (shouldn't happen)
    }

    // Compare critical financial fields (backend is source of truth)
    if (
      localItem.quantity !== backendItem.quantity ||
      localItem.subtotal !== backendItem.subtotal ||
      localItem.cashSubtotal !== backendItem.cash_subtotal ||
      localItem.taxAmount !== backendItem.tax_amount ||
      localItem.cashTaxAmount !== backendItem.cash_tax_amount
    ) {
      return true // Financial data differs
    }

    // Only flag kitchen_status change if backend is AHEAD of local
    // (avoids stale broadcast reverting optimistic kitchen_status)
    const localKRank =
      KITCHEN_STATUS_RANK[localItem.kitchen_status ?? 'new'] ?? 0
    const backendKRank =
      KITCHEN_STATUS_RANK[backendItem.kitchen_status ?? 'new'] ?? 0
    if (backendKRank > localKRank) return true
    if (
      localItem.item_status !== backendItem.item_status &&
      backendKRank >= localKRank
    )
      return true

    // Check modifier structure (count comparison, not deep equality)
    const localModCount =
      localItem.customizations?.modifiers?.reduce(
        (sum, group) => sum + group.options.length,
        0
      ) ?? 0
    const backendModCount = backendItem.modifiers?.length ?? 0

    if (localModCount !== backendModCount) {
      return true // Modifier count changed
    }
  }

  return false // No meaningful item-level changes detected
}

// Module-level Supabase client for backend sync
// Components register the client via setOrderStoreSupabaseClient
let _supabaseClient: SupabaseClient | null = null

export const setOrderStoreSupabaseClient = (client: SupabaseClient | null) => {
  _supabaseClient = client
}

export const getOrderStoreSupabaseClient = () => _supabaseClient

// ============================================================================
// PER-ORDER CREATION LOCK - Prevents race conditions when adding items rapidly
// ============================================================================
// Maps local order ID -> Promise that resolves to db_order_id (or null on failure)
// This ensures only ONE order creation happens even when multiple items are added simultaneously
const pendingOrderCreations: Map<string, Promise<string | null>> = new Map()

/**
 * Register an external pending order creation (e.g. from seatGuests).
 * This prevents ensureOrderCreated from creating a duplicate backend order
 * while the external creation is still in-flight.
 */
export const hasPendingOrderCreation = (localOrderId: string): boolean =>
  pendingOrderCreations.has(localOrderId)

export const registerPendingOrderCreation = (
  localOrderId: string,
  promise: Promise<string | null>
): void => {
  const wrappedPromise = promise.finally(() => {
    pendingOrderCreations.delete(localOrderId)
    orderCreationTimestamps.delete(localOrderId)
  })
  pendingOrderCreations.set(localOrderId, wrappedPromise)
  orderCreationTimestamps.set(localOrderId, Date.now())
}

// Persistent mapping from local order IDs to backend db order IDs.
// Survives the cleanup of pendingOrderCreations and prevents duplicate order
// creation after the order has been re-keyed in ordersById.
const localIdToDbOrderId = new Map<string, string>()

const LOCAL_ID_MAP_STORAGE_KEY = 'local_id_to_db_order_id'

// Post-payment sync timers per order — cancel stale timers on new split portions
const _syncTimers: Record<string, ReturnType<typeof setTimeout>> = {}

// Debounced persist for localIdToDbOrderId (secondary fallback, 200ms is fine)
let _localIdMapFlushTimer: ReturnType<typeof setTimeout> | null = null
function persistLocalIdMap (): void {
  if (_localIdMapFlushTimer) clearTimeout(_localIdMapFlushTimer)
  _localIdMapFlushTimer = setTimeout(() => {
    setSyncJSON(
      LOCAL_ID_MAP_STORAGE_KEY,
      Object.fromEntries(localIdToDbOrderId)
    )
  }, 200)
}

// Load persisted mapping on module init
try {
  const stored = getSyncJSON<Record<string, string>>(LOCAL_ID_MAP_STORAGE_KEY)
  if (stored) {
    for (const [k, v] of Object.entries(stored)) {
      localIdToDbOrderId.set(k, v)
    }
  }
} catch (e) {
  console.warn(
    '[useOrderStore] Failed to load localIdToDbOrderId from storage:',
    e
  )
}

// Resolve the canonical queue key for an order.
// After re-keying, items queued under the old local ID should chain on the
// same promise as items queued under the new db ID.
const resolveQueueKey = (orderId: string): string => {
  return localIdToDbOrderId.get(orderId) || orderId
}

const rekeyLinkedStores = (oldOrderId: string, newOrderId: string): void => {
  try {
    const { useSeatingStore } =
      require('@/stores/useSeatingStore') as typeof import('@/stores/useSeatingStore')
    useSeatingStore.getState().rekeyEntry(oldOrderId, newOrderId)
  } catch {
    /* seating store not loaded yet */
  }

  try {
    const { useTableSessionStore } =
      require('@/stores/useTableSessionStore') as typeof import('@/stores/useTableSessionStore')
    useTableSessionStore.getState().rekeyOrderId(oldOrderId, newOrderId)
  } catch {
    /* table session store not loaded yet */
  }

  try {
    useCoursingStore.getState().rekeyEntry(oldOrderId, newOrderId)
  } catch {
    /* coursing store not loaded yet */
  }
}

/** Exposed for dedup in create_order handler (offlineSyncInit). */
export const getKnownDbOrderId = (localOrderId: string): string | undefined =>
  localIdToDbOrderId.get(localOrderId)

// Track creation timestamps for deduplication
const orderCreationTimestamps: Map<string, number> = new Map()

// Time after which a stale creation promise should be cleared
const ORDER_CREATION_TIMEOUT_MS = 30000 // 30 seconds

// ============================================================================
// PER-ORDER ITEM ADDITION QUEUE - Serializes item additions to prevent race conditions
// ============================================================================
// Maps local order ID -> Promise chain for sequential item additions
// This prevents overwhelming the database with concurrent item additions and ensures
// calculate_order_totals_fast always sees all previously added items
const pendingItemAdditions: Map<string, Promise<boolean>> = new Map()
// Per-order serial chain to prevent concurrent ensureOrderCreated calls
const orderAdditionChains = new Map<string, Promise<any>>()

// Global per-order sync dedupe to prevent duplicate fetch/hydration work.
const inFlightDbOrderSyncs = new Map<string, Promise<string | null>>()
const inFlightOrderDetailSyncs = new Map<string, Promise<void>>()
const lastOrderDetailSyncAt = new Map<string, number>()
const ORDER_DETAIL_SYNC_COOLDOWN_MS = 5000

// Module-level sync operation tracking (NOT in store state to avoid Immer freezing)
// Maps itemId -> sync promise for pending backend operations
const pendingSyncOperations = new Map<string, Promise<boolean>>()

// ============================================================================
// DRAFT ORDER CLEANUP CONFIGURATION
// ============================================================================
const DRAFT_CLEANUP_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes
const DRAFT_CLEANUP_INTERVAL_MS = 15 * 60 * 1000 // 15 minutes
const ORDER_PRUNE_INTERVAL_MS = 2 * 60 * 1000 // 2 minutes
const COMPLETED_ORDER_MAX_AGE_MS = 15 * 60 * 1000 // 15 minutes
const MAX_COMPLETED_ORDERS = 10
let draftCleanupInterval: ReturnType<typeof setInterval> | null = null
let orderPruneInterval: ReturnType<typeof setInterval> | null = null

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
 * Serialized item addition queue.
 *
 * Items are chained per-order so that each addition waits for the previous
 * one to finish. This prevents race conditions where multiple items call
 * ensureOrderCreated() concurrently and the order gets re-keyed from
 * localId → dbOrderId while other additions are in-flight.
 */
const queueItemAddition = async (
  orderId: string,
  addFn: () => Promise<boolean>
): Promise<boolean> => {
  // Normalize the key so that items queued under the local ID and items
  // queued after re-key (under the db ID) share the same serial chain.
  const normalizedId = resolveQueueKey(orderId)

  // Chain this addition after any previous additions for this order
  const previousChain =
    orderAdditionChains.get(normalizedId) ?? Promise.resolve()

  const chainedPromise = previousChain.then(async () => {
    try {
      return await addFn()
    } catch (error) {
      console.error('[queueItemAddition] Error adding item:', error)
      return false
    }
  })

  // Update the chain (so next addition waits for this one)
  orderAdditionChains.set(normalizedId, chainedPromise)

  // Track for sync barrier
  pendingItemAdditions.set(normalizedId, chainedPromise)

  const result = await chainedPromise

  // Clean up chain if this was the last link
  if (orderAdditionChains.get(normalizedId) === chainedPromise) {
    orderAdditionChains.delete(normalizedId)
  }
  // Clean up pending map
  if (pendingItemAdditions.get(normalizedId) === chainedPromise) {
    pendingItemAdditions.delete(normalizedId)
  }

  return result
}

// Type for the setOrderDbId callback
type SetOrderDbIdFn = (
  localOrderId: string,
  dbOrderId: string,
  orderNumber: string,
  displayNumber: string,
  createdAt: string,
  syncVersion?: number
) => void

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
  const supabase = _supabaseClient
  const isNetworkOnline = getIsOnline()

  const selectedStore = useStoreSettingsStore.getState().selectedStore
  if (!selectedStore) {
    console.log('[ensureOrderCreated] No store selected')
    return null
  }

  // FAST PATH: Order already has db_order_id
  // Re-check from store in case it was set by another call
  const currentOrder = useOrderStore.getState().ordersById[order.id]
  if (currentOrder?.db_order_id) {
    console.log(
      `[ensureOrderCreated] Order ${order.id} already has db_order_id: ${currentOrder.db_order_id}`
    )
    return currentOrder.db_order_id
  }

  // Fallback: order may have been re-keyed from localId → dbOrderId
  if (order.db_order_id) {
    const reKeyedOrder = useOrderStore.getState().ordersById[order.db_order_id]
    if (reKeyedOrder?.db_order_id) {
      console.log(
        `[ensureOrderCreated] Order ${order.id} was re-keyed, found at ${order.db_order_id}`
      )
      return reKeyedOrder.db_order_id
    }
  }

  // Fallback: check persistent localId → dbOrderId mapping
  // This catches the case where pendingOrderCreations was already cleaned up
  // and the snapshot's db_order_id was captured before the re-key.
  const knownDbId = localIdToDbOrderId.get(order.id)
  if (knownDbId) {
    const knownOrder = useOrderStore.getState().ordersById[knownDbId]
    if (knownOrder?.db_order_id) {
      console.log(
        `[ensureOrderCreated] Order ${order.id} resolved via localIdToDbOrderId: ${knownDbId}`
      )
      return knownOrder.db_order_id
    }
  }

  // ========================================================================
  // OFFLINE MODE: Queue order creation and return special marker
  // ========================================================================
  if (!supabase || !isNetworkOnline) {
    console.log('[ensureOrderCreated] ====== OFFLINE MODE ======')
    console.log(`[ensureOrderCreated] Order ID: ${order.id}`)
    console.log(`[ensureOrderCreated] Order Type: ${order.order_type}`)
    console.log(`[ensureOrderCreated] Store: ${selectedStore?.id}`)

    // Check if we've already queued this order
    const existingQueuedOrder = pendingOrderCreations.get(order.id)
    if (existingQueuedOrder) {
      console.log(
        `[ensureOrderCreated] Already queued - returning pending_offline`
      )
      return 'pending_offline'
    }

    // RACE CONDITION FIX: Set placeholder promise BEFORE queueing to prevent duplicate queues
    // If we set this AFTER queueOperation, another concurrent call could slip through
    pendingOrderCreations.set(order.id, Promise.resolve('pending_offline'))
    // Set timestamp so online-mode ensureOrderCreated doesn't treat this as stale
    orderCreationTimestamps.set(order.id, Date.now())

    // Build the create order params for later execution
    // NOTE: Pass null (not undefined) for all optional params so Supabase RPC includes them
    const createOrderParams: CreateOrderParams = {
      p_merchant_id: selectedStore.merchant_id,
      p_location_id: selectedStore.id,
      p_order_type: (order.order_type || 'dine_in') as DbOrderType,
      p_table_number: order.service_location_id || null,
      p_customer_name: order.customer_name || null,
      p_customer_phone: order.customer_phone || null,
      p_special_instructions: null,
      p_device_id: getDeviceId(),
      p_created_by_staff_id:
        useEmployeeStore.getState().loggedInEmployee?.profileId || null,
      p_station_id: useStoreSettingsStore.getState().selectedStation?.id || null
    }

    console.log(`[ensureOrderCreated] Queueing create_order operation...`)
    console.log(
      `[ensureOrderCreated] Params:`,
      JSON.stringify(createOrderParams, null, 2)
    )

    // Queue the create_order operation
    const operationId = await queueOperation({
      type: 'create_order',
      params: {
        localOrderId: order.id,
        createOrderParams
      },
      localOrderId: order.id,
      contextSnapshot: {
        order_type: order.order_type,
        service_location_id: order.service_location_id,
        storeId: selectedStore.id,
        merchantId: selectedStore.merchant_id,
        customer_id: order.customer_id
      }
    })

    // Mark order as pending sync
    useOrderStore.setState(state => {
      const existingOrder = state.ordersById[order.id]
      if (!existingOrder) return

      existingOrder.sync_status = 'pending'
      ;(existingOrder as any)._offlineOperationId = operationId
    })

    // Register in ID registry for future lookups
    await registerLocalId(order.id, 'order')
    console.log(`[ensureOrderCreated] Registered local ID: ${order.id}`)

    console.log(`[ensureOrderCreated] ====== QUEUED SUCCESSFULLY ======`)
    console.log(`[ensureOrderCreated] Operation ID: ${operationId}`)
    console.log(`[ensureOrderCreated] Local Order ID: ${order.id}`)
    return 'pending_offline'
  }

  // ========================================================================
  // ONLINE MODE: Create order normally
  // ========================================================================

  // CHECK FOR EXISTING LOCK: Another call is already creating this order
  const existingPromise = pendingOrderCreations.get(order.id)
  if (existingPromise) {
    // Check if it's a stale promise (older than timeout)
    const creationStarted = orderCreationTimestamps.get(order.id)
    const now = Date.now()

    if (creationStarted && now - creationStarted < ORDER_CREATION_TIMEOUT_MS) {
      // Still within timeout - wait for existing promise
      console.log(
        `[ensureOrderCreated] Waiting for pending creation for order ${
          order.id
        } (${Math.round((now - creationStarted) / 1000)}s old)`
      )
      const result = await existingPromise
      // After waiting, re-check the store for the db_order_id (it should be set now)
      const updatedOrder = useOrderStore.getState().ordersById[order.id]
      return updatedOrder?.db_order_id || result
    } else {
      // Stale promise - clear it
      console.log(
        `[ensureOrderCreated] Clearing stale creation promise for order ${order.id}`
      )
      pendingOrderCreations.delete(order.id)
      orderCreationTimestamps.delete(order.id)

      // Before retrying, check if the queue already synced this order
      // (the "pending_offline" entry may be stale because processQueueNow
      // completed the create_order and cleaned up pendingOrderCreations)
      const knownDbId = localIdToDbOrderId.get(order.id)
      if (knownDbId) {
        console.log(
          `[ensureOrderCreated] Order ${order.id} already synced via queue: ${knownDbId}`
        )
        return knownDbId
      }
      // Also re-check the store (order may be rekeyed under the backend UUID)
      const freshState = useOrderStore.getState()
      const freshOrder = freshState.ordersById[order.id]
      if (freshOrder?.db_order_id) {
        return freshOrder.db_order_id || null
      }
      // Check if order was rekeyed away — look it up via dbOrderIdIndex
      if (
        order.db_order_id &&
        freshState.ordersById[order.db_order_id]?.db_order_id
      ) {
        return freshState.ordersById[order.db_order_id].db_order_id || null
      }
    }
  }

  // ACQUIRE LOCK: We are the first caller - create the order
  console.log(
    `[ensureOrderCreated] Acquiring lock and creating order ${order.id}`
  )

  // Record creation start time for timeout tracking
  orderCreationTimestamps.set(order.id, Date.now())

  const creationPromise = (async (): Promise<string | null> => {
    try {
      // Double-check in case another call snuck in
      const recheckOrder = useOrderStore.getState().ordersById[order.id]
      if (recheckOrder?.db_order_id) {
        return recheckOrder.db_order_id
      }

      // NOTE: Pass null (not undefined) for all optional params so Supabase RPC includes them
      const createOrderParams: CreateOrderParams = {
        p_merchant_id: selectedStore.merchant_id,
        p_location_id: selectedStore.id,
        p_order_type: (order.order_type || 'dine_in') as DbOrderType,
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

      console.log(
        '[ensureOrderCreated] Creating order with params:',
        JSON.stringify(createOrderParams, null, 2)
      )

      const { data: createResult, error: createError } =
        await OrderService.createOrder(supabase, createOrderParams)

      console.log('[ensureOrderCreated] createOrder Result:', createResult)

      if (createError) {
        console.error(
          '[ensureOrderCreated] Failed to create order:',
          createError
        )

        // Network error - queue for offline retry
        if (
          createError.message?.includes('network') ||
          createError.code === 'NETWORK_ERROR'
        ) {
          console.log(
            '[ensureOrderCreated] Network error - switching to offline mode'
          )

          // Queue the operation for later
          await queueOperation({
            type: 'create_order',
            params: {
              localOrderId: order.id,
              createOrderParams
            },
            localOrderId: order.id
          })

          await registerLocalId(order.id, 'order')
          return 'pending_offline'
        }

        // Non-network error — queue for offline retry instead of silently dropping
        if (!hasPendingOrderCreation(order.id)) {
          console.log('[ensureOrderCreated] Server error - queueing for retry')
          await queueOperation({
            type: 'create_order',
            params: { localOrderId: order.id, createOrderParams },
            localOrderId: order.id,
            contextSnapshot: {
              error_type: 'server_error',
              error_message: createError.message
            }
          })
          await registerLocalId(order.id, 'order')
        }
        return 'pending_offline'
      }

      if (createResult) {
        const orderData = (
          Array.isArray(createResult) ? createResult[0] : createResult
        ) as any
        const backendId = orderData.order_id || orderData.id

        if (backendId) {
          console.log(
            `[ensureOrderCreated] Order created successfully, ID: ${backendId}`
          )

          // Update the store with the new db_order_id
          setOrderDbId(
            order.id,
            backendId,
            orderData.order_number,
            orderData.display_number,
            orderData.created_at || new Date().toISOString(),
            orderData.sync_version // Pass sync_version from backend response
          )

          // Re-seed local counter to match DB-assigned sequence (prevents drift from abandoned drafts)
          const dbSeq = parseSequenceFromDisplayNumber(orderData.display_number)
          if (dbSeq > 0) {
            const stationNum =
              useStoreSettingsStore.getState().selectedStation
                ?.station_number ?? null
            forceSetLocalSequence(selectedStore.id, stationNum, dbSeq)
          }

          // Register mapping in ID registry
          await mapLocalToBackend(order.id, backendId)

          // Sync customer_id if it was set before order creation
          const latestOrder = useOrderStore.getState().ordersById[order.id]
          if (latestOrder?.customer_id && supabase) {
            try {
              await supabase
                .from('orders')
                .update({ customer_id: latestOrder.customer_id })
                .eq('id', backendId)
            } catch (e) {
              console.warn(
                '[ensureOrderCreated] Failed to sync pre-set customer_id:',
                e
              )
            }
          }

          return backendId
        } else {
          console.error(
            '[ensureOrderCreated] createOrder result invalid:',
            createResult
          )
          if (!hasPendingOrderCreation(order.id)) {
            console.log(
              '[ensureOrderCreated] Invalid response - queueing for retry'
            )
            await queueOperation({
              type: 'create_order',
              params: { localOrderId: order.id, createOrderParams },
              localOrderId: order.id,
              contextSnapshot: { error_type: 'invalid_response' }
            })
            await registerLocalId(order.id, 'order')
          }
          return 'pending_offline'
        }
      }

      console.warn(
        '[ensureOrderCreated] createOrder returned no data and no error'
      )
      if (!hasPendingOrderCreation(order.id)) {
        await queueOperation({
          type: 'create_order',
          params: { localOrderId: order.id, createOrderParams },
          localOrderId: order.id,
          contextSnapshot: { error_type: 'empty_response' }
        })
        await registerLocalId(order.id, 'order')
      }
      return 'pending_offline'
    } finally {
      // RELEASE LOCK: Always clean up, even on error
      pendingOrderCreations.delete(order.id)
      orderCreationTimestamps.delete(order.id)
      console.log(`[ensureOrderCreated] Released lock for order ${order.id}`)
    }
  })()

  // Store the promise so other calls can wait on it
  pendingOrderCreations.set(order.id, creationPromise)

  return creationPromise
}

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
    isMerge?: boolean // If true, update quantity instead of creating new item
    addedQuantity?: number // The quantity being added (for merge operations)
  }
): Promise<boolean> => {
  const { isMerge = false, addedQuantity = item.quantity } = options || {}
  const supabase = _supabaseClient
  const isNetworkOnline = getIsOnline()

  // Resolve the current key for this order in ordersById.
  // After re-key, order.id (local ID) no longer exists — use db_order_id instead.
  let _knownDbOrderId: string | null = null
  const resolveOrderKey = (): string => {
    const state = useOrderStore.getState()
    if (state.ordersById[order.id]) return order.id
    if (order.db_order_id && state.ordersById[order.db_order_id])
      return order.db_order_id
    // After ensureOrderCreated, dbOrderId is known but snapshot may not have it
    if (_knownDbOrderId && state.ordersById[_knownDbOrderId])
      return _knownDbOrderId
    return order.id // fallback
  }

  const selectedStore = useStoreSettingsStore.getState().selectedStore
  if (!selectedStore) {
    if (__DEV__) console.log('Backend sync skipped: No store selected')
    return true
  }

  // If item is draft (missing required fields), skip sync
  if (item.isDraft) {
    if (__DEV__) console.log('Backend sync skipped: Item is draft')
    return true
  }

  // ========================================================================
  // OFFLINE MODE: Ensure order is queued first, then queue item
  // ========================================================================
  if (!supabase || !isNetworkOnline) {
    if (__DEV__)
      console.log('[addItemToBackend] OFFLINE MODE - Processing item:', item.id)

    // CRITICAL: First ensure the order creation is queued
    // This must happen BEFORE queueing the item
    const orderResult = await ensureOrderCreated(order, setOrderDbId)
    if (__DEV__)
      console.log(
        `[addItemToBackend] OFFLINE - ensureOrderCreated returned: ${orderResult}`
      )

    // Register item in ID registry for tracking
    await registerLocalId(item.id, 'item', order.id)

    // Queue appropriate operation based on merge status
    if (__DEV__) console.log('[addItemToBackend] item 1', item)
    const dependsOnCreateOrder =
      getOrderCreationOperationId(order.id) || undefined

    let itemOpId: string
    if (isMerge && item.db_order_item_id) {
      // MERGE CASE: Queue quantity update operation
      if (__DEV__)
        console.log(
          `[addItemToBackend] OFFLINE MERGE - Queueing quantity update for: ${item.db_order_item_id}`
        )
      itemOpId = await queueOperation({
        type: 'update_item_quantity',
        params: {
          localOrderId: order.id,
          localItemId: item.id,
          orderItemId: item.db_order_item_id, // Backend UUID for resolved items
          quantity: item.quantity // New total quantity
        },
        localOrderId: order.id,
        localItemId: item.id,
        contextSnapshot: {
          orderType: order.order_type,
          course: useCoursingStore.getState().getWorkingCourse(order.id) || 1
        }
      })
    } else {
      // NEW ITEM CASE: Queue add_item operation
      itemOpId = await queueOperation({
        type: 'add_item',
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
            open_item_price: item.open_item_price
          }
        },
        localOrderId: order.id,
        localItemId: item.id,
        dependsOn: dependsOnCreateOrder,
        contextSnapshot: {
          orderType: order.order_type,
          course: useCoursingStore.getState().getWorkingCourse(order.id) || 1
        }
      })
    }

    if (__DEV__)
      console.log(
        `[addItemToBackend] OFFLINE - Item queued: ${item.id} (op: ${itemOpId})`
      )

    // Mark item as pending sync in store
    useOrderStore.setState(state => {
      const orderKey = resolveOrderKey()
      const currentOrder = state.ordersById[orderKey]
      if (!currentOrder) return

      currentOrder.items = currentOrder.items.map(i =>
        i.id === item.id ? { ...i, sync_status: 'pending' as const } : i
      )
    })

    return true // Return true so item stays in cart
  }

  if (__DEV__)
    console.log('[addItemToBackend] ONLINE MODE - Syncing item:', item.id)

  try {
    // ========================================================================
    // STEP 1: Ensure order exists in backend (with race condition protection)
    // ========================================================================
    // This uses a per-order lock to prevent multiple simultaneous order creations
    const dbOrderId = await ensureOrderCreated(order, setOrderDbId)

    // Capture dbOrderId so resolveOrderKey can find re-keyed orders
    if (dbOrderId && dbOrderId !== 'pending_offline') {
      _knownDbOrderId = dbOrderId
    }

    // ========================================================================
    // HANDLE OFFLINE MODE RESULT FROM ensureOrderCreated
    // ========================================================================
    if (dbOrderId === 'pending_offline') {
      if (__DEV__)
        console.log(
          '[addItemToBackend] Order is pending offline sync, queueing item'
        )

      // Register item in ID registry
      await registerLocalId(item.id, 'item', order.id)

      // Queue the add_item operation (will be processed after order syncs)
      if (__DEV__) console.log('[addItemToBackend] item 2', item)
      const dependsOnCreateOrder =
        getOrderCreationOperationId(order.id) || undefined

      await queueOperation({
        type: 'add_item',
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
            category_name: item.category_name
          }
        },
        localOrderId: order.id,
        localItemId: item.id,
        dependsOn: dependsOnCreateOrder
      })
      // Mark item as pending sync
      useOrderStore.setState(state => {
        const orderKey = resolveOrderKey()
        const currentOrder = state.ordersById[orderKey]
        if (!currentOrder) return

        currentOrder.items = currentOrder.items.map(i =>
          i.id === item.id ? { ...i, sync_status: 'pending' as const } : i
        )
      })

      return true // Item is saved locally and queued for sync
    }

    // If order creation failed completely (not just offline), queue both order + item as safety net
    if (!dbOrderId) {
      console.error(
        '[addItemToBackend] Order creation failed for order:',
        order.id,
        '— queueing create_order + add_item for offline retry'
      )

      // Ensure create_order is queued so add_item's dependency can be satisfied
      if (
        !hasPendingOrderCreation(order.id) &&
        !pendingOrderCreations.has(order.id)
      ) {
        await queueOperation({
          type: 'create_order',
          params: { localOrderId: order.id },
          localOrderId: order.id,
          contextSnapshot: { error_type: 'fallback_from_addItemToBackend' }
        })
        await registerLocalId(order.id, 'order')
      }

      // Register item and queue add_item with full item data
      await registerLocalId(item.id, 'item', order.id)
      const dependsOnCreateOrder =
        getOrderCreationOperationId(order.id) || undefined
      await queueOperation({
        type: 'add_item',
        params: {
          localOrderId: order.id,
          localItemId: item.id,
          itemData: {
            menuItemId: item.menuItemId,
            locationExclusiveItemId: item.locationExclusiveItemId,
            name: item.name,
            quantity: item.quantity,
            price: item.baseCardPrice ?? item.price,
            unitPrice: item.baseCardPrice ?? item.price,
            cashPrice: item.baseCashPrice,
            originalPrice: item.originalPrice,
            customizations: item.customizations,
            category_name: item.category_name,
            is_open_item: item.is_open_item || false,
            open_item_name: item.open_item_name,
            open_item_price: item.open_item_price
          }
        },
        localOrderId: order.id,
        localItemId: item.id,
        dependsOn: dependsOnCreateOrder
      })

      // Mark item as pending (not failed) so it stays in cart
      useOrderStore.setState(state => {
        const orderKey = resolveOrderKey()
        const currentOrder = state.ordersById[orderKey]
        if (!currentOrder) return

        currentOrder.items = currentOrder.items.map(i =>
          i.id === item.id ? { ...i, sync_status: 'pending' as const } : i
        )
      })

      return true // Item stays in cart, queued for offline sync
    }

    if (__DEV__)
      console.log(
        `[addItemToBackend] Order ${order.id} has db_order_id: ${dbOrderId}`
      )

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
        p_seat_number: (() => {
          try {
            const { useSeatingStore } =
              require('@/stores/useSeatingStore') as typeof import('@/stores/useSeatingStore')
            return (
              useSeatingStore.getState().getActiveSeat(order.id) ?? undefined
            )
          } catch {
            return undefined
          }
        })(),
        // Wave 1.2: server-side station ownership guard.
        p_station_id:
          useStoreSettingsStore.getState().selectedStation?.id ?? null
      }

      if (__DEV__)
        console.log(
          '[addItemToBackend] add_open_item_v2 params:',
          JSON.stringify(addOpenParams, null, 2)
        )
      const { data: addResult, error: addError } =
        await OrderService.addOpenItem(supabase, addOpenParams, {
          // Wave 2.7: stable per-tap key. Same item.id across retries → same
          // server-side idempotency key → at most one insert per tap.
          keyOverride: toIdempotencyKey(item.id)
        })

      // Lever 2: server rejected because another station owns the order.
      // Don't silent-queue — retries will keep failing. Surface and stop.
      if (_isOwnershipError(addResult, addError)) {
        useSyncStatusStore
          .getState()
          .setSyncStatus(item.id, 'failed', 'Owned by another station')
        toastService.show({
          title: 'Edit blocked',
          message:
            'This order moved to another station. Take over to continue.',
          type: 'warning'
        })
        return false
      }

      if (addError) {
        // PR D.5: surface the error message into syncStatus so the cart row
        // (BillItem → FailedItemRow) can show what failed when retries
        // exhaust. The queue + idempotency-key replay still handle the
        // transient case transparently; only after MAX_RETRY_ATTEMPTS does
        // the status escalate from 'pending' to 'failed'.
        if (__DEV__) console.log('[addItemToBackend] open item sync error → queue + surface:', addError)
        useSyncStatusStore
          .getState()
          .setSyncStatus(item.id, 'pending', (addError as any)?.message)
        // Wave 2.8a: link to in-flight create_order so updateBlockedOperations
        // treats this as 'blocked' (not 'pending') until the order is synced.
        // Prevents retry budget burn when order_id can't yet be resolved.
        const dependsOnCreateOrder =
          getOrderCreationOperationId(order.id) || undefined
        await queueOperation({
          type: 'add_item',
          params: {
            localOrderId: order.id,
            localItemId: item.id,
            dbOrderId: dbOrderId,
            addItemParams: addOpenParams,
            is_open_item: true
          },
          localOrderId: order.id,
          localItemId: item.id,
          dependsOn: dependsOnCreateOrder
        })
        return false
      }

      if (__DEV__)
        console.log('Open item synced to backend successfully:', addResult)

      if (addResult?.order_item_id) {
        useOrderStore.setState(state => {
          const orderKey = resolveOrderKey()
          const currentOrder = state.ordersById[orderKey]
          if (!currentOrder) return

          // Remove any backend copy (same db_order_item_id, different local ID)
          // that syncOrderFromBackendComplete may have inserted before this setState ran,
          // causing a duplicate where one item shows "sent" and one shows "not sent".
          currentOrder.items = currentOrder.items
            .filter(
              i =>
                i.id === item.id ||
                i.db_order_item_id !== addResult.order_item_id
            )
            .map(i =>
              i.id === item.id
                ? {
                    ...i,
                    db_order_item_id: addResult.order_item_id
                  }
                : i
            )
        })

        // Persist custom modifiers (open items) to backend — add_open_item_v2 doesn't
        // accept modifiers, so we save them via replace_order_item_modifiers_v2 now.
        const openItemModifiers = item.customizations?.modifiers
        if (openItemModifiers && openItemModifiers.length > 0) {
          const modifierPayload = openItemModifiers.flatMap(group =>
            group.options.map(opt => ({
              modifier_group_id: null,
              modifier_item_id: null,
              modifier_group_name: group.categoryName,
              modifier_name: opt.name,
              price_modifier: opt.price ?? 0,
              quantity: 1,
              is_no: false
            }))
          )
          try {
            // rpc-discipline-allow: inline-wrapped Category A — replace_order_item_modifiers_v2 with retry safety
            const { error: modError } = await runWithDeadline(
              'replace_modifiers_inline',
              DEADLINES.hotMutation,
              async (signal) =>
                await supabase
                  .rpc('replace_order_item_modifiers_v2', {
                    p_order_item_id: addResult.order_item_id,
                    p_modifiers: modifierPayload
                  })
                  .abortSignal(signal)
            )
            if (modError) throw modError
            if (__DEV__)
              console.log(
                '[addItemToBackend] Custom open-item modifiers saved:',
                modifierPayload.length
              )
          } catch (modErr) {
            console.warn(
              '[addItemToBackend] Failed to save open-item modifiers:',
              modErr
            )
          }
        }

        // Phase 7D: Set sync status in dedicated store (not on item)
        useSyncStatusStore.getState().setSyncStatus(item.id, 'synced')

        // Invalidate calculation cache after item sync
        invalidateCalculationCache()

        // Apply any queued backend updates now that local sync is complete
        useOrderStore.getState().applyQueuedUpdates(resolveOrderKey())

        // Retroactively send to kitchen if item was fired during sync.
        // Only send when this is the LAST item to finish — all items together
        // in one batch produces a single KDS ticket instead of one per item.
        const postSyncOrder =
          useOrderStore.getState().ordersById[resolveOrderKey()]
        const postSyncItem = postSyncOrder?.items.find(i => i.id === item.id)
        const kitchenSentStatus = getKitchenSentStatus()
        const hasPendingSiblings = useOrderStore
          .getState()
          .hasPendingSyncs(resolveOrderKey())
        if (
          postSyncItem?.kitchen_status === kitchenSentStatus &&
          addResult.order_item_id &&
          !hasPendingSiblings
        ) {
          // Reconcile quantity before kitchen send (same as regular item path)
          const localQuantity = postSyncItem.quantity
          const syncedQuantity = item.quantity
          if (localQuantity !== syncedQuantity) {
            try {
              await OrderService.updateOrderItemQuantity(
                supabase,
                addResult.order_item_id,
                localQuantity,
                {
                  keyOverride: toUpdateQuantityKey(
                    addResult.order_item_id,
                    localQuantity
                  )
                }
              )
            } catch (err) {
              console.warn(
                '[addItemToBackend] Open item quantity reconciliation failed:',
                err
              )
            }
          }

          // Collect ALL fired items for this order (not just this one)
          const allDbItemIds = (postSyncOrder?.items ?? [])
            .filter(
              i => i.kitchen_status === kitchenSentStatus && i.db_order_item_id
            )
            .map(i => i.db_order_item_id!)
          console.log(
            `[addItemToBackend] Last item synced, batch-sending ${allDbItemIds.length} items to kitchen`
          )
          try {
            // Update order status first (draft → sent_to_kitchen) before setting
            // item statuses — the DB constraint rejects sent_to_kitchen_at on draft orders.
            if (dbOrderId) {
              const { error: statusError } =
                await OrderService.updateOrderStatus(
                  supabase,
                  dbOrderId,
                  getOrderSentStatus()
                )
              if (
                statusError &&
                statusError.code !== 'P0001' &&
                !statusError.message?.includes('already in')
              ) {
                console.warn(
                  '[addItemToBackend] Failed to update order status before retroactive kitchen send:',
                  statusError
                )
                queueFailedOperation(
                  'send_to_kitchen',
                  { localOrderId: resolveOrderKey(), localItemIds: [item.id] },
                  resolveOrderKey()
                )
                return true
              }

              const { data: backendOrder, error: verifyError } = await supabase
                .from('orders')
                .select('status')
                .eq('id', dbOrderId)
                .single()

              if (verifyError || backendOrder?.status === 'draft') {
                console.warn(
                  '[addItemToBackend] Backend order remained draft after status update; deferring retroactive kitchen send',
                  {
                    dbOrderId,
                    verifyError,
                    backendStatus: backendOrder?.status
                  }
                )
                queueFailedOperation(
                  'send_to_kitchen',
                  { localOrderId: resolveOrderKey(), localItemIds: [item.id] },
                  resolveOrderKey()
                )
                return true
              }
            }
            await OrderService.bulkUpdateOrderItemStatus(
              supabase,
              allDbItemIds,
              kitchenSentStatus
            )
          } catch (err) {
            console.warn(
              '[addItemToBackend] Retroactive kitchen send failed, queuing send_to_kitchen:',
              err
            )
            queueFailedOperation(
              'send_to_kitchen',
              { localOrderId: resolveOrderKey(), localItemIds: [item.id] },
              resolveOrderKey()
            )
          }
        }
      }

      if (onSyncComplete) {
        onSyncComplete(resolveOrderKey())
      }

      return true
    }

    // ========================================================================
    // Regular menu item path
    // ========================================================================

    // ========================================================================
    // MERGE CASE: Item already exists in backend, just update quantity
    // ========================================================================
    // Re-read item from store to get latest db_order_item_id.
    // When items are added rapidly, the snapshot's db_order_item_id may still
    // be null while a previous sync in the queue has already set it.
    const orderKey = resolveOrderKey()
    const freshOrder = useOrderStore.getState().ordersById[orderKey]
    const freshItem = freshOrder?.items.find(i => i.id === item.id)
    const currentDbOrderItemId =
      freshItem?.db_order_item_id || item.db_order_item_id

    if (isMerge && currentDbOrderItemId) {
      if (__DEV__)
        console.log(
          `[addItemToBackend] MERGE MODE - Updating quantity for db_order_item_id: ${currentDbOrderItemId}`
        )
      if (__DEV__)
        console.log(`[addItemToBackend] New total quantity: ${item.quantity}`)

      const { data: updateResult, error: updateError } =
        await OrderService.updateOrderItemQuantity(
          supabase,
          currentDbOrderItemId,
          item.quantity, // The new total quantity after merge
          {
            keyOverride: toUpdateQuantityKey(currentDbOrderItemId, item.quantity)
          }
        )

      // Lever 2: server rejected because another station owns the order.
      if (_isOwnershipError(updateResult, updateError)) {
        useSyncStatusStore
          .getState()
          .setSyncStatus(item.id, 'failed', 'Owned by another station')
        toastService.show({
          title: 'Edit blocked',
          message:
            'This order moved to another station. Take over to continue.',
          type: 'warning'
        })
        return false
      }

      if (updateError) {
        // PR D.5: surface the error message; retry loop still runs.
        if (__DEV__) console.log('[addItemToBackend] qty update sync error → queue + surface:', updateError)
        useSyncStatusStore
          .getState()
          .setSyncStatus(item.id, 'pending', (updateError as any)?.message)
        await queueOperation({
          type: 'update_item_quantity',
          params: {
            localOrderId: order.id,
            localItemId: item.id,
            orderItemId: currentDbOrderItemId, // Backend UUID for resolved items
            quantity: item.quantity
          },
          localOrderId: order.id,
          localItemId: item.id
        })
        return false
      }

      if (__DEV__)
        console.log(
          'Item quantity updated in backend successfully:',
          updateResult
        )

      // Phase 7D: Set sync status in dedicated store (not on item)
      // No need to update ordersById here - quantity is already correct
      useSyncStatusStore.getState().setSyncStatus(item.id, 'synced')

      // Invalidate calculation cache after item quantity update
      invalidateCalculationCache()

      // Apply any queued backend updates now that local sync is complete
      useOrderStore.getState().applyQueuedUpdates(order.id)

      if (onSyncComplete) {
        onSyncComplete(order.id)
      }

      return true
    }

    // ========================================================================
    // NEW ITEM CASE: Add new item to backend
    // ========================================================================

    // Calculate effective cash price (base cash price + modifiers + add-ons)
    const effectiveCashPrice = calculateItemEffectiveCashPrice(item)

    // Card price is the effective price per unit (already includes modifiers)
    const cardUnitPrice = item.price
    if (__DEV__) console.log('[addItemToBackend] item 3', item)
    if (__DEV__)
      console.log(
        '[addItemToBackend] effectiveCashPrice (base + modifiers):',
        effectiveCashPrice
      )
    if (__DEV__)
      console.log(
        '[addItemToBackend] item.originalPrice (base only):',
        item.originalPrice
      )
    if (__DEV__)
      console.log(
        '[addItemToBackend] item.cashPrice (base only):',
        item.cashPrice
      )

    if (
      __DEV__ &&
      (item.baseCashPrice == null || item.baseCardPrice == null)
    ) {
      console.warn(
        '[addItemToBackend] CartItem missing base prices — adder bug.',
        {
          itemId: item.id,
          menuItemId: item.menuItemId,
          name: item.name,
          baseCardPrice: item.baseCardPrice,
          baseCashPrice: item.baseCashPrice,
        },
      )
    }

    const { p_unit_price, p_cash_unit_price } = resolveBackendPrices(item)

    const addItemParams: AddOrderItemParams = {
      p_order_id: dbOrderId,
      p_menu_item_id: item.menuItemId || undefined,
      p_location_exclusive_item_id: item.locationExclusiveItemId || undefined,
      p_quantity: item.quantity,

      // Item details
      p_item_name: item.name,
      p_category_name: item.category_name || 'Uncategorized',

      // Prices (per unit, before quantity multiplication).
      // Resolved via lib/cartItemPricing.ts so the cash-side fallback chain
      // never lands on the card price (root cause of historical $0.13 drift).
      p_unit_price,
      p_cash_unit_price,

      // Size details
      p_selected_size_id: item.customizations?.size?.id || undefined,
      p_selected_size_name: item.customizations?.size?.name || undefined,
      p_size_price_modifier:
        item.customizations?.size?.priceModifier || undefined,

      // Instructions
      p_special_instructions: item.customizations?.notes || undefined,

      // Modifiers (pre-calculated prices)
      p_modifiers: item.customizations?.modifiers?.flatMap(mod =>
        mod.options.map(opt => ({
          modifier_group_id: mod.categoryId,
          modifier_item_id: opt.id,
          modifier_group_name: mod.categoryName,
          modifier_name: opt.name,
          price_modifier: opt.isNo ? 0 : opt.price,
          quantity: 1,
          is_no: opt.isNo || false
        }))
      ),

      // Kitchen/Coursing
      p_course_number:
        useCoursingStore.getState().getWorkingCourse(order.id) || 1, // Use working course or default to 1
      p_seat_number: (() => {
        try {
          const { useSeatingStore } =
            require('@/stores/useSeatingStore') as typeof import('@/stores/useSeatingStore')
          return useSeatingStore.getState().getActiveSeat(order.id) ?? undefined
        } catch {
          return undefined
        }
      })(),

      // Menu/Category context
      p_menu_id: item.addedFromMenuId || undefined,
      p_menu_name: item.addedFromMenuId
        ? useMenuStore.getState().getMenuById(item.addedFromMenuId)?.name
        : undefined,
      p_category_id: item.addedFromCategoryId || undefined,

      // Wave 1.1: server-side station ownership guard.
      p_station_id:
        useStoreSettingsStore.getState().selectedStation?.id ?? null
    }

    // console.log(
    //   "Adding item to backend with params:",
    //   JSON.stringify(addItemParams, null, 2),
    // );
    // console.log("Calling OrderService.addOrderItem now...");
    const { data: addResult, error: addError } =
      await OrderService.addOrderItem(supabase, addItemParams, {
        // Wave 2.7: stable per-tap key. Same item.id across retries → same
        // server-side idempotency key → at most one insert per tap.
        keyOverride: toIdempotencyKey(item.id)
      })

    // Lever 2: server rejected because another station owns the order.
    if (_isOwnershipError(addResult, addError)) {
      useSyncStatusStore
        .getState()
        .setSyncStatus(item.id, 'failed', 'Owned by another station')
      toastService.show({
        title: 'Edit blocked',
        message:
          'This order moved to another station. Take over to continue.',
        type: 'warning'
      })
      return false
    }

    if (addError) {
      // PR D.5: surface error message into syncStatus; retry loop still runs.
      // Item stays 'pending', queue replays on slow→fast recovery, idempotency-
      // key on v(n+1) makes replay safe; status escalates to 'failed' after
      // MAX_RETRY_ATTEMPTS.
      if (__DEV__) console.log('[addItemToBackend] add item sync error → queue + surface:', addError)
      useSyncStatusStore
        .getState()
        .setSyncStatus(item.id, 'pending', (addError as any)?.message)
      // Wave 2.8a: link to in-flight create_order so updateBlockedOperations
      // treats this as 'blocked' (not 'pending') until the order is synced.
      // Prevents retry budget burn when order_id can't yet be resolved.
      const dependsOnCreateOrder =
        getOrderCreationOperationId(order.id) || undefined
      await queueOperation({
        type: 'add_item',
        params: {
          localOrderId: order.id,
          localItemId: item.id,
          dbOrderId: dbOrderId,
          addItemParams
        },
        localOrderId: order.id,
        localItemId: item.id,
        dependsOn: dependsOnCreateOrder
      })
      return false
    }

    if (__DEV__) console.log('Item synced to backend successfully:', addResult)

    // Store the backend order_item_id on the local CartItem for future updates/voids
    if (addResult?.order_item_id) {
      // Check if item was removed locally while we were syncing
      const currentState = useOrderStore.getState()
      const orderKey = resolveOrderKey()
      const currentOrder = currentState.ordersById[orderKey]
      const itemStillExists = currentOrder?.items.some(i => i.id === item.id)

      if (!itemStillExists) {
        // Item was removed locally during sync — clean up backend
        if (__DEV__)
          console.log(
            `[addItemToBackend] Item ${item.id} was removed locally during sync, removing from backend`
          )
        try {
          await OrderService.removeOrderItem(supabase, addResult.order_item_id)
        } catch (err) {
          console.error('Failed to remove orphaned backend item:', err)
          await queueOperation({
            type: 'remove_item',
            params: { orderItemId: addResult.order_item_id },
            localOrderId: order.id,
            localItemId: item.id
          })
        }
        return true // Sync completed (added then removed)
      }

      useOrderStore.setState(state => {
        const orderKey = resolveOrderKey()
        const currentOrder = state.ordersById[orderKey]
        if (!currentOrder) return

        // Remove any backend copy (same db_order_item_id, different local ID)
        // that syncOrderFromBackendComplete may have inserted before this setState ran,
        // causing a duplicate where one item shows "sent" and one shows "not sent".
        currentOrder.items = currentOrder.items
          .filter(
            i =>
              i.id === item.id || i.db_order_item_id !== addResult.order_item_id
          )
          .map(i =>
            i.id === item.id
              ? {
                  ...i,
                  db_order_item_id: addResult.order_item_id
                }
              : i
          )
      })
      // Phase 7D: Set sync status in dedicated store (not on item)
      useSyncStatusStore.getState().setSyncStatus(item.id, 'synced')

      // Invalidate calculation cache after new item added
      invalidateCalculationCache()

      // Apply any queued backend updates now that local sync is complete
      useOrderStore.getState().applyQueuedUpdates(resolveOrderKey())

      // Retroactively send to kitchen if item was fired during sync.
      // Only send when this is the LAST item to finish — all items together
      // in one batch produces a single KDS ticket instead of one per item.
      const postSyncOrder =
        useOrderStore.getState().ordersById[resolveOrderKey()]
      const postSyncItem = postSyncOrder?.items.find(i => i.id === item.id)
      const kitchenSentStatus2 = getKitchenSentStatus()
      const hasPendingSiblings2 = useOrderStore
        .getState()
        .hasPendingSyncs(resolveOrderKey())
      console.log(
        `[RetroKitchen] item=${item.id} kitchen_status=${postSyncItem?.kitchen_status} expected=${kitchenSentStatus2} hasPendingSiblings=${hasPendingSiblings2} db_id=${addResult.order_item_id}`
      )
      if (
        postSyncItem?.kitchen_status === kitchenSentStatus2 &&
        addResult.order_item_id &&
        !hasPendingSiblings2
      ) {
        // Before sending to kitchen, reconcile quantity: the user may have
        // incremented this item while it was syncing (no db_order_item_id yet),
        // so those increments were queued in offlineSyncService instead of sent
        // to the DB. The item was just created with the original quantity. We
        // must update the DB to the current local quantity NOW, before the
        // kitchen broadcast fires, so the KDS receives the correct quantity.
        const localQuantity = postSyncItem.quantity
        const syncedQuantity = item.quantity // snapshot quantity used at add time
        if (localQuantity !== syncedQuantity) {
          if (__DEV__)
            console.log(
              `[addItemToBackend] Quantity drift detected (local=${localQuantity} vs synced=${syncedQuantity}), reconciling before kitchen send`
            )
          try {
            await OrderService.updateOrderItemQuantity(
              supabase,
              addResult.order_item_id,
              localQuantity,
              {
                keyOverride: toUpdateQuantityKey(
                  addResult.order_item_id,
                  localQuantity
                )
              }
            )
          } catch (err) {
            console.warn(
              '[addItemToBackend] Quantity reconciliation failed:',
              err
            )
          }
        }

        // Collect ALL fired items for this order (not just this one)
        const allDbItemIds2 = (postSyncOrder?.items ?? [])
          .filter(
            i => i.kitchen_status === kitchenSentStatus2 && i.db_order_item_id
          )
          .map(i => i.db_order_item_id!)
        if (__DEV__)
          console.log(
            `[addItemToBackend] Last item synced, batch-sending ${allDbItemIds2.length} items to kitchen`
          )
        try {
          // Must update order status BEFORE bulk-updating item statuses.
          // The order was created as 'draft' in the backend; bulkUpdateOrderItemStatus
          // sets sent_to_kitchen_at on the order which is rejected if still draft
          // (valid_status_transitions constraint). Update order status first (idempotent).
          if (dbOrderId) {
            const { error: statusError } = await OrderService.updateOrderStatus(
              supabase,
              dbOrderId,
              getOrderSentStatus()
            )
            if (
              statusError &&
              statusError.code !== 'P0001' &&
              !statusError.message?.includes('already in')
            ) {
              console.warn(
                '[addItemToBackend] Failed to update order status before retroactive kitchen send:',
                statusError
              )
              queueFailedOperation(
                'send_to_kitchen',
                { localOrderId: resolveOrderKey(), localItemIds: [item.id] },
                resolveOrderKey()
              )
              return true
            }

            const { data: backendOrder, error: verifyError } = await supabase
              .from('orders')
              .select('status')
              .eq('id', dbOrderId)
              .single()

            if (verifyError || backendOrder?.status === 'draft') {
              console.warn(
                '[addItemToBackend] Backend order remained draft after status update; deferring retroactive kitchen send',
                {
                  dbOrderId,
                  verifyError,
                  backendStatus: backendOrder?.status
                }
              )
              queueFailedOperation(
                'send_to_kitchen',
                { localOrderId: resolveOrderKey(), localItemIds: [item.id] },
                resolveOrderKey()
              )
              return true
            }
          }
          await OrderService.bulkUpdateOrderItemStatus(
            supabase,
            allDbItemIds2,
            kitchenSentStatus2
          )
        } catch (err) {
          console.warn(
            '[addItemToBackend] Retroactive kitchen send failed, queuing send_to_kitchen:',
            err
          )
          queueFailedOperation(
            'send_to_kitchen',
            { localOrderId: resolveOrderKey(), localItemIds: [item.id] },
            resolveOrderKey()
          )
        }
      }

      if (__DEV__)
        console.log(
          `Saved db_order_item_id: ${addResult.order_item_id} for item: ${item.id}`
        )
    }

    // Trigger recalculation now that db_order_id is available
    if (onSyncComplete) {
      onSyncComplete(resolveOrderKey())
    }

    return true
  } catch (error: any) {
    // Lever 2: server rejected because another station owns the order.
    if (_isOwnershipError(null, error)) {
      useSyncStatusStore
        .getState()
        .setSyncStatus(item.id, 'failed', 'Owned by another station')
      toastService.show({
        title: 'Edit blocked',
        message:
          'This order moved to another station. Take over to continue.',
        type: 'warning'
      })
      return false
    }
    // PR D.5: surface error message; retry loop still runs.
    if (__DEV__) console.log('[addItemToBackend] caught backend sync error → queue + surface:', error)
    useSyncStatusStore
      .getState()
      .setSyncStatus(item.id, 'pending', (error as any)?.message)
    // Wave 2.8a: link to in-flight create_order so updateBlockedOperations
    // treats this as 'blocked' (not 'pending') until the order is synced.
    // Prevents retry budget burn when order_id can't yet be resolved.
    const dependsOnCreateOrder =
      getOrderCreationOperationId(order.id) || undefined
    await queueOperation({
      type: 'add_item',
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
          category_name: item.category_name
        }
      },
      localOrderId: order.id,
      localItemId: item.id,
      dependsOn: dependsOnCreateOrder
    })
    return false
  }
}

// Interface for capturing previous state for rollback on sync failure
interface PaymentRollbackState {
  order: OrderProfile
  activeOrderSubtotal: number
  activeOrderTax: number
  activeOrderTotal: number
  activeOrderDiscount: number
  activeOrderOutstandingSubtotal: number
  activeOrderOutstandingTax: number
  activeOrderOutstandingTotal: number
  activeOrderTotalCash: number
  activeOrderOutstandingCash: number
}

// Backend sync helper - processes payment using process_payment_v2
const syncPaymentToBackend = async (
  order: OrderProfile,
  paymentDetails: {
    amount: number
    method: PaymentType
    tipAmount?: number
    transactionDetails?: OrderPaymentTransactionDetails
    itemAllocations?: { itemId: string; quantity: number; amount?: number }[] // Per-item allocations with quantities
    splitCount?: number // Optional: split count for split payments
    splitPortionIndex?: number // Optional: split portion index for split payments
    localPaymentId?: string // Unique local ID for matching payment during sync
    paymentTimestamp?: string // Timestamp for fallback matching
    dejavooTransaction?: DejavooSaleTransactionResponse
    forceCardPricing?: boolean // Force card pricing for custom amount payments
  },
  rollbackState?: PaymentRollbackState // Previous state for reversion on failure
): Promise<boolean> => {
  const supabase = _supabaseClient
  if (!supabase) {
    if (__DEV__)
      console.log('Backend sync skipped: No Supabase client registered')
    return true
  }

  const selectedStore = useStoreSettingsStore.getState().selectedStore
  if (!selectedStore) {
    if (__DEV__) console.log('Backend sync skipped: No store selected')
    return true
  }

  if (__DEV__)
    console.log('[syncPaymentToBackend] paymentDetails:', paymentDetails)
  const buildTerminalResponse = (): Record<string, unknown> | null => {
    const details = paymentDetails.transactionDetails
    if (!details) return null

    // Castles: pre-built JSONB from buildCastlesTerminalResponse() — pass through directly
    if (details.castlesTransaction) {
      return details.castlesTransaction as Record<string, unknown>
    }

    const tx = details.dejavooTransaction
    const entryType = tx?.entryType ?? tx?.entryMode
    const amounts = tx?.amounts || {
      totalAmount: tx?.totalAmount,
      amount: tx?.baseAmount,
      tipAmount: tx?.tipAmount
    }

    const baseResponse = {
      terminal_type: details.terminalType || 'manual',
      authorization_code: details.authorizationCode ?? tx?.authCode,
      card_type: details.cardType ?? tx?.cardType,
      card_last_four: details.last4 ?? tx?.cardLast4,
      transaction_id: details.transactionId ?? tx?.referenceId
    }

    const extendedResponse = tx
      ? {
          reference_id: tx.referenceId,
          rrn: tx.rrn,
          pn_reference_id: tx.pnReferenceId,
          auth_code: tx.authCode,
          batch_number: tx.batchNumber,
          transaction_number: tx.transactionNumber,
          invoice_number: tx.invoiceNumber,
          transaction_type: tx.transactionType,
          serial_number: tx.serialNumber,
          entry_type: entryType,
          result_code: tx.resultCode,
          status_code: tx.statusCode,
          result_message: tx.message ?? tx.resultMessage,
          host_response_code: tx.hostResponseCode,
          host_response_message: tx.hostResponseMessage,
          amounts,
          emv_data: tx.emvData,
          dejavoo_transaction: tx
        }
      : {}

    const combined = { ...baseResponse, ...extendedResponse }
    const hasData = Object.values(combined).some(
      value => value !== undefined && value !== null && value !== ''
    )

    return hasData ? combined : null
  }
  // Resolve terminal ID for card payments
  const terminalId =
    paymentDetails.method !== 'Cash'
      ? useStoreSettingsStore.getState().selectedStation?.payment_terminal
          ?.id ?? null
      : null

  // ========================================================================
  // OFFLINE-FIRST: Queue payment for later sync if order not in DB yet
  // ========================================================================
  // TODO: ADD DEJAVOO TRANSACTION TO THE PAYMENT DETAILS OFFLINE
  if (!order.db_order_id) {
    if (__DEV__)
      console.log(
        '[syncPaymentToBackend] Order has no db_order_id, queueing payment for later sync'
      )

    const isCash = paymentDetails.method === 'Cash'
    const terminalResponse = buildTerminalResponse()

    // Build item allocations for per-item payments (convert to backend format)
    const itemAllocations =
      paymentDetails.itemAllocations?.map(alloc => ({
        order_item_id: alloc.itemId,
        quantity: alloc.quantity,
        amount: alloc.amount
      })) || null

    // Detect full-remaining payment: no item allocations, no split, no force card pricing
    const isFullRemainingPayment =
      !paymentDetails.itemAllocations?.length &&
      !paymentDetails.splitCount &&
      !paymentDetails.forceCardPricing

    // Build payment params for process_payment_v8 (will be resolved when order syncs)
    const paymentParams = {
      p_order_id: order.id, // Will be resolved to db_order_id at sync time
      p_payment_method: isCash ? 'cash' : 'card',
      p_amount: isFullRemainingPayment ? null : paymentDetails.amount,
      p_tip_amount: paymentDetails.tipAmount || 0,
      p_amount_tendered: isCash
        ? paymentDetails.transactionDetails?.amountTendered ||
          paymentDetails.amount
        : null,
      p_item_allocations: itemAllocations,
      p_terminal_response: terminalResponse,
      p_split_count: paymentDetails.splitCount || null,
      p_split_portion_index: paymentDetails.splitPortionIndex || null,
      p_force_card_pricing: paymentDetails.forceCardPricing || false,
      p_terminal_id: terminalId
    }

    // Queue unified payment operation (will execute after order syncs)
    await queueOperation({
      type: 'process_payment', // Unified payment type for process_payment_v2
      params: {
        params: paymentParams,
        localOrderId: order.id,
        localPaymentId: paymentDetails.localPaymentId, // For matching payment on sync success
        paymentTimestamp: paymentDetails.paymentTimestamp, // Fallback for matching
        terminalResponse // Pass terminal response for card payments
      },
      localOrderId: order.id
    })

    if (__DEV__)
      console.log(`[syncPaymentToBackend] Payment queued for order ${order.id}`)
    return true // Return success - payment recorded locally and queued
  }

  try {
    // Determine if this is a cash or card payment
    const isCash = paymentDetails.method === 'Cash'
    const paymentMethod = isCash ? 'cash' : 'card'
    const terminalResponse = buildTerminalResponse()

    // Build item allocations for per-item payments (convert to backend format)
    // Filter out undefined amount values to avoid JSON serialization issues
    const itemAllocationsForRpc =
      paymentDetails.itemAllocations?.map(alloc => ({
        order_item_id: alloc.itemId,
        quantity: alloc.quantity,
        ...(alloc.amount !== undefined && { amount: alloc.amount })
      })) || null

    // Call process_payment_v8 RPC directly
    if (__DEV__)
      console.log('[syncPaymentToBackend] Calling process_payment_v8:', {
        orderId: order.db_order_id,
        method: paymentMethod,
        amount: paymentDetails.amount,
        tipAmount: paymentDetails.tipAmount,
        itemAllocations: itemAllocationsForRpc,
        splitCount: paymentDetails.splitCount,
        splitPortionIndex: paymentDetails.splitPortionIndex,
        terminalResponse: terminalResponse
      })

    // Detect full-remaining payment: no item allocations, no split, no force card pricing
    const isFullRemainingPayment =
      !paymentDetails.itemAllocations?.length &&
      !paymentDetails.splitCount &&
      !paymentDetails.forceCardPricing

    // rpc-discipline-allow: Category B payment — Option C accepted scope, deferred to deeper-optimizations
    const { data, error } = await supabase.rpc('process_payment_v8', {
      p_order_id: order.db_order_id,
      p_payment_method: paymentMethod,
      p_amount: isFullRemainingPayment ? null : paymentDetails.amount,
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
      p_force_card_pricing: paymentDetails.forceCardPricing || false,
      p_terminal_id: terminalId
    })

    if (error) {
      console.error(
        '[syncPaymentToBackend] Failed to process payment in backend:',
        error
      )

      const errMessage = (error as any)?.message?.toLowerCase?.() || ''
      const isNoUnpaidItemsError =
        (error as any)?.code === 'P0001' &&
        errMessage.includes('no unpaid items remaining')

      if (isNoUnpaidItemsError) {
        console.warn(
          '[syncPaymentToBackend] No unpaid items remaining; treating as idempotent and reconciling state'
        )

        if (rollbackState) {
          const activeOrderId = useOrderStore.getState().activeOrderId
          useOrderStore.setState(state => {
            state.ordersById[order.id] = rollbackState.order
            if (order.id === activeOrderId) {
              state.activeOrderSubtotal = rollbackState.activeOrderSubtotal
              state.activeOrderTax = rollbackState.activeOrderTax
              state.activeOrderTotal = rollbackState.activeOrderTotal
              state.activeOrderDiscount = rollbackState.activeOrderDiscount
              state.activeOrderOutstandingSubtotal =
                rollbackState.activeOrderOutstandingSubtotal
              state.activeOrderOutstandingTax =
                rollbackState.activeOrderOutstandingTax
              state.activeOrderOutstandingTotal =
                rollbackState.activeOrderOutstandingTotal
              state.activeOrderTotalCash = rollbackState.activeOrderTotalCash
              state.activeOrderOutstandingCash =
                rollbackState.activeOrderOutstandingCash
            }
          })
        }

        queueMicrotask(() => {
          useOrderStore.getState().syncOrderFromBackendComplete(order.id)
        })

        toastService.show({
          title: 'Already Paid',
          message: 'Order has no unpaid items remaining.',
          type: 'warning'
        })

        return true
      }

      // ========================================================================
      // DON'T REVERT - Keep local state and queue for retry
      // ========================================================================
      // Mark the payment as pending sync using localPaymentId for matching (not array index)
      useOrderStore.setState(state => {
        const currentOrder = state.ordersById[order.id]
        if (!currentOrder) return

        const payments = currentOrder.payments || []
        // FIXED: Find payment by localPaymentId or timestamp, not by array index
        // This prevents overwriting the wrong payment when multiple payments sync concurrently
        const paymentIndex = payments.findIndex(
          (p: any) =>
            p.localId === paymentDetails.localPaymentId ||
            p.timestamp === paymentDetails.paymentTimestamp
        )

        if (paymentIndex !== -1) {
          payments[paymentIndex] = {
            ...payments[paymentIndex],
            sync_status: 'pending' as const,
            sync_error: error.message || 'Sync failed',
            sync_attempt_count:
              (payments[paymentIndex].sync_attempt_count || 0) + 1
          }
        }
      })

      // Queue for retry - build payment params for process_payment_v8
      const isCashRetry = paymentDetails.method === 'Cash'
      const terminalResponseRetry = buildTerminalResponse()
      const isFullRemainingPaymentRetry =
        !paymentDetails.itemAllocations?.length &&
        !paymentDetails.splitCount &&
        !paymentDetails.forceCardPricing

      // Build item allocations for retry
      const itemAllocationsRetry =
        paymentDetails.itemAllocations?.map(alloc => ({
          order_item_id: alloc.itemId,
          quantity: alloc.quantity,
          amount: alloc.amount
        })) || null

      const paymentParams = {
        p_order_id: order.db_order_id,
        p_payment_method: isCashRetry ? 'cash' : 'card',
        p_amount: isFullRemainingPaymentRetry ? null : paymentDetails.amount,
        p_tip_amount: paymentDetails.tipAmount || 0,
        p_amount_tendered: isCashRetry
          ? paymentDetails.transactionDetails?.amountTendered ||
            paymentDetails.amount
          : null,
        p_item_allocations: itemAllocationsRetry,
        p_terminal_response: terminalResponseRetry,
        p_split_count: paymentDetails.splitCount || null,
        p_split_portion_index: paymentDetails.splitPortionIndex || null,
        p_force_card_pricing: paymentDetails.forceCardPricing || false,
        p_terminal_id: terminalId
      }

      if (__DEV__)
        console.log(
          '[syncPaymentToBackend] Queueing payment for retry:',
          paymentParams
        )

      await queueOperation({
        type: 'process_payment',
        params: {
          params: paymentParams,
          localOrderId: order.id,
          localPaymentId: paymentDetails.localPaymentId, // For matching payment on sync success
          paymentTimestamp: paymentDetails.paymentTimestamp, // Fallback for matching
          terminalResponse: terminalResponseRetry
        },
        localOrderId: order.id
      })

      toastService.show({
        title: 'Payment Saved',
        message:
          'Payment recorded locally. Will sync when connection restores.',
        type: 'warning'
      })

      // Return true - payment is saved locally and queued for sync
      return true
    }

    // Log successful payment with full response
    if (__DEV__)
      console.log('[syncPaymentToBackend] Payment synced successfully:', data)

    // ========================================================================
    // RECONCILE LOCAL STATE WITH BACKEND RESPONSE
    // ========================================================================
    if (data?.success) {
      const activeOrderId = useOrderStore.getState().activeOrderId

      // Pre-compute fully-paid check (used both inside and outside setState)
      const isFullyPaidByAmounts =
        (data.order_amount_due != null && data.order_amount_due <= 0.01) ||
        (data.order_cash_amount_due != null &&
          data.order_cash_amount_due <= 0.01) ||
        (data.unpaid_cash_total != null && data.unpaid_cash_total <= 0.01)
      const isFullyPaid = data.order_fully_paid || isFullyPaidByAmounts

      useOrderStore.setState(state => {
        const currentOrder = state.ordersById[order.id]
        if (!currentOrder) return

        // DON'T re-increment paidQuantity here - addPaymentToOrder already did the optimistic update
        // The sync function should only update payment records, not re-apply item changes
        // This prevents the double-counting bug where paidQuantity gets incremented twice

        // Only update items if backend returns authoritative paid_quantity values (error recovery/sync)
        // This handles edge cases where optimistic update might have been wrong
        if (
          data.updated_items &&
          Array.isArray(data.updated_items) &&
          data.updated_items.length > 0
        ) {
          const backendItemMap = new Map<string, number>(
            data.updated_items.map(
              (item: { id: string; paid_quantity: number }) =>
                [item.id, item.paid_quantity] as [string, number]
            )
          )
          currentOrder.items = currentOrder.items.map(item => {
            const backendPaidQty = backendItemMap.get(
              item.db_order_item_id || ''
            )
            if (typeof backendPaidQty === 'number') {
              return { ...item, paidQuantity: backendPaidQty }
            }
            return item
          })
        }

        // Update the last payment with backend ID and sync status
        // Keep local itemsCovered (with quantities) instead of backend's items_covered (just IDs)
        const payments = currentOrder.payments || []
        if (data.payment_id && payments.length > 0) {
          const lastPaymentIndex = payments.length - 1
          currentOrder.payments = payments.map((p, i) =>
            i === lastPaymentIndex
              ? {
                  ...p,
                  id: data.payment_id,
                  db_payment_id: data.payment_id,
                  // Keep existing itemsCovered (with quantities) from optimistic update
                  // Use items_paid (per-payment quantities from v_covered_items_json) as middle-priority source
                  // Fall back to items_covered (flat UUID array) for legacy/split payments
                  itemsCovered:
                    p.itemsCovered && p.itemsCovered.length > 0
                      ? p.itemsCovered
                      : data.items_paid &&
                        Array.isArray(data.items_paid) &&
                        data.items_paid.length > 0
                      ? data.items_paid.map((ip: any) => ({
                          itemId: ip.order_item_id,
                          itemName: ip.item_name || 'Unknown Item',
                          quantity: ip.quantity_paid,
                          unitPrice: ip.unit_price,
                          subtotal: ip.subtotal
                        }))
                      : data.items_covered?.map((id: string) => {
                          const item = currentOrder.items.find(
                            i => i.db_order_item_id === id || i.id === id
                          )
                          return {
                            itemId: id,
                            itemName: item?.name || 'Unknown Item',
                            quantity: item
                              ? item.quantity - (item.refundedQuantity || 0)
                              : 1,
                            unitPrice: item?.price || 0,
                            subtotal: item
                              ? (item.price || 0) *
                                (item.quantity - (item.refundedQuantity || 0))
                              : 0
                          }
                        }) ?? [],
                  timestamp: new Date().toISOString(),
                  sync_status: 'synced' as const,
                  sync_error: undefined
                }
              : p
          )
        }

        // Backend is source of truth for payment status
        currentOrder.amount_paid = data.order_amount_paid
        currentOrder.amount_due = data.order_amount_due
        currentOrder.cash_amount_due =
          data.order_cash_amount_due ?? data.unpaid_cash_total
        currentOrder.paid_status = isFullyPaid ? 'Paid' : 'Partial'
        currentOrder.check_status = isFullyPaid
          ? 'Closed'
          : currentOrder.check_status || 'Opened'
        currentOrder.order_status =
          data.order_status || currentOrder.order_status
        currentOrder.sync_version =
          data.sync_version ?? currentOrder.sync_version

        // Update outstanding totals if this is the active order
        if (order.id === activeOrderId) {
          state.activeOrderOutstandingTotal =
            data.unpaid_card_total ?? data.order_amount_due
          state.activeOrderOutstandingCash =
            data.order_cash_amount_due ??
            data.unpaid_cash_total ??
            data.order_amount_due
        }
      })

      // Sync payment status to previous orders store so both stores stay consistent
      if (order.db_order_id) {
        usePreviousOrdersStore
          .getState()
          .patchPreviousOrder(order.db_order_id, {
            paymentStatus: isFullyPaid ? 'Paid' : 'In Progress',
            refunded: false,
            amount_paid: data.order_amount_paid,
            amount_due: data.order_amount_due
          })
      }

      // Clean up persistableOrderIds if no more unsynced data remains
      const postSyncOrder = useOrderStore.getState().ordersById[order.id]
      if (postSyncOrder) {
        const hasUnsyncedItems = postSyncOrder.items?.some(
          item => !item.db_order_item_id && !item.isDraft
        )
        const hasUnsyncedPayments = postSyncOrder.payments?.some(
          p => p.sync_status === 'pending' || (!p.db_payment_id && !p.isVoided)
        )
        if (!hasUnsyncedItems && !hasUnsyncedPayments) {
          useOrderStore.setState(state => {
            delete state.persistableOrderIds[order.id]
          })
        }
      }

      // Invalidate calculation cache after successful payment sync
      invalidateCalculationCache()

      // Apply any queued backend updates now that payment sync is complete
      useOrderStore.getState().applyQueuedUpdates(order.id)

      // Send items to kitchen if payment marked them as "sent"
      const postPaymentOrder = useOrderStore.getState().ordersById[order.id]
      if (postPaymentOrder) {
        const kitchenSentDbIds = postPaymentOrder.items
          .filter(i => i.kitchen_status === 'sent' && i.db_order_item_id)
          .map(i => i.db_order_item_id!)

        if (kitchenSentDbIds.length > 0) {
          const supabase = getOrderStoreSupabaseClient()
          if (supabase) {
            OrderService.bulkUpdateOrderItemStatus(
              supabase,
              kitchenSentDbIds,
              'sent'
            )
              .then(() => {
                if (__DEV__)
                  console.log(
                    `[syncPaymentToBackend] Sent ${kitchenSentDbIds.length} items to kitchen`
                  )
              })
              .catch(err =>
                console.error(
                  '[syncPaymentToBackend] Failed to send items to kitchen:',
                  err
                )
              )
          }
        }
      }

      // CRITICAL: Auto-close check in backend if fully paid
      // We already updated local state to "Closed" above, but we must ensure backend matches
      // otherwise "Reopen Check" RPC will fail with "Check is not closed"
      if (isFullyPaid) {
        const supabase = getOrderStoreSupabaseClient()
        const { loggedInEmployee } = useEmployeeStore.getState()
        const staffId = loggedInEmployee?.profileId

        if (supabase && staffId && order.db_order_id) {
          const dbOrderIdForQueue = order.db_order_id
          const localOrderIdForQueue = order.id
          OrderService.closeCheck(supabase, order.db_order_id, staffId)
            .then(async res => {
              if (!res.success) {
                console.error('[syncPayment] Auto-close failed:', res.error)
                // Bad-WiFi guard: deadline-wrap surfaces as success=false with
                // DEADLINE_EXCEEDED in the error message. Queue so the close
                // intent isn't lost when the network recovers.
                if (
                  typeof res.error === 'string' &&
                  res.error.includes('DEADLINE_EXCEEDED')
                ) {
                  await queueOperation({
                    type: 'close_check',
                    params: {
                      orderId: dbOrderIdForQueue,
                      staffId,
                    },
                    localOrderId: localOrderIdForQueue,
                  })
                }
              } else {
                console.log(
                  '[syncPayment] Auto-closed check successfully:',
                  order.db_order_id
                )
              }
            })
            .catch(err =>
              console.error('[syncPayment] Auto-close exception:', err)
            )
        }
      }

      // Auto-archive based on completion mode setting
      if (isFullyPaid) {
        const completionMode =
          useStoreSettingsStore.getState().orderCompletionMode
        const postPayOrder = useOrderStore.getState().ordersById[order.id]

        if (completionMode === 'auto_on_payment' && postPayOrder) {
          // Auto-complete on payment regardless of kitchen status
          queueMicrotask(() => {
            useOrderStore.getState().markAllItemsAsReady(order.id)
            useOrderStore.getState().archiveOrder(order.id)
          })
        } else if (
          completionMode === 'auto' &&
          postPayOrder?.order_status === 'ready'
        ) {
          // Auto-complete only when both paid + ready
          queueMicrotask(() => {
            useOrderStore.getState().archiveOrder(order.id)
          })
        }
        // 'manual' mode: no auto-archive (user must click Mark as Done)
      }

      if (__DEV__)
        console.log('[OrderStore] Cache invalidated after payment sync')

      // Post-payment verification: schedule a full sync to catch concurrent changes from other stations
      // Cancel any existing timer for this order (prevents stale timer from previous split portion)
      if (order.db_order_id) {
        if (_syncTimers[order.id]) {
          clearTimeout(_syncTimers[order.id])
        }
        _syncTimers[order.id] = setTimeout(() => {
          delete _syncTimers[order.id]
          useOrderStore.getState().syncOrderFromBackendComplete(order.id)
        }, 1000)
      }
    }

    return true
  } catch (error) {
    console.error('Backend payment sync error:', error)

    // REVERT OPTIMISTIC STATE ON FAILURE
    if (rollbackState) {
      if (__DEV__)
        console.log(
          '[syncPaymentToBackend] Reverting to previous state due to sync error'
        )
      const activeOrderId = useOrderStore.getState().activeOrderId

      useOrderStore.setState(state => {
        state.ordersById[order.id] = rollbackState.order
        // Revert active order totals if this was the active order
        if (order.id === activeOrderId) {
          state.activeOrderSubtotal = rollbackState.activeOrderSubtotal
          state.activeOrderTax = rollbackState.activeOrderTax
          state.activeOrderTotal = rollbackState.activeOrderTotal
          state.activeOrderDiscount = rollbackState.activeOrderDiscount
          state.activeOrderOutstandingSubtotal =
            rollbackState.activeOrderOutstandingSubtotal
          state.activeOrderOutstandingTax =
            rollbackState.activeOrderOutstandingTax
          state.activeOrderOutstandingTotal =
            rollbackState.activeOrderOutstandingTotal
          state.activeOrderTotalCash = rollbackState.activeOrderTotalCash
          state.activeOrderOutstandingCash =
            rollbackState.activeOrderOutstandingCash
        }
      })
    }

    toastService.show({
      title: 'Payment Failed',
      message: 'Failed to sync payment to server. Changes have been reverted.',
      type: 'error'
    })
    return false
  }
}

// Tax calculation is handled in calculateOrderTotals (lib/order-calculator.ts) using dynamic rate from store settings

// ============================================================================
// QUEUED UPDATE INTERFACE (Phase 3: Race Condition Prevention)
// ============================================================================
/**
 * Represents a backend update that was queued because local changes were pending.
 * These updates are applied after local changes sync to prevent race conditions.
 */
interface QueuedUpdate {
  orderId: string // Local order ID
  timestamp: number // When the update was queued
  updates: Partial<OrderProfile> // Backend fields to update
  source: 'broadcast' | 'payment_sync' | 'reconciliation' // Where the update came from
}

interface OrderState {
  // === SIMPLIFIED DATA STRUCTURE (Single index by DB UUID or temp ID) ===
  // After sync, orders are keyed by DB UUID. Temp IDs only exist during optimistic create.
  ordersById: Record<string, OrderProfile>
  orderIds: string[] // Maintains insertion order for iteration
  activeOrderId: string | null

  // === OFFLINE SYNC STATE ===
  isOnline: boolean
  pendingSyncCount: number

  // === ORDER INITIALIZATION STATE (Phase 11.3) ===
  isInitializing: boolean

  // === PAYMENT SYNC STATE ===
  // Tracks whether we're syncing payment status from backend
  paymentSyncStatus: 'idle' | 'syncing' | 'error'

  // === QUEUED BACKEND UPDATES (Phase 3: Race Condition Prevention) ===
  // Maps local orderId -> queued update (backend updates delayed while local changes pending)
  pendingBackendUpdates: Record<string, QueuedUpdate>

  // Sync barrier methods
  hasPendingSyncs: (orderId: string) => boolean
  waitForPendingSyncs: (orderId: string, opts?: { maxMs?: number }) => Promise<void>
  getSyncStatus: (orderId: string) => {
    pending: number
    failed: number
    synced: number
  }
  updateItemSyncStatus: (
    orderId: string,
    itemId: string,
    status: 'pending' | 'syncing' | 'synced' | 'failed',
    error?: string
  ) => void
  registerSyncOperation: (itemId: string, promise: Promise<boolean>) => void
  unregisterSyncOperation: (itemId: string) => void

  // --- DERIVED STATE (Totals for the ACTIVE order) ---
  // These values will be automatically updated by the store's actions.
  activeOrderSubtotal: number
  activeOrderTax: number
  activeOrderTotal: number
  activeOrderDiscount: number
  // Outstanding (unpaid) totals for the ACTIVE order
  activeOrderOutstandingSubtotal: number
  activeOrderOutstandingTax: number
  activeOrderOutstandingTotal: number
  // Cash pricing total (using cash prices + modifiers + add-ons)
  activeOrderTotalCash: number
  // Outstanding cash totals (unpaid items using cash pricing)
  activeOrderOutstandingCash: number

  // --- PENDING TABLE SELECTION ---
  pendingTableSelection: string | null // Store pending table selection

  // === STATION CONTEXT ===
  currentStationId: string | null
  currentStation: Station | null
  remoteOrdersEnabled: boolean
  isLoadingPreviousOrders: boolean
  lastReconciliationAt: string | null

  // === WORKSPACE CACHING ===
  currentLocationId: string | null
  unsyncedOrderIds: string[] // local IDs of orders without backend confirmation
  dbOrderIdIndex: Record<string, string> // maps db_order_id -> local orderId for O(1) reverse lookup
  tableOrderIdIndex: Record<string, string> // maps tableId -> current active local orderId
  persistableOrderIds: Record<string, true> // orders that need MMKV persistence (unsynced items, active, working set)

  // === WORKING SET (Phase 5) ===
  // Orders the user is actively working on - persists across restarts, clears on logout
  workingSetOrderIds: string[] // db_order_ids in working set
  _workingSetLookup: Record<string, true> // O(1) membership check mirror of workingSetOrderIds

  // --- OFFLINE SYNC ACTIONS ---
  setOnlineStatus: (isOnline: boolean) => void
  setPendingSyncCount: (count: number) => void

  // --- STATION ACTIONS ---
  setCurrentStation: (station: Station) => void

  // --- WORKING SET ACTIONS (Phase 5) ---
  addToWorkingSet: (dbOrderId: string) => void
  removeFromWorkingSet: (dbOrderId: string) => void
  clearWorkingSet: () => void
  isInWorkingSet: (dbOrderId: string) => boolean

  // --- WORKSPACE GC ---
  clearInactiveOrders: () => void

  // --- ACTIONS ---
  setActiveOrder: (orderId: string | null) => void
  /**
   * PR D.2: re-queue every offline-sync op tied to this item id and reset
   * its sync_status to 'pending'. Wired to the FailedItemRow "Retry" button.
   * Returns the count of re-queued operations (0 if nothing to retry).
   */
  retrySyncForItem: (itemId: string) => Promise<number>

  /**
   * Claim ownership of the active order from another station (Lever 2).
   * On success: optimistic local update of station_id; the realtime broadcast
   * arrives shortly with the same delta and the version-guard dedupes.
   * On failure: surfaces a typed-error toast; nothing is mutated locally.
   */
  claimActiveOrder: () => Promise<
    | { success: true }
    | {
        success: false
        error:
          | 'NO_ACTIVE_ORDER'
          | 'NO_STATION'
          | 'ORDER_NOT_FOUND'
          | 'ORDER_FINALIZED'
          | 'ORDER_LOCKED_FOR_PAYMENT'
          | 'CONCURRENT_CLAIM'
          | 'NETWORK'
      }
  >

  startNewOrder: (details?: {
    tableId?: string
    guestCount?: number
    sessionId?: string // Backend session UUID
    localSessionId?: string // Local session ID for offline
    orderId?: string // Pre-generated order ID for optimistic seating
  }) => OrderProfile
  addItemToActiveOrder: (newItem: CartItem) => void
  updateItemInActiveOrder: (updatedItem: CartItem) => void
  incrementItemQuantity: (itemId: string) => void
  updateDraftItem: (draftItemId: string, updates: Partial<CartItem>) => void
  removeDraftItem: (draftItemId: string) => void
  removeDraftItems: (menuItemId: string) => void
  applyBackendItemData: (
    itemId: string,
    backendData: {
      card_subtotal?: number
      card_tax_amount?: number
      unit_price?: number
      cash_unit_price?: number
      cash_subtotal?: number
      cash_tax_amount?: number
      quantity?: number
      discount_amount?: number
      discount_cash_amount?: number
      modifiers?: Array<{
        modifier_item_id?: string
        modifier_name: string
        modifier_group_id?: string
        modifier_group_name: string
        price_modifier: number
        quantity: number
      }>
      sync_version?: number
    }
  ) => void
  removeItemFromActiveOrder: (itemId: string, voidReason?: string) => void
  confirmDraftItem: (itemId: string) => void
  updateItemStatusInActiveOrder: (
    itemId: string,
    status: 'preparing' | 'ready' | 'served'
  ) => void
  batchUpdateItemKitchenStatus: (
    itemIds: string[],
    status: 'sent' | 'preparing' | 'ready' | 'served'
  ) => void
  setOpenedAt: (orderId: string, openedAt: string) => void
  setClosedAt: (orderId: string, closedAt: string) => void
  updateActiveOrderDetails: (details: Partial<OrderProfile>) => Promise<void>
  applyDiscountToCheck: (orderId: string, discount: Discount) => void
  removeCheckDiscount: (orderId: string) => void
  applyDiscountToItem: (orderId: string, itemId: string) => void
  removeDiscountFromItem: (orderId: string, itemId: string) => void
  assignOrderToTable: (orderId: string, tableId: string) => void
  assignActiveOrderToTable: (tableId: string) => void
  updateOrderStatus: (
    orderId: string,
    status: OrderProfile['order_status']
  ) => void
  updateOrderCheckStatus: (
    orderId: string,
    status: 'Opened' | 'Closed'
  ) => Promise<void>
  addPaymentToOrder: (details: {
    orderId: string
    amount: number
    method: PaymentType
    cardBrand?: string
    last4?: string
    tipAmount?: number
    transactionDetails?: Record<string, any>
    dejavooTransaction?: DejavooSaleTransactionResponse | undefined
    itemAllocations?: { itemId: string; quantity: number; amount?: number }[] // Optional: per-item allocations with quantities
    splitCount?: number // Optional: split count for split payments
    splitPortionIndex?: number // Optional: split portion index for split payments
    forceCardPricing?: boolean // Force card pricing for custom amount payments (no cash discount)
  }) => Promise<boolean> // Returns true if sync succeeded, false if failed (state reverted)
  setOrders: (orders: OrderProfile[]) => void

  markOrderAsPaid: (orderId: string) => void
  setPendingTableSelection: (tableId: string | null) => void
  syncOrderStatus: (orderId: string) => void

  archiveOrder: (orderId: string) => string | null // Returns the tableId if it exists
  cleanupAbandonedDrafts: () => void
  startDraftCleanup: () => void
  stopDraftCleanup: () => void
  cleanupDraftDuplicates: () => void
  markAllItemsAsReady: (orderId: string) => void
  markAllItemsAsServed: (orderId: string) => void
  // Course-specific KDS functions
  markCourseItemsAsCooking: (orderId: string, itemIds: string[]) => void
  markCourseItemsAsReady: (orderId: string, itemIds: string[]) => void
  markCourseItemsAsServed: (orderId: string, itemIds: string[]) => void
  consolidateOrdersForTables: (
    tableIds: string[],
    tableNames: string[]
  ) => string
  fireActiveOrderToKitchen: () => void
  sendNewItemsToKitchen: () => Promise<void>
  sendNewItemsToKitchenForOrder: (orderId: string) => Promise<void>
  transferOrderToTable: (orderId: string, newTableId: string) => void
  generateCartItemId: (
    menuItemId: string,
    customizations: CartItem['customizations'],
    isDraft?: boolean
  ) => string
  deleteOrder: (orderId: string) => void
  clearCart: () => void
  voidOrder: (orderId: string) => void

  // Payment void action - reverts payment and restores items to unpaid
  voidPayment: (orderId: string, paymentId: string) => Promise<boolean>
  voidAllPayments: (orderId: string) => Promise<boolean>
  // Pure local state sync after a successful terminal void via RefundService.
  // DB is already updated by RefundService; this only updates in-memory state.
  applyPaymentVoidLocally: (orderId: string, paymentId: string) => void

  // O(1) Getter for order by db_order_id
  getOrderByDbId: (dbOrderId: string) => OrderProfile | undefined

  // Phase 2.1: Universal order getter (works with local ID or DB ID)
  getOrder: (idOrDbId: string) => OrderProfile | undefined

  // === OFFLINE-FIRST HELPER METHODS ===
  // Update local order with DB order ID after successful sync
  updateOrderDbId: (localOrderId: string, dbOrderId: string) => void
  // Update local order with backend-generated data after sync (order_number, display_number, etc.)
  updateOrderFromSync: (
    localOrderId: string,
    backendData: {
      order_number?: number | string
      display_number?: string
      opened_at?: string
      total_amount?: number
      total_tax?: number
      subtotal?: number
      cash_total?: number
      cash_tax_amount?: number
      cash_subtotal?: number
    }
  ) => void
  // Update local item with DB item ID after successful sync
  updateItemDbId: (
    orderId: string,
    localItemId: string,
    dbItemId: string
  ) => void
  // Get all orders that have items with failed sync status
  getOrdersWithFailedSyncs: () => Array<{
    localId: string
    dbId: string | undefined
  }>
  // Update order from reconciliation data
  updateOrderFromReconciliation: (
    localOrderId: string,
    updates: Partial<OrderProfile>
  ) => void
  // Patch an order with partial data (Immer-safe, no O(n) spread)
  patchOrder: (orderId: string, patch: Partial<OrderProfile>) => void
  // Retry failed syncs for an order
  retryFailedSyncs: (orderId: string) => Promise<void>
  // Wave 2.8c: retry a single item's queued sync from the BillItem chip.
  // Returns a hint to the UI: 'retried' (kicked queue), 'parent_dead'
  // (route user to Failed Syncs), 'not_found' (no op anywhere).
  retrySingleItemSync: (
    orderId: string,
    itemId: string
  ) => Promise<'retried' | 'parent_dead' | 'not_found'>
  // Sync order from database (manual refresh)
  syncOrderFromDatabase: (orderId: string) => Promise<string | null>
  // Sync order from database complete ( manual refresh )
  syncOrderFromBackendComplete: (orderId: string) => Promise<void>

  // Initialize orders - fetch all active orders on login (replaces prefetchOrders)
  initializeOrders: (
    locationId: string,
    forceRefresh?: boolean
  ) => Promise<void>

  // Rekey order from temp ID to DB UUID after sync
  rekeyOrder: (tempId: string, dbUuid: string) => void
  // Sync payment status from backend (shows loading state during sync)
  syncPaymentStatus: (orderId: string) => Promise<void>
  // Link an order to a table session bidirectionally (handles online/offline)
  linkOrderToSession: (orderId: string, sessionId: string) => Promise<boolean>
  // Hydrate order from seat_guests_v3 RPC response (update existing or create shell)
  hydrateOrderFromSeat: (params: {
    localOrderId?: string
    dbOrderId: string
    sessionId: string
    orderNumber?: string
    displayNumber?: string
  }) => void

  // === NEW: Order Calculation Actions ===
  // Recalculate order totals and update state (call after any item/discount change)
  recalculateOrder: (orderId: string) => OrderTotals
  // Mark items as paid after a successful payment
  markItemsPaid: (orderId: string, allocations: ItemPaymentAllocation[]) => void
  // === QUEUED UPDATE ACTIONS (Phase 3: Race Condition Prevention) ===
  // Apply queued backend updates after local sync completes
  applyQueuedUpdates: (orderId: string) => void
  // Clean up stale queued updates (older than TTL)
  cleanupStaleQueuedUpdates: () => void

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
  _handleOrderBroadcast: (payload: OrderBroadcastPayload) => void
  // _handleItemBroadcast: (payload: OrderItemBroadcastPayload) => void;
  // _handlePaymentBroadcast: (payload: PaymentBroadcastPayload) => void;
  _debouncedOrderRefresh: (dbOrderId: string) => void
  markLocalMutation: (orderId: string) => void
  // _handleOrderReconnect: (locationId: string) => void;

  // === ORDER VISIBILITY & MANAGEMENT (Phase 5) ===
  isOrderVisible: (
    backendOrder: BroadcastOrderData,
    currentLocationId: string | undefined
  ) => boolean
  upsertOrder: (
    backendOrder: BroadcastOrderData,
    sourceStationName?: string | null
  ) => void
  removeOrder: (dbOrderId: string) => void

  // @deprecated - use isOrderVisible instead
  _shouldAcceptRemoteOrder: (
    backendOrder: BroadcastOrderData,
    currentLocationId: string | undefined
  ) => boolean

  // === FETCH & RECONCILIATION ===
  fetchVisibleOrders: (options?: {
    limit?: number
    includeCompleted?: boolean
  }) => Promise<void>
  fetchOwnStationOrders: () => Promise<void>
  reconcileOrders: () => Promise<void>
  _createLocalOrderFromServer: (serverOrder: FetchedOrderData) => void
  _cleanupStaleRemoteOrders: (locationId: string) => Promise<void>
}

// Debounced refresh helper (per-order)
const orderRefreshTimeouts: Record<string, ReturnType<typeof setTimeout>> = {}

// PERFORMANCE: Per-order broadcast throttle to prevent rapid-fire updates
// Reduced from 500ms to 50ms to minimize stale data while still preventing spam
const lastBroadcastTime: Record<string, number> = {}
const BROADCAST_THROTTLE_MS = 50 // Max 1 update per 50ms per order

// Queue-last throttle: instead of dropping throttled broadcasts, store the latest
// payload and schedule re-invocation after the throttle window expires.
const pendingThrottledBroadcast: Record<string, OrderBroadcastPayload> = {}
const throttleTimers: Record<string, ReturnType<typeof setTimeout>> = {}

// Timeout for pending-items broadcast blocking (Step 4)
// Dynamic: min 3s, max 10s, scales with pending item count
const pendingItemsBlockStart: Record<string, number> = {}
const PENDING_ITEMS_BLOCK_MIN_MS = 3000
const PENDING_ITEMS_BLOCK_MAX_MS = 10000

// Own-station mutation window: suppress _debouncedOrderRefresh from stale
// own-station broadcasts that arrive shortly after a local mutation.
// Set by addItemToActiveOrder, removeItemFromActiveOrder, etc.
const lastLocalMutationAt: Record<string, number> = {}
const OWN_STATION_MUTATION_WINDOW_MS = 3000

function getPendingItemsBlockTimeout (pendingItemCount: number): number {
  return Math.min(
    PENDING_ITEMS_BLOCK_MAX_MS,
    PENDING_ITEMS_BLOCK_MIN_MS + pendingItemCount * 500
  )
}

const createDebouncedOrderRefresh = (get: () => OrderState) => {
  return (orderId: string) => {
    // Clear existing timeout for this order
    if (orderRefreshTimeouts[orderId]) {
      clearTimeout(orderRefreshTimeouts[orderId])
    }

    orderRefreshTimeouts[orderId] = setTimeout(() => {
      const state = get()
      // syncOrderFromBackendComplete handles db_order_id → local key resolution
      state.syncOrderFromBackendComplete(orderId)
      delete orderRefreshTimeouts[orderId]
    }, 500) // 500ms debounce
  }
}

/** Merge transaction details, preserving local terminal response when broadcast is missing it */
function mergeTransactionDetails (
  local?: OrderPaymentTransactionDetails,
  broadcast?: OrderPaymentTransactionDetails
): OrderPaymentTransactionDetails | undefined {
  if (!local && !broadcast) return undefined
  if (!local) return broadcast
  if (!broadcast) return local
  return {
    ...local,
    ...broadcast,
    // Preserve full terminal responses from local if broadcast is missing them
    castlesTransaction:
      broadcast.castlesTransaction ?? local.castlesTransaction,
    dejavooTransaction: broadcast.dejavooTransaction ?? local.dejavooTransaction
  }
}

/**
 * Merges broadcast payments (with correct itemsCovered from covers_items)
 * with local payments, preserving any pending local payments that haven't
 * synced yet.
 */
function mergePayments (
  localPayments: OrderProfilePayment[],
  broadcastPayments: OrderProfilePayment[]
): OrderProfilePayment[] {
  // Payment status precedence (same as syncOrderFromBackendComplete)
  const PAYMENT_STATUS_ORDER: Record<string, number> = {
    authorized: 0,
    pending: 1,
    captured: 2,
    partially_refunded: 3,
    refunded: 4,
    voided: 4,
    void: 4
  }

  // Build local lookup by db_payment_id
  const localByDbId = new Map<string, OrderProfilePayment>()
  for (const lp of localPayments) {
    if (lp.db_payment_id) localByDbId.set(lp.db_payment_id, lp)
  }

  // Build broadcast db_payment_id set
  const broadcastDbIds = new Set(
    broadcastPayments.map(bp => bp.db_payment_id).filter(Boolean)
  )

  // For each broadcast payment, pick the version with more advanced status
  const mergedFromBroadcast = broadcastPayments.map(bp => {
    if (!bp.db_payment_id) return bp
    const lp = localByDbId.get(bp.db_payment_id)
    if (
      lp &&
      (PAYMENT_STATUS_ORDER[lp.status ?? ''] ?? -1) >
        (PAYMENT_STATUS_ORDER[bp.status ?? ''] ?? -1)
    ) {
      return lp // Local is more advanced — preserve it
    }
    // Broadcast is same or more advanced — but preserve terminal details from local
    if (lp) {
      return {
        ...bp,
        last4: bp.last4 ?? lp.last4,
        cardBrand: bp.cardBrand ?? lp.cardBrand,
        amountTendered: bp.amountTendered ?? lp.amountTendered,
        changeGiven: bp.changeGiven ?? lp.changeGiven,
        transactionDetails: mergeTransactionDetails(
          lp.transactionDetails,
          bp.transactionDetails
        )
      }
    }
    return bp
  })

  // Keep local payments NOT in broadcast
  const pendingLocal = localPayments.filter(lp => {
    if (lp.db_payment_id && broadcastDbIds.has(lp.db_payment_id)) return false

    if (lp.sync_status !== 'pending' && lp.db_payment_id) {
      const isActivePreAuth =
        lp.isPreAuth && lp.status === 'authorized' && !lp.isVoided
      const isLocalCapture = lp.status === 'captured'
      if (isActivePreAuth || isLocalCapture) return true
      return false
    }

    if (!lp.db_payment_id) {
      const hasHeuristicMatch = broadcastPayments.some(
        bp =>
          bp.amount === lp.amount &&
          bp.method === lp.method &&
          lp.timestamp &&
          bp.timestamp &&
          Math.abs(
            new Date(bp.timestamp).getTime() - new Date(lp.timestamp).getTime()
          ) < 60000
      )
      if (hasHeuristicMatch) return false
    }

    return true
  })

  return [...mergedFromBroadcast, ...pendingLocal]
}

export const useOrderStore = create<OrderState>()(
  subscribeWithSelector(
    persist(
      immer((set, get, store) => {
        // --- PRIVATE HELPER FUNCTION ---
        // This function calculates and sets the totals for the currently active order.

        // Helper function to sync order status based on item statuses
        const syncOrderStatus = (orderId: string) => {
          const { ordersById } = get()
          const order = ordersById[orderId]
          if (!order || !order.items.length) return

          // Only sync order status for orders that are assigned to tables or in kitchen workflow
          // Don't sync for orders that are still being built
          if (
            order.order_status === 'draft' ||
            order.service_location_id === null
          ) {
            return
          }

          // For dine-in orders, sync based on individual item statuses
          if (order.order_type === 'dine_in') {
            const allItemsServed = order.items.every(
              item => item.item_status === 'served'
            )
            const allItemsReady = order.items.every(
              item => item.item_status === 'ready'
            )
            const anyItemsPreparing = order.items.some(
              item => item.item_status === 'preparing'
            )

            let newOrderStatus = order.order_status
            if (allItemsServed) {
              // order_status enum has no 'served'; table/session tracks served separately
              newOrderStatus = 'ready'
            } else if (allItemsReady) {
              newOrderStatus = 'ready'
            } else if (anyItemsPreparing) {
              newOrderStatus = 'preparing'
            }

            if (newOrderStatus !== order.order_status) {
              set(state => {
                const existingOrder = state.ordersById[orderId]
                if (!existingOrder) return
                existingOrder.order_status = newOrderStatus
              })
            }
          }
          // For takeaway orders, the order status is managed manually (not based on item statuses)
        }
        // --- Helper function to generate a unique composite key for cart items ---
        // Memoized via WeakMap keyed on customizations object reference
        const compositeKeyCache = new WeakMap<
          CartItem['customizations'],
          Map<string, string>
        >()

        const _buildCompositeKey = (
          menuItemId: string,
          customizations: CartItem['customizations']
        ): string => {
          const keyParts: string[] = [menuItemId]

          // Add size information
          if (customizations.size?.id) {
            keyParts.push(`size:${customizations.size.id}`)
          }

          // Add notes
          if (customizations.notes) {
            keyParts.push(`notes:${customizations.notes.trim()}`)
          }

          // Add add-ons (sorted for consistency)
          if (customizations.addOns && customizations.addOns.length > 0) {
            const addOnIds = customizations.addOns.map(a => a.id).sort()
            keyParts.push(`addons:${addOnIds.join(',')}`)
          }

          // Add modifiers (sorted for consistency)
          if (customizations.modifiers && customizations.modifiers.length > 0) {
            const modifierKeys = customizations.modifiers
              .map(
                mod =>
                  `${mod.categoryId}:${mod.options
                    .map(opt => `${opt.id}${opt.isNo ? ':no' : ''}`)
                    .sort()
                    .join(',')}`
              )
              .sort()
            keyParts.push(`modifiers:${modifierKeys.join('|')}`)
          }

          return keyParts.join('|')
        }

        const generateItemCompositeKey = (
          menuItemId: string,
          customizations: CartItem['customizations']
        ): string => {
          let menuMap = compositeKeyCache.get(customizations)
          if (!menuMap) {
            menuMap = new Map()
            compositeKeyCache.set(customizations, menuMap)
          }
          let cached = menuMap.get(menuItemId)
          if (!cached) {
            cached = _buildCompositeKey(menuItemId, customizations)
            menuMap.set(menuItemId, cached)
          }
          return cached
        }

        const getCartItemSeatForMerge = (
          orderId: string,
          item: CartItem
        ): number | null => {
          // 1. Prefer explicit property on the item (highest reliability during addition)
          if (item.seatNumber !== undefined) {
            return item.seatNumber
          }

          try {
            const { useSeatingStore } =
              require('@/stores/useSeatingStore') as typeof import('@/stores/useSeatingStore')

            return useSeatingStore
              .getState()
              .getItemSeat(orderId, item.id, item.db_order_item_id)
          } catch {
            return null
          }
        }

        const areCartItemsMergeIdentical = (
          orderId: string,
          leftItem: CartItem,
          rightItem: CartItem
        ): boolean => {
          const leftKey = generateItemCompositeKey(
            leftItem.menuItemId,
            leftItem.customizations
          )
          const rightKey = generateItemCompositeKey(
            rightItem.menuItemId,
            rightItem.customizations
          )

          if (leftKey !== rightKey) {
            return false
          }

          return (
            getCartItemSeatForMerge(orderId, leftItem) ===
            getCartItemSeatForMerge(orderId, rightItem)
          )
        }

        // --- Helper function to generate a unique CartItem ID ---
        const generateCartItemId = (
          menuItemId: string,
          customizations: CartItem['customizations'],
          isDraft: boolean = false
        ): string => {
          const compositeKey = generateItemCompositeKey(
            menuItemId,
            customizations
          )
          const timestamp = Date.now()
          const randomSuffix = Math.random().toString(36).substr(2, 9)

          if (isDraft) {
            return `draft_${compositeKey}_${timestamp}`
          }

          return `${compositeKey}_${timestamp}_${randomSuffix}`
        }

        const isTableIndexedOrder = (
          order?: OrderProfile | null
        ): order is OrderProfile => {
          if (!order?.service_location_id) return false
          return (
            order.order_status !== 'completed' &&
            order.order_status !== 'void' &&
            order.order_status !== 'cancelled'
          )
        }

        const rebuildTableOrderIdIndex = (
          ordersById: Record<string, OrderProfile>
        ): Record<string, string> => {
          const nextIndex: Record<string, string> = {}
          for (const [orderId, order] of Object.entries(ordersById)) {
            if (isTableIndexedOrder(order) && order.service_location_id) {
              nextIndex[order.service_location_id] = orderId
            }
          }
          return nextIndex
        }

        const syncTableOrderIdIndexForOrder = (
          state: {
            tableOrderIdIndex: Record<string, string>
            ordersById: Record<string, OrderProfile>
          },
          orderId: string,
          previousOrder?: OrderProfile | null
        ) => {
          if (
            previousOrder?.service_location_id &&
            state.tableOrderIdIndex[previousOrder.service_location_id] ===
              orderId
          ) {
            delete state.tableOrderIdIndex[previousOrder.service_location_id]
          }

          const currentOrder = state.ordersById[orderId]
          if (
            isTableIndexedOrder(currentOrder) &&
            currentOrder.service_location_id
          ) {
            state.tableOrderIdIndex[currentOrder.service_location_id] = orderId
          }
        }

        return {
          // --- INITIAL STATE (SIMPLIFIED STRUCTURE) ---
          ordersById: {}, // Single index: keyed by DB UUID (or temp ID during optimistic create)
          orderIds: [],
          activeOrderId: null,
          // Offline sync state
          isOnline: true,
          pendingSyncCount: 0,
          // Order initialization state (Phase 11.3)
          isInitializing: false,
          // Queued backend updates (Phase 3: Race Condition Prevention)
          pendingBackendUpdates: {},
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

          // === WORKSPACE CACHING ===
          currentLocationId: null,
          unsyncedOrderIds: [],
          dbOrderIdIndex: {},
          tableOrderIdIndex: {},
          persistableOrderIds: {},

          // === WORKING SET (Phase 5) ===
          workingSetOrderIds: [],
          _workingSetLookup: {},

          // Payment sync status for loading UI
          paymentSyncStatus: 'idle',

          // --- OFFLINE SYNC ACTIONS ---
          setOnlineStatus: (isOnline: boolean) => set({ isOnline }),
          setPendingSyncCount: (count: number) =>
            set({ pendingSyncCount: count }),

          // --- STATION ACTIONS ---
          setCurrentStation: station => {
            console.log(
              `[OrderStore] Station context set: ${station.station_name} (${
                station.view_scope || 'own'
              })`
            )
            set({
              currentStationId: station.id,
              currentStation: station,
              remoteOrdersEnabled: station.view_scope !== 'own'
            })
          },

          // --- WORKING SET ACTIONS (Phase 5) ---
          addToWorkingSet: (dbOrderId: string) => {
            if (get()._workingSetLookup[dbOrderId]) return // O(1) duplicate check
            set(state => {
              state.workingSetOrderIds.push(dbOrderId)
              state._workingSetLookup[dbOrderId] = true
            })
            if (__DEV__) console.log(`[WorkingSet] Added order ${dbOrderId}`)
          },

          removeFromWorkingSet: (dbOrderId: string) => {
            set(state => {
              state.workingSetOrderIds = state.workingSetOrderIds.filter(
                id => id !== dbOrderId
              )
              delete state._workingSetLookup[dbOrderId]
            })
            if (__DEV__) console.log(`[WorkingSet] Removed order ${dbOrderId}`)
          },

          clearWorkingSet: () => {
            set({ workingSetOrderIds: [], _workingSetLookup: {} })
            if (__DEV__) console.log('[WorkingSet] Cleared')
          },

          isInWorkingSet: (dbOrderId: string) => {
            return !!get()._workingSetLookup[dbOrderId] // O(1) lookup
          },

          // ============================================================================
          // ORDER BROADCAST HANDLER (Phase 2: Remote Order Management)
          // ============================================================================

          _handleOrderBroadcast: (payload: OrderBroadcastPayload) => {
            const { operation, data } = payload
            const backendOrder = data.order
            const dbOrderId = backendOrder?.id

            if (__DEV__) {
              console.log('[_handleOrderBroadcast] START:', {
                operation,
                orderId: backendOrder?.id,
                status: backendOrder?.status,
                itemCount: backendOrder?.order_items?.length || 0
              })
            }

            if (!dbOrderId) {
              console.warn('[OrderBroadcast] No order ID in payload')
              return
            }

            // PERFORMANCE: Throttle broadcasts per-order to prevent rapid-fire updates
            // Queue-last: if throttled, store the latest payload and schedule re-invocation
            const now = Date.now()
            if (
              lastBroadcastTime[dbOrderId] &&
              now - lastBroadcastTime[dbOrderId] < BROADCAST_THROTTLE_MS
            ) {
              pendingThrottledBroadcast[dbOrderId] = payload
              if (!throttleTimers[dbOrderId]) {
                throttleTimers[dbOrderId] = setTimeout(() => {
                  delete throttleTimers[dbOrderId]
                  const queued = pendingThrottledBroadcast[dbOrderId]
                  delete pendingThrottledBroadcast[dbOrderId]
                  if (queued) {
                    get()._handleOrderBroadcast(queued)
                  }
                }, BROADCAST_THROTTLE_MS)
              }
              return
            }
            lastBroadcastTime[dbOrderId] = now

            const state = get()
            const { currentStationId } = state
            // O(1) order lookup via direct key or dbOrderIdIndex
            const localOrderKey = state.dbOrderIdIndex[dbOrderId] ?? dbOrderId
            const localOrder = state.ordersById[localOrderKey] ?? null
            const currentLocationId =
              useStoreSettingsStore.getState().selectedStore?.id

            // DECISION POINT 1: Is this our own station's order?
            const isOwnStationOrder =
              backendOrder.station_id === currentStationId

            // PERFORMANCE FIX: Skip broadcast processing while user has pending local changes
            // This prevents cascading re-renders during rapid item additions
            // Timeout after 15s to prevent permanent blocking if item sync fails
            // NOTE: Only block if the user is still *adding* items (kitchen_status null/'new').
            // Once all new items have been sent to kitchen, the block must not apply — the
            // backend's order status transition (draft→sent_to_kitchen) needs to propagate.
            if (isOwnStationOrder && localOrder) {
              // Use .some() for the common no-pending-items path (short-circuits, no allocation)
              const hasPendingItems = localOrder.items.some(
                item =>
                  !item.db_order_item_id &&
                  !item.isDraft &&
                  (!item.kitchen_status || item.kitchen_status === 'new')
              )
              if (hasPendingItems) {
                if (!pendingItemsBlockStart[dbOrderId]) {
                  pendingItemsBlockStart[dbOrderId] = Date.now()
                }
                // Only allocate filtered array when we need the count for timeout calc
                const pendingCount = localOrder.items.filter(
                  item =>
                    !item.db_order_item_id &&
                    !item.isDraft &&
                    (!item.kitchen_status || item.kitchen_status === 'new')
                ).length
                const dynamicTimeout = getPendingItemsBlockTimeout(pendingCount)
                if (
                  Date.now() - pendingItemsBlockStart[dbOrderId] <
                  dynamicTimeout
                ) {
                  return
                }
                // Timeout — allow broadcast through, trigger full sync to reconcile
                console.warn(
                  '[OrderBroadcast] Pending items block timed out for order:',
                  dbOrderId
                )
                delete pendingItemsBlockStart[dbOrderId]
                get()._debouncedOrderRefresh(dbOrderId)
              } else {
                delete pendingItemsBlockStart[dbOrderId]
              }
            }

            if (isOwnStationOrder || localOrder) {
              // ═══════════════════════════════════════════════════════════
              // OWN STATION ORDER - Use existing local order handling
              // ═══════════════════════════════════════════════════════════

              switch (operation) {
                case 'INSERT':
                  if (!localOrder) {
                    if (__DEV__)
                      console.log(
                        '[OrderBroadcast] Own INSERT confirmed:',
                        dbOrderId
                      )
                    // Order creation is handled by sync response, not broadcast
                  }
                  break

                case 'UPDATE':
                  if (localOrder) {
                    const localOrderId = localOrder.id

                    // Phase 7D: Check for pending local changes using db_order_item_id
                    // Items without db_order_item_id are pending (not yet synced)
                    // Also check itemSyncStatus for items whose quantity/update sync is
                    // in-flight — a stale broadcast must not overwrite their optimistic
                    // state before the RPC acknowledgement comes back.
                    const hasPendingChanges =
                      !localOrder.db_order_id || // Order not yet created in backend
                      localOrder.items.some(
                        item => !item.db_order_item_id && !item.isDraft
                      ) ||
                      localOrder.items.some(item => {
                        if (item.isDraft) return false
                        const status = useSyncStatusStore
                          .getState()
                          .itemSyncStatus.get(item.id)
                        return status === 'pending' || status === 'syncing'
                      })

                    // PERFORMANCE: Skip update if no meaningful data changed
                    // Compare key fields that actually affect UI
                    // v2 broadcasts: use item_count for length comparison instead of order_items
                    const broadcastItemCount = isHeaderOnlyBroadcast(
                      backendOrder
                    )
                      ? backendOrder.item_count
                      : backendOrder.order_items?.length
                    // v2: sync_version advance on kitchen-active orders is meaningful
                    // (KDS bumps update order_items kitchen_status + bump sync_version,
                    //  but v2 broadcasts omit items — so header fields may look identical)
                    const isKitchenSyncAdvance =
                      isHeaderOnlyBroadcast(backendOrder) &&
                      (backendOrder.sync_version ?? 0) >
                        ((localOrder as any).sync_version ?? 0) &&
                      ['sent_to_kitchen', 'preparing'].includes(
                        localOrder.order_status ?? ''
                      )

                    const noMeaningfulChange =
                      !isKitchenSyncAdvance &&
                      localOrder.amount_paid === backendOrder.amount_paid &&
                      localOrder.paid_status ===
                        mapPaymentStatus(backendOrder.payment_status) &&
                      localOrder.order_status === backendOrder.status &&
                      localOrder.total_amount === backendOrder.card_total &&
                      (localOrder.total_discount ?? 0) ===
                        (backendOrder.discount_amount ?? 0) &&
                      localOrder.check_status === backendOrder.check_status &&
                      localOrder.items.length ===
                        (broadcastItemCount ?? localOrder.items.length) &&
                      !hasItemLevelChanges(
                        localOrder.items,
                        backendOrder.order_items,
                        backendOrder._broadcast_version
                      )

                    if (noMeaningfulChange && !hasPendingChanges) {
                      // No meaningful change - skip state update to prevent re-renders
                      return
                    }

                    // ═══════════════════════════════════════════════════════════
                    // Phase 6: Conflict Detection
                    // Only run for OTHER stations' changes — own-station broadcasts
                    // are echoes of our own mutations (sync_version drift causes
                    // false positives). Broadcast merge at Phase 7+ still runs
                    // for own-station orders and updates sync_version correctly.
                    // ═══════════════════════════════════════════════════════════
                    if (!isOwnStationOrder) {
                      // B.3: Always flash the "another station updated this
                      // order" ring on remote updates, even when we suppress
                      // the toast (severity='silent'). The cashier should see
                      // *something* changed; the toast is just the noisy form.
                      useConflictStore
                        .getState()
                        .markOrderAsUpdated(localOrderId)

                      if (isOrderPendingVoid(localOrderId)) {
                        if (__DEV__)
                          console.log(
                            '[OrderBroadcast] Skipping conflict detection — order pending void:',
                            localOrderId
                          )
                        clearOrderPendingVoid(localOrderId)
                      } else {
                        const serverOrderForConflict = {
                          ...backendOrder,
                          sync_version: backendOrder.sync_version ?? 0,
                          total_amount: backendOrder.card_total,
                          total_cash_amount:
                            backendOrder.cash_total ?? undefined,
                          amount_paid: backendOrder.amount_paid,
                          order_status: backendOrder.status,
                          paid_status: mapPaymentStatus(
                            backendOrder.payment_status
                          ),
                          total_discount: backendOrder.discount_amount,
                          // v2: use local items for conflict detection (broadcast omits them)
                          items: isHeaderOnlyBroadcast(backendOrder)
                            ? localOrder.items
                            : backendOrder.order_items
                            ? transformBroadcastItems(backendOrder.order_items)
                            : [],
                          _sourceStationName: backendOrder.station_name
                        }

                        const conflict = detectConflict(
                          localOrder,
                          serverOrderForConflict as any
                        )

                        if (conflict) {
                          // Add source station info
                          conflict.sourceStationName =
                            backendOrder.station_name ?? undefined
                          conflict.sourceStationId =
                            backendOrder.station_id ?? undefined

                          if (isConflictCritical(conflict)) {
                            // Payment conflict - needs modal
                            useConflictStore
                              .getState()
                              .addPaymentConflict(conflict)
                            if (__DEV__)
                              console.log(
                                '[OrderBroadcast] Payment conflict detected:',
                                conflict.conflictType
                              )
                          } else {
                            // Non-critical - record and show toast (unless silent)
                            useConflictStore.getState().recordConflict(conflict)

                            // Skip toast for 'info' (auto-resolved minor) and
                            // 'silent' (B.4 — locally-clean order, recorded for
                            // audit only). Show for 'warning' which means the
                            // cashier had something at risk.
                            if (
                              conflict.severity !== 'info' &&
                              conflict.severity !== 'silent'
                            ) {
                              const toastData = generateConflictToast(conflict)
                              toastService.show({
                                title: 'Order Update Conflict',
                                type:
                                  toastData.type === 'error'
                                    ? 'error'
                                    : 'warning',
                                message: toastData.message,
                                duration: toastData.duration ?? 5000
                              })
                            }
                          }
                        }
                      }
                    }

                    // Version guard: skip stale broadcasts whose sync_version is older than local state
                    const broadcastVersion = backendOrder.sync_version ?? 0
                    const localVersion = (localOrder as any).sync_version ?? 0
                    if (
                      broadcastVersion > 0 &&
                      localVersion > 0 &&
                      broadcastVersion < localVersion
                    ) {
                      if (__DEV__)
                        console.log(
                          '[OrderBroadcast] Skipping stale broadcast',
                          {
                            broadcastVersion,
                            localVersion
                          }
                        )
                      return
                    }

                    // Phase 2.5: Transform fresh items from broadcast (if available)
                    // v2 broadcasts omit items — skip transform, keep local items
                    const broadcastItems = isHeaderOnlyBroadcast(backendOrder)
                      ? null
                      : backendOrder.order_items
                      ? transformBroadcastItems(backendOrder.order_items)
                      : null

                    // Track whether we preserved local discount state over a
                    // conflicting broadcast (needs to be accessible after set())
                    let localHasConfirmedDiscounts = false

                    set(state => {
                      const existingOrder = state.ordersById[localOrderId]
                      if (!existingOrder) return

                      // Never overwrite a locally-voided or pending-void order with a stale broadcast
                      if (
                        existingOrder.order_status === 'void' ||
                        isOrderPendingVoid(localOrderId)
                      )
                        return

                      // Determine if local order has discount state worth preserving.
                      // Broadcasts omit order_discounts metadata, so discount_amount=0
                      // may be stale when a confirmed discount exists locally.
                      localHasConfirmedDiscounts =
                        (existingOrder.applied_discounts?.length ?? 0) > 0 &&
                        existingOrder.checkDiscount != null

                      // Phase 2.5: Merge broadcast items with local items
                      // Strategy: Keep pending local items, update synced items from broadcast
                      let mergedItems = existingOrder.items
                      if (
                        broadcastItems &&
                        broadcastItems.length > 0 &&
                        !hasPendingChanges
                      ) {
                        // Build a map of broadcast items by db_order_item_id
                        const broadcastItemMap = new Map(
                          broadcastItems.map(item => [
                            item.db_order_item_id,
                            item
                          ])
                        )

                        // Phase 7D: Use db_order_item_id check instead of sync_status
                        // Items without db_order_item_id haven't synced to backend yet
                        // and must be preserved during broadcast merge.
                        //
                        // PR E.1 (Lever 4): drop local-only items whose sync has
                        // been 'failed' for >5s. PR D's FailedItemRow / toast has
                        // already surfaced the failure to the cashier, who's had
                        // a chance to hit Retry / Remove. Within the 5s grace
                        // window the row stays visible so the affordance remains
                        // tappable. After that, the broadcast merge converges
                        // local state to server truth instead of carrying ghosts.
                        const _syncStore = useSyncStatusStore.getState()
                        const _now = Date.now()
                        const localPendingItems = existingOrder.items.filter(
                          item => {
                            if (item.db_order_item_id && !item.isDraft) {
                              return false
                            }
                            const status = _syncStore.itemSyncStatus.get(item.id)
                            const failedAt = _syncStore.itemFailedAt.get(item.id)
                            if (
                              status === 'failed' &&
                              failedAt &&
                              _now - failedAt > 5_000
                            ) {
                              return false
                            }
                            return true
                          }
                        )

                        // Build set of db_order_item_ids present in this broadcast
                        const broadcastItemIds = new Set(
                          broadcastItems
                            .map(i => i.db_order_item_id)
                            .filter(Boolean)
                        )

                        // Use broadcast items for all synced items (they have modifiers)
                        // Preserve local item IDs for items we already have
                        const updatedSyncedItems = broadcastItems.map(
                          broadcastItem => {
                            // Find if we have a local item with this db_order_item_id
                            const localItem = existingOrder.items.find(
                              li =>
                                li.db_order_item_id ===
                                broadcastItem.db_order_item_id
                            )
                            // Phase 7D: Check db_order_item_id instead of sync_status
                            //
                            // PR E.2 (Lever 4) — semantics:
                            //   broadcast wins by default (line below spreads broadcastItem first);
                            //   local overrides are NARROW + CONDITIONAL:
                            //     * quantity → local wins only if a quantity sync is in-flight
                            //     * kitchen_status → local wins only if rank-progressive
                            //     * open-item modifiers → local preserved only when broadcast lacks them
                            //       (backend limitation: open-item modifiers aren't stored server-side)
                            //   This is the field-by-field equivalent of the plan's
                            //   `if (broadcastVersion > localVersion && !hasPendingItemSync) → broadcast wins`
                            //   short-circuit, but with finer-grained preservation for kitchen + open-items.
                            //   The version guard at the top of _handleOrderBroadcast already drops
                            //   broadcasts with sync_version < local; everything that reaches here is
                            //   "broadcast >= local", so we converge to server truth except where the
                            //   client has explicit, in-flight progress to keep.
                            if (localItem && localItem.db_order_item_id) {
                              // Preserve locally-advanced kitchen_status (optimistic update ahead of broadcast)
                              const localKRank =
                                KITCHEN_STATUS_RANK[
                                  localItem.kitchen_status ?? 'new'
                                ] ?? 0
                              const broadcastKRank =
                                KITCHEN_STATUS_RANK[
                                  broadcastItem.kitchen_status ?? 'new'
                                ] ?? 0
                              // Preserve local quantity if a quantity sync is in-flight.
                              // The broadcast may arrive before updateOrderItemQuantity
                              // completes, carrying the old quantity from the DB.
                              const hasPendingQuantitySync =
                                useSyncStatusStore
                                  .getState()
                                  .itemSyncStatus.get(localItem.id) ===
                                  'pending' ||
                                useSyncStatusStore
                                  .getState()
                                  .itemSyncStatus.get(localItem.id) ===
                                  'syncing'
                              return {
                                ...broadcastItem,
                                id: localItem.id, // Keep local ID
                                // Preserve seat assignment: broadcast wins when
                                // non-null; fall back to local for stale broadcasts
                                // where set_item_seat hasn't committed yet.
                                seatNumber:
                                  broadcastItem.seatNumber ??
                                  localItem.seatNumber ??
                                  null,
                                ...(hasPendingQuantitySync
                                  ? { quantity: localItem.quantity }
                                  : {}),
                                ...(localKRank > broadcastKRank
                                  ? {
                                      kitchen_status: localItem.kitchen_status,
                                      item_status: localItem.item_status
                                    }
                                  : {}),
                                // Preserve local open-item modifiers — backend doesn't store them
                                ...(localItem.is_open_item &&
                                localItem.customizations?.modifiers?.length &&
                                !broadcastItem.customizations?.modifiers?.length
                                  ? {
                                      customizations: {
                                        ...broadcastItem.customizations,
                                        modifiers:
                                          localItem.customizations.modifiers
                                      }
                                    }
                                  : {})
                              }
                            }
                            return broadcastItem
                          }
                        )

                        // Preserve local synced items that the broadcast doesn't know about yet.
                        // This happens when item C just got its db_order_item_id assigned locally
                        // but the broadcast was triggered by a different item's update and was
                        // fetched from the DB before C's INSERT was visible — causing C to be
                        // absent from broadcastItems and getting dropped from the bill.
                        const localSyncedNotInBroadcast =
                          existingOrder.items.filter(
                            item =>
                              item.db_order_item_id &&
                              !item.isDraft &&
                              !broadcastItemIds.has(item.db_order_item_id)
                          )

                        // Absorb local pending items into unmatched broadcast items.
                        // Race: addItemToBackend committed to DB (triggering this broadcast)
                        // but hasn't called setState() to stamp db_order_item_id locally yet.
                        // In that window the broadcast item appears in updatedSyncedItems AND
                        // the local copy appears in localPendingItems — creating a duplicate.
                        // Absorbing by unique menuItemId prevents the duplicate being written.
                        const broadcastClaimedPendingIds = new Set<string>()
                        {
                          const localPendingByKey = new Map<
                            string,
                            CartItem[]
                          >()
                          for (const pendingItem of localPendingItems) {
                            if (pendingItem.isDraft) continue
                            const key =
                              pendingItem.menuItemId || pendingItem.name
                            if (!localPendingByKey.has(key))
                              localPendingByKey.set(key, [])
                            localPendingByKey.get(key)!.push(pendingItem)
                          }

                          for (let i = 0; i < updatedSyncedItems.length; i++) {
                            const si = updatedSyncedItems[i]
                            if (!si.db_order_item_id) continue
                            // Skip items already matched by db_order_item_id above
                            const alreadyMatched = existingOrder.items.some(
                              li =>
                                li.db_order_item_id === si.db_order_item_id &&
                                li.db_order_item_id
                            )
                            if (alreadyMatched) continue

                            const key = si.menuItemId || si.name
                            const candidates = (
                              localPendingByKey.get(key) ?? []
                            ).filter(c => !broadcastClaimedPendingIds.has(c.id))
                            // Only absorb when unambiguous (exactly one pending candidate)
                            if (candidates.length !== 1) continue

                            const pendingItem = candidates[0]
                            broadcastClaimedPendingIds.add(pendingItem.id)

                            // Absorb: preserve local ID + locally-advanced kitchen_status
                            const localKRank =
                              KITCHEN_STATUS_RANK[
                                pendingItem.kitchen_status ?? 'new'
                              ] ?? 0
                            const broadcastKRank =
                              KITCHEN_STATUS_RANK[si.kitchen_status ?? 'new'] ??
                              0
                            updatedSyncedItems[i] = {
                              ...si,
                              id: pendingItem.id,
                              // Preserve seat from broadcast if set, else from
                              // local pending item (may not have synced yet).
                              seatNumber:
                                si.seatNumber ?? pendingItem.seatNumber ?? null,
                              ...(localKRank > broadcastKRank
                                ? {
                                    kitchen_status: pendingItem.kitchen_status,
                                    item_status: pendingItem.item_status
                                  }
                                : {}),
                              // Preserve local open-item modifiers — backend doesn't store them
                              ...(pendingItem.is_open_item &&
                              pendingItem.customizations?.modifiers?.length &&
                              !si.customizations?.modifiers?.length
                                ? {
                                    customizations: {
                                      ...si.customizations,
                                      modifiers:
                                        pendingItem.customizations.modifiers
                                    }
                                  }
                                : {})
                            }
                          }
                        }

                        // Drop items that the user has just removed/voided locally.
                        // The removal RPC is fire-and-forget; a broadcast fetched before
                        // the RPC commits still lists the item and would cause it to
                        // visually reappear until the next broadcast.
                        const filteredSyncedItems = updatedSyncedItems.filter(
                          item =>
                            !item.db_order_item_id ||
                            !isItemPendingRemoval(item.db_order_item_id)
                        )

                        // Combine: filtered synced items + local pending (excluding absorbed) + locally-synced-but-not-yet-in-broadcast
                        mergedItems = [
                          ...filteredSyncedItems,
                          ...localPendingItems.filter(
                            item => !broadcastClaimedPendingIds.has(item.id)
                          ),
                          ...localSyncedNotInBroadcast
                        ]

                        // Preserve local item ordering — broadcasts may return
                        // items in a different order than the user added them.
                        // Items not in the local order (new from broadcast) sort
                        // to the end.
                        const localIdOrder = new Map(
                          existingOrder.items.map((item, idx) => [item.id, idx])
                        )
                        mergedItems.sort((a, b) => {
                          const aIdx =
                            localIdOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER
                          const bIdx =
                            localIdOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER
                          return aIdx - bIdx
                        })
                      }

                      // Detect locally-advanced payment state to avoid stale broadcast reverting paid_status
                      // Refund transitions bypass rank check — both Paid→Refunded and
                      // Refunded→Paid must be accepted to reflect the full lifecycle.
                      const PAID_STATUS_RANK: Record<string, number> = {
                        Unpaid: 0,
                        Pending: 0,
                        Partial: 1,
                        Paid: 2
                      }
                      const broadcastPaidStatus = mapPaymentStatus(
                        backendOrder.payment_status
                      )
                      const localPaidRank =
                        PAID_STATUS_RANK[existingOrder.paid_status ?? ''] ?? -1
                      const broadcastPaidRank =
                        PAID_STATUS_RANK[broadcastPaidStatus] ?? -1
                      const isRefundTransition =
                        broadcastPaidStatus === 'Refunded' ||
                        existingOrder.paid_status === 'Refunded'
                      const isPaymentLocallyAhead =
                        !isRefundTransition && localPaidRank > broadcastPaidRank

                      // Build updated order
                      const updatedOrder: OrderProfile = {
                        ...existingOrder,

                        // Guard discount metadata: never clear locally-confirmed
                        // discounts from a broadcast header alone — broadcasts omit
                        // order_discounts metadata, so discount_amount=0 may be stale.
                        ...(backendOrder.discount_amount === 0 &&
                        !hasPendingChanges
                          ? localHasConfirmedDiscounts
                            ? {} // Preserve local — verification sync queued below
                            : { checkDiscount: null, applied_discounts: [] }
                          : {}),
                        // Preserve total_discount when local has confirmed discounts
                        // and broadcast shows 0 (likely stale).
                        total_discount:
                          backendOrder.discount_amount === 0 &&
                          localHasConfirmedDiscounts
                            ? existingOrder.total_discount
                            : backendOrder.discount_amount,

                        // Only update payment totals when broadcast is not stale
                        ...(isPaymentLocallyAhead
                          ? { cash_amount_due: backendOrder.cash_amount_due }
                          : {
                              amount_paid: backendOrder.amount_paid,
                              amount_due: backendOrder.amount_due,
                              cash_amount_due: backendOrder.cash_amount_due,
                              paid_status: mapPaymentStatus(
                                backendOrder.payment_status
                              )
                            }),

                        // Update payments from broadcast if available (preserves itemsCovered/covers_items)
                        ...(backendOrder.order_payments &&
                        backendOrder.order_payments.length > 0
                          ? {
                              payments: mergePayments(
                                existingOrder.payments || [],
                                transformBroadcastPaymentsToProfile(
                                  backendOrder.order_payments,
                                  backendOrder.order_items,
                                  backendOrder.payment_items,
                                  backendOrder.card_total ||
                                    backendOrder.total_amount,
                                  backendOrder.cash_total
                                )
                              )
                            }
                          : !existingOrder.payments
                          ? { payments: [] }
                          : {}),

                        // Update items with merged data (Phase 2.5)
                        items: mergedItems,

                        // UPDATE sync_version from broadcast to prevent false conflict detection
                        sync_version:
                          backendOrder.sync_version ??
                          existingOrder.sync_version ??
                          0,

                        // Don't let broadcast revert a locally-advanced order status
                        // (e.g. sent_to_kitchen/preparing reverted to draft by stale item-trigger broadcast)
                        // or revert locally-advanced payment state
                        ...(() => {
                          const STATUS_RANK: Record<string, number> = {
                            draft: 0,
                            sent_to_kitchen: 1,
                            preparing: 1,
                            ready: 2,
                            completed: 3,
                            closed: 3,
                            void: 4
                          }
                          const localStatusRank =
                            STATUS_RANK[existingOrder.order_status ?? ''] ?? 0
                          const broadcastStatusRank =
                            STATUS_RANK[backendOrder.status ?? ''] ?? 0
                          const isLocalAhead =
                            localStatusRank > broadcastStatusRank ||
                            isPaymentLocallyAhead
                          return !hasPendingChanges && !isLocalAhead
                            ? {
                                // Status
                                order_status: backendOrder.status,
                                // Guard check_status: never revert Closed -> Opened from stale broadcast
                                check_status:
                                  existingOrder.check_status === 'Closed' &&
                                  backendOrder.check_status !== 'Closed'
                                    ? existingOrder.check_status
                                    : backendOrder.check_status ||
                                      existingOrder.check_status ||
                                      'Opened',

                                // Card totals (default display)
                                total_amount: backendOrder.card_total,
                                total_tax: backendOrder.card_tax_amount,
                                // Cash total from backend — needed for accurate
                                // cashSavings calculation in addPaymentToOrder
                                total_cash_amount:
                                  backendOrder.cash_total ?? undefined,

                                // Timestamps
                                sent_to_kitchen_at:
                                  backendOrder.sent_to_kitchen_at ||
                                  existingOrder.sent_to_kitchen_at
                              }
                            : {}
                        })()
                      }

                      state.ordersById[localOrderId] = updatedOrder
                      // Update derived state if active order AND no pending changes
                      // PERFORMANCE FIX: Don't overwrite local totals while user is actively editing
                      if (
                        localOrderId === state.activeOrderId &&
                        !hasPendingChanges
                      ) {
                        state.activeOrderTotal = backendOrder.card_total
                        state.activeOrderTax = backendOrder.card_tax_amount
                        state.activeOrderSubtotal = backendOrder.card_subtotal
                        state.activeOrderDiscount =
                          backendOrder.discount_amount === 0 &&
                          localHasConfirmedDiscounts
                            ? existingOrder.total_discount ?? 0
                            : backendOrder.discount_amount
                        if (!isPaymentLocallyAhead) {
                          state.activeOrderOutstandingTotal =
                            backendOrder.amount_due
                        }
                        state.activeOrderOutstandingCash =
                          backendOrder.cash_amount_due
                        state.activeOrderTotalCash = backendOrder.cash_total
                      }
                    })

                    // Discount mismatch: broadcast says 0 but local has confirmed
                    // discounts. Queue authoritative sync (bypasses cooldown) to
                    // verify discount still exists in DB.
                    if (
                      backendOrder.discount_amount === 0 &&
                      localHasConfirmedDiscounts &&
                      !hasPendingChanges
                    ) {
                      lastOrderDetailSyncAt.delete(dbOrderId)
                      queueMicrotask(() => {
                        get().syncOrderFromBackendComplete(localOrderId)
                      })
                    }

                    // === PHASE 3: Queue updates if local changes pending ===
                    if (hasPendingChanges) {
                      // Queue backend updates that were skipped due to pending local changes
                      const queuedUpdate: QueuedUpdate = {
                        orderId: localOrderId,
                        timestamp: Date.now(),
                        updates: {
                          // Order status and totals (skipped above when hasPendingChanges)
                          order_status: backendOrder.status,
                          // Guard check_status: never revert Closed -> Opened from stale broadcast
                          check_status:
                            localOrder.check_status === 'Closed' &&
                            backendOrder.check_status !== 'Closed'
                              ? localOrder.check_status
                              : backendOrder.check_status ||
                                localOrder.check_status ||
                                'Opened',
                          total_amount: backendOrder.card_total,
                          total_cash_amount:
                            backendOrder.cash_total ?? undefined,
                          total_tax: backendOrder.card_tax_amount,
                          sent_to_kitchen_at:
                            backendOrder.sent_to_kitchen_at ||
                            localOrder.sent_to_kitchen_at,
                          // Active order derived state (if applicable)
                          ...(localOrderId === get().activeOrderId
                            ? {
                                _queuedActiveOrderState: {
                                  activeOrderTotal: backendOrder.card_total,
                                  activeOrderTax: backendOrder.card_tax_amount,
                                  activeOrderSubtotal:
                                    backendOrder.card_subtotal,
                                  activeOrderDiscount:
                                    backendOrder.discount_amount,
                                  activeOrderOutstandingTotal:
                                    backendOrder.amount_due,
                                  activeOrderOutstandingCash:
                                    backendOrder.cash_amount_due,
                                  activeOrderTotalCash: backendOrder.cash_total
                                }
                              }
                            : {})
                        },
                        source: 'broadcast'
                      }

                      set(state => {
                        state.pendingBackendUpdates[localOrderId] = queuedUpdate
                      })

                      if (__DEV__)
                        console.log(
                          '[OrderBroadcast] Queued backend update due to pending changes:',
                          {
                            orderId: localOrderId,
                            fields: Object.keys(queuedUpdate.updates)
                          }
                        )
                    }

                    // Coalesced invalidation — batches rapid broadcast updates
                    scheduleCalculationCacheInvalidation()

                    // Own-station mutation window: suppress _debouncedOrderRefresh
                    // from stale broadcasts that arrive shortly after a local mutation
                    // (addItem, removeItem, updateQuantity). Cross-station syncs unaffected.
                    const _mutationTs =
                      lastLocalMutationAt[dbOrderId] ??
                      lastLocalMutationAt[localOrderKey]
                    const isInMutationWindow =
                      isOwnStationOrder &&
                      _mutationTs != null &&
                      Date.now() - _mutationTs < OWN_STATION_MUTATION_WINDOW_MS

                    // Full sync if status changed and backend is AHEAD of local.
                    // Skip if local is already ahead (e.g. local=sent_to_kitchen, backend=draft
                    // during retroactive kitchen send) — the full fetch would overwrite
                    // optimistic kitchen_status with stale backend data.
                    if (localOrder.order_status !== backendOrder.status) {
                      const ORDER_STATUS_RANK: Record<string, number> = {
                        draft: 0,
                        sent_to_kitchen: 1,
                        preparing: 1,
                        ready: 2,
                        closed: 3,
                        void: 4
                      }
                      const localRank =
                        ORDER_STATUS_RANK[localOrder.order_status ?? ''] ?? 0
                      const backendRank =
                        ORDER_STATUS_RANK[backendOrder.status ?? ''] ?? 0
                      if (backendRank >= localRank && !isInMutationWindow) {
                        get()._debouncedOrderRefresh(dbOrderId)
                      }
                    }

                    // v2: item count change → full sync to fetch new items
                    if (
                      !isInMutationWindow &&
                      isHeaderOnlyBroadcast(backendOrder) &&
                      backendOrder.item_count !== undefined &&
                      backendOrder.item_count !==
                        localOrder.items.filter(i => !i.is_voided).length
                    ) {
                      get()._debouncedOrderRefresh(dbOrderId)
                    }

                    // v2: sync_version ahead + kitchen-active → fetch fresh items for kitchen_status
                    if (isKitchenSyncAdvance && !isInMutationWindow) {
                      get()._debouncedOrderRefresh(dbOrderId)
                    }
                  }
                  break

                case 'DELETE':
                  if (localOrder) {
                    if (__DEV__)
                      console.log('[OrderBroadcast] Own DELETE:', dbOrderId)
                    // Could archive or remove the local order
                  }
                  break
              }
              return
            }

            // DECISION POINT 2: Should we accept this remote order?
            // PHASE 2.2: Log view_scope check details
            const shouldAccept = state._shouldAcceptRemoteOrder(
              backendOrder,
              currentLocationId
            )

            if (__DEV__)
              console.log('[_handleOrderBroadcast] Should accept?', {
                shouldAccept,
                viewScope: state.currentStation?.view_scope,
                stationMatch: backendOrder.station_id === currentStationId,
                locationMatch: backendOrder.location_id === currentLocationId,
                currentLocationId,
                orderLocationId: backendOrder.location_id
              })

            if (!currentLocationId || !shouldAccept) {
              console.warn(
                '❌ [_handleOrderBroadcast] REJECTED - Order does not pass view_scope filter',
                {
                  reason: !currentLocationId
                    ? 'No current location ID'
                    : 'Failed _shouldAcceptRemoteOrder check',
                  orderId: dbOrderId,
                  orderStation: backendOrder.station_id,
                  currentStation: currentStationId
                }
              )
              return
            }

            if (__DEV__)
              console.log(
                '[_handleOrderBroadcast] ACCEPTED - Processing remote order...'
              )

            // ═══════════════════════════════════════════════════════════
            // REMOTE ORDER - Handle differently
            // ═══════════════════════════════════════════════════════════

            switch (operation) {
              case 'INSERT':
                // DEDUPLICATION: O(1) check if order exists via index
                const existingOrderKey =
                  state.dbOrderIdIndex[dbOrderId] ?? dbOrderId
                const existingOrder = state.ordersById[existingOrderKey] ?? null
                if (existingOrder) {
                  if (__DEV__)
                    console.log(
                      '[OrderBroadcast] Remote INSERT - order already exists:',
                      dbOrderId
                    )
                  return // Skip duplicate creation
                }
                if (__DEV__)
                  console.log(
                    '[OrderBroadcast] Remote INSERT - creating:',
                    dbOrderId
                  )
                get().upsertOrder(backendOrder)
                break

              case 'UPDATE':
                if (__DEV__)
                  console.log('[OrderBroadcast] Remote UPDATE:', dbOrderId)
                get().upsertOrder(backendOrder)
                break

              case 'DELETE':
                if (__DEV__)
                  console.log('[OrderBroadcast] Remote DELETE:', dbOrderId)
                get().removeOrder(dbOrderId)
                break
            }

            // PHASE 2.2: Log after store update
            if (__DEV__)
              console.log('[_handleOrderBroadcast] Store updated:', {
                ordersInStore: Object.keys(get().ordersById).length,
                thisOrderInStore: !!get().ordersById[dbOrderId],
                orderStatus: get().ordersById[dbOrderId]?.order_status,
                orderDisplayNumber: get().ordersById[dbOrderId]?.display_number
              })
          },

          // ============================================================================
          // REMOTE ORDER VIEW SCOPE FILTER (Phase 2)
          // ============================================================================

          _shouldAcceptRemoteOrder: (
            backendOrder: BroadcastOrderData,
            currentLocationId: string | undefined
          ) => {
            const { currentStation, currentStationId } = get()

            // PHASE 2.3: Detailed logging for view_scope filter
            if (__DEV__)
              console.log('[_shouldAcceptRemoteOrder] Checking:', {
                hasStation: !!currentStation,
                viewScope: currentStation?.view_scope,
                orderStationId: backendOrder.station_id,
                currentStationId,
                orderLocationId: backendOrder.location_id,
                currentLocationId,
                orderType: backendOrder.order_type
              })

            // 1. If no currentStation set, reject all remote orders
            if (!currentStation || !currentStationId) {
              console.warn('[RemoteOrder] REJECT: No station context')
              return false
            }

            // 2. If order is from our own station, this isn't a "remote" order
            if (backendOrder.station_id === currentStationId) {
              if (__DEV__)
                console.log(
                  '[RemoteOrder] REJECT: Own station order (not remote)'
                )
              return false
            }

            // 2b. External/online orders (non-POS origin) bypass view_scope and are always
            // accepted at the location level. view_scope controls POS-to-POS visibility only.
            // An order is external if: order_source indicates non-POS origin, OR it has no
            // station_id (came from an external platform) with an online order type.
            const isOnlineOrderType = ['delivery', 'takeout'].includes(
              backendOrder.order_type ?? ''
            )
            const isExternalOrder =
              (backendOrder.order_source &&
                backendOrder.order_source !== 'pos' &&
                backendOrder.order_source !== 'in_store') ||
              (!backendOrder.station_id && isOnlineOrderType)
            if (isExternalOrder) {
              const accept = backendOrder.location_id === currentLocationId
              if (__DEV__)
                console.log(
                  `[RemoteOrder] External order bypass: ${
                    accept ? 'ACCEPT' : 'REJECT (wrong location)'
                  }`,
                  {
                    orderSource: backendOrder.order_source,
                    locationMatch: accept
                  }
                )
              return accept
            }

            // 2c. Drafts are station-private. By this point the order is not
            // ours (rejected at step 2) and not external (returned at step 2b).
            // A remote POS station's draft has no business inflating
            // ordersById / MMKV / realtime CPU on this device until its owner
            // advances the status. Reject regardless of view_scope.
            //
            // FIELD NAME: BroadcastOrderData.status (NOT order_status — that's
            // the post-transform OrderProfile field). See
            // hooks/realtime/useOrdersRealtime.ts:178.
            if (backendOrder.status === 'draft') {
              if (__DEV__)
                console.log(
                  '[RemoteOrder] REJECT: remote draft (other station)'
                )
              return false
            }

            // 3. Check view_scope (POS-to-POS station visibility)
            const viewScope = currentStation.view_scope || 'own'

            switch (viewScope) {
              case 'own':
                // Never accept remote POS orders
                if (__DEV__)
                  console.log(
                    "[RemoteOrder] REJECT: view_scope='own' blocks all remote POS orders"
                  )
                return false

              case 'location': {
                // Accept all orders from this location
                const accept = backendOrder.location_id === currentLocationId
                if (__DEV__)
                  console.log(
                    `[RemoteOrder] view_scope='location': ${
                      accept ? 'ACCEPT' : 'REJECT'
                    }`,
                    {
                      locationMatch: accept,
                      orderLocation: backendOrder.location_id,
                      currentLocation: currentLocationId
                    }
                  )
                return accept
              }

              case 'online': {
                // Accept only online/delivery orders from this location
                const locationMatch =
                  backendOrder.location_id === currentLocationId
                const isOnlineOrder = ['delivery', 'takeout'].includes(
                  backendOrder.order_type
                )
                const accept = locationMatch && isOnlineOrder
                if (__DEV__)
                  console.log(
                    `[RemoteOrder] view_scope='online': ${
                      accept ? 'ACCEPT' : 'REJECT'
                    }`,
                    {
                      locationMatch,
                      isOnlineOrder,
                      orderType: backendOrder.order_type
                    }
                  )
                return accept
              }

              default:
                console.warn(
                  `[RemoteOrder] REJECT: Unknown view_scope='${viewScope}'`
                )
                return false
            }
          },

          // ============================================================================
          // ORDER VISIBILITY & MANAGEMENT (Phase 5)
          // ============================================================================

          /**
           * Check if an order should be visible to this station.
           * Simplified: includes own station orders, no ownership distinction.
           */
          isOrderVisible: (
            backendOrder: BroadcastOrderData,
            currentLocationId: string | undefined
          ) => {
            const { currentStation, currentStationId } = get()

            // No station context = only show local orders
            if (!currentStation || !currentStationId) {
              return false
            }

            // Check view_scope
            const viewScope = currentStation.view_scope || 'own'

            switch (viewScope) {
              case 'own':
                // Only our station's orders
                return backendOrder.station_id === currentStationId

              case 'location':
                // All orders from this location
                return backendOrder.location_id === currentLocationId

              case 'online':
                // Our station's orders + online orders from this location
                return (
                  backendOrder.station_id === currentStationId ||
                  (backendOrder.location_id === currentLocationId &&
                    ['delivery', 'takeout'].includes(backendOrder.order_type))
                )

              default:
                return backendOrder.station_id === currentStationId
            }
          },

          /**
           * Unified upsert for any order (from broadcast or fetch).
           * Uses db_order_id directly as local ID - single index architecture.
           */
          upsertOrder: (
            backendOrder: BroadcastOrderData,
            sourceStationName?: string | null
          ) => {
            const dbOrderId = backendOrder.id

            // Check if order already exists — also resolve through dbOrderIdIndex
            // to find orders stored under a mapped temp key (e.g. "local_order_xxx").
            // Without this, a broadcast UPDATE for a rekeyed-in-flight order creates
            // a duplicate entry with empty items at ordersById[dbOrderId].
            let existing = get().ordersById[dbOrderId]
            if (!existing) {
              const indexedKey = get().dbOrderIdIndex[dbOrderId]
              if (
                indexedKey &&
                indexedKey !== dbOrderId &&
                get().ordersById[indexedKey]
              ) {
                // Order exists under a mapped temp key — rekey to DB UUID first
                get().rekeyOrder(indexedKey, dbOrderId)
                existing = get().ordersById[dbOrderId]
              }
            }

            if (existing) {
              // Don't overwrite orders with pending local changes
              // if (existing.sync_status === 'pending') {
              //   console.log(
              //     '[UpsertOrder] Skipping - has pending sync:',
              //     dbOrderId
              //   )
              //   return
              // }

              // Phase 8: Version check - skip if server version is not newer
              const existingVersion = existing.sync_version ?? 0
              const serverVersion = backendOrder.sync_version ?? 0
              if (serverVersion <= existingVersion) {
                console.log(
                  '[UpsertOrder] Skipping - server version not newer:',
                  { dbOrderId, existingVersion, serverVersion }
                )
                return
              }

              // Order already exists - this will be an update operation
              console.log('[UpsertOrder] Updating existing order:', dbOrderId, {
                existingVersion,
                serverVersion
              })

              if (__DEV__) {
                console.log('[OfflineReconnectDebug][UpsertStart]', {
                  dbOrderId,
                  existingItems: existing.items?.length ?? 0,
                  existingPendingItems: existing.items?.filter(
                    i => !i.db_order_item_id && !i.isDraft
                  ).length,
                  existingDraftItems: existing.items?.filter(i => i.isDraft)
                    .length,
                  incomingOrderItems: backendOrder.order_items?.length ?? 0,
                  incomingItemCount: backendOrder.item_count,
                  isHeaderOnly: isHeaderOnlyBroadcast(backendOrder),
                  existingStatus: existing.order_status,
                  incomingStatus: backendOrder.status
                })
              }
            }

            // Transform to OrderProfile (uses dbOrderId as id)
            const orderProfile = transformBroadcastToOrder(
              backendOrder,
              sourceStationName,
              existing ?? undefined
            )

            // Broadcasts carry discount_amount (number) but NOT order_discounts metadata.
            // Preserve checkDiscount / applied_discounts so the calculator keeps applying the discount.
            if (
              backendOrder.discount_amount &&
              backendOrder.discount_amount > 0
            ) {
              if (existing?.checkDiscount) {
                // Already have discount locally — carry it forward unchanged
                orderProfile.checkDiscount = existing.checkDiscount
                orderProfile.applied_discounts = existing.applied_discounts
              } else {
                // Discount exists on backend but not in local state
                // (e.g. applied from another station). Queue a full fetch to restore it.
                lastOrderDetailSyncAt.delete(dbOrderId)
                queueMicrotask(() => {
                  get().syncOrderFromBackendComplete(dbOrderId)
                })
              }
            } else if (
              (!backendOrder.discount_amount ||
                backendOrder.discount_amount === 0) &&
              existing?.checkDiscount &&
              (existing.applied_discounts?.length ?? 0) > 0
            ) {
              // Broadcast shows no discount but local has confirmed metadata.
              // Preserve local state — broadcast header may be stale (discount
              // RPC not yet reflected). Queue authoritative sync to verify.
              orderProfile.checkDiscount = existing.checkDiscount
              orderProfile.applied_discounts = existing.applied_discounts
              orderProfile.total_discount = existing.total_discount
              lastOrderDetailSyncAt.delete(dbOrderId)
              queueMicrotask(() => {
                get().syncOrderFromBackendComplete(dbOrderId)
              })
            }

            // v2 broadcast preservation: keep existing data that header-only broadcast omits
            if (existing) {
              const isV2 = isHeaderOnlyBroadcast(backendOrder)

              // Preserve items when broadcast doesn't include them
              if (isV2 && existing.items.length > 0) {
                orderProfile.items = existing.items
              }

              // Preserve payments when not included in this broadcast
              if (
                (!backendOrder.order_payments ||
                  backendOrder.order_payments.length === 0) &&
                existing.payments &&
                existing.payments.length > 0
              ) {
                orderProfile.payments = existing.payments
              } else if (
                backendOrder.order_payments &&
                backendOrder.order_payments.length > 0 &&
                existing.items.length > 0
              ) {
                // Payment broadcast without items: resolve "Unknown Item" names from existing items
                orderProfile.payments = (orderProfile.payments || []).map(
                  p => ({
                    ...p,
                    itemsCovered: (p.itemsCovered || []).map(c => {
                      if (c.itemName !== 'Unknown Item') return c
                      const local = existing.items.find(
                        i => i.db_order_item_id === c.itemId
                      )
                      return local ? { ...c, itemName: local.name } : c
                    })
                  })
                )
              }

              // Preserve reversals/refund_items when not in broadcast
              if (!backendOrder.reversals?.length && existing.reversals) {
                orderProfile.reversals = existing.reversals
              }
              if (
                !backendOrder.order_refund_items?.length &&
                existing.order_refund_items
              ) {
                orderProfile.order_refund_items = existing.order_refund_items
              }
            }

            // Set broadcast item count for display
            orderProfile._broadcastItemCount = backendOrder.item_count

            // Upsert to single index (pre-freeze so Immer skips recursive scan)
            set(state => {
              state.ordersById[dbOrderId] = freeze(orderProfile)
              // Only add to orderIds if new
              if (!existing) {
                state.orderIds.push(dbOrderId)
              }
              // Surgical dbOrderIdIndex maintenance
              state.dbOrderIdIndex[dbOrderId] = dbOrderId
            })

            if (__DEV__) {
              const post = get().ordersById[dbOrderId]
              console.log('[OfflineReconnectDebug][UpsertCommitted]', {
                dbOrderId,
                committedItems: post?.items?.length ?? 0,
                committedStatus: post?.order_status,
                inOrderIds: get().orderIds.includes(dbOrderId)
              })
            }

            console.log(
              existing ? '[UpsertOrder] Updated:' : '[UpsertOrder] Created:',
              dbOrderId
            )
          },

          /**
           * Remove an order by its database ID.
           */
          removeOrder: (dbOrderId: string) => {
            const existing = get().ordersById[dbOrderId]
            if (!existing) {
              console.log('[RemoveOrder] Not found:', dbOrderId)
              return
            }

            set(state => {
              // Surgical dbOrderIdIndex cleanup
              const orderToRemove = state.ordersById[dbOrderId]
              if (orderToRemove?.db_order_id) {
                delete state.dbOrderIdIndex[orderToRemove.db_order_id]
              }
              delete state.ordersById[dbOrderId]
              state.orderIds = state.orderIds.filter(id => id !== dbOrderId)
              // Also remove from working set
              state.workingSetOrderIds = state.workingSetOrderIds.filter(
                id => id !== dbOrderId
              )
              delete state._workingSetLookup[dbOrderId]
              // Clear active order if it was removed
              if (state.activeOrderId === dbOrderId) {
                state.activeOrderId = null
              }
              // Surgical dbOrderIdIndex maintenance
              delete state.dbOrderIdIndex[dbOrderId]
              delete state.persistableOrderIds[dbOrderId]
            })

            // Cleanup mutation window tracker
            delete lastLocalMutationAt[dbOrderId]

            console.log('[RemoveOrder] Removed:', dbOrderId)
          },

          // ====================================================================
          // PHASE 3: INITIAL FETCH & RECONCILIATION
          // ====================================================================

          /**
           * Fetch visible orders from other stations based on view_scope.
           * Phase 5: Simplified - uses upsertOrder, no remote ID prefix.
           */
          fetchVisibleOrders: async options => {
            const { currentStation, currentStationId } = get()
            const locationId =
              useStoreSettingsStore.getState().selectedStore?.id

            // Guard: No station context
            if (!currentStation || !currentStationId || !locationId) {
              console.warn('[FetchVisible] No station context, skipping')
              return
            }

            // Guard: View scope doesn't allow other station orders
            if (currentStation.view_scope === 'own') {
              console.log(
                '[FetchVisible] view_scope is "own", no other station orders needed'
              )
              return
            }

            set({ isLoadingPreviousOrders: true })

            try {
              const supabase = _supabaseClient
              if (!supabase) {
                throw new Error('Supabase client not available')
              }

              // Build base query
              let query = supabase
                .from('orders')
                .select(
                  `
                  *,
                  order_items (
                    *,
                    order_item_modifiers (*)
                  ),
                  order_payments (*),
                  stations(station_name),
                  created_by_staff:staff_profiles!created_by_staff_id(first_name, last_name)
                `
                )
                .eq('location_id', locationId)
                .neq('station_id', currentStationId) // Exclude our own station
                .order('created_at', { ascending: false })
                .limit(options?.limit ?? 50)

              // Apply view_scope specific filters
              if (currentStation.view_scope === 'online') {
                query = query.in('order_type', ['delivery', 'takeout'])
              }

              // Optionally exclude completed orders
              if (!options?.includeCompleted) {
                query = query.not(
                  'status',
                  'in',
                  '("completed","void","cancelled")'
                )
              }

              const { data, error } = await query

              if (error) throw error

              console.log(
                `[FetchVisible] Fetched ${
                  data?.length ?? 0
                } orders from other stations`
              )

              // Upsert each order
              for (const fetchedOrder of data ?? []) {
                const normalized = normalizeFetchedOrder(
                  fetchedOrder as FetchedOrderData
                )
                const sourceStationName = fetchedOrder.stations?.name ?? null

                // Use unified upsertOrder (handles idempotency, passes station name)
                get().upsertOrder(normalized, sourceStationName)
              }

              // Update reconciliation timestamp
              set({ lastReconciliationAt: new Date().toISOString() })
            } catch (error) {
              console.error('[FetchVisible] Error:', error)
              // Don't throw - other station orders are non-critical
            } finally {
              set({ isLoadingPreviousOrders: false })
            }
          },

          /**
           * Fetch own station orders not in local store (handles orphaned orders).
           * Orphaned orders are server orders for our station that don't exist locally
           * (e.g., after app reinstall or created on another device with same station).
           */
          fetchOwnStationOrders: async () => {
            const { currentStation, currentStationId } = get()
            const locationId =
              useStoreSettingsStore.getState().selectedStore?.id

            if (!currentStation || !currentStationId || !locationId) {
              console.warn('[FetchOwn] No station context, skipping')
              return
            }

            try {
              const supabase = _supabaseClient
              if (!supabase) {
                throw new Error('Supabase client not available')
              }

              // Fetch active orders from our station
              const { data, error } = await supabase
                .from('orders')
                .select(
                  `
                  *,
                  order_items (
                    *,
                    order_item_modifiers (*)
                  ),
                  order_payments (*)
                `
                )
                .eq('location_id', locationId)
                .eq('station_id', currentStationId)
                .not('status', 'in', '("completed","void","cancelled")')
                .order('created_at', { ascending: false })

              if (error) throw error

              console.log(
                `[FetchOwn] Fetched ${data?.length ?? 0} own station orders`
              )

              // Check for orphaned orders (on server but not locally)
              // Also upsert existing orders to refresh stale rehydrated data
              for (const serverOrder of data ?? []) {
                const existsLocally = get().ordersById[serverOrder.id]

                if (!existsLocally) {
                  console.log(
                    `[FetchOwn] Found orphaned order: ${serverOrder.id}`
                  )
                  // Create as local order (full editing capability)
                  get()._createLocalOrderFromServer(
                    serverOrder as FetchedOrderData
                  )
                } else {
                  // Existing order — update with fresh server data
                  // upsertOrder's version check handles idempotency
                  const normalized = normalizeFetchedOrder(
                    serverOrder as FetchedOrderData
                  )

                  // Hydrate missing payments from server (MMKV may have stale data,
                  // or onRehydrate sync may have failed due to no supabase client)
                  const localOrder = get().ordersById[serverOrder.id]
                  if (
                    localOrder &&
                    (!localOrder.payments ||
                      localOrder.payments.length === 0) &&
                    normalized.order_payments &&
                    normalized.order_payments.length > 0
                  ) {
                    const serverPayments = transformBroadcastPaymentsToProfile(
                      normalized.order_payments,
                      normalized.order_items,
                      undefined,
                      normalized.card_total || normalized.total_amount,
                      normalized.cash_total
                    )
                    if (serverPayments.length > 0) {
                      console.log(
                        `[FetchOwn] Hydrating ${serverPayments.length} missing payments for order ${serverOrder.id}`
                      )
                      get().patchOrder(serverOrder.id, {
                        payments: serverPayments
                      })
                    }
                  }

                  get().upsertOrder(normalized)
                }
              }
            } catch (error) {
              console.error('[FetchOwn] Error:', error)
            }
          },

          /**
           * Create a local order from server data (for orphaned orders).
           * These are our station's orders that we don't have locally.
           * Uses DB UUID as the key in ordersById.
           */
          _createLocalOrderFromServer: serverOrder => {
            const dbOrderId = serverOrder.id

            // Check if already exists (single index lookup)
            if (get().ordersById[dbOrderId]) {
              console.log('[CreateFromServer] Already exists:', dbOrderId)
              return
            }

            // Normalize and transform items + payments
            const normalized = normalizeFetchedOrder(serverOrder)
            const items = transformBroadcastItems(normalized.order_items)
            const payments = transformBroadcastPaymentsToProfile(
              normalized.order_payments,
              normalized.order_items
            )

            // Map to local OrderProfile format (use DB UUID as id)
            const localOrder: OrderProfile = {
              id: dbOrderId,
              db_order_id: dbOrderId,
              order_number: serverOrder.order_number,
              display_number: serverOrder.display_number,

              // Station tracking - this IS our station
              station_id: serverOrder.station_id ?? null,

              // Order info
              order_type: mapOrderType(serverOrder.order_type),
              order_status: serverOrder.status as OrderProfile['order_status'],
              check_status: (serverOrder.check_status || 'Opened') as
                | 'Opened'
                | 'Closed',
              paid_status: mapPaymentStatus(serverOrder.payment_status),
              service_location_id: serverOrder.table_number ?? null,
              // table_number IS the table name (e.g., "T1"), use it directly for display
              service_location_name: serverOrder.table_number || undefined,
              session_id: serverOrder.session_id ?? undefined,
              customer_name: '',

              // Financial - use server values
              total_amount:
                serverOrder.card_total ?? serverOrder.total_amount ?? 0,
              total_tax:
                serverOrder.card_tax_amount ?? serverOrder.tax_amount ?? 0,
              total_discount: serverOrder.discount_amount ?? 0,
              amount_paid: serverOrder.amount_paid ?? 0,
              amount_due: serverOrder.amount_due ?? 0,
              cash_amount_due: serverOrder.cash_amount_due ?? 0,

              // Items + payments
              items,
              payments,

              // Timestamps
              opened_at: serverOrder.created_at,
              sent_to_kitchen_at: serverOrder.sent_to_kitchen_at ?? undefined,
              closed_at: serverOrder.completed_at ?? undefined,

              // Sync status - already synced since from DB
              sync_status: 'synced',
              sync_version: serverOrder.sync_version ?? 1,

              // Order source
              order_source: serverOrder.order_source ?? null,
              delivery_platform:
                serverOrder.delivery_platform ??
                normalizePlatform(
                  (serverOrder as any).metadata?.delivery_company
                ) ??
                null,

              // Station tracking (for display)
              _sourceStationId: serverOrder.station_id ?? null,
              _sourceStationName: null
            }

            // Add to store (single index by DB UUID; pre-freeze so Immer skips recursive scan)
            set(state => {
              state.ordersById[dbOrderId] = freeze(localOrder)
              state.orderIds.push(dbOrderId)
            })

            console.log('[CreateFromServer] Created local order:', dbOrderId)
          },

          /**
           * Clean up orders from other stations that no longer exist on server.
           * Phase 5: Simplified - uses db_order_id directly, no remote prefix.
           */
          _cleanupStaleRemoteOrders: async locationId => {
            const { currentStationId, ordersById, orderIds } = get()

            if (!currentStationId) return

            try {
              const supabase = _supabaseClient
              if (!supabase) {
                throw new Error('Supabase client not available')
              }

              // Fetch active order IDs from server (other stations only)
              const { data, error } = await supabase
                .from('orders')
                .select('id')
                .eq('location_id', locationId)
                .neq('station_id', currentStationId)
                .not('status', 'in', '("completed","voided","cancelled")')

              if (error) throw error

              // Build set of valid db_order_ids from server
              const serverDbIds = new Set((data ?? []).map(o => o.id))

              // Find local orders from other stations that no longer exist on server
              const inactiveSet = new Set(['completed', 'voided', 'cancelled'])
              const staleDbOrderIds: string[] = []
              for (const id of orderIds) {
                const o = ordersById[id]
                if (!o || !o.db_order_id) continue

                // Never prune the active order or working-set orders.
                if (id === get().activeOrderId) continue
                if (get()._workingSetLookup[id]) continue

                // Never prune orders with local pending item/payment sync.
                const hasPendingItems = o.items.some(
                  item => !item.db_order_item_id && !item.isDraft
                )
                const hasPendingPayments =
                  o.payments?.some(
                    p =>
                      p.sync_status === 'pending' ||
                      (!p.db_payment_id && !p.isVoided)
                  ) ?? false
                if (hasPendingItems || hasPendingPayments) continue

                // Ownership-safe pruning:
                // - keep own-station orders
                // - keep orders with unknown station ownership (can happen during reconnect/rekey)
                if (!o.station_id) continue
                if (o.station_id === currentStationId) continue
                if (inactiveSet.has(o.order_status ?? '')) continue
                if (!serverDbIds.has(o.db_order_id)) {
                  staleDbOrderIds.push(o.db_order_id)
                }
              }

              for (const dbOrderId of staleDbOrderIds) {
                console.log(`[Cleanup] Removing stale order: ${dbOrderId}`)
                get().removeOrder(dbOrderId)
              }
            } catch (error) {
              console.error('[Cleanup] Error:', error)
            }
          },

          /**
           * Full reconciliation action - called on reconnect or manual refresh.
           */
          reconcileOrders: async () => {
            const { currentStation, currentStationId, lastReconciliationAt } =
              get()
            const locationId =
              useStoreSettingsStore.getState().selectedStore?.id

            if (!currentStation || !currentStationId || !locationId) {
              console.warn('[Reconcile] No station context')
              return
            }

            console.log('[Reconcile] Starting reconciliation...')
            console.log(
              '[Reconcile] Last reconciliation:',
              lastReconciliationAt
            )

            set({ isLoadingPreviousOrders: true })

            try {
              // STEP 1: Fetch own station orders (handles orphaned orders)
              await get().fetchOwnStationOrders()

              // STEP 2: Fetch remote orders (if view_scope allows)
              if (currentStation.view_scope !== 'own') {
                await get().fetchVisibleOrders()
              }

              // STEP 3: Clean up stale remote orders
              await get()._cleanupStaleRemoteOrders(locationId)

              // Keep history store aligned with workspace after reconnect / full reconcile
              await usePreviousOrdersStore
                .getState()
                .refreshPreviousOrders({ force: true })

              // Update reconciliation timestamp
              set({ lastReconciliationAt: new Date().toISOString() })

              console.log('[Reconcile] Completed successfully')
            } catch (error) {
              console.error('[Reconcile] Error:', error)
            } finally {
              set({ isLoadingPreviousOrders: false })
            }
          },

          // ====================================================================
          // DEBOUNCED REFRESH
          // ====================================================================

          _debouncedOrderRefresh: createDebouncedOrderRefresh(get),

          markLocalMutation: orderId => {
            const order = get().ordersById[orderId]
            const dbId = order?.db_order_id
            if (dbId) lastLocalMutationAt[dbId] = Date.now()
            lastLocalMutationAt[orderId] = Date.now()
          },

          // ====================================================================
          // RECONNECTION LOGIC
          // ====================================================================

          // --- SYNC BARRIER METHODS ---
          hasPendingSyncs: (orderId: string) => {
            const order = get().ordersById[orderId]
            if (!order) return false
            // Phase 7D: Check sync store for pending status
            const syncStore = useSyncStatusStore.getState()
            return order.items.some(item => {
              if (item.isDraft) return false
              // Item still being added to backend (no db_order_item_id yet)
              if (!item.db_order_item_id) return true
              const status = syncStore.itemSyncStatus.get(item.id)
              return status === 'pending' || status === 'syncing'
            })
          },

          waitForPendingSyncs: async (
            orderId: string,
            opts?: { maxMs?: number },
          ) => {
            // Default reduced 15s → 5s; hot-path callers pass {maxMs: 2000}.
            // The sync barrier must not freeze the UI on slow WiFi.
            const TIMEOUT_MS = opts?.maxMs ?? 5000
            const POLL_INTERVAL_MS = 100
            const start = Date.now()

            // Wait until every non-draft item in the order has a db_order_item_id
            // (meaning addItemToBackend has completed for it) AND no item has a
            // pending/syncing status in useSyncStatusStore (for quantity updates etc).
            // Also awaits any promises registered via registerSyncOperation.
            while (true) {
              const order = get().ordersById[orderId]
              if (!order) return

              const syncStore = useSyncStatusStore.getState()

              // Check 1: any item missing db_order_item_id (still being added to backend)
              const hasUnsynced = order.items.some(
                item => !item.isDraft && !item.db_order_item_id
              )

              // Check 2: any item with pending/syncing status (quantity updates etc)
              const hasPendingStatus = order.items.some(item => {
                if (item.isDraft) return false
                const status = syncStore.itemSyncStatus.get(item.id)
                return status === 'pending' || status === 'syncing'
              })

              // Check 3: any registered promise still in-flight
              const registeredPromises: Promise<boolean>[] = []
              for (const item of order.items) {
                const p = pendingSyncOperations.get(item.id)
                if (p) registeredPromises.push(p)
              }

              if (
                !hasUnsynced &&
                !hasPendingStatus &&
                registeredPromises.length === 0
              ) {
                return // All clear
              }

              if (Date.now() - start >= TIMEOUT_MS) {
                console.warn(
                  '[SyncBarrier] Timeout waiting for item syncs — proceeding anyway'
                )
                return
              }

              // Await registered promises if any, otherwise poll
              if (registeredPromises.length > 0) {
                await Promise.race([
                  Promise.all(registeredPromises),
                  new Promise<void>(resolve =>
                    setTimeout(resolve, POLL_INTERVAL_MS)
                  )
                ])
              } else {
                await new Promise<void>(resolve =>
                  setTimeout(resolve, POLL_INTERVAL_MS)
                )
              }
            }
          },

          getSyncStatus: (orderId: string) => {
            const order = get().ordersById[orderId]
            if (!order) return { pending: 0, failed: 0, synced: 0 }

            // Phase 7D: Check sync store for status instead of item properties
            const syncStore = useSyncStatusStore.getState()
            let pending = 0
            let failed = 0
            let synced = 0

            for (const item of order.items) {
              if (item.isDraft) continue // Skip draft items

              const status = syncStore.itemSyncStatus.get(item.id)
              switch (status) {
                case 'pending':
                case 'syncing':
                  pending++
                  break
                case 'failed':
                  failed++
                  break
                case 'synced':
                  synced++
                  break
                default:
                  // Items without sync status in store are treated as synced
                  // (they have db_order_item_id or are legacy items)
                  synced++
              }
            }

            return { pending, failed, synced }
          },

          updateItemSyncStatus: (
            orderId: string,
            itemId: string,
            status: 'pending' | 'syncing' | 'synced' | 'failed',
            error?: string
          ) => {
            // Phase 7D: Redirect to dedicated sync status store
            // This prevents ordersById from changing on every sync status update,
            // eliminating the render cascade that blocked touch events.
            // Only BillItem subscribes to the sync store for UI indicators.
            useSyncStatusStore.getState().setSyncStatus(itemId, status, error)
          },

          registerSyncOperation: (
            itemId: string,
            promise: Promise<boolean>
          ) => {
            pendingSyncOperations.set(itemId, promise)
          },

          unregisterSyncOperation: (itemId: string) => {
            pendingSyncOperations.delete(itemId)
          },

          // --- PUBLIC ACTIONS ---
          setOrders: newOrders => {
            // Sanitize orders to ensure no undefined numbers propagate from backend
            const sanitizedOrders = newOrders.map(o => ({
              ...o,
              total_amount: o.total_amount ?? 0,
              total_tax: o.total_tax ?? 0,
              total_discount: o.total_discount ?? 0,
              items: o.items || []
            }))
            // Convert array to ordersById; pre-freeze so Immer skips recursive scan
            const ordersById: Record<string, OrderProfile> = {}
            const orderIds: string[] = []
            for (const order of sanitizedOrders) {
              ordersById[order.id] = freeze(order)
              orderIds.push(order.id)
            }
            set({
              ordersById,
              orderIds,
              tableOrderIdIndex: rebuildTableOrderIdIndex(ordersById)
            })
          },

          setActiveOrder: orderId => {
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
                activeOrderOutstandingCash: 0
              })
              return
            }

            // Set active order ID first
            set({ activeOrderId: orderId })

            // Phase 5: Auto-add to working set when setting active order
            const order = get().ordersById[orderId]
            if (order?.db_order_id) {
              get().addToWorkingSet(order.db_order_id)
            }

            // Synchronously calculate and update all derived state - instant!
            get().recalculateOrder(orderId)

            // Lazy-fetch full detail for remote/header-only orders with no items loaded
            if (order && order.items.length === 0 && order.db_order_id) {
              get().syncOrderFromBackendComplete(orderId)
            }

            // Fetch discount metadata when discount exists but checkDiscount not yet restored
            // (e.g. order with discount applied on another station, synced via broadcast)
            if (
              order &&
              order.db_order_id &&
              order.items.length > 0 &&
              (order.total_discount ?? 0) > 0 &&
              !order.checkDiscount
            ) {
              lastOrderDetailSyncAt.delete(order.db_order_id)
              get().syncOrderFromBackendComplete(orderId)
            }
          },

          retrySyncForItem: async (itemId: string) => {
            const count = await retrySyncForItemQueue(itemId)
            useSyncStatusStore
              .getState()
              .setSyncStatus(itemId, 'pending', undefined)
            return count
          },

          claimActiveOrder: async () => {
            const { activeOrderId, ordersById, currentStationId } = get()
            if (!activeOrderId) {
              return { success: false, error: 'NO_ACTIVE_ORDER' as const }
            }
            const order = ordersById[activeOrderId]
            if (!order) {
              return { success: false, error: 'NO_ACTIVE_ORDER' as const }
            }
            if (!currentStationId) {
              return { success: false, error: 'NO_STATION' as const }
            }
            // Already ours — no-op success.
            if (
              order.station_id == null ||
              order.station_id === currentStationId
            ) {
              return { success: true as const }
            }
            const dbOrderId = order.db_order_id
            if (!dbOrderId) {
              // Optimistic local-only orders never need claiming — they're
              // by definition created on this station. This branch is paranoia.
              return { success: false, error: 'ORDER_NOT_FOUND' as const }
            }

            const supabase = getOrderStoreSupabaseClient()
            if (!supabase) {
              return { success: false, error: 'NETWORK' as const }
            }

            const result = await OrderService.claimOrder(supabase, {
              orderId: dbOrderId,
              stationId: currentStationId,
              expectedStationId: order.station_id
            })

            // Network / transport error
            if (result.error) {
              if (__DEV__)
                console.warn('[claimActiveOrder] RPC error:', result.error)
              toastService.show({
                title: "Couldn't take over",
                message: 'Network error — please try again.',
                type: 'error'
              })
              return { success: false, error: 'NETWORK' as const }
            }

            const data = result.data as any
            if (!data?.success) {
              const errCode = data?.error as
                | 'ORDER_NOT_FOUND'
                | 'ORDER_FINALIZED'
                | 'ORDER_LOCKED_FOR_PAYMENT'
                | 'CONCURRENT_CLAIM'
                | undefined

              const messages: Record<string, { title: string; message: string }> = {
                ORDER_NOT_FOUND: {
                  title: "Couldn't take over",
                  message: 'Order is no longer available.'
                },
                ORDER_FINALIZED: {
                  title: "Couldn't take over",
                  message: 'Order is closed — nothing to take over.'
                },
                ORDER_LOCKED_FOR_PAYMENT: {
                  title: "Couldn't take over",
                  message:
                    'Order is being paid by another station. Try again in a moment.'
                },
                CONCURRENT_CLAIM: {
                  title: "Couldn't take over",
                  message: 'Already claimed by another station.'
                }
              }
              const msg = errCode
                ? messages[errCode]
                : { title: "Couldn't take over", message: 'Unknown error.' }
              toastService.show({ ...msg, type: 'warning' })
              if (__DEV__)
                console.warn('[claimActiveOrder] server rejected:', data)
              return { success: false, error: errCode ?? ('NETWORK' as const) }
            }

            // Success — optimistic local update; the realtime broadcast will
            // arrive with the same delta and the version-guard dedupes.
            set(state => {
              const o = state.ordersById[activeOrderId]
              if (!o) return
              o.station_id = currentStationId
              o._sourceStationId = undefined
              o._sourceStationName = undefined
              const newVersion =
                typeof data.sync_version === 'number'
                  ? data.sync_version
                  : ((o as any).sync_version ?? 0) + 1
              ;(o as any).sync_version = newVersion
            })

            return { success: true as const }
          },

          startNewOrder: details => {
            const { activeEmployeeId, employees } = useEmployeeStore.getState()
            const activeEmployee = employees.find(
              e => e.id === activeEmployeeId
            )

            // Phase 1 Foundation: Get station context for new orders
            const { currentStationId, currentStation } = get()

            // Generate local order numbers (station-aware if station is set)
            const selectedStore = useStoreSettingsStore.getState().selectedStore
            const localNumbers = selectedStore
              ? generateLocalOrderNumbers(
                  selectedStore.id,
                  currentStation?.station_number ?? null
                )
              : undefined

            const newOrder: OrderProfile = {
              id:
                details?.orderId ||
                `order_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              service_location_id: details?.tableId || null,
              order_status: 'draft',
              customer_name: '',
              check_status: 'Opened',
              paid_status: 'Unpaid',
              sync_version: 0, // Initialize at 0 for new orders (before backend creation)
              order_type: details?.tableId ? 'dine_in' : 'takeout',
              items: [],
              payments: [],
              opened_at: new Date().toISOString(),
              guest_count: details?.guestCount || 1,
              server_name: activeEmployee?.fullName || 'Unknown',

              // Local order numbers (station-aware)
              display_number: localNumbers?.displayNumber,
              order_number: localNumbers?.orderNumber,

              // Financial fields - initialize to 0 for new orders
              total_amount: 0,
              total_tax: 0,
              total_discount: 0,
              amount_due: 0,
              cash_amount_due: 0,
              amount_paid: 0,

              // Session tracking - bidirectional relationship
              session_id: details?.sessionId,
              local_session_id: details?.localSessionId,

              // Station tracking
              station_id: currentStationId,
              _sourceStationId: currentStationId,
              _sourceStationName: currentStation?.station_name || null,

              // Staff attribution
              created_by_staff_profile_id: activeEmployee?.profileId || null
            }
            set(state => {
              state.ordersById[newOrder.id] = newOrder
              state.orderIds.push(newOrder.id)
              state.unsyncedOrderIds.push(newOrder.id)
              state.persistableOrderIds[newOrder.id] = true
              syncTableOrderIdIndexForOrder(state, newOrder.id)
            })
            return newOrder
          },

          addItemToActiveOrder: newItem => {
            const { activeOrderId, ordersById } = get()
            if (!activeOrderId) return
            if (!_checkCartEditable(get())) return

            const activeOrder = ordersById[activeOrderId] // O(1) lookup
            if (!activeOrder) return

            // Block adding items to closed checks
            if (activeOrder.check_status === 'Closed') {
              toastService.show({
                title: 'Check Closed',
                message: 'This check is closed. Reopen it to add more items.',
                type: 'warning'
              })
              return
            }

            // Phase 5: Any visible order can be modified - no ownership guard needed

            // ================================================================
            // FAST PATH: Draft items skip all expensive operations
            // ================================================================
            if (newItem.isDraft) {
              const coursingState = useCoursingStore.getState()
              const currentCourse =
                coursingState.getForOrder(activeOrderId)?.workingCourse ?? 1
              const draftCartItem: CartItem = {
                ...newItem,
                paidQuantity: 0,
                courseNumber: newItem.courseNumber ?? currentCourse
                // No kitchen_status or sync_status for drafts
              }

              // Single minimal state update - no totals calculation
              set(state => {
                const order = state.ordersById[activeOrderId]
                order.items.push(draftCartItem)
                order.last_activity_at = new Date().toISOString()
              })
              return // Early exit - no sync, no totals
            }

            // ================================================================
            // REGULAR PATH: Non-draft items with deferred totals
            // ================================================================
            const coursingState = useCoursingStore.getState()
            const currentCourse =
              coursingState.getForOrder(activeOrderId)?.workingCourse ?? 1

            let updatedCart: CartItem[] = activeOrder.items

            // 1. Remove any existing drafts for this MenuItemId
            updatedCart = updatedCart.filter(
              item => !(item.isDraft && item.menuItemId === newItem.menuItemId)
            )

            // 2. Find a potential candidate for merging
            const mergeCandidate = updatedCart.find(cartItem => {
              if (
                cartItem.isDraft ||
                (cartItem.kitchen_status && cartItem.kitchen_status !== 'new')
              ) {
                return false
              }
              const existingItemCourse =
                coursingState.getForOrder(activeOrderId)?.itemCourseMap?.[
                  cartItem.id
                ] ?? 1
              if (existingItemCourse !== currentCourse) {
                return false
              }
              return areCartItemsMergeIdentical(
                activeOrderId,
                cartItem,
                newItem
              )
            })

            // Track the item ID for sync operations and whether this is a merge
            let syncItemId: string
            let isMergeOperation = false
            let mergedItemWithNewQuantity: CartItem | null = null

            if (mergeCandidate) {
              // 3. Merge: update quantity
              syncItemId = mergeCandidate.id
              isMergeOperation = true
              const newQuantity = mergeCandidate.quantity + newItem.quantity

              updatedCart = updatedCart.map(item => {
                if (item.id === mergeCandidate.id) {
                  const updatedItem = {
                    ...item,
                    quantity: newQuantity,
                    sync_status: 'pending' as const
                  }
                  mergedItemWithNewQuantity = updatedItem
                  return updatedItem
                }
                return item
              })
            } else {
              // 4. New item: add to cart
              syncItemId = newItem.id
              const newCartItem: CartItem = {
                ...newItem,
                paidQuantity: 0,
                item_status:
                  activeOrder.order_type === 'dine_in'
                    ? 'preparing'
                    : undefined,
                kitchen_status: 'new' as const,
                sync_status: 'pending' as const,
                courseNumber: currentCourse
              }
              updatedCart = [...updatedCart, newCartItem]
              coursingState.setItemCourse(
                activeOrderId,
                newCartItem.id,
                currentCourse
              )
            }

            // ================================================================
            // SINGLE BATCHED UPDATE: Items + Totals together (no double render)
            // Performance fix: Removed queueMicrotask - now synchronous
            // calculateOrderTotals is O(n) and takes <5ms for typical orders
            // ================================================================
            const taxRatesMap = useStoreSettingsStore.getState().taxRatesMap
            const totals = calculateOrderTotals(
              updatedCart,
              activeOrder.checkDiscount,
              activeOrder.payments || [],
              taxRatesMap
            )

            // If a check discount is active, redistribute it across all items
            // so every item (including newly added ones) has correct subtotal / discount_amount
            const itemsForState =
              activeOrder.checkDiscount && totals.discount_amount > 0
                ? distributeDiscountToItems(
                    updatedCart,
                    totals.discount_amount,
                    totals.cash_discount_amount
                  )
                : updatedCart

            set(state => {
              const order = state.ordersById[activeOrderId]
              order.items = itemsForState
              order.total_amount = totals.total_amount
              order.total_tax = totals.tax_amount
              order.total_discount = totals.discount_amount
              order.amount_due = totals.outstanding_total
              order.cash_amount_due = totals.cash_outstanding_total
              order.last_activity_at = new Date().toISOString()
              state.activeOrderSubtotal = totals.subtotal
              state.activeOrderTax = totals.tax_amount
              state.activeOrderTotal = totals.total_amount
              state.activeOrderDiscount = totals.discount_amount
              state.activeOrderOutstandingSubtotal = totals.outstanding_subtotal
              state.activeOrderOutstandingTax = totals.outstanding_tax
              state.activeOrderOutstandingTotal = totals.outstanding_total
              state.activeOrderTotalCash = totals.cash_total_amount
              state.activeOrderOutstandingCash = totals.cash_outstanding_total
              // Mark order as persistable when it has unsynced items
              if (!newItem.isDraft) {
                state.persistableOrderIds[activeOrderId] = true
              }
            })

            // Track mutation for own-station broadcast guard
            const _dbId = get().ordersById[activeOrderId]?.db_order_id
            if (_dbId) lastLocalMutationAt[_dbId] = Date.now()
            lastLocalMutationAt[activeOrderId] = Date.now()

            // 7. Background sync with promise tracking for sync barriers
            // Use the merged item with updated quantity, or the new item
            const itemToSync =
              isMergeOperation && mergedItemWithNewQuantity
                ? mergedItemWithNewQuantity
                : mergeCandidate || newItem

            if (!itemToSync.isDraft) {
              // Phase 7D: Set pending status in sync store for BillItem indicator
              useSyncStatusStore.getState().setSyncStatus(syncItemId, 'pending')
              const orderToSync = get().ordersById[activeOrderId]
              if (orderToSync) {
                const updateItemSyncStatusAction = get().updateItemSyncStatus
                const registerSyncOp = get().registerSyncOperation
                const unregisterSyncOp = get().unregisterSyncOperation
                const currentOrderId = activeOrderId

                // OFFLINE-FIRST: Mark item as failed instead of removing it
                const markItemFailedAction = (
                  itemId: string,
                  error: string
                ) => {
                  const resolvedOrderId = get().ordersById[currentOrderId]
                    ? currentOrderId
                    : get().activeOrderId || currentOrderId
                  updateItemSyncStatusAction(
                    resolvedOrderId,
                    itemId,
                    'failed',
                    error
                  )
                }

                const setOrderDbIdAction = (
                  orderId: string,
                  dbOrderId: string,
                  orderNumber: string,
                  displayNumber: string,
                  createdAt: string,
                  syncVersion?: number
                ) => {
                  set(state => {
                    const existingOrder = state.ordersById[orderId]
                    if (!existingOrder) return

                    // If orderId is already the dbOrderId, just update in place (no re-key needed)
                    if (orderId === dbOrderId) {
                      existingOrder.db_order_id = dbOrderId
                      existingOrder.order_number = orderNumber
                      existingOrder.display_number = displayNumber
                      existingOrder.sync_status = 'synced'
                      existingOrder.sync_version = syncVersion ?? 1
                      existingOrder.opened_at =
                        existingOrder.opened_at || createdAt
                      // Surgical dbOrderIdIndex maintenance
                      state.dbOrderIdIndex[dbOrderId] = orderId
                      return
                    }

                    // Otherwise, re-key: remove old key, add new key
                    console.log(
                      `[setOrderDbId] Re-keying order from ${orderId} to ${dbOrderId}`
                    )

                    // Snapshot the draft to a plain object before re-keying
                    // to avoid orphaned child draft proxies under the deleted path
                    const snapshot = current(existingOrder)
                    delete state.ordersById[orderId]
                    state.ordersById[dbOrderId] = freeze({
                      ...snapshot,
                      id: dbOrderId,
                      db_order_id: dbOrderId,
                      order_number: orderNumber,
                      display_number: displayNumber,
                      sync_status: 'synced' as const,
                      sync_version: syncVersion ?? 1,
                      opened_at: snapshot.opened_at || createdAt
                    })

                    // Update orderIds list
                    const idx = state.orderIds.indexOf(orderId)
                    if (idx !== -1) state.orderIds[idx] = dbOrderId

                    // Update active order if needed
                    if (state.activeOrderId === orderId)
                      state.activeOrderId = dbOrderId

                    // Update working set if needed
                    const wsIdx = state.workingSetOrderIds.indexOf(orderId)
                    if (wsIdx !== -1) {
                      state.workingSetOrderIds[wsIdx] = dbOrderId
                      delete state._workingSetLookup[orderId]
                      state._workingSetLookup[dbOrderId] = true
                    }

                    // Surgical dbOrderIdIndex maintenance
                    state.dbOrderIdIndex[dbOrderId] = dbOrderId
                    delete state.dbOrderIdIndex[orderId]
                    // Surgical persistableOrderIds maintenance
                    if (state.persistableOrderIds[orderId]) {
                      delete state.persistableOrderIds[orderId]
                      state.persistableOrderIds[dbOrderId] = true
                    }

                    syncTableOrderIdIndexForOrder(state, dbOrderId, snapshot)
                  })

                  // Record persistent localId → dbOrderId mapping so that
                  // ensureOrderCreated and resolveQueueKey can find the order
                  // even after pendingOrderCreations is cleaned up.
                  localIdToDbOrderId.set(orderId, dbOrderId)
                  persistLocalIdMap()

                  // Migrate the serial addition chain from the old local key
                  // to the new db key so future items join the same chain.
                  const existingChain = orderAdditionChains.get(orderId)
                  if (existingChain) {
                    orderAdditionChains.set(dbOrderId, existingChain)
                    orderAdditionChains.delete(orderId)
                  }
                  const existingPending = pendingItemAdditions.get(orderId)
                  if (existingPending) {
                    pendingItemAdditions.set(dbOrderId, existingPending)
                    pendingItemAdditions.delete(orderId)
                  }

                  rekeyLinkedStores(orderId, dbOrderId)
                }

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
                      isMerge: isMergeOperation,
                      addedQuantity: newItem.quantity
                    }
                  )
                )
                  .then(success => {
                    // Resolve current order ID (may have been re-keyed)
                    const resolvedOrderId = get().ordersById[currentOrderId]
                      ? currentOrderId
                      : get().activeOrderId || currentOrderId
                    if (!success) {
                      updateItemSyncStatusAction(
                        resolvedOrderId,
                        syncItemId,
                        'failed',
                        'Backend sync failed'
                      )
                    }
                    return success
                  })
                  .catch(err => {
                    console.error('Background sync failed:', err)
                    const resolvedOrderId = get().ordersById[currentOrderId]
                      ? currentOrderId
                      : get().activeOrderId || currentOrderId
                    updateItemSyncStatusAction(
                      resolvedOrderId,
                      syncItemId,
                      'failed',
                      err?.message || 'Unknown error'
                    )
                    return false
                  })
                  .finally(() => {
                    // Unregister the sync operation when done
                    unregisterSyncOp(syncItemId)
                  })

                // Register the sync promise for barrier tracking
                registerSyncOp(syncItemId, syncPromise)
              }
            }

            // Phase 6: Schedule validation check (throttled, dev only)
            // scheduleValidation();
          },

          updateItemInActiveOrder: updatedItem => {
            const { activeOrderId, ordersById } = get()
            if (!activeOrderId) return

            const order = ordersById[activeOrderId] // O(1) lookup
            if (!order) return

            // Block editing items on closed checks
            if (order.check_status === 'Closed') {
              toastService.show({
                title: 'Check Closed',
                message: 'This check is closed. Reopen it to edit items.',
                type: 'warning'
              })
              return
            }

            // Phase 5: Any visible order can be modified - no ownership guard needed

            const originalItem = order.items.find(i => i.id === updatedItem.id)

            // Update items
            let updatedItems = order.items.map(i =>
              i.id === updatedItem.id ? updatedItem : i
            )
            if (__DEV__) {
              console.log(
                'updatedItems [updateItemInActiveOrder]',
                updatedItems.length,
                updatedItems
              )
            }

            // --- Merge detection: check if updated item now matches another cart item ---
            const coursingState = useCoursingStore.getState()
            const updatedItemCourse =
              coursingState.getForOrder(activeOrderId)?.itemCourseMap?.[
                updatedItem.id
              ] ?? 1
            const updatedItemKitchenStatus = updatedItem.kitchen_status
            const canUpdatedItemMerge =
              !updatedItem.isDraft &&
              (!updatedItemKitchenStatus || updatedItemKitchenStatus === 'new')

            let mergeTarget: CartItem | null = null
            if (canUpdatedItemMerge) {
              mergeTarget =
                updatedItems.find(cartItem => {
                  if (cartItem.id === updatedItem.id) return false
                  if (cartItem.isDraft) return false
                  if (
                    cartItem.kitchen_status &&
                    cartItem.kitchen_status !== 'new'
                  )
                    return false
                  const cartItemCourse =
                    coursingState.getForOrder(activeOrderId)?.itemCourseMap?.[
                      cartItem.id
                    ] ?? 1
                  if (cartItemCourse !== updatedItemCourse) return false
                  return areCartItemsMergeIdentical(
                    activeOrderId,
                    cartItem,
                    updatedItem
                  )
                }) ?? null
            }

            if (mergeTarget) {
              // Merge: add updated item's quantity to the merge target, remove updated item
              const mergedQuantity = mergeTarget.quantity + updatedItem.quantity
              const mergedPaidQuantity =
                (mergeTarget.paidQuantity || 0) +
                (updatedItem.paidQuantity || 0)
              updatedItems = updatedItems
                .map(item => {
                  if (item.id === mergeTarget!.id) {
                    return {
                      ...item,
                      quantity: mergedQuantity,
                      paidQuantity: mergedPaidQuantity,
                      sync_status: 'pending' as const
                    }
                  }
                  return item
                })
                .filter(item => item.id !== updatedItem.id)

              if (__DEV__) {
                console.log(
                  '[updateItemInActiveOrder] Merged item',
                  updatedItem.id,
                  'into',
                  mergeTarget.id,
                  'new quantity:',
                  mergedQuantity
                )
              }
            }

            // Calculate totals SYNCHRONOUSLY
            const taxRatesMap = useStoreSettingsStore.getState().taxRatesMap
            const totals = calculateOrderTotals(
              updatedItems,
              order.checkDiscount,
              order.payments || [],
              taxRatesMap
            )
            const itemsForState =
              order.checkDiscount && totals.discount_amount > 0
                ? distributeDiscountToItems(
                    updatedItems,
                    totals.discount_amount,
                    totals.cash_discount_amount
                  )
                : updatedItems

            // SINGLE ATOMIC UPDATE
            set(state => {
              const order = state.ordersById[activeOrderId]
              order.items = itemsForState
              order.total_amount = totals.total_amount
              order.total_tax = totals.tax_amount
              order.total_discount = totals.discount_amount
              order.amount_due = totals.outstanding_total
              order.cash_amount_due = totals.cash_outstanding_total
              state.activeOrderSubtotal = totals.subtotal
              state.activeOrderTax = totals.tax_amount
              state.activeOrderTotal = totals.total_amount
              state.activeOrderDiscount = totals.discount_amount
              state.activeOrderOutstandingSubtotal = totals.outstanding_subtotal
              state.activeOrderOutstandingTax = totals.outstanding_tax
              state.activeOrderOutstandingTotal = totals.outstanding_total
              state.activeOrderTotalCash = totals.cash_total_amount
              state.activeOrderOutstandingCash = totals.cash_outstanding_total
            })

            // Track mutation for own-station broadcast guard
            {
              const _dbId = get().ordersById[activeOrderId]?.db_order_id
              if (_dbId) lastLocalMutationAt[_dbId] = Date.now()
              lastLocalMutationAt[activeOrderId] = Date.now()
            }

            // Background sync (fire-and-forget)
            if (mergeTarget && _supabaseClient) {
              // --- MERGE SYNC PATH ---
              // 1. Update the surviving item's quantity on backend
              const survivorDbId = mergeTarget.db_order_item_id
              const removedDbId =
                updatedItem.db_order_item_id || originalItem?.db_order_item_id
              const orderId = activeOrderId
              const mergedQuantity = mergeTarget.quantity + updatedItem.quantity

              if (survivorDbId) {
                OrderService.updateOrderItemQuantity(
                  _supabaseClient,
                  survivorDbId,
                  mergedQuantity,
                  {
                    keyOverride: toUpdateQuantityKey(survivorDbId, mergedQuantity)
                  }
                )
                  .then(response => {
                    if (response.data && response.data.success) {
                      console.log('[merge] Survivor quantity sync succeeded')
                      try {
                        get().applyBackendItemData(mergeTarget!.id, {
                          quantity: response.data.quantity,
                          card_subtotal: response.data.card_subtotal,
                          card_tax_amount: response.data.card_tax_amount,
                          unit_price: response.data.unit_price,
                          cash_unit_price: response.data.cash_unit_price,
                          cash_subtotal: response.data.cash_subtotal,
                          cash_tax_amount: response.data.cash_tax_amount,
                          discount_amount: response.data.discount_amount,
                          discount_cash_amount:
                            response.data.discount_cash_amount,
                          sync_version: response.data.sync_version
                        })
                      } catch (err) {
                        console.error(
                          '[merge] Failed to apply survivor backend data:',
                          err
                        )
                      }
                    }
                  })
                  .catch(async err => {
                    console.error(
                      '[merge] Failed to sync survivor quantity:',
                      err
                    )
                    await queueOperation({
                      type: 'update_item_quantity',
                      params: {
                        orderItemId: survivorDbId,
                        quantity: mergedQuantity
                      },
                      localOrderId: orderId,
                      localItemId: mergeTarget!.id
                    })
                  })
              }

              // 2. Remove the merged-away item from backend
              if (removedDbId) {
                OrderService.removeOrderItem(_supabaseClient, removedDbId)
                  .then(() => {
                    console.log(
                      '[merge] Removed merged-away item from backend:',
                      removedDbId
                    )
                  })
                  .catch(async err => {
                    console.error(
                      '[merge] Failed to remove merged-away item:',
                      err
                    )
                    await queueOperation({
                      type: 'remove_item',
                      params: { orderItemId: removedDbId },
                      localOrderId: orderId,
                      localItemId: updatedItem.id
                    })
                  })
              }
            } else {
              // --- NORMAL SYNC PATH (no merge) ---
              const dbOrderItemId =
                updatedItem.db_order_item_id || originalItem?.db_order_item_id
              console.log('dbOrderItemId', dbOrderItemId)

              if (dbOrderItemId && _supabaseClient) {
                const orderId = activeOrderId
                console.log('syncing item update', updatedItem)
                console.log('originalItem', originalItem)
                console.log('updatedItem', updatedItem)
                console.log('originalItem quantity', originalItem?.quantity)
                console.log('updatedItem quantity', updatedItem.quantity)
                console.log(
                  'originalItem quantity !== updatedItem quantity',
                  originalItem?.quantity !== updatedItem.quantity
                )
                // 1. Sync quantity change (independent check)
                if (
                  originalItem &&
                  updatedItem.quantity !== originalItem.quantity
                ) {
                  OrderService.updateOrderItemQuantity(
                    _supabaseClient,
                    dbOrderItemId,
                    updatedItem.quantity,
                    {
                      keyOverride: toUpdateQuantityKey(
                        dbOrderItemId,
                        updatedItem.quantity
                      )
                    }
                  )
                    .then(response => {
                      if (response.data && response.data.success) {
                        // SUCCESS: Apply backend-calculated data immediately
                        console.log(
                          '[updateOrderItemQuantity] Sync succeeded, applying backend data'
                        )

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
                            discount_cash_amount:
                              response.data.discount_cash_amount,

                            sync_version: response.data.sync_version
                          })
                        } catch (err) {
                          console.error(
                            '[updateOrderItemQuantity] Failed to apply backend data:',
                            err
                          )
                        }
                      }
                    })
                    .catch(async err => {
                      console.error('Failed to sync quantity:', err)
                      // Queue for offline retry
                      await queueOperation({
                        type: 'update_item_quantity',
                        params: {
                          orderItemId: dbOrderItemId,
                          quantity: updatedItem.quantity
                        },
                        localOrderId: orderId,
                        localItemId: updatedItem.id
                      })
                    })
                }

                // 2. Sync instructions change (independent check)
                const originalNotes =
                  originalItem?.customizations?.notes?.trim() == undefined
                    ? ''
                    : originalItem?.customizations?.notes?.trim()
                const instructionsChanged =
                  updatedItem.customizations?.notes?.trim() !== originalNotes
                if (instructionsChanged) {
                  const updateItemParams = {
                    p_order_item_id: dbOrderItemId,
                    p_special_instructions:
                      updatedItem.customizations?.notes || null
                  }
                  OrderService.updateOrderItem(_supabaseClient, updateItemParams, {
                    keyOverride: toUpdateItemKey(updateItemParams)
                  })
                    .then(async response => {
                      // Bad-WiFi guard: queue if deadline-wrap fired.
                      if (response?.error?.code === 'DEADLINE_EXCEEDED') {
                        await queueOperation({
                          type: 'update_item',
                          params: {
                            orderItemId: dbOrderItemId,
                            specialInstructions:
                              updatedItem.customizations?.notes || null
                          },
                          localOrderId: orderId,
                          localItemId: updatedItem.id
                        })
                        return
                      }
                      if (response.data && response.data.success) {
                        // SUCCESS: Apply backend data (instructions don't change pricing, but include for consistency)
                        console.log('[updateOrderItem] Sync succeeded')

                        try {
                          get().applyBackendItemData(updatedItem.id, {
                            // Include any pricing data returned (for consistency)
                            card_subtotal: response.data.card_subtotal,
                            cash_subtotal: response.data.cash_subtotal,
                            card_tax_amount: response.data.card_tax_amount,
                            cash_tax_amount: response.data.cash_tax_amount,
                            sync_version: response.data.sync_version
                          })
                        } catch (err) {
                          console.error(
                            '[updateOrderItem] Failed to apply backend data:',
                            err
                          )
                        }
                      }
                    })
                    .catch(async err => {
                      console.error('Failed to sync item update:', err)
                      // Queue for offline retry
                      await queueOperation({
                        type: 'update_item',
                        params: {
                          orderItemId: dbOrderItemId,
                          specialInstructions:
                            updatedItem.customizations?.notes || null
                        },
                        localOrderId: orderId,
                        localItemId: updatedItem.id
                      })
                    })
                }

                // 3. Sync modifiers/add-ons change (independent check)
                const originalMods = JSON.stringify({
                  mods: originalItem?.customizations?.modifiers,
                  addons: originalItem?.customizations?.addOns
                })
                const newMods = JSON.stringify({
                  mods: updatedItem.customizations?.modifiers,
                  addons: updatedItem.customizations?.addOns
                })

                if (originalMods !== newMods) {
                  // Construct flat list of modifiers for the backend
                  const allModifiers: any[] = []

                  // Add standard modifiers
                  updatedItem.customizations?.modifiers?.forEach(group => {
                    group.options.forEach(opt => {
                      allModifiers.push({
                        modifier_group_id: group.categoryId,
                        modifier_item_id: opt.id,
                        modifier_group_name: group.categoryName,
                        modifier_name: opt.name,
                        price_modifier: opt.isNo ? 0 : opt.price,
                        quantity: 1,
                        is_no: opt.isNo ?? false
                      })
                    })
                  })

                  // Add Add-ons (treated as modifiers in "Add-ons" group)
                  updatedItem.customizations?.addOns?.forEach(addon => {
                    allModifiers.push({
                      modifier_item_id: addon.id,
                      modifier_group_name: 'Add-ons',
                      modifier_name: addon.name,
                      price_modifier: addon.price,
                      quantity: 1
                    })
                  })

                  OrderService.replaceOrderItemModifiers(
                    _supabaseClient,
                    dbOrderItemId,
                    allModifiers
                  )
                    .then(async response => {
                      // Bad-WiFi guard: deadline-wrap returns resolved promise on
                      // slow network. Queue here since .catch() won't fire.
                      if (response?.error?.code === 'DEADLINE_EXCEEDED') {
                        await queueOperation({
                          type: 'replace_modifiers',
                          params: {
                            orderItemId: dbOrderItemId,
                            modifiers: allModifiers
                          },
                          localOrderId: orderId,
                          localItemId: updatedItem.id
                        })
                        return
                      }
                      if (response.data && response.data.success) {
                        // SUCCESS: Apply backend-calculated data immediately
                        console.log(
                          '[replaceOrderItemModifiers] Sync succeeded, applying backend data'
                        )

                        try {
                          get().applyBackendItemData(updatedItem.id, {
                            // Card pricing
                            card_subtotal:
                              response.data.card_subtotal ??
                              response.data.new_subtotal,
                            card_tax_amount:
                              response.data.card_tax_amount ??
                              response.data.tax_update,
                            unit_price: response.data.new_unit_price,

                            // Cash pricing
                            cash_unit_price: response.data.cash_unit_price,
                            cash_subtotal: response.data.cash_subtotal,
                            cash_tax_amount: response.data.cash_tax_amount,

                            // Discounts
                            discount_amount: response.data.discount_amount,
                            discount_cash_amount:
                              response.data.discount_cash_amount,

                            // Modifiers (full array from backend)
                            modifiers: response.data.modifiers,

                            // Sync version for conflict detection
                            sync_version: response.data.sync_version
                          })
                        } catch (err) {
                          // Don't propagate - broadcast will catch it later
                          console.error(
                            '[replaceOrderItemModifiers] Failed to apply backend data:',
                            err
                          )
                        }
                      }
                    })
                    .catch(async err => {
                      console.error('Failed to sync modifiers:', err)
                      // Queue for offline retry
                      await queueOperation({
                        type: 'replace_modifiers',
                        params: {
                          orderItemId: dbOrderItemId,
                          modifiers: allModifiers
                        },
                        localOrderId: orderId,
                        localItemId: updatedItem.id
                      })
                    })
                }
              } else {
                // Item not yet synced to backend — update the pending add_item op
                // in the offline queue so it creates the item with the latest data
                const pendingOps = getPendingOperations()
                const addItemOp = pendingOps.find(
                  op =>
                    op.type === 'add_item' &&
                    op.localItemId === updatedItem.id &&
                    op.status === 'pending'
                )
                if (addItemOp) {
                  const updatedItemData = {
                    ...addItemOp.params.itemData,
                    quantity: updatedItem.quantity,
                    customizations: updatedItem.customizations,
                    name: updatedItem.name,
                    price: updatedItem.baseCardPrice ?? updatedItem.price,
                    cashPrice:
                      updatedItem.baseCashPrice ?? updatedItem.cashPrice
                  }
                  updateOperationParams(addItemOp.id, {
                    itemData: updatedItemData
                  })
                }
              }
            }
          },

          // LIGHTWEIGHT: Direct immer mutation for draft items only.
          // Skips merge detection, calculateOrderTotals, and sync — <1ms cost.
          updateDraftItem: (draftItemId, updates) => {
            const { activeOrderId } = get()
            if (!activeOrderId) return
            set(state => {
              const order = state.ordersById[activeOrderId]
              if (!order) return
              const items = original(order)?.items ?? []
              const idx = items.findIndex(i => i.id === draftItemId)
              if (idx !== -1) Object.assign(order.items[idx], updates)
            })
          },

          // LIGHTWEIGHT: Remove a single draft item by its id.
          // Skips calculateOrderTotals, void detection, and backend sync — <1ms cost.
          removeDraftItem: draftItemId => {
            const { activeOrderId } = get()
            if (!activeOrderId) return
            set(state => {
              const order = state.ordersById[activeOrderId]
              if (!order) return
              const items = original(order)?.items ?? []
              const idx = items.findIndex(
                i => i.id === draftItemId && i.isDraft
              )
              if (idx !== -1) order.items.splice(idx, 1)
            })
          },

          // LIGHTWEIGHT: Remove all draft items matching a menuItemId.
          // Skips calculateOrderTotals, void detection, and backend sync — <1ms cost.
          removeDraftItems: menuItemId => {
            const { activeOrderId } = get()
            if (!activeOrderId) return
            set(state => {
              const order = state.ordersById[activeOrderId]
              if (!order) return
              const items = original(order)?.items ?? []
              const toKeep = items.filter(
                i => !(i.isDraft && i.menuItemId === menuItemId)
              )
              order.items = toKeep
            })
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
              card_subtotal?: number
              card_tax_amount?: number
              unit_price?: number

              // Cash pricing
              cash_unit_price?: number
              cash_subtotal?: number
              cash_tax_amount?: number

              // Other fields
              quantity?: number
              discount_amount?: number
              discount_cash_amount?: number

              // Modifiers (only from replaceOrderItemModifiers)
              modifiers?: Array<{
                modifier_item_id?: string
                modifier_name: string
                modifier_group_id?: string
                modifier_group_name: string
                price_modifier: number
                quantity: number
              }>

              // Sync tracking
              sync_version?: number
            }
          ) => {
            const { activeOrderId, ordersById } = get()
            if (!activeOrderId) {
              console.warn('[applyBackendItemData] No active order')
              return
            }

            const order = ordersById[activeOrderId]
            if (!order) {
              console.warn('[applyBackendItemData] Active order not found')
              return
            }

            // Check sync_version to prevent applying stale data
            if (backendData.sync_version !== undefined) {
              const currentOrderVersion = order.sync_version ?? 0

              if (backendData.sync_version < currentOrderVersion) {
                // Backend version is older - skip stale data
                // This can happen if broadcast arrives before delayed sync callback
                console.warn(
                  `[applyBackendItemData] Skipping stale backend data for item ${itemId} ` +
                    `(backend v${backendData.sync_version} < local v${currentOrderVersion})`
                )
                return
              }
            }

            // Find and update the item
            const itemIndex = order.items.findIndex(item => item.id === itemId)
            if (itemIndex === -1) {
              console.warn(
                `[applyBackendItemData] Item ${itemId} not found in order`
              )
              return
            }

            const currentItem = order.items[itemIndex]

            // If this item currently has an in-flight sync operation, ignore backend
            // payloads that would reduce quantity. This prevents swipe increments
            // performed during sync from being rolled back by stale realtime updates.
            if (
              pendingSyncOperations.has(itemId) &&
              backendData.quantity !== undefined &&
              backendData.quantity < currentItem.quantity
            ) {
              console.warn(
                `[applyBackendItemData] Ignoring stale quantity rollback for item ${itemId} ` +
                  `(backend ${backendData.quantity} < local ${currentItem.quantity}) while sync pending`
              )
              return
            }

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
                unitPrice: backendData.unit_price
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
                  modifiers: transformBackendModifiers(backendData.modifiers)
                }
              }),

              // Mark as synced
              sync_status: 'synced' as const
            }

            // Create updated items array
            const updatedItems = [...order.items]
            updatedItems[itemIndex] = updatedItem

            // Recalculate order totals with updated items
            const taxRatesMap = useStoreSettingsStore.getState().taxRatesMap
            const totals = calculateOrderTotals(
              updatedItems,
              order.checkDiscount,
              order.payments || [],
              taxRatesMap
            )

            // Single atomic state update
            set(state => {
              const order = state.ordersById[activeOrderId]
              if (!order) return
              order.items = updatedItems

              // Update order-level totals from calculation
              order.total_amount = totals.total_amount
              order.total_tax = totals.tax_amount
              order.total_discount = totals.discount_amount
              order.amount_due = totals.outstanding_total
              order.cash_amount_due = totals.cash_outstanding_total

              // Update sync_version if provided
              if (backendData.sync_version !== undefined) {
                order.sync_version = backendData.sync_version
              }

              // Update derived active order state
              state.activeOrderSubtotal = totals.subtotal
              state.activeOrderTax = totals.tax_amount
              state.activeOrderTotal = totals.total_amount
              state.activeOrderDiscount = totals.discount_amount
              state.activeOrderOutstandingSubtotal = totals.outstanding_subtotal
              state.activeOrderOutstandingTax = totals.outstanding_tax
              state.activeOrderOutstandingTotal = totals.outstanding_total
              state.activeOrderTotalCash = totals.cash_total_amount
              state.activeOrderOutstandingCash = totals.cash_outstanding_total
            })

            console.log(
              `[applyBackendItemData] Applied backend data to item ${itemId}`,
              {
                card_subtotal: backendData.card_subtotal,
                cash_subtotal: backendData.cash_subtotal,
                sync_version: backendData.sync_version
              }
            )
          },

          updateItemStatusInActiveOrder: (itemId, status) => {
            const { activeOrderId, ordersById } = get()
            if (!activeOrderId) return

            const activeOrder = ordersById[activeOrderId] // O(1) lookup
            if (!activeOrder) return

            // Find the item being updated
            const itemToUpdate = activeOrder.items.find(i => i.id === itemId)

            // Trigger inventory depletion when an item is marked as "ready" or "served"
            if ((status === 'ready' || status === 'served') && itemToUpdate) {
              useInventoryStore.getState().decrementStockFromItem(itemToUpdate)
            }

            const order = activeOrder
            const updatedItems = order.items.map(i => {
              if (i.id === itemId) {
                const updatedItem = { ...i, item_status: status }
                if (
                  status === 'preparing' &&
                  (!i.kitchen_status || i.kitchen_status === 'new')
                ) {
                  updatedItem.kitchen_status = 'sent'
                } else if (status === 'ready') {
                  updatedItem.kitchen_status = 'ready'
                } else if (status === 'served') {
                  updatedItem.kitchen_status = 'served'
                }
                return updatedItem
              }
              return i
            })

            let newOrderStatus = order.order_status
            let allItemsServed = false

            if (
              order.order_type === 'dine_in' &&
              order.order_status !== 'draft' &&
              order.service_location_id !== null
            ) {
              allItemsServed = updatedItems.every(
                item => item.item_status === 'served'
              )
              const allItemsReady = updatedItems.every(
                item =>
                  item.item_status === 'ready' || item.item_status === 'served'
              )
              const anyItemsPreparing = updatedItems.some(
                item => item.item_status === 'preparing'
              )

              if (allItemsServed && updatedItems.length > 0) {
                newOrderStatus = 'completed'
              } else if (allItemsReady && updatedItems.length > 0) {
                newOrderStatus = 'ready'
              } else if (anyItemsPreparing) {
                newOrderStatus = 'preparing'
              }
            }

            set(state => {
              const order = state.ordersById[activeOrderId]
              if (!order) return
              order.items = updatedItems
              order.order_status = newOrderStatus
            })

            // Update table session status when all items are served
            if (
              allItemsServed &&
              updatedItems.length > 0 &&
              activeOrder.service_location_id
            ) {
              const tableSessionStore = useTableSessionStore.getState()
              const session =
                tableSessionStore.sessions[activeOrder.service_location_id]
              if (session && session.status === 'ordered') {
                // Update table session to "served" status (persists to database)
                tableSessionStore
                  .updateSessionStatus(session.id, 'served')
                  .catch(err => {
                    console.error(
                      '[updateItemStatusInActiveOrder] Failed to mark table as served:',
                      err
                    )
                  })
              }
            }

            // recalculateTotals(activeOrderId);
          },

          batchUpdateItemKitchenStatus: (itemIds, status) => {
            const { activeOrderId } = get()
            if (!activeOrderId) return

            const idSet = new Set(itemIds)

            set(state => {
              const order = state.ordersById[activeOrderId]
              if (!order) return

              for (const item of order.items) {
                if (!idSet.has(item.id)) continue
                if (
                  status === 'sent' &&
                  (!item.kitchen_status || item.kitchen_status === 'new')
                ) {
                  item.kitchen_status = 'sent'
                } else if (
                  status === 'preparing' &&
                  (!item.kitchen_status ||
                    item.kitchen_status === 'new' ||
                    item.kitchen_status === 'sent')
                ) {
                  item.kitchen_status = 'preparing'
                } else if (status === 'ready') {
                  item.kitchen_status = 'ready'
                } else if (status === 'served') {
                  item.kitchen_status = 'served'
                }
                item.item_status =
                  status === 'sent'
                    ? item.item_status
                    : status === 'preparing'
                    ? 'preparing'
                    : status === 'ready'
                    ? 'ready'
                    : status === 'served'
                    ? 'served'
                    : item.item_status
              }

              // Aggregate order_status for dine-in
              if (
                order.order_type === 'dine_in' &&
                order.order_status !== 'draft' &&
                order.service_location_id !== null
              ) {
                const allServed =
                  order.items.length > 0 &&
                  order.items.every(i => i.item_status === 'served')
                const allReady =
                  order.items.length > 0 &&
                  order.items.every(
                    i => i.item_status === 'ready' || i.item_status === 'served'
                  )
                const anyPreparing = order.items.some(
                  i => i.item_status === 'preparing'
                )

                if (allServed) order.order_status = 'completed'
                else if (allReady) order.order_status = 'ready'
                else if (anyPreparing) order.order_status = 'preparing'
              }
            })

            // Inventory depletion for ready/served
            if (status === 'ready' || status === 'served') {
              const order = get().ordersById[activeOrderId]
              if (order) {
                for (const item of order.items) {
                  if (idSet.has(item.id)) {
                    useInventoryStore.getState().decrementStockFromItem(item)
                  }
                }
              }
            }

            // Update table session status when all items are served
            if (status === 'served') {
              const order = get().ordersById[activeOrderId]
              if (
                order &&
                order.items.length > 0 &&
                order.items.every(
                  i => i.item_status === 'served' || i.item_status === 'Served'
                ) &&
                order.service_location_id
              ) {
                const tableSessionStore = useTableSessionStore.getState()
                const session =
                  tableSessionStore.sessions[order.service_location_id]
                if (session && session.status === 'ordered') {
                  tableSessionStore
                    .updateSessionStatus(session.id, 'served')
                    .catch(err => {
                      console.error(
                        '[batchUpdateItemKitchenStatus] Failed to mark table as served:',
                        err
                      )
                    })
                }
              }
            }
          },

          removeItemFromActiveOrder: (itemId, voidReason) => {
            // console.log('[removeItemFromActiveOrder] itemId', itemId);
            // console.log('[removeItemFromActiveOrder] voidReason', voidReason);
            const { activeOrderId, ordersById } = get()
            if (!activeOrderId) return
            if (!_checkCartEditable(get())) return

            const order = ordersById[activeOrderId] // O(1) lookup
            if (!order) return

            // Block removing items from closed checks
            if (order.check_status === 'Closed') {
              toastService.show({
                title: 'Check Closed',
                message: 'This check is closed. Reopen it to remove items.',
                type: 'warning'
              })
              return
            }

            // Phase 5: Any visible order can be modified - no ownership guard needed

            const itemToHandle = order.items.find(i => i.id === itemId)
            if (!itemToHandle) return
            // console.log('[removeItemFromActiveOrder] itemToHandle', itemToHandle);
            // Check if item is a kitchen item (sent/ready/served) - should mark as voided, not remove
            const isKitchenItem =
              itemToHandle.kitchen_status === 'sent' ||
              itemToHandle.kitchen_status === 'preparing' ||
              itemToHandle.kitchen_status === 'ready' ||
              itemToHandle.kitchen_status === 'served'

            let updatedItems: typeof order.items

            if (isKitchenItem && !itemToHandle.isDraft) {
              // Kitchen items: mark as voided instead of removing
              updatedItems = order.items.map(i =>
                i.id === itemId
                  ? {
                      ...i,
                      is_voided: true,
                      void_reason: voidReason || 'User voided'
                    }
                  : i
              )
            } else {
              // Draft/new items: remove completely
              updatedItems = order.items.filter(i => i.id !== itemId)
            }

            // Calculate totals SYNCHRONOUSLY
            const taxRatesMap = useStoreSettingsStore.getState().taxRatesMap
            const totals = calculateOrderTotals(
              updatedItems,
              order.checkDiscount,
              order.payments || [],
              taxRatesMap
            )

            // SINGLE ATOMIC UPDATE (instant UI)
            set(state => {
              const order = state.ordersById[activeOrderId]
              order.items = updatedItems
              order.total_amount = totals.total_amount
              order.total_tax = totals.tax_amount
              order.total_discount = totals.discount_amount
              order.amount_due = totals.outstanding_total
              order.cash_amount_due = totals.cash_outstanding_total
              state.activeOrderSubtotal = totals.subtotal
              state.activeOrderTax = totals.tax_amount
              state.activeOrderTotal = totals.total_amount
              state.activeOrderDiscount = totals.discount_amount
              state.activeOrderOutstandingSubtotal = totals.outstanding_subtotal
              state.activeOrderOutstandingTax = totals.outstanding_tax
              state.activeOrderOutstandingTotal = totals.outstanding_total
              state.activeOrderTotalCash = totals.cash_total_amount
              state.activeOrderOutstandingCash = totals.cash_outstanding_total
            })

            // Track mutation for own-station broadcast guard
            {
              const _dbId = get().ordersById[activeOrderId]?.db_order_id
              if (_dbId) lastLocalMutationAt[_dbId] = Date.now()
              lastLocalMutationAt[activeOrderId] = Date.now()
            }

            // If the add_item op is still pending in the offline queue (item
            // never reached backend), drop it. Otherwise the queue would replay
            // an add for an item the user already removed locally. Only drops
            // `pending` ops; in-flight `processing` ops complete normally and
            // the existing remove_item path below handles the cleanup.
            if (!itemToHandle?.db_order_item_id) {
              cancelPendingByEntity(`item:${itemId}`).catch(err => {
                if (__DEV__) {
                  console.warn('[removeItemFromActiveOrder] cancelPending failed:', err)
                }
              })
            }

            // Background sync (fire-and-forget)
            if (itemToHandle?.db_order_item_id && _supabaseClient) {
              const dbItemId = itemToHandle.db_order_item_id

              // Mark the item as pending-removal so stale broadcasts arriving
              // during the RPC window don't re-introduce it into the cart.
              markItemPendingRemoval(dbItemId)

              if (isKitchenItem) {
                // Item was sent to kitchen - use VOID (soft delete, keeps record)
                const reason = voidReason || 'User voided'
                OrderService.voidOrderItem(_supabaseClient, dbItemId, reason)
                  .then(async response => {
                    // Bad-WiFi guard: deadline-wrap resolves with error payload.
                    // Queue here so .catch() (only fires on thrown errors) doesn't miss it.
                    if (response?.error?.code === 'DEADLINE_EXCEEDED') {
                      await queueOperation({
                        type: 'void_item',
                        params: { orderItemId: dbItemId, reason },
                        localOrderId: activeOrderId,
                        localItemId: itemId
                      })
                    }
                  })
                  .catch(async err => {
                    console.error('Failed to void item:', err)
                    // Queue for offline retry
                    await queueOperation({
                      type: 'void_item',
                      params: { orderItemId: dbItemId, reason },
                      localOrderId: activeOrderId,
                      localItemId: itemId
                    })
                  })
                  .finally(() => {
                    clearItemPendingRemoval(dbItemId)
                  })
              } else {
                // Item was NOT sent to kitchen - use REMOVE (hard delete)
                OrderService.removeOrderItem(_supabaseClient, dbItemId)
                  .then(async response => {
                    if (response?.error?.code === 'DEADLINE_EXCEEDED') {
                      await queueOperation({
                        type: 'remove_item',
                        params: { orderItemId: dbItemId },
                        localOrderId: activeOrderId,
                        localItemId: itemId
                      })
                    }
                  })
                  .catch(async err => {
                    console.error('Failed to remove item:', err)
                    // Queue for offline retry
                    await queueOperation({
                      type: 'remove_item',
                      params: { orderItemId: dbItemId },
                      localOrderId: activeOrderId,
                      localItemId: itemId
                    })
                  })
                  .finally(() => {
                    clearItemPendingRemoval(dbItemId)
                  })
              }
            }
          },

          incrementItemQuantity: itemId => {
            const { activeOrderId, ordersById } = get()
            if (!activeOrderId) return
            if (!_checkCartEditable(get())) return
            const order = ordersById[activeOrderId]
            if (!order) return
            if (order.check_status === 'Closed') return

            const item = order.items.find(i => i.id === itemId)
            if (!item || item.is_voided) return

            const newQuantity = item.quantity + 1

            // 1. Update local state immediately
            const updatedItems = order.items.map(i =>
              i.id === itemId ? { ...i, quantity: newQuantity } : i
            )

            // A check discount is active when a valid checkDiscount exists AND
            // local order state confirms discount context (record/totals/item fields).
            const hasValidCheckDiscountValue =
              !!order.checkDiscount &&
              ((order.checkDiscount.type === 'percentage' &&
                order.checkDiscount.value > 0) ||
                (order.checkDiscount.type === 'fixed' &&
                  order.checkDiscount.value > 0))

            const hasOrderLevelDiscountRecord = (
              order.applied_discounts || []
            ).some(
              d => !d.applied_to_item_ids || d.applied_to_item_ids.length === 0
            )

            const hasItemDiscountSignals = order.items.some(
              i =>
                (i.discount_amount ?? 0) > 0 ||
                (i.discount_cash_amount ?? 0) > 0 ||
                !!i.appliedDiscount
            )

            const hasActiveCheckDiscount =
              hasValidCheckDiscountValue &&
              (hasOrderLevelDiscountRecord ||
                (order.total_discount ?? 0) > 0 ||
                hasItemDiscountSignals)

            const effectiveCheckDiscount = hasActiveCheckDiscount
              ? order.checkDiscount
              : null

            const taxRatesMap = useStoreSettingsStore.getState().taxRatesMap
            const totals = calculateOrderTotals(
              updatedItems,
              effectiveCheckDiscount,
              order.payments || [],
              taxRatesMap
            )

            const itemsForState =
              hasActiveCheckDiscount && totals.discount_amount > 0
                ? distributeDiscountToItems(
                    updatedItems,
                    totals.discount_amount,
                    totals.cash_discount_amount
                  )
                : distributeDiscountToItems(updatedItems, 0)
            set(state => {
              const o = state.ordersById[activeOrderId]
              if (!o) return
              o.items = itemsForState
              o.total_amount = totals.total_amount
              o.total_tax = totals.tax_amount
              o.total_discount = totals.discount_amount
              o.amount_due = totals.outstanding_total
              o.cash_amount_due = totals.cash_outstanding_total
              state.activeOrderSubtotal = totals.subtotal
              state.activeOrderTax = totals.tax_amount
              state.activeOrderTotal = totals.total_amount
              state.activeOrderDiscount = totals.discount_amount
              state.activeOrderOutstandingSubtotal = totals.outstanding_subtotal
              state.activeOrderOutstandingTax = totals.outstanding_tax
              state.activeOrderOutstandingTotal = totals.outstanding_total
              state.activeOrderTotalCash = totals.cash_total_amount
              state.activeOrderOutstandingCash = totals.cash_outstanding_total
            })

            // Track mutation for own-station broadcast guard
            {
              const _dbId = order.db_order_id
              if (_dbId) lastLocalMutationAt[_dbId] = Date.now()
              lastLocalMutationAt[activeOrderId] = Date.now()
            }

            const dbItemId = item.db_order_item_id
            const supabase = _supabaseClient

            if (!dbItemId || !supabase) {
              // Item not synced to DB yet — queue for when it is
              queueOperation({
                type: 'update_item_quantity',
                params: { orderItemId: itemId, quantity: newQuantity },
                localOrderId: activeOrderId,
                localItemId: itemId
              })
              return
            }

            // 2. Update quantity on DB — chain onto any existing in-flight promise
            //    for this item so rapid increments are serialized and the final
            //    quantity (as seen in local state) is always what gets sent.
            //    Chaining prevents the 2nd call from racing the 1st and sending
            //    a stale value, and prevents registerSyncOperation from losing
            //    the 1st promise (which would break waitForPendingSyncs).
            useSyncStatusStore.getState().setSyncStatus(itemId, 'pending')
            const existingPromise =
              pendingSyncOperations.get(itemId) ?? Promise.resolve(true)
            const quantityUpdatePromise: Promise<boolean> = existingPromise
              .then(() => {
                // Re-read quantity from store — a later increment may have raised it further
                const latestOrder = get().ordersById[activeOrderId]
                const latestItem = latestOrder?.items.find(i => i.id === itemId)
                const latestQuantity = latestItem?.quantity ?? newQuantity
                return OrderService.updateOrderItemQuantity(
                  supabase,
                  dbItemId,
                  latestQuantity,
                  { keyOverride: toUpdateQuantityKey(dbItemId, latestQuantity) }
                ).then(response => ({ response, latestQuantity }))
              })
              .then(async ({ response, latestQuantity }) => {
                // Bad-WiFi guard: deadline-wrap returns a resolved promise with
                // OFFLINE_QUEUED-shape error on slow network. Without this branch,
                // we'd fall through and lyingly mark sync_status='synced',
                // corrupting waitForPendingSyncs.
                if (response?.error?.code === 'DEADLINE_EXCEEDED') {
                  const latestQueuedQuantity =
                    get().ordersById[activeOrderId]?.items.find(
                      i => i.id === itemId
                    )?.quantity ?? latestQuantity
                  await queueOperation({
                    type: 'update_item_quantity',
                    params: {
                      orderItemId: dbItemId,
                      quantity: latestQueuedQuantity
                    },
                    localOrderId: activeOrderId,
                    localItemId: itemId
                  })
                  useSyncStatusStore.getState().setSyncStatus(itemId, 'synced')
                  return false
                }
                if (response.data?.success) {
                  // Ignore stale response if local quantity has advanced further.
                  // This prevents visual rollback when users increment repeatedly
                  // while an earlier quantity sync is still in flight.
                  const currentQuantity =
                    get().ordersById[activeOrderId]?.items.find(
                      i => i.id === itemId
                    )?.quantity ?? latestQuantity
                  const isStaleResponse = currentQuantity !== latestQuantity

                  if (isStaleResponse) {
                    return true
                  }

                  get().applyBackendItemData(itemId, {
                    quantity: response.data.quantity,
                    card_subtotal: response.data.card_subtotal,
                    card_tax_amount: response.data.card_tax_amount,
                    unit_price: response.data.unit_price,
                    cash_unit_price: response.data.cash_unit_price,
                    cash_subtotal: response.data.cash_subtotal,
                    cash_tax_amount: response.data.cash_tax_amount,
                    discount_amount: response.data.discount_amount,
                    discount_cash_amount: response.data.discount_cash_amount,
                    sync_version: response.data.sync_version
                  })
                }
                // Set synced AFTER applyBackendItemData so waitForPendingSyncs
                // only unblocks once the quantity is fully written to state.
                useSyncStatusStore.getState().setSyncStatus(itemId, 'synced')
                return true
              })
              .catch(async err => {
                console.error('[incrementItemQuantity] sync failed:', err)
                useSyncStatusStore.getState().setSyncStatus(itemId, 'synced') // unblock kitchen send
                const latestQueuedQuantity =
                  get().ordersById[activeOrderId]?.items.find(
                    i => i.id === itemId
                  )?.quantity ?? newQuantity
                await queueOperation({
                  type: 'update_item_quantity',
                  params: {
                    orderItemId: dbItemId,
                    quantity: latestQueuedQuantity
                  },
                  localOrderId: activeOrderId,
                  localItemId: itemId
                })
                return false
              })
              .finally(() => {
                // Only clear if this promise is still the latest one for this item.
                if (
                  pendingSyncOperations.get(itemId) === quantityUpdatePromise
                ) {
                  get().unregisterSyncOperation(itemId)
                }
              })
            get().registerSyncOperation(itemId, quantityUpdatePromise)
          },

          confirmDraftItem: itemId => {
            const { activeOrderId, ordersById } = get()
            if (!activeOrderId) return

            const order = ordersById[activeOrderId]
            if (!order) return

            const itemToConfirm = order.items.find(i => i.id === itemId)
            console.log('[confirmDraftItem] itemToConfirm', itemToConfirm)
            if (!itemToConfirm) return

            const updatedItems = order.items.map(i =>
              i.id === itemId
                ? {
                    ...i,
                    isDraft: false,
                    kitchen_status: 'new' as const,
                    sync_status: 'pending' as const
                  }
                : i
            )

            // Calculate totals
            const taxRatesMap = useStoreSettingsStore.getState().taxRatesMap
            const totals = calculateOrderTotals(
              updatedItems,
              order.checkDiscount,
              order.payments || [],
              taxRatesMap
            )

            set(state => {
              const order = state.ordersById[activeOrderId]
              order.items = updatedItems
              order.total_amount = totals.total_amount
              order.total_tax = totals.tax_amount
              order.total_discount = totals.discount_amount
              order.amount_due = totals.outstanding_total
              order.cash_amount_due = totals.cash_outstanding_total
              state.activeOrderSubtotal = totals.subtotal
              state.activeOrderTax = totals.tax_amount
              state.activeOrderTotal = totals.total_amount
              state.activeOrderDiscount = totals.discount_amount
              state.activeOrderOutstandingSubtotal = totals.outstanding_subtotal
              state.activeOrderOutstandingTax = totals.outstanding_tax
              state.activeOrderOutstandingTotal = totals.outstanding_total
              state.activeOrderTotalCash = totals.cash_total_amount
              state.activeOrderOutstandingCash = totals.cash_outstanding_total
            })

            // Phase 7D: Set pending status in sync store for BillItem indicator
            useSyncStatusStore.getState().setSyncStatus(itemId, 'pending')

            // Sync the confirmed item to backend
            const orderToSync = get().ordersById[activeOrderId]
            if (orderToSync) {
              const updateItemSyncStatusAction = get().updateItemSyncStatus
              const registerSyncOp = get().registerSyncOperation
              const unregisterSyncOp = get().unregisterSyncOperation
              const currentOrderId = activeOrderId

              // OFFLINE-FIRST: Mark item as failed instead of removing it
              const markItemFailedAction = (
                itemIdToMark: string,
                error: string
              ) => {
                updateItemSyncStatusAction(
                  currentOrderId,
                  itemIdToMark,
                  'failed',
                  error
                )
              }

              const setOrderDbIdAction = (
                orderId: string,
                dbOrderId: string,
                orderNumber: string,
                displayNumber: string,
                createdAt: string,
                syncVersion?: number
              ) => {
                if (orderId !== dbOrderId) {
                  // Full rekey needed — replicate addItemToActiveOrder's logic
                  set(state => {
                    const existingOrder = state.ordersById[orderId]
                    if (!existingOrder) return

                    const snapshot = current(existingOrder)
                    delete state.ordersById[orderId]
                    state.ordersById[dbOrderId] = freeze({
                      ...snapshot,
                      id: dbOrderId,
                      db_order_id: dbOrderId,
                      order_number: orderNumber,
                      display_number: displayNumber,
                      sync_status: 'synced' as const,
                      sync_version: syncVersion ?? 1,
                      opened_at: snapshot.opened_at || createdAt
                    })

                    const idx = state.orderIds.indexOf(orderId)
                    if (idx !== -1) state.orderIds[idx] = dbOrderId
                    if (state.activeOrderId === orderId)
                      state.activeOrderId = dbOrderId
                    const wsIdx = state.workingSetOrderIds.indexOf(orderId)
                    if (wsIdx !== -1)
                      state.workingSetOrderIds[wsIdx] = dbOrderId
                    state.dbOrderIdIndex[dbOrderId] = dbOrderId
                    delete state.dbOrderIdIndex[orderId]
                    if (state.persistableOrderIds[orderId]) {
                      delete state.persistableOrderIds[orderId]
                      state.persistableOrderIds[dbOrderId] = true
                    }

                    syncTableOrderIdIndexForOrder(state, dbOrderId, snapshot)
                  })

                  // Migrate chain maps to new key
                  const existingChain = orderAdditionChains.get(orderId)
                  if (existingChain) {
                    orderAdditionChains.set(dbOrderId, existingChain)
                    orderAdditionChains.delete(orderId)
                  }
                  const existingPending = pendingItemAdditions.get(orderId)
                  if (existingPending) {
                    pendingItemAdditions.set(dbOrderId, existingPending)
                    pendingItemAdditions.delete(orderId)
                  }

                  rekeyLinkedStores(orderId, dbOrderId)
                } else {
                  set(state => {
                    const order = state.ordersById[orderId]
                    if (!order) return
                    const previousOrder = current(order)
                    order.db_order_id = dbOrderId
                    order.order_number = orderNumber
                    order.display_number = displayNumber
                    order.sync_status = 'synced'
                    order.sync_version = syncVersion ?? 1
                    order.opened_at = order.opened_at || createdAt
                    state.dbOrderIdIndex[dbOrderId] = orderId
                    syncTableOrderIdIndexForOrder(state, orderId, previousOrder)
                  })
                }

                // Record persistent localId → dbOrderId mapping
                localIdToDbOrderId.set(orderId, dbOrderId)
                persistLocalIdMap()
              }

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
                .then(success => {
                  // Phase 7C: Removed redundant "synced" call - addItemToBackend
                  // already sets sync status to "synced" via useSyncStatusStore
                  if (!success) {
                    updateItemSyncStatusAction(
                      currentOrderId,
                      itemId,
                      'failed',
                      'Backend sync failed'
                    )
                  }
                  return success
                })
                .catch(err => {
                  console.error('Confirm draft sync failed:', err)
                  updateItemSyncStatusAction(
                    currentOrderId,
                    itemId,
                    'failed',
                    err?.message || 'Unknown error'
                  )
                  return false
                })
                .finally(() => {
                  unregisterSyncOp(itemId)
                })

              // Register the sync promise for barrier tracking
              registerSyncOp(itemId, syncPromise)
            }
          },

          updateActiveOrderDetails: async details => {
            const { activeOrderId, ordersById } = get()
            if (!activeOrderId) return
            if (!_checkCartEditable(get())) return

            const order = ordersById[activeOrderId]
            if (!order) return

            // Update local state immediately (optimistic update)
            set(state => {
              const previousOrder = current(state.ordersById[activeOrderId])
              Object.assign(state.ordersById[activeOrderId], details)
              syncTableOrderIdIndexForOrder(state, activeOrderId, previousOrder)
            })

            // Sync to backend
            const supabase = _supabaseClient
            const isOnline = getIsOnline()

            if (!supabase || !order.db_order_id) {
              console.log(
                '[updateActiveOrderDetails] No supabase client or db_order_id, local-only update'
              )
              return
            }

            if (!isOnline) {
              console.log(
                '[updateActiveOrderDetails] Offline - queuing update_order_details'
              )
              if (order.db_order_id) {
                queueFailedOperation(
                  'update_order_details',
                  {
                    customer_name: details.customer_name,
                    customer_id: details.customer_id,
                    customer_phone: details.customer_phone,
                    customer_email: details.customer_email,
                    guest_count: details.guest_count,
                    service_location_id: order.service_location_id,
                    db_order_id: order.db_order_id,
                    order_type: details.order_type,
                    delivery_address: details.delivery_address,
                    notes: details.notes
                  },
                  activeOrderId
                )
              }
              return
            }

            let syncNeeded = false

            // Sync customer details to orders table
            if (details.customer_name !== undefined) {
              try {
                const { error } = await supabase
                  .from('orders')
                  .update({
                    customer_name: details.customer_name,
                    customer_id: details.customer_id,
                    customer_phone:
                      details.customer_phone ?? order.customer_phone ?? null,
                    customer_email:
                      details.customer_email ?? order.customer_email ?? null
                  })
                  .eq('id', order.db_order_id)

                if (error) {
                  console.error('Failed to sync customer details:', error)
                } else {
                  console.log('Synced customer details to backend')
                  syncNeeded = true
                }
              } catch (error) {
                console.error('Failed to sync customer details:', error)
              }
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
                ]
              const sessionId = table?.session?.id

              if (sessionId) {
                try {
                  const { error } = await supabase
                    .from('table_sessions')
                    .update({ party_size: details.guest_count })
                    .eq('id', sessionId)

                  if (error) {
                    console.error('Failed to sync guest_count:', error)
                  } else {
                    console.log('Synced guest_count to backend')
                    syncNeeded = true
                  }
                } catch (error) {
                  console.error('Failed to sync guest_count:', error)
                }
              }
            }

            // Sync order_type to orders table
            if (details.order_type !== undefined) {
              const dbOrderType =
                details.order_type?.toLowerCase() || order.order_type
              try {
                const { error } = await supabase
                  .from('orders')
                  .update({ order_type: dbOrderType })
                  .eq('id', order.db_order_id)
                if (error) console.error('Failed to sync order_type:', error)
                else syncNeeded = true
              } catch (error) {
                console.error('Failed to sync order_type:', error)
              }
            }

            // Sync delivery_address to orders table
            if (details.delivery_address !== undefined) {
              try {
                const { error } = await supabase
                  .from('orders')
                  .update({ delivery_address: details.delivery_address })
                  .eq('id', order.db_order_id)
                if (error)
                  console.error('Failed to sync delivery_address:', error)
                else syncNeeded = true
              } catch (error) {
                console.error('Failed to sync delivery_address:', error)
              }
            }

            // Sync order notes to orders.special_instructions
            if (details.notes !== undefined) {
              try {
                const { error } = await supabase
                  .from('orders')
                  .update({ special_instructions: details.notes || null })
                  .eq('id', order.db_order_id)
                if (error) console.error('Failed to sync notes:', error)
                else syncNeeded = true
              } catch (error) {
                console.error('Failed to sync notes:', error)
              }
            }

            // Sync verification: Refresh order from backend to ensure local state matches
            if (syncNeeded && order.db_order_id) {
              try {
                await get().syncOrderFromBackendComplete(order.db_order_id)
                console.log(
                  '[updateActiveOrderDetails] Post-update sync completed'
                )
              } catch (syncError) {
                console.warn(
                  '[updateActiveOrderDetails] Post-update sync failed:',
                  syncError
                )
                // Non-blocking - local state is still valid, will reconcile via broadcast
              }
            }
          },

          applyDiscountToCheck: (orderId, discountInput) => {
            console.log('[applyDiscountToCheck] discountInput', discountInput)
            if (!_checkCartEditable(get(), orderId)) return
            const order = get().ordersById[orderId]
            if (!order) return

            // Normalize incoming discount
            const isRecord = (discountInput as any).discount_type !== undefined
            const rawRecordDiscountType = isRecord
              ? (discountInput as any).discount_type
              : undefined
            const isLegacyFixedPreset =
              isRecord && rawRecordDiscountType === 'fixed'
            const normalizedDiscount: Discount = isRecord
              ? {
                  id: (discountInput as any).id,
                  label: (discountInput as any).name,
                  value:
                    (discountInput as any).discount_type === 'percentage'
                      ? (discountInput as any).discount_value / 100
                      : (discountInput as any).discount_value,
                  type:
                    (discountInput as any).discount_type === 'percentage'
                      ? 'percentage'
                      : 'fixed'
                }
              : (discountInput as Discount)

            const taxRatesMap = useStoreSettingsStore.getState().taxRatesMap
            const totals = calculateOrderTotals(
              order.items,
              normalizedDiscount,
              order.payments || [],
              taxRatesMap
            )

            // Build applied discount metadata for syncing
            const preDiscountSubtotal = totals.subtotal
            const calculatedAmount =
              normalizedDiscount.type === 'percentage'
                ? preDiscountSubtotal * normalizedDiscount.value
                : normalizedDiscount.value

            // Get staff ID from employee store
            const staffId =
              useEmployeeStore.getState().loggedInEmployee?.profileId ?? null

            // Build discount name
            const discountName = isRecord
              ? (discountInput as any).name ??
                normalizedDiscount.label ??
                'Discount'
              : normalizedDiscount.label ?? 'Discount'

            // Legacy preset data guard:
            // Some presets are stored with discount_type='fixed' in discounts table.
            // Passing discount_id for those causes manage_order_discount to use invalid enum value.
            const effectiveDiscountId =
              isRecord && !isLegacyFixedPreset
                ? (discountInput as any).id ?? null
                : null
            const effectiveSource =
              isRecord && !isLegacyFixedPreset ? 'preset' : 'open'

            // Get discount_value in raw form (percentage as 10 for 10%, fixed as dollar amount)
            const rawDiscountValue = isRecord
              ? (discountInput as any).discount_value
              : normalizedDiscount.type === 'percentage'
              ? normalizedDiscount.value * 100
              : normalizedDiscount.value

            const applied: OrderAppliedDiscount = {
              local_id: `discount_${Date.now()}`,
              discount_id: effectiveDiscountId,
              discount_type:
                normalizedDiscount.type === 'percentage'
                  ? 'percentage'
                  : 'fixed_amount',
              discount_value: rawDiscountValue,
              discount_name: discountName,
              source: effectiveSource,
              calculated_amount: Math.round(calculatedAmount * 100) / 100,
              pre_discount_subtotal: preDiscountSubtotal,
              applied_by_staff_profiles_id: staffId,
              // For custom discounts, auto-approve with the applying staff member
              // Preset discounts use their own approval settings from the discounts table
              approved_by_staff_profiles_id: isRecord ? null : staffId,
              applied_at: new Date().toISOString(),
              sync_status: order.db_order_id ? 'pending' : 'pending'
            }

            // Capture previously synced backend discounts so we can void them before applying a new one.
            const previousSyncedDiscountIds = (order.applied_discounts || [])
              .map(d => d.order_discount_id)
              .filter((id): id is string => !!id)

            // Update state optimistically - distribute discount to items locally
            // This ensures split payment views show correct prices even before RPC completes
            const itemsWithDistributedDiscount = distributeDiscountToItems(
              order.items,
              totals.discount_amount,
              totals.cash_discount_amount
            )

            set(state => {
              const order = state.ordersById[orderId]
              if (!order) return
              order.items = itemsWithDistributedDiscount
              order.checkDiscount = normalizedDiscount
              // Single active check discount locally; treat new apply as replacement.
              order.applied_discounts = [applied]
              order.total_amount = totals.total_amount
              order.total_tax = totals.tax_amount
              order.total_discount = totals.discount_amount
              // Keep amount_due in sync with outstanding_total for OrderBadge display
              order.amount_due = totals.outstanding_total
              order.cash_amount_due = totals.cash_outstanding_total

              if (orderId === get().activeOrderId) {
                state.activeOrderSubtotal = totals.subtotal
                state.activeOrderTax = totals.tax_amount
                state.activeOrderTotal = totals.total_amount
                state.activeOrderDiscount = totals.discount_amount
                state.activeOrderOutstandingSubtotal =
                  totals.outstanding_subtotal
                state.activeOrderOutstandingTax = totals.outstanding_tax
                state.activeOrderOutstandingTotal = totals.outstanding_total
                state.activeOrderTotalCash = totals.cash_total_amount
                state.activeOrderOutstandingCash = totals.cash_outstanding_total
              }
            })

            // Sync via RPC or queue for offline
            const supabase = _supabaseClient
            const dbOrderId = order.db_order_id
            const isOnline = getIsOnline()

            // Cancel stale queued apply_discount ops for this order to avoid replaying old discounts.
            const pendingOps = getOperationsForOrder(orderId)
            for (const op of pendingOps) {
              if (op.type === 'apply_discount') {
                removeOperation(op.id)
              }
            }

            const isPositiveAmountsConstraint = (errorLike: any): boolean => {
              const text =
                typeof errorLike === 'string'
                  ? errorLike
                  : `${errorLike?.message || ''} ${errorLike?.details || ''} ${
                      errorLike?.code || ''
                    }`
              return text.includes('positive_amounts') || text.includes('23514')
            }

            const isInvalidDiscountEnum = (errorLike: any): boolean => {
              const text =
                typeof errorLike === 'string'
                  ? errorLike
                  : `${errorLike?.message || ''} ${errorLike?.details || ''} ${
                      errorLike?.code || ''
                    }`
              return (
                text.includes('invalid input value for enum discount_type') ||
                text.includes('22P02')
              )
            }

            if (supabase && dbOrderId && isOnline && staffId) {
              console.log(
                '[applyDiscountToCheck] syncing discount via RPC',
                applied
              )
              const runApplyRpc = () =>
                OrderDiscountService.applyDiscount(supabase, {
                  order_id: dbOrderId,
                  staff_id: staffId,
                  discount_id: applied.discount_id,
                  discount_name: discountName,
                  discount_type: applied.discount_type,
                  discount_value: applied.discount_value,
                  source: applied.source as 'preset' | 'open' | 'promo_code',
                  reason: null,
                  applied_to_item_ids: null,
                  approved_by_staff_id:
                    applied.approved_by_staff_profiles_id ?? null
                })

              const voidPreviousSyncedDiscounts = async () => {
                for (const orderDiscountId of previousSyncedDiscountIds) {
                  await OrderDiscountService.voidDiscount(supabase, {
                    order_id: dbOrderId,
                    staff_id: staffId,
                    order_discount_id: orderDiscountId,
                    void_reason: null
                  })
                }
              }

              ;(previousSyncedDiscountIds.length > 0
                ? voidPreviousSyncedDiscounts().then(() => runApplyRpc())
                : runApplyRpc()
              )
                .then(result => {
                  if (result.success && result.order_discount_id) {
                    // Update local state with backend order_discount_id, mark as synced,
                    // and merge affected_items with authoritative discount values from backend
                    set(state => {
                      const existingOrder = state.ordersById[orderId]
                      if (!existingOrder?.applied_discounts) return

                      // Define type for affected items from backend
                      interface AffectedItemFromBackend {
                        id: string
                        discount_amount: number
                        subtotal: number
                        cash_subtotal: number
                        tax_amount: number
                        cash_tax_amount: number
                      }

                      // Build map of affected items by db_order_item_id
                      const affectedMap = new Map<
                        string,
                        AffectedItemFromBackend
                      >(
                        (result.affected_items || []).map(
                          (ai: AffectedItemFromBackend) => [ai.id, ai]
                        )
                      )

                      // Update items with authoritative discount values from backend
                      const updatedItems = existingOrder.items.map(item => {
                        const affected = affectedMap.get(
                          item.db_order_item_id || ''
                        )
                        if (affected) {
                          return {
                            ...item,
                            discount_amount: affected.discount_amount,
                            discount_cash_amount: affected.discount_amount, // Use same for now, backend doesn't return separate cash
                            subtotal: affected.subtotal,
                            cashSubtotal: affected.cash_subtotal,
                            taxAmount: affected.tax_amount,
                            cashTaxAmount: affected.cash_tax_amount
                          }
                        }
                        return item
                      })

                      existingOrder.items = updatedItems
                      existingOrder.applied_discounts =
                        existingOrder.applied_discounts.map(d =>
                          d.local_id === applied.local_id
                            ? {
                                ...d,
                                order_discount_id: result.order_discount_id,
                                sync_status: 'synced' as const
                              }
                            : d
                        )
                    })
                    console.log(
                      '[applyDiscountToCheck] RPC success, order_discount_id:',
                      result.order_discount_id,
                      'affected_items:',
                      result.affected_items?.length
                    )

                    // Post-discount verification: schedule a full sync to catch concurrent changes
                    if (dbOrderId) {
                      setTimeout(() => {
                        useOrderStore
                          .getState()
                          .syncOrderFromBackendComplete(orderId)
                      }, 1000)
                    }

                    // Check if discount was removed while apply was in flight
                    const currentOrder =
                      useOrderStore.getState().ordersById[orderId]
                    const wasRemoved =
                      !currentOrder?.checkDiscount &&
                      !currentOrder?.applied_discounts?.some(
                        d => d.local_id === applied.local_id
                      )

                    if (wasRemoved && result.order_discount_id) {
                      console.warn(
                        '[applyDiscountToCheck] Discount removed during apply, voiding immediately'
                      )
                      OrderDiscountService.voidDiscount(supabase, {
                        order_id: dbOrderId,
                        staff_id: staffId,
                        order_discount_id: result.order_discount_id,
                        void_reason: null
                      })
                        .then(voidResult => {
                          if (voidResult.success) {
                            console.log(
                              '[applyDiscountToCheck] Auto-voided stale discount:',
                              result.order_discount_id
                            )
                            if (dbOrderId) {
                              setTimeout(() => {
                                useOrderStore
                                  .getState()
                                  .syncOrderFromBackendComplete(orderId)
                              }, 1000)
                            }
                          }
                        })
                        .catch(err =>
                          console.error(
                            '[applyDiscountToCheck] Auto-void error:',
                            err
                          )
                        )
                    }
                  } else if (result.requires_approval) {
                    console.warn(
                      '[applyDiscountToCheck] Discount requires manager approval'
                    )
                    // Could emit an event or show a toast here
                  } else if (!result.success) {
                    console.error(
                      '[applyDiscountToCheck] RPC failed:',
                      result.error
                    )
                    if (
                      !isPositiveAmountsConstraint(result.error) &&
                      !isInvalidDiscountEnum(result.error)
                    ) {
                      // Queue for retry only for transient failures.
                      queueOperation({
                        type: 'apply_discount',
                        params: {
                          localOrderId: orderId,
                          discount: applied
                        },
                        localOrderId: orderId
                      } as any)
                    } else {
                      console.error(
                        '[applyDiscountToCheck] Not queueing non-retryable discount apply failure'
                      )
                    }
                  }
                })
                .catch(err => {
                  console.error(
                    'Failed to sync discount via RPC, queueing:',
                    err
                  )
                  if (
                    !isPositiveAmountsConstraint(err) &&
                    !isInvalidDiscountEnum(err)
                  ) {
                    queueOperation({
                      type: 'apply_discount',
                      params: {
                        localOrderId: orderId,
                        discount: applied
                      },
                      localOrderId: orderId
                    } as any)
                  } else {
                    console.error(
                      '[applyDiscountToCheck] Not queueing non-retryable discount apply failure'
                    )
                  }
                })
            } else {
              // Offline or no db_order_id yet - queue for later
              queueOperation({
                type: 'apply_discount',
                params: {
                  localOrderId: orderId,
                  discount: applied
                },
                localOrderId: orderId
              } as any)
            }
          },

          removeCheckDiscount: orderId => {
            if (!_checkCartEditable(get(), orderId)) return
            const order = get().ordersById[orderId]
            if (!order) return

            // Get applied discounts that need to be voided (any synced discount, regardless of source)
            const discountsToVoid = (order.applied_discounts || []).filter(
              d => d.order_discount_id
            )

            // Warn about unsynced discounts that can't be voided on backend
            const unsyncedDiscounts = (order.applied_discounts || []).filter(
              d => !d.order_discount_id && d.sync_status === 'pending'
            )
            if (unsyncedDiscounts.length > 0) {
              console.warn(
                '[removeCheckDiscount] Discounts not yet synced, cannot void on backend:',
                unsyncedDiscounts.map(d => d.local_id)
              )

              // Cancel pending apply_discount queue ops for unsynced discounts
              const pendingOps = getOperationsForOrder(orderId)
              for (const unsynced of unsyncedDiscounts) {
                const matchingOp = pendingOps.find(
                  op =>
                    op.type === 'apply_discount' &&
                    (op.params as any)?.discount?.local_id === unsynced.local_id
                )
                if (matchingOp) {
                  removeOperation(matchingOp.id)
                  console.log(
                    '[removeCheckDiscount] Cancelled pending apply_discount op:',
                    matchingOp.id,
                    'for local_id:',
                    unsynced.local_id
                  )
                }
              }
            }

            const taxRatesMap = useStoreSettingsStore.getState().taxRatesMap
            const totals = calculateOrderTotals(
              order.items,
              null,
              order.payments || [],
              taxRatesMap
            )

            // Clear item-level discounts optimistically (mirrors applyDiscountToCheck)
            const itemsWithClearedDiscount = distributeDiscountToItems(
              order.items,
              0
            )

            // Update state optimistically
            set(state => {
              const o = state.ordersById[orderId]
              if (!o) return
              o.items = itemsWithClearedDiscount
              o.checkDiscount = null
              o.applied_discounts = []
              o.total_amount = totals.total_amount
              o.total_tax = totals.tax_amount
              o.total_discount = totals.discount_amount
              // Keep amount_due in sync with outstanding_total for OrderBadge display
              o.amount_due = totals.outstanding_total
              o.cash_amount_due = totals.cash_outstanding_total

              if (orderId === get().activeOrderId) {
                state.activeOrderSubtotal = totals.subtotal
                state.activeOrderTax = totals.tax_amount
                state.activeOrderTotal = totals.total_amount
                state.activeOrderDiscount = totals.discount_amount
                state.activeOrderOutstandingSubtotal =
                  totals.outstanding_subtotal
                state.activeOrderOutstandingTax = totals.outstanding_tax
                state.activeOrderOutstandingTotal = totals.outstanding_total
                state.activeOrderTotalCash = totals.cash_total_amount
                state.activeOrderOutstandingCash = totals.cash_outstanding_total
              }
            })

            // Void discounts on backend
            const supabase = _supabaseClient
            const dbOrderId = order.db_order_id
            const staffId =
              useEmployeeStore.getState().loggedInEmployee?.profileId ?? null
            const isOnline = getIsOnline()

            if (
              supabase &&
              dbOrderId &&
              isOnline &&
              staffId &&
              discountsToVoid.length > 0
            ) {
              // Void each synced discount
              for (const discount of discountsToVoid) {
                if (discount.order_discount_id) {
                  OrderDiscountService.voidDiscount(supabase, {
                    order_id: dbOrderId,
                    staff_id: staffId,
                    order_discount_id: discount.order_discount_id,
                    void_reason: null
                  })
                    .then(result => {
                      if (!result.success) {
                        console.error(
                          '[removeCheckDiscount] Failed to void discount:',
                          result.error
                        )
                      } else {
                        console.log(
                          '[removeCheckDiscount] Successfully voided discount:',
                          discount.order_discount_id
                        )

                        // Merge affected_items into local state (mirrors applyDiscountToCheck)
                        set(state => {
                          const existingOrder = state.ordersById[orderId]
                          if (!existingOrder) return

                          interface AffectedItemFromBackend {
                            id: string
                            discount_amount: number
                            subtotal: number
                            cash_subtotal: number
                            tax_amount: number
                            cash_tax_amount: number
                          }

                          const affectedMap = new Map<
                            string,
                            AffectedItemFromBackend
                          >(
                            (result.affected_items || []).map(
                              (ai: AffectedItemFromBackend) => [ai.id, ai]
                            )
                          )

                          const updatedItems = existingOrder.items.map(item => {
                            const affected = affectedMap.get(
                              item.db_order_item_id || ''
                            )
                            if (affected) {
                              return {
                                ...item,
                                discount_amount: affected.discount_amount,
                                discount_cash_amount: affected.discount_amount,
                                subtotal: affected.subtotal,
                                cashSubtotal: affected.cash_subtotal,
                                taxAmount: affected.tax_amount,
                                cashTaxAmount: affected.cash_tax_amount
                              }
                            }
                            return item
                          })

                          existingOrder.items = updatedItems
                        })

                        // Schedule full sync for consistency
                        if (dbOrderId) {
                          setTimeout(() => {
                            useOrderStore
                              .getState()
                              .syncOrderFromBackendComplete(orderId)
                          }, 1000)
                        }
                      }
                    })
                    .catch(err => {
                      console.error('[removeCheckDiscount] RPC error:', err)
                      // Queue for retry
                      queueOperation({
                        type: 'void_discount',
                        params: {
                          localOrderId: orderId,
                          order_discount_id: discount.order_discount_id,
                          void_reason: null
                        },
                        localOrderId: orderId
                      } as any)
                    })
                }
              }
            } else if (discountsToVoid.length > 0) {
              // Offline - queue void operations
              for (const discount of discountsToVoid) {
                if (discount.order_discount_id) {
                  queueOperation({
                    type: 'void_discount',
                    params: {
                      localOrderId: orderId,
                      order_discount_id: discount.order_discount_id,
                      void_reason: null
                    },
                    localOrderId: orderId
                  } as any)
                }
              }
            }
          },

          applyDiscountToItem: (orderId, itemId) => {
            if (!_checkCartEditable(get(), orderId)) return
            const order = get().ordersById[orderId]
            if (!order) return

            const updatedItems = order.items.map(item => {
              if (item.id === itemId && item.availableDiscount) {
                return { ...item, appliedDiscount: item.availableDiscount }
              }
              return item
            })

            const taxRatesMap = useStoreSettingsStore.getState().taxRatesMap
            const totals = calculateOrderTotals(
              updatedItems,
              order.checkDiscount,
              order.payments || [],
              taxRatesMap
            )

            set(state => {
              const o = state.ordersById[orderId]
              if (!o) return
              o.items = updatedItems
              o.total_amount = totals.total_amount
              o.total_tax = totals.tax_amount
              o.total_discount = totals.discount_amount
              // Keep amount_due in sync with outstanding_total for OrderBadge display
              o.amount_due = totals.outstanding_total
              o.cash_amount_due = totals.cash_outstanding_total

              if (orderId === get().activeOrderId) {
                state.activeOrderSubtotal = totals.subtotal
                state.activeOrderTax = totals.tax_amount
                state.activeOrderTotal = totals.total_amount
                state.activeOrderDiscount = totals.discount_amount
                state.activeOrderOutstandingSubtotal =
                  totals.outstanding_subtotal
                state.activeOrderOutstandingTax = totals.outstanding_tax
                state.activeOrderOutstandingTotal = totals.outstanding_total
                state.activeOrderTotalCash = totals.cash_total_amount
                state.activeOrderOutstandingCash = totals.cash_outstanding_total
              }
            })
          },

          removeDiscountFromItem: (orderId, itemId) => {
            if (!_checkCartEditable(get(), orderId)) return
            const order = get().ordersById[orderId]
            if (!order) return

            const updatedItems = order.items.map(item =>
              item.id === itemId ? { ...item, appliedDiscount: null } : item
            )

            const taxRatesMap = useStoreSettingsStore.getState().taxRatesMap
            const totals = calculateOrderTotals(
              updatedItems,
              order.checkDiscount,
              order.payments || [],
              taxRatesMap
            )

            set(state => {
              const o = state.ordersById[orderId]
              if (!o) return
              o.items = updatedItems
              o.total_amount = totals.total_amount
              o.total_tax = totals.tax_amount
              o.total_discount = totals.discount_amount
              // Keep amount_due in sync with outstanding_total for OrderBadge display
              o.amount_due = totals.outstanding_total
              o.cash_amount_due = totals.cash_outstanding_total

              if (orderId === get().activeOrderId) {
                state.activeOrderSubtotal = totals.subtotal
                state.activeOrderTax = totals.tax_amount
                state.activeOrderTotal = totals.total_amount
                state.activeOrderDiscount = totals.discount_amount
                state.activeOrderOutstandingSubtotal =
                  totals.outstanding_subtotal
                state.activeOrderOutstandingTax = totals.outstanding_tax
                state.activeOrderOutstandingTotal = totals.outstanding_total
                state.activeOrderTotalCash = totals.cash_total_amount
                state.activeOrderOutstandingCash = totals.cash_outstanding_total
              }
            })
          },

          assignOrderToTable: (orderId, tableId) => {
            set(state => {
              const order = state.ordersById[orderId]
              if (!order) return
              const previousOrder = current(order)
              order.service_location_id = tableId
              order.order_type = 'dine_in' // Ensure order_type is set to dine_in when table assigned
              syncTableOrderIdIndexForOrder(state, orderId, previousOrder)
            })

            // CRITICAL: Sync order_type change to backend if order is already synced
            // This ensures backend order_type matches local order_type before send-to-kitchen
            const order = get().ordersById[orderId]
            if (order?.db_order_id) {
              const supabase = _supabaseClient
              const isOnline = getIsOnline()

              if (!isOnline) {
                // Queue for offline sync
                queueFailedOperation(
                  'update_order_details',
                  {
                    db_order_id: order.db_order_id,
                    service_location_id: tableId,
                    order_type: 'dine_in'
                  },
                  orderId
                )
              } else if (supabase) {
                // Sync immediately online (fire-and-forget, errors logged)
                ;(async () => {
                  const { error } = await supabase
                    .from('orders')
                    .update({
                      order_type: 'dine_in',
                      table_number: tableId
                    })
                    .eq('id', order.db_order_id)

                  if (error) {
                    console.error(
                      '[assignOrderToTable] Failed to sync order_type to backend:',
                      error
                    )
                  } else {
                    console.log(
                      '[assignOrderToTable] Successfully synced order_type to backend'
                    )
                  }
                })()
              }
            }
          },

          assignActiveOrderToTable: tableId => {
            const { activeOrderId, ordersById } = get()
            if (!activeOrderId) return

            const orderToAssign = ordersById[activeOrderId] // O(1) lookup
            if (!orderToAssign || orderToAssign.items.length === 0) {
              console.warn('Cannot assign an empty order to a table.')
              toastService.show({
                title: 'Empty Cart',
                message: 'Cannot assign an empty order to a table.',
                type: 'error'
              })
              return
            }

            // For dine-in orders, check if the order is paid before assigning
            if (
              orderToAssign.order_type === 'dine_in' &&
              orderToAssign.paid_status !== 'Paid'
            ) {
              toastService.show({
                title: 'Payment Required',
                message:
                  'This order must be paid before it can be assigned to a table.',
                type: 'error'
              })
              return
            }

            // Create new order for next customer
            const newGlobalOrder: OrderProfile = {
              id: `order_${Date.now()}`,
              service_location_id: null,
              order_status: 'draft',
              check_status: 'Opened',
              paid_status: 'Unpaid',
              items: [],
              opened_at: new Date().toISOString()
            }

            // Single atomic update
            set(state => {
              const order = state.ordersById[activeOrderId]
              if (order) {
                const previousOrder = current(order)
                order.service_location_id = tableId
                order.order_type = 'Dine In' as const
                order.order_status = 'preparing' as const
                syncTableOrderIdIndexForOrder(
                  state,
                  activeOrderId,
                  previousOrder
                )
              }
              state.ordersById[newGlobalOrder.id] = newGlobalOrder
              state.orderIds.push(newGlobalOrder.id)
              syncTableOrderIdIndexForOrder(state, newGlobalOrder.id)
              state.activeOrderId = newGlobalOrder.id
              // Reset active order totals for new empty order
              state.activeOrderSubtotal = 0
              state.activeOrderTax = 0
              state.activeOrderTotal = 0
              state.activeOrderDiscount = 0
              state.activeOrderOutstandingSubtotal = 0
              state.activeOrderOutstandingTax = 0
              state.activeOrderOutstandingTotal = 0
              state.activeOrderTotalCash = 0
            })

            // Background sync
            const supabase = getOrderStoreSupabaseClient()
            if (supabase && orderToAssign.db_order_id) {
              OrderService.updateOrderStatus(
                supabase,
                orderToAssign.db_order_id,
                'preparing'
              ).catch(err => console.error('Failed to sync status:', err))
            }
          },

          updateOrderStatus: (orderId, status) => {
            const order = get().ordersById[orderId] // O(1) lookup

            // Sync to backend in background
            const supabase = getOrderStoreSupabaseClient()
            if (supabase && order?.db_order_id) {
              const dbOrderId = order.db_order_id
              OrderService.updateOrderStatus(supabase, dbOrderId, status).catch(
                async err => {
                  console.error('Failed to sync status:', err)
                  // Queue for offline retry
                  await queueOperation({
                    type: 'update_order_status',
                    params: { orderId: dbOrderId, status },
                    localOrderId: orderId
                  })
                }
              )
            }

            set(state => {
              const order = state.ordersById[orderId]
              if (!order) return
              const previousOrder = current(order)
              order.order_status = status
              if (status === 'completed' || status === 'void') {
                order.check_status = 'Closed' as const
              }
              syncTableOrderIdIndexForOrder(state, orderId, previousOrder)
            })
          },

          updateOrderCheckStatus: async (orderId, status) => {
            // O(1) order resolution via direct key or dbOrderIdIndex
            const storeKey = get().dbOrderIdIndex[orderId] ?? orderId
            const order = get().ordersById[storeKey]

            console.log('[updateOrderCheckStatus] called', {
              orderId,
              storeKey,
              status,
              found: !!order
            })
            if (!order) return

            // 1. Optimistic local update first
            set(state => {
              const order = state.ordersById[storeKey]
              if (!order) return
              order.check_status = status
            })

            // 2. Sync to backend
            const supabase = getOrderStoreSupabaseClient()
            const isOnline = getIsOnline()

            if (!supabase || !order.db_order_id) {
              console.log(
                `[updateOrderCheckStatus] No supabase client or db_order_id, local-only update`
              )
              return
            }

            if (!isOnline) {
              console.log(
                `[updateOrderCheckStatus] Offline - queuing for later sync`
              )
              // Queue operation for later
              await queueOperation({
                type: status === 'Closed' ? 'close_check' : 'reopen_check',
                params: {
                  p_order_id: order.db_order_id,
                  p_staff_id:
                    useEmployeeStore.getState().loggedInEmployee?.profileId ||
                    null
                },
                localOrderId: storeKey
              })
              return
            }

            // Online - sync immediately
            const dbOrderId = order.db_order_id
            const staffId =
              useEmployeeStore.getState().loggedInEmployee?.profileId

            try {
              if (status === 'Closed') {
                console.log(
                  `[updateOrderCheckStatus] Closing check for order ${dbOrderId}`
                )
                const result = await OrderService.closeCheck(
                  supabase,
                  dbOrderId,
                  staffId
                )
                if (!result.success) {
                  console.error(
                    `[updateOrderCheckStatus] closeCheck failed:`,
                    result.error
                  )
                  // Rollback local state on failure
                  set(state => {
                    const order = state.ordersById[storeKey]
                    if (order) order.check_status = 'Opened' // Rollback
                  })
                }
              } else {
                console.log(
                  `[updateOrderCheckStatus] Reopening check for order ${dbOrderId}`
                )
                if (!staffId) {
                  console.error(
                    `[updateOrderCheckStatus] No staff ID for reopenCheck`
                  )
                  return
                }
                const result = await OrderService.reopenCheck(
                  supabase,
                  dbOrderId,
                  staffId
                )
                if (!result.success) {
                  console.error(
                    `[updateOrderCheckStatus] reopenCheck failed:`,
                    result.error
                  )
                  // Rollback local state on failure
                  set(state => {
                    const order = state.ordersById[storeKey]
                    if (order) order.check_status = 'Closed' // Rollback
                  })
                }
              }
            } catch (error) {
              console.error(`[updateOrderCheckStatus] Error:`, error)
              // Rollback on exception
              set(state => {
                const order = state.ordersById[storeKey]
                if (order)
                  order.check_status = status === 'Closed' ? 'Opened' : 'Closed' // Rollback
              })
            }
          },

          addPaymentToOrder: async ({
            orderId,
            amount,
            method,
            cardBrand,
            last4,
            tipAmount,
            transactionDetails,
            dejavooTransaction,
            itemAllocations, // Per-item allocations with quantities for partial payments
            splitCount, // Optional: split count for split payments
            splitPortionIndex, // Optional: split portion index for split payments
            forceCardPricing // Force card pricing for custom amount payments
          }) => {
            // ================================================================
            // OFFLINE-FIRST: Process payment locally, sync in background
            // ================================================================
            // We NO LONGER block on pending syncs - payments proceed immediately
            // Local state is updated optimistically, backend sync happens later
            // This allows payments to work even when offline or with slow network

            if (!_checkCartEditable(get(), orderId)) return false

            const order = get().ordersById[orderId] // O(1) lookup
            if (!order) return false

            const prePaymentTotals = calculateOrderTotals(
              order.items,
              order.checkDiscount,
              order.payments || [],
              useStoreSettingsStore.getState().taxRatesMap
            )
            const outstandingBeforePayment =
              method === 'Cash' && !forceCardPricing
                ? prePaymentTotals.cash_outstanding_total
                : prePaymentTotals.outstanding_total

            if (outstandingBeforePayment <= 0.01) {
              toastService.show({
                title: 'Already Paid',
                message: 'No unpaid items remaining on this order.',
                type: 'warning'
              })
              return false
            }

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
              activeOrderOutstandingCash: get().activeOrderOutstandingCash
            }

            // Generate unique local ID and timestamp for this payment
            // This is critical for matching payments during sync (prevents collapse issue)
            const localPaymentId = `payment_${Date.now()}_${Math.random()
              .toString(36)
              .substr(2, 9)}`
            const paymentTimestamp = new Date().toISOString()

            // Determine if this is a cash-priced payment (cash method without forceCardPricing)
            const isCashPayment = method === 'Cash' && !forceCardPricing

            // Compute cashSavings for cash-priced payments (matches backend original_amount - amount)
            // cashSavings = card-equivalent amount - cash amount paid
            // This tells calculateOrderTotals to treat the cash amount as covering the full card equivalent
            let cashSavingsValue: number | undefined
            if (isCashPayment) {
              const taxRatesMapForSavings =
                useStoreSettingsStore.getState().taxRatesMap
              const prePmtTotals = calculateOrderTotals(
                order.items,
                order.checkDiscount,
                order.payments || [],
                taxRatesMapForSavings
              )
              const cardOutstanding = prePmtTotals.outstanding_total
              const cashOutstanding = prePmtTotals.cash_outstanding_total
              if (cashOutstanding > 0 && cardOutstanding > cashOutstanding) {
                // Proportional: ratio of this payment to cash outstanding * total savings
                const ratio = Math.min(amount / cashOutstanding, 1)
                cashSavingsValue = parseFloat(
                  (ratio * (cardOutstanding - cashOutstanding)).toFixed(2)
                )
              }

              // FALLBACK 1: Backend-synced amount_due / cash_amount_due ratio
              // These fields are set from the backend and preserved through
              // recalculations (recalculateOrder lines 11264-11271 keep backend
              // values). Unlike total_cash_amount which gets overwritten by
              // the frontend calculator, amount_due/cash_amount_due are stable.
              if (cashSavingsValue == null || cashSavingsValue <= 0) {
                const cardDue = order.amount_due
                const cashDue = order.cash_amount_due
                if (
                  cardDue != null &&
                  cashDue != null &&
                  cashDue > 0 &&
                  cardDue > cashDue
                ) {
                  cashSavingsValue = parseFloat(
                    (amount * (cardDue / cashDue - 1)).toFixed(2)
                  )
                }
              }

              // FALLBACK 2: Store's dual_pricing_percentage
              // Last resort for offline or before first backend sync.
              // Approximate — backend sync corrects via deriveCashSavings.
              if (cashSavingsValue == null || cashSavingsValue <= 0) {
                const dualPricingPct =
                  useStoreSettingsStore.getState().selectedStore
                    ?.dual_pricing_percentage
                if (dualPricingPct != null && dualPricingPct > 0) {
                  const rate = dualPricingPct / 100
                  cashSavingsValue = parseFloat(
                    ((amount * rate) / (1 - rate)).toFixed(2)
                  )
                }
              }
            }

            // --- Mark items as paid FIRST, then derive itemsCovered from actual deltas ---
            // This ensures itemsCovered reflects what was actually covered (esp. FIFO partial)

            let updatedItems: typeof order.items

            // SPLIT PAYMENT FIX: Always mark PAID items as preparing, not just when order is draft/pending
            // This ensures items paid in subsequent splits (when order is already "preparing") also get updated
            // Each item's status is updated individually based on whether IT is being paid now

            if (itemAllocations && itemAllocations.length > 0) {
              // Build a map for quick lookup: itemId -> quantity being paid
              const allocationMap = new Map(
                itemAllocations.map(alloc => [alloc.itemId, alloc.quantity])
              )

              console.log(
                '[allocationMap | addPaymentToOrder] allocationMap',
                allocationMap
              )
              // Per-item payment: Increment paidQuantity by the specified quantity (not full quantity)
              updatedItems = order.items.map(item => {
                // Match by db_order_item_id first, fall back to local item.id for offline items
                const quantityToPay =
                  allocationMap.get(item.db_order_item_id || '') ??
                  allocationMap.get(item.id)
                if (quantityToPay !== undefined && quantityToPay > 0) {
                  const newPaidQty = Math.min(
                    (item.paidQuantity || 0) + quantityToPay,
                    item.quantity // Don't exceed total quantity
                  )
                  const isFullyPaid = newPaidQty >= item.quantity
                  // Update this item's status to preparing if it's currently "new"
                  const shouldUpdateThisItem =
                    item.kitchen_status === 'new' || !item.kitchen_status
                  return {
                    ...item,
                    paidQuantity: newPaidQty,
                    // Update kitchen and item status for items that haven't been sent yet
                    ...(shouldUpdateThisItem && {
                      kitchen_status: 'sent' as const,
                      item_status: 'Preparing' as const
                    })
                  }
                }
                return item
              })
            } else {
              // Default FIFO: Mark items as paid in order until amount is exhausted
              let remaining = amount
              updatedItems = order.items.map(item => {
                const unitPrice =
                  method === 'Cash'
                    ? item.cashPrice ?? item.baseCashPrice ?? item.price
                    : item.price
                const unpaidQty = item.quantity - (item.paidQuantity || 0)
                if (remaining <= 0 || unpaidQty <= 0) return item

                const maxCoverQty = Math.min(
                  unpaidQty,
                  Math.floor(remaining / unitPrice + 1e-6)
                )
                if (maxCoverQty <= 0) return item
                remaining -= maxCoverQty * unitPrice
                // Update this item's status to preparing if it's currently "new"
                const shouldUpdateThisItem =
                  item.kitchen_status === 'new' || !item.kitchen_status
                return {
                  ...item,
                  paidQuantity: (item.paidQuantity || 0) + maxCoverQty,
                  // Update kitchen and item status for items that haven't been sent yet
                  ...(shouldUpdateThisItem && {
                    kitchen_status: 'sent' as const,
                    item_status: 'Preparing' as const
                  })
                }
              })
            }

            // Rebuild itemsCovered from actual paidQuantity deltas (source of truth)
            // This prevents the bug where FIFO covers 2/4 but itemsCovered said 4/4
            const itemsCovered: OrderPaymentItemCoverage[] = updatedItems
              .map(updatedItem => {
                const originalItem = order.items.find(
                  i => i.id === updatedItem.id
                )
                const delta =
                  (updatedItem.paidQuantity || 0) -
                  (originalItem?.paidQuantity || 0)
                if (delta <= 0) return null
                const unitPrice = isCashPayment
                  ? updatedItem.cashPrice ??
                    updatedItem.baseCashPrice ??
                    updatedItem.price ??
                    0
                  : updatedItem.price || 0
                return {
                  itemId: updatedItem.db_order_item_id || updatedItem.id,
                  itemName: updatedItem.name || 'Unknown Item',
                  quantity: delta,
                  unitPrice,
                  subtotal: unitPrice * delta
                }
              })
              .filter((c): c is OrderPaymentItemCoverage => c !== null)

            if (itemsCovered.length === 0) {
              toastService.show({
                title: 'No Unpaid Items',
                message: 'Select unpaid items or adjust payment amount.',
                type: 'warning'
              })
              return false
            }

            const newPayment: OrderProfilePayment = {
              id: localPaymentId, // Use local ID as temporary main ID
              localId: localPaymentId, // Unique local identifier for sync matching
              amount,
              method,
              timestamp: paymentTimestamp,
              sync_status: 'pending',
              sync_attempt_count: 0,
              tip_amount: tipAmount || 0,
              total_collected: amount + (tipAmount || 0),
              itemsCovered,
              status: 'captured', // Locally deemed captured until sync says otherwise
              isVoided: false,
              ...(cardBrand && { cardBrand }),
              ...(last4 && { last4 }),
              ...(transactionDetails && { transactionDetails }),
              // Extract cash-specific fields to top level for consistency with backend-synced payments
              ...(transactionDetails?.amountTendered != null && {
                amountTendered: transactionDetails.amountTendered
              }),
              ...(transactionDetails?.changeGiven != null && {
                changeGiven: transactionDetails.changeGiven
              }),
              // Cash pricing fields — mirrors backend is_cash_priced / original_amount mapping
              ...(isCashPayment && {
                isCashPriced: true,
                ...(cashSavingsValue != null &&
                  cashSavingsValue > 0 && {
                    cashSavings: cashSavingsValue
                  })
              }),
              // Track split info for reconciliation
              ...(splitCount &&
                splitPortionIndex && {
                  splitInfo: {
                    portionIndex: splitPortionIndex,
                    totalPortions: splitCount,
                    isLastPortion: splitPortionIndex === splitCount
                  }
                })
            }

            const newPayments = [...(order.payments || []), newPayment]

            // Calculate totals
            const taxRatesMap = useStoreSettingsStore.getState().taxRatesMap
            const totals = calculateOrderTotals(
              updatedItems,
              order.checkDiscount,
              newPayments,
              taxRatesMap
            )

            // Determine if order is fully paid based on outstanding amount
            const isFullyPaid =
              method === 'Cash'
                ? totals.cash_outstanding_total <= 0.01
                : totals.outstanding_total <= 0.01 // Allow tiny rounding margin

            // Determine new order status:
            // - If order is in "draft" and payment is made, move to "preparing"
            // - If order is already "preparing" or later, keep current status
            // - If order is fully paid, it stays at current status (kitchen flow continues)
            const currentStatus = order.order_status
            const shouldUpdateToPreparingStatus =
              currentStatus === 'draft' || currentStatus === 'pending'
            const newOrderStatus = shouldUpdateToPreparingStatus
              ? 'preparing'
              : currentStatus

            // Set opened_at timestamp when transitioning to preparing (if not already set)
            const shouldSetOpenedAt =
              shouldUpdateToPreparingStatus && !order.opened_at
            const newOpenedAt = shouldSetOpenedAt
              ? new Date().toISOString()
              : order.opened_at

            // Single atomic update with optimistic payment status
            set(state => {
              const currentOrder = state.ordersById[orderId]
              if (!currentOrder) return

              // Merge db_order_item_id from latest state into updatedItems
              // This prevents the race condition where addItemToBackend sets
              // db_order_item_id between when we captured the snapshot and now
              const mergedItems = updatedItems.map(updatedItem => {
                const latestItem = currentOrder.items.find(
                  i => i.id === updatedItem.id
                )
                if (
                  latestItem?.db_order_item_id &&
                  !updatedItem.db_order_item_id
                ) {
                  return {
                    ...updatedItem,
                    db_order_item_id: latestItem.db_order_item_id
                  }
                }
                return updatedItem
              })

              // Merge in any NEW items added between snapshot and now
              const mergedItemIds = new Set(mergedItems.map(i => i.id))
              const newItemsSinceSnapshot = currentOrder.items.filter(
                i => !mergedItemIds.has(i.id)
              )
              const finalItems = [...mergedItems, ...newItemsSinceSnapshot]

              currentOrder.payments = newPayments
              currentOrder.items = finalItems
              currentOrder.total_amount = totals.total_amount // Always card total
              currentOrder.total_cash_amount = totals.cash_total_amount // Always set for dual pricing display
              currentOrder.total_tax = totals.tax_amount // Always card tax
              currentOrder.total_discount = totals.discount_amount
              // Update order_status to "preparing" if it was in draft/pending
              currentOrder.order_status = newOrderStatus
              // Set opened_at timestamp when transitioning
              currentOrder.opened_at = newOpenedAt
              // Optimistic update — cash-priced full settlement should read Paid
              // even when card-equivalent reconciliation still depends on cashSavings.
              currentOrder.paid_status = isFullyPaid
                ? ('Paid' as const)
                : calculatePaidStatus(newPayments, totals.total_amount)
              currentOrder.check_status = currentOrder.check_status || 'Opened'
              // Sync amount_paid/amount_due to prevent stale values
              currentOrder.amount_paid =
                (currentOrder.amount_paid || 0) + amount
              currentOrder.amount_due = totals.outstanding_total
              currentOrder.cash_amount_due = totals.cash_outstanding_total

              // Add active order updates if applicable
              if (orderId === get().activeOrderId) {
                state.activeOrderSubtotal = totals.subtotal
                state.activeOrderTax = totals.tax_amount
                state.activeOrderTotal = totals.total_amount
                state.activeOrderDiscount = totals.discount_amount
                state.activeOrderOutstandingSubtotal =
                  totals.outstanding_subtotal
                state.activeOrderOutstandingTax = totals.outstanding_tax
                state.activeOrderOutstandingTotal = totals.outstanding_total
                state.activeOrderTotalCash = totals.cash_total_amount
                state.activeOrderOutstandingCash = totals.cash_outstanding_total
              }

              // Ensure order is persisted while it has unsynced payment data
              state.persistableOrderIds[orderId] = true
            })

            // Sync to backend - await result and return success/failure
            // Pass rollbackState to revert optimistic updates on sync failure
            // For offline/per-item flows, ensure we pass backend IDs when available.
            // This allows the offline queue to resolve them later when items sync.
            const paymentItemAllocations = itemAllocations
              ? itemAllocations.map(alloc => {
                  const item = order.items.find(
                    i =>
                      i.db_order_item_id === alloc.itemId ||
                      i.id === alloc.itemId
                  )
                  // Prefer backend ID if present, otherwise use local ID
                  return {
                    itemId: item?.db_order_item_id || item?.id || alloc.itemId,
                    quantity: alloc.quantity,
                    amount: alloc.amount
                  }
                })
              : undefined

            // Fire-and-forget: sync to backend in background
            // Local optimistic state is already applied above — show success immediately
            // syncPaymentToBackend handles failures internally (queues for retry, reverts on exception)
            syncPaymentToBackend(
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
                dejavooTransaction,
                forceCardPricing // Force card pricing for custom amount payments
              },
              rollbackState // Previous state for rollback on failure
            ).catch(err => {
              console.error('[addPaymentToOrder] Background sync failed:', err)
            })

            return true
          },

          markOrderAsPaid: (orderId: string) => {
            const { ordersById, activeOrderDiscount } = get()
            const order = ordersById[orderId] // O(1) lookup
            if (!order) return

            // Note: Inventory deduction is handled by archiveOrder when order is archived/completed

            // Calculate using sync function
            const taxRatesMap = useStoreSettingsStore.getState().taxRatesMap
            const totals = calculateOrderTotals(
              order.items,
              order.checkDiscount,
              order.payments || [],
              taxRatesMap
            )

            set(state => {
              const order = state.ordersById[orderId]
              if (!order) return
              order.paid_status = 'Paid' as const
              order.check_status = order.check_status || 'Opened'
              order.total_amount = totals.total_amount
              order.total_tax = totals.tax_amount
              order.total_discount = totals.discount_amount
              // Fully paid orders have 0 outstanding
              order.amount_due = 0
              order.cash_amount_due = 0
            })
          },

          setPendingTableSelection: tableId => {
            set({ pendingTableSelection: tableId })
          },

          syncOrderStatus: orderId => {
            syncOrderStatus(orderId)
          },

          archiveOrder: (orderId: string) => {
            const { ordersById, orderIds } = get()
            const order = ordersById[orderId]

            if (!order) {
              console.warn(`[archiveOrder] Order ${orderId} not found`)
              return null
            }

            // Validate order is in archivable state
            const isArchivable =
              ['void', 'completed', 'cancelled', 'ready'].includes(
                order.order_status as string
              ) ||
              order.check_status === 'Closed' ||
              order.paid_status === 'Paid'

            if (!isArchivable) {
              console.warn(`[archiveOrder] Order ${orderId} not archivable:`, {
                order_status: order.order_status,
                check_status: order.check_status,
                paid_status: order.paid_status
              })
              return null
            }

            if (__DEV__)
              console.log(`[archiveOrder] Archiving order ${orderId}`, {
                status: order.order_status,
                check_status: order.check_status,
                total: order.total_amount,
                items: order.items.length
              })

            // Trigger stock deduction: Local + Backend
            if (order.items.length > 0) {
              try {
                // 1. Update local store immediately
                useInventoryStore.getState().decrementStockFromSale(order.items)
                if (__DEV__)
                  console.log(`[archiveOrder] Local inventory decremented`)

                // 2. Sync to backend (non-blocking)
                if (order.db_order_id) {
                  const supabase = getOrderStoreSupabaseClient()
                  if (supabase) {
                    supabase
                      .rpc('process_order_inventory_deduction', {
                        p_order_id: order.db_order_id
                      })
                      .then(({ error }) => {
                        if (error) {
                          console.error(
                            '[archiveOrder] Backend inventory deduction failed:',
                            error
                          )
                          // Queue for retry if needed
                        } else {
                          if (__DEV__)
                            console.log(
                              '[archiveOrder] Backend inventory deduction successful'
                            )
                        }
                      })
                  }
                }
              } catch (err) {
                console.error('[archiveOrder] Inventory deduction error:', err)
                // Continue archiving despite error
              }
            }

            const tableId = order.service_location_id

            // Ensure the order has a final status. If not "Voided", set it to "Closed".
            const now = new Date().toISOString()
            const finalOrder = {
              ...order,
              order_status:
                order.order_status === 'void'
                  ? ('void' as const)
                  : ('completed' as const),
              closed_at: order.closed_at || now,
              items: order.items.map(item => ({
                ...item,
                kitchen_status:
                  item.kitchen_status === 'new' ||
                  item.kitchen_status === 'sent' ||
                  item.kitchen_status === 'preparing'
                    ? ('ready' as const)
                    : item.kitchen_status || ('ready' as const),
                item_status:
                  item.item_status === 'Preparing' ||
                  item.item_status === 'preparing' ||
                  !item.item_status
                    ? ('ready' as const)
                    : item.item_status
              })),
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
                    useStoreSettingsStore.getState().taxRatesMap
                  let taxSum = 0
                  for (const item of order.items) {
                    if (item.is_tax_exempt) continue
                    const taxCategory = item.tax_category || 'standard'
                    const taxRatePercent = taxRatesMap[taxCategory] ?? 0
                    taxSum +=
                      item.price * item.quantity * (taxRatePercent / 100)
                  }
                  return taxSum
                })()
            }

            // Audit log
            if (__DEV__)
              console.log(`[archiveOrder] Successfully archived`, {
                orderId,
                db_order_id: order.db_order_id,
                final_status: finalOrder.order_status,
                total: finalOrder.total_amount,
                items: order.items.length,
                table_id: tableId
              })

            // Save to previous orders
            const { addOrderToHistory } = usePreviousOrdersStore.getState()
            addOrderToHistory(finalOrder)

            // Finally, mark the order as completed/archived in the active orders list
            // instead of removing it, so it remains in the History view (single source of truth)
            set(state => {
              const wasActiveOrder = state.activeOrderId === orderId
              const o = state.ordersById[orderId]
              if (o) {
                Object.assign(o, finalOrder)
                // Ensure it's marked as completed if not void
                o.order_status =
                  finalOrder.order_status === 'void' ? 'void' : 'completed'
              }
              if (wasActiveOrder) {
                state.activeOrderId = null
                // Reset derived state if this was the active order
                state.activeOrderSubtotal = 0
                state.activeOrderTax = 0
                state.activeOrderTotal = 0
                state.activeOrderDiscount = 0
                state.activeOrderOutstandingSubtotal = 0
                state.activeOrderOutstandingTax = 0
                state.activeOrderOutstandingTotal = 0
                state.activeOrderTotalCash = 0
                state.activeOrderOutstandingCash = 0
              }
            })

            // Show completion toast
            if (finalOrder.order_status === 'completed') {
              toastService.show({
                title: 'Order Completed',
                message: `Order ${
                  order.display_number || order.order_number || ''
                } completed and closed`,
                type: 'success',
                duration: 3000
              })
            }

            // Sync order_status = 'completed' to backend
            if (order.db_order_id && finalOrder.order_status === 'completed') {
              const supabase = getOrderStoreSupabaseClient()
              if (supabase) {
                OrderService.updateOrderStatus(
                  supabase,
                  order.db_order_id,
                  'completed'
                ).catch(err => {
                  console.error(
                    '[archiveOrder] Failed to sync completed status to backend:',
                    err
                  )
                })
              }
            }

            // GC: remove inactive orders after archiving
            get().clearInactiveOrders()

            return tableId
          },

          /**
           * Clean up abandoned draft orders
           * Removes draft orders inactive for > 30 minutes with no db_id
           */
          cleanupAbandonedDrafts: () => {
            const { ordersById, orderIds } = get()
            const now = Date.now()
            const idsToRemove: string[] = []

            for (const id of orderIds) {
              const order = ordersById[id]
              if (!order) continue
              // Only process draft orders without backend ID
              if (order.order_status !== 'draft' || order.db_order_id) continue

              // Calculate inactivity duration
              const lastActivity = order.last_activity_at
                ? new Date(order.last_activity_at).getTime()
                : new Date(order.opened_at || 0).getTime()

              const inactivityMs = now - lastActivity

              // Mark for removal if abandoned
              if (inactivityMs > DRAFT_CLEANUP_TIMEOUT_MS) {
                idsToRemove.push(id)
                console.log(
                  `[cleanupAbandonedDrafts] Removing abandoned draft: ${id}`,
                  `(inactive for ${Math.floor(inactivityMs / 60000)} minutes)`
                )
              }
            }

            // Remove abandoned drafts
            if (idsToRemove.length > 0) {
              set(state => {
                idsToRemove.forEach(id => {
                  // Surgical dbOrderIdIndex cleanup
                  const order = state.ordersById[id]
                  if (order?.db_order_id) {
                    delete state.dbOrderIdIndex[order.db_order_id]
                  }
                  delete state.ordersById[id]
                })
                state.orderIds = state.orderIds.filter(
                  id => !idsToRemove.includes(id)
                )
                state.tableOrderIdIndex = rebuildTableOrderIdIndex(
                  state.ordersById
                )
              })

              console.log(
                `[cleanupAbandonedDrafts] Removed ${idsToRemove.length} abandoned draft(s)`
              )
            }
          },

          /**
           * GC: Remove completed/voided/cancelled orders from memory,
           * keeping only active, unsynced, working-set, and own-station orders.
           */
          clearInactiveOrders: () => {
            // Skip pruning if user just navigated — avoid store mutations mid-transition
            const { isRecentlyNavigated } =
              require('@/lib/rootNavigation') as typeof import('@/lib/rootNavigation')
            if (isRecentlyNavigated()) return

            const state = get()
            const keepSet = new Set<string>()
            const now = Date.now()

            if (state.activeOrderId) keepSet.add(state.activeOrderId)
            for (const id of state.workingSetOrderIds) keepSet.add(id)
            for (const id of state.unsyncedOrderIds) keepSet.add(id)

            const inactiveStatuses = new Set([
              'completed',
              'voided',
              'cancelled',
              'void'
            ])

            // Collect completed orders to enforce LRU cap
            const completedOrders: { id: string; time: number }[] = []

            for (const id of state.orderIds) {
              if (keepSet.has(id)) continue
              const order = state.ordersById[id]
              if (!order) continue

              // Keep if has pending items
              if (
                order.items.some(
                  item => !item.db_order_item_id && !item.isDraft
                )
              ) {
                keepSet.add(id)
                continue
              }

              // Keep if has pending (unsynced) payments
              if (
                order.payments?.some(
                  p =>
                    p.sync_status === 'pending' ||
                    (!p.db_payment_id && !p.isVoided)
                )
              ) {
                keepSet.add(id)
                continue
              }

              // Keep if non-completed own-station order
              if (
                order.station_id === state.currentStationId &&
                !inactiveStatuses.has(order.order_status ?? '')
              ) {
                keepSet.add(id)
                continue
              }

              // Evict completed orders older than max age
              if (inactiveStatuses.has(order.order_status ?? '')) {
                const orderTime = new Date(order.opened_at || 0).getTime()
                if (now - orderTime > COMPLETED_ORDER_MAX_AGE_MS) {
                  continue // Don't add to keepSet — will be removed
                }
                completedOrders.push({ id, time: orderTime })
              } else {
                keepSet.add(id)
              }
            }

            // LRU: keep only MAX_COMPLETED_ORDERS most recent completed orders
            completedOrders.sort((a, b) => b.time - a.time)
            for (
              let i = 0;
              i < Math.min(completedOrders.length, MAX_COMPLETED_ORDERS);
              i++
            ) {
              keepSet.add(completedOrders[i].id)
            }

            const removedCount = state.orderIds.length - keepSet.size
            if (removedCount <= 0) return

            if (__DEV__) {
              const removedCandidates = state.orderIds
                .filter(id => !keepSet.has(id))
                .map(id => {
                  const o = state.ordersById[id]
                  return {
                    id,
                    dbOrderId: o?.db_order_id,
                    status: o?.order_status,
                    items: o?.items?.length ?? 0,
                    pendingItems:
                      o?.items?.filter(i => !i.db_order_item_id && !i.isDraft)
                        .length ?? 0,
                    pendingPayments:
                      o?.payments?.filter(
                        p =>
                          p.sync_status === 'pending' ||
                          (!p.db_payment_id && !p.isVoided)
                      ).length ?? 0
                  }
                })
              console.warn('[OfflineReconnectDebug][ClearInactivePrune]', {
                removedCount,
                removedCandidates
              })
            }

            set(draft => {
              for (const id of draft.orderIds) {
                if (!keepSet.has(id)) {
                  const order = draft.ordersById[id]
                  if (order?.db_order_id) {
                    delete draft.dbOrderIdIndex[order.db_order_id]
                  }
                  delete draft.ordersById[id]
                  delete draft.persistableOrderIds[id]
                }
              }
              draft.orderIds = draft.orderIds.filter(id => keepSet.has(id))
            })
            console.log(
              `[clearInactiveOrders] Removed ${removedCount}, kept ${keepSet.size}`
            )
          },

          /**
           * Start periodic draft cleanup (runs every 15 minutes)
           */
          startDraftCleanup: () => {
            // Run initial cleanup
            get().cleanupAbandonedDrafts()
            get().clearInactiveOrders()

            // Clear any existing intervals
            if (draftCleanupInterval) {
              clearInterval(draftCleanupInterval)
            }
            if (orderPruneInterval) {
              clearInterval(orderPruneInterval)
            }

            // Schedule periodic cleanup
            draftCleanupInterval = setInterval(() => {
              get().cleanupAbandonedDrafts()
            }, DRAFT_CLEANUP_INTERVAL_MS)

            // Schedule periodic order pruning (every 5 min)
            orderPruneInterval = setInterval(() => {
              get().clearInactiveOrders()
            }, ORDER_PRUNE_INTERVAL_MS)

            console.log(
              '[startDraftCleanup] Started (drafts: 15min, pruning: 5min)'
            )
          },

          /**
           * Stop periodic draft cleanup
           */
          stopDraftCleanup: () => {
            if (draftCleanupInterval) {
              clearInterval(draftCleanupInterval)
              draftCleanupInterval = null
            }
            if (orderPruneInterval) {
              clearInterval(orderPruneInterval)
              orderPruneInterval = null
            }
            console.log('[stopDraftCleanup] Stopped')
          },

          /**
           * One-time cleanup: Remove duplicate draft orders
           * Keeps oldest order, removes subsequent duplicates with same display_number + station_id
           */
          cleanupDraftDuplicates: () => {
            const { ordersById, orderIds } = get()

            // Group drafts by display_number and station_id
            const draftGroups = new Map<string, OrderProfile[]>()

            Object.values(ordersById).forEach(order => {
              if (
                order.order_status === 'draft' &&
                !order.db_order_id &&
                order.display_number &&
                order.station_id
              ) {
                const key = `${order.display_number}_${order.station_id}`
                const group = draftGroups.get(key) || []
                group.push(order)
                draftGroups.set(key, group)
              }
            })

            // For each group, keep oldest and remove rest
            const idsToRemove: string[] = []

            draftGroups.forEach((orders, key) => {
              if (orders.length > 1) {
                // Sort by creation time (oldest first)
                orders.sort(
                  (a, b) =>
                    new Date(a.opened_at || 0).getTime() -
                    new Date(b.opened_at || 0).getTime()
                )

                // Keep first, remove rest
                const duplicates = orders.slice(1)
                duplicates.forEach(order => {
                  idsToRemove.push(order.id)
                  console.log(
                    `[CleanupDuplicates] Removing duplicate: ${order.display_number} (${order.id})`
                  )
                })
              }
            })

            // Remove duplicates
            if (idsToRemove.length > 0) {
              const removeSet = new Set(idsToRemove)
              set(state => {
                for (const id of idsToRemove) {
                  // Surgical dbOrderIdIndex cleanup
                  const order = state.ordersById[id]
                  if (order?.db_order_id) {
                    delete state.dbOrderIdIndex[order.db_order_id]
                  }
                  delete state.ordersById[id]
                }
                state.orderIds = state.orderIds.filter(id => !removeSet.has(id))
                state.tableOrderIdIndex = rebuildTableOrderIdIndex(
                  state.ordersById
                )
              })

              console.log(
                `[CleanupDuplicates] Removed ${idsToRemove.length} duplicate drafts`
              )
            } else {
              console.log(`[CleanupDuplicates] No duplicates found`)
            }
          },

          setOpenedAt: (orderId, openedAt) => {
            set(state => {
              const order = state.ordersById[orderId]
              if (order) order.opened_at = openedAt
            })
          },
          setClosedAt: (orderId, closedAt) => {
            set(state => {
              const order = state.ordersById[orderId]
              if (order) order.closed_at = closedAt
            })
          },
          markAllItemsAsReady: orderId => {
            const { ordersById } = get()
            const order = ordersById[orderId]

            if (!order) return

            // Simple map updates all items to ready without merging/consolidating
            // This preserves course info and individual item tracking
            const updatedItems = order.items.map(item => {
              if (item.isDraft) return item
              return {
                ...item,
                item_status: 'ready' as const,
                kitchen_status: 'ready' as const
              }
            })

            // Force update order status to ready + update items
            // This ensures "Mark as Done" turns the order green and enables payment
            set(state => {
              const order = state.ordersById[orderId]
              if (!order) return
              order.items = updatedItems
              order.order_status = 'ready'
            })

            // Sync item statuses and order status to backend
            const supabase = getOrderStoreSupabaseClient()
            if (supabase && order.db_order_id) {
              const dbItemIds = updatedItems
                .filter(item => !item.isDraft && item.db_order_item_id)
                .map(item => item.db_order_item_id as string)

              if (dbItemIds.length > 0) {
                OrderService.bulkUpdateOrderItemStatus(
                  supabase,
                  dbItemIds,
                  'ready'
                ).catch(err => {
                  console.error(
                    'Failed to update backend item statuses to ready:',
                    err
                  )
                })

                // Explicitly sync order status to ready
                OrderService.updateOrderStatus(
                  supabase,
                  order.db_order_id,
                  'ready'
                ).catch(err => {
                  console.error(
                    'Failed to update backend order status to ready:',
                    err
                  )
                })
              }
            }
          },

          markAllItemsAsServed: orderId => {
            const { ordersById } = get()
            const order = ordersById[orderId]

            if (!order) return

            // Note: Inventory deduction is handled by archiveOrder when order is archived/completed

            // Create a new items array where every item's kitchen_status is "served"
            const updatedItems = order.items.map(item => ({
              ...item,
              item_status: 'served' as const,
              kitchen_status: 'served' as const
            }))

            // KDS BEHAVIOR: Only update item kitchen_status, NOT order_status
            // Order status is managed by payment/checkout workflow, not kitchen
            set(state => {
              const order = state.ordersById[orderId]
              if (!order) return
              order.items = updatedItems
              // Do NOT change order_status here - kitchen tracks items, not order lifecycle
            })

            // Sync item statuses to backend (not order status)
            const supabase = getOrderStoreSupabaseClient()
            if (supabase && order.db_order_id) {
              const dbItemIds = updatedItems
                .map(item => item.db_order_item_id)
                .filter((id): id is string => !!id)

              if (dbItemIds.length > 0) {
                OrderService.bulkUpdateOrderItemStatus(
                  supabase,
                  dbItemIds,
                  'served'
                ).catch(err => {
                  console.error(
                    'Failed to update backend item statuses to served:',
                    err
                  )
                })
              }
            }
          },

          markCourseItemsAsCooking: (orderId, itemIds) => {
            const { ordersById } = get()
            const order = ordersById[orderId]
            if (!order) return

            // Updated items list: only items in the provided list get updated
            const updatedItems = order.items.map(item => {
              if (itemIds.includes(item.id)) {
                return {
                  ...item,
                  item_status: 'preparing' as const,
                  kitchen_status: 'preparing' as const
                }
              }
              return item
            })

            set(state => {
              const o = state.ordersById[orderId]
              if (o) o.items = updatedItems
            })

            // Sync to backend
            const supabase = getOrderStoreSupabaseClient()
            if (supabase && order.db_order_id) {
              const targetItems = updatedItems.filter(item =>
                itemIds.includes(item.id)
              )
              const dbItemIds = targetItems
                .map(item => item.db_order_item_id)
                .filter((id): id is string => !!id)

              if (dbItemIds.length > 0) {
                OrderService.bulkUpdateOrderItemStatus(
                  supabase,
                  dbItemIds,
                  'preparing'
                ).catch(err => {
                  console.error(
                    'Failed to update backend items to preparing:',
                    err
                  )
                })
              }
            }
          },

          markCourseItemsAsReady: (orderId, itemIds) => {
            const { ordersById } = get()
            const order = ordersById[orderId]
            if (!order) return

            const updatedItems = order.items.map(item => {
              if (itemIds.includes(item.id)) {
                return {
                  ...item,
                  item_status: 'ready' as const,
                  kitchen_status: 'ready' as const
                }
              }
              return item
            })

            set(state => {
              const o = state.ordersById[orderId]
              if (o) o.items = updatedItems
            })

            // Sync to backend
            const supabase = getOrderStoreSupabaseClient()
            if (supabase && order.db_order_id) {
              const targetItems = updatedItems.filter(item =>
                itemIds.includes(item.id)
              )
              const dbItemIds = targetItems
                .map(item => item.db_order_item_id)
                .filter((id): id is string => !!id)

              if (dbItemIds.length > 0) {
                OrderService.bulkUpdateOrderItemStatus(
                  supabase,
                  dbItemIds,
                  'ready'
                ).catch(err => {
                  console.error('Failed to update backend items to ready:', err)
                })
              }
            }
          },

          markCourseItemsAsServed: (orderId, itemIds) => {
            const { ordersById } = get()
            const order = ordersById[orderId]
            if (!order) return

            const updatedItems = order.items.map(item => {
              if (itemIds.includes(item.id)) {
                return {
                  ...item,
                  item_status: 'served' as const,
                  kitchen_status: 'served' as const
                }
              }
              return item
            })

            // Check if ALL items in the order are now served
            const allItemsServed = updatedItems.every(
              item => item.kitchen_status === 'served'
            )

            // If all items served, set order_status to "ready" (ready for payment/pickup)
            const newOrderStatus = allItemsServed ? 'ready' : order.order_status

            set(state => {
              const o = state.ordersById[orderId]
              if (!o) return
              o.items = updatedItems
              o.order_status = newOrderStatus as any
            })

            // Sync to backend
            const supabase = getOrderStoreSupabaseClient()
            if (supabase && order.db_order_id) {
              // Update item statuses
              const targetItems = updatedItems.filter(item =>
                itemIds.includes(item.id)
              )
              const dbItemIds = targetItems
                .map(item => item.db_order_item_id)
                .filter((id): id is string => !!id)

              if (dbItemIds.length > 0) {
                OrderService.bulkUpdateOrderItemStatus(
                  supabase,
                  dbItemIds,
                  'served'
                ).catch(err => {
                  console.error(
                    'Failed to update backend items to served:',
                    err
                  )
                })
              }

              // If all items served, also update order status to 'ready'
              if (allItemsServed) {
                OrderService.updateOrderStatus(
                  supabase,
                  order.db_order_id,
                  'ready'
                ).catch(err => {
                  console.error(
                    'Failed to update backend order status to ready:',
                    err
                  )
                })
              }
            }
          },

          consolidateOrdersForTables: (tableIds, tableNames) => {
            const { ordersById, orderIds, startNewOrder } = get()
            const tableIdSet = new Set(tableIds)
            const ordersToMerge: OrderProfile[] = []
            for (const id of orderIds) {
              const o = ordersById[id]
              if (
                o?.service_location_id &&
                tableIdSet.has(o.service_location_id)
              ) {
                ordersToMerge.push(o)
              }
            }

            const allItems = ordersToMerge.flatMap(o => o.items)
            const oldOrderIds = ordersToMerge.map(o => o.id)
            const primaryTableId = tableIds[0]

            // 1. Find the earliest start time ONLY if one already exists.
            const earliestStartTime = ordersToMerge.reduce(
              (earliest: number | null, currentOrder) => {
                if (currentOrder.opened_at) {
                  const currentOpenTime = new Date(
                    currentOrder.opened_at
                  ).getTime()
                  // If earliest is null or current time is earlier, update.
                  if (earliest === null || currentOpenTime < earliest) {
                    return currentOpenTime
                  }
                }
                return earliest
              },
              null // Initialize with null
            )

            const newMergedOrderData = {
              id: `order_${Date.now()}`,
              service_location_id: primaryTableId,
              order_status: 'preparing' as const,
              order_type: 'dine_in' as const,
              check_status: 'Opened' as const,
              paid_status: 'Unpaid' as const,
              items: allItems,
              server_name: ordersToMerge[0]?.server_name || 'Unknown',
              guest_count: ordersToMerge.reduce(
                (sum, o) => sum + (o.guest_count || 1),
                0
              ),
              opened_at: earliestStartTime
                ? new Date(earliestStartTime).toISOString()
                : null,
              customer_name: `Merged Table (${tableNames.join(', ')})`
            }

            const oldOrderIdSet = new Set(oldOrderIds)
            set(state => {
              // Remove old orders (with dbOrderIdIndex cleanup)
              oldOrderIds.forEach(id => {
                const order = state.ordersById[id]
                if (order?.db_order_id) {
                  delete state.dbOrderIdIndex[order.db_order_id]
                }
                delete state.ordersById[id]
              })
              // Add new order
              state.ordersById[newMergedOrderData.id] = newMergedOrderData
              syncTableOrderIdIndexForOrder(state, newMergedOrderData.id)

              state.orderIds = state.orderIds.filter(
                id => !oldOrderIdSet.has(id)
              )
              state.orderIds.push(newMergedOrderData.id)
              state.tableOrderIdIndex = rebuildTableOrderIdIndex(
                state.ordersById
              )
            })

            return newMergedOrderData.id
          },

          fireActiveOrderToKitchen: () => {
            const { activeOrderId, ordersById, orderIds } = get()
            if (!activeOrderId) return
            const currentOrder = ordersById[activeOrderId]
            if (!currentOrder) return
            if ((currentOrder.items?.length || 0) === 0) return
            // If already fired (not in Building), do nothing
            if (currentOrder.order_status !== 'draft') return

            // Calculate updates for local state
            const startTime = currentOrder.opened_at
              ? currentOrder.opened_at
              : new Date().toISOString()

            const updatedItems = currentOrder.items.map(item => ({
              ...item,
              item_status: 'Preparing' as const,
              kitchen_status: getKitchenSentStatus() as any
            }))

            const updatedCurrentOrder: OrderProfile = {
              ...currentOrder,
              items: updatedItems,
              order_status: getOrderSentStatus() as any,
              check_status: 'Opened' as const,
              paid_status:
                currentOrder.paid_status === 'Paid'
                  ? 'Paid'
                  : currentOrder.paid_status === 'Partial'
                  ? 'Partial'
                  : 'Unpaid',
              order_type: currentOrder.order_type,
              opened_at: startTime,
              sent_to_kitchen_at:
                currentOrder.sent_to_kitchen_at || new Date().toISOString()
            }

            const newOrder: OrderProfile = {
              id: `order_${Date.now()}`,
              service_location_id: null,
              order_status: 'draft',
              check_status: 'Opened',
              paid_status: 'Unpaid',
              items: [],
              opened_at: new Date().toISOString()
            }

            set(state => {
              state.ordersById[activeOrderId] = updatedCurrentOrder
              state.ordersById[newOrder.id] = newOrder
              state.orderIds.push(newOrder.id)
              state.activeOrderId = newOrder.id
              // Reset totals synchronously for the new empty order
              state.activeOrderSubtotal = 0
              state.activeOrderTax = 0
              state.activeOrderTotal = 0
              state.activeOrderDiscount = 0
              state.activeOrderOutstandingSubtotal = 0
              state.activeOrderOutstandingTax = 0
              state.activeOrderOutstandingTotal = 0
              state.activeOrderTotalCash = 0
            })

            // Sync to backend: if all items are already synced, send in one
            // batch to produce a single KDS ticket. If some items are still
            // syncing, skip sending here — each item's addItemToBackend
            // retroactive path checks hasPendingSyncs and the last item to
            // finish will send all items together.
            const supabase = getOrderStoreSupabaseClient()
            const localItemIds = currentOrder.items.map(item => item.id)
            if (supabase && currentOrder.db_order_id) {
              const dbItemIds = currentOrder.items
                .map(item => item.db_order_item_id)
                .filter((id): id is string => !!id)

              const hasPending = get().hasPendingSyncs(activeOrderId)

              if (hasPending) {
                // Items still syncing — the retroactive send in addItemToBackend
                // will batch-send once all items complete. Still update order status.
                console.log(
                  '[fireActiveOrderToKitchen] Items still syncing, deferring kitchen send to addItemToBackend'
                )
                OrderService.updateOrderStatus(
                  supabase,
                  currentOrder.db_order_id!,
                  getOrderSentStatus()
                )
                  .then(({ error }) => {
                    if (
                      error &&
                      error.code !== 'P0001' &&
                      !error.message?.includes('already in')
                    ) {
                      console.error(
                        'Failed to update backend order status:',
                        error
                      )
                    }
                  })
                  .catch(console.error)
              } else if (
                dbItemIds.length === 0 &&
                currentOrder.items.length > 0
              ) {
                // No db IDs and no pending syncs — queue for retry
                console.log(
                  '[fireActiveOrderToKitchen] Items not synced yet, queuing send_to_kitchen'
                )
                queueFailedOperation(
                  'send_to_kitchen',
                  { localOrderId: activeOrderId, localItemIds },
                  activeOrderId
                )
                OrderService.updateOrderStatus(
                  supabase,
                  currentOrder.db_order_id!,
                  getOrderSentStatus()
                )
                  .then(({ error }) => {
                    if (
                      error &&
                      error.code !== 'P0001' &&
                      !error.message?.includes('already in')
                    ) {
                      console.error(
                        'Failed to update backend order status:',
                        error
                      )
                    }
                  })
                  .catch(console.error)
              } else if (dbItemIds.length > 0) {
                // All items synced — send as a single batch
                // Update order status FIRST (draft -> sent_to_kitchen/preparing)
                // Then update items (which also sets sent_to_kitchen_at on the order via trigger)
                OrderService.updateOrderStatus(
                  supabase,
                  currentOrder.db_order_id!,
                  getOrderSentStatus()
                )
                  .then(({ error }) => {
                    if (
                      error &&
                      error.code !== 'P0001' &&
                      !error.message?.includes('already in')
                    ) {
                      console.error(
                        'Failed to update backend order status:',
                        error
                      )
                      queueFailedOperation(
                        'send_to_kitchen',
                        { localOrderId: activeOrderId, localItemIds },
                        activeOrderId
                      )
                      return // Don't update items if order status failed
                    }

                    return supabase
                      .from('orders')
                      .select('status')
                      .eq('id', currentOrder.db_order_id!)
                      .single()
                      .then(({ data: backendOrder, error: verifyError }) => {
                        if (verifyError || backendOrder?.status === 'draft') {
                          console.warn(
                            '[fireActiveOrderToKitchen] Backend order remained draft after status update; deferring item sync',
                            {
                              dbOrderId: currentOrder.db_order_id,
                              verifyError,
                              backendStatus: backendOrder?.status
                            }
                          )
                          queueFailedOperation(
                            'send_to_kitchen',
                            { localOrderId: activeOrderId, localItemIds },
                            activeOrderId
                          )
                          return
                        }

                        // THEN update item statuses in one bulk call
                        return OrderService.bulkUpdateOrderItemStatus(
                          supabase,
                          dbItemIds,
                          getKitchenSentStatus()
                        )
                      })
                  })
                  .then(result => {
                    if (result?.error) {
                      console.error(
                        'Failed to update item statuses:',
                        result.error
                      )
                      queueFailedOperation(
                        'send_to_kitchen',
                        { localOrderId: activeOrderId, localItemIds },
                        activeOrderId
                      )
                    }
                  })
                  .catch(err => {
                    console.error('Failed to sync fire-to-kitchen:', err)
                    queueFailedOperation(
                      'send_to_kitchen',
                      { localOrderId: activeOrderId, localItemIds },
                      activeOrderId
                    )
                  })
              }
            } else {
              // Order not synced yet or offline: queue for later
              console.log(
                '[fireActiveOrderToKitchen] Order not synced, queueing send_to_kitchen for later'
              )
              queueFailedOperation(
                'send_to_kitchen',
                { localOrderId: activeOrderId, localItemIds },
                activeOrderId
              )
            }

            toastService.show({
              title: 'Order Sent',
              message: 'The order has been successfully sent to the kitchen.',
              type: 'success'
            })
          },

          transferOrderToTable: (orderId, newTableId) => {
            set(state => {
              const order = state.ordersById[orderId]
              if (order) order.service_location_id = newTableId
            })
          },
          sendNewItemsToKitchen: async () => {
            // ================================================================
            // OFFLINE-FIRST: Update local state immediately
            // ================================================================
            // Kitchen operations work with local state - no need to wait for sync
            // Backend status update is queued for later

            // Lever 2: cashier must own (claim) the order before committing the
            // cart. Lifecycle marks (mark ready/done) remain ungated.
            if (!_checkCartEditable(get())) return
            // Kitchen display/printer uses local state directly

            const { activeOrderId, ordersById } = get()
            if (!activeOrderId) return

            const currentOrder = ordersById[activeOrderId]
            if (!currentOrder) return

            // Work with current local state (no blocking on syncs)
            const newItems = currentOrder.items.filter(
              item => !item.kitchen_status || item.kitchen_status === 'new'
            )

            if (newItems.length === 0) return

            let cartToProcess = [...currentOrder.items]
            const itemsToKeep: CartItem[] = []
            const mergedItemIds = new Set<string>()

            // Iterate through each new item to see if it can be merged
            for (const newItem of newItems) {
              // Find a candidate for merging (must be already 'sent' and identical)
              const mergeCandidate = cartToProcess.find(item => {
                if (item.id === newItem.id) return false // Don't match self
                if (item.kitchen_status !== 'sent') return false // Must be already sent

                return areCartItemsMergeIdentical(activeOrderId, item, newItem)
              })

              if (mergeCandidate) {
                // If we found a match, update its quantity in the final list
                const existingInFinal = itemsToKeep.find(
                  i => i.id === mergeCandidate.id
                )
                if (existingInFinal) {
                  existingInFinal.quantity += newItem.quantity
                } else {
                  const updatedCandidate = {
                    ...mergeCandidate,
                    quantity: mergeCandidate.quantity + newItem.quantity
                  }
                  itemsToKeep.push(updatedCandidate)
                }
                mergedItemIds.add(mergeCandidate.id) // Mark original as processed
              } else {
                // If no merge candidate, just mark this new item as 'sent' and add it
                itemsToKeep.push({
                  ...newItem,
                  kitchen_status: getKitchenSentStatus(),
                  item_status: 'preparing'
                })
              }
            }

            // Add back all items that were not part of the merge logic (drafts, other sent items)
            const finalCart = [
              ...itemsToKeep,
              ...cartToProcess.filter(item => {
                const isNew =
                  !item.kitchen_status || item.kitchen_status === 'new'
                const wasMerged = mergedItemIds.has(item.id)
                // Keep if it's not a new item and was not a merge target
                return !isNew && !wasMerged
              })
            ]

            // O(1) update via ordersById
            set(state => {
              const order = state.ordersById[activeOrderId]
              if (!order) return
              order.items = finalCart
              order.sent_to_kitchen_at =
                order.sent_to_kitchen_at || new Date().toISOString()
              // Use appropriate status if order was draft, keep current if already sent
              if (order.order_status === 'draft') {
                order.order_status = getOrderSentStatus()
              }
            })

            // No need to manually update `orders` array - the subscription will handle it.

            // Show toast immediately — local state is already updated, UI is responsive.
            toastService.show({
              title: 'Items Sent',
              message: `${newItems.length} new item${
                newItems.length > 1 ? 's' : ''
              } sent to the kitchen.`,
              type: 'success'
            })

            // Auto-print kitchen tickets (centralized — fires for all send-to-kitchen paths)
            const orderForPrint = get().ordersById[activeOrderId]
            if (orderForPrint) {
              autoPrintKitchenTicketsIfEnabled(orderForPrint, newItems)
            }

            // ================================================================
            // OFFLINE-FIRST: Queue or sync backend operation
            // ================================================================
            // Local state is already updated above - now handle backend sync.
            // Wait for any in-flight quantity updates (e.g. from incrementItemQuantity)
            // to complete before broadcasting kitchen status, so the KDS receives
            // the correct quantity.
            await get().waitForPendingSyncs(activeOrderId)

            // Re-read fresh state after the await — quantity syncs and item syncs
            // may have updated ordersById (assigned db_order_item_ids, new quantities)
            // during the wait. Using stale snapshot data here causes data loss.
            const freshOrder = get().ordersById[activeOrderId]
            if (!freshOrder) return

            // Resolve which items are being sent by matching local IDs captured before the await.
            // Exclude items that went through the retroactive kitchen-send path in addItemToBackend:
            // those had no db_order_item_id at press-time, got it during the wait, and
            // addItemToBackend already called bulkUpdateOrderItemStatus for them.
            const sentLocalIds = new Set(newItems.map(item => item.id))
            const hadDbIdAtPressTime = new Set(
              newItems
                .filter(item => !!item.db_order_item_id)
                .map(item => item.id)
            )
            console.log(
              `[SendKitchen] After wait: sentLocalIds=${sentLocalIds.size} hadDbIdAtPressTime=${hadDbIdAtPressTime.size} freshItems=${freshOrder.items.length}`
            )
            const freshSentItems = freshOrder.items.filter(item => {
              if (!sentLocalIds.has(item.id)) return false
              // If item had no db_order_item_id when Send was pressed, the retroactive
              // path in addItemToBackend already sent it to kitchen — skip it here.
              if (!hadDbIdAtPressTime.has(item.id)) return false
              return true
            })
            console.log(
              `[SendKitchen] freshSentItems=${freshSentItems.length} (items with db_id at press time)`
            )

            const supabase = getOrderStoreSupabaseClient()
            const isOnlineNow = getIsOnline()

            // Get local item IDs for queuing (will be resolved to db_order_item_ids during sync)
            const localItemIds = freshSentItems.map(item => item.id)

            if (isOnlineNow && supabase && freshOrder.db_order_id) {
              // Online + order synced: sync immediately
              const dbItemIds = freshSentItems
                .map(item => item.db_order_item_id)
                .filter((id): id is string => !!id)

              const hasPending = get().hasPendingSyncs(activeOrderId)

              if (freshSentItems.length === 0) {
                // All items were handled by the retroactive path in addItemToBackend
                // (they had no db_order_item_id at press-time and were sent during sync).
                // Nothing left to do here.
              } else if (
                hasPending ||
                (dbItemIds.length === 0 && freshSentItems.length > 0)
              ) {
                // Items still syncing — defer to addItemToBackend retroactive path
                // which will batch-send once all items are synced.
                console.log(
                  '[sendNewItemsToKitchen] Items still syncing, deferring kitchen send'
                )
                queueFailedOperation(
                  'send_to_kitchen',
                  { localOrderId: activeOrderId, localItemIds },
                  activeOrderId
                )
              } else if (dbItemIds.length > 0) {
                // Always transition backend order status before item updates.
                // Local state may already be optimistic/non-draft while backend is still draft.
                OrderService.updateOrderStatus(
                  supabase,
                  freshOrder.db_order_id!,
                  getOrderSentStatus()
                )
                  .then(({ error }) => {
                    if (
                      error &&
                      error.code !== 'P0001' &&
                      !error.message?.includes('already in')
                    ) {
                      console.error(
                        'Failed to update backend order status:',
                        error
                      )
                      queueFailedOperation(
                        'send_to_kitchen',
                        { localOrderId: activeOrderId, localItemIds },
                        activeOrderId
                      )
                      return
                    }

                    return supabase
                      .from('orders')
                      .select('status')
                      .eq('id', freshOrder.db_order_id!)
                      .single()
                      .then(({ data: backendOrder, error: verifyError }) => {
                        if (verifyError || backendOrder?.status === 'draft') {
                          console.warn(
                            '[sendNewItemsToKitchen] Backend order remained draft after status update; deferring item sync',
                            {
                              dbOrderId: freshOrder.db_order_id,
                              verifyError,
                              backendStatus: backendOrder?.status
                            }
                          )
                          queueFailedOperation(
                            'send_to_kitchen',
                            { localOrderId: activeOrderId, localItemIds },
                            activeOrderId
                          )
                          return
                        }

                        return OrderService.bulkUpdateOrderItemStatus(
                          supabase,
                          dbItemIds,
                          getKitchenSentStatus()
                        )
                      })
                  })
                  .then(result => {
                    if (result?.error) {
                      console.error(
                        'Failed to update item statuses:',
                        result.error
                      )
                      queueFailedOperation(
                        'send_to_kitchen',
                        { localOrderId: activeOrderId, localItemIds },
                        activeOrderId
                      )
                    }
                  })
                  .catch((err: any) => {
                    console.error('Failed to sync send-to-kitchen:', err)
                    queueFailedOperation(
                      'send_to_kitchen',
                      { localOrderId: activeOrderId, localItemIds },
                      activeOrderId
                    )
                  })
              }
            } else {
              // Offline or order not synced: queue for later
              console.log(
                '[sendNewItemsToKitchen] Queueing send_to_kitchen operation for later sync'
              )
              queueFailedOperation(
                'send_to_kitchen',
                { localOrderId: activeOrderId, localItemIds },
                activeOrderId
              )
            }
          },

          sendNewItemsToKitchenForOrder: async (orderId: string) => {
            // ================================================================
            // OFFLINE-FIRST: Update local state immediately
            // ================================================================
            if (!_checkCartEditable(get(), orderId)) return
            // Kitchen operations work with local state - no need to wait for sync
            // Backend status update is queued for later (fire-and-forget)

            const order = get().ordersById[orderId]
            if (
              !order ||
              order.items.filter(
                item => !item.kitchen_status || item.kitchen_status === 'new'
              ).length === 0
            ) {
              return // No new items to send
            }

            const updatedItems = order.items.map(item => {
              if (!item.kitchen_status || item.kitchen_status === 'new') {
                return {
                  ...item,
                  kitchen_status: getKitchenSentStatus() as any,
                  item_status: 'Preparing' as const
                }
              }
              return item
            })

            // Check if the timer needs to be started
            const shouldStartTimer =
              order.order_type === 'dine_in' && !order.opened_at

            const updatedOrder: OrderProfile = {
              ...order,
              items: updatedItems,
              order_status:
                order.order_status === 'draft'
                  ? getOrderSentStatus()
                  : order.order_status,
              sent_to_kitchen_at:
                order.sent_to_kitchen_at || new Date().toISOString(),
              // Set opened_at timestamp if it's not already set for a Dine In order
              opened_at: shouldStartTimer
                ? new Date().toISOString()
                : order.opened_at
            }

            // Capture new items before state mutation for auto-print
            const newItemsForPrint = order.items.filter(
              item => !item.kitchen_status || item.kitchen_status === 'new'
            )

            // Update state
            set(state => {
              state.ordersById[orderId] = updatedOrder
            })

            // Auto-print kitchen tickets (centralized — fires for all send-to-kitchen paths)
            const freshOrder = get().ordersById[orderId]
            if (freshOrder) {
              autoPrintKitchenTicketsIfEnabled(freshOrder, newItemsForPrint)
            }

            // Clear sync status for fired items — they're committed to local state now
            // ================================================================
            // OFFLINE-FIRST: Queue or sync backend operation
            // ================================================================
            // Local state is already updated above - now handle backend sync
            const supabase = getOrderStoreSupabaseClient()
            const isOnlineNow = getIsOnline()

            // Get items that need to be sent
            const newItems = order.items.filter(
              item => !item.kitchen_status || item.kitchen_status === 'new'
            )
            const localItemIds = newItems.map(item => item.id)

            if (isOnlineNow && supabase && order.db_order_id) {
              // Online + order synced: sync immediately
              const dbItemIds = newItems
                .map(item => item.db_order_item_id)
                .filter((id): id is string => !!id)

              if (dbItemIds.length === 0 && newItems.length > 0) {
                // Items haven't synced to backend yet - queue for retry
                // The queue handler will update order status + items atomically
                console.log(
                  '[sendNewItemsToKitchenForOrder] Items not synced yet, queuing send_to_kitchen'
                )
                queueFailedOperation(
                  'send_to_kitchen',
                  { localOrderId: orderId, localItemIds },
                  orderId
                )
              } else if (dbItemIds.length > 0) {
                // Always transition backend status first, then verify backend is no longer draft.
                // Local status can be optimistic and out of sync with backend reality.
                const { error: statusError } =
                  await OrderService.updateOrderStatus(
                    supabase,
                    order.db_order_id!,
                    getOrderSentStatus()
                  )
                if (
                  statusError &&
                  statusError.code !== 'P0001' &&
                  !statusError.message?.includes('already in')
                ) {
                  console.error(
                    'Failed to update backend order status:',
                    statusError
                  )
                  queueFailedOperation(
                    'send_to_kitchen',
                    { localOrderId: orderId, localItemIds },
                    orderId
                  )
                  return
                }

                const { data: backendOrder, error: verifyError } =
                  await supabase
                    .from('orders')
                    .select('status')
                    .eq('id', order.db_order_id!)
                    .single()

                if (verifyError || backendOrder?.status === 'draft') {
                  console.warn(
                    '[sendNewItemsToKitchenForOrder] Backend order remained draft after status update; deferring item sync',
                    {
                      dbOrderId: order.db_order_id,
                      verifyError,
                      backendStatus: backendOrder?.status
                    }
                  )
                  queueFailedOperation(
                    'send_to_kitchen',
                    { localOrderId: orderId, localItemIds },
                    orderId
                  )
                  return
                }

                const { error: itemError } =
                  await OrderService.bulkUpdateOrderItemStatus(
                    supabase,
                    dbItemIds,
                    getKitchenSentStatus()
                  )
                if (itemError) {
                  console.error(
                    'Failed to bulk update item statuses:',
                    itemError
                  )
                  queueFailedOperation(
                    'send_to_kitchen',
                    { localOrderId: orderId, localItemIds },
                    orderId
                  )
                }
              }
            } else {
              // Offline or order not synced: queue for later
              console.log(
                '[sendNewItemsToKitchenForOrder] Queueing send_to_kitchen operation for later sync'
              )
              queueFailedOperation(
                'send_to_kitchen',
                { localOrderId: orderId, localItemIds },
                orderId
              )
            }

            // Show toast after the state update
            // toastService.show({
            //   title: "Items Sent",
            //   message: "New items have been sent to the kitchen.",
            //   type: "success",
            // });

            // recalculateTotals(orderId);
          },

          generateCartItemId: (menuItemId, customizations, isDraft = false) => {
            return generateCartItemId(menuItemId, customizations, isDraft)
          },
          deleteOrder: (orderId: string) => {
            set(state => {
              const order = state.ordersById[orderId]
              // Surgical dbOrderIdIndex maintenance
              if (order?.db_order_id) {
                delete state.dbOrderIdIndex[order.db_order_id]
              }
              delete state.ordersById[orderId]
              state.orderIds = state.orderIds.filter(id => id !== orderId)
              delete state.persistableOrderIds[orderId]
            })
          },
          clearCart: () => {
            const { activeOrderId } = get()
            if (!activeOrderId) return
            if (!_checkCartEditable(get())) return
            const order = get().ordersById[activeOrderId]

            if (!order) return

            // Fully clear check-level discounts (local + backend void/queue) before item removal.
            if (
              order.checkDiscount ||
              (order.applied_discounts?.length ?? 0) > 0
            ) {
              get().removeCheckDiscount(activeOrderId)
            }

            // Update ordersById (not deprecated orders array)
            set(state => {
              const order = state.ordersById[activeOrderId]
              if (order) order.items = []
            })

            // Only sync items that have been synced to the database
            const supabase = getOrderStoreSupabaseClient()
            const syncedItemIds = order.items
              .filter(item => item.db_order_item_id) // Only items with DB IDs
              .map(item => item.db_order_item_id as string)

            if (supabase && order.db_order_id && syncedItemIds.length > 0) {
              OrderService.removeOrderItemsBatch(supabase, syncedItemIds)
                .then(({ error }) => {
                  if (error) {
                    console.error('[useOrderStore.clearCart] DB error:', error)
                    // Rollback optimistic update on failure
                    set(state => {
                      state.ordersById[activeOrderId] = order // Restore original
                    })
                    return false
                  }
                })
                .catch(err => console.error('Clear cart sync failed:', err))
            }

            // Synchronously recalculate (will result in all zeros)
            get().recalculateOrder(activeOrderId)

            toastService.show({
              title: 'Cart Cleared',
              message: 'All items have been removed from the current order.',
              type: 'success'
            })
          },
          voidOrder: (orderId: string) => {
            if (!_checkCartEditable(get(), orderId)) return
            const { archiveOrder, ordersById } = get()
            const order = ordersById[orderId]

            // 1. Update the order's status locally
            set(state => {
              const o = state.ordersById[orderId]
              if (!o) return
              o.order_status = 'void'
              o.check_status = 'Closed'
              o.items = o.items.map(item => ({
                ...item,
                is_voided: true,
                void_reason: 'Order voided'
              }))

              if (state.activeOrderId === orderId) {
                state.activeOrderId = null
                state.activeOrderSubtotal = 0
                state.activeOrderTax = 0
                state.activeOrderTotal = 0
                state.activeOrderDiscount = 0
              }
            })

            // Wave 2.8d: discard any queued ops for this order so blocked
            // add_item ops don't wake post-void and add items to a voided
            // record. Fire-and-forget — never block the void UX. voidPayment
            // and voidAllPayments deliberately do NOT cancel ops, since the
            // order remains live for re-payment.
            cancelOrderOperations(orderId).catch(err =>
              console.error('[voidOrder] cancelOrderOperations failed:', err)
            )

            // 2. Sync to backend (fire-and-forget)
            const supabase = getOrderStoreSupabaseClient()
            if (supabase && order?.db_order_id) {
              OrderService.voidOrder(
                supabase,
                order.db_order_id,
                'Order voided'
              )
                .then(({ error }) => {
                  if (error) {
                    // Skip rollback if already voided — desired state is achieved
                    if (
                      error.message?.toLowerCase().includes('already voided')
                    ) {
                      console.log(
                        '[useOrderStore.voidOrder] Order already voided on backend, skipping rollback'
                      )
                      return
                    }
                    console.error('[useOrderStore.voidOrder] DB error:', error)
                    // Rollback optimistic update on failure
                    set(state => {
                      state.ordersById[orderId] = order // Restore original
                    })
                    return false
                  }
                  // void_order RPC confirmed — session is closed on backend.
                  // Realtime broadcast (_handleSessionChange with is_active=false) will
                  // keep local state in sync. No refetch needed here.
                })
                .catch(err => console.error('Void order sync failed:', err))
            }
            // 4. Archive the order
            archiveOrder(orderId)
            return true
          },

          // ============================================================================
          // VOID PAYMENT - Reverts a payment and restores items to unpaid status
          // ============================================================================
          voidPayment: async (
            orderId: string,
            paymentId: string
          ): Promise<boolean> => {
            if (!_checkCartEditable(get(), orderId)) return false
            const { ordersById, activeOrderId } = get()
            const order = ordersById[orderId]

            if (!order) {
              console.error('[voidPayment] Order not found:', orderId)
              return false
            }

            // Find by stable db_payment_id — immune to array reordering from Realtime
            const paymentIndex = (order.payments ?? []).findIndex(
              p => p.db_payment_id === paymentId || p.id === paymentId
            )
            if (paymentIndex === -1) {
              console.error('[voidPayment] Payment not found:', paymentId)
              return false
            }

            const paymentToVoid = order.payments![paymentIndex]
            const originalOrder = { ...order }

            // 1. OPTIMISTIC UPDATE: Remove payment and restore paidQuantity
            const updatedPayments = order.payments!.filter(
              (_, i) => i !== paymentIndex
            )

            // Restore paidQuantity for items covered by this payment
            // Build a map from itemId -> quantity to restore
            const itemsCoveredMap = new Map<string, number>()
            if (paymentToVoid.itemsCovered) {
              for (const covered of paymentToVoid.itemsCovered) {
                // Handle both old format (string) and new format ({itemId, quantity})
                if (typeof covered === 'string') {
                  // Old format: assume full quantity was paid (for backward compatibility)
                  itemsCoveredMap.set(covered, Infinity)
                } else {
                  itemsCoveredMap.set(covered.itemId, covered.quantity)
                }
              }
            }
            const updatedItems = order.items.map(item => {
              const quantityToRestore = itemsCoveredMap.get(
                item.db_order_item_id || ''
              )
              if (quantityToRestore !== undefined) {
                // Decrement by specific quantity (not reset to 0)
                const newPaidQty =
                  quantityToRestore === Infinity
                    ? 0 // Old format: reset completely
                    : Math.max(0, (item.paidQuantity || 0) - quantityToRestore)
                return { ...item, paidQuantity: newPaidQty }
              }
              return item
            })

            // Recalculate totals after removing payment
            const taxRatesMap = useStoreSettingsStore.getState().taxRatesMap
            const totals = calculateOrderTotals(
              updatedItems,
              order.checkDiscount,
              updatedPayments,
              taxRatesMap
            )

            // Calculate new amounts
            const newAmountPaid = updatedPayments.reduce(
              (acc, p) => acc + p.amount + (p.tip_amount || 0),
              0
            )
            const newAmountDue = totals.total_amount - newAmountPaid
            const isStillPaid = newAmountDue < 0.01

            set(state => {
              const o = state.ordersById[orderId]
              if (!o) return
              o.payments = updatedPayments
              o.items = updatedItems
              o.amount_paid = newAmountPaid
              o.amount_due = newAmountDue
              o.paid_status = isStillPaid
                ? ('Paid' as const)
                : ('Pending' as const)
              o.check_status = isStillPaid
                ? ('Closed' as const)
                : ('Opened' as const)

              // Clear split path lock if no payments remain
              if (updatedPayments.length === 0) {
                o.split_payment_path = null

                // Clear on backend too
                if (order.db_order_id) {
                  const supabase = getOrderStoreSupabaseClient()
                  if (supabase) {
                    supabase
                      .from('orders')
                      .update({ split_payment_path: null })
                      .eq('id', order.db_order_id)
                      .then(({ error }) => {
                        if (error)
                          console.warn(
                            '[OrderStore] Failed to clear split_payment_path:',
                            error.message
                          )
                      })
                  }
                }
              }

              // Update active order totals if this is the active order
              if (orderId === activeOrderId) {
                state.activeOrderOutstandingTotal = totals.outstanding_total
                state.activeOrderOutstandingSubtotal =
                  totals.outstanding_subtotal
                state.activeOrderOutstandingTax = totals.outstanding_tax
                state.activeOrderOutstandingCash = totals.cash_outstanding_total
              }
            })

            // 2. SYNC TO BACKEND
            const supabase = getOrderStoreSupabaseClient()
            if (
              supabase &&
              order.db_order_id &&
              (paymentToVoid.db_payment_id ?? paymentToVoid.id)
            ) {
              try {
                // Call the void_payment RPC — prefer db_payment_id (backend UUID)
                // rpc-discipline-allow: inline-wrapped Category A — void_payment with retry safety
                const { error } = await runWithDeadline(
                  'void_payment_inline',
                  DEADLINES.hotMutation,
                  async (signal) =>
                    await supabase
                      .rpc('void_payment', {
                        p_payment_id: paymentToVoid.db_payment_id ?? paymentToVoid.id,
                        p_void_reason: 'User voided from split review'
                      })
                      .abortSignal(signal)
                )

                if (error) {
                  console.error('[voidPayment] Backend sync failed:', error)
                  // Rollback on failure
                  set(state => {
                    state.ordersById[orderId] = originalOrder
                  })
                  toastService.show({
                    title: 'Void Failed',
                    message:
                      error.message ||
                      'Failed to void payment. Please try again.',
                    type: 'error'
                  })
                  return false
                }

                console.log('[voidPayment] Payment voided successfully')
                toastService.show({
                  title: 'Payment Voided',
                  message:
                    'Payment has been voided. Items are now available for payment.',
                  type: 'success'
                })
                return true
              } catch (err) {
                console.error('[voidPayment] Error:', err)
                // Rollback on error
                set(state => {
                  state.ordersById[orderId] = originalOrder
                })
                toastService.show({
                  title: 'Void Failed',
                  message: 'An error occurred. Please try again.',
                  type: 'error'
                })
                return false
              }
            }

            // If no backend sync needed (no db_order_id or payment.id), just succeed locally
            toastService.show({
              title: 'Payment Voided',
              message: 'Payment has been voided locally.',
              type: 'success'
            })
            return true
          },

          // Void all payments for an order
          voidAllPayments: async (orderId: string): Promise<boolean> => {
            const { ordersById } = get()
            const order = ordersById[orderId]

            if (!order?.payments?.length) return true

            // Snapshot payments before the loop — each voidPayment call removes one
            // payment from the live array, so we must iterate the snapshot.
            // Reverse order preserves intent for any UI that cares about order.
            const paymentsSnapshot = [...order.payments]
            for (let i = paymentsSnapshot.length - 1; i >= 0; i--) {
              const p = paymentsSnapshot[i]
              const success = await get().voidPayment(
                orderId,
                p.db_payment_id ?? p.id
              )
              if (!success) {
                return false // Stop if any void fails
              }
            }

            // Safety-net: ensure split payment path lock is cleared
            set(state => {
              const o = state.ordersById[orderId]
              if (o) o.split_payment_path = null
            })

            // Clear on backend too
            const orderForClear = get().ordersById[orderId]
            if (orderForClear?.db_order_id) {
              const supabase = getOrderStoreSupabaseClient()
              if (supabase) {
                supabase
                  .from('orders')
                  .update({ split_payment_path: null })
                  .eq('id', orderForClear.db_order_id)
                  .then(({ error }) => {
                    if (error)
                      console.warn(
                        '[OrderStore] Failed to clear split_payment_path on voidAll:',
                        error.message
                      )
                  })
              }
            }

            return true
          },

          // ============================================================================
          // APPLY PAYMENT VOID LOCALLY
          // Pure local state sync used after a successful terminal void via
          // RefundService.processRefund(). The DB is already updated by RefundService;
          // this method only mirrors that update into in-memory state.
          // Finds the payment by db_payment_id (not by fragile array index).
          // No toast, no rollback — those are the caller's responsibility.
          // ============================================================================
          applyPaymentVoidLocally: (
            orderId: string,
            paymentId: string
          ): void => {
            const { ordersById, activeOrderId } = get()
            const order = ordersById[orderId]
            if (!order) return

            const paymentIndex =
              order.payments?.findIndex(
                p => p.db_payment_id === paymentId || p.id === paymentId
              ) ?? -1
            if (paymentIndex === -1) return

            const payments = order.payments ?? []
            const paymentToVoid = payments[paymentIndex]
            const updatedPayments = payments.filter(
              (_, i) => i !== paymentIndex
            )

            // Restore paidQuantity — same logic as voidPayment()
            const itemsCoveredMap = new Map<string, number>()
            if (paymentToVoid.itemsCovered) {
              for (const covered of paymentToVoid.itemsCovered) {
                if (typeof covered === 'string') {
                  itemsCoveredMap.set(covered, Infinity)
                } else {
                  itemsCoveredMap.set(covered.itemId, covered.quantity)
                }
              }
            }
            const updatedItems = order.items.map(item => {
              const qty = itemsCoveredMap.get(item.db_order_item_id || '')
              if (qty !== undefined) {
                return {
                  ...item,
                  paidQuantity:
                    qty === Infinity
                      ? 0
                      : Math.max(0, (item.paidQuantity || 0) - qty)
                }
              }
              return item
            })

            const taxRatesMap = useStoreSettingsStore.getState().taxRatesMap
            const totals = calculateOrderTotals(
              updatedItems,
              order.checkDiscount,
              updatedPayments,
              taxRatesMap
            )
            const newAmountPaid = updatedPayments.reduce(
              (acc, p) => acc + p.amount + (p.tip_amount || 0),
              0
            )
            const newAmountDue = totals.total_amount - newAmountPaid
            const isStillPaid = newAmountDue < 0.01

            set(state => {
              const o = state.ordersById[orderId]
              if (!o) return
              o.payments = updatedPayments
              o.items = updatedItems
              o.amount_paid = newAmountPaid
              o.amount_due = newAmountDue
              o.paid_status = isStillPaid
                ? ('Paid' as const)
                : ('Pending' as const)
              o.check_status = isStillPaid
                ? ('Closed' as const)
                : ('Opened' as const)
              if (updatedPayments.length === 0) o.split_payment_path = null
              if (orderId === activeOrderId) {
                state.activeOrderOutstandingTotal = totals.outstanding_total
                state.activeOrderOutstandingSubtotal =
                  totals.outstanding_subtotal
                state.activeOrderOutstandingTax = totals.outstanding_tax
                state.activeOrderOutstandingCash = totals.cash_outstanding_total
              }
            })
          },

          // O(1) Getter for order by DB UUID (resolves via dbOrderIdIndex)
          getOrderByDbId: (dbOrderId: string) => {
            const state = get()
            const localKey = state.dbOrderIdIndex[dbOrderId] ?? dbOrderId
            return state.ordersById[localKey]
          },

          // === OFFLINE-FIRST HELPER METHODS ===

          /**
           * Rekey order from temp ID to DB UUID after successful sync.
           * This is the core of the single-index architecture.
           */
          rekeyOrder: (tempId: string, dbUuid: string) => {
            set(state => {
              const order = state.ordersById[tempId]
              if (!order) {
                console.warn(`[rekeyOrder] Order not found: ${tempId}`)
                return
              }

              const previousOrder = current(order)

              // Create updated order with DB UUID as id
              const updatedOrder = {
                ...order,
                id: dbUuid,
                db_order_id: dbUuid,
                sync_status: 'synced' as const
              }

              // Remove temp entry, add DB UUID entry
              delete state.ordersById[tempId]
              state.ordersById[dbUuid] = updatedOrder
              state.orderIds = state.orderIds.map(id =>
                id === tempId ? dbUuid : id
              )
              if (state.activeOrderId === tempId) {
                state.activeOrderId = dbUuid
              }
              state.workingSetOrderIds = state.workingSetOrderIds.map(id =>
                id === tempId ? dbUuid : id
              )
              if (state._workingSetLookup[tempId]) {
                delete state._workingSetLookup[tempId]
                state._workingSetLookup[dbUuid] = true
              }
              state.unsyncedOrderIds = state.unsyncedOrderIds.filter(
                id => id !== tempId
              )
              // Surgical dbOrderIdIndex maintenance
              state.dbOrderIdIndex[dbUuid] = dbUuid
              delete state.dbOrderIdIndex[tempId]
              // Keep table -> order mapping valid after key swap
              syncTableOrderIdIndexForOrder(state, dbUuid, previousOrder)
              // Surgical persistableOrderIds maintenance
              if (state.persistableOrderIds[tempId]) {
                delete state.persistableOrderIds[tempId]
                state.persistableOrderIds[dbUuid] = true
              }
            })

            // Rekey satellite stores keyed by orderId
            rekeyLinkedStores(tempId, dbUuid)

            console.log(`[rekeyOrder] Rekeyed order ${tempId} -> ${dbUuid}`)
          },

          // Legacy: Update local order with DB order ID (for backward compatibility)
          // Use rekeyOrder for new code
          updateOrderDbId: (localOrderId: string, dbOrderId: string) => {
            // Register in persistent mapping so ensureOrderCreated can find
            // the db_order_id even after pendingOrderCreations is cleaned up
            localIdToDbOrderId.set(localOrderId, dbOrderId)
            persistLocalIdMap()

            // Clean up stale creation locks so ensureOrderCreated doesn't find "pending_offline"
            pendingOrderCreations.delete(localOrderId)
            orderCreationTimestamps.delete(localOrderId)

            // If the localOrderId is a temp ID, use rekey pattern
            if (
              localOrderId.startsWith('order_') ||
              localOrderId.startsWith('temp_') ||
              localOrderId.startsWith('local_order_')
            ) {
              get().rekeyOrder(localOrderId, dbOrderId)
              return
            }

            // Otherwise, just update the db_order_id field
            set(state => {
              const order = state.ordersById[localOrderId]
              if (!order) return

              const previousOrder = current(order)

              order.db_order_id = dbOrderId
              order.sync_status = 'synced' as const
              state.unsyncedOrderIds = state.unsyncedOrderIds.filter(
                id => id !== localOrderId
              )
              // Surgical dbOrderIdIndex maintenance
              state.dbOrderIdIndex[dbOrderId] = localOrderId
              syncTableOrderIdIndexForOrder(state, localOrderId, previousOrder)
            })
            console.log(
              `[updateOrderDbId] Updated order ${localOrderId} with db_order_id: ${dbOrderId}`
            )
          },

          /**
           * Universal order getter - single index lookup by ID or DB UUID
           * @param idOrDbId - Order ID (DB UUID after sync, or temp ID before)
           * @returns OrderProfile if found, undefined otherwise
           */
          getOrder: (idOrDbId: string): OrderProfile | undefined => {
            const state = get()
            // O(1) lookup via direct key or dbOrderIdIndex
            const localKey = state.dbOrderIdIndex[idOrDbId] ?? idOrDbId
            const direct = state.ordersById[localKey]
            if (direct) return direct

            // Fallback: stale local IDs can linger briefly in UI/session links
            // after reconnect rekey. Resolve through persistent local->db mapping.
            const mappedDbId = localIdToDbOrderId.get(idOrDbId)
            if (!mappedDbId) return undefined

            const mappedKey = state.dbOrderIdIndex[mappedDbId] ?? mappedDbId
            return state.ordersById[mappedKey]
          },

          // Update local order with backend-generated data after sync
          updateOrderFromSync: (
            localOrderId: string,
            backendData: {
              order_number?: number | string
              display_number?: string
              opened_at?: string
              total_amount?: number
              total_tax?: number
              subtotal?: number
              cash_total?: number
              cash_tax_amount?: number
              cash_subtotal?: number
            }
          ) => {
            set(state => {
              const order = state.ordersById[localOrderId]
              if (!order) return

              // Convert order_number to string if provided (backend returns number)
              if (backendData.order_number !== undefined) {
                order.order_number = String(backendData.order_number)
              }
              if (backendData.display_number !== undefined) {
                order.display_number = backendData.display_number
              }
              if (backendData.opened_at !== undefined) {
                order.opened_at = backendData.opened_at
              }
              if (backendData.total_amount !== undefined) {
                order.total_amount = backendData.total_amount
              }
              if (backendData.total_tax !== undefined) {
                order.total_tax = backendData.total_tax
              }
              if (backendData.subtotal !== undefined) {
                ;(order as any).subtotal = backendData.subtotal
              }
              if (backendData.cash_total !== undefined) {
                ;(order as any).cash_total = backendData.cash_total
              }
              if (backendData.cash_tax_amount !== undefined) {
                ;(order as any).cash_tax_amount = backendData.cash_tax_amount
              }
              if (backendData.cash_subtotal !== undefined) {
                ;(order as any).cash_subtotal = backendData.cash_subtotal
              }
            })
            console.log(
              `[updateOrderFromSync] Updated order ${localOrderId} with backend data:`,
              backendData
            )
          },

          // Update local item with DB item ID after successful sync
          updateItemDbId: (
            orderId: string,
            localItemId: string,
            dbItemId: string
          ) => {
            set(state => {
              const order = state.ordersById[orderId]
              if (!order) return

              const updatedItems = order.items.map(item =>
                item.id === localItemId
                  ? {
                      ...item,
                      db_order_item_id: dbItemId,
                      sync_status: 'synced' as const
                    }
                  : item
              )

              order.items = updatedItems
            })
            console.log(
              `[updateItemDbId] Updated item ${localItemId} with db_order_item_id: ${dbItemId}`
            )
          },

          // Get all orders that have items with failed sync status
          getOrdersWithFailedSyncs: () => {
            const { ordersById } = get()
            // Phase 7D: Check sync store for failed/pending status
            const syncStore = useSyncStatusStore.getState()
            const ordersWithFailedSyncs: Array<{
              localId: string
              dbId: string | undefined
            }> = []

            for (const orderId of Object.keys(ordersById)) {
              const order = ordersById[orderId]
              const hasFailedItems = order.items.some(item => {
                const status = syncStore.itemSyncStatus.get(item.id)
                return status === 'failed' || status === 'pending'
              })

              if (hasFailedItems) {
                ordersWithFailedSyncs.push({
                  localId: orderId,
                  dbId: order.db_order_id
                })
              }
            }

            return ordersWithFailedSyncs
          },

          // Update order from reconciliation data
          updateOrderFromReconciliation: (
            localOrderId: string,
            updates: Partial<OrderProfile>
          ) => {
            set(state => {
              const order = state.ordersById[localOrderId]
              if (!order) return
              Object.assign(order, updates)
            })
            console.log(
              `[updateOrderFromReconciliation] Updated order ${localOrderId}`
            )
          },

          patchOrder: (orderId: string, patch: Partial<OrderProfile>) => {
            set(state => {
              const order = state.ordersById[orderId]
              if (!order) return
              Object.assign(order, patch) // Safe: Immer draft
            })
          },

          // Retry failed syncs for an order
          retryFailedSyncs: async (orderId: string) => {
            const {
              ordersById,
              updateItemSyncStatus,
              registerSyncOperation,
              unregisterSyncOperation
            } = get()
            const order = ordersById[orderId]
            if (!order) {
              console.log(`[retryFailedSyncs] Order ${orderId} not found`)
              return
            }

            // Phase 7D: Check sync store for failed status
            const syncStore = useSyncStatusStore.getState()
            const failedItems = order.items.filter(item => {
              if (item.isDraft) return false
              return syncStore.itemSyncStatus.get(item.id) === 'failed'
            })

            if (failedItems.length === 0) {
              console.log(
                `[retryFailedSyncs] No failed items to retry for order ${orderId}`
              )
              return
            }

            console.log(
              `[retryFailedSyncs] Retrying ${failedItems.length} failed items for order ${orderId}`
            )

            for (const item of failedItems) {
              // Mark as syncing
              updateItemSyncStatus(orderId, item.id, 'syncing')

              // Create the sync promise
              const markItemFailedAction = (itemId: string, error: string) => {
                updateItemSyncStatus(orderId, itemId, 'failed', error)
              }

              const setOrderDbIdAction = (
                id: string,
                dbOrderId: string,
                orderNumber: string,
                displayNumber: string,
                createdAt: string,
                syncVersion?: number
              ) => {
                if (id !== dbOrderId) {
                  // Full rekey needed
                  set(state => {
                    const existingOrder = state.ordersById[id]
                    if (!existingOrder) return

                    const snapshot = current(existingOrder)
                    delete state.ordersById[id]
                    state.ordersById[dbOrderId] = freeze({
                      ...snapshot,
                      id: dbOrderId,
                      db_order_id: dbOrderId,
                      order_number: orderNumber,
                      display_number: displayNumber,
                      sync_status: 'synced' as const,
                      sync_version: syncVersion ?? 1,
                      opened_at: snapshot.opened_at || createdAt
                    })

                    const idx = state.orderIds.indexOf(id)
                    if (idx !== -1) state.orderIds[idx] = dbOrderId
                    if (state.activeOrderId === id)
                      state.activeOrderId = dbOrderId
                    const wsIdx = state.workingSetOrderIds.indexOf(id)
                    if (wsIdx !== -1) {
                      state.workingSetOrderIds[wsIdx] = dbOrderId
                      delete state._workingSetLookup[id]
                      state._workingSetLookup[dbOrderId] = true
                    }
                    state.dbOrderIdIndex[dbOrderId] = dbOrderId
                    delete state.dbOrderIdIndex[id]
                    if (state.persistableOrderIds[id]) {
                      delete state.persistableOrderIds[id]
                      state.persistableOrderIds[dbOrderId] = true
                    }

                    syncTableOrderIdIndexForOrder(state, dbOrderId, snapshot)
                  })

                  // Migrate chain maps to new key
                  const existingChain = orderAdditionChains.get(id)
                  if (existingChain) {
                    orderAdditionChains.set(dbOrderId, existingChain)
                    orderAdditionChains.delete(id)
                  }
                  const existingPending = pendingItemAdditions.get(id)
                  if (existingPending) {
                    pendingItemAdditions.set(dbOrderId, existingPending)
                    pendingItemAdditions.delete(id)
                  }

                  rekeyLinkedStores(id, dbOrderId)
                } else {
                  set(state => {
                    const order = state.ordersById[id]
                    if (!order) return
                    const previousOrder = current(order)
                    order.db_order_id = dbOrderId
                    order.order_number = orderNumber
                    order.display_number = displayNumber
                    order.sync_status = 'synced'
                    order.sync_version = syncVersion ?? 1
                    order.opened_at = order.opened_at || createdAt
                    state.dbOrderIdIndex[dbOrderId] = id
                    syncTableOrderIdIndexForOrder(state, id, previousOrder)
                  })
                }

                // Record persistent localId → dbOrderId mapping
                localIdToDbOrderId.set(id, dbOrderId)
                persistLocalIdMap()
              }

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
                .then(success => {
                  // Phase 7C: Removed redundant "synced" call - addItemToBackend
                  // already sets sync status to "synced" via useSyncStatusStore
                  return success
                })
                .catch(err => {
                  console.error(
                    `[retryFailedSyncs] Retry failed for item ${item.id}:`,
                    err
                  )
                  return false
                })
                .finally(() => {
                  unregisterSyncOperation(item.id)
                })

              registerSyncOperation(item.id, syncPromise)
            }
          },

          // Wave 2.8c: per-item retry from BillItem chip. Scans dead-letter
          // first (where 'failed' chips originate), then active queue.
          // Returns a hint so the UI can pick the right toast.
          retrySingleItemSync: async (orderId, itemId) => {
            // 1. Dead-letter scan — most common path for 'failed' chip.
            const deadLettered = getDeadLetterOperations().find(
              op =>
                op.type === 'add_item' &&
                op.localOrderId === orderId &&
                op.localItemId === itemId
            )
            if (deadLettered) {
              await retryDeadLetterOperation(deadLettered.id)
              // The executor uses uuidv5(localItemId) — server returns cached
              // result if already processed, otherwise inserts once.
              return 'retried'
            }

            // 2. Active queue scan — if op is currently 'blocked' check parent.
            const active = getOperationsForOrder(orderId).find(
              op => op.type === 'add_item' && op.localItemId === itemId
            )
            if (active) {
              if (active.status === 'blocked' && active.dependsOn) {
                const parent = getDeadLetterOperations().find(
                  op => op.id === active.dependsOn
                )
                if (parent) {
                  // Parent create_order is dead — child can't proceed without
                  // operator action.
                  return 'parent_dead'
                }
              }
              // Kick the queue. If it executes successfully the chip clears;
              // if it blocks again the user can retry (block_count cap will
              // eventually dead-letter).
              processQueueNow({ force: true }).catch(() => {})
              return 'retried'
            }

            // 3. Op is genuinely missing — sync_status='failed' without a
            // backing queue entry shouldn't happen, but log it.
            console.warn(
              `[retrySingleItemSync] No op found for order=${orderId} item=${itemId}`
            )
            return 'not_found'
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
            const supabase = _supabaseClient
            if (!supabase) {
              console.log(
                '[syncOrderFromDatabase] No Supabase client available'
              )
              return null
            }

            // If input is already a local order ID, just return it
            if (dbOrderIdOrLocalId.startsWith('order_')) {
              console.log(
                `[syncOrderFromDatabase] Already a local order ID: ${dbOrderIdOrLocalId}, skipping database fetch`
              )
              return dbOrderIdOrLocalId
            }

            const existingSync = inFlightDbOrderSyncs.get(dbOrderIdOrLocalId)
            if (existingSync) {
              console.log(
                `[syncOrderFromDatabase] Reusing in-flight sync for ${dbOrderIdOrLocalId}`
              )
              return existingSync
            }

            const syncPromise = (async (): Promise<string | null> => {
              // O(1) order resolution via direct key or dbOrderIdIndex
              const resolvedKey =
                get().dbOrderIdIndex[dbOrderIdOrLocalId] ?? dbOrderIdOrLocalId
              let order = get().ordersById[resolvedKey]
              let localOrderId = resolvedKey
              let isNewOrder = false

              if (!order) {
                // Race guard: hydrateOrderFromSeat may have set db_order_id on an
                // existing order but dbOrderIdIndex isn't populated yet (realtime
                // broadcast arrived before the RPC response). Scan ordersById as a
                // fallback to prevent duplicate order creation.
                const existingEntries = Object.entries(get().ordersById)
                for (let i = 0; i < existingEntries.length; i++) {
                  const [key, o] = existingEntries[i]
                  if (o.db_order_id === dbOrderIdOrLocalId) {
                    // Repair the index and return the existing order
                    set(state => {
                      state.dbOrderIdIndex[dbOrderIdOrLocalId] = key
                    })
                    console.log(
                      `[syncOrderFromDatabase] Race guard: found existing order ${key} for db_order_id ${dbOrderIdOrLocalId}, repaired index`
                    )
                    return key
                  }
                }
                // No existing order — create new
                localOrderId = `order_${Date.now()}_${Math.random()
                  .toString(36)
                  .substr(2, 9)}`
                isNewOrder = true
              }

              // Determine which database ID to use for fetching
              const dbOrderId = order?.db_order_id || dbOrderIdOrLocalId

              console.log(
                `[syncOrderFromDatabase] Syncing order (local: ${localOrderId}, db: ${dbOrderId})`
              )

              try {
                // Fetch order, items, payments, and item payments in parallel
                const [
                  orderResult,
                  itemsResult,
                  paymentsResult,
                  itemPaymentsResult
                ] = await Promise.all([
                  supabase
                    .from('orders')
                    .select('*')
                    .eq('id', dbOrderId)
                    .single(),
                  supabase
                    .from('order_items')
                    .select('*, order_item_modifiers (*)')
                    .eq('order_id', dbOrderId)
                    .eq('is_voided', false),
                  supabase
                    .from('order_payments')
                    .select('*')
                    .eq('order_id', dbOrderId),
                  supabase
                    .from('order_item_payments')
                    .select('*')
                    .eq('order_id', dbOrderId)
                ])

                if (orderResult.error) {
                  console.error(
                    '[syncOrderFromDatabase] Order fetch error:',
                    orderResult.error
                  )
                  throw new Error(orderResult.error.message)
                }

                const dbOrder = orderResult.data
                if (!dbOrder) {
                  throw new Error('Order not found in database')
                }

                if (itemsResult.error) {
                  console.error(
                    '[syncOrderFromDatabase] Items fetch error:',
                    itemsResult.error
                  )
                  throw new Error(itemsResult.error.message)
                }

                const dbItems = itemsResult.data
                const dbPayments = paymentsResult.data
                const dbItemPayments = itemPaymentsResult.data

                if (paymentsResult.error) {
                  console.error(
                    '[syncOrderFromDatabase] Payments fetch error:',
                    paymentsResult.error
                  )
                  // Non-fatal - continue without payments
                }

                if (__DEV__) {
                  console.log('[syncOrderFromDatabase] Fetched data:', {
                    orderId: dbOrder?.id,
                    items: dbItems?.length || 0,
                    payments: dbPayments?.length || 0
                  })
                }

                // 4. Update local state with database values
                set(state => {
                  const localOrder = state.ordersById[localOrderId]

                  // If order doesn't exist locally, we need to create it from DB data
                  // Otherwise, sync existing order with DB data
                  const syncedItems = localOrder
                    ? localOrder.items.map(localItem => {
                        const dbItem = dbItems?.find(
                          db => db.id === localItem.db_order_item_id
                        )
                        if (dbItem) {
                          return {
                            ...localItem,
                            quantity: dbItem.quantity,
                            // FIX: Use higher of local vs backend to prevent overwrite
                            paidQuantity: Math.max(
                              localItem.paidQuantity || 0,
                              dbItem.paid_quantity || 0
                            ),
                            price: dbItem.unit_price,
                            cashPrice: dbItem.cash_price,
                            is_voided: dbItem.is_voided,
                            // Preserve course number from backend to prevent items being grouped into course 1
                            courseNumber:
                              dbItem.course_number ||
                              localItem.courseNumber ||
                              1,
                            // Sync seat assignment from backend so cross-station seat
                            // changes propagate. Backend is authoritative — explicit
                            // null means "Shared" and must win over a stale local
                            // value. Only fall back to local if the column was
                            // genuinely missing from the response.
                            seatNumber:
                              dbItem.seat_number !== undefined
                                ? dbItem.seat_number
                                : localItem.seatNumber ?? null,
                            // Sync discount distribution fields from backend
                            discount_amount: dbItem.discount_amount ?? 0,
                            discount_cash_amount:
                              dbItem.discount_cash_amount ??
                              dbItem.discount_amount ??
                              0,
                            subtotal: dbItem.subtotal,
                            cashSubtotal: dbItem.cash_subtotal,
                            taxAmount: dbItem.tax_amount,
                            cashTaxAmount: dbItem.cash_tax_amount,
                            sync_status: 'synced' as const,
                            sync_error: undefined,
                            customizations: {
                              ...localItem.customizations,
                              notes:
                                dbItem.special_instructions ||
                                localItem.customizations?.notes,
                              modifiers:
                                transformBackendModifiers(
                                  dbItem.order_item_modifiers
                                ) ?? localItem.customizations?.modifiers
                            }
                          }
                        }
                        return localItem
                      })
                    : [] // If no local order, start with empty array

                  // Also add any items from DB that aren't in local state
                  const localItemDbIds = new Set(
                    (localOrder?.items || [])
                      .map(i => i.db_order_item_id)
                      .filter(Boolean)
                  )
                  const newItemsFromDb: CartItem[] =
                    dbItems
                      ?.filter(dbItem => !localItemDbIds.has(dbItem.id))
                      .map(dbItem => ({
                        id: `db_${dbItem.id}`,
                        db_order_item_id: dbItem.id,
                        menuItemId: dbItem.menu_item_id || '',
                        // For open items, use open_item_name; otherwise use item_name
                        name: dbItem.is_open_item
                          ? dbItem.open_item_name || 'Open Item'
                          : dbItem.item_name || 'Unknown Item',
                        // For open items, use open_item_price; otherwise use unit_price
                        price: dbItem.is_open_item
                          ? dbItem.open_item_price || 0
                          : dbItem.unit_price || 0,
                        unitPrice: dbItem.is_open_item
                          ? dbItem.open_item_price || 0
                          : dbItem.unit_price || 0,
                        cashPrice:
                          dbItem.cash_price ||
                          dbItem.cash_unit_price ||
                          (dbItem.is_open_item
                            ? dbItem.open_item_price
                            : dbItem.unit_price) ||
                          0,
                        originalPrice:
                          dbItem.cash_price ||
                          dbItem.cash_unit_price ||
                          (dbItem.is_open_item
                            ? dbItem.open_item_price
                            : dbItem.unit_price) ||
                          0,
                        quantity: dbItem.quantity || 1,
                        // When creating from DB, trust backend value
                        paidQuantity: dbItem.paid_quantity || 0,
                        // Preserve course number from backend to prevent items being grouped into course 1
                        courseNumber: dbItem.course_number || 1,
                        // Carry seat assignment from backend so the bill seat pill
                        // survives reload (matches utils/orderTransformers.ts:250).
                        seatNumber: dbItem.seat_number ?? null,
                        category_name: dbItem.category_name || 'Uncategorized',
                        is_voided: dbItem.is_voided || false,
                        sync_status: 'synced' as const,
                        customizations: {
                          notes: dbItem.special_instructions || undefined,
                          modifiers: transformBackendModifiers(
                            dbItem.order_item_modifiers
                          )
                        },
                        // Open item support
                        is_open_item: dbItem.is_open_item || false,
                        open_item_name: dbItem.open_item_name || undefined,
                        open_item_price: dbItem.open_item_price || undefined,
                        // Use authoritative kitchen_status column (updated by KDS),
                        // fall back to legacy item_status derivation
                        kitchen_status:
                          (dbItem.kitchen_status as CartItem['kitchen_status']) ||
                          (dbItem.item_status === 'Ready'
                            ? 'ready'
                            : dbItem.item_status === 'Served' ||
                              dbItem.item_status === 'Completed'
                            ? 'served'
                            : 'sent'),
                        item_status: (dbItem.item_status as any) || 'Preparing',
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
                        discount_cash_amount:
                          dbItem.discount_cash_amount ??
                          dbItem.discount_amount ??
                          0,
                        // Required base prices (for recalculation)
                        // Use base_card_price/base_cash_price (without modifiers)
                        // so calculateItemEffective*Price can add modifiers correctly.
                        // Falls back to unit_price/cash_price for older items that
                        // lack the base columns — in that case modifiers will be
                        // double-counted, but calculate_order_totals_fast on the
                        // backend remains authoritative.
                        baseCardPrice: dbItem.is_open_item
                          ? dbItem.open_item_price || 0
                          : (dbItem as any).base_card_price ??
                            dbItem.unit_price ??
                            0,
                        baseCashPrice:
                          (dbItem as any).base_cash_price ??
                          (dbItem.cash_price ||
                            dbItem.cash_unit_price ||
                            (dbItem.is_open_item
                              ? dbItem.open_item_price
                              : dbItem.unit_price) ||
                            0)
                      })) || []

                  const allItems = [...syncedItems, ...newItemsFromDb]

                  // Map payments from database
                  const syncedPayments: OrderProfilePayment[] =
                    dbPayments?.map(p => {
                      // Proper status mapping — preserve authorized for pre-auth
                      const status: OrderProfilePayment['status'] =
                        p.status === 'voided'
                          ? 'voided'
                          : p.status === 'refunded'
                          ? 'refunded'
                          : p.status === 'authorized'
                          ? 'authorized'
                          : p.status === 'captured'
                          ? 'captured'
                          : 'pending'

                      const isPreAuth = p.status === 'authorized'
                      const terminalResponse = (p as any).terminal_response as
                        | Record<string, any>
                        | undefined
                      const castlesTxn =
                        terminalResponse?.castles_transaction as
                          | Record<string, any>
                          | undefined

                      return {
                        id: p.id,
                        db_payment_id: p.id,
                        amount: p.amount,
                        method: (p.payment_method === 'card'
                          ? 'Card'
                          : 'Cash') as PaymentType,
                        cardBrand: p.card_type,
                        last4: p.card_last_four,
                        tip_amount: p.tip_amount || 0,
                        total_collected: p.amount + (p.tip_amount || 0),
                        itemsCovered: (p.item_ids || []).map(
                          (itemId: string) => ({
                            itemId,
                            itemName: 'Item',
                            quantity: 1,
                            unitPrice: 0,
                            subtotal: 0
                          })
                        ),
                        timestamp: p.created_at,
                        status,
                        isVoided: p.status === 'voided',
                        sync_status: 'synced' as const,
                        sync_attempt_count: 0,
                        // Cash pricing fields — falls back to order-level ratio when original_amount is missing
                        isCashPriced: (p as any).is_cash_priced ?? undefined,
                        cashSavings: deriveCashSavings(
                          {
                            is_cash_priced: (p as any).is_cash_priced,
                            original_amount: (p as any).original_amount,
                            amount: p.amount
                          },
                          dbOrder.card_total ?? dbOrder.total_amount,
                          dbOrder.cash_total
                        ),
                        // Pre-auth fields
                        isPreAuth,
                        ...(isPreAuth
                          ? {
                              preAuthAmount: p.amount,
                              preAuthRrn: (p as any).rrn || castlesTxn?.rrn,
                              preAuthStan: castlesTxn?.stan,
                              preAuthAuthCode:
                                (p as any).authorization_code ||
                                castlesTxn?.approvalCode,
                              preAuthReferenceId:
                                (p as any).reference_number ||
                                castlesTxn?.referenceId,
                              preAuthTerminalType:
                                (terminalResponse?.terminal_vendor === 'castles'
                                  ? 'castles'
                                  : 'dejavoo') as
                                  | 'dejavoo'
                                  | 'castles'
                                  | undefined
                            }
                          : {})
                      }
                    }) ||
                    localOrder?.payments ||
                    []

                  // ================================================================
                  // CALCULATE paid_status FROM LOCAL PAYMENTS ONLY
                  // ================================================================
                  // CRITICAL: Use local payments array as single source of truth
                  // This prevents flicker caused by stale/racing backend values
                  const orderTotalAmount =
                    dbOrder.card_total || dbOrder.total_amount || 0
                  // Prefer backend payment_status when available (most authoritative)
                  // Falls back to local calculation for cases where backend status isn't set
                  const syncedPaidStatus = dbOrder.payment_status
                    ? mapPaymentStatus(dbOrder.payment_status)
                    : calculatePaidStatusFromPayments(
                        syncedPayments,
                        orderTotalAmount
                      )
                  const isPaid = syncedPaidStatus === 'Paid'

                  // Create base order profile (either update existing or create new)
                  const baseOrderProfile = localOrder || {
                    id: localOrderId,
                    db_order_id: dbOrderId,
                    service_location_id:
                      dbOrder.table_number || dbOrder.service_location_id,
                    order_status: (dbOrder.status as any) || 'preparing',
                    order_type: mapOrderType(dbOrder.order_type),
                    opened_at: dbOrder.created_at,
                    customer_name: '',
                    display_number: dbOrder.display_number,
                    order_number: dbOrder.order_number,
                    station_id: dbOrder.station_id,
                    sync_version: dbOrder.sync_version ?? 1
                  }

                  // If creating new order, add to orderIds array
                  const newOrderIds = localOrder
                    ? state.orderIds
                    : [...state.orderIds, localOrderId]

                  const updatedOrderProfile: OrderProfile = {
                    ...baseOrderProfile,
                    items: allItems,
                    payments: syncedPayments,
                    // Use database as source of truth for financial data
                    amount_paid: dbOrder.amount_paid || 0,
                    amount_due: dbOrder.amount_due || 0,
                    cash_amount_due: dbOrder.cash_amount_due, // Direct from DB - authoritative
                    total_amount: dbOrder.card_total || dbOrder.total_amount,
                    total_tax: dbOrder.card_tax_amount || dbOrder.tax_amount,
                    paid_status: syncedPaidStatus,
                    check_status: isPaid ? 'Closed' : 'Opened',
                    // Session tracking - sync from database
                    session_id: dbOrder.session_id,
                    order_source: dbOrder.order_source ?? null,
                    delivery_platform:
                      dbOrder.delivery_platform ??
                      normalizePlatform(
                        (dbOrder as any).metadata?.delivery_company
                      ) ??
                      null,
                    sync_status: 'synced'
                  }

                  state.ordersById[localOrderId] = updatedOrderProfile
                  state.orderIds = newOrderIds

                  // Surgical dbOrderIdIndex maintenance
                  state.dbOrderIdIndex[dbOrderId] = localOrderId
                  syncTableOrderIdIndexForOrder(state, localOrderId)
                  // Ensure MMKV persistence
                  state.persistableOrderIds[localOrderId] = true

                  // Update outstanding totals if this is the active order
                  if (localOrderId === state.activeOrderId) {
                    state.activeOrderOutstandingTotal = dbOrder.amount_due || 0
                    // Priority: backend cash_amount_due > current local value > card amount_due
                    state.activeOrderOutstandingCash =
                      dbOrder.cash_amount_due ??
                      state.activeOrderOutstandingCash ??
                      dbOrder.amount_due ??
                      0
                    state.activeOrderTotal =
                      dbOrder.card_total || dbOrder.total_amount || 0
                    state.activeOrderTax =
                      dbOrder.card_tax_amount || dbOrder.tax_amount || 0
                    state.activeOrderSubtotal =
                      dbOrder.card_subtotal || dbOrder.subtotal || 0
                  }
                })

                console.log(
                  '[syncOrderFromDatabase] Successfully synced order from database'
                )
                return localOrderId
              } catch (error: any) {
                console.error('[syncOrderFromDatabase] Error:', error)
                return null
              }
            })()

            inFlightDbOrderSyncs.set(dbOrderIdOrLocalId, syncPromise)
            try {
              return await syncPromise
            } finally {
              if (
                inFlightDbOrderSyncs.get(dbOrderIdOrLocalId) === syncPromise
              ) {
                inFlightDbOrderSyncs.delete(dbOrderIdOrLocalId)
              }
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
            const supabase = _supabaseClient
            if (!supabase) {
              console.log('[syncPaymentStatus] No Supabase client available')
              return
            }

            const order = get().ordersById[orderId]
            if (!order || !order.db_order_id) {
              console.log(
                '[syncPaymentStatus] Order not found or not synced to DB'
              )
              return
            }

            console.log(
              `[syncPaymentStatus] Starting sync for order ${orderId}`
            )
            set({ paymentSyncStatus: 'syncing' })

            try {
              // Fetch fresh payment data from backend
              const { data: dbOrder, error: orderError } = await supabase
                .from('orders')
                .select(
                  'payment_status, amount_due, cash_amount_due, amount_paid, card_total, cash_total, total_amount'
                )
                .eq('id', order.db_order_id)
                .single()

              if (orderError) throw orderError

              // Fetch fresh payments list
              const { data: dbPayments, error: paymentsError } = await supabase
                .from('order_payments')
                .select('*')
                .eq('order_id', order.db_order_id)

              if (paymentsError) {
                console.warn(
                  '[syncPaymentStatus] Payments fetch error:',
                  paymentsError
                )
              }

              // Map payments to local format (OrderProfilePayment[])
              const syncedPayments: OrderProfilePayment[] =
                dbPayments?.map((p): OrderProfilePayment => {
                  const method: PaymentType =
                    p.payment_method === 'cash' ? 'Cash' : 'Card'
                  const tipAmount = p.tip_amount ?? 0

                  // Derive item coverage from covers_items using order context
                  const orderItems = order?.items || []
                  const itemsCovered: OrderPaymentItemCoverage[] = (
                    p.covers_items || []
                  ).map((itemId: string) => {
                    const item = orderItems.find(
                      i => i.db_order_item_id === itemId || i.id === itemId
                    )
                    return {
                      itemId,
                      itemName: item?.name || 'Unknown Item',
                      quantity: item?.quantity || 1,
                      unitPrice: item?.price || 0,
                      subtotal: (item?.price || 0) * (item?.quantity || 1)
                    }
                  })

                  // Build split info if applicable
                  const splitInfo =
                    p.split_count && p.split_portion_index
                      ? {
                          portionIndex: p.split_portion_index,
                          totalPortions: p.split_count,
                          isLastPortion: p.split_portion_index === p.split_count
                        }
                      : undefined

                  // Calculate cash savings — falls back to order-level ratio when original_amount is missing
                  const cashSavings = deriveCashSavings(
                    {
                      is_cash_priced: p.is_cash_priced,
                      original_amount: p.original_amount,
                      amount: p.amount
                    },
                    dbOrder.card_total ?? dbOrder.total_amount,
                    dbOrder.cash_total
                  )

                  const isPreAuth = p.status === 'authorized'
                  const terminalResponse = (p as any).terminal_response as
                    | Record<string, any>
                    | undefined
                  const castlesTxn = terminalResponse?.castles_transaction as
                    | Record<string, any>
                    | undefined

                  return {
                    id: `payment_${p.id}`,
                    db_payment_id: p.id,
                    amount: p.amount,
                    method,
                    tip_amount: tipAmount,
                    total_collected: p.total_amount ?? p.amount + tipAmount,
                    cardBrand: p.card_type ?? undefined,
                    last4: p.card_last_four ?? undefined,
                    amountTendered: p.amount_tendered ?? undefined,
                    changeGiven:
                      p.change_given > 0 ? p.change_given : undefined,
                    isCashPriced: p.is_cash_priced ?? undefined,
                    cashSavings,
                    subtotal_portion: p.subtotal_portion ?? undefined,
                    tax_portion: p.tax_portion ?? undefined,
                    splitInfo,
                    itemsCovered,
                    status: p.is_voided
                      ? 'voided'
                      : p.status === 'refunded'
                      ? 'refunded'
                      : p.status === 'authorized'
                      ? 'authorized'
                      : p.status === 'captured'
                      ? 'captured'
                      : 'pending',
                    timestamp: p.captured_at ?? p.created_at,
                    isVoided: p.is_voided ?? false,
                    voidReason: p.void_reason ?? undefined,
                    sync_status: 'synced',
                    // Pre-auth fields
                    isPreAuth,
                    ...(isPreAuth
                      ? {
                          preAuthAmount: p.amount,
                          preAuthRrn: (p as any).rrn || castlesTxn?.rrn,
                          preAuthStan: castlesTxn?.stan,
                          preAuthAuthCode:
                            (p as any).authorization_code ||
                            castlesTxn?.approvalCode,
                          preAuthReferenceId:
                            (p as any).reference_number ||
                            castlesTxn?.referenceId,
                          preAuthTerminalType:
                            (terminalResponse?.terminal_vendor === 'castles'
                              ? 'castles'
                              : 'dejavoo') as 'dejavoo' | 'castles' | undefined
                        }
                      : {})
                  }
                }) || []

              // Calculate status from fresh payments
              const orderTotalAmount =
                dbOrder.card_total || dbOrder.total_amount || 0
              const freshPaidStatus = calculatePaidStatusFromPayments(
                syncedPayments,
                orderTotalAmount
              )
              const isPaid = freshPaidStatus === 'Paid'

              console.log('[syncPaymentStatus] Fresh status:', {
                paidStatus: freshPaidStatus,
                amountDue: dbOrder.amount_due,
                amountPaid: dbOrder.amount_paid,
                paymentsCount: syncedPayments.length
              })

              // Update order with fresh backend values
              set(state => {
                state.paymentSyncStatus = 'idle'
                const order = state.ordersById[orderId]
                if (!order) return
                order.amount_due = dbOrder.amount_due ?? 0
                order.cash_amount_due = dbOrder.cash_amount_due
                order.amount_paid = dbOrder.amount_paid ?? 0
                order.paid_status = freshPaidStatus
                order.check_status = isPaid
                  ? ('Closed' as const)
                  : ('Opened' as const)
                order.payments =
                  syncedPayments.length > 0 ? syncedPayments : order.payments

                // Update outstanding totals if this is the active order
                if (orderId === state.activeOrderId) {
                  state.activeOrderOutstandingTotal = dbOrder.amount_due ?? 0
                  state.activeOrderOutstandingCash = dbOrder.cash_amount_due
                }
              })

              console.log(
                '[syncPaymentStatus] Successfully synced payment status'
              )
            } catch (error: any) {
              console.error('[syncPaymentStatus] Error:', error)
              set({ paymentSyncStatus: 'error' })
              // Auto-reset to idle after 3 seconds on error
              setTimeout(() => {
                set({ paymentSyncStatus: 'idle' })
              }, 3000)
            }
          },

          // ============================================================================
          // LINK ORDER TO SESSION - Bidirectionally link order and session
          // ============================================================================
          linkOrderToSession: async (
            orderId: string,
            sessionId: string
          ): Promise<boolean> => {
            const order = get().ordersById[orderId]
            if (!order) {
              console.error(`[linkOrderToSession] Order ${orderId} not found`)
              return false
            }

            console.log(
              `[linkOrderToSession] Linking order ${orderId} to session ${sessionId}`
            )

            // 1. OPTIMISTIC UPDATE: Set session_id on order immediately
            set(state => {
              const o = state.ordersById[orderId]
              if (!o) return
              o.session_id = sessionId
              o.local_session_id = sessionId // Also set local_session_id for offline tracking
            })

            // 2. SYNC TO BACKEND: Call RPC if online and order has DB ID
            const isOnline = getIsOnline()
            if (isOnline && order.db_order_id) {
              try {
                const supabase = _supabaseClient
                if (!supabase) {
                  console.warn(
                    '[linkOrderToSession] No Supabase client, will queue for offline sync'
                  )
                } else {
                  console.log(
                    `[linkOrderToSession] Calling RPC for order ${order.db_order_id}`
                  )

                  // rpc-discipline-allow: inline-wrapped Category A — link_order_to_session with retry safety
                  const { data, error } = await runWithDeadline<any>(
                    'link_order_to_session_inline',
                    DEADLINES.hotMutation,
                    async (signal) =>
                      await supabase
                        .rpc('link_order_to_session', {
                          p_order_id: order.db_order_id,
                          p_session_id: sessionId
                        })
                        .abortSignal(signal)
                  )

                  if (error) {
                    console.error('[linkOrderToSession] RPC error:', error)
                    // Queue for offline sync as fallback
                    await queueOperation({
                      type: 'link_order_to_session',
                      params: {
                        orderId: order.db_order_id,
                        sessionId
                      },
                      localOrderId: orderId
                    })
                    return false
                  }

                  console.log('[linkOrderToSession] Successfully linked:', data)
                  return true
                }
              } catch (err) {
                console.error('[linkOrderToSession] Exception:', err)
                // Queue for offline sync
                await queueOperation({
                  type: 'link_order_to_session',
                  params: {
                    orderId: order.db_order_id || orderId,
                    sessionId
                  },
                  localOrderId: orderId
                })
                return false
              }
            }

            // 3. OFFLINE MODE: Queue operation for later sync
            console.log(
              '[linkOrderToSession] Offline mode - queueing operation'
            )
            await queueOperation({
              type: 'link_order_to_session',
              params: {
                orderId: order.db_order_id || orderId,
                sessionId
              },
              localOrderId: orderId
            })

            return true
          },

          // ============================================================================
          // HYDRATE ORDER FROM SEAT — Update/create order from seat_guests_v3 response
          // ============================================================================
          hydrateOrderFromSeat: ({
            localOrderId,
            dbOrderId,
            sessionId,
            orderNumber,
            displayNumber
          }) => {
            if (localOrderId) {
              // Path A: Update existing local order with backend data
              const order = get().ordersById[localOrderId]
              if (order) {
                set(state => {
                  const existing = state.ordersById[localOrderId]
                  if (!existing) return
                  existing.db_order_id = dbOrderId
                  existing.session_id = sessionId
                  existing.local_session_id = sessionId
                  existing.sync_status = 'synced' as const
                  if (orderNumber) existing.order_number = orderNumber
                  if (displayNumber) existing.display_number = displayNumber

                  // Surgical dbOrderIdIndex maintenance
                  state.dbOrderIdIndex[dbOrderId] = localOrderId
                  state.unsyncedOrderIds = state.unsyncedOrderIds.filter(
                    id => id !== localOrderId
                  )
                })
                console.log(
                  `[hydrateOrderFromSeat] Updated local order ${localOrderId} → db ${dbOrderId}, session ${sessionId}`
                )

                // Rekey temp orders to DB UUID to prevent broadcast duplicates.
                // Without this, upsertOrder creates a second entry at ordersById[dbOrderId]
                // with empty items (v2 header-only), overwriting dbOrderIdIndex and causing
                // useTableSession to resolve to the empty copy → $0.00 totals / broken kitchen.
                // Same pattern as takeout: ensureOrderCreated → updateOrderDbId → rekeyOrder.
                if (
                  localOrderId !== dbOrderId &&
                  (localOrderId.startsWith('order_') ||
                    localOrderId.startsWith('temp_') ||
                    localOrderId.startsWith('local_order_'))
                ) {
                  get().rekeyOrder(localOrderId, dbOrderId)
                }

                return
              }
              // If localOrderId is a temp key, try rekeyOrder pattern
              if (
                localOrderId.startsWith('order_') ||
                localOrderId.startsWith('temp_') ||
                localOrderId.startsWith('local_order_')
              ) {
                get().rekeyOrder(localOrderId, dbOrderId)
                // After rekey, patch in session data
                set(state => {
                  const rekeyed = state.ordersById[dbOrderId]
                  if (!rekeyed) return
                  rekeyed.session_id = sessionId
                  rekeyed.local_session_id = sessionId
                  if (orderNumber) rekeyed.order_number = orderNumber
                  if (displayNumber) rekeyed.display_number = displayNumber
                })
                console.log(
                  `[hydrateOrderFromSeat] Rekeyed ${localOrderId} → ${dbOrderId}, session ${sessionId}`
                )
                return
              }
            }

            // Path B: No localOrderId — create minimal shell order keyed by dbOrderId
            set(state => {
              if (state.ordersById[dbOrderId]) return // already exists
              state.ordersById[dbOrderId] = {
                id: dbOrderId,
                db_order_id: dbOrderId,
                session_id: sessionId,
                local_session_id: sessionId,
                order_number: orderNumber,
                display_number: displayNumber,
                sync_status: 'synced',
                order_status: 'draft',
                check_status: 'Opened',
                paid_status: 'Unpaid',
                items: [],
                opened_at: new Date().toISOString(),
                service_location_id: null
              }
              state.dbOrderIdIndex[dbOrderId] = dbOrderId
            })
            console.log(
              `[hydrateOrderFromSeat] Created shell order ${dbOrderId}, session ${sessionId}`
            )
          },

          /**
           * Initialize orders - fetch all active orders on login.
           * Replaces prefetchOrders with a cleaner single-index approach.
           */
          initializeOrders: async (
            locationId: string,
            forceRefresh: boolean = false
          ): Promise<void> => {
            // Phase 11.3: Prevent concurrent calls
            if (get().isInitializing) {
              console.log('[initializeOrders] Already initializing, skipping')
              return
            }

            const supabase = _supabaseClient
            if (!supabase || !locationId) {
              console.warn(
                '[initializeOrders] No supabase client or locationId'
              )
              return
            }

            set({ isInitializing: true, currentLocationId: locationId })
            console.log(
              `[initializeOrders] Fetching active orders for location: ${locationId} (Force: ${forceRefresh})`
            )

            try {
              // Fetch all active orders with items and modifiers
              // Use !forceRefresh logic inside transform/merge
              const { data, error } = await supabase
                .from('orders')
                .select(
                  `
                  *,
                  order_items (
                    *,
                    order_item_modifiers (*)
                  ),
                  order_payments(*),
                  stations(station_name),
                  created_by_staff:staff_profiles!created_by_staff_id(first_name, last_name)
                `
                )
                .eq('location_id', locationId)
                .in('status', [
                  'draft',
                  'pending',
                  'sent_to_kitchen',
                  'preparing',
                  'ready'
                ])
                .order('created_at', { ascending: false })

              if (error) {
                console.error('[initializeOrders] Fetch error:', error)
                throw error
              }

              if (!data || data.length === 0) {
                console.log('[initializeOrders] No active orders found')
                return
              }

              // Transform and index by DB UUID (single index)
              const newOrders: Record<string, OrderProfile> = {}
              const newOrderIds: string[] = []

              for (const serverOrder of data) {
                const exists = !!get().ordersById[serverOrder.id]
                // Skip if already in store, UNLESS forceRefresh is true
                if (exists && !forceRefresh) {
                  // Hydrate missing payments from server data already fetched
                  const localOrder = get().ordersById[serverOrder.id]
                  const fetchedPayments = (serverOrder as any).order_payments
                  if (
                    localOrder &&
                    (!localOrder.payments ||
                      localOrder.payments.length === 0) &&
                    fetchedPayments?.length > 0
                  ) {
                    const normalized = normalizeFetchedOrder(
                      serverOrder as FetchedOrderData
                    )
                    const payments = transformBroadcastPaymentsToProfile(
                      normalized.order_payments,
                      normalized.order_items
                    )
                    if (payments.length > 0) {
                      console.log(
                        `[initializeOrders] Hydrating ${payments.length} missing payments for order ${serverOrder.id}`
                      )
                      set(state => {
                        const order = state.ordersById[serverOrder.id]
                        if (order) {
                          order.payments = payments
                        }
                      })
                    }
                  }
                  continue
                }

                // Normalize and transform
                const normalized = normalizeFetchedOrder(
                  serverOrder as FetchedOrderData
                )

                const orderProfile = transformBroadcastToOrder(normalized)

                // Use DB UUID as the key
                newOrders[serverOrder.id] = orderProfile
                if (!exists) {
                  newOrderIds.push(serverOrder.id)
                }
              }

              // Collect order_ids referenced by active table sessions so we never
              // evict them — even if their status falls outside the fetch filter.
              const activeSessionOrderIds = new Set<string>()
              try {
                const sessionStore = (
                  require('@/stores/useTableSessionStore') as typeof import('@/stores/useTableSessionStore')
                ).useTableSessionStore
                for (const sess of Object.values(
                  sessionStore.getState().sessions
                )) {
                  if (sess.order_id) activeSessionOrderIds.add(sess.order_id)
                }
              } catch {
                // Non-fatal: prefetch will re-sync if needed
              }

              // Replacement strategy: preserve unsynced + pending-items + active-session orders, server wins for the rest
              set(state => {
                const preservedIds: string[] = []

                // Collect IDs to preserve
                for (const id of state.unsyncedOrderIds) {
                  if (state.ordersById[id]) {
                    preservedIds.push(id)
                  }
                }
                for (const id of state.orderIds) {
                  if (preservedIds.includes(id)) continue
                  const order = state.ordersById[id]
                  if (!order) continue
                  // Preserve if it has unsynced items
                  if (
                    order.items.some(
                      item => !item.db_order_item_id && !item.isDraft
                    )
                  ) {
                    preservedIds.push(id)
                    continue
                  }
                  // Preserve if it's referenced by an active table session (db_order_id match)
                  if (
                    order.db_order_id &&
                    activeSessionOrderIds.has(order.db_order_id)
                  ) {
                    preservedIds.push(id)
                  }
                }

                // Build new ordersById: start with preserved, then overlay server data
                const preservedOrders: Record<string, OrderProfile> = {}
                for (const id of preservedIds) {
                  preservedOrders[id] = state.ordersById[id]
                }
                // Server wins, preserved orders fill gaps
                state.ordersById = { ...preservedOrders, ...newOrders } as any
                state.orderIds = [...new Set([...preservedIds, ...newOrderIds])]
                state.tableOrderIdIndex = rebuildTableOrderIdIndex(
                  state.ordersById
                )
                state.currentLocationId = locationId
              })

              console.log(
                `[initializeOrders] Loaded ${newOrderIds.length} orders`
              )

              // Seed local order sequence counters from backend data
              try {
                const { currentStation } = get()
                const stationNumber = currentStation?.station_number ?? null
                const stationPrefix =
                  stationNumber != null ? `S${stationNumber}` : null
                let highestSeq = 0

                for (const serverOrder of data) {
                  const dn = serverOrder.display_number as string | null
                  if (!dn) continue

                  // Only count orders matching our station prefix
                  if (stationPrefix) {
                    if (!dn.startsWith(`#${stationPrefix}-`)) continue
                  } else {
                    // Global counter — skip station-prefixed numbers
                    if (dn.match(/^#S\d+-/)) continue
                  }

                  const seqMatch = dn.match(/(\d+)$/)
                  if (seqMatch) {
                    const seq = parseInt(seqMatch[1], 10)
                    if (seq > highestSeq) highestSeq = seq
                  }
                }

                if (highestSeq > 0) {
                  seedLocalSequence(locationId, stationNumber, highestSeq)
                  console.log(
                    `[initializeOrders] Seeded local sequence: station=${
                      stationPrefix ?? 'global'
                    }, seq=${highestSeq}`
                  )
                }
              } catch (seedError) {
                console.warn(
                  '[initializeOrders] Failed to seed local sequence:',
                  seedError
                )
              }
            } catch (error) {
              console.error('[initializeOrders] Error:', error)
            } finally {
              // Phase 11.3: Reset initialization flag
              set({ isInitializing: false })
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
            const order = get().ordersById[orderId]
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
                cash_discount_amount: 0,
                cash_tax_amount: 0,
                cash_total_amount: 0,
                cash_outstanding_subtotal: 0,
                cash_outstanding_tax: 0,
                cash_outstanding_total: 0
              }
            }

            const taxRatesMap = useStoreSettingsStore.getState().taxRatesMap
            const totals = calculateOrderTotals(
              order.items,
              order.checkDiscount ?? null,
              order.payments ?? [],
              taxRatesMap
            )

            // PRIORITY: If order has backend-synced amount_due, use it as authoritative
            // This is crucial after payments have been processed
            const hasBackendAmountDue =
              order.amount_due !== undefined && order.amount_due >= 0

            const finalOutstandingTotal = hasBackendAmountDue
              ? order.amount_due!
              : totals.outstanding_total

            const finalCashOutstandingTotal =
              order.cash_amount_due !== undefined && order.cash_amount_due >= 0
                ? order.cash_amount_due
                : totals.cash_outstanding_total

            // Update order with new totals (use backend values for outstanding if available)
            set(state => {
              const o = state.ordersById[orderId]
              if (!o) return
              o.total_amount = totals.total_amount
              o.total_tax = totals.tax_amount
              // Preserve backend total_discount when checkDiscount hasn't been restored yet
              // (e.g. cross-station order where discount metadata is still being fetched)
              const preserveBackendDiscount =
                totals.discount_amount === 0 &&
                (o.total_discount ?? 0) > 0 &&
                !o.checkDiscount
              if (!preserveBackendDiscount) {
                o.total_discount = totals.discount_amount
              }
              o.amount_due = finalOutstandingTotal
              o.cash_amount_due = finalCashOutstandingTotal

              // Update active order derived state if this is the active order
              if (orderId === state.activeOrderId) {
                state.activeOrderSubtotal = totals.subtotal
                state.activeOrderTax = totals.tax_amount
                state.activeOrderTotal = totals.total_amount
                state.activeOrderDiscount = preserveBackendDiscount
                  ? o.total_discount!
                  : totals.discount_amount
                state.activeOrderOutstandingSubtotal =
                  totals.outstanding_subtotal
                state.activeOrderOutstandingTax = totals.outstanding_tax
                state.activeOrderOutstandingTotal = finalOutstandingTotal
                state.activeOrderTotalCash = totals.cash_total_amount
                state.activeOrderOutstandingCash = finalCashOutstandingTotal
              }
            })

            // Auto-manage paid_status from payments
            const hasItems = (order.items?.length || 0) > 0
            if (hasItems) {
              // Skip paid_status recalculation for orders with pre-auth payments —
              // calculatePaidStatus doesn't understand pre-auth semantics,
              // trust the backend-synced paid_status instead
              const hasPreAuthPayments = order.payments?.some(
                p => !p.isVoided && (p.isPreAuth || p.status === 'authorized')
              )
              if (!hasPreAuthPayments) {
                const correctPaidStatus = calculatePaidStatusFromPayments(
                  order.payments,
                  totals.total_amount
                )
                if (correctPaidStatus !== order.paid_status) {
                  set(state => {
                    const o = state.ordersById[orderId]
                    if (o) o.paid_status = correctPaidStatus
                  })
                }
              }
            }

            // Invalidate payment preview cache
            paymentPreviewService.invalidateCache(orderId)

            return totals
          },

          /**
           * Mark items as paid after a successful payment.
           * Updates paidQuantity on items and recalculates totals.
           *
           * @param orderId - The local order ID
           * @param allocations - Array of item payment allocations
           */
          markItemsPaid: (
            orderId: string,
            allocations: ItemPaymentAllocation[]
          ): void => {
            const order = get().ordersById[orderId]
            if (!order) return

            const updatedItems = applyPaymentToItems(order.items, allocations)

            set(state => {
              const o = state.ordersById[orderId]
              if (o) o.items = updatedItems
            })

            // Recalculate after marking paid
            get().recalculateOrder(orderId)
          },

          /**
           * Sync complete order from backend using get_order_details RPC.
           * Fetches ALL order data: items, modifiers, payments, status_history.
           *
           * This function provides complete order state after critical operations like payment.
           * Unlike syncOrderFromBackend(), this fetches full details for accurate UI display.
           *
           * @param orderId - The local order ID to sync
           */
          syncOrderFromBackendComplete: async (
            orderId: string
          ): Promise<void> => {
            // O(1) order resolution via direct key or dbOrderIdIndex
            const storeKey = get().dbOrderIdIndex[orderId] ?? orderId
            let order = get().ordersById[storeKey]

            if (!order?.db_order_id) {
              console.log(
                '[syncOrderFromBackendComplete] Order not found or not synced to DB'
              )
              return
            }

            const supabase = _supabaseClient
            if (!supabase || !getIsOnline()) {
              console.log('[syncOrderFromBackendComplete] Offline or no client')
              return
            }

            const detailSyncKey = order.db_order_id
            const lastSyncedAt = lastOrderDetailSyncAt.get(detailSyncKey)
            if (
              lastSyncedAt &&
              Date.now() - lastSyncedAt < ORDER_DETAIL_SYNC_COOLDOWN_MS
            ) {
              console.log(
                `[syncOrderFromBackendComplete] Skipping recent sync for ${detailSyncKey}`
              )
              return
            }
            const existingDetailSync =
              inFlightOrderDetailSyncs.get(detailSyncKey)
            if (existingDetailSync) {
              console.log(
                `[syncOrderFromBackendComplete] Reusing in-flight sync for ${detailSyncKey}`
              )
              return existingDetailSync
            }

            const detailSyncPromise = (async (): Promise<void> => {
              try {
                console.log('[syncOrderFromBackendComplete] Starting sync:', {
                  localOrderId: storeKey,
                  dbOrderId: order.db_order_id,
                  currentItemsCount: order.items?.length || 0
                })

                // Call get_order_details RPC
                // rpc-discipline-allow: inline-wrapped Category C read — get_order_details deadline-only
                const { data, error } = await runWithDeadline<any>(
                  'get_order_details_inline',
                  DEADLINES.read,
                  async (signal) =>
                    await supabase
                      .rpc('get_order_details', {
                        p_order_id: order.db_order_id
                      })
                      .abortSignal(signal)
                )

                if (error) {
                  console.error(
                    '[syncOrderFromBackendComplete] RPC error:',
                    error
                  )
                  throw error
                }

                if (!data) {
                  console.warn(
                    '[syncOrderFromBackendComplete] No data returned from RPC'
                  )
                  return
                }

                console.log(
                  '[syncOrderFromBackendComplete] RPC response received:',
                  {
                    hasOrder: !!data.order,
                    itemsCount: data.items?.length || 0,
                    paymentsCount: data.payments?.length || 0,
                    reversalsCount: data.reversals?.length || 0,
                    refundItemsCount: data.order_refund_items?.length || 0,
                    discountsCount: data.order_discounts?.length || 0,
                    stationName: data.station_name
                  }
                )

                // Extract response components (including new fields from updated RPC)
                const orderData = data.order
                const itemsData = data.items || []
                const paymentsData = data.payments || []
                const reversalsData = data.reversals || []
                const orderRefundItemsData = data.order_refund_items || []
                const orderDiscountsData = data.order_discounts || []
                const stationName = data.station_name

                // Build per-payment item coverage lookup from order_payment_items junction table
                const paymentItemsData: any[] = data.payment_items || []
                const paymentItemsByPaymentId = new Map<string, any[]>()
                for (const pi of paymentItemsData) {
                  const key = pi.order_payment_id
                  if (!paymentItemsByPaymentId.has(key))
                    paymentItemsByPaymentId.set(key, [])
                  paymentItemsByPaymentId.get(key)!.push(pi)
                }

                if (!orderData) {
                  console.error(
                    '[syncOrderFromBackendComplete] No order data in response'
                  )
                  return
                }

                if (itemsData.length === 0) {
                  console.warn(
                    '[syncOrderFromBackendComplete] ⚠️ No items in response - order may be empty or all items voided'
                  )
                }

                // Sort raw backend items by created_at to ensure stable order (defense-in-depth)
                itemsData.sort((a: any, b: any) => {
                  const aOrder =
                    a.item?.display_order ?? a.display_order ?? null
                  const bOrder =
                    b.item?.display_order ?? b.display_order ?? null
                  if (aOrder !== null && bOrder !== null && aOrder !== bOrder)
                    return aOrder - bOrder
                  if (aOrder !== null && bOrder === null) return -1
                  if (aOrder === null && bOrder !== null) return 1
                  const aTime = a.item?.created_at || a.created_at || ''
                  const bTime = b.item?.created_at || b.created_at || ''
                  return aTime < bTime ? -1 : aTime > bTime ? 1 : 0
                })

                const existingItemsByDbId = new Map(
                  (order.items || [])
                    .filter(item => item.db_order_item_id)
                    .map(item => [item.db_order_item_id!, item] as const)
                )

                // Transform items with nested modifiers to CartItem format
                // Uses the shared mapBackendItemToCartItem for consistency with broadcast transforms
                const transformedItems: CartItem[] = itemsData.map(
                  (itemWrapper: any) => {
                    const item = itemWrapper.item
                    const modifiers = itemWrapper.modifiers || []

                    // Transform modifiers to CartItem format
                    const transformedModifiers =
                      transformBackendModifiers(modifiers)

                    return mapBackendItemToCartItem(
                      item as BackendItemInput,
                      transformedModifiers,
                      existingItemsByDbId.get(item.id)
                    )
                  }
                )

                // Transform payments to OrderProfile format with comprehensive fields
                const transformedPayments: OrderProfilePayment[] =
                  paymentsData.map((payment: any) => {
                    // Extract terminal response data for fallback card details + pre-auth fields
                    const terminalResp = payment.terminal_response as
                      | Record<string, any>
                      | undefined
                    const castlesTxn = terminalResp?.castles_transaction as
                      | Record<string, any>
                      | undefined
                    const dejavooTxn = terminalResp?.dejavoo_transaction as
                      | Record<string, any>
                      | undefined

                    return {
                      // Core identifiers
                      id: payment.id,
                      db_payment_id: payment.id,

                      // Payment basics
                      amount: payment.amount || 0,
                      method: (payment.payment_method === 'cash'
                        ? 'Cash'
                        : 'Card') as PaymentType,
                      tip_amount: payment.tip_amount || 0,
                      total_collected:
                        (payment.amount || 0) + (payment.tip_amount || 0),

                      // Card details (with terminal response fallback)
                      cardBrand:
                        payment.card_type ??
                        castlesTxn?.cardType ??
                        dejavooTxn?.CardType,
                      last4:
                        payment.card_last_four ??
                        castlesTxn?.cardLast4 ??
                        dejavooTxn?.Last4,

                      // Cash details
                      amountTendered: payment.amount_tendered,
                      changeGiven: payment.change_given || 0,
                      isCashPriced: payment.is_cash_priced || false,

                      // Portions
                      subtotal_portion: payment.subtotal_portion,
                      tax_portion: payment.tax_portion,
                      discount_portion: payment.discount_portion,

                      // Split payment info
                      splitInfo:
                        payment.split_count && payment.split_count > 1
                          ? {
                              portionIndex: payment.split_portion_index || 0,
                              totalPortions: payment.split_count,
                              isLastPortion:
                                (payment.split_portion_index || 0) ===
                                payment.split_count - 1
                            }
                          : undefined,

                      // Item coverage — prefer per-payment items from junction table (accurate per-payment quantities)
                      // Fall back to covers_items + paid_quantity for legacy orders without payment_items
                      itemsCovered: (() => {
                        const perPaymentItems = paymentItemsByPaymentId.get(
                          payment.id
                        )
                        if (perPaymentItems && perPaymentItems.length > 0) {
                          return perPaymentItems.map((pi: any) => ({
                            itemId: pi.order_item_id,
                            itemName:
                              transformedItems.find(
                                i =>
                                  i.db_order_item_id === pi.order_item_id ||
                                  i.id === pi.order_item_id
                              )?.name || 'Unknown Item',
                            quantity: pi.quantity_paid,
                            unitPrice: pi.unit_price_paid,
                            subtotal: pi.subtotal_paid
                          }))
                        }
                        // Legacy fallback for orders without payment_items
                        return (payment.covers_items || []).map(
                          (itemId: string) => {
                            const item = transformedItems.find(
                              i =>
                                i.db_order_item_id === itemId || i.id === itemId
                            )
                            const coveredQty =
                              item?.paidQuantity || item?.quantity || 1
                            const unitPrice = payment.is_cash_priced
                              ? (item?.cashPrice ?? item?.price) || 0
                              : item?.price || 0
                            return {
                              itemId,
                              itemName: item?.name || 'Unknown Item',
                              quantity: coveredQty,
                              unitPrice,
                              subtotal: unitPrice * coveredQty
                            }
                          }
                        )
                      })(),

                      // Status and timestamps
                      status: payment.status || 'captured',
                      timestamp: payment.initiated_at || payment.created_at,

                      // Void tracking
                      isVoided: payment.is_voided || false,
                      voidReason: payment.void_reason,
                      voidedAt: payment.voided_at,

                      // Refund tracking
                      refundedAmount: payment.refunded_amount || 0,
                      refundedAt: payment.refunded_at,
                      reference_id: payment.reference_number,

                      // Tip adjustment tracking
                      original_tip_amount:
                        payment.original_tip_amount || undefined,
                      tip_adjusted_at: payment.tip_adjusted_at || undefined,
                      tip_adjusted_by: payment.tip_adjusted_by || undefined,

                      // Return tracking fields
                      isReturned: payment.is_returned || false,
                      returnedAt: payment.returned_at,
                      returnedBy: payment.returned_by,
                      returnAmount: payment.return_amount || 0,
                      returnRrn: payment.return_rrn,
                      returnAuthCode: payment.return_auth_code,
                      returnReferenceId: payment.return_reference_id,
                      returnNumber: payment.return_number,
                      returnReason: payment.return_reason,

                      // Transaction details
                      transactionDetails: {
                        terminalType: payment.terminal_type,
                        authorizationCode:
                          payment.authorization_code || payment.auth_code,
                        cardType:
                          payment.card_type ??
                          castlesTxn?.cardType ??
                          dejavooTxn?.CardType,
                        last4:
                          payment.card_last_four ??
                          castlesTxn?.cardLast4 ??
                          dejavooTxn?.Last4,
                        transactionId: payment.transaction_id,
                        amountTendered: payment.amount_tendered,
                        changeGiven: payment.change_given,
                        isCashPriced: payment.is_cash_priced,
                        isCash: payment.payment_method === 'cash',
                        // Include dejavoo response from processor_response if available
                        dejavooTransaction:
                          payment.processor_response?.dejavoo_transaction,
                        // Additional terminal fields
                        rrn: payment.rrn,
                        batchNumber:
                          payment.batch_number || payment.dejavoo_batch_number,
                        invoiceNumber: payment.dejavoo_invoice_number,
                        entryMode:
                          payment.processor_response?.dejavoo_transaction
                            ?.entryMode ?? castlesTxn?.entryMode,
                        referenceId: payment.reference_number,
                        castlesTransaction: castlesTxn
                      },

                      // Pre-auth fields (hydrate from backend so pre-auth state survives refresh)
                      isPreAuth: payment.status === 'authorized',
                      ...(payment.status === 'authorized'
                        ? {
                            preAuthAmount: payment.amount,
                            preAuthRrn: payment.rrn || castlesTxn?.rrn,
                            preAuthStan: castlesTxn?.stan,
                            preAuthAuthCode:
                              payment.authorization_code ||
                              castlesTxn?.approvalCode,
                            preAuthReferenceId:
                              payment.reference_number ||
                              castlesTxn?.referenceId,
                            preAuthTerminalType: (payment.terminal_type ===
                            'castles'
                              ? 'castles'
                              : 'dejavoo') as 'castles' | 'dejavoo'
                          }
                        : {}),

                      // Sync status
                      sync_status: 'synced' as const
                    }
                  })

                // Calculate paid status from backend payment_status
                const paidStatus =
                  orderData.payment_status === 'paid'
                    ? 'Paid'
                    : orderData.payment_status === 'partial'
                    ? 'Partial'
                    : orderData.payment_status === 'refunded'
                    ? 'Refunded'
                    : 'Pending'

                if (__DEV__) {
                  console.log(
                    '[syncOrderFromBackendComplete] Transformed data:',
                    {
                      transformedItemsCount: transformedItems.length,
                      transformedPaymentsCount: transformedPayments.length,
                      reversalsCount: reversalsData.length,
                      refundItemsCount: orderRefundItemsData.length,
                      stationName
                    }
                  )
                }

                // Update local store with complete order data
                set(state => {
                  if (!state.ordersById[storeKey]) {
                    console.error(
                      '[syncOrderFromBackendComplete] ❌ Order not found in store during update!',
                      { orderId: storeKey }
                    )
                    return
                  }
                  // Snapshot the draft to a plain object so downstream spreads
                  // and freeze() don't hit revoked Immer proxies.
                  const currentOrder = current(state.ordersById[storeKey]!)
                  if (__DEV__) {
                    console.log(
                      '[syncOrderFromBackendComplete] Updating store:',
                      {
                        orderId: storeKey,
                        dbOrderId: currentOrder.db_order_id,
                        isActiveOrder: true, // orderId === state.activeOrderId
                        updatingItems: transformedItems.length,
                        updatingPayments: transformedPayments.length,
                        updatingReversals: reversalsData.length,
                        updatingRefundItems: orderRefundItemsData.length
                      }
                    )
                  }

                  // Preserve local items that haven't synced to backend yet
                  const localPendingItems = currentOrder.items.filter(
                    item => !item.db_order_item_id && !item.isDraft
                  )

                  // Preserve draft items (user is still configuring on ModifierScreen)
                  const localDraftItems = currentOrder.items.filter(
                    item => item.isDraft
                  )
                  // Preserve locally-synced items not yet in the backend fetch.
                  // Mirrors the broadcast merge safeguard at line ~3474.
                  // Race: db_order_item_id was set between the RPC fetch start
                  // and this set(), so the item is absent from transformedItems
                  // but excluded from localPendingItems (it already has db_order_item_id).
                  const backendItemDbIds = new Set(
                    transformedItems
                      .map(i => i.db_order_item_id)
                      .filter(Boolean)
                  )
                  const localSyncedNotInBackend = currentOrder.items.filter(
                    item =>
                      item.db_order_item_id &&
                      !item.isDraft &&
                      !backendItemDbIds.has(item.db_order_item_id)
                  )

                  if (__DEV__) {
                    console.log('[OfflineReconnectDebug][FullSyncMergePlan]', {
                      orderId: storeKey,
                      backendItems: transformedItems.length,
                      localPendingItems: localPendingItems.length,
                      localDraftItems: localDraftItems.length,
                      localSyncedMissingFromBackend:
                        localSyncedNotInBackend.length
                    })
                  }

                  // Preserve locally-advanced kitchen_status and item_status.
                  // Mirrors the broadcast merge logic at line ~3436.
                  // Race: optimistic kitchen send sets local kitchen_status='sent'/'preparing',
                  // but the backend fetch (started before the RPC committed) returns stale 'new'.
                  const localItemsByDbId = new Map<string, CartItem>()
                  for (const item of currentOrder.items) {
                    if (item.db_order_item_id) {
                      localItemsByDbId.set(item.db_order_item_id, item)
                    }
                  }
                  for (let i = 0; i < transformedItems.length; i++) {
                    const backendItem = transformedItems[i]
                    if (!backendItem.db_order_item_id) continue
                    const localItem = localItemsByDbId.get(
                      backendItem.db_order_item_id
                    )
                    if (!localItem) continue

                    // Preserve locally-advanced kitchen_status
                    const localKRank =
                      KITCHEN_STATUS_RANK[localItem.kitchen_status ?? 'new'] ??
                      0
                    const backendKRank =
                      KITCHEN_STATUS_RANK[
                        backendItem.kitchen_status ?? 'new'
                      ] ?? 0
                    if (localKRank > backendKRank) {
                      transformedItems[i] = {
                        ...backendItem,
                        id: localItem.id, // Keep local ID
                        kitchen_status: localItem.kitchen_status,
                        item_status: localItem.item_status
                      }
                    } else if (localItem.id !== backendItem.id) {
                      // Preserve local item ID even when backend is ahead
                      transformedItems[i] = { ...backendItem, id: localItem.id }
                    }

                    // Preserve local quantity if a sync is in-flight
                    const pendingQuantity =
                      useSyncStatusStore
                        .getState()
                        .itemSyncStatus.get(localItem.id) === 'pending' ||
                      useSyncStatusStore
                        .getState()
                        .itemSyncStatus.get(localItem.id) === 'syncing'
                    if (pendingQuantity) {
                      transformedItems[i] = {
                        ...transformedItems[i],
                        quantity: localItem.quantity
                      }
                    }
                  }

                  // Absorb local pending items into unmatched backend items.
                  // Race prevention: addItemToBackend may have committed to the DB
                  // but not yet called useOrderStore.setState() to set db_order_item_id
                  // locally. In that window, the backend item appears in transformedItems
                  // but the local item appears in localPendingItems — creating a duplicate.
                  // Absorbing them here (by unique menuItemId match) prevents the duplicate
                  // from ever being written to state. Fix A in addItemToBackend handles any
                  // remaining cases where this absorption couldn't run in time.
                  const claimedPendingIds = new Set<string>()
                  {
                    // Build menuItemId → pending items map for O(n) lookup
                    const localPendingByKey = new Map<string, CartItem[]>()
                    for (const pendingItem of currentOrder.items) {
                      if (pendingItem.db_order_item_id || pendingItem.isDraft)
                        continue
                      const key = pendingItem.menuItemId || pendingItem.name
                      if (!localPendingByKey.has(key))
                        localPendingByKey.set(key, [])
                      localPendingByKey.get(key)!.push(pendingItem)
                    }

                    for (let i = 0; i < transformedItems.length; i++) {
                      const ti = transformedItems[i]
                      if (!ti.db_order_item_id) continue
                      // Skip items already matched by db_order_item_id (handled above)
                      if (localItemsByDbId.has(ti.db_order_item_id)) continue

                      const key = ti.menuItemId || ti.name
                      const candidates = (
                        localPendingByKey.get(key) ?? []
                      ).filter(c => !claimedPendingIds.has(c.id))
                      // Only absorb when there is exactly one candidate — ambiguous
                      // cases (same item ordered twice while syncing) are left for Fix A.
                      if (candidates.length !== 1) continue

                      const pendingItem = candidates[0]
                      claimedPendingIds.add(pendingItem.id)

                      // Absorb: preserve local ID + locally-advanced kitchen_status
                      const localKRank =
                        KITCHEN_STATUS_RANK[
                          pendingItem.kitchen_status ?? 'new'
                        ] ?? 0
                      const backendKRank =
                        KITCHEN_STATUS_RANK[ti.kitchen_status ?? 'new'] ?? 0
                      transformedItems[i] = {
                        ...ti,
                        id: pendingItem.id,
                        ...(localKRank > backendKRank
                          ? {
                              kitchen_status: pendingItem.kitchen_status,
                              item_status: pendingItem.item_status
                            }
                          : {})
                      }
                    }
                  }

                  // Preserve local payments that haven't synced to backend yet
                  // (e.g. pre-auth payments added optimistically before syncPreAuthToBackend completes)
                  const localPendingPayments =
                    currentOrder.payments?.filter(
                      p => !p.db_payment_id && p.sync_status === 'pending'
                    ) ?? []

                  // Preserve locally-advanced payments (e.g. local="captured" vs server="authorized")
                  // This prevents realtime sync from regressing payment status when capture_preauth_v1
                  // hasn't completed on the server yet but closeCheck already incremented sync_version.
                  const PAYMENT_STATUS_ORDER: Record<string, number> = {
                    authorized: 0,
                    pending: 1,
                    captured: 2,
                    partially_refunded: 3,
                    refunded: 4,
                    voided: 4
                  }
                  const localPaymentsByDbId = new Map<
                    string,
                    OrderProfilePayment
                  >()
                  for (const p of currentOrder.payments ?? []) {
                    if (p.db_payment_id)
                      localPaymentsByDbId.set(p.db_payment_id, p)
                  }

                  let hasLocalAdvancedPayments = false
                  const mergedPayments = transformedPayments.map(serverPmt => {
                    if (!serverPmt.db_payment_id) return serverPmt
                    const localPmt = localPaymentsByDbId.get(
                      serverPmt.db_payment_id
                    )
                    if (
                      localPmt &&
                      (PAYMENT_STATUS_ORDER[localPmt.status ?? ''] ?? -1) >
                        (PAYMENT_STATUS_ORDER[serverPmt.status ?? ''] ?? -1)
                    ) {
                      hasLocalAdvancedPayments = true
                      return localPmt
                    }
                    return serverPmt
                  })

                  // Conflict guard: preserve local status if we have pending changes
                  const hasLocalPending = currentOrder.items.some(
                    item =>
                      item.sync_status === 'pending' ||
                      (!item.db_order_item_id && !item.isDraft)
                  )
                  const hasLocalPendingPayments = (
                    currentOrder.payments ?? []
                  ).some(p => !p.db_payment_id && p.sync_status === 'pending')

                  // Rank-based upgrade: always accept server's paid_status if it's higher
                  // Refund transitions bypass rank check — both Paid→Refunded and
                  // Refunded→Paid must be accepted to reflect the full lifecycle.
                  const PAID_STATUS_RANK: Record<string, number> = {
                    Unpaid: 0,
                    Pending: 0,
                    Partial: 1,
                    Paid: 2
                  }
                  const localPaidRank =
                    PAID_STATUS_RANK[currentOrder.paid_status ?? ''] ?? -1
                  const serverPaidRank = PAID_STATUS_RANK[paidStatus] ?? -1
                  const isRefundTransition =
                    paidStatus === 'Refunded' ||
                    currentOrder.paid_status === 'Refunded'
                  const isServerPaidUpgrade =
                    isRefundTransition || serverPaidRank > localPaidRank

                  // Build the updated order once to avoid duplication
                  const updatedOrder: OrderProfile = {
                    ...currentOrder,
                    items: (() => {
                      const merged = [
                        // Drop items mid-removal so a backend fetch that still shows
                        // them can't re-introduce them into the cart.
                        ...transformedItems.filter(
                          item =>
                            !item.db_order_item_id ||
                            !isItemPendingRemoval(item.db_order_item_id)
                        ),
                        // Exclude pending items that were absorbed into transformedItems above
                        ...localPendingItems.filter(
                          item => !claimedPendingIds.has(item.id)
                        ),
                        ...localSyncedNotInBackend,
                        // Preserve draft items (user still configuring on ModifierScreen)
                        ...localDraftItems
                      ]
                      // Preserve local item ordering — backend may return items
                      // in a different order than the user added them.
                      // Items not in local state (new from backend) sort to end.
                      const localIdOrder = new Map(
                        currentOrder.items.map((item, idx) => [item.id, idx])
                      )
                      merged.sort((a, b) => {
                        const aIdx =
                          localIdOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER
                        const bIdx =
                          localIdOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER
                        return aIdx - bIdx
                      })
                      return merged
                    })(),
                    payments: [...mergedPayments, ...localPendingPayments],
                    // Reversals and refund items from backend
                    reversals: reversalsData,
                    order_refund_items: orderRefundItemsData,
                    // Restore discount metadata from backend order_discounts
                    ...restoreDiscountsFromBackend(orderDiscountsData),
                    // Station name from backend
                    _sourceStationName:
                      stationName || currentOrder._sourceStationName,
                    // Financial totals
                    total_amount:
                      orderData.card_total ?? orderData.total_amount,
                    total_tax: orderData.tax_amount,
                    total_discount: orderData.discount_amount,
                    amount_paid: isServerPaidUpgrade
                      ? orderData.amount_paid
                      : hasLocalAdvancedPayments || hasLocalPendingPayments
                      ? currentOrder.amount_paid
                      : orderData.amount_paid,
                    amount_due: isServerPaidUpgrade
                      ? orderData.amount_due
                      : hasLocalAdvancedPayments || hasLocalPendingPayments
                      ? currentOrder.amount_due
                      : orderData.amount_due,
                    cash_amount_due: orderData.cash_amount_due,
                    // Status fields — preserve local status when items are pending sync or payments are ahead
                    // BUT always accept server upgrade (e.g. Partial → Paid)
                    paid_status: isServerPaidUpgrade
                      ? paidStatus
                      : hasLocalAdvancedPayments || hasLocalPendingPayments
                      ? currentOrder.paid_status
                      : hasLocalPending
                      ? currentOrder.paid_status
                      : paidStatus,
                    order_status: hasLocalPending
                      ? currentOrder.order_status
                      : orderData.status,
                    sync_version: orderData.sync_version,
                    check_status:
                      orderData.check_status || currentOrder.check_status,
                    // Customer data from backend
                    customer_name:
                      orderData.customer_name ?? currentOrder.customer_name,
                    customer_phone:
                      orderData.customer_phone ?? currentOrder.customer_phone,
                    customer_email:
                      orderData.customer_email ?? currentOrder.customer_email,
                    customer_id:
                      orderData.customer_id ?? currentOrder.customer_id,
                    delivery_address:
                      orderData.delivery_address ??
                      currentOrder.delivery_address,
                    // Split payment path (multi-station sync)
                    split_payment_path:
                      (orderData as any).split_payment_path ??
                      currentOrder.split_payment_path ??
                      null
                  }

                  // Self-healing: if amount_due ≈ 0 and all payments synced, ensure paid_status = "Paid"
                  if (
                    updatedOrder.paid_status !== 'Paid' &&
                    (updatedOrder.amount_due ?? 0) <= 0.01 &&
                    (updatedOrder.payments ?? []).length > 0 &&
                    (updatedOrder.payments ?? []).every(p => !!p.db_payment_id)
                  ) {
                    if (__DEV__)
                      console.warn(
                        '[syncOrderFromBackendComplete] Self-healing: paid_status was',
                        updatedOrder.paid_status,
                        'but amount_due is',
                        updatedOrder.amount_due,
                        '— correcting to Paid'
                      )
                    updatedOrder.paid_status = 'Paid'
                    updatedOrder.amount_due = 0
                  }

                  state.ordersById[storeKey] = freeze(updatedOrder)
                  syncTableOrderIdIndexForOrder(state, storeKey, currentOrder)
                  // Update active order derived state if this is the active order
                  if (storeKey === state.activeOrderId) {
                    state.activeOrderTotal =
                      orderData.card_total ?? orderData.total_amount
                    state.activeOrderTax = orderData.tax_amount
                    state.activeOrderDiscount = orderData.discount_amount
                    state.activeOrderOutstandingTotal =
                      hasLocalAdvancedPayments && !isServerPaidUpgrade
                        ? currentOrder.amount_due ?? orderData.amount_due
                        : orderData.amount_due
                    state.activeOrderOutstandingCash = orderData.cash_amount_due
                  }
                })

                // Invalidate cache
                paymentPreviewService.invalidateCache(storeKey)

                // Verify the update
                const updatedOrder = get().ordersById[storeKey]
                console.log(
                  '[syncOrderFromBackendComplete] ✅ Order synced successfully:',
                  {
                    orderId: storeKey,
                    itemsInStore: updatedOrder?.items?.length || 0,
                    paymentsInStore: updatedOrder?.payments?.length || 0,
                    checkStatus: updatedOrder?.check_status,
                    paidStatus: updatedOrder?.paid_status
                  }
                )
              } catch (error: any) {
                console.error('[syncOrderFromBackendComplete] Failed:', error)
                throw error
              }
            })()

            inFlightOrderDetailSyncs.set(detailSyncKey, detailSyncPromise)
            try {
              await detailSyncPromise
              lastOrderDetailSyncAt.set(detailSyncKey, Date.now())
            } finally {
              if (
                inFlightOrderDetailSyncs.get(detailSyncKey) ===
                detailSyncPromise
              ) {
                inFlightOrderDetailSyncs.delete(detailSyncKey)
              }
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
            const { pendingBackendUpdates, ordersById } = get()
            const queuedUpdate = pendingBackendUpdates[orderId]

            if (!queuedUpdate) {
              // No queued updates for this order
              return
            }

            const order = ordersById[orderId]
            if (!order) {
              console.warn('[applyQueuedUpdates] Order not found:', orderId)
              // Clean up orphaned queue entry
              set(state => {
                delete state.pendingBackendUpdates[orderId]
              })
              return
            }

            console.log(
              '[applyQueuedUpdates] Applying queued update for order:',
              orderId,
              {
                source: queuedUpdate.source,
                queuedAt: new Date(queuedUpdate.timestamp).toISOString(),
                fields: Object.keys(queuedUpdate.updates)
              }
            )

            // Apply the queued updates
            set(state => {
              const o = state.ordersById[orderId]
              if (o) Object.assign(o, queuedUpdate.updates)

              // Remove from queue
              delete state.pendingBackendUpdates[orderId]
            })

            console.log(
              '[applyQueuedUpdates] Successfully applied queued updates for order:',
              orderId
            )
          },

          /**
           * Clean up stale queued updates (older than 5 minutes).
           * Called periodically to prevent memory leaks from abandoned updates.
           */
          cleanupStaleQueuedUpdates: () => {
            const TTL_MS = 5 * 60 * 1000 // 5 minutes
            const now = Date.now()

            set(state => {
              let cleanedCount = 0

              for (const [orderId, update] of Object.entries(
                state.pendingBackendUpdates
              )) {
                if (now - update.timestamp > TTL_MS) {
                  console.log(
                    '[cleanupStaleQueuedUpdates] Removing stale update:',
                    {
                      orderId,
                      age: Math.round((now - update.timestamp) / 1000),
                      source: update.source
                    }
                  )
                  delete state.pendingBackendUpdates[orderId]
                  cleanedCount++
                }
              }

              if (cleanedCount > 0) {
                console.log(
                  '[cleanupStaleQueuedUpdates] Cleaned up',
                  cleanedCount,
                  'stale updates'
                )
              }
            })
          }
        }
      }),
      {
        name: 'order-store-storage',
        storage: createLazyPersistStorage(),
        partialize: (state: OrderState) => {
          // Fast path: combine persistableOrderIds + always-persist sets (all O(1) per entry)
          const filteredOrdersById: Record<string, OrderProfile> = {}
          const filteredOrderIds: string[] = []

          // persistableOrderIds is maintained surgically (unsynced items, new orders)
          for (const id of Object.keys(state.persistableOrderIds)) {
            if (state.ordersById[id]) {
              filteredOrdersById[id] = state.ordersById[id]
              filteredOrderIds.push(id)
            }
          }

          // Also persist active order, working set, and unsynced orders
          const extras = [
            ...(state.activeOrderId ? [state.activeOrderId] : []),
            ...state.workingSetOrderIds,
            ...state.unsyncedOrderIds
          ]
          for (const id of extras) {
            if (state.ordersById[id] && !filteredOrdersById[id]) {
              filteredOrdersById[id] = state.ordersById[id]
              filteredOrderIds.push(id)
            }
          }

          return {
            ordersById: filteredOrdersById,
            orderIds: filteredOrderIds,
            activeOrderId: state.activeOrderId,
            workingSetOrderIds: state.workingSetOrderIds,
            unsyncedOrderIds: state.unsyncedOrderIds,
            currentLocationId: state.currentLocationId
          }
        },
        merge: (persistedState: any, currentState: OrderState): OrderState => {
          const merged = {
            ...currentState,
            ...(persistedState as Partial<OrderState>)
          }

          // Migration: infer unsyncedOrderIds from orders missing db_order_id
          if (!merged.unsyncedOrderIds) {
            merged.unsyncedOrderIds = []
            for (const id of merged.orderIds || []) {
              if (
                merged.ordersById?.[id] &&
                !merged.ordersById[id].db_order_id
              ) {
                merged.unsyncedOrderIds.push(id)
              }
            }
          }

          // Migration: infer currentLocationId
          if (merged.currentLocationId === undefined) {
            merged.currentLocationId =
              useStoreSettingsStore.getState().selectedStore?.id ?? null
          }

          // Reconstruct dbOrderIdIndex on rehydration
          const rebuiltIndex: Record<string, string> = {}
          for (const [localId, order] of Object.entries(
            merged.ordersById ?? {}
          )) {
            if (order.db_order_id) {
              rebuiltIndex[order.db_order_id] = localId
            }
          }
          merged.dbOrderIdIndex = rebuiltIndex

          // Reconstruct persistableOrderIds on rehydration
          const rebuiltPersistable: Record<string, true> = {}
          for (const [id, order] of Object.entries(merged.ordersById ?? {})) {
            if (
              order.items?.some(
                (item: any) => !item.db_order_item_id && !item.isDraft
              )
            ) {
              rebuiltPersistable[id] = true
            }
            // Also persist orders with unsynced payments (pending offline payments)
            if (
              order.payments?.some(
                (p: any) =>
                  p.sync_status === 'pending' ||
                  (!p.db_payment_id && p.status !== 'voided')
              )
            ) {
              rebuiltPersistable[id] = true
            }
          }
          for (const id of merged.unsyncedOrderIds ?? []) {
            rebuiltPersistable[id] = true
          }
          merged.persistableOrderIds = rebuiltPersistable

          // Reconstruct _workingSetLookup from persisted array
          const rebuiltWsLookup: Record<string, true> = {}
          for (const id of merged.workingSetOrderIds ?? []) {
            rebuiltWsLookup[id] = true
          }
          merged._workingSetLookup = rebuiltWsLookup

          return merged
        },
        onRehydrateStorage: () => {
          return (state, error) => {
            if (error) {
              console.error('Error rehydrating order store:', error)
              return
            }

            // After hydration, recalculate totals for the active order
            if (state?.activeOrderId) {
              // Small delay to ensure orders array is synced by subscription
              setTimeout(() => {
                const store = useOrderStore.getState()
                store.setActiveOrder(state.activeOrderId)
                // Force-sync active order from backend to get fresh item_status and payments
                const activeOrder = store.ordersById[state.activeOrderId!]
                if (activeOrder?.db_order_id) {
                  store
                    .syncOrderFromBackendComplete(state.activeOrderId!)
                    .catch((err: any) => {
                      console.warn('[Rehydrate] Active order sync failed:', err)
                    })
                }
              }, 100)
            }
          }
        }
      }
    )
  )
)

// ============================================================================
// PHASE 1 FOUNDATION: Auto-sync station context from useStoreSettingsStore
// ============================================================================
// This ensures order store has station context when selectedStation changes
// Station context includes view_scope and capabilities for station-based order management

// Track previous station to detect changes
let _previousSelectedStationId: string | null = null

// Initial sync on module load
const initialStation = useStoreSettingsStore.getState().selectedStation
if (initialStation) {
  const station: Station = {
    id: initialStation.id,
    station_name: initialStation.station_name,
    station_type: initialStation.station_type as Station['station_type'],
    station_number: initialStation.station_number,
    is_active: true,
    is_available: true,
    current_session: null,
    view_scope: initialStation.view_scope,
    can_create_orders: initialStation.can_create_orders,
    can_process_payments: initialStation.can_process_payments,
    can_void_orders: initialStation.can_void_orders,
    can_apply_discounts: initialStation.can_apply_discounts,
    can_update_kitchen_status: initialStation.can_update_kitchen_status
  }
  // Defer to avoid circular dependency during initialization
  setTimeout(() => {
    useOrderStore.getState().setCurrentStation(station)
  }, 0)
  _previousSelectedStationId = initialStation.id
}

// Subscribe to changes
useStoreSettingsStore.subscribe(state => {
  const selectedStation = state.selectedStation
  const currentStationId = selectedStation?.id || null

  // Only update if station changed
  if (currentStationId !== _previousSelectedStationId) {
    _previousSelectedStationId = currentStationId

    if (selectedStation) {
      // Convert SelectedStation to Station format with capability fields
      const station: Station = {
        id: selectedStation.id,
        station_name: selectedStation.station_name,
        station_type: selectedStation.station_type as Station['station_type'],
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
        can_update_kitchen_status: selectedStation.can_update_kitchen_status
      }
      useOrderStore.getState().setCurrentStation(station)

      // Phase 3: Trigger initial order fetch after station is set
      // Small delay to ensure station context is fully applied
      setTimeout(async () => {
        const orderStore = useOrderStore.getState()

        // Fetch orphaned orders from our station (handles app reinstall scenario)
        await orderStore.fetchOwnStationOrders()

        // Fetch remote orders based on view_scope
        await orderStore.fetchVisibleOrders()

        // Set initial reconciliation timestamp
        useOrderStore.setState({
          lastReconciliationAt: new Date().toISOString()
        })

        console.log(
          '[OrderStore] Initial order fetch completed for station:',
          station.station_name
        )
      }, 100)
    } else {
      // Clear station context when station is deselected
      useOrderStore.setState({
        currentStationId: null,
        currentStation: null,
        remoteOrdersEnabled: false
      })
      console.log('[OrderStore] Station context cleared')
    }
  }
})

// ============================================================================
// LOCATION CONTEXT: Auto-sync currentLocationId from useStoreSettingsStore
// ============================================================================

// Initial sync — deferred to avoid crash if circular imports leave useOrderStore undefined during module init
const initialStore = useStoreSettingsStore.getState().selectedStore
if (initialStore) {
  setTimeout(() => {
    useOrderStore.setState({ currentLocationId: initialStore.id })
  }, 0)
}

// Subscribe to changes
useStoreSettingsStore.subscribe((state, prev) => {
  const newLocId = state.selectedStore?.id ?? null
  const oldLocId = prev.selectedStore?.id ?? null
  if (newLocId !== oldLocId) {
    useOrderStore.setState({ currentLocationId: newLocId })
  }
})

// ============================================================================
// HELPER FUNCTIONS (add outside store)
// ============================================================================

function mapBackendOrderStatus (status: string): OrderProfile['order_status'] {
  const map: Record<string, OrderProfile['order_status']> = {
    draft: 'draft',
    pending: 'pending',
    preparing: 'preparing',
    ready: 'ready',
    completed: 'completed',
    cancelled: 'cancelled',
    refunded: 'refunded',
    void: 'void'
  }
  return map[status] || 'pending'
}

// mapPaymentStatus is now imported from @/utils/orderTransformers
