import type { OrderProfile, OrderProfilePayment } from "@/lib/types";
import { round2 } from "@/utils/money";
import { formatClock, formatCurrency } from "./format";

/**
 * Read-only views of the payments already on a check, for the Payments page,
 * refund and tip adjust. Pure — no store reads.
 */

/** Payments on the check, oldest first, the way they were taken. */
export function paymentsOf(order: OrderProfile | null | undefined): OrderProfilePayment[] {
  const list = order?.payments ?? [];
  return [...list].sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0));
}

/** A payment that no longer holds money: voided, or refunded in full. */
export function isSettledOut(p: OrderProfilePayment): boolean {
  return p.isVoided || p.status === "voided" || p.status === "refunded";
}

/** What can still be refunded: collected (with tip) less what has already gone back. */
export function refundable(p: OrderProfilePayment): number {
  if (isSettledOut(p)) return 0;
  const collected = p.total_collected ?? round2(p.amount + (p.tip_amount ?? 0));
  return Math.max(0, round2(collected - (p.refundedAmount ?? 0)));
}

/** Tips can be adjusted on a card payment that still holds its money. */
export function canAdjustTip(p: OrderProfilePayment): boolean {
  return p.method === "Card" && !isSettledOut(p) && (p.refundedAmount ?? 0) === 0;
}

/** "Visa ending 4412", "Card", "Cash", "Split". */
export function paymentTitle(p: OrderProfilePayment): string {
  if (p.method === "Card") {
    const tail = p.last4?.replace(/\D/g, "").slice(-4);
    if (p.cardBrand && tail) return `${p.cardBrand} ending ${tail}`;
    if (tail) return `Card ending ${tail}`;
    return p.cardBrand || "Card";
  }
  if (p.method === "InKind") return "In kind";
  return p.method;
}

/** "8:14 · $37.93 tip" / "8:14 · Refunded $10.00" / "8:14 · Voided". */
export function paymentDetail(p: OrderProfilePayment): string {
  const parts = [formatClock(p.timestamp)];
  if (p.isVoided || p.status === "voided") parts.push("Voided");
  else if ((p.refundedAmount ?? 0) > 0) parts.push(`Refunded ${formatCurrency(p.refundedAmount ?? 0)}`);
  else if ((p.tip_amount ?? 0) > 0) parts.push(`${formatCurrency(p.tip_amount)} tip`);
  return parts.filter(Boolean).join(" · ");
}
