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
  | "siblings-due";

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

  const siblingsDue = Object.values(useOrderStore.getState().ordersById).some(
    (o) =>
      (o.session_id === sessionId || o.local_session_id === sessionId) &&
      (o.amount_due ?? 0) > 0.01,
  );
  if (siblingsDue) {
    return { cleared: false, reason: "siblings-due" };
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
