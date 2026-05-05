import type { OrderProfile } from "@/lib/types";

const REFUND_EPSILON = 0.001;

export function derivePaymentRefundState(
  payments: OrderProfile["payments"] | null | undefined,
): {
  totalRefunded: number;
  hasRefund: boolean;
  isFullyRefunded: boolean;
  isPartiallyRefunded: boolean;
} {
  const paymentList = payments ?? [];
  const totalRefunded = paymentList.reduce(
    (sum, p) => sum + (p.refundedAmount ?? 0),
    0,
  );
  const hasRefund = totalRefunded > REFUND_EPSILON;
  const isFullyRefunded =
    hasRefund &&
    paymentList.length > 0 &&
    paymentList.every(
      (p) => (p.refundedAmount ?? 0) + REFUND_EPSILON >= (p.amount ?? 0),
    );

  return {
    totalRefunded,
    hasRefund,
    isFullyRefunded,
    isPartiallyRefunded: hasRefund && !isFullyRefunded,
  };
}

export function usesCashPricing(
  payments: OrderProfile["payments"] | null | undefined,
): boolean {
  return (payments ?? []).some(
    (p) => !p.isPreAuth && (p.method === "Cash" || p.isCashPriced),
  );
}

export function getCashPricedOrderTotal(
  order: Pick<OrderProfile, "items" | "payments" | "total_cash_amount">,
): number | null {
  if (!usesCashPricing(order.payments)) return null;
  if ((order.total_cash_amount ?? 0) > 0)
    return order.total_cash_amount ?? null;

  const cashItemsTotal = order.items.reduce((sum, item) => {
    const cashSubtotal =
      item.cashSubtotal ?? item.subtotal ?? item.price * item.quantity;
    const cashTax = item.cashTaxAmount ?? item.taxAmount ?? 0;
    return sum + cashSubtotal + cashTax;
  }, 0);

  if (cashItemsTotal > 0) return cashItemsTotal;

  const paymentTotal = (order.payments ?? [])
    .filter((p) => !p.isPreAuth && (!p.isVoided || (p.refundedAmount ?? 0) > 0))
    .reduce((sum, p) => sum + (p.amount ?? 0), 0);

  return paymentTotal > 0 ? paymentTotal : null;
}

// Shared cash-aware paid-status deriver — keeps the bill-section header pill
// and the Previous Orders row pill in agreement on the same data.
export function derivePaidStatus(
  order: Pick<
    OrderProfile,
    | "paid_status"
    | "amount_due"
    | "cash_amount_due"
    | "amount_paid"
    | "payments"
    | "total_amount"
  > | null,
): OrderProfile["paid_status"] | null {
  if (!order) return null;

  if (order.paid_status === "Refunded") return "Refunded";

  if (order.paid_status === "Paid" && (order.amount_due ?? 0) <= 0.01) {
    return "Paid";
  }

  const hasCashPayments =
    order.payments?.some((p) => !p.isVoided && p.isCashPriced) ?? false;
  if (
    hasCashPayments &&
    (order.cash_amount_due ?? Number.POSITIVE_INFINITY) <= 0.01
  ) {
    return "Paid";
  }

  const amountPaid = order.amount_paid ?? 0;
  const amountDue = order.amount_due ?? 0;

  if (amountDue <= 0.01 && amountPaid > 0) {
    return "Paid";
  }

  if (amountPaid > 0 && amountDue > 0.01) {
    return "Partial";
  }

  return order.paid_status ?? null;
}
