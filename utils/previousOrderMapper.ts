import { OrderProfile, PreviousOrder } from "@/lib/types";

/**
 * Maps a PreviousOrder to OrderProfile shape so existing components
 * (PaymentTimelineSection, PaymentCoverageSection, BillItemsSection) work without modification.
 */
export function previousOrderToOrderProfile(
  order: PreviousOrder,
): OrderProfile {
  return {
    id: order.orderId,
    db_order_id: order.db_order_id,
    display_number: order.display_number,
    service_location_id: order.service_location_id ?? null,
    service_location_name: order.service_location_name,
    order_status:
      order.paymentStatus === "Refunded"
        ? "refunded"
        : order.checkStatus === "Closed"
          ? "completed"
          : "pending",
    check_status: order.checkStatus || "Opened",
    order_type: order.type,
    paid_status:
      order.paymentStatus === "Paid"
        ? "Paid"
        : order.paymentStatus === "Unpaid"
          ? "Unpaid"
          : "Partial",
    items: order.items,
    opened_at: order.opened_at || null,
    closed_at: order.closed_at || undefined,
    sent_to_kitchen_at: order.sent_to_kitchen_at || undefined,
    last_activity_at: order.last_activity_at || undefined,
    total_amount: order.total,
    amount_paid: order.amount_paid,
    amount_due: order.amount_due,
    cash_amount_due: order.cash_amount_due,
    customer_name: order.customer,
    server_name: order.server,
    payments: order.payments,
    notes: order.notes,
    reversals: order.reversals,
    order_refund_items: order.order_refund_items,
    station_id: order.station_id,
    _sourceStationName: order.station_name,
  };
}

/**
 * Calculates real subtotal, tax, discount from actual item data.
 * Replaces hardcoded 5% tax calculation.
 */
export function computeOrderTotals(order: PreviousOrder) {
  const activeItems = order.items.filter((item) => !item.is_voided);

  const subtotal = activeItems.reduce((acc, item) => acc + item.subtotal, 0);
  const taxAmount = activeItems.reduce((acc, item) => acc + item.taxAmount, 0);
  const discountAmount = activeItems.reduce(
    (acc, item) => acc + (item.discount_amount || 0),
    0,
  );

  const cashSubtotal = activeItems.reduce(
    (acc, item) => acc + item.cashSubtotal,
    0,
  );
  const cashTaxAmount = activeItems.reduce(
    (acc, item) => acc + item.cashTaxAmount,
    0,
  );
  const cashDiscountAmount = activeItems.reduce(
    (acc, item) => acc + (item.discount_cash_amount || 0),
    0,
  );

  const totalPaid = order.amount_paid || 0;
  const totalRefunded = order.refundedAmount || 0;
  const balanceDue = order.amount_due || 0;

  return {
    subtotal,
    taxAmount,
    discountAmount,
    cashSubtotal,
    cashTaxAmount,
    cashDiscountAmount,
    total: order.total,
    totalPaid,
    totalRefunded,
    balanceDue,
    itemCount: activeItems.length,
    voidedCount: order.items.length - activeItems.length,
  };
}
