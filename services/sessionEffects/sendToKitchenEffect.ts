/**
 * Side effect: SEND_TO_KITCHEN
 *
 * After the store optimistically transitions the session to "ordered",
 * this effect syncs item statuses to the backend via bulk update.
 * Falls back to queueFailedOperation on failure.
 */

import type { SideEffectContext } from "@/lib/sessionSideEffects";
import { getKitchenSentStatus, getOrderSentStatus } from "@/lib/kitchenStatusUtils";
import { queueFailedOperation } from "@/services/offlineSyncInit";
import { OrderService } from "@/services/orderService";
import { getOrderStoreSupabaseClient } from "@/stores/useOrderStore";
import { useOrderStore } from "@/stores/useOrderStore";

export async function sendToKitchenEffect(ctx: SideEffectContext): Promise<void> {
  if (ctx.action.type !== "SEND_TO_KITCHEN") return;

  const { itemIds, orderId } = ctx.action;
  let { dbItemIds, dbOrderId } = ctx.action;
  const supabase = getOrderStoreSupabaseClient();

  if (!supabase) {
    // No supabase — queue for retry with offline_batch flag
    if (itemIds.length > 0) {
      await queueFailedOperation(
        "send_to_kitchen",
        { localOrderId: orderId, localItemIds: itemIds, offline_batch: true },
        orderId,
      );
    }
    return;
  }

  // Wait for any in-flight item syncs so all items have db_order_item_ids
  // before broadcasting to the kitchen (same logic as sendNewItemsToKitchen).
  await useOrderStore.getState().waitForPendingSyncs(orderId);

  // Re-read fresh state — syncs may have assigned db_order_item_ids and db_order_id
  const freshOrder = useOrderStore.getState().ordersById[orderId];
  if (freshOrder) {
    dbOrderId = freshOrder.db_order_id ?? dbOrderId;
    // Rebuild dbItemIds from items that were in this send (matched by local ID)
    const sentLocalIds = new Set(itemIds);
    dbItemIds = freshOrder.items
      .filter(i => sentLocalIds.has(i.id) && !!i.db_order_item_id)
      .map(i => i.db_order_item_id!);
  }

  if (!dbOrderId) {
    // Still no backend order after waiting — queue for retry
    if (itemIds.length > 0) {
      await queueFailedOperation(
        "send_to_kitchen",
        { localOrderId: orderId, localItemIds: itemIds, offline_batch: true },
        orderId,
      );
    }
    return;
  }

  if (dbItemIds.length === 0 && itemIds.length > 0) {
    // Items still have no db IDs after waiting — queue for retry
    await queueFailedOperation(
      "send_to_kitchen",
      { localOrderId: orderId, localItemIds: itemIds, offline_batch: true },
      orderId,
    );
    return;
  }

  if (dbItemIds.length > 0) {
    try {
      // Check if order is still draft — must transition to sent_to_kitchen first
      // (bulk_update_order_item_status sets sent_to_kitchen_at on the order,
      // which violates valid_status_transitions constraint on draft orders)
      const order = useOrderStore.getState().getOrder(orderId);
      const isDraft = order?.order_status === "draft";

      if (isDraft) {
        const { error: statusError } = await OrderService.updateOrderStatus(
          supabase,
          dbOrderId,
          getOrderSentStatus(),
        );
        if (
          statusError &&
          statusError.code !== "P0001" &&
          !statusError.message?.includes("already in")
        ) {
          console.error(
            "[sendToKitchenEffect] Failed to update order status:",
            statusError,
          );
          await queueFailedOperation(
            "send_to_kitchen",
            { localOrderId: orderId, localItemIds: itemIds },
            orderId,
          );
          return;
        }
      }

      const targetStatus = getKitchenSentStatus();
      const result = await OrderService.bulkUpdateOrderItemStatus(
        supabase,
        dbItemIds,
        targetStatus,
      );
      if (result?.error) {
        await queueFailedOperation(
          "send_to_kitchen",
          { localOrderId: orderId, localItemIds: itemIds },
          orderId,
        );
      }
    } catch {
      await queueFailedOperation(
        "send_to_kitchen",
        { localOrderId: orderId, localItemIds: itemIds },
        orderId,
      );
    }
  }
}
