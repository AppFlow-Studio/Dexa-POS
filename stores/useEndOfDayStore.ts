/**
 * End-of-Day Store
 *
 * Tracks the EOD checklist status and daily summary data.
 * Orchestrates the guided closing workflow.
 */

import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

// ============================================================================
// TYPES
// ============================================================================

export type ChecklistItemId =
  | "tables_clear"
  | "orders_closed"
  | "cash_drawer_closed"
  | "tips_distributed"
  | "shifts_reviewed"
  | "report_generated";

export type ChecklistStatus = "pending" | "in_progress" | "passed" | "failed" | "skipped";

export interface ChecklistItem {
  id: ChecklistItemId;
  label: string;
  description: string;
  status: ChecklistStatus;
  detail?: string; // e.g., "2 tables still active"
}

export interface DrawerBreakdownItem {
  drawerName: string;
  opening: number;
  closing: number;
  expected: number;
  variance: number;
  cashSales: number;
  refunds: number;
  payIns: number;
  payOuts: number;
  cashDrops: number;
  noSaleCount: number;
}

export interface DailySummary {
  date: string;
  // Sales
  totalSales: number;
  totalOrders: number;
  averageOrderValue: number;
  // Payments
  cardTotal: number;
  cashTotal: number;
  otherTotal: number;
  totalTips: number;
  // Labor
  totalLaborHours: number;
  totalLaborCost: number;
  staffCount: number;
  // Cash drawer
  drawerOpening: number;
  drawerClosing: number;
  drawerVariance: number;
  drawerBreakdown?: DrawerBreakdownItem[];
  // Voids & Discounts
  totalVoids: number;
  totalDiscounts: number;
  totalRefunds: number;
}

// ============================================================================
// STATE
// ============================================================================

interface EndOfDayState {
  // Checklist
  checklist: ChecklistItem[];
  currentStep: number;
  isRunning: boolean;

  // Summary
  dailySummary: DailySummary | null;
  summaryLoading: boolean;

  // Actions
  initChecklist: () => void;
  updateChecklistItem: (id: ChecklistItemId, status: ChecklistStatus, detail?: string) => void;
  setCurrentStep: (step: number) => void;
  setIsRunning: (running: boolean) => void;
  setDailySummary: (summary: DailySummary) => void;
  setSummaryLoading: (loading: boolean) => void;
  reset: () => void;

  // Computed
  isComplete: () => boolean;
  passedCount: () => number;
}

const DEFAULT_CHECKLIST: ChecklistItem[] = [
  {
    id: "tables_clear",
    label: "All Tables Clear",
    description: "Verify no active table sessions remain",
    status: "pending",
  },
  {
    id: "orders_closed",
    label: "All Orders Closed",
    description: "Verify no unpaid orders remain",
    status: "pending",
  },
  {
    id: "cash_drawer_closed",
    label: "Cash Drawer Closed",
    description: "Close and reconcile the cash drawer",
    status: "pending",
  },
  {
    id: "tips_distributed",
    label: "Tips Distributed",
    description: "Run tip distribution and get approval",
    status: "pending",
  },
  {
    id: "shifts_reviewed",
    label: "Shifts Reviewed",
    description: "Verify all staff clocked out or confirmed",
    status: "pending",
  },
  {
    id: "report_generated",
    label: "Daily Report",
    description: "Generate and review end-of-day report",
    status: "pending",
  },
];

// ============================================================================
// STORE
// ============================================================================

export const useEndOfDayStore = create<EndOfDayState>()(
  immer((set, get) => ({
    checklist: [...DEFAULT_CHECKLIST],
    currentStep: 0,
    isRunning: false,
    dailySummary: null,
    summaryLoading: false,

    initChecklist: () => {
      set({
        checklist: DEFAULT_CHECKLIST.map((item) => ({ ...item, status: "pending" as ChecklistStatus, detail: undefined })),
        currentStep: 0,
        isRunning: true,
      });
    },

    updateChecklistItem: (id, status, detail) => {
      set((state) => {
        const item = state.checklist.find((i) => i.id === id);
        if (item) {
          item.status = status;
          item.detail = detail;
        }
      });
    },

    setCurrentStep: (step) => set({ currentStep: step }),
    setIsRunning: (running) => set({ isRunning: running }),
    setDailySummary: (summary) => set({ dailySummary: summary }),
    setSummaryLoading: (loading) => set({ summaryLoading: loading }),

    reset: () =>
      set({
        checklist: DEFAULT_CHECKLIST.map((item) => ({ ...item, status: "pending" as ChecklistStatus, detail: undefined })),
        currentStep: 0,
        isRunning: false,
        dailySummary: null,
      }),

    isComplete: () => {
      const { checklist } = get();
      return checklist.every(
        (item) => item.status === "passed" || item.status === "skipped"
      );
    },

    passedCount: () => {
      const { checklist } = get();
      return checklist.filter(
        (item) => item.status === "passed" || item.status === "skipped"
      ).length;
    },
  }))
);
