/**
 * Side effect: CLOSE_CHECK
 *
 * Calls the backend RPC to close/finalize a check.
 * CLOSE_CHECK has no state machine event — it only fires this RPC.
 */

import type { SideEffectContext } from "@/lib/sessionSideEffects";
import { OrderService } from "@/services/orderService";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { getOrderStoreSupabaseClient } from "@/stores/useOrderStore";

export async function closeCheckEffect(ctx: SideEffectContext): Promise<void> {
  if (ctx.action.type !== "CLOSE_CHECK") return;

  const { dbOrderId } = ctx.action;
  const supabase = getOrderStoreSupabaseClient();
  const { activeEmployeeId } = useEmployeeStore.getState();

  if (!supabase) throw new Error("Database connection unavailable");

  const result = await OrderService.closeCheck(
    supabase,
    dbOrderId,
    activeEmployeeId,
  );

  if (!result.success) {
    throw new Error(result.error || "Failed to close check");
  }
}
