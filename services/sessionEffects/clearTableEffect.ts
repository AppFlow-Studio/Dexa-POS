/**
 * Side effect: CLEAR_TABLE
 *
 * After the store transitions the session to "cleaning":
 * 1. Archive the order (local)
 * 2. Clear active order if matched
 *
 * Note: backend session-status sync is owned by dispatchAction itself
 * (useTableSessionStore.dispatchAction calls FloorPlanService.updateTableSessionStatus
 * directly). Calling updateSessionStatus here too would double-fire the RPC and
 * widen the race window on broadcast ordering — do not add it back.
 */

import type { SideEffectContext } from "@/lib/sessionSideEffects";
import { useOrderStore } from "@/stores/useOrderStore";

export async function clearTableEffect(ctx: SideEffectContext): Promise<void> {
  if (ctx.action.type !== "CLEAR_TABLE") return;

  const { orderId } = ctx.action;
  const orderState = useOrderStore.getState();

  if (orderId) {
    orderState.archiveOrder(orderId);
  }

  if (orderId && useOrderStore.getState().activeOrderId === orderId) {
    orderState.setActiveOrder(null);
  }
}
