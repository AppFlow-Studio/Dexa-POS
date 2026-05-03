import type { OrderProfile } from "@/lib/types";

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
