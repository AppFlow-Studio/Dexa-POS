/**
 * Side effect: SEND_TO_KITCHEN
 *
 * After the store optimistically transitions the session to "ordered",
 * this effect syncs item statuses to the backend via bulk update.
 * Falls back to queueFailedOperation on failure.
 */

import type { SideEffectContext } from "@/lib/sessionSideEffects";
import { queueFailedOperation } from "@/services/offlineSyncInit";
import { OrderService } from "@/services/orderService";
import { getOrderStoreSupabaseClient } from "@/stores/useOrderStore";

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
      const result = await OrderService.bulkUpdateOrderItemStatus(
        supabase,
        dbItemIds,
        "sent",
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
