/**
 * Side effect: VOID_ORDER
 *
 * After the store transitions the session to "cleaning":
 * 1. Deduct inventory (backend RPC)
 * 2. Decrement local inventory stock
 * 3. Void the order (local + backend sync)
 * 4. Clear active order if matched
 *
 * This is the single source of truth for void logic — fixes the bug where
 * ExpandedTableDetails/TableListItem voided without inventory deduction.
 */

import type { SideEffectContext } from "@/lib/sessionSideEffects";
import { InventoryService } from "@/services/inventoryService";
import { useInventoryStore } from "@/stores/useInventoryStore";
import {
  getOrderStoreSupabaseClient,
  useOrderStore,
} from "@/stores/useOrderStore";
import { useTableSessionStore } from "@/stores/useTableSessionStore";

export async function voidOrderEffect(ctx: SideEffectContext): Promise<void> {
  if (ctx.action.type !== "VOID_ORDER") return;

  const { orderId, dbOrderId, tableId } = ctx.action;
  const orderState = useOrderStore.getState();
  const order = orderState.ordersById[orderId];

  if (!order) {
    console.warn("[voidOrderEffect] Order not found:", orderId);
    return;
  }

  // 1. Backend inventory deduction
  const resolvedDbOrderId = dbOrderId || order.db_order_id;
  if (resolvedDbOrderId) {
    const supabase = getOrderStoreSupabaseClient();
    if (supabase) {
      const result = await InventoryService.processOrderInventoryDeduction(
        supabase,
        resolvedDbOrderId,
      );
      if (!result.success) {
        console.warn(
          "[voidOrderEffect] Inventory deduction failed, proceeding with void",
        );
      }
    }
  }

  // 2. Local inventory decrement
  if (order.items?.length > 0) {
    useInventoryStore.getState().decrementStockFromSale(order.items);
  }

  // 3. Void the order
  orderState.voidOrder(orderId);

  // 4. Clear active order if it was this one
  if (useOrderStore.getState().activeOrderId === orderId) {
    orderState.setActiveOrder(null);
  }

  // 5. Transition table to cleaning via updateSessionStatus (handles backend sync)
  const session = useTableSessionStore.getState().getSession(tableId);
  if (session) {
    await useTableSessionStore
      .getState()
      .updateSessionStatus(session.id, "cleaning");
  }
}
