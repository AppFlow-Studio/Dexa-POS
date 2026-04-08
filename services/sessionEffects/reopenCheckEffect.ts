/**
 * Side effect: REOPEN_CHECK
 *
 * Calls the backend RPC to reopen a closed check.
 * Falls back to queueFailedOperation on failure or when offline.
 */

import type { SideEffectContext } from "@/lib/sessionSideEffects";
import { queueFailedOperation } from "@/services/offlineSyncInit";
import { OrderService } from "@/services/orderService";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { getOrderStoreSupabaseClient } from "@/stores/useOrderStore";

export async function reopenCheckEffect(ctx: SideEffectContext): Promise<void> {
  if (ctx.action.type !== "REOPEN_CHECK") return;

  const { dbOrderId, reason, orderId } = ctx.action;
  const supabase = getOrderStoreSupabaseClient();
  const { loggedInEmployee } = useEmployeeStore.getState();
  const staffId = loggedInEmployee?.profileId;

  if (!supabase || !dbOrderId) {
    // Offline or no backend order — queue for retry
    await queueFailedOperation(
      "reopen_check",
      { p_order_id: dbOrderId, p_staff_id: staffId, p_reason: reason || "Adding more items" },
      orderId || dbOrderId || "",
    );
    return;
  }

  if (!staffId) {
    console.warn("[reopenCheckEffect] No active employee found, queuing for retry");
    await queueFailedOperation(
      "reopen_check",
      { p_order_id: dbOrderId, p_reason: reason || "Adding more items" },
      orderId || dbOrderId || "",
    );
    return;
  }

  try {
    const result = await OrderService.reopenCheck(
      supabase,
      dbOrderId,
      staffId,
      reason || "Adding more items",
    );

    if (!result.success) {
      await queueFailedOperation(
        "reopen_check",
        { p_order_id: dbOrderId, p_staff_id: staffId, p_reason: reason || "Adding more items" },
        orderId || dbOrderId,
      );
    }
  } catch {
    await queueFailedOperation(
      "reopen_check",
      { p_order_id: dbOrderId, p_staff_id: staffId, p_reason: reason || "Adding more items" },
      orderId || dbOrderId || "",
    );
  }
}
