import { TableStatus } from "@/types/db-floor-plan-types";

/**
 * Table lifecycle events that trigger status transitions.
 */
export type TableEvent =
  | "SEAT_GUESTS"
  | "SEND_TO_KITCHEN"
  | "MARK_SERVED"
  | "PRESENT_CHECK"
  | "RECEIVE_PAYMENT"
  | "FULL_PAYMENT"
  | "CLEAR_TABLE"
  | "FINISH_CLEANING"
  | "VOID_ORDER"
  | "REOPEN_CHECK"
  | "BEGIN_SEATING"
  | "FINISH_SEATING"
  | "BEGIN_ORDERING"
  | "BEGIN_PAYING"
  | "BEGIN_CLOSING"
  | "CANCEL_INTERMEDIATE";

/** Local-only statuses that are never synced to the backend DB */
const LOCAL_ONLY_STATUSES: ReadonlySet<TableStatus> = new Set([
  "seating",
  "ordering",
  "paying",
  "closing",
]);

/** Statuses that represent an active dine-in session */
const ACTIVE_STATUSES: ReadonlySet<TableStatus> = new Set([
  "seating",
  "seated",
  "ordering",
  "ordered",
  "served",
  "check_presented",
  "paying",
]);

/**
 * Transition map: [currentStatus][event] -> nextStatus
 * Missing entries mean the transition is invalid.
 */
const TRANSITIONS: Partial<
  Record<TableStatus, Partial<Record<TableEvent, TableStatus>>>
> = {
  available: {
    SEAT_GUESTS: "seated",
    BEGIN_SEATING: "seating",
  },
  reserved: {
    SEAT_GUESTS: "seated",
    BEGIN_SEATING: "seating",
  },
  seating: {
    FINISH_SEATING: "seated",
    CANCEL_INTERMEDIATE: "available",
  },
  seated: {
    SEND_TO_KITCHEN: "ordered",
    VOID_ORDER: "cleaning",
    FULL_PAYMENT: "paid",
    PRESENT_CHECK: "check_presented",
    BEGIN_ORDERING: "ordering",
    BEGIN_PAYING: "paying",
    BEGIN_CLOSING: "closing",
  },
  ordering: {
    SEND_TO_KITCHEN: "ordered",
    CANCEL_INTERMEDIATE: "seated",
    BEGIN_CLOSING: "closing",
  },
  ordered: {
    SEND_TO_KITCHEN: "ordered",
    MARK_SERVED: "served",
    PRESENT_CHECK: "check_presented",
    VOID_ORDER: "cleaning",
    FULL_PAYMENT: "paid",
    BEGIN_PAYING: "paying",
    BEGIN_CLOSING: "closing",
  },
  served: {
    SEND_TO_KITCHEN: "ordered",
    PRESENT_CHECK: "check_presented",
    VOID_ORDER: "cleaning",
    FULL_PAYMENT: "paid",
    BEGIN_PAYING: "paying",
    BEGIN_CLOSING: "closing",
  },
  check_presented: {
    SEND_TO_KITCHEN: "ordered",
    RECEIVE_PAYMENT: "paid",
    FULL_PAYMENT: "paid",
    VOID_ORDER: "cleaning",
    REOPEN_CHECK: "check_presented",
    BEGIN_PAYING: "paying",
    BEGIN_CLOSING: "closing",
  },
  paying: {
    FULL_PAYMENT: "paid",
    RECEIVE_PAYMENT: "paid",
    CANCEL_INTERMEDIATE: "check_presented",
  },
  paid: {
    CLEAR_TABLE: "cleaning",
    REOPEN_CHECK: "check_presented",
    BEGIN_CLOSING: "closing",
  },
  closing: {
    CLEAR_TABLE: "cleaning",
    CANCEL_INTERMEDIATE: "seated",
  },
  cleaning: {
    FINISH_CLEANING: "available",
  },
};

/**
 * Pure function: compute next table status given current status and event.
 * Throws on invalid transitions so callers can handle gracefully.
 */
export function transitionTableStatus(
  current: TableStatus,
  event: TableEvent,
): TableStatus {
  const next = TRANSITIONS[current]?.[event];
  if (!next) {
    throw new Error(
      `Invalid table transition: "${current}" + ${event}. No valid next state.`,
    );
  }
  return next;
}

/**
 * Check if a transition is valid without throwing.
 */
export function canTransition(
  current: TableStatus,
  event: TableEvent,
): boolean {
  return TRANSITIONS[current]?.[event] !== undefined;
}

/**
 * Check if a table status represents an active session (guests present).
 */
export function isActiveSession(status: TableStatus): boolean {
  return ACTIVE_STATUSES.has(status);
}

/**
 * Check if a status is local-only (never synced to backend).
 */
export function isLocalOnlyStatus(status: TableStatus): boolean {
  return LOCAL_ONLY_STATUSES.has(status);
}

/**
 * Map a local-only status to the nearest backend-syncable status.
 * Returns the status unchanged if it's already syncable.
 */
export function resolveToSyncableStatus(status: TableStatus): TableStatus {
  switch (status) {
    case "seating":
      return "available";
    case "ordering":
      return "seated";
    case "paying":
      return "check_presented";
    case "closing":
      return "cleaning";
    default:
      return status;
  }
}
