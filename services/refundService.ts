import { isTransientRpcError } from "@/lib/network/idempotencyKey";
import { DejavooSpinAPI } from "@/lib/payments/dejavoo-spin-api";
import { isInKindMethod } from "@/lib/paymentMethod";
import { parseRefundApproval } from "@/lib/refundApproval";
import { computeItemRefundAmount } from "@/lib/refundScShare";
import { OrderService } from "@/services/orderService";
import {
    completeRefundJournal,
    failRefundJournal,
    toRefundStepKey,
    updateRefundJournal,
    writeRefundJournal,
    type RefundPipelineStep
} from "@/services/refundJournal";
import {
    getSharedCastlesService,
    isTerminalTransportDead,
} from "@/services/terminals/castles-service";
import { getOrCreateCounter } from "@/services/terminals/castles-txn-counter";
import { getSharedValorService } from "@/services/terminals/valor-service";
import { getOrCreateValorCounter } from "@/services/terminals/valor-txn-counter";
import { VALOR_DEFAULT_PORT, VALOR_SALE_TIMEOUT_MS } from "@/types/valor";
import { getSharedAtomService } from "@/services/terminals/atom-service";
import {
  suspendAtomLoopbackProbing,
  resumeAtomLoopbackProbing,
} from "@/services/terminals/atomLoopbackDetector";
import { useAtomTerminalStore } from "@/stores/useAtomTerminalStore";
import { ATOM_LOOPBACK_HOST, ATOM_SALE_TIMEOUT_MS } from "@/types/atom";
import {
    CASTLES_DEFAULT_PORT,
    CASTLES_SOCKET_TIMEOUT_MS,
} from "@/types/castles";
import type { DejavooRefundResponse } from "@/types/dejavoo-spin-api";
import type {
    ItemRefundAllocation,
    PaymentRefundContext,
    RefundItemRequest,
    RefundRequest,
    RefundResult,
    RefundRpcOutcome,
} from "@/types/refunds";
import { StationPaymentTerminal } from "@/types/station";
import { round2 } from "@/utils/money";
import * as Sentry from "@sentry/react-native";
import type { SupabaseClient } from "@supabase/supabase-js";
import { v4 as uuidv4 } from "uuid";

type RefundContext = {
  orderId: string;
  payments: PaymentRefundContext[];
  payment?: PaymentRefundContext;
  locationId?: string | null;
  merchantId?: string | null;
  stationId?: string | null;
};


export class RefundService {
  private supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  /**
   * Wave R-1: mints (or recovers) a refund journal entry, derives per-step
   * idempotency keys via uuidv5(journalKey, stepName), runs the appropriate
   * sub-pipeline, and returns a RefundRpcOutcome discriminated union.
   *
   *   'success'   — all 5 RPCs + terminal completed.
   *   'verifying' — terminal succeeded but a backend RPC returned a transient
   *                 error (DEADLINE_EXCEEDED / 40001). Show verifying view.
   *   'error'     — terminal declined, or permanent DB error.
   */
  async processRefund(
    request: RefundRequest,
  ): Promise<RefundRpcOutcome<RefundResult>> {
    const context = await this.gatherRefundContext(request);
    if (!context.payment && request.refundType.type !== "item_return") {
      return { kind: "error", error: "No refundable payment found." };
    }

    // Determine primary payment for journal metadata.
    const primaryPayment = context.payment ?? context.payments[0];
    const paymentMethod =
      primaryPayment?.paymentMethod?.toString() ?? "unknown";
    const originalPaymentId = primaryPayment?.paymentId ?? "";

    // Mint a master idempotency key for this refund pipeline run.
    const idempotencyKey = uuidv4();
    const journalId = writeRefundJournal({
      orderId: request.orderId,
      refundType: request.refundType.type,
      amount:
        request.refundType.type === "partial_amount"
          ? request.refundType.amount
          : (primaryPayment?.availableForRefund ?? 0),
      paymentMethod,
      originalPaymentId,
      idempotencyKey,
    });

    switch (request.refundType.type) {
      case "full_payment":
        return this.processFullPaymentRefund(
          request,
          context,
          journalId,
          idempotencyKey,
        );
      case "partial_amount":
        return this.processPartialRefund(
          request,
          context,
          request.refundType.amount,
          journalId,
          idempotencyKey,
        );
      case "item_return":
        return this.processItemReturn(
          request,
          context,
          request.refundType.items,
          idempotencyKey,
        );
      default:
        failRefundJournal(journalId, "create_reversal", "Unknown refund type");
        return { kind: "error", error: "Unknown refund type." };
    }
  }

  private buildReversalRefId(context: RefundContext): string {
    const locSuffix = context.locationId?.slice(-4) ?? "";
    const staSuffix = context.stationId?.slice(-4) ?? "";
    const locPart = locSuffix ? `_${locSuffix}` : "";
    const staPart = staSuffix ? `_${staSuffix}` : "";
    return `REV${locPart}${staPart}_${Date.now()}`;
  }

  private async gatherRefundContext(
    request: RefundRequest,
  ): Promise<RefundContext> {
    const { data: order, error } = await this.supabase
      .from("orders")
      .select("id, merchant_id, location_id")
      .eq("id", request.orderId)
      .single();

    if (error || !order) {
      return { orderId: request.orderId, payments: [] };
    }

    const { data: payments } = await this.supabase
      .from("order_payments")
      .select(
        [
          "id",
          "amount",
          "tip_amount",
          "refunded_amount",
          // Wave R-SC: SC share baked into `amount` by process_payment_v14.
          // Used by buildItemRefundAllocation to prorate SC into item refunds.
          "service_charge",
          "payment_method",
          "batch_number",
          "rrn",
          "auth_code",
          "reference_number",
          "transaction_id",
          "terminal_id",
          "is_settled",
          "processor_response",
        ].join(","),
      )
      .eq("order_id", request.orderId)
      .in("status", ["captured", "refunded", "partially_refunded"]);

    // Batch-fetch terminal configs for all terminal IDs on these payments — one round-trip.
    // Needed so cross-station voids route to the original terminal, not the current station's.
    const uniqueTerminalIds = [
      ...new Set(
        (payments ?? [])
          .map((p: any) => p.terminal_id as string | null)
          .filter((id): id is string => !!id),
      ),
    ];
    const terminalConfigMap = new Map<string, StationPaymentTerminal>();
    if (uniqueTerminalIds.length > 0) {
      const { data: terminalRows } = await this.supabase
        .from("payment_terminals")
        .select(
          "id, terminal_name, terminal_type, local_ip_address, local_port, auth_key, " +
            "register_id, connection_type, is_connected, last_connection_status, " +
            "last_connection_test_at, consecutive_failures, health_check_interval, terminal_model",
        )
        .in("id", uniqueTerminalIds);

      for (const t of (terminalRows ?? []) as any[]) {
        terminalConfigMap.set(t.id, {
          id: t.id,
          terminal_name: t.terminal_name,
          // terminal_type DB col is string | null; default to 'dejavoo' if unset
          terminal_type: (t.terminal_type ??
            "dejavoo") as StationPaymentTerminal["terminal_type"],
          auth_key: t.auth_key ?? null,
          register_id: t.register_id ?? null,
          terminal_model: t.terminal_model ?? null,
          is_connected: t.is_connected ?? false,
          // local_ip_address is DB type 'unknown' (inet); guard null before stringify
          ip_address:
            t.local_ip_address != null ? String(t.local_ip_address) : undefined,
          port: t.local_port ?? undefined,
          connection_type: (t.connection_type ??
            undefined) as StationPaymentTerminal["connection_type"],
          last_connection_status: (t.last_connection_status ??
            null) as StationPaymentTerminal["last_connection_status"],
          last_connection_test_at: t.last_connection_test_at ?? null,
          consecutive_failures: t.consecutive_failures ?? undefined,
          health_check_interval: t.health_check_interval ?? undefined,
        });
      }
    }

    const paymentContexts: PaymentRefundContext[] = (payments || [])
      .map((p: any) => {
        const amount = Number(p.amount || 0);
        const refundedAmount = Number(p.refunded_amount || 0);
        const availableForRefund = Math.max(0, amount - refundedAmount);
        const serviceCharge = Number(p.service_charge || 0);
        // Extract STAN from processor_response JSONB (stored by Castles integration)
        const castlesTxn = p.processor_response?.castles_transaction;
        const stan =
          castlesTxn?.stan ||
          p.processor_response?.raw_castles_response?.txnStan ||
          "";
        // Valor reversal reference is TRAN_NO (charge-slip "Trans" number), NOT rrn/stan.
        const valorTxn = p.processor_response?.valor_transaction;
        const tranNo = valorTxn?.tranNo || "";
        // ATOM linked refund/void references the original by paymentId.
        const atomTxn = p.processor_response?.atom_transaction;
        const atomPaymentId = atomTxn?.paymentId || "";
        const cardLast4 =
          valorTxn?.cardLast4 || castlesTxn?.cardLast4 || atomTxn?.cardLast4 || "";
        return {
          paymentId: p.id,
          referenceId: p.reference_number || p.transaction_id || "",
          rrn: p.rrn || "",
          stan,
          tranNo,
          atomPaymentId,
          cardLast4,
          authCode: p.auth_code || "",
          amount,
          tipAmount: Number(p.tip_amount || 0),
          refundedAmount,
          availableForRefund,
          serviceCharge,
          paymentMethod: p.payment_method,
          batchNumber: p.batch_number || "",
          isVoidable: !p.is_settled && refundedAmount === 0, // Void only if unsettled AND no prior refunds
          terminalId: p.terminal_id,
          terminalConfig: p.terminal_id
            ? terminalConfigMap.get(p.terminal_id)
            : undefined,
        };
      })
      .filter((p) => p.availableForRefund > 0);

    const selectedPayment = request.paymentId
      ? paymentContexts.find((p) => p.paymentId === request.paymentId)
      : paymentContexts[0];

    return {
      orderId: request.orderId,
      payments: paymentContexts,
      payment: selectedPayment,
      locationId: order.location_id,
      merchantId: order.merchant_id,
      stationId: request.stationId ?? null,
    };
  }

  private async processFullPaymentRefund(
    request: RefundRequest,
    context: RefundContext,
    journalId: string,
    idempotencyKey: string,
  ): Promise<RefundRpcOutcome<RefundResult>> {
    const payment = context.payment;
    if (!payment) {
      failRefundJournal(
        journalId,
        "create_reversal",
        "Payment not found for refund",
      );
      return { kind: "error", error: "Payment not found for refund." };
    }

    // This method is reached from the explicit Refund action. Do not silently
    // convert an unsettled full refund into a void; Void has its own UI/path and
    // a refund receipt must remain auditable as reversal_type='refund'.
    const useVoid = false;
    const reversalType = "refund" as const;

    // Step 1 — create_reversal (key: step 'create_reversal')
    const { data: reversal, error: reversalError } =
      await OrderService.createReversal(
        this.supabase,
        {
          original_payment_id: payment.paymentId,
          original_psp_reference: payment.rrn,
          reversal_reference_id: this.buildReversalRefId(context),
          reversal_type: reversalType,
          amount: payment.availableForRefund,
          reason_code: request.reason,
          reason_description: request.reasonDetail ?? null,
          initiated_by: request.initiatedBy,
          approved_by: request.approvedBy ?? null,
        },
        { keyOverride: toRefundStepKey(idempotencyKey, "create_reversal") },
      );

    if (reversalError || !reversal) {
      const err = reversalError?.message || "Failed to create reversal.";
      if (isTransientRpcError(reversalError)) {
        failRefundJournal(journalId, "create_reversal", err);
        return {
          kind: "verifying",
          journalId,
          failedStep: "create_reversal",
          reason: err,
        };
      }
      failRefundJournal(journalId, "create_reversal", err);
      return { kind: "error", error: err };
    }

    // Persist reversalId so TCP-in-flight reconciliation can use it.
    updateRefundJournal(journalId, { reversalId: reversal.id });

    const effectiveTerminalId =
      payment.terminalId || request.payment_terminal_id;
    const effectiveTerminal =
      payment.terminalConfig ??
      (request.payment_terminal?.id === effectiveTerminalId
        ? request.payment_terminal
        : undefined);

    // Step 2 — terminal_refund (journal updated inside processTerminalRefund for Castles)
    const terminalResult = await this.processTerminalRefund(
      payment,
      payment.availableForRefund,
      useVoid,
      effectiveTerminalId,
      effectiveTerminal,
      journalId,
    );

    if (!terminalResult.success) {
      try {
        const failedResponse = terminalResult.terminalResponse as
          | Record<string, unknown>
          | undefined;
        await OrderService.updateReversalStatus(
          this.supabase,
          reversal.id,
          "failed",
          failedResponse ?? null,
          undefined,
          undefined,
          undefined,
          undefined,
          {
            keyOverride: toRefundStepKey(
              idempotencyKey,
              "update_reversal_status",
            ),
          },
        );
      } catch {}
      Sentry.captureException(
        new Error(terminalResult.error ?? "Terminal refund failed"),
        {
          tags: {
            source: "refund_terminal",
            type: "full_payment",
            orderId: request.orderId,
          },
        },
      );
      failRefundJournal(
        journalId,
        "terminal_refund",
        terminalResult.error ?? "Terminal declined",
      );
      return {
        kind: "error",
        error: terminalResult.error ?? "Terminal refund failed.",
      };
    }

    // Terminal approved — advance journal status.
    updateRefundJournal(journalId, { status: "terminal_approved" });

    const terminalResponse = terminalResult.terminalResponse as
      | Record<string, unknown>
      | undefined;
    const approval = parseRefundApproval(terminalResponse);
    const returnDetails = {
      rrn: approval.rrn ?? undefined,
      authCode: approval.authCode ?? undefined,
      referenceId: approval.referenceId ?? undefined,
      transactionNumber: approval.transactionNumber ?? undefined,
      reason: request.reasonDetail,
      initiatedBy: request.initiatedBy,
    };

    // Step 3 + 4 — update_reversal_status and apply_refund_to_payment (parallel)
    const [reversalResult, paymentResult] = await Promise.all([
      OrderService.updateReversalStatus(
        this.supabase,
        reversal.id,
        "completed",
        terminalResponse ?? null,
        (terminalResponse?.EMVData as Record<string, unknown>) ?? null,
        approval.resultCode,
        approval.responseMessage,
        approval.rrn,
        {
          keyOverride: toRefundStepKey(
            idempotencyKey,
            "update_reversal_status",
          ),
        },
      ),
      OrderService.applyRefundToPayment(
        this.supabase,
        payment.paymentId,
        payment.availableForRefund,
        reversalType,
        returnDetails,
        undefined,
        {
          keyOverride: toRefundStepKey(
            idempotencyKey,
            "apply_refund_to_payment",
          ),
        },
      ),
    ]);

    // Detect transient error on either backend step — enter verifying mode.
    const transientErr = isTransientRpcError(reversalResult.error)
      ? {
          step: "update_reversal_status" as RefundPipelineStep,
          err: reversalResult.error,
        }
      : isTransientRpcError(paymentResult.error)
        ? {
            step: "apply_refund_to_payment" as RefundPipelineStep,
            err: paymentResult.error,
          }
        : null;

    if (transientErr) {
      const msg = (transientErr.err as any)?.message ?? "Transient RPC error";
      return {
        kind: "verifying",
        journalId,
        failedStep: transientErr.step,
        reason: msg,
      };
    }

    const dbErrors: string[] = [];
    if (reversalResult.error) {
      console.error(
        "[RefundService] updateReversalStatus error:",
        reversalResult.error,
      );
      dbErrors.push(
        `Reversal status update failed: ${reversalResult.error.message || reversalResult.error}`,
      );
    }
    if (paymentResult.error) {
      console.error(
        "[RefundService] applyRefundToPayment error:",
        paymentResult.error,
      );
      dbErrors.push(
        `Payment update failed: ${paymentResult.error.message || paymentResult.error}`,
      );
    }

    // Step 5 — record_refund_items
    const refundItems = await this.buildFullRefundItems(
      request.orderId,
      reversal.id,
      request.reason,
      request.reasonDetail,
    );
    if (refundItems.length > 0) {
      const { error: itemsErr } = await OrderService.recordRefundItems(
        this.supabase,
        reversal.id,
        refundItems,
        true,
        { keyOverride: toRefundStepKey(idempotencyKey, "record_refund_items") },
      );
      if (isTransientRpcError(itemsErr)) {
        const msg = (itemsErr as any)?.message ?? "Transient RPC error";
        return {
          kind: "verifying",
          journalId,
          failedStep: "record_refund_items",
          reason: msg,
        };
      }
    }

    // Step 6 — update_order_payment_status
    const orderResult = await OrderService.updateOrderPaymentStatusAfterRefund(
      this.supabase,
      request.orderId,
      {
        keyOverride: toRefundStepKey(
          idempotencyKey,
          "update_order_payment_status",
        ),
      },
    );
    if (isTransientRpcError(orderResult.error)) {
      const msg = (orderResult.error as any)?.message ?? "Transient RPC error";
      return {
        kind: "verifying",
        journalId,
        failedStep: "update_order_payment_status",
        reason: msg,
      };
    }
    if (orderResult.error) {
      console.error(
        "[RefundService] updateOrderPaymentStatus error:",
        orderResult.error,
      );
      dbErrors.push(
        `Order status update failed: ${orderResult.error.message || orderResult.error}`,
      );
    }

    completeRefundJournal(journalId, reversal.id);
    return {
      kind: "success",
      data: {
        success: true,
        reversalId: reversal.id,
        terminalResponse: terminalResult.terminalResponse,
        error:
          dbErrors.length > 0
            ? `Refund processed but: ${dbErrors.join("; ")}`
            : undefined,
      },
    };
  }

  private async processPartialRefund(
    request: RefundRequest,
    context: RefundContext,
    amount: number,
    journalId: string,
    idempotencyKey: string,
  ): Promise<RefundRpcOutcome<RefundResult>> {
    const payment = context.payment;
    if (!payment) {
      failRefundJournal(
        journalId,
        "create_reversal",
        "Payment not found for refund",
      );
      return { kind: "error", error: "Payment not found for refund." };
    }

    if (amount <= 0 || amount > payment.availableForRefund) {
      failRefundJournal(journalId, "create_reversal", "Invalid refund amount");
      return { kind: "error", error: "Invalid refund amount." };
    }

    const useVoid = false;
    const reversalType =
      amount >= payment.availableForRefund ? "refund" : "partial_refund";

    // Step 1 — create_reversal
    const { data: reversal, error: reversalError } =
      await OrderService.createReversal(
        this.supabase,
        {
          original_payment_id: payment.paymentId,
          original_psp_reference: payment.rrn,
          reversal_reference_id: this.buildReversalRefId(context),
          reversal_type: reversalType,
          amount,
          reason_code: request.reason,
          reason_description: request.reasonDetail ?? null,
          initiated_by: request.initiatedBy,
          approved_by: request.approvedBy ?? null,
        },
        { keyOverride: toRefundStepKey(idempotencyKey, "create_reversal") },
      );

    if (reversalError || !reversal) {
      const err = reversalError?.message || "Failed to create reversal.";
      if (isTransientRpcError(reversalError)) {
        failRefundJournal(journalId, "create_reversal", err);
        return {
          kind: "verifying",
          journalId,
          failedStep: "create_reversal",
          reason: err,
        };
      }
      failRefundJournal(journalId, "create_reversal", err);
      return { kind: "error", error: err };
    }

    updateRefundJournal(journalId, { reversalId: reversal.id });

    const effectiveTerminalId =
      payment.terminalId || request.payment_terminal_id || "";
    const effectiveTerminal =
      payment.terminalConfig ??
      (request.payment_terminal?.id === effectiveTerminalId
        ? request.payment_terminal
        : undefined);

    // Step 2 — terminal_refund
    const terminalResult = await this.processTerminalRefund(
      payment,
      amount,
      useVoid,
      effectiveTerminalId,
      effectiveTerminal,
      journalId,
    );

    if (!terminalResult.success) {
      try {
        const failedResponse = terminalResult.terminalResponse as
          | Record<string, unknown>
          | undefined;
        await OrderService.updateReversalStatus(
          this.supabase,
          reversal.id,
          "failed",
          failedResponse ?? null,
          undefined,
          undefined,
          undefined,
          undefined,
          {
            keyOverride: toRefundStepKey(
              idempotencyKey,
              "update_reversal_status",
            ),
          },
        );
      } catch {}
      Sentry.captureException(
        new Error(terminalResult.error ?? "Terminal refund failed"),
        {
          tags: {
            source: "refund_terminal",
            type: "partial",
            orderId: request.orderId,
          },
        },
      );
      failRefundJournal(
        journalId,
        "terminal_refund",
        terminalResult.error ?? "Terminal declined",
      );
      return {
        kind: "error",
        error: terminalResult.error ?? "Terminal refund failed.",
      };
    }

    updateRefundJournal(journalId, { status: "terminal_approved" });

    const terminalResponse = terminalResult.terminalResponse as
      | Record<string, unknown>
      | undefined;
    const approval = parseRefundApproval(terminalResponse);
    const returnDetails = {
      rrn: approval.rrn ?? undefined,
      authCode: approval.authCode ?? undefined,
      referenceId: approval.referenceId ?? undefined,
      transactionNumber: approval.transactionNumber ?? undefined,
      reason: request.reasonDetail,
      initiatedBy: request.initiatedBy,
    };

    const dbErrors: string[] = [];

    // Steps 3 + 4 — update_reversal_status and apply_refund_to_payment (parallel)
    const [reversalResult, paymentResult] = await Promise.all([
      OrderService.updateReversalStatus(
        this.supabase,
        reversal.id,
        "completed",
        terminalResponse ?? null,
        (terminalResponse?.EMVData as Record<string, unknown>) ?? null,
        approval.resultCode,
        approval.responseMessage,
        approval.rrn,
        {
          keyOverride: toRefundStepKey(
            idempotencyKey,
            "update_reversal_status",
          ),
        },
      ),
      OrderService.applyRefundToPayment(
        this.supabase,
        payment.paymentId,
        amount,
        reversalType,
        returnDetails,
        undefined,
        {
          keyOverride: toRefundStepKey(
            idempotencyKey,
            "apply_refund_to_payment",
          ),
        },
      ),
    ]);

    const transientErr = isTransientRpcError(reversalResult.error)
      ? {
          step: "update_reversal_status" as RefundPipelineStep,
          err: reversalResult.error,
        }
      : isTransientRpcError(paymentResult.error)
        ? {
            step: "apply_refund_to_payment" as RefundPipelineStep,
            err: paymentResult.error,
          }
        : null;
    if (transientErr) {
      const msg = (transientErr.err as any)?.message ?? "Transient RPC error";
      return {
        kind: "verifying",
        journalId,
        failedStep: transientErr.step,
        reason: msg,
      };
    }

    if (reversalResult.error) {
      console.error(
        "[RefundService] updateReversalStatus error:",
        reversalResult.error,
      );
      dbErrors.push(
        `Reversal status update failed: ${reversalResult.error.message || reversalResult.error}`,
      );
    }
    if (paymentResult.error) {
      console.error(
        "[RefundService] applyRefundToPayment error:",
        paymentResult.error,
      );
      dbErrors.push(
        `Payment update failed: ${paymentResult.error.message || paymentResult.error}`,
      );
    }

    // Wave R-SC: record proportional per-item refund rows so partial-amount
    // refunds leave an item-level audit trail (CFD/printed receipt/reports
    // currently see only a lump amount with no breakdown). Skip qty updates
    // — partial-amount refunds don't return units, just dollars. Only fire
    // when the payment-row update succeeded; otherwise the audit rows would
    // dangle.
    if (!paymentResult.error) {
      try {
        const { data: paymentItems } = await this.supabase
          .from("order_payment_items")
          .select(
            "id, order_item_id, quantity_paid, unit_price_paid, subtotal_paid, tax_paid",
          )
          .eq("order_payment_id", payment.paymentId);

        const itemsTotal = (paymentItems || []).reduce(
          (s: number, pi: any) =>
            s + Number(pi.subtotal_paid || 0) + Number(pi.tax_paid || 0),
          0,
        );

        if (itemsTotal > 0 && paymentItems && paymentItems.length > 0) {
          // Distribute the user-typed amount proportionally across paid items,
          // weighted by each item's (subtotal_paid + tax_paid). The last row
          // absorbs the rounding remainder so SUM(total_refunded) === amount.
          let distributed = 0;
          const proportionalRows = paymentItems.map(
            (pi: any, idx: number) => {
              const itemSlice =
                Number(pi.subtotal_paid || 0) + Number(pi.tax_paid || 0);
              const ratio = itemsTotal > 0 ? itemSlice / itemsTotal : 0;
              const isLast = idx === paymentItems.length - 1;
              const subtotalRefunded = round2(
                amount * (Number(pi.subtotal_paid || 0) / itemsTotal),
              );
              const taxRefunded = round2(
                amount * (Number(pi.tax_paid || 0) / itemsTotal),
              );
              const proportionalTotal = round2(amount * ratio);
              const totalRefunded = isLast
                ? round2(amount - distributed)
                : proportionalTotal;
              distributed = round2(distributed + totalRefunded);
              return {
                order_item_id: pi.order_item_id,
                order_payment_item_id: pi.id,
                // quantity_refunded=0 marks this as an operator-amount refund,
                // not a unit-return (no inventory side-effects). Schema allows
                // it (no CHECK > 0); record_refund_items_v2 is called with
                // skipQuantityUpdate=true so refunded_quantity isn't bumped.
                quantity_refunded: 0,
                unit_price_refunded: 0,
                subtotal_refunded: subtotalRefunded,
                tax_refunded: taxRefunded,
                total_refunded: totalRefunded,
                refund_reason: request.reason,
                refund_reason_detail:
                  request.reasonDetail ?? "Operator partial amount",
                return_to_inventory: false,
                inventory_updated: false,
              };
            },
          );

          const recordResult = await OrderService.recordRefundItems(
            this.supabase,
            reversal.id,
            proportionalRows,
            true, // skipQuantityUpdate
            {
              keyOverride: toRefundStepKey(idempotencyKey, "record_refund_items"),
            },
          );
          if (recordResult.error) {
            console.warn(
              "[RefundService] partial-refund record_refund_items failed (non-fatal):",
              recordResult.error,
            );
          }
        }
      } catch (err) {
        // Non-fatal: partial refund succeeded server-side; the audit row is
        // an enhancement, not a correctness requirement.
        console.warn(
          "[RefundService] partial-refund record_refund_items threw (non-fatal):",
          err,
        );
      }
    }

    // Step 6 — update_order_payment_status
    const orderResult = await OrderService.updateOrderPaymentStatusAfterRefund(
      this.supabase,
      request.orderId,
      {
        keyOverride: toRefundStepKey(
          idempotencyKey,
          "update_order_payment_status",
        ),
      },
    );
    if (isTransientRpcError(orderResult.error)) {
      const msg = (orderResult.error as any)?.message ?? "Transient RPC error";
      return {
        kind: "verifying",
        journalId,
        failedStep: "update_order_payment_status",
        reason: msg,
      };
    }
    if (orderResult.error) {
      console.error(
        "[RefundService] updateOrderPaymentStatus error:",
        orderResult.error,
      );
      dbErrors.push(
        `Order status update failed: ${orderResult.error.message || orderResult.error}`,
      );
    }

    completeRefundJournal(journalId, reversal.id);
    return {
      kind: "success",
      data: {
        success: true,
        reversalId: reversal.id,
        terminalResponse: terminalResult.terminalResponse,
        error:
          dbErrors.length > 0
            ? `Refund processed but: ${dbErrors.join("; ")}`
            : undefined,
      },
    };
  }

  private async processItemReturn(
    request: RefundRequest,
    context: RefundContext,
    items: RefundItemRequest[],
    parentBatchKey: string,
  ): Promise<RefundRpcOutcome<RefundResult>> {
    const allocation = await this.buildItemRefundAllocation(
      request.orderId,
      items,
    );

    if (allocation.totalRefund <= 0) {
      return { kind: "error", error: "No refundable amount found for items." };
    }

    const reversals: Array<{
      reversalId: string;
      paymentId: string;
      amount: number;
    }> = [];
    const errors: string[] = [];
    let terminalRefundCount = 0;
    let batchIndex = 0;
    // When a terminal refund fails with a transport-death error (terminal hung /
    // USB read died / app-layer wedge), STOP — firing the next item's refund into
    // a dead terminal just compounds the failure (and was a factor in the S1-0002
    // crash where the 2nd item's refund hung the USB terminal). Clean declines do
    // not set this; they continue to the next item.
    let terminalDead = false;

    refundLoop: for (const paymentAllocation of allocation.items) {
      const paymentTotals: Record<string, number> = {};
      for (const alloc of paymentAllocation.paymentAllocations) {
        paymentTotals[alloc.paymentId] =
          (paymentTotals[alloc.paymentId] || 0) + alloc.total;
      }

      for (const [paymentId, itemsTotal] of Object.entries(paymentTotals)) {
        const payment = context.payments.find((p) => p.paymentId === paymentId);
        if (!payment) {
          errors.push(`Payment ${paymentId} not found`);
          continue;
        }

        // Wave R-SC: fold the per-payment SC share into the refund amount so
        // the customer gets back items + tax + SC (not just items + tax).
        // process_payment_v14 baked SC into op.amount; the per-item rows
        // (subtotal_paid + tax_paid) only carry the items+tax slice. Without
        // this share, apply_refund_to_payment_v4's proportional SC reversal
        // (delta_sc = SC × refund/op.amount) under-collects on every item
        // refund where SC was present. See computeItemRefundAmount above.
        const { amount } = computeItemRefundAmount(payment, itemsTotal);

        // Each payment gets a deterministic sub-key from the parent batch key + index.
        const subKey = toRefundStepKey(
          parentBatchKey,
          `create_reversal_${batchIndex}` as any,
        );
        const subJournalId = writeRefundJournal({
          orderId: request.orderId,
          refundType: "item_return",
          amount,
          paymentMethod: payment.paymentMethod?.toString() ?? "unknown",
          originalPaymentId: paymentId,
          idempotencyKey: subKey,
          parentBatchId: parentBatchKey,
        });
        batchIndex++;

        if (terminalRefundCount > 0) {
          await new Promise((resolve) => setTimeout(resolve, 3000));
        }

        const { data: reversal, error: reversalError } =
          await OrderService.createReversal(
            this.supabase,
            {
              original_payment_id: payment.paymentId,
              original_psp_reference: payment.rrn,
              reversal_reference_id: this.buildReversalRefId(context),
              reversal_type: "item_return",
              amount,
              reason_code: request.reason,
              reason_description: request.reasonDetail ?? null,
              initiated_by: request.initiatedBy,
              approved_by: request.approvedBy ?? null,
            },
            { keyOverride: toRefundStepKey(subKey, "create_reversal") },
          );

        if (reversalError || !reversal) {
          const err = reversalError?.message || "Failed to create reversal.";
          if (isTransientRpcError(reversalError)) {
            failRefundJournal(subJournalId, "create_reversal", err);
            errors.push(err);
            continue;
          }
          failRefundJournal(subJournalId, "create_reversal", err);
          errors.push(err);
          continue;
        }

        updateRefundJournal(subJournalId, { reversalId: reversal.id });

        terminalRefundCount++;
        const terminalResult = await this.processTerminalRefund(
          payment,
          amount,
          false,
          request.payment_terminal_id ?? payment.terminalId ?? "",
          request.payment_terminal ?? undefined,
          subJournalId,
        );

        if (!terminalResult.success) {
          try {
            const failedResponse = terminalResult.terminalResponse as
              | Record<string, unknown>
              | undefined;
            await OrderService.updateReversalStatus(
              this.supabase,
              reversal.id,
              "failed",
              failedResponse ?? null,
              undefined,
              undefined,
              undefined,
              undefined,
              {
                keyOverride: toRefundStepKey(subKey, "update_reversal_status"),
              },
            );
          } catch {}
          Sentry.captureException(
            new Error(terminalResult.error ?? "Terminal refund failed"),
            {
              tags: {
                source: "refund_terminal",
                type: "item_return",
                orderId: request.orderId,
              },
            },
          );
          failRefundJournal(
            subJournalId,
            "terminal_refund",
            terminalResult.error ?? "Terminal declined",
          );
          errors.push(terminalResult.error || "Terminal refund failed.");

          // Fail-fast: if the terminal/transport is dead (not a clean decline),
          // stop the whole batch — any remaining items would just be fired into
          // a wedged terminal. Already-succeeded items have each been reconciled
          // per-iteration below, so the order stays consistent for them.
          if (isTerminalTransportDead(terminalResult.error)) {
            terminalDead = true;
            break refundLoop;
          }
          continue;
        }

        updateRefundJournal(subJournalId, { status: "terminal_approved" });

        const terminalResponse = terminalResult.terminalResponse as
          | Record<string, unknown>
          | undefined;
        const approval = parseRefundApproval(terminalResponse);
        const returnDetails = {
          rrn: approval.rrn ?? undefined,
          authCode: approval.authCode ?? undefined,
          referenceId: approval.referenceId ?? undefined,
          transactionNumber: approval.transactionNumber ?? undefined,
          reason: request.reasonDetail,
          initiatedBy: request.initiatedBy,
        };

        const [reversalStatusResult, paymentRefundResult] = await Promise.all([
          OrderService.updateReversalStatus(
            this.supabase,
            reversal.id,
            "completed",
            terminalResponse ?? null,
            (terminalResponse?.EMVData as Record<string, unknown>) ?? null,
            approval.resultCode,
            approval.responseMessage,
            approval.rrn,
            { keyOverride: toRefundStepKey(subKey, "update_reversal_status") },
          ),
          OrderService.applyRefundToPayment(
            this.supabase,
            payment.paymentId,
            amount,
            "item_return",
            returnDetails,
            undefined,
            { keyOverride: toRefundStepKey(subKey, "apply_refund_to_payment") },
          ),
        ]);

        if (
          isTransientRpcError(reversalStatusResult.error) ||
          isTransientRpcError(paymentRefundResult.error)
        ) {
          const failedStep = isTransientRpcError(reversalStatusResult.error)
            ? ("update_reversal_status" as RefundPipelineStep)
            : ("apply_refund_to_payment" as RefundPipelineStep);
          const err = isTransientRpcError(reversalStatusResult.error)
            ? (reversalStatusResult.error as any)?.message
            : (paymentRefundResult.error as any)?.message;
          errors.push(`Transient error on ${failedStep}: ${err ?? "unknown"}`);
          continue;
        }

        if (reversalStatusResult.error) {
          console.error(
            "[RefundService] Item return - updateReversalStatus error:",
            reversalStatusResult.error,
          );
          errors.push(
            `Reversal status update failed: ${reversalStatusResult.error.message || reversalStatusResult.error}`,
          );
        }
        if (paymentRefundResult.error) {
          console.error(
            "[RefundService] Item return - applyRefundToPayment error:",
            paymentRefundResult.error,
          );
          errors.push(
            `Payment update failed: ${paymentRefundResult.error.message || paymentRefundResult.error}`,
          );
        }

        const refundItems = paymentAllocation.paymentAllocations.map(
          (alloc) => ({
            order_item_id: paymentAllocation.orderItemId,
            order_payment_item_id: alloc.paymentItemId,
            quantity_refunded: alloc.quantity,
            unit_price_refunded: alloc.unitPrice,
            subtotal_refunded: alloc.subtotal,
            tax_refunded: alloc.tax,
            total_refunded: alloc.total,
            refund_reason: paymentAllocation.reason,
            refund_reason_detail: paymentAllocation.reasonDetail,
            return_to_inventory: paymentAllocation.returnToInventory,
            inventory_updated: false,
          }),
        );

        await OrderService.recordRefundItems(
          this.supabase,
          reversal.id,
          refundItems,
          false,
          { keyOverride: toRefundStepKey(subKey, "record_refund_items") },
        );

        completeRefundJournal(subJournalId, reversal.id);
        reversals.push({ reversalId: reversal.id, paymentId, amount });

        // Reconcile order-level totals NOW, per successful item, instead of only
        // once after the whole loop. apply_refund_to_payment only updates the
        // order_payments row; only update_order_payment_status_after_refund
        // recomputes orders.amount_paid/amount_due/payment_status. Doing it here
        // means a crash on a LATER item can't strand this item's refund (the
        // S1-0002 bug: item #1's $39.59 refund committed, then the crash on item
        // #2 skipped the single trailing reconcile, leaving the order stuck at
        // amount_due=$39.59 / payment_status=partial). The key is unique per
        // iteration (derived from subKey) and distinct from the trailing call's
        // key (derived from parentBatchKey), so idempotency dedup never swallows
        // the final convergence. Tolerate transient failures — the trailing
        // reconcile is the backstop.
        const perItemReconcile =
          await OrderService.updateOrderPaymentStatusAfterRefund(
            this.supabase,
            request.orderId,
            {
              keyOverride: toRefundStepKey(
                subKey,
                "update_order_payment_status",
              ),
            },
          );
        if (perItemReconcile.error && !isTransientRpcError(perItemReconcile.error)) {
          console.error(
            "[RefundService] Item return - per-item reconcile error:",
            perItemReconcile.error,
          );
        }
      }
    }

    // Nothing refunded → this is a FAILURE, not a success. Route it through the
    // error path so every consumer (modals + store) shows "Refund Failed" and the
    // store bails before marking anything refunded or running applyRefundRecovery.
    // (processFullPaymentRefund already returns kind:"error" on terminal failure;
    // item-return previously returned kind:"success" with success:false, which the
    // UI rendered as a green "Refund Successful" — the reported unplug bug.)
    if (reversals.length === 0) {
      const message = terminalDead
        ? "Terminal offline — no items were refunded. Reconnect the terminal and try again."
        : errors.length > 0
          ? errors.join("; ")
          : "No items were refunded.";
      return { kind: "error", error: message };
    }

    const orderStatusResult =
      await OrderService.updateOrderPaymentStatusAfterRefund(
        this.supabase,
        request.orderId,
        {
          keyOverride: toRefundStepKey(
            parentBatchKey,
            "update_order_payment_status",
          ),
        },
      );
    if (orderStatusResult.error) {
      console.error(
        "[RefundService] updateOrderPaymentStatus error:",
        orderStatusResult.error,
      );
    }

    // ≥1 item refunded. If the terminal died partway, surface a partial-success
    // message so the UI can warn (not green-success) that the rest were skipped.
    const errorParts = [...errors];
    if (terminalDead) {
      errorParts.unshift(
        `Terminal went offline mid-refund — ${reversals.length} item refund(s) completed; remaining items were NOT refunded. Reconnect the terminal and retry the rest.`,
      );
    }

    return {
      kind: "success",
      data: {
        success: true,
        reversals,
        error: errorParts.length > 0 ? errorParts.join("; ") : undefined,
      },
    };
  }

  private async processTerminalRefund(
    payment: PaymentRefundContext,
    amount: number,
    useVoid: boolean,
    terminalId: string,
    terminal: StationPaymentTerminal | undefined,
    journalId?: string,
  ): Promise<{
    success: boolean;
    terminalResponse?: DejavooRefundResponse | Record<string, unknown>;
    error?: string;
  }> {
    // Cash payments don't go through the terminal — just succeed immediately
    if (payment.paymentMethod?.toLowerCase() === "cash") {
      return { success: true };
    }

    // In-kind is a non-tender settlement: no processor ever saw it, and it
    // carries no terminal_id, reference_id or auth code. Routed like cash so
    // the reversal is recorded in the DB only. Without this it would fall
    // through to the terminal path below and fail the missing-reference guard
    // — leaving the payment un-reversible.
    if (isInKindMethod(payment.paymentMethod)) {
      return { success: true };
    }

    // ATOM (on-device) payments have NO terminal_id (loopback, no DB terminal
    // row) and are identified by the stored ATOM paymentId. Route here BEFORE
    // the terminalId guards, and independent of the station's configured terminal.
    if (payment.atomPaymentId) {
      return this.processAtomTerminalRefund(payment, amount, useVoid);
    }

    // Check for missing required fields with specific error messages
    console.log("processTerminalRefund Payment", payment);
    if (!terminalId && !payment.referenceId) {
      return {
        success: false,
        error:
          "Missing both terminal ID and reference ID. Cannot process terminal refund.",
      };
    }
    if (!terminalId) {
      return {
        success: false,
        error:
          "Missing terminal ID. The payment was not processed through a terminal.",
      };
    }
    if (!payment.referenceId) {
      return {
        success: false,
        error: "Missing reference ID. Cannot locate original transaction.",
      };
    }

    // Route to the correct terminal integration based on terminal type
    const terminalType = terminal?.terminal_type ?? "dejavoo";

    if (terminalType === "castles") {
      return this.processCastlesTerminalRefund(
        payment,
        amount,
        useVoid,
        terminal!,
        journalId,
      );
    }

    if (terminalType === "valor") {
      return this.processValorTerminalRefund(
        payment,
        amount,
        useVoid,
        terminal!,
      );
    }

    // Dejavoo flow
    const api = new DejavooSpinAPI(this.supabase);
    const loaded = await api.loadTerminal(terminalId, terminal);
    if (!loaded) {
      return { success: false, error: "Failed to load terminal credentials." };
    }

    console.log("processTerminalRefund Loaded Terminal", loaded);

    if (useVoid) {
      const result = await api
        .void()
        .amount(amount)
        .referenceId(payment.referenceId)
        .paymentType("Credit")
        .execute();
      return {
        success: result.success,
        terminalResponse: result.data as DejavooRefundResponse | undefined,
        error: result.error,
      };
    }

    const result = await api
      .return()
      .amount(amount)
      .originalRefId(payment.referenceId)
      .paymentType("Credit")
      .execute();

    return {
      success: result.success,
      terminalResponse: result.data as DejavooRefundResponse | undefined,
      error: result.error,
    };
  }

  private async processCastlesTerminalRefund(
    payment: PaymentRefundContext,
    amount: number,
    useVoid: boolean,
    terminal: StationPaymentTerminal,
    journalId?: string,
  ): Promise<{
    success: boolean;
    terminalResponse?: Record<string, unknown>;
    error?: string;
  }> {
    const isUsb = terminal.connection_type === 'usb';
    if (!isUsb && !terminal.ip_address) {
      return { success: false, error: "Castles terminal missing IP address." };
    }

    const castles = getSharedCastlesService();
    try {
      await castles.connect({
        connectionType: isUsb ? 'usb' : 'local_socket',
        host: isUsb ? undefined : terminal.ip_address,
        port: isUsb ? undefined : (terminal.port ?? CASTLES_DEFAULT_PORT),
        timeout: CASTLES_SOCKET_TIMEOUT_MS,
        terminalId: terminal.id,
      });

      const counter = getOrCreateCounter({
        terminalId: terminal.id,
        supabaseClient: this.supabase,
      });
      // Counter is MMKV-backed and must hydrate from disk/DB before next()
      // is callable. Every other counter callsite does this check; the
      // refund path was the only one missing it, so the first refund after
      // any boot threw "Not initialized. Call await initialize() first."
      if (!counter.isInitialized) await counter.initialize();
      const referenceId = counter.next();

      if (useVoid) {
        const rrn = payment.rrn || undefined;
        const stan = payment.stan || undefined;
        if (!rrn && !stan) {
          return {
            success: false,
            error: "Cannot void: no RRN or STAN from original transaction.",
          };
        }
        const result = await castles.processVoid({
          rrn,
          stan,
          referenceId,
          journalId,
        });
        return {
          success: result.success,
          terminalResponse: result.terminalResponse,
          error: result.error,
        };
      }

      const result = await castles.processRefund({
        amount,
        referenceId,
        journalId,
      });
      return {
        success: result.success,
        terminalResponse: result.terminalResponse,
        error: result.error,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[RefundService] Castles terminal refund error:", message);
      Sentry.captureException(err instanceof Error ? err : new Error(message), {
        tags: {
          source: "castles_refund",
          terminal_ip: terminal.ip_address ?? "unknown",
        },
      });
      return { success: false, error: message };
    }
  }

  private async processValorTerminalRefund(
    payment: PaymentRefundContext,
    amount: number,
    useVoid: boolean,
    terminal: StationPaymentTerminal,
  ): Promise<{
    success: boolean;
    terminalResponse?: Record<string, unknown>;
    error?: string;
  }> {
    const isUsb = terminal.connection_type === "usb";
    if (!isUsb && !terminal.ip_address) {
      return { success: false, error: "Valor terminal missing IP address." };
    }

    const valor = getSharedValorService();
    try {
      await valor.connect({
        connectionType: isUsb ? "usb" : "local_socket",
        host: isUsb ? undefined : terminal.ip_address,
        port: isUsb ? undefined : (terminal.port ?? VALOR_DEFAULT_PORT),
        cancelPort: terminal.cancel_port,
        epi: terminal.epi,
        timeout: VALOR_SALE_TIMEOUT_MS,
        terminalId: terminal.id,
      });

      const counter = getOrCreateValorCounter({
        terminalId: terminal.id,
        supabaseClient: this.supabase,
      });
      if (!counter.isInitialized) await counter.initialize();
      const referenceId = counter.next();

      if (useVoid) {
        // Valor void references the original by TRAN_NO (or CARD_NO last-4) —
        // NOT rrn/stan.
        const tranNo = payment.tranNo || undefined;
        const cardNo = payment.cardLast4 || undefined;
        if (!tranNo && !cardNo) {
          return {
            success: false,
            error: "Cannot void: no TRAN_NO or card last-4 from original transaction.",
          };
        }
        const result = await valor.processVoid({ tranNo, cardNo, referenceId });
        return {
          success: result.success,
          terminalResponse: result.terminalResponse,
          error: result.error,
        };
      }

      const result = await valor.processRefund({ amount, referenceId });
      return {
        success: result.success,
        terminalResponse: result.terminalResponse,
        error: result.error,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[RefundService] Valor terminal refund error:", message);
      Sentry.captureException(err instanceof Error ? err : new Error(message), {
        tags: {
          source: "valor_refund",
          terminal_ip: terminal.ip_address ?? "unknown",
        },
      });
      return { success: false, error: message };
    }
  }

  /**
   * ATOM (on-device / loopback) terminal refund. ATOM does a LINKED refund by
   * paymentId — no card re-presentment. For a full void (unsettled + no prior
   * refunds) we omit `amount` so ATOM auto-voids (cheapest); otherwise we send
   * the amount. Amounts are DOLLARS. Config comes from the surfaced internal
   * ATOM terminal (loopback), not the station's configured terminal.
   */
  private async processAtomTerminalRefund(
    payment: PaymentRefundContext,
    amount: number,
    useVoid: boolean,
  ): Promise<{
    success: boolean;
    terminalResponse?: Record<string, unknown>;
    error?: string;
  }> {
    const paymentId = payment.atomPaymentId;
    if (!paymentId) {
      return {
        success: false,
        error: "Cannot refund: missing ATOM paymentId from original transaction.",
      };
    }
    const internal = useAtomTerminalStore.getState().internalTerminal;
    const port =
      internal?.port ?? useAtomTerminalStore.getState().port ?? undefined;
    if (!internal || !port) {
      return {
        success: false,
        error:
          "On-device ATOM terminal not reachable. Open the ATOM app and retry.",
      };
    }

    try {
      const service = getSharedAtomService();
      service.configure({
        host: internal.ip_address ?? ATOM_LOOPBACK_HOST,
        port,
        terminalId: internal.id,
        timeout: ATOM_SALE_TIMEOUT_MS,
      });
      const referenceId = `ATOMCXL_${Date.now()}`;
      // Full reversal → /cancel (ATOM auto-routes COMPLETED→Return, APPROVED→Void).
      // This replaces the old /refund-with-omitted-amount path, which ATOM rejects
      // (NOT_ALLOWED) on a captured sale. Partial (or post-settlement) → linked
      // return for the exact amount via /refund.
      // Pause loopback probing for the reversal (single-session terminal).
      suspendAtomLoopbackProbing();
      const result = await (useVoid
        ? service.cancel({ paymentId, referenceId })
        : service.refund({ paymentId, amount, referenceId })
      ).finally(() => resumeAtomLoopbackProbing());
      return {
        success: result.success,
        terminalResponse: result.terminalResponse,
        error: result.error,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[RefundService] ATOM terminal refund error:", message);
      Sentry.captureException(err instanceof Error ? err : new Error(message), {
        tags: { source: "atom_refund" },
      });
      return { success: false, error: message };
    }
  }

  private async buildItemRefundAllocation(
    orderId: string,
    items: RefundItemRequest[],
  ): Promise<ItemRefundAllocation> {
    const allocation: ItemRefundAllocation = { items: [], totalRefund: 0 };

    for (const itemRequest of items) {
      const { data: orderItem } = await this.supabase
        .from("order_items")
        .select("id, quantity, paid_quantity, refunded_quantity")
        .eq("id", itemRequest.orderItemId)
        .single();

      if (!orderItem) continue;

      const alreadyRefunded = Number(orderItem.refunded_quantity || 0);
      const paidQuantity = Number(orderItem.paid_quantity || 0);
      const maxRefundable = paidQuantity - alreadyRefunded;
      const quantityToRefund = Math.min(
        itemRequest.quantityToRefund,
        maxRefundable,
      );

      if (quantityToRefund <= 0) continue;

      const { data: paymentItems } = await this.supabase
        .from("order_payment_items")
        .select(
          "id, order_payment_id, quantity_paid, unit_price_paid, subtotal_paid, tax_paid, created_at",
        )
        .eq("order_item_id", itemRequest.orderItemId)
        .gt("quantity_paid", 0);

      let remainingQty = quantityToRefund;
      const paymentAllocations = [];

      const sortedPaymentItems = (paymentItems || []).sort(
        (a: any, b: any) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );

      for (const pi of sortedPaymentItems) {
        if (remainingQty <= 0) break;
        const availableQty = Number(pi.quantity_paid || 0);
        const qtyFromThis = Math.min(remainingQty, availableQty);
        if (qtyFromThis <= 0) continue;

        // Use subtotal_paid (post-discount) to compute effective unit price
        // subtotal_paid already accounts for discounts applied at payment time
        // Use != null (not > 0) to preserve subtotal_paid=0 for fully discounted items
        const unitPrice =
          availableQty > 0 && pi.subtotal_paid != null
            ? Number(pi.subtotal_paid) / availableQty
            : Number(pi.unit_price_paid || 0);
        const taxPerUnit =
          availableQty > 0 ? Number(pi.tax_paid || 0) / availableQty : 0;
        const subtotal = round2(qtyFromThis * unitPrice);
        const tax = round2(qtyFromThis * taxPerUnit);
        paymentAllocations.push({
          paymentId: pi.order_payment_id,
          paymentItemId: pi.id,
          quantity: qtyFromThis,
          unitPrice,
          subtotal,
          tax,
          total: round2(subtotal + tax),
        });

        remainingQty -= qtyFromThis;
        allocation.totalRefund += subtotal + tax;
      }

      allocation.items.push({
        orderItemId: itemRequest.orderItemId,
        quantityRefunded: quantityToRefund - remainingQty,
        reason: itemRequest.reason,
        reasonDetail: itemRequest.reasonDetail,
        returnToInventory: itemRequest.returnToInventory ?? false,
        paymentAllocations,
      });
    }

    return allocation;
  }

  private async buildFullRefundItems(
    orderId: string,
    reversalId: string,
    reason: string,
    reasonDetail?: string,
  ): Promise<Array<Record<string, unknown>>> {
    const { data: items } = await this.supabase
      .from("order_items")
      .select(
        "id, quantity, paid_quantity, refunded_quantity, unit_price, discount_amount, subtotal, tax_amount",
      )
      .eq("order_id", orderId);

    return (items || [])
      .map((item: any) => {
        const paidQuantity = Number(item.paid_quantity || 0);
        const alreadyRefunded = Number(item.refunded_quantity || 0);
        const qty = Math.max(0, paidQuantity - alreadyRefunded);
        if (qty <= 0) return null;

        // Use discounted unit price when discount exists
        // subtotal is post-discount for the full quantity, so divide by quantity
        const itemQuantity = Number(item.quantity || 1);
        const unitPrice =
          itemQuantity > 0 && Number(item.discount_amount || 0) > 0
            ? Number(item.subtotal || 0) / itemQuantity
            : Number(item.unit_price || 0);
        // Tax is already computed on discounted amount, prorate by quantity
        const taxPerUnit =
          itemQuantity > 0 ? Number(item.tax_amount || 0) / itemQuantity : 0;
        const subtotal = round2(qty * unitPrice);
        const tax = round2(qty * taxPerUnit);
        return {
          reversal_id: reversalId,
          order_item_id: item.id,
          quantity_refunded: qty,
          unit_price_refunded: unitPrice,
          subtotal_refunded: subtotal,
          tax_refunded: tax,
          total_refunded: round2(subtotal + tax),
          refund_reason: reason,
          refund_reason_detail: reasonDetail,
          return_to_inventory: false,
          inventory_updated: false,
        };
      })
      .filter(Boolean) as Array<Record<string, unknown>>;
  }
}
