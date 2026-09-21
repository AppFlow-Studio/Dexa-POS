import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useTableSessionStore } from "@/stores/useTableSessionStore";
import type { FloorPlanObject, TableStatus } from "@/types/db-floor-plan-types";
import { useMemo } from "react";
import { minutesSince } from "../../lib/format";
import { tableTileLabel, tableTitle } from "../../lib/tableName";
import {
  IN_USE_STATUSES,
  tableNeedsYou,
  tableStatusRank,
} from "../../lib/tableStatus";

export type TablesScope = "mine" | "all";

export interface TableRowData {
  id: string;
  title: string;
  tileLabel: string;
  status: TableStatus;
  capacity: number | null;
  guests: number | null;
  /** Minutes since seated, null when the table is free. */
  minutes: number | null;
  overtime: boolean;
  serverStaffId: string | null;
  /** Backend order id of the linked check, for the row's live total. */
  orderDbId: string | null;
}

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
  return rank !== 0 ? rank : a.title.localeCompare(b.title, undefined, { numeric: true });
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
  const sittingLimit = useSettingsStore((s) => s.defaultSittingTimeMinutes);

  return useMemo(() => {
    const nameById = new Map(tables.map((t) => [t.id, t.name] as const));
    const seenSessions = new Set<string>();
    const all: TableRowData[] = [];
    let occupied = 0;

    for (const table of tables) {
      if (!SEATABLE.has(table.category)) continue;
      const session = sessions[table.id] ?? table.session ?? null;
      const merged = session?.merged_tables ?? [];
      if (session && merged.length > 0) {
        if (seenSessions.has(session.id)) continue;
        seenSessions.add(session.id);
      }
      const status: TableStatus = session?.status ?? "available";
      const inUse = IN_USE_STATUSES.has(status);
      if (inUse) occupied++;
      const minutes = inUse ? minutesSince(session?.seated_at, now) : null;
      const overtime = sittingLimit > 0 && minutes !== null && minutes > sittingLimit;
      const mergedNames = merged
        .filter((id) => id !== table.id)
        .map((id) => nameById.get(id))
        .filter((n): n is string => !!n);

      all.push({
        id: table.id,
        title: tableTitle(table.name, mergedNames),
        tileLabel: tableTileLabel(table.name),
        status,
        capacity: table.capacity ?? null,
        guests: session?.party_size ?? null,
        minutes,
        overtime,
        serverStaffId: session?.server_staff_id ?? null,
        orderDbId: session?.order_id ?? null,
      });
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
