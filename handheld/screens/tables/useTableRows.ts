import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useTableSessionStore } from "@/stores/useTableSessionStore";
import type { FloorPlanObject, TableStatus } from "@/types/db-floor-plan-types";
import { useMemo } from "react";
import { ACTIVE_TABLE_STATUSES, tableStatusRank } from "../../lib/tableStatus";

export interface TableRowData {
  id: string;
  name: string;
  status: TableStatus;
}

const SEATABLE: ReadonlySet<FloorPlanObject["category"]> = new Set([
  "table",
  "booth",
]);

/**
 * The Tables list, from the same two stores TablesPanel reads: the active
 * floor plan's objects and the live session map. Seatable objects only, merged
 * sessions collapsed to one row, sorted by status then name. No query of its
 * own — realtime and the floor snapshot keep both stores current.
 */
export function useTableRows(): {
  rows: TableRowData[];
  occupied: number;
} {
  const tables = useFloorPlanStore((s) => s.tables);
  const sessions = useTableSessionStore((s) => s.sessions);

  return useMemo(() => {
    const seenSessions = new Set<string>();
    const rows: TableRowData[] = [];
    let occupied = 0;

    for (const table of tables) {
      if (!SEATABLE.has(table.category)) continue;
      const session = sessions[table.id] ?? table.session ?? null;
      if (session?.merged_tables?.length) {
        if (seenSessions.has(session.id)) continue;
        seenSessions.add(session.id);
      }
      const status: TableStatus = session?.status ?? "available";
      if (ACTIVE_TABLE_STATUSES.has(status)) occupied++;
      rows.push({ id: table.id, name: table.name, status });
    }

    rows.sort((a, b) => {
      const byStatus = tableStatusRank(a.status) - tableStatusRank(b.status);
      if (byStatus !== 0) return byStatus;
      return a.name.localeCompare(b.name, undefined, { numeric: true });
    });

    return { rows, occupied };
  }, [tables, sessions]);
}
