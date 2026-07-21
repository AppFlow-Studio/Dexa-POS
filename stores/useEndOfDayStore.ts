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

export type EndOfDayStepId =
  | "intro"
  | "overview"
  | "floor_orders"
  | "cash_drawers"
  | "tips"
  | "staff"
  | "payments"
  | "report";

export interface EndOfDayStepDefinition {
  id: EndOfDayStepId;
  title: string;
  subtitle: string;
  requiredChecklistItems: ChecklistItemId[];
  canSkip?: boolean;
}

export type EodPhase = "wizard" | "summary" | "settlement_pending";

export const EOD_STEPS: EndOfDayStepDefinition[] = [
  {
    id: "intro",
    title: "End of Day Close Out",
    subtitle: "Review required items and confirm your location is ready for the day to close.",
    requiredChecklistItems: [],
  },
  {
    id: "overview",
    title: "Overview",
    subtitle: "Re-check all required sections, review blockers, and jump to pending tasks.",
    requiredChecklistItems: [],
  },
  {
    id: "floor_orders",
    title: "Floor & Orders",
    subtitle: "Clear active tables and ensure unpaid orders are fully settled.",
    requiredChecklistItems: ["tables_clear", "orders_closed"],
  },
  {
    id: "cash_drawers",
    title: "Cash Drawers",
    subtitle: "Reconcile open cash drawers and close for the day.",
    requiredChecklistItems: ["cash_drawer_closed"],
  },
  {
    id: "tips",
    title: "Tips",
    subtitle: "Review tip distribution status and run the tip workflow.",
    requiredChecklistItems: ["tips_distributed"],
  },
  {
    id: "staff",
    title: "Staff",
    subtitle: "Verify every active shift is clocked out before closing.",
    requiredChecklistItems: ["shifts_reviewed"],
  },
  {
    id: "payments",
    title: "Payments & Settlement Prep",
    subtitle: "Review card/cash split and prepare settlement and batch capture.",
    requiredChecklistItems: [],
    canSkip: true,
  },
  {
    id: "report",
    title: "Report & Close",
    subtitle: "Generate daily report and finalize close out.",
    requiredChecklistItems: ["report_generated"],
  },
];

export const DEFAULT_EOD_PHASE: EodPhase = "wizard";

export interface NoSaleEventDetail {
  id: string;
  performedAt: string;
  performedBy: string;
  performedByName?: string;
  reason: string | null;
  approvedBy: string | null;
}

export interface DrawerBreakdownItem {
  drawerName: string;
  sessionId?: string;
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
  noSaleEvents?: NoSaleEventDetail[];
  suspiciousPatterns?: Array<{
    flagType: string;
    description: string;
    noSaleOpId: string;
    relatedOpId: string | null;
    timeGapSeconds: number;
  }>;
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
  // Highlights
  topItem?: { name: string; quantity: number; revenue: number } | null;
  topServer?: { name: string; revenue: number; orderCount: number } | null;
  busyHour?: { hour: number; orderCount: number } | null;
}

export interface OpenOrderSummary {
  id: string;           // db order id
  table_number: string | null;
  order_type: string | null;
  grand_total: number;
  payment_status: string;
  check_status: string | null;
  created_at: string;
}

// ============================================================================
// STATE
// ============================================================================

interface EndOfDayState {
  // Checklist
  checklist: ChecklistItem[];
  currentStep: number;
  isRunning: boolean;

  // Open orders (for Floor & Orders step)
  openOrders: OpenOrderSummary[];

  // Summary
  dailySummary: DailySummary | null;
  summaryLoading: boolean;
  eodPhase: EodPhase;
  completionOverrideReason: string | null;
  completionOverrideAt: string | null;

  // Actions
  initChecklist: () => void;
  updateChecklistItem: (id: ChecklistItemId, status: ChecklistStatus, detail?: string) => void;
  setCurrentStep: (step: number) => void;
  setIsRunning: (running: boolean) => void;
  setOpenOrders: (orders: OpenOrderSummary[]) => void;
  setDailySummary: (summary: DailySummary) => void;
  setSummaryLoading: (loading: boolean) => void;
  setEodPhase: (phase: EodPhase) => void;
  setCompletionOverride: (reason?: string | null) => void;
  clearCompletionOverride: () => void;
  reset: () => void;

  // Computed
  isComplete: () => boolean;
  passedCount: () => number;
  canAdvanceFromStep: (stepIndex: number) => boolean;
  canAdvance: () => boolean;
  getBlockingItems: (options?: {
    stepIndex?: number;
    includePending?: boolean;
  }) => ChecklistItem[];
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

const isResolvedStatus = (status: ChecklistStatus) =>
  status === "passed" || status === "skipped";

// ============================================================================
// STORE
// ============================================================================

export const useEndOfDayStore = create<EndOfDayState>()(
  immer((set, get) => ({
    checklist: [...DEFAULT_CHECKLIST],
    currentStep: 0,
    isRunning: false,
    openOrders: [],
    dailySummary: null,
    summaryLoading: false,
    eodPhase: DEFAULT_EOD_PHASE,
    completionOverrideReason: null,
    completionOverrideAt: null,

    initChecklist: () => {
      set({
        checklist: DEFAULT_CHECKLIST.map((item) => ({ ...item, status: "pending" as ChecklistStatus, detail: undefined })),
        currentStep: 0,
        isRunning: true,
        openOrders: [],
        eodPhase: "wizard",
        completionOverrideReason: null,
        completionOverrideAt: null,
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
    setOpenOrders: (orders) => set({ openOrders: orders }),
    setDailySummary: (summary) => set({ dailySummary: summary }),
    setSummaryLoading: (loading) => set({ summaryLoading: loading }),
    setEodPhase: (phase) => set({ eodPhase: phase }),
    setCompletionOverride: (reason) =>
      set({
        completionOverrideReason: reason || "Completed with unresolved blockers",
        completionOverrideAt: new Date().toISOString(),
      }),
    clearCompletionOverride: () =>
      set({
        completionOverrideReason: null,
        completionOverrideAt: null,
      }),

    reset: () =>
      set({
        checklist: DEFAULT_CHECKLIST.map((item) => ({ ...item, status: "pending" as ChecklistStatus, detail: undefined })),
        currentStep: 0,
        isRunning: false,
        openOrders: [],
        dailySummary: null,
        eodPhase: DEFAULT_EOD_PHASE,
        completionOverrideReason: null,
        completionOverrideAt: null,
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

    canAdvanceFromStep: (stepIndex) => {
      const step = EOD_STEPS[stepIndex];
      if (!step) {
        return false;
      }

      if (step.requiredChecklistItems.length === 0) {
        return true;
      }

      const { checklist, completionOverrideReason } = get();
      if (completionOverrideReason) {
        // allow manual override from any step
        return true;
      }

      return step.requiredChecklistItems.every((requiredId) => {
        const item = checklist.find((it) => it.id === requiredId);
        return !!item && isResolvedStatus(item.status);
      });
    },

    canAdvance: () => {
      const { currentStep } = get();
      return get().canAdvanceFromStep(currentStep);
    },

    getBlockingItems: (options) => {
      const { checklist, completionOverrideReason } = get();
      if (completionOverrideReason) {
        return [];
      }

      const step = options?.stepIndex !== undefined ? EOD_STEPS[options.stepIndex] : undefined;
      const requiredIds = new Set(
        step ? step.requiredChecklistItems : checklist.map((i) => i.id)
      );
      const allowPending = options?.includePending === true;

      return checklist.filter((item) => {
        if (!requiredIds.has(item.id)) {
          return false;
        }

        if (isResolvedStatus(item.status)) {
          return false;
        }

        if (item.status === "pending" && !allowPending) {
          return false;
        }

        return true;
      });
    },
  }))
);
