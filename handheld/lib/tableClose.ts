import { logError } from "@/lib/logError";
import type { OrderProfile } from "@/lib/types";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useTableSessionStore } from "@/stores/useTableSessionStore";
import { tableIdOf } from "./sendCourse";

/**
 * The register's table-closing calls, for the handheld. Three steps, each the
 * register's own:
 *
 *   1. `markTablePaid` — after a full payment the table reads "Paid". The
 *      register does this from its `order:paid` subscriber
 *      (lib/eventSubscribers.ts, SUBSCRIBER 2), which only fires from
 *      `usePaymentStore.handlePaymentCompletion`. The handheld records through
 *      `addPaymentToOrder` directly, so without this the tablet kept showing
 *      a handheld-paid table as ordered.
 *   2. `closeTable` — the floor plan's "Close Table" on a paid table
 *      (TableContextSheet → `clearTableSession`): `CLEAR_TABLE`, which archives
 *      the check and sends the table to cleaning.
 *   3. `markClean` — the floor plan's "Mark Clean": cleaning → available.
 *
 * `closeTable` is for locations with `autoClearTableOnPayment` off. With it
 * on, screen 9 frees the table through `finalizeDineInPaymentClear` instead,
 * and must not also dispatch `CLEAR_TABLE` (wave4-plan.md, trap 10).
 */

/** Every unvoided line paid in full — the items-level guard finalizeDineInPaymentClear uses. */
export function isFullyPaid(order: OrderProfile | null | undefined): boolean {
  if (!order || order.items.length === 0) return false;
  return order.items.every((i) => i.is_voided || (i.paidQuantity ?? 0) >= i.quantity);
}

/** Step 1. No-op for a check with no table, or a table already paid or cleaning. */
export async function markTablePaid(order: OrderProfile): Promise<void> {
  const tableId = tableIdOf(order);
  if (!tableId) return;
  const sessions = useTableSessionStore.getState();
  const session = sessions.getSession(tableId);
  if (!session || session.status === "paid" || session.status === "cleaning") return;
  try {
    const result = await sessions.dispatchAction({ type: "FULL_PAYMENT", tableId });
    if (!result.success) logError("table", "Handheld FULL_PAYMENT skipped", result.error);
  } catch (e) {
    logError("table", "Handheld FULL_PAYMENT failed", e);
  }
}

/**
 * Step 2, `clearTableSession`'s body with its result kept: the register's
 * version only warns on failure, and the handheld has to say whether the
 * table actually closed.
 */
export async function closeTable(tableId: string): Promise<boolean> {
  const sessions = useTableSessionStore.getState();
  const orderId = sessions.sessions[tableId]?.order_id ?? undefined;
  try {
    const result = await sessions.dispatchAction({ type: "CLEAR_TABLE", tableId, orderId });
    if (!result.success) logError("table", "Handheld close table refused", result.error);
    return result.success;
  } catch (e) {
    logError("table", "Handheld close table failed", e);
    return false;
  }
}

/** Step 3. True when the table left cleaning. */
export async function markClean(tableId: string): Promise<boolean> {
  try {
    await useFloorPlanStore.getState().finishCleaning(tableId);
  } catch (e) {
    logError("table", "Handheld mark clean failed", e);
  }
  return useTableSessionStore.getState().sessions[tableId]?.status !== "cleaning";
}
