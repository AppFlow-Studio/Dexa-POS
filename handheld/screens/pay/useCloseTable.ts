import { toastService } from "@/lib/toastService";
import {
  finalizeDineInPaymentClear,
  type FinalizeDineInClearReason,
} from "@/services/tables/finalizeDineInPaymentClear";
import { useOrderStore } from "@/stores/useOrderStore";
import { useCallback, useState } from "react";
import { tableIdOf } from "../../lib/sendCourse";

/**
 * Why the table did not free up, in words an operator can act on.
 *
 * `setting-disabled` is the one that is a configuration answer rather than a
 * floor answer: `config.dining.autoClearTableOnPayment` defaults false, so on
 * a location that has not switched it on this is what every close returns.
 */
const REASON: Record<FinalizeDineInClearReason, string> = {
  "setting-disabled":
    "The check is closed. This location does not free tables automatically — clear it from the floor plan.",
  "no-session": "The check is closed. This device has no open session for the table.",
  "siblings-due": "The check is closed, but another check on this table still has a balance.",
  "unpaid-items": "The check is closed, but some items on it are not fully paid.",
};

/**
 * Screen 9's "Close table N".
 *
 * Runs the register's own finalize, which dispatches `{ type: "CLEAR" }` —
 * that REMOVES the session, so the table reads **available**, not "cleaning".
 * The artifact's "moves to cleaning" hint is wrong for this path, and the
 * copy here says what actually happens.
 *
 * Deliberately does NOT dispatch `CLEAR_TABLE`: that path runs
 * `clearTableEffect`, whose unconditional `archiveOrder` double-decrements
 * stock when an auto-archive has already queued one, and it produces cleaning
 * tables the handheld has no affordance to finish.
 */
export function useCloseTable(orderId: string) {
  const [busy, setBusy] = useState(false);

  const close = useCallback(async (): Promise<boolean> => {
    setBusy(true);
    try {
      const order = useOrderStore.getState().ordersById[orderId];
      // A takeout or delivery check has no table to release; closing is just
      // leaving the screen.
      const tableId = order ? tableIdOf(order) : null;
      if (!tableId) return true;

      const result = finalizeDineInPaymentClear({ tableId });
      if (result.cleared) {
        toastService.show({
          title: "Table free",
          message: "The check is closed and the table is available.",
          type: "success",
        });
        return true;
      }

      toastService.show({
        title: "Table not freed",
        message: result.reason ? REASON[result.reason] : "The table could not be freed.",
        type: "warning",
      });
      return true;
    } finally {
      setBusy(false);
    }
  }, [orderId]);

  return { close, busy };
}
