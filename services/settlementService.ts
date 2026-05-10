// ============================================================
// Settlement Service
// File: services/settlementService.ts
// ============================================================

import { captureRpcError } from "@/lib/supabase";
import { addPendingFinalize } from "@/services/pendingFinalize";
import { getSharedCastlesService } from "@/services/terminals/castles-service";
import type {
    CastlesSettlementHostResult,
    CastlesSettlementResult,
} from "@/types/castles";
import {
    CASTLES_CLIENT_ERROR_CODE,
    CASTLES_DEFAULT_PORT,
    CASTLES_DIAGNOSTICS_TXN_ID,
} from "@/types/castles";
import { SupabaseClient } from "@supabase/supabase-js";

// ── Types ─────────────────────────────────────────────────────────

export interface SettlementInput {
  terminalId: string; // payment_terminals.id (UUID)
  merchantId: string; // required by RPCs for tenant isolation
  initiatedBy: string; // Clerk userId — audit trail
  terminalHost: string;
  terminalPort?: number;
  locationId: string;
  supabase: SupabaseClient;
  onStatus?: (message: string) => void;
}

export interface SettlementOutput {
  success: boolean;
  partialSuccess: boolean;
  shouldRetry: boolean;
  requiresSupport: boolean;
  hosts: CastlesSettlementHostResult[];
  batchUuid?: string;
  batchId?: string;
  status?: string;
  paymentsUpdated?: number;
  settledAcquirers?: string[];
  failedAcquirers?: Array<{
    acquirer: string;
    return_code: string;
    message: string;
  }>;
  dbWriteFailed?: boolean;
  error?: string;
}

// Shape of a row returned by get_unsettled_summary_by_terminal
interface UnsettledSummaryRow {
  terminal_uuid: string;
  payment_count: number | null;
  total_amount: number | null;
  gross_amount: number | null;
  tip_amount: number | null;
  day_span: number | null;
  oldest_payment_date: string | null;
  newest_payment_date: string | null;
  has_stuck_batch: boolean;
  stuck_batch_status: string | null;
  stuck_batch_uuid: string | null;
}

// ── Security: Terminal Provisioning & Verification ────────────────

async function verifyOrProvisionTerminal(params: {
  supabase: SupabaseClient;
  terminalId: string;
  onStatus?: (msg: string) => void;
}): Promise<void> {
  const { supabase, terminalId, onStatus } = params;
  const service = getSharedCastlesService();

  onStatus?.("Verifying terminal identity...");

  // getData and terminal row are independent — fetch in parallel
  const [getDataResult, { data: terminalRow, error: dbError }] =
    await Promise.all([
      service.getTerminalData(CASTLES_DIAGNOSTICS_TXN_ID),
      supabase
        .from("payment_terminals")
        .select("serial_number, firmware_version")
        .eq("id", terminalId)
        .single(),
    ]);

  if (!getDataResult.success || !getDataResult.data) {
    throw new Error(
      `Terminal identity check failed: getData did not respond. ${getDataResult.error ?? ""}`.trim(),
    );
  }
  if (dbError) {
    throw new Error(`Could not retrieve terminal record: ${dbError.message}`);
  }

  const infSN = getDataResult.data.infSN;
  if (!infSN) {
    throw new Error(
      "Terminal did not return a serial number (infSN). Cannot verify device identity.",
    );
  }

  const storedSerial: string | null = terminalRow?.serial_number ?? null;

  if (!storedSerial) {
    // Check if this physical device is already registered to a different terminal record
    // (e.g., the same unit was moved from back counter to front counter)
    const { data: prevOwner } = await supabase
      .from("payment_terminals")
      .select("id, terminal_name")
      .eq("serial_number", infSN)
      .neq("id", terminalId)
      .maybeSingle();

    const now = new Date().toISOString();

    if (prevOwner) {
      // Clear the old registration so the prior station record doesn't get a mismatch error
      onStatus?.(`Transferring device from "${prevOwner.terminal_name}"...`);
      const { error: clearError } = await supabase
        .from("payment_terminals")
        .update({ serial_number: null, updated_at: now })
        .eq("id", prevOwner.id);

      if (clearError) {
        console.warn(
          `[SettlementService] Could not clear serial from "${prevOwner.terminal_name}":`,
          clearError.message,
        );
      } else {
        console.log(
          `[SettlementService] Device ${infSN} transferred from "${prevOwner.terminal_name}"`,
        );
      }
    }

    onStatus?.(`Provisioning terminal (serial: ${infSN})...`);
    const { error: updateError } = await supabase
      .from("payment_terminals")
      .update({
        serial_number: infSN,
        firmware_version:
          getDataResult.data.infAndroidVersion ?? terminalRow?.firmware_version,
        updated_at: now,
      })
      .eq("id", terminalId);

    if (updateError) {
      // Non-fatal: don't block the first settlement
      console.warn(
        "[SettlementService] Could not store serial number:",
        updateError.message,
      );
    }
  } else {
    if (infSN !== storedSerial) {
      throw new Error(
        `Security: terminal identity mismatch. ` +
          `Connected device serial: "${infSN}", registered serial: "${storedSerial}". ` +
          `Aborting settlement. If this terminal was physically replaced, ` +
          `clear the registered serial number in admin settings.`,
      );
    }

    // Keep firmware_version current for diagnostics (fire-and-forget)
    if (
      getDataResult.data.infAndroidVersion &&
      getDataResult.data.infAndroidVersion !== terminalRow?.firmware_version
    ) {
      supabase
        .from("payment_terminals")
        .update({
          firmware_version: getDataResult.data.infAndroidVersion,
          updated_at: new Date().toISOString(),
        })
        .eq("id", terminalId)
        .then(({ error }) => {
          if (error)
            console.warn(
              "[SettlementService] Firmware version sync failed:",
              error.message,
            );
        });
    }
  }
}

// ── Service ───────────────────────────────────────────────────────

export async function runSettlement(
  input: SettlementInput,
): Promise<SettlementOutput> {
  const {
    terminalId,
    merchantId,
    initiatedBy,
    terminalHost,
    terminalPort = CASTLES_DEFAULT_PORT,
    supabase,
    onStatus,
  } = input;

  onStatus?.("Connecting to terminal...");
  const service = getSharedCastlesService();
  await service.connect({
    host: terminalHost,
    port: terminalPort,
    timeout: 300_000,
    terminalId,
  });

  await verifyOrProvisionTerminal({ supabase, terminalId, onStatus });

  onStatus?.("Preparing settlement batch...");
  const { data: prepareData, error: prepareError } = await supabase.rpc(
    "prepare_castles_settlement",
    {
      p_terminal_id: terminalId,
      p_merchant_id: merchantId,
      p_initiated_by: initiatedBy,
    },
  );

  if (prepareError) {
    throw new Error(`Settlement prepare failed: ${prepareError.message}`);
  }

  const batchUuid: string = prepareData.batch_uuid;
  const txnPosTxnId: string = prepareData.castles_request.txnPosTxnId;
  const paymentCount: number = prepareData.payment_count ?? 0;

  const prevCallback = service.getOnStatusNotification();
  service.setOnStatusNotification((n) => {
    onStatus?.(n.txnStatusMessage ?? n.txnStatus ?? "Processing...");
  });

  onStatus?.("Settling batch — this may take a few minutes...");
  let terminalResult: CastlesSettlementResult;
  try {
    terminalResult = await service.processSettlement({
      referenceId: txnPosTxnId,
    });
  } finally {
    service.setOnStatusNotification(prevCallback);
  }

  // Always finalize — even on TCP failure — so the batch isn't left stuck as 'pending'
  onStatus?.("Recording settlement results...");
  const castlesResponse = terminalResult.raw ?? {
    txnReturnCode: CASTLES_CLIENT_ERROR_CODE,
    txnType: "settlement",
    txnHostMsg: terminalResult.error ?? "Terminal communication failed",
  };

  const { data: finalizeData, error: finalizeError } = await supabase.rpc(
    "finalize_castles_settlement",
    {
      p_batch_uuid: batchUuid,
      p_merchant_id: merchantId,
      p_castles_response: castlesResponse,
    },
  );

  if (finalizeError) {
    console.error(
      "[SettlementService] finalize_castles_settlement failed:",
      finalizeError,
    );
    captureRpcError("finalize_castles_settlement", finalizeError);

    // Persist for later retry from the BatchoutPanel. The terminal has
    // already closed its batch — re-talking to it would double-cut, so
    // the only way back is replaying finalize with this exact response.
    if (terminalResult.success || terminalResult.partialSuccess) {
      await addPendingFinalize(
        {
          batchUuid,
          merchantId,
          terminalId,
          castlesResponse,
          savedAt: new Date().toISOString(),
        },
        supabase,
      );
    }

    return {
      success: terminalResult.success,
      partialSuccess: terminalResult.partialSuccess,
      shouldRetry: false,
      requiresSupport: false,
      hosts: terminalResult.hosts,
      batchUuid,
      dbWriteFailed: true,
      error:
        "Settlement completed on terminal but failed to save results. Retry the DB sync from settings.",
    };
  }

  return {
    success: Boolean(finalizeData.success),
    partialSuccess: finalizeData.status === "partial_failure",
    shouldRetry: Boolean(finalizeData.should_retry),
    requiresSupport: Boolean(finalizeData.requires_support),
    hosts: terminalResult.hosts,
    batchUuid,
    batchId: finalizeData.batch_id,
    status: finalizeData.status,
    paymentsUpdated: finalizeData.success ? paymentCount : undefined,
    settledAcquirers: finalizeData.settled_acquirers ?? [],
    failedAcquirers: finalizeData.failed_acquirers ?? [],
    error:
      !finalizeData.success && !finalizeData.should_retry
        ? `Settlement failed (${finalizeData.return_code ?? "unknown"}). Contact your payment processor.`
        : undefined,
  };
}

// ── Manual reconcile (terminal already settled, POS catching up) ──

export interface ManualMarkSettledInput {
  supabase: SupabaseClient;
  batchUuid: string;
  merchantId: string;
  /** Required, must be >= 10 chars after trim. RPC raises otherwise. */
  reason: string;
  /** Required. RPC raises otherwise. Audit row attributed to this staff. */
  staffId: string;
}

export interface ManualMarkSettledOutput {
  success: boolean;
  paymentsMarkedSettled?: number;
  error?: string;
}

export async function manualMarkBatchSettled(
  input: ManualMarkSettledInput,
): Promise<ManualMarkSettledOutput> {
  const { data, error } = await input.supabase.rpc("manual_mark_batch_settled", {
    p_batch_uuid: input.batchUuid,
    p_merchant_id: input.merchantId,
    p_reason: input.reason,
    p_staff_id: input.staffId,
  });
  if (error) {
    return { success: false, error: error.message ?? "Failed to mark settled" };
  }
  return {
    success: Boolean(data?.success),
    paymentsMarkedSettled: Number(data?.payments_marked_settled ?? 0),
  };
}

// ── Query: unsettled payment stats ────────────────────────────────

export interface UnsettledStats {
  count: number;
  totalAmount: number;
  grossAmount: number;
  tipAmount: number;
  daySpan: number;
  oldestDate?: string;
  newestDate?: string;
  hasStuckBatch: boolean;
  stuckBatchStatus?: string;
  stuckBatchUuid?: string;
}

export interface GetUnsettledStatsInput {
  supabase: SupabaseClient;
  merchantId: string;
  locationId: string;
  terminalId: string;
}

export async function getUnsettledPaymentStats(
  input: GetUnsettledStatsInput,
): Promise<UnsettledStats> {
  const { supabase, merchantId, locationId, terminalId } = input;

  const empty: UnsettledStats = {
    count: 0,
    totalAmount: 0,
    grossAmount: 0,
    tipAmount: 0,
    daySpan: 0,
    hasStuckBatch: false,
  };

  const { data, error } = await supabase.rpc(
    "get_unsettled_summary_by_terminal",
    {
      p_merchant_id: merchantId,
      p_location_id: locationId,
    },
  );

  if (error) {
    console.error(
      "[SettlementService] get_unsettled_summary_by_terminal failed:",
      error,
    );
    captureRpcError("get_unsettled_summary_by_terminal", error);
    return empty;
  }

  const row = (data as UnsettledSummaryRow[] | null)?.find(
    (r) => r.terminal_uuid === terminalId,
  );
  if (!row) return empty;

  return {
    count: Number(row.payment_count ?? 0),
    totalAmount: Number(row.total_amount ?? 0),
    grossAmount: Number(row.gross_amount ?? 0),
    tipAmount: Number(row.tip_amount ?? 0),
    daySpan: Number(row.day_span ?? 0),
    oldestDate: row.oldest_payment_date ?? undefined,
    newestDate: row.newest_payment_date ?? undefined,
    hasStuckBatch: Boolean(row.has_stuck_batch),
    stuckBatchStatus: row.stuck_batch_status ?? undefined,
    stuckBatchUuid: row.stuck_batch_uuid ?? undefined,
  };
}
