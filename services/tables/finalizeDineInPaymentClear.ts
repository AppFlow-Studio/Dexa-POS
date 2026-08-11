import { queueFailedOperation } from "@/services/offlineSyncInit";
import { getIsOnline } from "@/services/offlineSyncService";
import { OrderService } from "@/services/orderService";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useLocationConfigStore } from "@/stores/useLocationConfigStore";
import {
  getOrderStoreSupabaseClient,
  useOrderStore,
} from "@/stores/useOrderStore";
import { useTableSessionStore } from "@/stores/useTableSessionStore";

export type FinalizeDineInClearReason =
  | "setting-disabled"
  | "no-session"
  | "siblings-due"
  | "unpaid-items";

export interface FinalizeDineInClearResult {
  cleared: boolean;
  reason?: FinalizeDineInClearReason;
}

/**
 * Runs the dine-in auto-clear once the operator explicitly finalizes payment
 * from PaymentSuccessView. Mirrors the previous implicit watchers in
 * BillSection / TableOrderView / syncPaymentToBackend, but is only invoked from
 * the Finalize Payment button so the success view never races the clear.
 */
export function finalizeDineInPaymentClear(args: {
  tableId: string;
}): FinalizeDineInClearResult {
  const { tableId } = args;

  const autoClearEnabled =
    useLocationConfigStore.getState().config.dining
      .autoClearTableOnPayment === true;
  if (!autoClearEnabled) {
    return { cleared: false, reason: "setting-disabled" };
  }

  const session = useTableSessionStore.getState().getSession(tableId);
  if (!session) {
    return { cleared: false, reason: "no-session" };
  }
  const sessionId = session.id;

  const sessionOrders = Object.values(useOrderStore.getState().ordersById).filter(
    (o) => o.session_id === sessionId || o.local_session_id === sessionId,
  );

  const siblingsDue = sessionOrders.some((o) => (o.amount_due ?? 0) > 0.01);
  if (siblingsDue) {
    return { cleared: false, reason: "siblings-due" };
  }

  // Definitive items-level guard. Backend-synced `amount_due` / `paid_status`
  // can collapse to 0 / "Paid" on per-item partial payments (pay-for-items,
  // split-by-item, split-custom-amount) when itemAllocations land the
  // cash-side balance at 0 while card-side units remain unpaid — see
  // useOrderStore.ts:3028 `isFullyPaidByAmounts` OR'd across order_amount_due,
  // order_cash_amount_due and unpaid_cash_total. paidQuantity is set
  // synchronously by addPaymentToOrder and isn't subject to that drift, so any
  // item with quantity > paidQuantity proves the order isn't actually paid in
  // full — block the auto-clear regardless of the cached amount_due.
  const hasUnpaidItems = sessionOrders.some((o) =>
    (o.items ?? []).some(
      (item) => !item.is_voided && item.quantity > (item.paidQuantity ?? 0),
    ),
  );
  if (hasUnpaidItems) {
    return { cleared: false, reason: "unpaid-items" };
  }

  useTableSessionStore.getState().dispatch(tableId, { type: "CLEAR" });

  // Wave B — reliable, replay-safe backend free. Route through the atomic
  // close_and_free_session RPC (closes the check + frees the session THROUGH
  // the event projector, stamping paid_at + emitting the lifecycle events).
  // On any failure/offline it is enqueued on the existing offline-sync queue,
  // which retries on reconnect and replays on relaunch — so a completed payment
  // can never leave the session active on the server (the 3h37m phantom bug).
  const paidOrder =
    sessionOrders.find((o) => o.db_order_id) ?? sessionOrders[0];
  void freeSessionReliably({
    sessionId,
    dbOrderId: paidOrder?.db_order_id,
    localOrderId: paidOrder?.id,
    staffId: useEmployeeStore.getState().loggedInEmployee?.profileId ?? null,
  });

  return { cleared: true };
}

/**
 * Frees the dine-in session on the backend, reliably. Tries the atomic RPC
 * inline when online; on any failure (or when offline / order-not-yet-synced)
 * it hands the op to the offline-sync queue for retry + relaunch replay. The
 * RPC is idempotent (returns already_freed when the session is already freed),
 * so an inline attempt that races a queued retry can't double-free.
 */
async function freeSessionReliably(args: {
  sessionId: string;
  dbOrderId?: string;
  localOrderId?: string;
  staffId: string | null;
}): Promise<void> {
  const { sessionId, dbOrderId, localOrderId, staffId } = args;

  const enqueue = () =>
    queueFailedOperation(
      "close_and_free_session",
      {
        p_order_id: dbOrderId ?? null,
        p_session_id: sessionId,
        p_staff_id: staffId,
      },
      localOrderId ?? dbOrderId ?? sessionId,
    ).catch((e) =>
      console.warn(
        "[finalizeDineInPaymentClear] failed to enqueue close_and_free_session",
        e,
      ),
    );

  const supabase = getOrderStoreSupabaseClient();

  // Offline, no client, or order not yet synced → straight to the queue.
  if (!supabase || !dbOrderId || !getIsOnline()) {
    await enqueue();
    return;
  }

  try {
    const result = await OrderService.closeAndFreeSession(
      supabase,
      dbOrderId,
      sessionId,
      staffId,
    );
    if (result.success || result.already_freed) {
      useFloorPlanStore
        .getState()
        .loadFloorPlanStatus()
        .catch(() => {});
      return;
    }
    // Server reachable but the RPC failed — retry via the queue.
    await enqueue();
  } catch (err) {
    console.warn(
      `[finalizeDineInPaymentClear] close_and_free_session failed for session ${sessionId}; queued for retry:`,
      err,
    );
    await enqueue();
  }
}
