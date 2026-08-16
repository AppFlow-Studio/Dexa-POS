// ============================================================
// Settlement Service
// File: services/settlementService.ts
// ============================================================

import { captureRpcError } from "@/lib/supabase";
import { addPendingFinalize } from "@/services/pendingFinalize";
import { getSharedCastlesService } from "@/services/terminals/castles-service";
import { getSharedValorService } from "@/services/terminals/valor-service";
import { reconcileTerminalSerial } from "@/services/terminals/terminalIdentity";
import { VALOR_DEFAULT_PORT, VALOR_SETTLEMENT_TIMEOUT_MS } from "@/types/valor";
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
  /** 'castles' (default) or 'valor' — selects the settlement path. */
  terminalType?: string;
  /** Required for TCP terminals; ignored for USB. */
  terminalHost?: string;
  terminalPort?: number;
  /** 'usb' for wired Castles/Valor, otherwise TCP. Defaults to 'local_socket'. */
  connectionType?: 'local_socket' | 'usb';
  /** Valor only: terminal EPI + cancel port from the payment_terminals row. */
  epi?: string;
  cancelPort?: number;
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
  /** 'castles' (default) or 'valor'. */
  processor?: string;
  /** Valor: the terminal's closed batch number (BATCH_NO). */
  batchNumber?: string;
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

// ── Settlement attempt audit log (best-effort) ───────────────────
// Writes a per-phase row to settlement_attempts via log_settlement_attempt().
// Best-effort: a missing RPC (env not migrated) is warned ONCE and swallowed so
// it never breaks settlement — but we do NOT swallow silently forever, since this
// is the forensic trail for the feature most likely to strand money.

let _logAttemptRpcMissing = false;

export async function logSettlementAttempt(
  supabase: SupabaseClient,
  args: {
    terminalId: string;
    phase: "prepare" | "terminal_command" | "finalize";
    outcome: "started" | "success" | "failed" | "timeout" | "blocked";
    detail?: string | null;
    batchUuid?: string | null;
    initiatedBy?: string | null;
  },
): Promise<void> {
  try {
    const { error } = await supabase.rpc("log_settlement_attempt", {
      p_terminal_id: args.terminalId,
      p_phase: args.phase,
      p_outcome: args.outcome,
      p_detail: args.detail ?? null,
      p_batch_uuid: args.batchUuid ?? null,
      p_initiated_by: args.initiatedBy ?? null,
    });
    if (error) {
      const missing = /function .*log_settlement_attempt.* does not exist/i.test(
        error.message ?? "",
      );
      if (missing) {
        if (!_logAttemptRpcMissing) {
          _logAttemptRpcMissing = true;
          captureRpcError("log_settlement_attempt", error);
          console.warn(
            "[SettlementService] log_settlement_attempt RPC missing — settlement audit trail disabled until deployed to this environment.",
          );
        }
      } else {
        console.warn(
          "[SettlementService] log_settlement_attempt failed:",
          error.message,
        );
      }
    }
  } catch (e) {
    // Never let audit logging break settlement.
    console.warn(
      "[SettlementService] log_settlement_attempt threw (non-fatal):",
      e instanceof Error ? e.message : String(e),
    );
  }
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

  // Reconcile the connected device's serial against the stored identity.
  // NULL → fill; equal → no-op; a DIFFERENT physical device → hard block
  // (settlement must never run against a terminal whose batches belong to a
  // different device). The helper never clears or moves another row's serial —
  // the moved/replaced-device case is handled by registering a new terminal.
  const reconciled = await reconcileTerminalSerial({
    supabase,
    terminalId,
    discoveredSerial: infSN,
    stampStatusOnMismatch: true,
  });

  if (reconciled.kind === "mismatch") {
    throw new Error(
      `Security: terminal identity mismatch. ` +
        `Connected device serial "${reconciled.discoveredSerial}" does not match ` +
        `the registered serial "${reconciled.storedSerial}". This terminal's batches ` +
        `belong to the original device. If you replaced the hardware, register the ` +
        `new device as a NEW terminal in Settings → Devices; do not edit this one.`,
    );
  }

  if (reconciled.kind === "filled") {
    onStatus?.(`Provisioning terminal (serial: ${infSN})...`);
  }

  // Keep firmware_version current for diagnostics (fire-and-forget). Firmware
  // is not an identity signal, so it is synced independently of the serial.
  const androidVersion = getDataResult.data.infAndroidVersion;
  if (androidVersion && androidVersion !== terminalRow?.firmware_version) {
    supabase
      .from("payment_terminals")
      .update({
        firmware_version: androidVersion,
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

// ── Service ───────────────────────────────────────────────────────

/**
 * Settlement dispatcher — routes by terminal type. Castles keeps its full
 * host-keyed flow; Valor runs the on-terminal TRAN_MODE 0/9 flow.
 */
export async function runSettlement(
  input: SettlementInput,
): Promise<SettlementOutput> {
  if (input.terminalType === 'valor') {
    return runValorSettlement(input);
  }
  return runCastlesSettlement(input);
}

async function runCastlesSettlement(
  input: SettlementInput,
): Promise<SettlementOutput> {
  const {
    terminalId,
    merchantId,
    initiatedBy,
    terminalHost,
    terminalPort = CASTLES_DEFAULT_PORT,
    connectionType = 'local_socket',
    supabase,
    onStatus,
  } = input;

  const isUsb = connectionType === 'usb';
  if (!isUsb && !terminalHost) {
    throw new Error('Settlement requires either USB connection or a TCP terminal host');
  }

  onStatus?.("Connecting to terminal...");
  const service = getSharedCastlesService();
  await service.connect({
    connectionType: isUsb ? 'usb' : 'local_socket',
    host: isUsb ? undefined : terminalHost,
    port: isUsb ? undefined : terminalPort,
    timeout: 300_000,
    terminalId,
  });

  // Settlement is non-idempotent at the terminal layer — we only get
  // one clean shot per tap. Run the escalated return2Idle sequence so
  // a lingering result-screen / partial-payment UI state from prior
  // use can't sink the first attempt (the "had to tap twice" symptom).
  onStatus?.("Preparing terminal...");
  await service.escalatedReset();

  await verifyOrProvisionTerminal({ supabase, terminalId, onStatus });

  // In the field we see a consistent "first tap rejects with 'failed' /
  // contact-processor, second tap succeeds" pattern. prepare_castles_settlement
  // Step 3a/3b already releases the previous failed batch's payments, so a
  // second prepare→processSettlement→finalize cycle is safe and is exactly
  // what staff did manually. Wrap it in one in-function retry loop.
  const MAX_ATTEMPTS = 2;
  let lastOutput: SettlementOutput | undefined;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const isRetry = attempt > 1;
    if (isRetry) {
      onStatus?.("Terminal not ready — retrying batchout...");
      try {
        await service.escalatedReset();
      } catch (e) {
        console.warn(
          "[SettlementService] auto-retry escalatedReset failed (non-fatal):",
          e instanceof Error ? e.message : String(e),
        );
      }
      await new Promise((r) => setTimeout(r, 1500));
    }

    lastOutput = await _runSingleSettlementAttempt({
      supabase,
      terminalId,
      merchantId,
      initiatedBy,
      service,
      onStatus,
      attempt,
    });

    // Stop unless this attempt looks like the auto-recoverable "failed" case.
    // - dbWriteFailed: persisted as a pendingFinalize; don't double up.
    // - partialSuccess: some acquirers settled on-device; manual review only.
    // - shouldRetry: Castles itself asked for a retry; the existing UI handles it.
    // - success: done.
    const shouldAutoRetry =
      !lastOutput.success &&
      !lastOutput.partialSuccess &&
      !lastOutput.shouldRetry &&
      !lastOutput.dbWriteFailed;

    if (!shouldAutoRetry) break;
    if (attempt === MAX_ATTEMPTS) {
      console.warn(
        "[SettlementService] auto-retry exhausted; surfacing failure to user",
      );
    }
  }

  return lastOutput!;
}

// ── Valor on-terminal settlement (TRAN_MODE 0 / TRAN_CODE 9) ───────

/**
 * Single-attempt Valor settlement — NO auto-retry loop (a Valor settle has no
 * per-acquirer partial detection and no STAN re-query, so a re-fire could cut a
 * second batch). prepare pins membership; settleBatch closes the batch on the
 * terminal; finalize marks the pinned payments (STATE-only) or routes to
 * needs_review. On a finalize RPC failure AFTER a confirmed close, the response
 * is journaled for replay from the BatchoutPanel.
 */
async function runValorSettlement(
  input: SettlementInput,
): Promise<SettlementOutput> {
  const {
    terminalId,
    merchantId,
    initiatedBy,
    terminalHost,
    terminalPort = VALOR_DEFAULT_PORT,
    connectionType = 'local_socket',
    epi,
    cancelPort,
    supabase,
    onStatus,
  } = input;

  const isUsb = connectionType === 'usb';
  if (!isUsb && !terminalHost) {
    throw new Error('Valor settlement requires either a USB connection or a TCP terminal host.');
  }

  const failOutput = (error: string, extra?: Partial<SettlementOutput>): SettlementOutput => ({
    success: false, partialSuccess: false, shouldRetry: false, requiresSupport: false,
    hosts: [], processor: 'valor', error, ...extra,
  });

  onStatus?.('Connecting to Valor terminal...');
  const valor = getSharedValorService();
  await valor.connect({
    connectionType: isUsb ? 'usb' : 'local_socket',
    host: isUsb ? undefined : terminalHost,
    port: isUsb ? undefined : terminalPort,
    cancelPort,
    epi,
    timeout: VALOR_SETTLEMENT_TIMEOUT_MS,
    terminalId,
  });

  // 1. Prepare: snapshot + pin membership (server side).
  onStatus?.('Preparing settlement batch...');
  const { data: prep, error: prepErr } = await supabase.rpc('prepare_valor_settlement', {
    p_terminal_id: terminalId,
    p_merchant_id: merchantId,
    p_initiated_by: initiatedBy,
  });
  if (prepErr) {
    // The legacy (pre-adopt) prepare RAISEs this when there's nothing to close —
    // the adopt-aware prepare returns a structured nothing_to_settle instead. Treat
    // both the same so a prod env still on the old RPC reads as reassurance, not an
    // error.
    if (/no unsettled captured valor payments/i.test(prepErr.message ?? '')) {
      return failOutput('', { status: 'nothing_to_settle', error: undefined });
    }
    // Missing RPC (env not migrated yet) surfaces as a clear message, not a crash.
    const msg = /function .*prepare_valor_settlement.* does not exist/i.test(prepErr.message ?? '')
      ? 'Valor settlement is not deployed to this environment yet.'
      : `Prepare failed: ${prepErr.message}`;
    captureRpcError('prepare_valor_settlement', prepErr);
    return failOutput(msg);
  }

  // The adopt-aware prepare branches on data state. Nothing to close (webhook
  // already settled, terminal auto-batched, or no captures) → skip the terminal
  // round-trip and surface reassurance, not a failure.
  if (prep?.branch === 'nothing_to_settle' || prep?.nothing_to_settle === true) {
    return failOutput('', { status: 'nothing_to_settle', error: undefined });
  }
  // >1 open Valor batch: can't know which the terminal will close — route to a
  // manual reconcile instead of guessing.
  if (prep?.branch === 'needs_manual') {
    return failOutput(
      prep?.message ?? 'Multiple open Valor batches for this terminal. Reconcile manually.',
      { status: 'needs_manual', requiresSupport: true },
    );
  }

  const batchUuid: string = prep.batch_uuid;
  const batchId: string = prep.batch_id;
  const paymentCount: number = prep.payment_count ?? 0;

  // 2. Close the batch on the terminal (single attempt).
  onStatus?.('Settling batch on the terminal — this can take a minute. Do not unplug.');
  const referenceId = `VS${String(Date.now()).slice(-6)}`;
  const res = await valor.settleBatch({ referenceId });

  // The exact terminal response drives finalize. On an indeterminate settle we
  // still call finalize with a STATE-less marker so the server routes the batch
  // to needs_review (out of 'pending') rather than leaving it stuck.
  const valorResponse = res.raw ?? { STATE: null, indeterminate: true, error: res.error ?? 'no response' };

  // 3. Finalize: mark payments (STATE-only) or needs_review.
  onStatus?.('Recording settlement results...');
  const { data: fin, error: finErr } = await supabase.rpc('finalize_valor_settlement', {
    p_batch_uuid: batchUuid,
    p_merchant_id: merchantId,
    p_valor_response: valorResponse,
  });

  if (finErr) {
    captureRpcError('finalize_valor_settlement', finErr);
    // If the terminal confirmed the close, journal the response so any device can
    // replay finalize (terminal already closed — re-settling would double-cut).
    if (res.outcome === 'settled') {
      await addPendingFinalize(
        {
          batchUuid, merchantId, terminalId,
          processor: 'valor', castlesResponse: valorResponse,
          savedAt: new Date().toISOString(),
        },
        supabase,
      );
    }
    return failOutput(
      'Settlement completed on the terminal but saving the result failed. Retry the DB sync from settings.',
      { batchUuid, batchId, dbWriteFailed: true },
    );
  }

  return {
    success: Boolean(fin.success),
    partialSuccess: false,
    shouldRetry: Boolean(fin.should_retry),
    requiresSupport: Boolean(fin.requires_support),
    hosts: [],
    processor: 'valor',
    batchUuid,
    batchId: fin.batch_id ?? batchId,
    status: fin.status,
    batchNumber: fin.batch_number,
    paymentsUpdated: fin.success ? paymentCount : undefined,
    error: fin.success ? undefined : (fin.error ?? `Settlement ${fin.status}`),
  };
}

// ── Inner per-attempt body (kept side-effectful: writes the settlement_batches row) ──

async function _runSingleSettlementAttempt(params: {
  supabase: SupabaseClient;
  terminalId: string;
  merchantId: string;
  initiatedBy: string;
  service: ReturnType<typeof getSharedCastlesService>;
  onStatus?: (msg: string) => void;
  attempt: number;
}): Promise<SettlementOutput> {
  const {
    supabase,
    terminalId,
    merchantId,
    initiatedBy,
    service,
    onStatus,
    attempt,
  } = params;

  onStatus?.("Preparing settlement batch...");
  await logSettlementAttempt(supabase, {
    terminalId,
    phase: "prepare",
    outcome: "started",
    detail: `attempt #${attempt}`,
    initiatedBy,
  });
  const { data: prepareData, error: prepareError } = await supabase.rpc(
    "prepare_castles_settlement",
    {
      p_terminal_id: terminalId,
      p_merchant_id: merchantId,
      p_initiated_by: initiatedBy,
    },
  );

  if (prepareError) {
    await logSettlementAttempt(supabase, {
      terminalId,
      phase: "prepare",
      outcome: "failed",
      detail: prepareError.message,
      initiatedBy,
    });
    throw new Error(`Settlement prepare failed: ${prepareError.message}`);
  }

  const batchUuid: string = prepareData.batch_uuid;
  const txnPosTxnId: string = prepareData.castles_request.txnPosTxnId;
  const paymentCount: number = prepareData.payment_count ?? 0;
  await logSettlementAttempt(supabase, {
    terminalId,
    phase: "prepare",
    outcome: "success",
    detail: `${paymentCount} payment(s)`,
    batchUuid,
    initiatedBy,
  });

  const prevCallback = service.getOnStatusNotification();
  service.setOnStatusNotification((n) => {
    onStatus?.(n.txnStatusMessage ?? n.txnStatus ?? "Processing...");
  });

  onStatus?.("Settling batch — this may take a few minutes...");
  await logSettlementAttempt(supabase, {
    terminalId,
    phase: "terminal_command",
    outcome: "started",
    batchUuid,
    initiatedBy,
  });
  let terminalResult: CastlesSettlementResult;
  try {
    terminalResult = await service.processSettlement({
      referenceId: txnPosTxnId,
    });
  } finally {
    service.setOnStatusNotification(prevCallback);
  }

  {
    const tcError = terminalResult.success ? null : terminalResult.error ?? "";
    const tcTimedOut = /timeout|timed out|empty response|no response/i.test(
      tcError ?? "",
    );
    await logSettlementAttempt(supabase, {
      terminalId,
      phase: "terminal_command",
      outcome: terminalResult.success
        ? "success"
        : tcTimedOut
          ? "timeout"
          : "failed",
      detail: terminalResult.success ? undefined : tcError || undefined,
      batchUuid,
      initiatedBy,
    });
  }

  // Always finalize — even on TCP failure — so the batch isn't left stuck as 'pending'
  onStatus?.("Recording settlement results...");
  const castlesResponse = terminalResult.raw ?? {
    txnReturnCode: CASTLES_CLIENT_ERROR_CODE,
    txnType: "settlement",
    txnHostMsg: terminalResult.error ?? "Terminal communication failed",
  };

  await logSettlementAttempt(supabase, {
    terminalId,
    phase: "finalize",
    outcome: "started",
    batchUuid,
    initiatedBy,
  });
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
    await logSettlementAttempt(supabase, {
      terminalId,
      phase: "finalize",
      outcome: "failed",
      detail: finalizeError.message,
      batchUuid,
      initiatedBy,
    });

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

  await logSettlementAttempt(supabase, {
    terminalId,
    phase: "finalize",
    outcome: "success",
    detail: `status=${finalizeData.status} return_code=${finalizeData.return_code ?? ""}`,
    batchUuid,
    initiatedBy,
  });

  console.log(
    `[SettlementService] attempt #${attempt} → status=${finalizeData.status} return_code=${finalizeData.return_code}`,
  );

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
