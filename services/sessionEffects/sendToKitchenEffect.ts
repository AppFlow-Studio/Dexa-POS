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
import { toBulkUpdateStatusKey } from '@/lib/network/idempotencyKey'
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

  // Wait for any in-flight item syncs AND quantity updates to complete
  // before broadcasting to the kitchen (same logic as sendNewItemsToKitchen).
  // This covers Scenarios B, C, D — all pending promises resolve here.
  //
  // Wave 2.2: capped at 800ms (was 2000ms). Items already added > ~500ms ago
  // are normally synced by now; anything still pending after 800ms is handled
  // by `addItemToBackend`'s retroactive path (Scenario E) — it will send the
  // straggler to the kitchen as soon as its db_order_item_id lands. Tightening
  // the cap shortens the perceived kitchen-broadcast latency without risking
  // dropped items.
  await useOrderStore.getState().waitForPendingSyncs(orderId, { maxMs: 800 })

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

  // Rebuild dbItemIds from the FRESH order: send every item in this batch that
  // has resolved a db_order_item_id by now — regardless of whether it had one at
  // press time. The previous logic excluded items that only got their db id during
  // the wait, trusting addItemToBackend's retroactive path (Scenario E) to send
  // them. But on slow WiFi the retroactive path's "last sibling" gate can race
  // with the marking step and silently skip such items, which is exactly the
  // "sent 4, only 2 reached the kitchen" symptom. We now send them here too.
  //
  // Items still missing a db_order_item_id after the wait are the only ones left
  // to the retroactive path. A possible double-send (effect + retroactive) is
  // harmless: setting an item to the same kitchen status twice is idempotent.
  const sentLocalIds = new Set(itemIds)
  const freshSentItems = (freshOrder?.items ?? []).filter(
    i => sentLocalIds.has(i.id) && !!i.db_order_item_id
  )
  dbItemIds = freshSentItems.map(i => i.db_order_item_id!).filter(Boolean)

  // Straggler safety net: any batch item that STILL has no db_order_item_id after
  // the wait is left to addItemToBackend's retroactive path. That path can race
  // and miss, so we also queue these locally — the offline queue replays the send
  // once the id lands, guaranteeing delivery. (Idempotent if retroactive also fires.)
  const stragglerIds = (freshOrder?.items ?? [])
    .filter(i => sentLocalIds.has(i.id) && !i.db_order_item_id)
    .map(i => i.id)
  if (stragglerIds.length > 0) {
    await queueFailedOperation(
      'send_to_kitchen',
      { localOrderId: orderId, localItemIds: stragglerIds, offline_batch: true },
      orderId
    )
  }

  if (dbItemIds.length === 0) {
    // No items have a backend id yet — the queued stragglers (above) and the
    // retroactive path will send them once their db_order_item_id lands.
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
      targetStatus,
      { keyOverride: toBulkUpdateStatusKey(dbItemIds, targetStatus) }
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
