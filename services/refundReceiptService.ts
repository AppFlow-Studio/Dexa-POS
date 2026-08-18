import { parseRefundApproval } from "@/lib/refundApproval";
import { SelectedLocation } from "@/stores/useStoreSettingsStore";
import { RefundReceiptData } from "@/services/printing/templates/RefundReceiptDocumentTemplate";
import type { SupabaseClient } from "@supabase/supabase-js";

function numberValue(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatLocalDateTime(value: string, timeZone: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function locationAddress(location: SelectedLocation): string {
  return [
    location.address_line1,
    location.address_line2,
    [location.city, location.state, location.postal_code]
      .filter(Boolean)
      .join(" "),
  ]
    .filter(Boolean)
    .join(", ");
}

export const RefundReceiptService = {
  async load(
    client: SupabaseClient,
    reversalId: string,
    location: SelectedLocation,
    options?: { isReprint?: boolean },
  ): Promise<RefundReceiptData> {
    const { data: reversal, error: reversalError } = await client
      .from("reversals")
      .select("*")
      .eq("id", reversalId)
      .single();

    if (reversalError || !reversal) {
      throw new Error(
        reversalError?.message ?? "Refund record was not found for printing.",
      );
    }
    if (reversal.status !== "completed") {
      throw new Error("Only completed refunds can be printed.");
    }

    const { data: payment, error: paymentError } = await client
      .from("order_payments")
      .select(
        "id, order_id, amount, refunded_amount, payment_method, card_type, card_last_four, batch_number, dejavoo_batch_number, dejavoo_invoice_number, terminal_id, rrn, processor_response, terminal_response",
      )
      .eq("id", reversal.original_payment_id)
      .single();

    if (paymentError || !payment) {
      throw new Error(
        paymentError?.message ?? "Original payment was not found for printing.",
      );
    }

    const [{ data: order, error: orderError }, { data: refundRows }] =
      await Promise.all([
        client
          .from("orders")
          .select("id, order_number, display_number, created_at")
          .eq("id", payment.order_id)
          .single(),
        client
          .from("order_refund_items")
          .select(
            "order_item_id, quantity_refunded, total_refunded, created_at",
          )
          .eq("reversal_id", reversalId),
      ]);

    if (orderError || !order) {
      throw new Error(
        orderError?.message ?? "Original order was not found for printing.",
      );
    }

    const itemIds = [
      ...new Set(
        (refundRows ?? [])
          .map((row: any) => row.order_item_id as string | null)
          .filter((id: string | null): id is string => Boolean(id)),
      ),
    ];
    const itemNames = new Map<string, string>();
    if (itemIds.length > 0) {
      const { data: orderItems } = await client
        .from("order_items")
        .select("id, item_name")
        .in("id", itemIds);
      for (const item of orderItems ?? []) {
        itemNames.set(item.id, item.item_name);
      }
    }

    const groupedItems = new Map<
      string,
      { name: string; quantity: number; amount: number }
    >();
    for (const row of refundRows ?? []) {
      const quantity = numberValue(row.quantity_refunded);
      if (quantity <= 0) continue;
      const key = row.order_item_id;
      const current = groupedItems.get(key) ?? {
        name: itemNames.get(key) ?? "Refunded item",
        quantity: 0,
        amount: 0,
      };
      current.quantity += quantity;
      current.amount += numberValue(row.total_refunded);
      groupedItems.set(key, current);
    }

    const refundApproval = parseRefundApproval(
      reversal.terminal_response as Record<string, unknown> | null,
    );
    const originalApproval = parseRefundApproval(
      (payment.processor_response ?? payment.terminal_response) as Record<
        string,
        unknown
      > | null,
    );
    const originalPaymentAmount = numberValue(payment.amount);
    const refundedToDate = numberValue(payment.refunded_amount);
    const totalRefunded = numberValue(reversal.amount);

    return {
      locationId: reversal.location_id,
      orderId: order.id,
      reversalId: reversal.id,
      storeName: location.name,
      storeAddress: locationAddress(location),
      storePhone: location.phone ?? undefined,
      refundNumber:
        reversal.refund_number ?? `REF-${reversal.id.slice(0, 8).toUpperCase()}`,
      orderNumber: order.display_number || order.order_number,
      orderDate: formatLocalDateTime(order.created_at, location.timezone),
      refundDate: formatLocalDateTime(
        reversal.completed_at ?? reversal.processed_at ?? reversal.requested_at,
        location.timezone,
      ),
      items: [...groupedItems.values()],
      customAmountLabel:
        reversal.reversal_type === "partial_refund"
          ? "Custom partial refund"
          : "Refund",
      totalRefunded,
      paymentMethod: String(payment.payment_method ?? "Unknown").toUpperCase(),
      cardBrand:
        refundApproval.cardBrand ??
        payment.card_type ??
        originalApproval.cardBrand,
      cardLast4:
        refundApproval.cardLast4 ??
        payment.card_last_four ??
        originalApproval.cardLast4,
      approvalStatus:
        reversal.response_message ??
        refundApproval.responseMessage ??
        (reversal.status === "completed" ? "APPROVED" : reversal.status),
      refundRrn: reversal.reversal_psp_reference ?? refundApproval.rrn,
      batchNumber:
        refundApproval.batchNumber ??
        payment.dejavoo_batch_number ??
        payment.batch_number,
      invoiceNumber:
        refundApproval.invoiceNumber ?? payment.dejavoo_invoice_number,
      terminalId: payment.terminal_id,
      originalRrn: payment.rrn ?? originalApproval.rrn,
      reason: reversal.reason_description ?? reversal.reason_code,
      originalPaymentAmount,
      refundedToDate,
      remainingRefundable: Math.max(
        0,
        originalPaymentAmount - refundedToDate,
      ),
      isReprint: options?.isReprint ?? false,
    };
  },
};
