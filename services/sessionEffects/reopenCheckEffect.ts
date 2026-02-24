/**
 * Side effect: REOPEN_CHECK
 *
 * Calls the backend RPC to reopen a closed check.
 */

import type { SideEffectContext } from "@/lib/sessionSideEffects";
import { OrderService } from "@/services/orderService";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { getOrderStoreSupabaseClient } from "@/stores/useOrderStore";

export async function reopenCheckEffect(ctx: SideEffectContext): Promise<void> {
  if (ctx.action.type !== "REOPEN_CHECK") return;

  const { dbOrderId, reason } = ctx.action;
  const supabase = getOrderStoreSupabaseClient();
  const { loggedInEmployee } = useEmployeeStore.getState();
  const staffId = loggedInEmployee?.profileId;

  if (!supabase) throw new Error("Database connection unavailable");
  if (!staffId) throw new Error("No active employee found");

  const result = await OrderService.reopenCheck(
    supabase,
    dbOrderId,
    staffId,
    reason || "Adding more items",
  );

  if (!result.success) {
    throw new Error(result.error || "Failed to reopen check");
  }
}
