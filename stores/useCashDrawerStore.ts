/**
 * Cash Drawer Store
 *
 * Manages cash drawer session state, operations, and running balance.
 * Works with cash_drawers, cash_drawer_sessions, and cash_drawer_operations tables.
 */

import { createLazyPersistStorage } from "@/lib/storage";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

// ============================================================================
// TYPES
// ============================================================================

export type DrawerOperationType =
  | "cash_sale"
  | "cash_refund"
  | "pay_in"
  | "pay_out"
  | "no_sale"
  | "cash_drop"
  | "opening_count"
  | "closing_count"
  | "tip_out";

export interface DenominationCount {
  denomination: string; // e.g., "100", "50", "20", "10", "5", "1", "0.25", "0.10", "0.05", "0.01"
  label: string; // e.g., "$100 Bills", "Quarters"
  count: number;
  total: number; // denomination * count
}

export interface DrawerOperation {
  id: string;
  operationType: DrawerOperationType;
  amount: number;
  balanceAfter: number;
  performedBy: string; // staff_profile_id
  performedAt: string; // ISO timestamp
  orderId?: string;
  paymentId?: string;
  reason?: string;
  approvedBy?: string; // staff_profile_id of manager who approved
  receiptPrinted?: boolean;
  requiresApproval?: boolean;
}

export interface DrawerSession {
  id: string;
  cashDrawerId: string;
  openedBy: string;
  openedAt: string;
  openingAmount: number;
  openingCountDetails?: DenominationCount[];
  expectedCash: number; // running expected based on operations
  status: "open" | "closing" | "closed";
  isBlindCount?: boolean;
}

// Operation type categorization helpers
const DEBIT_TYPES: DrawerOperationType[] = ["cash_refund", "pay_out", "cash_drop", "tip_out"];
const NO_EFFECT_TYPES: DrawerOperationType[] = ["no_sale", "opening_count", "closing_count"];

export function isDebitOperation(type: DrawerOperationType): boolean {
  return DEBIT_TYPES.includes(type);
}

export function isNoEffectOperation(type: DrawerOperationType): boolean {
  return NO_EFFECT_TYPES.includes(type);
}

// ============================================================================
// STATE INTERFACE
// ============================================================================

interface CashDrawerState {
  // Active session for this station's drawer
  activeSession: DrawerSession | null;
  operations: DrawerOperation[];
  isLoading: boolean;

  // Drawer config for this station
  drawerId: string | null;
  drawerName: string | null;

  // Post-clock-in prompt flag
  shouldPromptOpen: boolean;

  // Actions
  setDrawer: (drawerId: string, drawerName: string) => void;
  openSession: (session: DrawerSession) => void;
  closeSession: (closingAmount: number, closingCountDetails?: DenominationCount[], closedBy?: string) => void;
  recordOperation: (op: Omit<DrawerOperation, "balanceAfter">) => void;
  setOperations: (ops: DrawerOperation[]) => void;
  clearDrawer: () => void;
  setShouldPromptOpen: (value: boolean) => void;

  // Computed
  getRunningBalance: () => number;
  getVariance: (closingAmount: number) => number;
}

// ============================================================================
// STORE
// ============================================================================

export const useCashDrawerStore = create<CashDrawerState>()(
  persist(
    immer((set, get) => ({
      activeSession: null,
      operations: [],
      isLoading: false,
      drawerId: null,
      drawerName: null,
      shouldPromptOpen: false,

      setDrawer: (drawerId: string, drawerName: string) => {
        set({ drawerId, drawerName });
      },

      openSession: (session: DrawerSession) => {
        set({
          activeSession: session,
          operations: [],
        });
      },

      closeSession: (_closingAmount: number, _closingCountDetails?: DenominationCount[], _closedBy?: string) => {
        set((state) => {
          if (state.activeSession) {
            state.activeSession.status = "closed";
          }
        });
      },

      recordOperation: (op: Omit<DrawerOperation, "balanceAfter">) => {
        const currentBalance = get().getRunningBalance();
        // no_sale, opening_count, closing_count have no balance effect
        if (isNoEffectOperation(op.operationType)) {
          const fullOp: DrawerOperation = { ...op, balanceAfter: currentBalance };
          set((state) => { state.operations.push(fullOp); });
          return;
        }
        const effectiveAmount = isDebitOperation(op.operationType) ? -Math.abs(op.amount) : Math.abs(op.amount);
        const balanceAfter = currentBalance + effectiveAmount;

        const fullOp: DrawerOperation = {
          ...op,
          balanceAfter,
        };

        set((state) => {
          state.operations.push(fullOp);
          if (state.activeSession) {
            state.activeSession.expectedCash = balanceAfter;
          }
        });
      },

      setOperations: (ops: DrawerOperation[]) => {
        set({ operations: ops });
      },

      clearDrawer: () => {
        set({
          activeSession: null,
          operations: [],
          drawerId: null,
          drawerName: null,
          shouldPromptOpen: false,
        });
      },

      setShouldPromptOpen: (value: boolean) => {
        set({ shouldPromptOpen: value });
      },

      getRunningBalance: () => {
        const { activeSession, operations } = get();
        if (!activeSession) return 0;

        let balance = activeSession.openingAmount;
        for (const op of operations) {
          if (isNoEffectOperation(op.operationType)) continue;
          balance += isDebitOperation(op.operationType) ? -Math.abs(op.amount) : Math.abs(op.amount);
        }
        return balance;
      },

      getVariance: (closingAmount: number) => {
        const expected = get().getRunningBalance();
        return closingAmount - expected;
      },
    })),
    {
      name: "dexa-pos-cash-drawer",
      storage: createLazyPersistStorage(),
      partialize: (state) => ({
        activeSession: state.activeSession,
        drawerId: state.drawerId,
        drawerName: state.drawerName,
        // Persist operations so they survive app restart during an open session
        operations: state.operations,
      }),
    }
  )
);
