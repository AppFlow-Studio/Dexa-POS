import type { TableStatus } from "@/types/db-floor-plan-types";
import { neutralTint, TABLE_TINT, type Tint } from "./tokens";

/** Statuses that count a table as occupied in the header summary. */
export const IN_USE_STATUSES: ReadonlySet<TableStatus> = new Set<TableStatus>([
  "seating",
  "seated",
  "ordering",
  "ordered",
  "served",
  "check_presented",
  "paying",
  "paid",
  "closing",
]);

/** Same ordering TablesPanel uses for its "status" sort; unknowns sink. */
const STATUS_ORDER: Partial<Record<TableStatus, number>> = {
  ordered: 0,
  ordering: 0,
  seated: 1,
  seating: 1,
  served: 2,
  check_presented: 3,
  paying: 3,
  paid: 4,
  closing: 4,
  cleaning: 5,
  available: 6,
  reserved: 7,
  blocked: 8,
  not_in_service: 9,
};

export function tableStatusRank(status: TableStatus): number {
  return STATUS_ORDER[status] ?? 99;
}

const STATUS_LABEL: Record<TableStatus, string> = {
  available: "Available",
  reserved: "Reserved",
  seating: "Seating",
  seated: "Seated",
  ordering: "Ordering",
  ordered: "Ordered",
  served: "Served",
  check_presented: "Check presented",
  paying: "Paying",
  paid: "Paid",
  closing: "Closing",
  cleaning: "Cleaning",
  blocked: "Blocked",
  not_in_service: "Not in service",
};

export function tableStatusLabel(status: TableStatus): string {
  return STATUS_LABEL[status] ?? status;
}

/** The artifact's six table tints, keyed by status; overtime wins. */
export function tableTint(status: TableStatus, overtime: boolean): Tint {
  if (overtime) return TABLE_TINT.over;
  switch (status) {
    case "available":
      return TABLE_TINT.available;
    case "reserved":
    case "seating":
    case "seated":
      return TABLE_TINT.seated;
    case "ordering":
    case "ordered":
    case "served":
      return TABLE_TINT.ordered;
    case "check_presented":
    case "paying":
      return TABLE_TINT.check;
    case "paid":
    case "closing":
      return TABLE_TINT.paid;
    default:
      return neutralTint();
  }
}

/**
 * "Needs you": the artifact pins these above the section. Check presented,
 * anything the backend flagged, and overtime (past the location's default
 * sitting time, the same rule useTableCardData applies on the register).
 */
export function tableNeedsYou(
  status: TableStatus,
  flagged: boolean,
  overtime: boolean,
): boolean {
  return flagged || overtime || status === "check_presented";
}
