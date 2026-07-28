import type { OrderProfilePayment } from "@/lib/types";
import { describeProcessor } from "@/lib/processorLabels";

/**
 * Checks whether the active station's terminal can process refund/void/tip-adjust
 * for an order's payments. Card payments must be routed to the same terminal type
 * that originally processed them.
 */
export function getTerminalMatchInfo(
  payments: OrderProfilePayment[] | undefined,
  /**
   * The terminal type(s) available on this station for processing
   * refund/void/tip-adjust. Accepts a list so a device can offer more than one
   * (e.g. a configured terminal PLUS the on-device "internal" ATOM).
   */
  activeTerminalType: string | string[] | undefined,
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

  const activeTypes = (
    Array.isArray(activeTerminalType)
      ? activeTerminalType
      : [activeTerminalType]
  ).filter((t): t is string => !!t);
  if (activeTypes.length === 0) {
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

  if (activeTypes.some((t) => paymentTerminalTypes.has(t))) {
    return { canProcess: true };
  }

  const neededLabel = [...paymentTerminalTypes]
    .map((t) => describeProcessor(t))
    .join(", ");
  const activeLabel = activeTypes.map((t) => describeProcessor(t)).join(" / ");
  return {
    canProcess: false,
    blockReason: `This payment was captured on ${neededLabel}; the active terminal is ${activeLabel}. Switch the active processor in Settings → Devices & Connections.`,
  };
}

/**
 * Tip-adjust eligibility. Identical to {@link getTerminalMatchInfo} EXCEPT that
 * ATOM (on-device) card payments can never be tip-adjusted after the fact: the
 * tip is collected before the sale and baked into the single immediate-capture
 * /authorize, so there is no APPROVED auth to adjust. Refund stays available
 * (via /cancel) and keeps using getTerminalMatchInfo.
 */
export function getTipAdjustMatchInfo(
  payments: OrderProfilePayment[] | undefined,
  activeTerminalType: string | string[] | undefined,
): { canProcess: boolean; blockReason?: string } {
  const base = getTerminalMatchInfo(payments, activeTerminalType);
  if (!base.canProcess) return base;

  const anyAtom = (payments ?? [])
    .filter((p) => p.method !== "Cash" && p.status !== "voided")
    .some(
      (p) =>
        p.transactionDetails?.terminalType === "atom" ||
        !!p.transactionDetails?.atomTransaction,
    );
  if (anyAtom) {
    return {
      canProcess: false,
      blockReason:
        "Tips on ATOM (on-device) card payments are collected before the sale and cannot be changed afterward. To correct a tip, refund the payment and re-charge.",
    };
  }
  return base;
}
