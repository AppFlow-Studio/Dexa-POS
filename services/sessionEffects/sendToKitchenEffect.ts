/**
 * Side effect: SEND_TO_KITCHEN
 *
 * After the store optimistically transitions the session to "ordered",
 * this effect syncs item statuses to the backend via bulk update.
 * Falls back to queueFailedOperation on failure.
 */

import type { SideEffectContext } from "@/lib/sessionSideEffects";
import { getKitchenSentStatus } from "@/lib/kitchenStatusUtils";
import { queueFailedOperation } from "@/services/offlineSyncInit";
import { OrderService } from "@/services/orderService";
import { getOrderStoreSupabaseClient } from "@/stores/useOrderStore";
import { useOrderStore } from "@/stores/useOrderStore";

export async function sendToKitchenEffect(ctx: SideEffectContext): Promise<void> {
  if (ctx.action.type !== "SEND_TO_KITCHEN") return;

  const { dbItemIds, itemIds, orderId, dbOrderId } = ctx.action;
  const supabase = getOrderStoreSupabaseClient();

  if (!supabase || !dbOrderId) {
    // No supabase or no backend order — queue for retry
    if (itemIds.length > 0) {
      await queueFailedOperation(
        "send_to_kitchen",
        { localOrderId: orderId, localItemIds: itemIds },
        orderId,
      );
    }
    return;
  }

  if (dbItemIds.length === 0 && itemIds.length > 0) {
    // Items exist locally but have no db IDs yet — queue for retry
    await queueFailedOperation(
      "send_to_kitchen",
      { localOrderId: orderId, localItemIds: itemIds },
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
          "sent_to_kitchen",
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
