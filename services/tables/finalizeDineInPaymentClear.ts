import { FloorPlanService } from "@/services/floorPlanService";
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

  const supabase = getOrderStoreSupabaseClient();
  const staffId = useEmployeeStore.getState().loggedInEmployee?.profileId;
  if (supabase && staffId) {
    FloorPlanService.updateTableSessionStatus(supabase, {
      p_session_id: sessionId,
      p_status: "available",
      p_staff_id: staffId,
    })
      .then(({ error }) => {
        if (error) {
          console.warn(
            `[finalizeDineInPaymentClear] backend update failed for session ${sessionId}:`,
            error,
          );
          return;
        }
        useFloorPlanStore
          .getState()
          .loadFloorPlanStatus()
          .catch(() => {});
      })
      .catch((err) => {
        console.warn(
          `[finalizeDineInPaymentClear] backend update threw for session ${sessionId}:`,
          err,
        );
      });
  }

  return { cleared: true };
}
