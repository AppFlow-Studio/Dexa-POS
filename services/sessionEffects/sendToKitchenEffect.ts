/**
 * Side effect: SEND_TO_KITCHEN
 *
 * After the store optimistically transitions the session to "ordered",
 * this effect syncs item statuses to the backend via bulk update.
 * Falls back to queueFailedOperation on failure.
 */

import {
  getKitchenSentStatus,
  getOrderSentStatus
} from '@/lib/kitchenStatusUtils'
import type { SideEffectContext } from '@/lib/sessionSideEffects'
import { queueFailedOperation } from '@/services/offlineSyncInit'
import { OrderService } from '@/services/orderService'
import {
  getOrderStoreSupabaseClient,
  useOrderStore
} from '@/stores/useOrderStore'

export async function sendToKitchenEffect (
  ctx: SideEffectContext
): Promise<void> {
  if (ctx.action.type !== 'SEND_TO_KITCHEN') return

  const { itemIds, orderId } = ctx.action
  let { dbItemIds, dbOrderId } = ctx.action
  const supabase = getOrderStoreSupabaseClient()

  if (!supabase) {
    // No supabase — queue for retry with offline_batch flag
    if (itemIds.length > 0) {
      await queueFailedOperation(
        'send_to_kitchen',
        { localOrderId: orderId, localItemIds: itemIds, offline_batch: true },
        orderId
      )
    }
    return
  }

  // Track which items had db_order_item_id at press time.
  // Items without it at press time rely on addItemToBackend's retroactive path (Scenario E).
  const hadDbIdAtPressTime = new Set(dbItemIds)

  // Wait for any in-flight item syncs AND quantity updates to complete
  // before broadcasting to the kitchen (same logic as sendNewItemsToKitchen).
  // This covers Scenarios B, C, D — all pending promises resolve here.
  await useOrderStore.getState().waitForPendingSyncs(orderId)

  // Re-read fresh state after the wait
  const freshOrder = useOrderStore.getState().ordersById[orderId]
  if (freshOrder) {
    dbOrderId = freshOrder.db_order_id ?? dbOrderId
  }

  if (!dbOrderId) {
    // Still no backend order after waiting — queue for retry
    if (itemIds.length > 0) {
      await queueFailedOperation(
        'send_to_kitchen',
        { localOrderId: orderId, localItemIds: itemIds, offline_batch: true },
        orderId
      )
    }
    return
  }

  // Rebuild dbItemIds excluding items handled by the retroactive path:
  // items that had no db_order_item_id at press time were already sent to kitchen
  // by addItemToBackend when they finished syncing (Scenario E).
  const sentLocalIds = new Set(itemIds)
  const freshSentItems = (freshOrder?.items ?? []).filter(
    i =>
      sentLocalIds.has(i.id) && hadDbIdAtPressTime.has(i.db_order_item_id ?? '')
  )
  dbItemIds = freshSentItems.map(i => i.db_order_item_id!).filter(Boolean)

  if (dbItemIds.length === 0) {
    // All items were handled by the retroactive path — nothing left to do
    return
  }

  try {
    // Always transition backend order status first.
    // Local order state can already be optimistic/non-draft while backend is still draft.
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
      console.error(
        '[sendToKitchenEffect] Failed to update order status:',
        statusError
      )
      await queueFailedOperation(
        'send_to_kitchen',
        { localOrderId: orderId, localItemIds: itemIds },
        orderId
      )
      return
    }

    const { data: backendOrder, error: verifyError } = await supabase
      .from('orders')
      .select('status')
      .eq('id', dbOrderId)
      .single()

    if (verifyError || backendOrder?.status === 'draft') {
      console.warn(
        '[sendToKitchenEffect] Order still draft after status update, deferring item sync',
        {
          dbOrderId,
          verifyError,
          backendStatus: backendOrder?.status
        }
      )
      await queueFailedOperation(
        'send_to_kitchen',
        { localOrderId: orderId, localItemIds: itemIds },
        orderId
      )
      return
    }

    const targetStatus = getKitchenSentStatus()
    const result = await OrderService.bulkUpdateOrderItemStatus(
      supabase,
      dbItemIds,
      targetStatus
    )
    if (result?.error) {
      await queueFailedOperation(
        'send_to_kitchen',
        { localOrderId: orderId, localItemIds: itemIds },
        orderId
      )
    }
  } catch {
    await queueFailedOperation(
      'send_to_kitchen',
      { localOrderId: orderId, localItemIds: itemIds },
      orderId
    )
  }
}
