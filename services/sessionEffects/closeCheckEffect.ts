/**
 * Side effect: CLOSE_CHECK
 *
 * Calls the backend RPC to close/finalize a check.
 * CLOSE_CHECK has no state machine event — it only fires this RPC.
 * Falls back to queueFailedOperation on failure or when offline.
 */

import type { SideEffectContext } from "@/lib/sessionSideEffects";
import { queueFailedOperation } from "@/services/offlineSyncInit";
import { OrderService } from "@/services/orderService";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { getOrderStoreSupabaseClient } from "@/stores/useOrderStore";

export async function closeCheckEffect(ctx: SideEffectContext): Promise<void> {
  if (ctx.action.type !== "CLOSE_CHECK") return;

  const { dbOrderId, orderId } = ctx.action;
  const supabase = getOrderStoreSupabaseClient();
  const { activeEmployeeId } = useEmployeeStore.getState();

  if (!supabase || !dbOrderId) {
    // Offline or no backend order — queue for retry
    await queueFailedOperation(
      "close_check",
      { p_order_id: dbOrderId, p_staff_id: activeEmployeeId },
      orderId || dbOrderId || "",
    );
    return;
  }

  try {
    const result = await OrderService.closeCheck(
      supabase,
      dbOrderId,
      activeEmployeeId,
    );

    if (!result.success) {
      await queueFailedOperation(
        "close_check",
        { p_order_id: dbOrderId, p_staff_id: activeEmployeeId },
        orderId || dbOrderId,
      );
    }
  } catch {
    await queueFailedOperation(
      "close_check",
      { p_order_id: dbOrderId, p_staff_id: activeEmployeeId },
      orderId || dbOrderId || "",
    );
  }
}
