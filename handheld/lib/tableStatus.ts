import { colors } from "@/lib/theme";
import type { TableStatus } from "@/types/db-floor-plan-types";

/** Statuses that count a table as occupied in the header summary. */
export const ACTIVE_TABLE_STATUSES: ReadonlySet<TableStatus> = new Set<TableStatus>([
  "seating",
  "seated",
  "ordering",
  "ordered",
  "served",
  "check_presented",
  "paying",
  "paid",
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

/** Theme colour for the status dot; resolved lazily because `colors` is theme-aware. */
export function tableStatusColor(status: TableStatus): string {
  switch (status) {
    case "available":
      return colors.tableAvailable;
    case "seating":
      return colors.tableSeating;
    case "seated":
      return colors.tableSeated;
    case "ordering":
      return colors.tableOrdering;
    case "ordered":
      return colors.tableOrdered;
    case "served":
      return colors.tableServed;
    case "check_presented":
      return colors.tableCheckPresented;
    case "paying":
      return colors.tablePaying;
    case "paid":
      return colors.tablePaid;
    case "closing":
      return colors.tableClosing;
    case "cleaning":
      return colors.tableCleaning;
    case "blocked":
    case "not_in_service":
      return colors.tableNotInService;
    case "reserved":
      return colors.tableInUse;
    default:
      return colors.muted;
  }
}
