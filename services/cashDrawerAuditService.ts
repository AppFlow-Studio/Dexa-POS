/**
 * Cash Drawer Audit Service
 *
 * Provides variance analysis, suspicious pattern detection, and
 * detailed no-sale audit data for the cash drawer system.
 */

import { DrawerOperation, isDebitOperation, isNoEffectOperation } from "@/stores/useCashDrawerStore";
import { SupabaseClient } from "@supabase/supabase-js";

// ============================================================================
// TYPES
// ============================================================================

export interface SessionSummary {
  sessionId: string;
  drawerName: string;
  openingAmount: number;
  closingAmount: number | null;
  expectedCash: number | null;
  variance: number | null;
  openedAt: string;
  closedAt: string | null;
  openedBy: string;
  closedBy: string | null;
  status: string;
  isBlindCount: boolean | null;
}

export interface TimelineOperation {
  id: string;
  operationType: string;
  amount: number;
  balanceAfter: number;
  performedBy: string;
  performedByName: string | null;
  performedAt: string;
  reason: string | null;
  approvedBy: string | null;
  orderId: string | null;
  paymentId: string | null;
  runningBalance: number;
}

export interface NoSaleEvent {
  id: string;
  performedBy: string;
  performedByName: string | null;
  performedAt: string;
  reason: string | null;
  approvedBy: string | null;
}

export interface SuspiciousPattern {
  flagType: "nosale_near_unexplained_payout" | "nosale_during_negative_variance";
  noSaleOpId: string;
  relatedOpId: string | null;
  timeGapSeconds: number;
  description: string;
}

export interface VarianceAnalysis {
  success: boolean;
  error?: string;
  sessionSummary: SessionSummary;
  operationsTimeline: TimelineOperation[];
  noSaleEvents: NoSaleEvent[];
  suspiciousPatterns: SuspiciousPattern[];
}

export interface NoSaleAuditEntry {
  performedBy: string;
  performedByName: string | null;
  noSaleCount: number;
  events: Array<{
    id: string;
    performedAt: string;
    reason: string | null;
    approvedBy: string | null;
    sessionId: string;
  }>;
}

// ============================================================================
// RPC-BACKED FUNCTIONS
// ============================================================================

/**
 * Fetch deep variance analysis for a specific session.
 * Calls the get_session_variance_analysis RPC.
 */
export async function fetchSessionVarianceAnalysis(
  supabase: SupabaseClient,
  sessionId: string
): Promise<VarianceAnalysis | null> {
  const { data, error } = await supabase.rpc("get_session_variance_analysis", {
    p_session_id: sessionId,
  });

  if (error) {
    console.error("[CashDrawerAudit] variance analysis RPC failed:", error.message);
    return null;
  }

  if (!data?.success) {
    console.warn("[CashDrawerAudit] variance analysis returned:", data?.error);
    return null;
  }

  const summary = data.session_summary;
  return {
    success: true,
    sessionSummary: {
      sessionId: summary.session_id,
      drawerName: summary.drawer_name,
      openingAmount: Number(summary.opening_amount),
      closingAmount: summary.closing_amount != null ? Number(summary.closing_amount) : null,
      expectedCash: summary.expected_cash != null ? Number(summary.expected_cash) : null,
      variance: summary.variance != null ? Number(summary.variance) : null,
      openedAt: summary.opened_at,
      closedAt: summary.closed_at,
      openedBy: summary.opened_by,
      closedBy: summary.closed_by,
      status: summary.status,
      isBlindCount: summary.is_blind_count,
    },
    operationsTimeline: (data.operations_timeline || []).map((op: any) => ({
      id: op.id,
      operationType: op.operation_type,
      amount: Number(op.amount),
      balanceAfter: Number(op.balance_after),
      performedBy: op.performed_by,
      performedByName: op.performed_by_name,
      performedAt: op.performed_at,
      reason: op.reason,
      approvedBy: op.approved_by,
      orderId: op.order_id,
      paymentId: op.payment_id,
      runningBalance: Number(op.running_balance),
    })),
    noSaleEvents: (data.no_sale_events || []).map((ev: any) => ({
      id: ev.id,
      performedBy: ev.performed_by,
      performedByName: ev.performed_by_name,
      performedAt: ev.performed_at,
      reason: ev.reason,
      approvedBy: ev.approved_by,
    })),
    suspiciousPatterns: (data.suspicious_patterns || []).map((sp: any) => ({
      flagType: sp.flag_type,
      noSaleOpId: sp.no_sale_op_id,
      relatedOpId: sp.related_op_id,
      timeGapSeconds: Number(sp.time_gap_seconds),
      description: sp.description,
    })),
  };
}

/**
 * Fetch the enhanced EOD cash summary with detailed no-sale audit.
 */
export async function fetchDetailedNoSaleAudit(
  supabase: SupabaseClient,
  locationId: string,
  businessDate?: string
): Promise<NoSaleAuditEntry[]> {
  const params: Record<string, any> = { p_location_id: locationId };
  if (businessDate) params.p_business_date = businessDate;

  const { data, error } = await supabase.rpc("get_eod_cash_summary", params);

  if (error || !data) {
    console.error("[CashDrawerAudit] EOD summary RPC failed:", error?.message);
    return [];
  }

  return (data.no_sale_audit || []).map((entry: any) => ({
    performedBy: entry.performed_by,
    performedByName: entry.performed_by_name || null,
    noSaleCount: Number(entry.no_sale_count),
    events: (entry.events || []).map((ev: any) => ({
      id: ev.id,
      performedAt: ev.performed_at,
      reason: ev.reason,
      approvedBy: ev.approved_by,
      sessionId: ev.session_id,
    })),
  }));
}

// ============================================================================
// LOCAL (OFFLINE) ANALYSIS
// ============================================================================

const SUSPICIOUS_WINDOW_SECONDS = 1800; // 30 minutes

/**
 * Pure function for real-time local variance analysis.
 * Uses the in-store operations array to detect suspicious patterns
 * without calling the backend. Useful during the close flow before
 * the session is actually closed.
 */
export function computeLocalVarianceFlags(
  operations: DrawerOperation[],
  variance: number
): SuspiciousPattern[] {
  const flags: SuspiciousPattern[] = [];

  const noSaleOps = operations.filter(op => op.operationType === "no_sale");
  const payoutOps = operations.filter(
    op => op.operationType === "pay_out" || op.operationType === "cash_drop"
  );

  for (const nosale of noSaleOps) {
    const nosaleTime = new Date(nosale.performedAt).getTime();

    // Check for unexplained pay_outs/cash_drops within +/- 30 min
    for (const payout of payoutOps) {
      const payoutTime = new Date(payout.performedAt).getTime();
      const gapSeconds = (payoutTime - nosaleTime) / 1000;

      if (
        Math.abs(gapSeconds) <= SUSPICIOUS_WINDOW_SECONDS &&
        (!payout.reason || payout.reason.trim() === "")
      ) {
        flags.push({
          flagType: "nosale_near_unexplained_payout",
          noSaleOpId: nosale.id,
          relatedOpId: payout.id,
          timeGapSeconds: gapSeconds,
          description: `No-sale at ${formatTime(nosale.performedAt)} near unexplained ${payout.operationType} of $${payout.amount.toFixed(2)} at ${formatTime(payout.performedAt)}`,
        });
      }
    }

    // Flag: negative variance + no-sale with no nearby documented expense
    if (variance < 0) {
      const hasNearbyPayout = payoutOps.some(payout => {
        const payoutTime = new Date(payout.performedAt).getTime();
        const gapSec = Math.abs(payoutTime - nosaleTime) / 1000;
        return gapSec <= SUSPICIOUS_WINDOW_SECONDS;
      });

      if (!hasNearbyPayout) {
        flags.push({
          flagType: "nosale_during_negative_variance",
          noSaleOpId: nosale.id,
          relatedOpId: null,
          timeGapSeconds: 0,
          description: `No-sale at ${formatTime(nosale.performedAt)} during session with $${Math.abs(variance).toFixed(2)} variance — no logged expense nearby`,
        });
      }
    }
  }

  return flags;
}

/**
 * Compute a running balance timeline from local operations.
 * Used by the variance detail panel during the close flow.
 */
export function computeLocalTimeline(
  operations: DrawerOperation[],
  openingAmount: number
): Array<DrawerOperation & { runningBalance: number }> {
  let running = openingAmount;

  return operations.map(op => {
    if (!isNoEffectOperation(op.operationType)) {
      running += isDebitOperation(op.operationType) ? -Math.abs(op.amount) : Math.abs(op.amount);
    }
    return { ...op, runningBalance: running };
  });
}

// ============================================================================
// HELPERS
// ============================================================================

function formatTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return isoString;
  }
}
