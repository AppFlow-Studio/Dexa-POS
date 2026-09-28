import { logError } from "@/lib/logError";
import { transferTableServer } from "@/services/serverAssignmentService";
import type { EmployeeProfile } from "@/stores/useEmployeeStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { useTableSessionStore } from "@/stores/useTableSessionStore";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface TransferTarget {
  tableId: string;
  sessionId: string;
}

/**
 * The register's "Transfer server" (tables/index.tsx
 * `handleServerSelectedForTransfer`), for several tables at once: the
 * session's `server_staff_id`, the check's `server_name`, and the
 * `table_sessions` row.
 *
 * One deliberate difference: the register patches locally first and fires
 * the backend write without waiting. Here the backend write goes first and
 * the local patch only follows a success — the device asking is about to
 * die, so a table must not look handed off on this screen while nobody else
 * can see it.
 */
export async function transferTables(
  supabase: SupabaseClient,
  tables: readonly TransferTarget[],
  to: EmployeeProfile,
): Promise<{ moved: number; failed: number }> {
  let moved = 0;
  let failed = 0;
  for (const { tableId, sessionId } of tables) {
    try {
      const result = await transferTableServer(supabase, sessionId, to.profileId);
      if (!result.success) {
        failed++;
        continue;
      }
      useTableSessionStore.getState().dispatch(tableId, { type: "PATCH", updates: { server_staff_id: to.profileId } });
      const orderId = useTableSessionStore.getState().sessions[tableId]?.order_id;
      if (orderId) {
        const orders = useOrderStore.getState();
        const local = orders.getOrderByDbId(orderId) || orders.getOrder(orderId);
        if (local?.id) orders.patchOrder(local.id, { server_name: to.fullName });
      }
      moved++;
    } catch (e) {
      logError("table", "Handheld table transfer failed", e);
      failed++;
    }
  }
  return { moved, failed };
}
