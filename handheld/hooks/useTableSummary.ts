import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useLocationConfigStore } from "@/stores/useLocationConfigStore";
import { useTableSessionStore } from "@/stores/useTableSessionStore";
import { useMemo } from "react";
import { summarizeTable, type TableSummary } from "../lib/tableSummary";
import { useTableAnywhere } from "./useFloors";

/**
 * One table's live summary plus its server's name, for the table page. The
 * table may sit on any floor (the Tables tab lists every plan). The session
 * is a narrow selector; the tables array changes only on a floor resync,
 * and this is one page, not a hundred rows.
 */
export function useTableSummary(
  tableId: string,
  now: number,
): { summary: TableSummary | null; serverName: string | null } {
  const { table, floorTables: tables } = useTableAnywhere(tableId);
  const session = useTableSessionStore((s) => s.sessions[tableId] ?? null);
  // Once initialised the session store is authoritative (useTableCardData).
  const sessionsLive = useTableSessionStore((s) => s.isInitialized);
  // Same source as useTableRows / the register's useTableCardData.
  const sittingLimit = useLocationConfigStore(
    (s) => s.config.dining.defaultSittingTimeMinutes,
  );

  const summary = useMemo(() => {
    if (!table) return null;
    const nameById = new Map(tables.map((t) => [t.id, t.name] as const));
    const live = sessionsLive ? session : (session ?? table.session ?? null);
    return summarizeTable(table, live, nameById, now, sittingLimit);
  }, [table, tables, session, sessionsLive, sittingLimit, now]);

  const staffId = summary?.serverStaffId ?? null;
  const serverName = useEmployeeStore((s) =>
    staffId ? (s.getEmployeeByStaffId(staffId)?.displayName ?? null) : null,
  );

  return { summary, serverName };
}
