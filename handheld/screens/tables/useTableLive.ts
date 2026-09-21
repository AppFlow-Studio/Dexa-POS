import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useTableSessionStore } from "@/stores/useTableSessionStore";
import type { TableSession } from "@/types/db-floor-plan-types";

/**
 * One table's live session plus its server's display name, through narrow
 * selectors so a row only re-renders when *its* session changes. Falls back
 * to the snapshot session on the floor-plan object, as TablesPanel does.
 */
export function useTableLive(tableId: string): {
  session: TableSession | null;
  serverName: string | null;
} {
  const live = useTableSessionStore((s) => s.sessions[tableId]);
  const snapshot = useFloorPlanStore(
    (s) => s.tables.find((t) => t.id === tableId)?.session ?? null,
  );
  const session = live ?? snapshot;
  const serverName = useEmployeeStore((s) =>
    session?.server_staff_id
      ? (s.getEmployeeByStaffId(session.server_staff_id)?.displayName ?? null)
      : null,
  );
  return { session, serverName };
}
