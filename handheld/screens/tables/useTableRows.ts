import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useLocationConfigStore } from "@/stores/useLocationConfigStore";
import { useTableSessionStore } from "@/stores/useTableSessionStore";
import type { FloorPlanObject } from "@/types/db-floor-plan-types";
import { useMemo } from "react";
import { useFloors } from "../../hooks/useFloors";
import { tableNeedsYou, tableStatusRank } from "../../lib/tableStatus";
import { summarizeTable, type TableSummary } from "../../lib/tableSummary";
import { canSeat } from "../seat/useSeatTable";

export type TablesScope = "mine" | "all" | "free";
export type TableRowData = TableSummary;

export interface TableRows {
  needsYou: TableRowData[];
  section: TableRowData[];
  mineCount: number;
  allCount: number;
  freeCount: number;
  occupied: number;
  floorName: string;
}

const SEATABLE: ReadonlySet<FloorPlanObject["category"]> = new Set(["table", "booth"]);

function byUrgency(a: TableRowData, b: TableRowData): number {
  return (b.minutes ?? 0) - (a.minutes ?? 0);
}

function byNumber(a: TableRowData, b: TableRowData): number {
  if (a.sortKey !== b.sortKey) return a.sortKey < b.sortKey ? -1 : 1;
  return a.title < b.title ? -1 : a.title > b.title ? 1 : 0;
}

function byStatus(a: TableRowData, b: TableRowData): number {
  const rank = tableStatusRank(a.status) - tableStatusRank(b.status);
  return rank !== 0 ? rank : byNumber(a, b);
}

/** "12" matches Table 12 / T12 / 12; "pat" matches Patio A. */
function matches(row: TableRowData, needle: string): boolean {
  return row.title.toLowerCase().includes(needle) || row.tileLabel.toLowerCase().includes(needle);
}

/**
 * Screen 1's data for the chosen floor (or every floor), from the same
 * stores TablesPanel reads. Seatable objects only, merged sessions
 * collapsed. Mine = tables whose session names the signed-in server, plus
 * free tables in a section assigned to them ("Your section"). Free = tables
 * that can be seated, by number. "Needs you" is pinned on top, longest-
 * waiting first; the rest follow the register's status order. `query`
 * filters by name before grouping. `now` ticks once a minute.
 */
export function useTableRows(scope: TablesScope, now: number, query = ""): TableRows {
  const { floor, floorName } = useFloors();
  const sessions = useTableSessionStore((s) => s.sessions);
  // Once initialised the session store is authoritative (useTableCardData):
  // a cleared table has no entry, and the plan's `table.session` is stale.
  const sessionsLive = useTableSessionStore((s) => s.isInitialized);
  const myProfileId = useEmployeeStore((s) => s.loggedInEmployee?.profileId ?? null);
  // The location's sitting time — the same field useTableCardData reads on
  // the register (useSettingsStore has a same-named field nothing writes).
  const sittingLimit = useLocationConfigStore((s) => s.config.dining.defaultSittingTimeMinutes);

  return useMemo(() => {
    const { tables, sectionsById } = floor;
    const nameById = new Map(tables.map((t) => [t.id, t.name] as const));
    const seenSessions = new Set<string>();
    const all: TableRowData[] = [];
    const mineIds = new Set<string>();
    let occupied = 0;

    for (const table of tables) {
      if (!SEATABLE.has(table.category)) continue;
      const session = sessionsLive ? (sessions[table.id] ?? null) : (sessions[table.id] ?? table.session ?? null);
      if (session && session.merged_tables?.length) {
        if (seenSessions.has(session.id)) continue;
        seenSessions.add(session.id);
      }
      const row = summarizeTable(table, session, nameById, now, sittingLimit);
      if (row.minutes !== null) occupied++;
      all.push(row);
      const mySection = !!table.section_id && sectionsById[table.section_id]?.assigned_staff_id === myProfileId;
      if (myProfileId && (row.serverStaffId === myProfileId || (row.minutes === null && mySection))) mineIds.add(row.id);
    }

    const needle = query.trim().toLowerCase();
    const searched = needle ? all.filter((r) => matches(r, needle)) : all;
    const free = searched.filter((r) => canSeat(r.status));
    const mine = searched.filter((r) => mineIds.has(r.id));
    const counts = { mineCount: mine.length, allCount: searched.length, freeCount: free.length, occupied, floorName };

    if (scope === "free") return { needsYou: [], section: free.sort(byNumber), ...counts };

    const visible = scope === "mine" ? mine : searched;
    const needsYou = visible
      .filter((r) => tableNeedsYou(r.status, !!sessions[r.id]?.needs_attention, r.overtime))
      .sort(byUrgency);
    const pinned = new Set(needsYou.map((r) => r.id));
    const section = visible.filter((r) => !pinned.has(r.id)).sort(byStatus);
    return { needsYou, section, ...counts };
  }, [floor, floorName, sessions, sessionsLive, myProfileId, sittingLimit, scope, query, now]);
}
