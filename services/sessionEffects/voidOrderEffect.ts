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

import { clearOrderPendingVoid } from "@/lib/pendingVoidOrderIds";
import type { SideEffectContext } from "@/lib/sessionSideEffects";
import { InventoryService } from "@/services/inventoryService";
import { PrinterService } from "@/services/printing/PrinterService";
import { useInventoryStore } from "@/stores/useInventoryStore";
import { useLocationConfigStore } from "@/stores/useLocationConfigStore";
import {
  getOrderStoreSupabaseClient,
  useOrderStore,
} from "@/stores/useOrderStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useTableSessionStore } from "@/stores/useTableSessionStore";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { calculateItemEffectiveCardPrice } from "@/lib/order-calculator";

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

  const printingConfig = useLocationConfigStore.getState().config.printing;
  const selectedStore = useStoreSettingsStore.getState().selectedStore;

  // 3b. Print void kitchen tickets for kitchen-sent items — non-blocking
  if (printingConfig?.printVoidTickets && selectedStore) {
    const kitchenItems = order.items.filter(
      (it) =>
        it.kitchen_status === "sent" ||
        it.kitchen_status === "preparing" ||
        it.kitchen_status === "ready" ||
        it.kitchen_status === "served"
    );
    if (kitchenItems.length > 0) {
      PrinterService.printVoidTicket(order, kitchenItems, selectedStore).catch(
        (err) => {
          console.warn("[voidOrderEffect] printVoidTicket failed:", err);
        }
      );
    }
  }

  // 3c. Print void-order receipt (customer-facing) — non-blocking
  if (printingConfig?.autoPrintVoidReceipt) {
    const locationId = selectedStore?.id ?? "";
    if (locationId) {
      try {
        const voidedSnapshot = order.items.map((it) => ({
          name: it.is_open_item ? it.open_item_name || it.name : it.name,
          quantity: it.quantity,
          // unit price with modifiers applied (matches ReceiptTemplateData convention)
          price: calculateItemEffectiveCardPrice(it),
        }));
        const subtotal = order.items.reduce(
          (sum, it) =>
            sum + calculateItemEffectiveCardPrice(it) * (it.quantity || 1),
          0,
        );

        // Try to pick any void_reason from items (void reason is stored per-item)
        const firstReason =
          order.items.find((it) => it.void_reason)?.void_reason ?? undefined;

        const addressParts = selectedStore
          ? [
              selectedStore.address_line1,
              selectedStore.address_line2,
              `${selectedStore.city}, ${selectedStore.state} ${selectedStore.postal_code}`,
            ].filter(Boolean)
          : [];

        await PrinterService.printVoidOrderReceipt({
          storeName: selectedStore?.name || "Store",
          storeAddress: addressParts.join(", ") || undefined,
          storePhone: selectedStore?.phone || undefined,
          orderNumber:
            order.display_number ||
            order.order_number ||
            `#${order.id.slice(-4)}`,
          serverName: order.server_name,
          items: voidedSnapshot,
          subtotal,
          reason: firstReason,
          approvedBy: undefined,
          timestamp: new Date().toISOString(),
          locationId,
        });
      } catch (err) {
        console.warn("[voidOrderEffect] printVoidOrderReceipt failed:", err);
      }
    }
  }

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

    console.log(`[voidOrderEffect] Cleared table ${tableId} session ${sessionId}`);
  } else {
    console.warn("[voidOrderEffect] No session found for tableId:", tableId);
  }

  // Clean up pending void flag (may already be cleared by broadcast handler)
  clearOrderPendingVoid(orderId);
}
