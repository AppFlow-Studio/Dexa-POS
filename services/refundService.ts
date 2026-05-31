import { isTransientRpcError } from "@/lib/network/idempotencyKey";
import { DejavooSpinAPI } from "@/lib/payments/dejavoo-spin-api";
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
import { getSharedCastlesService } from "@/services/terminals/castles-service";
import { getOrCreateCounter } from "@/services/terminals/castles-txn-counter";
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
        return {
          paymentId: p.id,
          referenceId: p.reference_number || p.transaction_id || "",
          rrn: p.rrn || "",
          stan,
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

    const useVoid = payment.isVoidable;
    const reversalType = useVoid ? "void" : "refund";

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
    const generalResponse =
      (terminalResponse?.GeneralResponse as {
        ResultCode?: string;
        Message?: string;
      }) ?? undefined;
    const castlesTxn = terminalResponse?.castles_transaction as
      | Record<string, unknown>
      | undefined;
    const returnDetails = {
      rrn: (terminalResponse?.RRN ??
        terminalResponse?.rrn ??
        castlesTxn?.rrn) as string | undefined,
      authCode: (terminalResponse?.AuthCode ??
        terminalResponse?.authCode ??
        castlesTxn?.approvalCode) as string | undefined,
      referenceId: (terminalResponse?.ReferenceId ??
        terminalResponse?.referenceId ??
        castlesTxn?.referenceId) as string | undefined,
      transactionNumber: (terminalResponse?.TransactionNumber ??
        terminalResponse?.transactionNumber ??
        castlesTxn?.stan) as string | undefined,
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
        generalResponse?.ResultCode ?? null,
        generalResponse?.Message ?? null,
        ((terminalResponse?.RRN ??
          terminalResponse?.rrn ??
          castlesTxn?.rrn ??
          terminalResponse?.PNReferenceId) as string) ?? null,
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
        { restorePaidQuantity: true },
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

    const useVoid = payment.isVoidable && amount >= payment.availableForRefund;
    const reversalType = useVoid ? "void" : "partial_refund";

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
    const generalResponse =
      (terminalResponse?.GeneralResponse as {
        ResultCode?: string;
        Message?: string;
      }) ?? undefined;
    const castlesTxn = terminalResponse?.castles_transaction as
      | Record<string, unknown>
      | undefined;
    const returnDetails = {
      rrn: (terminalResponse?.RRN ??
        terminalResponse?.rrn ??
        castlesTxn?.rrn) as string | undefined,
      authCode: (terminalResponse?.AuthCode ??
        terminalResponse?.authCode ??
        castlesTxn?.approvalCode) as string | undefined,
      referenceId: (terminalResponse?.ReferenceId ??
        terminalResponse?.referenceId ??
        castlesTxn?.referenceId) as string | undefined,
      transactionNumber: (terminalResponse?.TransactionNumber ??
        terminalResponse?.transactionNumber ??
        castlesTxn?.stan) as string | undefined,
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
        generalResponse?.ResultCode ?? null,
        generalResponse?.Message ?? null,
        ((terminalResponse?.RRN ??
          terminalResponse?.rrn ??
          castlesTxn?.rrn ??
          terminalResponse?.PNReferenceId) as string) ?? null,
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

    for (const paymentAllocation of allocation.items) {
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
          continue;
        }

        updateRefundJournal(subJournalId, { status: "terminal_approved" });

        const terminalResponse = terminalResult.terminalResponse as
          | Record<string, unknown>
          | undefined;
        const generalResponse =
          (terminalResponse?.GeneralResponse as {
            ResultCode?: string;
            Message?: string;
          }) ?? undefined;
        const returnDetails = {
          rrn: (terminalResponse?.RRN ?? terminalResponse?.rrn) as
            | string
            | undefined,
          authCode: (terminalResponse?.AuthCode ??
            terminalResponse?.authCode) as string | undefined,
          referenceId: (terminalResponse?.ReferenceId ??
            terminalResponse?.referenceId) as string | undefined,
          transactionNumber: (terminalResponse?.TransactionNumber ??
            terminalResponse?.transactionNumber) as string | undefined,
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
            generalResponse?.ResultCode ?? null,
            generalResponse?.Message ?? null,
            ((terminalResponse?.RRN ??
              terminalResponse?.PNReferenceId) as string) ?? null,
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
      }
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

    return {
      kind: "success",
      data: {
        success: reversals.length > 0,
        reversals,
        error: errors.length > 0 ? errors.join("; ") : undefined,
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
    if (!terminal.ip_address) {
      return { success: false, error: "Castles terminal missing IP address." };
    }

    const castles = getSharedCastlesService();
    try {
      await castles.connect({
        host: terminal.ip_address,
        port: terminal.port ?? CASTLES_DEFAULT_PORT,
        timeout: CASTLES_SOCKET_TIMEOUT_MS,
        terminalId: terminal.id,
      });

      const counter = getOrCreateCounter({
        terminalId: terminal.id,
        supabaseClient: this.supabase,
      });
      const referenceId = await counter.next();

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
