import { calculatePaidStatus } from "@/lib/order-calculator";
import type { OrderProfile } from "@/lib/types";

export function deriveEffectivePaidStatus(
  order: OrderProfile | null | undefined,
): OrderProfile["paid_status"] | null {
  if (!order) return null;

  const hasCashPayments =
    order.payments?.some(
      (payment) => !payment.isVoided && (payment.isCashPriced || payment.method === "Cash"),
    ) ?? false;

  if (order.paid_status === "Refunded") return "Refunded";
  if (order.paid_status === "Paid" && (order.amount_due ?? 0) <= 0.01) {
    return "Paid";
  }
  if (
    hasCashPayments &&
    (order.cash_amount_due ?? Number.POSITIVE_INFINITY) <= 0.01
  ) {
    return "Paid";
  }

  const hasItems = (order.items?.length ?? 0) > 0;
  const hasPayments =
    order.payments?.some(
      (payment) =>
        !payment.isVoided &&
        ((payment.amount ?? 0) > 0 || (payment.refundedAmount ?? 0) > 0),
    ) ?? false;

  const derivedTotal = Math.max(
    order.total_amount ?? 0,
    (order.amount_paid ?? 0) + Math.max(order.amount_due ?? 0, 0),
  );
  const hasBillableTotal = derivedTotal > 0.01;

  if (!hasItems && !hasBillableTotal && !hasPayments) return null;

  if (hasPayments && hasBillableTotal) {
    return calculatePaidStatus(order.payments, derivedTotal);
  }

  if (order.amount_due != null) {
    const amountPaid = order.amount_paid ?? 0;

    if (order.amount_due <= 0.01 && (hasBillableTotal || amountPaid > 0)) {
      return "Paid";
    }

    if (amountPaid > 0 && order.amount_due > 0.01) {
      return "Partial";
    }
  }

  if (hasBillableTotal) {
    return order.paid_status || "Pending";
  }

  return order.paid_status || null;
}
