// ============================================================
// Settlement Service
// File: services/settlementService.ts
// ============================================================
// Orchestrates Castles terminal batch settlement:
// 1. Connect to terminal
// 2. Send settlement command
// 3. Persist results to DB (settle_castles_batch RPC)
// 4. Reset transaction counter
// ============================================================

import { SupabaseClient } from "@supabase/supabase-js";
import { getSharedCastlesService } from "@/services/terminals/castles-service";
import { getOrCreateCounter } from "@/services/terminals/castles-txn-counter";
import type { CastlesSettlementResult, CastlesSettlementHostResult } from "@/types/castles";
import { CASTLES_DEFAULT_PORT } from "@/types/castles";

// ── Types ─────────────────────────────────────────────────────────

export interface SettlementInput {
  terminalId: string;
  terminalHost: string;
  terminalPort?: number;
  locationId: string;
  businessDate: string; // YYYY-MM-DD
  supabase: SupabaseClient;
  onStatus?: (message: string) => void;
}

export interface SettlementOutput {
  success: boolean;
  partialSuccess: boolean;
  hosts: CastlesSettlementHostResult[];
  batchUuid?: string;
  paymentsUpdated?: number;
  dbWriteFailed?: boolean;
  error?: string;
}

// ── Service ───────────────────────────────────────────────────────

export async function runSettlement(input: SettlementInput): Promise<SettlementOutput> {
  const {
    terminalId,
    terminalHost,
    terminalPort = CASTLES_DEFAULT_PORT,
    locationId,
    businessDate,
    supabase,
    onStatus,
  } = input;

  // 1. Connect
  onStatus?.("Connecting to terminal...");
  const service = getSharedCastlesService();
  await service.connect({
    host: terminalHost,
    port: terminalPort,
    timeout: 300_000,
    terminalId,
  });

  // Register status callback for terminal messages
  const prevCallback = service["_onStatusNotification"];
  service.setOnStatusNotification((n) => {
    onStatus?.(n.txnStatusMessage ?? n.txnStatus ?? "Processing...");
  });

  // 2. Get reference ID
  const counter = getOrCreateCounter({ terminalId, supabaseClient: supabase });
  if (!counter.isInitialized) await counter.initialize();
  const referenceId = counter.next();

  // 3. Send settlement command
  onStatus?.("Settling batch — this may take a few minutes...");
  let terminalResult: CastlesSettlementResult;
  try {
    terminalResult = await service.processSettlement({ referenceId });
  } finally {
    // Restore previous callback
    service.setOnStatusNotification(prevCallback);
  }

  if (!terminalResult.success && !terminalResult.partialSuccess) {
    return {
      success: false,
      partialSuccess: false,
      hosts: terminalResult.hosts,
      error: terminalResult.error,
    };
  }

  // 4. Persist to DB
  onStatus?.("Saving settlement results...");
  let batchUuid: string | undefined;
  let paymentsUpdated: number | undefined;
  let dbWriteFailed = false;

  try {
    // Aggregate totals from host results
    const totals = terminalResult.hosts.reduce(
      (acc, h) => {
        if (h.success) {
          acc.salesCount += h.saleTotalCount;
          acc.refundCount += h.refundTotalCount;
          acc.grossAmount += h.saleTotalAmount;
          acc.refundAmount += h.refundTotalAmount;
          acc.tipAmount += 0; // Tip is embedded in sale totals
          acc.netDeposit += h.settleTotalAmount;
        }
        return acc;
      },
      { salesCount: 0, refundCount: 0, grossAmount: 0, refundAmount: 0, tipAmount: 0, netDeposit: 0 },
    );

    // Find first batch number from hosts
    const batchNumber = terminalResult.hosts.find((h) => h.batchNumber)?.batchNumber;

    const { data, error } = await supabase.rpc("settle_castles_batch", {
      p_location_id: locationId,
      p_terminal_id: terminalId,
      p_business_date: businessDate,
      p_batch_id: batchNumber ?? null,
      p_raw_response: terminalResult.raw ?? null,
      p_sales_count: totals.salesCount,
      p_refund_count: totals.refundCount,
      p_gross_amount: totals.grossAmount,
      p_refund_amount: totals.refundAmount,
      p_tip_amount: totals.tipAmount,
      p_net_deposit: totals.netDeposit,
    });

    if (error) {
      console.error("[SettlementService] RPC settle_castles_batch failed:", error);
      dbWriteFailed = true;
    } else {
      batchUuid = data?.batch_uuid;
      paymentsUpdated = data?.payments_updated;
    }

    // 5. Reset transaction counter
    if (!dbWriteFailed) {
      onStatus?.("Resetting transaction counter...");
      await counter.resetOnSettlement(batchNumber ?? undefined).catch((err) => {
        console.warn("[SettlementService] Counter reset failed:", err);
      });
    }
  } catch (err) {
    console.error("[SettlementService] DB write error:", err);
    dbWriteFailed = true;
  }

  return {
    success: terminalResult.success,
    partialSuccess: terminalResult.partialSuccess,
    hosts: terminalResult.hosts,
    batchUuid,
    paymentsUpdated,
    dbWriteFailed,
    error: dbWriteFailed
      ? "Settlement succeeded on terminal but failed to save to database. Retry the DB sync from settings."
      : undefined,
  };
}

// ── Query: unsettled payment stats ────────────────────────────────

export interface UnsettledStats {
  count: number;
  totalAmount: number;
}

export async function getUnsettledPaymentStats(
  supabase: SupabaseClient,
  terminalId: string,
): Promise<UnsettledStats> {
  const { data, error } = await supabase
    .from("order_payments")
    .select("amount, tip_amount")
    .eq("terminal_id", terminalId)
    .in("status", ["captured", "refunded", "partially_refunded"])
    .or("is_settled.is.null,is_settled.eq.false");

  if (error) {
    console.error("[SettlementService] getUnsettledPaymentStats failed:", error);
    return { count: 0, totalAmount: 0 };
  }

  const count = data?.length ?? 0;
  const totalAmount = (data ?? []).reduce(
    (sum, p) => sum + (p.amount ?? 0) + (p.tip_amount ?? 0),
    0,
  );

  return { count, totalAmount };
}
