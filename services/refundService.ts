import { DejavooSpinAPI } from "@/lib/payments/dejavoo-spin-api";
import { round2 } from '@/utils/money';
import { OrderService } from "@/services/orderService";
import { getSharedCastlesService } from "@/services/terminals/castles-service";
import { getOrCreateCounter } from "@/services/terminals/castles-txn-counter";
import { CASTLES_DEFAULT_PORT, CASTLES_SOCKET_TIMEOUT_MS } from "@/types/castles";
import type { DejavooRefundResponse } from "@/types/dejavoo-spin-api";
import type {
  ItemRefundAllocation,
  PaymentRefundContext,
  RefundItemRequest,
  RefundRequest,
  RefundResult,
} from "@/types/refunds";
import { StationPaymentTerminal } from "@/types/station";
import type { SupabaseClient } from "@supabase/supabase-js";

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

  async processRefund(request: RefundRequest): Promise<RefundResult> {
    const context = await this.gatherRefundContext(request);
    if (!context.payment && request.refundType.type !== "item_return") {
      return { success: false, error: "No refundable payment found." };
    }

    switch (request.refundType.type) {
      case "full_payment":
        return this.processFullPaymentRefund(request, context);
      case "partial_amount":
        return this.processPartialRefund(
          request,
          context,
          request.refundType.amount,
        );
      case "item_return":
        return this.processItemReturn(request, context, request.refundType.items);
      default:
        return { success: false, error: "Unknown refund type." };
    }
  }

  private buildReversalRefId(context: RefundContext): string {
    const locSuffix = context.locationId?.slice(-4) ?? '';
    const staSuffix = context.stationId?.slice(-4) ?? '';
    const locPart = locSuffix ? `_${locSuffix}` : '';
    const staPart = staSuffix ? `_${staSuffix}` : '';
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
          .filter((id): id is string => !!id)
      ),
    ];
    const terminalConfigMap = new Map<string, StationPaymentTerminal>();
    if (uniqueTerminalIds.length > 0) {
      const { data: terminalRows } = await this.supabase
        .from("payment_terminals")
        .select(
          "id, terminal_name, terminal_type, local_ip_address, local_port, auth_key, " +
          "register_id, connection_type, is_connected, last_connection_status, " +
          "last_connection_test_at, consecutive_failures, health_check_interval, terminal_model"
        )
        .in("id", uniqueTerminalIds);

      for (const t of (terminalRows ?? []) as any[]) {
        terminalConfigMap.set(t.id, {
          id:                      t.id,
          terminal_name:           t.terminal_name,
          // terminal_type DB col is string | null; default to 'dejavoo' if unset
          terminal_type:           (t.terminal_type ?? "dejavoo") as StationPaymentTerminal["terminal_type"],
          auth_key:                t.auth_key ?? null,
          register_id:             t.register_id ?? null,
          terminal_model:          t.terminal_model ?? null,
          is_connected:            t.is_connected ?? false,
          // local_ip_address is DB type 'unknown' (inet); guard null before stringify
          ip_address:              t.local_ip_address != null ? String(t.local_ip_address) : undefined,
          port:                    t.local_port ?? undefined,
          connection_type:         (t.connection_type ?? undefined) as StationPaymentTerminal["connection_type"],
          last_connection_status:  (t.last_connection_status ?? null) as StationPaymentTerminal["last_connection_status"],
          last_connection_test_at: t.last_connection_test_at ?? null,
          consecutive_failures:    t.consecutive_failures ?? undefined,
          health_check_interval:   t.health_check_interval ?? undefined,
        });
      }
    }

    const paymentContexts: PaymentRefundContext[] = (payments || [])
      .map((p: any) => {
        const amount = Number(p.amount || 0);
        const refundedAmount = Number(p.refunded_amount || 0);
        const availableForRefund = Math.max(0, amount - refundedAmount);
        // Extract STAN from processor_response JSONB (stored by Castles integration)
        const castlesTxn = p.processor_response?.castles_transaction;
        const stan = castlesTxn?.stan || p.processor_response?.raw_castles_response?.txnStan || "";
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
          paymentMethod: p.payment_method,
          batchNumber: p.batch_number || "",
          isVoidable: !p.is_settled && refundedAmount === 0, // Void only if unsettled AND no prior refunds
          terminalId: p.terminal_id,
          terminalConfig: p.terminal_id ? terminalConfigMap.get(p.terminal_id) : undefined,
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
  ): Promise<RefundResult> {
    const payment = context.payment;
    if (!payment) {
      return { success: false, error: "Payment not found for refund." };
    }

    console.log('processItemReturn Payment', payment);
   console.log('processItemReturn Request', request);

    const useVoid = payment.isVoidable;
    const reversalType = useVoid ? "void" : "refund";

    const { data: reversal, error: reversalError } =
      await OrderService.createReversal(this.supabase, {
        original_payment_id: payment.paymentId,
        original_psp_reference: payment.rrn,
        reversal_reference_id: this.buildReversalRefId(context),
        reversal_type: reversalType,
        amount: payment.availableForRefund,
        reason_code: request.reason,
        reason_description: request.reasonDetail ?? null,
        initiated_by: request.initiatedBy,
        approved_by: request.approvedBy ?? null,
      });

    if (reversalError || !reversal) {
      return {
        success: false,
        error: reversalError?.message || "Failed to create reversal.",
      };
    }

    console.log('processFullPaymentRefund Reversal', reversal);

    // Prefer the terminal the payment was originally captured on.
    // Falls back to the requesting station's terminal only for legacy payments
    // where terminal_id was not recorded on order_payments.
    const effectiveTerminalId = payment.terminalId || request.payment_terminal_id;
    const effectiveTerminal =
      payment.terminalConfig ??
      (request.payment_terminal?.id === effectiveTerminalId
        ? request.payment_terminal
        : undefined);

    const terminalResult = await this.processTerminalRefund(
      payment,
      payment.availableForRefund,
      useVoid,
      effectiveTerminalId,
      effectiveTerminal,
    );

    console.log('processFullPaymentRefund Terminal Result', terminalResult);
    
    if (!terminalResult.success) {
      // Try to update reversal status to failed, but don't let DB errors block the error response
      try {
        const failedResponse = terminalResult.terminalResponse as Record<string, unknown> | undefined;
        const { error: updateError } = await OrderService.updateReversalStatus(
          this.supabase,
          reversal.id,
          "failed",
          failedResponse ?? null,
        );
        if (updateError) {
          console.error('[RefundService] Failed to update reversal status:', updateError);
        }
      } catch (dbError) {
        console.error('[RefundService] Exception updating reversal status:', dbError);
      }
      
      return {
        success: false,
        reversalId: reversal.id,
        error: terminalResult.error,
      };
    }

    // Extract terminal response fields for storage.
    // Dejavoo returns flat fields; Castles nests them under castles_transaction.
    const terminalResponse = terminalResult.terminalResponse as Record<string, unknown> | undefined;
    const generalResponse = (terminalResponse?.GeneralResponse as { ResultCode?: string; Message?: string }) ?? undefined;
    const castlesTxn = terminalResponse?.castles_transaction as Record<string, unknown> | undefined;
    const returnDetails = {
      rrn: (terminalResponse?.RRN ?? terminalResponse?.rrn ?? castlesTxn?.rrn) as string | undefined,
      authCode: (terminalResponse?.AuthCode ?? terminalResponse?.authCode ?? castlesTxn?.approvalCode) as string | undefined,
      referenceId: (terminalResponse?.ReferenceId ?? terminalResponse?.referenceId ?? castlesTxn?.referenceId) as string | undefined,
      transactionNumber: (terminalResponse?.TransactionNumber ?? terminalResponse?.transactionNumber ?? castlesTxn?.stan) as string | undefined,
      reason: request.reasonDetail,
      initiatedBy: request.initiatedBy,
    };

    // Update all records - collect errors but don't fail the whole operation
    const dbErrors: string[] = [];

    // First, update reversal and payment in parallel
    const [reversalResult, paymentResult] = await Promise.all([
      OrderService.updateReversalStatus(
        this.supabase,
        reversal.id,
        "completed",
        terminalResponse ?? null,
        (terminalResponse?.EMVData as Record<string, unknown>) ?? null,
        generalResponse?.ResultCode ?? null,
        generalResponse?.Message ?? null,
        ((terminalResponse?.RRN ?? terminalResponse?.rrn ?? castlesTxn?.rrn ?? terminalResponse?.PNReferenceId) as string) ?? null,
      ),
      OrderService.applyRefundToPayment(
        this.supabase,
        payment.paymentId,
        payment.availableForRefund,
        reversalType,
        returnDetails,
        { restorePaidQuantity: true }, // Full payment void: restore paid_quantity on items
      ),
    ]);

    if (reversalResult.error) {
      console.error('[RefundService] updateReversalStatus error:', reversalResult.error);
      dbErrors.push(`Reversal status update failed: ${reversalResult.error.message || reversalResult.error}`);
    }
    if (paymentResult.error) {
      console.error('[RefundService] applyRefundToPayment error:', paymentResult.error);
      dbErrors.push(`Payment update failed: ${paymentResult.error.message || paymentResult.error}`);
    }
    
    // Record refund items BEFORE recalculating totals — calculate_order_totals_fast
    // reads refunded_quantity from order_items, so items must be recorded first.
    // For full payment voids: skip refunded_quantity increment (paid_quantity restoration
    // handles the void, and refunded_qty should not accumulate for payment cancellations).
    const refundItems = await this.buildFullRefundItems(request.orderId, reversal.id, request.reason, request.reasonDetail);
    if (refundItems.length > 0) {
      await OrderService.recordRefundItems(
        this.supabase,
        reversal.id,
        refundItems,
        true, // skipQuantityUpdate: full payment void — don't increment refunded_qty
      );
    }

    // IMPORTANT: Call updateOrderPaymentStatusAfterRefund AFTER both applyRefundToPayment
    // and recordRefundItems complete to avoid stale refunded_amount/refunded_quantity data
    const orderResult = await OrderService.updateOrderPaymentStatusAfterRefund(
      this.supabase,
      request.orderId,
    );

    if (orderResult.error) {
      console.error('[RefundService] updateOrderPaymentStatus error:', orderResult.error);
      dbErrors.push(`Order status update failed: ${orderResult.error.message || orderResult.error}`);
    }

    return {
      success: true,
      reversalId: reversal.id,
      terminalResponse: terminalResult.terminalResponse,
      // Include DB errors as warning - terminal refund succeeded but DB updates had issues
      error: dbErrors.length > 0 ? `Refund processed but: ${dbErrors.join('; ')}` : undefined,
    };
  }

  private async processPartialRefund(
    request: RefundRequest,
    context: RefundContext,
    amount: number,
  ): Promise<RefundResult> {
    const payment = context.payment;
    if (!payment) {
      return { success: false, error: "Payment not found for refund." };
    }

    if (amount <= 0 || amount > payment.availableForRefund) {
      return { success: false, error: "Invalid refund amount." };
    }

    const useVoid = payment.isVoidable && amount >= payment.availableForRefund;
    const reversalType = useVoid ? "void" : "partial_refund";

    const { data: reversal, error: reversalError } =
      await OrderService.createReversal(this.supabase, {
        original_payment_id: payment.paymentId,
        original_psp_reference: payment.rrn,
        reversal_reference_id: this.buildReversalRefId(context),
        reversal_type: reversalType,
        amount,
        reason_code: request.reason,
        reason_description: request.reasonDetail ?? null,
        initiated_by: request.initiatedBy,
        approved_by: request.approvedBy ?? null,
      });

    if (reversalError || !reversal) {
      return {
        success: false,
        error: reversalError?.message || "Failed to create reversal.",
      };
    }

    const effectiveTerminalId = payment.terminalId || request.payment_terminal_id || '';
    const effectiveTerminal =
      payment.terminalConfig ??
      (request.payment_terminal?.id === effectiveTerminalId
        ? request.payment_terminal
        : undefined);

    const terminalResult = await this.processTerminalRefund(
      payment,
      amount,
      useVoid,
      effectiveTerminalId,
      effectiveTerminal,
    );

    if (!terminalResult.success) {
      // Try to update reversal status to failed
      try {
        const failedResponse = terminalResult.terminalResponse as Record<string, unknown> | undefined;
        const { error: updateError } = await OrderService.updateReversalStatus(
          this.supabase,
          reversal.id,
          "failed",
          failedResponse ?? null,
        );
        if (updateError) {
          console.error('[RefundService] Failed to update reversal status:', updateError);
        }
      } catch (dbError) {
        console.error('[RefundService] Exception updating reversal status:', dbError);
      }
      
      return {
        success: false,
        reversalId: reversal.id,
        error: terminalResult.error,
      };
    }

    // Extract terminal response fields for storage.
    // Dejavoo returns flat fields; Castles nests them under castles_transaction.
    const terminalResponse = terminalResult.terminalResponse as Record<string, unknown> | undefined;
    const generalResponse = (terminalResponse?.GeneralResponse as { ResultCode?: string; Message?: string }) ?? undefined;
    const castlesTxn = terminalResponse?.castles_transaction as Record<string, unknown> | undefined;
    const returnDetails = {
      rrn: (terminalResponse?.RRN ?? terminalResponse?.rrn ?? castlesTxn?.rrn) as string | undefined,
      authCode: (terminalResponse?.AuthCode ?? terminalResponse?.authCode ?? castlesTxn?.approvalCode) as string | undefined,
      referenceId: (terminalResponse?.ReferenceId ?? terminalResponse?.referenceId ?? castlesTxn?.referenceId) as string | undefined,
      transactionNumber: (terminalResponse?.TransactionNumber ?? terminalResponse?.transactionNumber ?? castlesTxn?.stan) as string | undefined,
      reason: request.reasonDetail,
      initiatedBy: request.initiatedBy,
    };

    // Update all records - collect errors but don't fail the whole operation
    const dbErrors: string[] = [];

    // First, update reversal and payment in parallel
    const [reversalResult, paymentResult] = await Promise.all([
      OrderService.updateReversalStatus(
        this.supabase,
        reversal.id,
        "completed",
        terminalResponse ?? null,
        (terminalResponse?.EMVData as Record<string, unknown>) ?? null,
        generalResponse?.ResultCode ?? null,
        generalResponse?.Message ?? null,
        ((terminalResponse?.RRN ?? terminalResponse?.rrn ?? castlesTxn?.rrn ?? terminalResponse?.PNReferenceId) as string) ?? null,
      ),
      OrderService.applyRefundToPayment(
        this.supabase,
        payment.paymentId,
        amount,
        reversalType,
        returnDetails,
      ),
    ]);
    
    if (reversalResult.error) {
      console.error('[RefundService] updateReversalStatus error:', reversalResult.error);
      dbErrors.push(`Reversal status update failed: ${reversalResult.error.message || reversalResult.error}`);
    }
    if (paymentResult.error) {
      console.error('[RefundService] applyRefundToPayment error:', paymentResult.error);
      dbErrors.push(`Payment update failed: ${paymentResult.error.message || paymentResult.error}`);
    }
    
    // IMPORTANT: Call updateOrderPaymentStatusAfterRefund AFTER applyRefundToPayment completes
    // to avoid race condition where it reads stale refunded_amount data
    const orderResult = await OrderService.updateOrderPaymentStatusAfterRefund(
      this.supabase,
      request.orderId,
    );
    
    if (orderResult.error) {
      console.error('[RefundService] updateOrderPaymentStatus error:', orderResult.error);
      dbErrors.push(`Order status update failed: ${orderResult.error.message || orderResult.error}`);
    }

    return {
      success: true,
      reversalId: reversal.id,
      terminalResponse: terminalResult.terminalResponse,
      // Include DB errors as warning - terminal refund succeeded but DB updates had issues
      error: dbErrors.length > 0 ? `Refund processed but: ${dbErrors.join('; ')}` : undefined,
    };
  }

  private async processItemReturn(
    request: RefundRequest,
    context: RefundContext,
    items: RefundItemRequest[],
  ): Promise<RefundResult> {
    const allocation = await this.buildItemRefundAllocation(
      request.orderId,
      items,
    );

    if (allocation.totalRefund <= 0) {
      return { success: false, error: "No refundable amount found for items." };
    }

    const reversals: Array<{ reversalId: string; paymentId: string; amount: number }> = [];
    const errors: string[] = [];
    let terminalRefundCount = 0; // Track terminal refunds for delay between operations

    for (const paymentAllocation of allocation.items) {
      const paymentTotals: Record<string, number> = {};
      for (const alloc of paymentAllocation.paymentAllocations) {
        paymentTotals[alloc.paymentId] =
          (paymentTotals[alloc.paymentId] || 0) + alloc.total;
      }

      for (const [paymentId, amount] of Object.entries(paymentTotals)) {
        const payment = context.payments.find((p) => p.paymentId === paymentId);
        if (!payment) {
          errors.push(`Payment ${paymentId} not found`);
          continue;
        }

        // Add delay before subsequent terminal refunds to prevent "Service Busy" errors
        if (terminalRefundCount > 0) {
          console.log('[RefundService] Waiting for terminal to be ready before next refund...');
          await new Promise(resolve => setTimeout(resolve, 3000)); // 3 second delay
        }

        const { data: reversal, error: reversalError } =
          await OrderService.createReversal(this.supabase, {
            original_payment_id: payment.paymentId,
            original_psp_reference: payment.rrn,
            reversal_reference_id: this.buildReversalRefId(context),
            reversal_type: "item_return",
            amount,
            reason_code: request.reason,
            reason_description: request.reasonDetail ?? null,
            initiated_by: request.initiatedBy,
            approved_by: request.approvedBy ?? null,
          });

        if (reversalError || !reversal) {
          errors.push(reversalError?.message || "Failed to create reversal.");
          continue;
        }

        terminalRefundCount++; // Increment before terminal call
        const terminalResult = await this.processTerminalRefund(
          payment,
          amount,
          false,
          request.payment_terminal_id ?? payment.terminalId ?? '',
          request.payment_terminal ?? undefined,
        );

        if (!terminalResult.success) {
          // Try to update reversal status to failed
          try {
            const failedResponse = terminalResult.terminalResponse as Record<string, unknown> | undefined;
            await OrderService.updateReversalStatus(
              this.supabase,
              reversal.id,
              "failed",
              failedResponse ?? null,
            );
          } catch (dbError) {
            console.error('[RefundService] Exception updating reversal status:', dbError);
          }
          errors.push(terminalResult.error || "Terminal refund failed.");
          continue;
        }

        // Extract terminal response fields for storage
        // Cast to any since DejavooRefundResponse doesn't have all fields from the raw API response
        const terminalResponse = terminalResult.terminalResponse as Record<string, unknown> | undefined;
        const generalResponse = (terminalResponse?.GeneralResponse as { ResultCode?: string; Message?: string }) ?? undefined;
        const returnDetails = {
          rrn: (terminalResponse?.RRN ?? terminalResponse?.rrn) as string | undefined,
          authCode: (terminalResponse?.AuthCode ?? terminalResponse?.authCode) as string | undefined,
          referenceId: (terminalResponse?.ReferenceId ?? terminalResponse?.referenceId) as string | undefined,
          transactionNumber: (terminalResponse?.TransactionNumber ?? terminalResponse?.transactionNumber) as string | undefined,
          reason: request.reasonDetail,
          initiatedBy: request.initiatedBy,
        };

        // Update records - log errors but continue
        const [reversalStatusResult, paymentRefundResult] = await Promise.all([
          OrderService.updateReversalStatus(
            this.supabase,
            reversal.id,
            "completed",
            terminalResponse ?? null,
            (terminalResponse?.EMVData as Record<string, unknown>) ?? null,
            generalResponse?.ResultCode ?? null,
            generalResponse?.Message ?? null,
            ((terminalResponse?.RRN ?? terminalResponse?.PNReferenceId) as string) ?? null,
          ),
          OrderService.applyRefundToPayment(
            this.supabase,
            payment.paymentId,
            amount,
            "item_return",
            returnDetails,
          ),
        ]);
        
        if (reversalStatusResult.error) {
          console.error('[RefundService] Item return - updateReversalStatus error:', reversalStatusResult.error);
          errors.push(`Reversal status update failed: ${reversalStatusResult.error.message || reversalStatusResult.error}`);
        }
        if (paymentRefundResult.error) {
          console.error('[RefundService] Item return - applyRefundToPayment error:', paymentRefundResult.error);
          errors.push(`Payment update failed: ${paymentRefundResult.error.message || paymentRefundResult.error}`);
        }

        reversals.push({ reversalId: reversal.id, paymentId, amount });

        const refundItems = paymentAllocation.paymentAllocations.map((alloc) => ({
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
        }));

        await OrderService.recordRefundItems(
          this.supabase,
          reversal.id,
          refundItems,
        );
      }
    }

    const orderStatusResult = await OrderService.updateOrderPaymentStatusAfterRefund(
      this.supabase,
      request.orderId,
    );
    if (orderStatusResult.error) {
      console.error('[RefundService] updateOrderPaymentStatus error:', orderStatusResult.error);
    }

    return {
      success: reversals.length > 0,
      reversals,
      error: errors.length > 0 ? errors.join("; ") : undefined,
    };
  }

  private async processTerminalRefund(
    payment: PaymentRefundContext,
    amount: number,
    useVoid: boolean,
    terminalId: string,
    terminal: StationPaymentTerminal | undefined,
  ): Promise<{ success: boolean; terminalResponse?: DejavooRefundResponse | Record<string, unknown>; error?: string }> {
    // Cash payments don't go through the terminal — just succeed immediately
    if (payment.paymentMethod?.toLowerCase() === 'cash') {
      return { success: true };
    }

    // Check for missing required fields with specific error messages
    console.log('processTerminalRefund Payment', payment);
    if (!terminalId && !payment.referenceId) {
      return { success: false, error: "Missing both terminal ID and reference ID. Cannot process terminal refund." };
    }
    if (!terminalId) {
      return { success: false, error: "Missing terminal ID. The payment was not processed through a terminal." };
    }
    if (!payment.referenceId) {
      return { success: false, error: "Missing reference ID. Cannot locate original transaction." };
    }


    // Route to the correct terminal integration based on terminal type
    const terminalType = terminal?.terminal_type ?? 'dejavoo';

    if (terminalType === 'castles') {
      return this.processCastlesTerminalRefund(payment, amount, useVoid, terminal!);
    }

    // Dejavoo flow
    const api = new DejavooSpinAPI(this.supabase);
    const loaded = await api.loadTerminal(terminalId, terminal);
    if (!loaded) {
      return { success: false, error: "Failed to load terminal credentials." };
    }

    console.log('processTerminalRefund Loaded Terminal', loaded);

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
  ): Promise<{ success: boolean; terminalResponse?: Record<string, unknown>; error?: string }> {
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
          return { success: false, error: "Cannot void: no RRN or STAN from original transaction." };
        }
        const result = await castles.processVoid({ rrn, stan, referenceId });
        return {
          success: result.success,
          terminalResponse: result.terminalResponse,
          error: result.error,
        };
      }

      const result = await castles.processRefund({
        amount,
        referenceId,
      });
      return {
        success: result.success,
        terminalResponse: result.terminalResponse,
        error: result.error,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[RefundService] Castles terminal refund error:", message);
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
        const unitPrice = availableQty > 0 && pi.subtotal_paid != null
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
        const unitPrice = itemQuantity > 0 && Number(item.discount_amount || 0) > 0
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
