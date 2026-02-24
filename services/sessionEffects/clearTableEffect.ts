/**
 * Side effect: CLEAR_TABLE
 *
 * After the store transitions the session to "cleaning":
 * 1. Archive the order (local)
 * 2. Sync session status to backend ("cleaning")
 * 3. Clear active order if matched
 */

import type { SideEffectContext } from "@/lib/sessionSideEffects";
import { useOrderStore } from "@/stores/useOrderStore";
import { useTableSessionStore } from "@/stores/useTableSessionStore";

export async function clearTableEffect(ctx: SideEffectContext): Promise<void> {
  if (ctx.action.type !== "CLEAR_TABLE") return;

  const { orderId, tableId } = ctx.action;
  const orderState = useOrderStore.getState();

  // 1. Archive the order if provided
  if (orderId) {
    orderState.archiveOrder(orderId);
  }

  // 2. Clear active order if it was this one
  if (orderId && useOrderStore.getState().activeOrderId === orderId) {
    orderState.setActiveOrder(null);
  }

  // 3. Sync session to backend ("cleaning")
  const session = useTableSessionStore.getState().getSession(tableId);
  if (session) {
    await useTableSessionStore
      .getState()
      .updateSessionStatus(session.id, "cleaning");
  }
}
