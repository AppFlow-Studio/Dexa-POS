import type { FloorPlanObject, TableSession, TableStatus } from "@/types/db-floor-plan-types";
import { minutesSince } from "./format";
import { tableTileLabel, tableTitle } from "./tableName";
import { IN_USE_STATUSES } from "./tableStatus";

/** Everything a Tables row or a table page shows, as primitives. */
export interface TableSummary {
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
  /** Backend order id of the linked check, for the live total. */
  orderDbId: string | null;
  /** Trailing number in the name (Infinity when none), so sorts skip a collator. */
  sortKey: number;
}

function tableSortKey(name: string): number {
  const trailing = name.match(/(\d+)\s*$/);
  return trailing?.[1] ? Number(trailing[1]) : Number.POSITIVE_INFINITY;
}

/**
 * One table + its session → summary. Overtime is the register's rule
 * (useTableCardData): past the location's default sitting time, when set.
 */
export function summarizeTable(
  table: FloorPlanObject,
  session: TableSession | null,
  nameById: ReadonlyMap<string, string>,
  now: number,
  sittingLimit: number,
): TableSummary {
  const status: TableStatus = session?.status ?? "available";
  const inUse = IN_USE_STATUSES.has(status);
  const minutes = inUse ? minutesSince(session?.seated_at, now) : null;
  const mergedNames = (session?.merged_tables ?? [])
    .filter((id) => id !== table.id)
    .map((id) => nameById.get(id))
    .filter((n): n is string => !!n);
  return {
    id: table.id,
    title: tableTitle(table.name, mergedNames),
    tileLabel: tableTileLabel(table.name),
    status,
    capacity: table.capacity ?? null,
    guests: session?.party_size ?? null,
    minutes,
    overtime: sittingLimit > 0 && minutes !== null && minutes > sittingLimit,
    serverStaffId: session?.server_staff_id ?? null,
    orderDbId: session?.order_id ?? null,
    sortKey: tableSortKey(table.name),
  };
}
