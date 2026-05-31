/**
 * Refund Recovery — refund-side mirror of the post-payment lifecycle.
 *
 * After RefundService finishes (success path), backend authority for the order
 * has changed (payments[].refunded_amount, amount_due, amount_paid,
 * paid_status). The client did not observe those writes synchronously, so this
 * helper re-syncs the active order from the database and, if the order is no
 * longer fully paid, transitions the table session out of `paid` back to
 * `check_presented` so the floor plan and Pay for Items both reflect reality.
 *
 * Called from refund entry points in usePreviousOrdersStore (refundFullOrder,
 * refundItems). Idempotent — safe to call even when there is no table session
 * or the order is already in a consistent state.
 */

import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { useTableSessionStore } from "@/stores/useTableSessionStore";

export interface RefundRecoveryArgs {
  /** Local order id (matches `useOrderStore.ordersById` key). */
  orderId: string;
  /** Table id, when the refund is on a dine-in order. */
  tableId?: string;
}

export async function applyRefundRecovery({
  orderId,
  tableId,
}: RefundRecoveryArgs): Promise<void> {
  try {
    // 1. Force-resync the order so payments[].refundedAmount, amount_due, and
    //    paid_status reflect the post-refund backend row. The cooldown is
    //    bypassed because the refund just changed authoritative state.
    await useOrderStore
      .getState()
      .syncOrderFromBackendComplete(orderId, { force: true });

    const storeKey =
      useOrderStore.getState().dbOrderIdIndex[orderId] ?? orderId;
    const order = useOrderStore.getState().ordersById[storeKey];

    // 2. If the refund moved the bill back to "owed" and the table is still
    //    marked paid (from the prior order:paid emit), reopen the check.
    //    `check_presented` is the same state PRESENT_CHECK lands in, and it
    //    is a valid source for FULL_PAYMENT/RECEIVE_PAYMENT, so any
    //    subsequent re-payment can transition through the state machine
    //    cleanly.
    if (tableId && order && (order.amount_due ?? 0) > 0.01) {
      const sessionStore = useTableSessionStore.getState();
      const session = sessionStore.getSession(tableId);
      if (session?.status === "paid") {
        const result = await sessionStore.dispatchAction({
          type: "REOPEN_CHECK",
          tableId,
          orderId: storeKey,
          dbOrderId: order.db_order_id ?? "",
          reason: "Refund processed — bill reopened",
        });
        if (!result.success) {
          console.warn(
            `[RefundRecovery] REOPEN_CHECK skipped for table ${tableId}: ${result.error}`,
          );
        }
      }
    }

    // 3. Insurance refresh for the floor-plan tile, mirroring the post-payment
    //    subscriber. Realtime usually beats us here, but this guarantees the
    //    "Clear & Close" affordance drops within ~1s even if realtime is slow.
    if (tableId) {
      setTimeout(() => {
        useFloorPlanStore
          .getState()
          .loadFloorPlanStatus()
          .catch((err) =>
            console.error(
              `[RefundRecovery] Floor plan refresh failed for table ${tableId}:`,
              err,
            ),
          );
      }, 1000);
    }
  } catch (err) {
    console.error("[RefundRecovery] Failed:", err);
  }
}
