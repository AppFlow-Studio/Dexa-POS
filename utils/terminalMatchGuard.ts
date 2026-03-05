import type { OrderProfilePayment } from "@/lib/types";

/**
 * Checks whether the active station's terminal can process refund/void/tip-adjust
 * for an order's payments. Card payments must be routed to the same terminal type
 * that originally processed them.
 */
export function getTerminalMatchInfo(
  payments: OrderProfilePayment[] | undefined,
  activeTerminalType: string | undefined,
): { canProcess: boolean; blockReason?: string } {
  if (!payments || payments.length === 0) {
    return { canProcess: false, blockReason: "No payments" };
  }

  // Card payments that need terminal routing
  const cardPayments = payments.filter(
    (p) => p.method !== "Cash" && p.status !== "voided",
  );

  // All-cash order — no terminal needed
  if (cardPayments.length === 0) {
    return { canProcess: true };
  }

  if (!activeTerminalType) {
    return { canProcess: false, blockReason: "No terminal on station" };
  }

  // Detect terminal types used on card payments
  const paymentTerminalTypes = new Set<string>();
  for (const p of cardPayments) {
    const t = p.transactionDetails?.terminalType;
    if (t && t !== "cash_drawer" && t !== "manual") {
      paymentTerminalTypes.add(t);
    } else if (p.transactionDetails?.castlesTransaction) {
      paymentTerminalTypes.add("castles");
    } else if (p.transactionDetails?.dejavooTransaction) {
      paymentTerminalTypes.add("dejavoo");
    }
  }

  if (paymentTerminalTypes.size === 0) {
    // No detectable terminal type — allow (legacy data)
    return { canProcess: true };
  }

  if (paymentTerminalTypes.has(activeTerminalType)) {
    return { canProcess: true };
  }

  const needed = [...paymentTerminalTypes].join(", ");
  return {
    canProcess: false,
    blockReason: `Paid via ${needed}, active is ${activeTerminalType}`,
  };
}
