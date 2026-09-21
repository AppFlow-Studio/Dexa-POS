import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useLocationConfigStore } from "@/stores/useLocationConfigStore";
import { useTableSessionStore } from "@/stores/useTableSessionStore";
import { useMemo } from "react";
import { summarizeTable, type TableSummary } from "../lib/tableSummary";

/**
 * One table's live summary plus its server's name, for the table page. The
 * session is a narrow selector; the tables array changes only on a floor
 * resync, and this is one page, not a hundred rows.
 */
export function useTableSummary(
  tableId: string,
  now: number,
): { summary: TableSummary | null; serverName: string | null } {
  const tables = useFloorPlanStore((s) => s.tables);
  const session = useTableSessionStore((s) => s.sessions[tableId] ?? null);
  // Same source as useTableRows / the register's useTableCardData.
  const sittingLimit = useLocationConfigStore(
    (s) => s.config.dining.defaultSittingTimeMinutes,
  );

  const summary = useMemo(() => {
    const table = tables.find((t) => t.id === tableId);
    if (!table) return null;
    const nameById = new Map(tables.map((t) => [t.id, t.name] as const));
    return summarizeTable(table, session ?? table.session ?? null, nameById, now, sittingLimit);
  }, [tables, tableId, session, sittingLimit, now]);

  const staffId = summary?.serverStaffId ?? null;
  const serverName = useEmployeeStore((s) =>
    staffId ? (s.getEmployeeByStaffId(staffId)?.displayName ?? null) : null,
  );

  return { summary, serverName };
}
