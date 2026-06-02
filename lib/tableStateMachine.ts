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

/** Context passed to guard functions for precondition checks */
export interface TransitionContext {
  order?: {
    paid_status?: string;
    items?: { id: string }[];
    order_status?: string;
  };
  session?: {
    id?: string;
    status?: TableStatus;
  };
  tableId?: string;
  stationId?: string;
}

/** Audit entry for transition logging */
export interface TransitionAuditEntry {
  from: TableStatus;
  to: TableStatus;
  event: TableEvent;
  timestamp: string;
  tableId?: string;
  stationId?: string;
  guardPassed: boolean;
}

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

// ============================================================================
// TRANSITION GUARDS
// ============================================================================

type GuardFn = (ctx: TransitionContext) => boolean;

const TRANSITION_GUARDS: Partial<Record<TableEvent, GuardFn>> = {
  SEND_TO_KITCHEN: (ctx) => (ctx.order?.items?.length ?? 0) > 0,
  FULL_PAYMENT: (ctx) =>
    ctx.order?.paid_status === "Paid" ||
    ctx.order?.paid_status === "PartiallyPaid",
  CLEAR_TABLE: (ctx) => ctx.session?.status !== "seating",
};

// ============================================================================
// AUDIT TRAIL (circular buffer)
// ============================================================================

const AUDIT_BUFFER_SIZE = 200;
let auditBuffer: TransitionAuditEntry[] = [];
let auditWriteIndex = 0;
let auditCount = 0;

function recordAudit(entry: TransitionAuditEntry): void {
  if (auditBuffer.length < AUDIT_BUFFER_SIZE) {
    auditBuffer.push(entry);
  } else {
    auditBuffer[auditWriteIndex] = entry;
  }
  auditWriteIndex = (auditWriteIndex + 1) % AUDIT_BUFFER_SIZE;
  auditCount++;
}

/**
 * Get recent transition audit entries (most recent last).
 */
export function getTransitionAuditLog(
  maxCount: number = AUDIT_BUFFER_SIZE,
): TransitionAuditEntry[] {
  const total = Math.min(auditCount, AUDIT_BUFFER_SIZE);
  const requested = Math.min(maxCount, total);

  if (total < AUDIT_BUFFER_SIZE) {
    return auditBuffer.slice(Math.max(0, total - requested));
  }
  const result: TransitionAuditEntry[] = [];
  const startIdx =
    (auditWriteIndex - requested + AUDIT_BUFFER_SIZE) % AUDIT_BUFFER_SIZE;
  for (let i = 0; i < requested; i++) {
    result.push(auditBuffer[(startIdx + i) % AUDIT_BUFFER_SIZE]);
  }
  return result;
}

// ============================================================================
// STUCK-STATE WATCHDOG
// ============================================================================

const STUCK_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

export interface StuckSession {
  tableId: string;
  status: TableStatus;
  resolvedStatus: TableStatus;
  stuckSinceMs: number;
}

/**
 * Detect tables stuck in local-only statuses beyond the threshold.
 * Returns sessions that should be auto-recovered.
 */
export function detectStuckSessions(
  sessions: Record<string, { status: TableStatus; updatedAt?: string }>,
): StuckSession[] {
  const now = Date.now();
  const stuck: StuckSession[] = [];

  for (const [tableId, session] of Object.entries(sessions)) {
    if (!isLocalOnlyStatus(session.status)) continue;
    const updatedAt = session.updatedAt
      ? new Date(session.updatedAt).getTime()
      : 0;
    const elapsed = now - updatedAt;
    if (elapsed > STUCK_THRESHOLD_MS) {
      stuck.push({
        tableId,
        status: session.status,
        resolvedStatus: resolveToSyncableStatus(session.status),
        stuckSinceMs: elapsed,
      });
    }
  }
  return stuck;
}

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
    CLEAR_TABLE: "cleaning",
    FULL_PAYMENT: "paid",
    BEGIN_PAYING: "paying",
    BEGIN_CLOSING: "closing",
  },
  check_presented: {
    SEND_TO_KITCHEN: "ordered",
    RECEIVE_PAYMENT: "paid",
    FULL_PAYMENT: "paid",
    VOID_ORDER: "cleaning",
    CLEAR_TABLE: "cleaning",
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
 *
 * When a TransitionContext is provided, guard functions are evaluated
 * and the transition is recorded in the audit trail.
 */
export function transitionTableStatus(
  current: TableStatus,
  event: TableEvent,
  ctx?: TransitionContext,
): TableStatus {
  const next = TRANSITIONS[current]?.[event];
  if (!next) {
    if (ctx) {
      recordAudit({
        from: current,
        to: current,
        event,
        timestamp: new Date().toISOString(),
        tableId: ctx.tableId,
        stationId: ctx.stationId,
        guardPassed: false,
      });
    }
    throw new Error(
      `Invalid table transition: "${current}" + ${event}. No valid next state.`,
    );
  }

  // Evaluate guard if context provided
  let guardPassed = true;
  if (ctx) {
    const guard = TRANSITION_GUARDS[event];
    if (guard) {
      guardPassed = guard(ctx);
      if (!guardPassed) {
        recordAudit({
          from: current,
          to: current,
          event,
          timestamp: new Date().toISOString(),
          tableId: ctx.tableId,
          stationId: ctx.stationId,
          guardPassed: false,
        });
        throw new Error(
          `Transition guard failed: "${current}" + ${event}. Precondition not met.`,
        );
      }
    }

    recordAudit({
      from: current,
      to: next,
      event,
      timestamp: new Date().toISOString(),
      tableId: ctx.tableId,
      stationId: ctx.stationId,
      guardPassed: true,
    });
  }

  return next;
}

/**
 * Check if a transition is valid without throwing.
 * Optionally evaluates guard functions if context provided.
 */
export function canTransition(
  current: TableStatus,
  event: TableEvent,
  ctx?: TransitionContext,
): boolean {
  if (TRANSITIONS[current]?.[event] === undefined) return false;
  if (ctx) {
    const guard = TRANSITION_GUARDS[event];
    if (guard && !guard(ctx)) return false;
  }
  return true;
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
