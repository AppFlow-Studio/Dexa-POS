import type { SupabaseClient } from "@supabase/supabase-js";
import { DejavooSpinAPI } from "@/lib/payments/dejavoo-spin-api";
import { OrderService } from "@/services/orderService";
import type { DejavooRefundResponse } from "@/types/dejavoo-spin-api";
import type {
  ItemRefundAllocation,
  PaymentRefundContext,
  RefundItemRequest,
  RefundRequest,
  RefundResult,
} from "@/types/refunds";

type RefundContext = {
  orderId: string;
  payments: PaymentRefundContext[];
  payment?: PaymentRefundContext;
  locationId?: string | null;
  merchantId?: string | null;
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
        ].join(","),
      )
      .eq("order_id", request.orderId)
      .in("status", ["captured", "refunded", "partially_refunded"]);

    const paymentContexts: PaymentRefundContext[] = (payments || [])
      .map((p: any) => {
        const amount = Number(p.amount || 0);
        const refundedAmount = Number(p.refunded_amount || 0);
        const availableForRefund = Math.max(0, amount - refundedAmount);
        return {
          paymentId: p.id,
          referenceId: p.reference_number || p.transaction_id || "",
          rrn: p.rrn || "",
          authCode: p.auth_code || "",
          amount,
          tipAmount: Number(p.tip_amount || 0),
          refundedAmount,
          availableForRefund,
          paymentMethod: p.payment_method,
          batchNumber: p.batch_number || "",
          isVoidable: p.is_settled === false,
          terminalId: p.terminal_id,
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

    const useVoid = payment.isVoidable;
    const reversalType = useVoid ? "void" : "refund";

    const { data: reversal, error: reversalError } =
      await OrderService.createReversal(this.supabase, {
        original_payment_id: payment.paymentId,
        original_psp_reference: payment.rrn,
        reversal_reference_id: `REV_${Date.now()}`,
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

    const terminalResult = await this.processTerminalRefund(
      payment,
      payment.availableForRefund,
      useVoid,
    );

    if (!terminalResult.success) {
      await OrderService.updateReversalStatus(
        this.supabase,
        reversal.id,
        "failed",
        terminalResult.terminalResponse ?? null,
      );
      return {
        success: false,
        reversalId: reversal.id,
        error: terminalResult.error,
      };
    }

    await Promise.all([
      OrderService.updateReversalStatus(
        this.supabase,
        reversal.id,
        "completed",
        terminalResult.terminalResponse ?? null,
      ),
      OrderService.applyRefundToPayment(
        this.supabase,
        payment.paymentId,
        payment.availableForRefund,
        reversalType,
      ),
      OrderService.updateOrderPaymentStatusAfterRefund(
        this.supabase,
        request.orderId,
      ),
    ]);

    const refundItems = await this.buildFullRefundItems(request.orderId, reversal.id, request.reason, request.reasonDetail);
    if (refundItems.length > 0) {
      await OrderService.recordRefundItems(
        this.supabase,
        reversal.id,
        refundItems,
      );
    }

    return {
      success: true,
      reversalId: reversal.id,
      terminalResponse: terminalResult.terminalResponse,
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
        reversal_reference_id: `REV_${Date.now()}`,
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

    const terminalResult = await this.processTerminalRefund(
      payment,
      amount,
      useVoid,
    );

    if (!terminalResult.success) {
      await OrderService.updateReversalStatus(
        this.supabase,
        reversal.id,
        "failed",
        terminalResult.terminalResponse ?? null,
      );
      return {
        success: false,
        reversalId: reversal.id,
        error: terminalResult.error,
      };
    }

    await Promise.all([
      OrderService.updateReversalStatus(
        this.supabase,
        reversal.id,
        "completed",
        terminalResult.terminalResponse ?? null,
      ),
      OrderService.applyRefundToPayment(
        this.supabase,
        payment.paymentId,
        amount,
        reversalType,
      ),
      OrderService.updateOrderPaymentStatusAfterRefund(
        this.supabase,
        request.orderId,
      ),
    ]);

    return {
      success: true,
      reversalId: reversal.id,
      terminalResponse: terminalResult.terminalResponse,
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

        const { data: reversal, error: reversalError } =
          await OrderService.createReversal(this.supabase, {
            original_payment_id: payment.paymentId,
            original_psp_reference: payment.rrn,
            reversal_reference_id: `REV_${Date.now()}`,
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

        const terminalResult = await this.processTerminalRefund(
          payment,
          amount,
          false,
        );

        if (!terminalResult.success) {
          await OrderService.updateReversalStatus(
            this.supabase,
            reversal.id,
            "failed",
            terminalResult.terminalResponse ?? null,
          );
          errors.push(terminalResult.error || "Terminal refund failed.");
          continue;
        }

        await Promise.all([
          OrderService.updateReversalStatus(
            this.supabase,
            reversal.id,
            "completed",
            terminalResult.terminalResponse ?? null,
          ),
          OrderService.applyRefundToPayment(
            this.supabase,
            payment.paymentId,
            amount,
            "item_return",
          ),
        ]);

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

    await OrderService.updateOrderPaymentStatusAfterRefund(
      this.supabase,
      request.orderId,
    );

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
  ): Promise<{ success: boolean; terminalResponse?: DejavooRefundResponse; error?: string }> {
    if (!payment.terminalId || !payment.referenceId) {
      return { success: false, error: "Missing terminal or reference ID." };
    }

    const api = new DejavooSpinAPI(this.supabase);
    const loaded = await api.loadTerminal(payment.terminalId);
    if (!loaded) {
      return { success: false, error: "Failed to load terminal credentials." };
    }

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
          "id, order_payment_id, quantity_paid, unit_price_paid, tax_paid, created_at",
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

        const unitPrice = Number(pi.unit_price_paid || 0);
        const taxPerUnit =
          availableQty > 0 ? Number(pi.tax_paid || 0) / availableQty : 0;
        const subtotal = qtyFromThis * unitPrice;
        const tax = qtyFromThis * taxPerUnit;
        paymentAllocations.push({
          paymentId: pi.order_payment_id,
          paymentItemId: pi.id,
          quantity: qtyFromThis,
          unitPrice,
          subtotal,
          tax,
          total: subtotal + tax,
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
        "id, quantity, paid_quantity, refunded_quantity, unit_price, tax_amount",
      )
      .eq("order_id", orderId);

    return (items || [])
      .map((item: any) => {
        const paidQuantity = Number(item.paid_quantity || 0);
        const alreadyRefunded = Number(item.refunded_quantity || 0);
        const qty = Math.max(0, paidQuantity - alreadyRefunded);
        if (qty <= 0) return null;

        const unitPrice = Number(item.unit_price || 0);
        const taxPerUnit =
          paidQuantity > 0 ? Number(item.tax_amount || 0) / paidQuantity : 0;
        const subtotal = qty * unitPrice;
        const tax = qty * taxPerUnit;
        return {
          reversal_id: reversalId,
          order_item_id: item.id,
          quantity_refunded: qty,
          unit_price_refunded: unitPrice,
          subtotal_refunded: subtotal,
          tax_refunded: tax,
          total_refunded: subtotal + tax,
          refund_reason: reason,
          refund_reason_detail: reasonDetail,
          return_to_inventory: false,
          inventory_updated: false,
        };
      })
      .filter(Boolean) as Array<Record<string, unknown>>;
  }
}
