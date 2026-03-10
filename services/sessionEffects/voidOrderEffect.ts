/**
 * Side effect: VOID_ORDER
 *
 * The void_order RPC handles all backend cleanup:
 *   - Voids order items and payments
 *   - Sets table_sessions.is_active=false, closed_at, closed_by via order_id FK
 *
 * This effect only handles local side effects:
 * 1. Deduct inventory (separate backend RPC)
 * 2. Decrement local inventory stock
 * 3. Void the order locally (useOrderStore.voidOrder triggers the RPC)
 * 4. Clear local session store for the table
 */

import type { SideEffectContext } from "@/lib/sessionSideEffects";
import { InventoryService } from "@/services/inventoryService";
import { recordVoidedSession, recordTableCleared } from "@/services/tableSessionRealtimeSync";
import { useInventoryStore } from "@/stores/useInventoryStore";
import {
  getOrderStoreSupabaseClient,
  useOrderStore,
} from "@/stores/useOrderStore";
import { useTableSessionStore } from "@/stores/useTableSessionStore";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";

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

  // 3. Void the order locally + triggers void_order RPC which closes the backend session
  orderState.voidOrder(orderId);

  // 4. Clear active order if it was this one
  if (useOrderStore.getState().activeOrderId === orderId) {
    orderState.setActiveOrder(null);
  }

  // 5. Clear local session store — backend session already closed by void_order RPC
  const sessionStore = useTableSessionStore.getState();
  const session = sessionStore.getSession(tableId);
  if (session) {
    const sessionId = session.id;

    // Clear from session store
    sessionStore.dispatch(tableId, { type: "CLEAR" });

    // Sync clear to floor plan store so UI updates immediately
    sessionStore._syncToFloorPlanStore(tableId);

    // Record as voided so polling won't restore it
    recordVoidedSession(tableId, sessionId);

    // Also record as recently cleared to give backend RPC time to update
    recordTableCleared(tableId);

    console.log(`[voidOrderEffect] Cleared table ${tableId} session ${sessionId}`);
  } else {
    console.warn("[voidOrderEffect] No session found for tableId:", tableId);
  }
}
