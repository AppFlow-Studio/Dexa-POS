import { toastService } from "@/lib/toastService";
import {
  finalizeDineInPaymentClear,
  type FinalizeDineInClearReason,
} from "@/services/tables/finalizeDineInPaymentClear";
import { useOrderStore } from "@/stores/useOrderStore";
import { useCallback, useState } from "react";
import { tableIdOf } from "../../lib/sendCourse";
import { closeTable, markTablePaid } from "../../lib/tableClose";

/**
 * Why the table did not free up, in words an operator can act on.
 * `setting-disabled` is not here: with auto-clear off the handheld closes
 * the table the register's manual way instead of refusing.
 */
const REASON: Record<Exclude<FinalizeDineInClearReason, "setting-disabled">, string> = {
  "no-session": "The check is closed. This device has no open session for the table.",
  "siblings-due": "The check is closed, but another check on this table still has a balance.",
  "unpaid-items": "The check is closed, but some items on it are not fully paid.",
};

/**
 * Screen 9's "Close table N" — the location decides which close:
 *
 * - `autoClearTableOnPayment` on: the register's finalize
 *   (`finalizeDineInPaymentClear` → `{ type: "CLEAR" }`), which REMOVES the
 *   session, so the table reads **available**.
 * - off: the register's floor-plan "Close Table" (`closeTable` →
 *   `CLEAR_TABLE`), which archives the check and sends the table to
 *   **cleaning**; "Mark clean" on the table page frees it. Before, the
 *   handheld refused here and sent the server to the tablet.
 *
 * Never both: finalize returns `setting-disabled` before touching anything,
 * so the fallback is the only close that runs (wave4-plan.md, trap 10).
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
      if (!order || !tableId) return true;

      const result = finalizeDineInPaymentClear({ tableId });
      if (result.cleared) {
        toastService.show({ title: "Table free", message: "The check is closed and the table is available.", type: "success" });
        return true;
      }

      if (result.reason === "setting-disabled") {
        // CLEAR_TABLE is only valid from paid (or served / presented); a
        // table this device just took payment on is already paid.
        await markTablePaid(order);
        const closed = await closeTable(tableId);
        toastService.show(
          closed
            ? { title: "Table closed", message: "The table is marked for cleaning. Mark it clean from the table when it's ready.", type: "success" }
            : { title: "Table not closed", message: "The table could not be closed. Try again from the table.", type: "warning" },
        );
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
