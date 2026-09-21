import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useLocationConfigStore } from "@/stores/useLocationConfigStore";
import { useTableSessionStore } from "@/stores/useTableSessionStore";
import type { FloorPlanObject } from "@/types/db-floor-plan-types";
import { useMemo } from "react";
import { tableNeedsYou, tableStatusRank } from "../../lib/tableStatus";
import { summarizeTable, type TableSummary } from "../../lib/tableSummary";

export type TablesScope = "mine" | "all";
export type TableRowData = TableSummary;

export interface TableRows {
  needsYou: TableRowData[];
  section: TableRowData[];
  mineCount: number;
  allCount: number;
  occupied: number;
  floorName: string;
}

const SEATABLE: ReadonlySet<FloorPlanObject["category"]> = new Set(["table", "booth"]);

function byUrgency(a: TableRowData, b: TableRowData): number {
  return (b.minutes ?? 0) - (a.minutes ?? 0);
}

function byStatus(a: TableRowData, b: TableRowData): number {
  const rank = tableStatusRank(a.status) - tableStatusRank(b.status);
  if (rank !== 0) return rank;
  // Numeric names first by number; unnumbered names ("Patio A") fall back to
  // a plain string compare — no collator per comparison on a 100-table floor.
  if (a.sortKey !== b.sortKey) return a.sortKey < b.sortKey ? -1 : 1;
  return a.title < b.title ? -1 : a.title > b.title ? 1 : 0;
}

/**
 * Screen 1's data, from the same stores TablesPanel reads. Seatable objects
 * only, merged sessions collapsed, Mine = tables whose session names the
 * signed-in server. "Needs you" is pinned on top, longest-waiting first; the
 * rest follow the register's status order. `now` ticks once a minute.
 */
export function useTableRows(scope: TablesScope, now: number): TableRows {
  const tables = useFloorPlanStore((s) => s.tables);
  const floorName = useFloorPlanStore(
    (s) => s.floorPlans.find((p) => p.id === s.activeFloorPlanId)?.name ?? "Floor",
  );
  const sessions = useTableSessionStore((s) => s.sessions);
  const myProfileId = useEmployeeStore((s) => s.loggedInEmployee?.profileId ?? null);
  // The location's sitting time — the same field useTableCardData reads on
  // the register (useSettingsStore has a same-named field nothing writes).
  const sittingLimit = useLocationConfigStore(
    (s) => s.config.dining.defaultSittingTimeMinutes,
  );

  return useMemo(() => {
    const nameById = new Map(tables.map((t) => [t.id, t.name] as const));
    const seenSessions = new Set<string>();
    const all: TableRowData[] = [];
    let occupied = 0;

    for (const table of tables) {
      if (!SEATABLE.has(table.category)) continue;
      const session = sessions[table.id] ?? table.session ?? null;
      if (session && session.merged_tables?.length) {
        if (seenSessions.has(session.id)) continue;
        seenSessions.add(session.id);
      }
      const row = summarizeTable(table, session, nameById, now, sittingLimit);
      if (row.minutes !== null) occupied++;
      all.push(row);
    }

    const mine = myProfileId ? all.filter((r) => r.serverStaffId === myProfileId) : [];
    const visible = scope === "mine" ? mine : all;
    const needsYou = visible
      .filter((r) => tableNeedsYou(r.status, !!sessions[r.id]?.needs_attention, r.overtime))
      .sort(byUrgency);
    const pinned = new Set(needsYou.map((r) => r.id));
    const section = visible.filter((r) => !pinned.has(r.id)).sort(byStatus);

    return {
      needsYou,
      section,
      mineCount: mine.length,
      allCount: all.length,
      occupied,
      floorName,
    };
  }, [tables, sessions, myProfileId, sittingLimit, scope, now, floorName]);
}
