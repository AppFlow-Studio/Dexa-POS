/**
 * SessionAction — discriminated union for all centralized table session actions.
 *
 * Each variant maps to a side effect (backend RPC, inventory, etc.) registered
 * in services/sessionEffects/. ACTION_TO_EVENT maps actions to the state machine
 * event used for optimistic transition (if any).
 */

import type { TableEvent } from "@/lib/tableStateMachine";

// ---------------------------------------------------------------------------
// SessionAction variants
// ---------------------------------------------------------------------------

export type SessionAction =
  | {
      type: "SEND_TO_KITCHEN";
      tableId: string;
      courseNumber: number;
      itemIds: string[];
      dbItemIds: string[];
      orderId: string;
      dbOrderId?: string;
      forceResend?: boolean;
    }
  | {
      type: "CLOSE_CHECK";
      tableId: string;
      orderId: string;
      dbOrderId: string;
    }
  | {
      type: "REOPEN_CHECK";
      tableId: string;
      orderId: string;
      dbOrderId: string;
      reason?: string;
    }
  | {
      type: "VOID_ORDER";
      tableId: string;
      orderId: string;
      dbOrderId?: string;
    }
  | {
      type: "CLEAR_TABLE";
      tableId: string;
      orderId?: string;
    }
  | { type: "MARK_SERVED"; tableId: string }
  | { type: "PRESENT_CHECK"; tableId: string }
  | { type: "FULL_PAYMENT"; tableId: string }
  | { type: "FINISH_CLEANING"; tableId: string }
  | { type: "BEGIN_PAYING"; tableId: string }
  | { type: "BEGIN_CLOSING"; tableId: string }
  | { type: "CANCEL_INTERMEDIATE"; tableId: string };

export type SessionActionType = SessionAction["type"];

// ---------------------------------------------------------------------------
// ACTION_TO_EVENT — maps action types to state machine TableEvents.
// Actions not listed here (e.g. CLOSE_CHECK) have no state machine event
// and skip the optimistic transition step.
// ---------------------------------------------------------------------------

export const ACTION_TO_EVENT: Partial<Record<SessionActionType, TableEvent>> = {
  SEND_TO_KITCHEN: "SEND_TO_KITCHEN",
  VOID_ORDER: "VOID_ORDER",
  CLEAR_TABLE: "CLEAR_TABLE",
  MARK_SERVED: "MARK_SERVED",
  PRESENT_CHECK: "PRESENT_CHECK",
  FULL_PAYMENT: "FULL_PAYMENT",
  FINISH_CLEANING: "FINISH_CLEANING",
  BEGIN_PAYING: "BEGIN_PAYING",
  BEGIN_CLOSING: "BEGIN_CLOSING",
  CANCEL_INTERMEDIATE: "CANCEL_INTERMEDIATE",
  REOPEN_CHECK: "REOPEN_CHECK",
  // CLOSE_CHECK intentionally omitted — no state transition
};
