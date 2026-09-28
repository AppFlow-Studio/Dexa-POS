import { toastService } from "@/lib/toastService";

/**
 * Wave 4b seams. The split, cash, merge, receipt, refund and tip-adjust
 * screens are built; the logic behind them is not. Every action that would
 * move money, change a payment record or send a receipt lands here, and each
 * one resolves `false` so no screen ever shows a success that did not happen.
 *
 * Wiring a flow means replacing its function body — the signatures are what
 * the screens already call. See `docs/features/handheld/wave4b-plan.md`.
 */

export type ReceiptChannel = "text" | "email" | "print";

export interface SplitShare {
  /** "Guest 2 of 4", "Seat 3", "3 items" — what the share is, for the charge screen. */
  label: string;
  amount: number;
  /** Line ids and quantities when the share is items (by seat / by item). */
  items?: { itemId: string; quantity: number }[];
}

function notWired(action: string): Promise<boolean> {
  toastService.show({ title: action, message: "This action is not connected yet.", type: "warning" });
  return Promise.resolve(false);
}

export function payShare(_orderId: string, _share: SplitShare): Promise<boolean> {
  return notWired("Pay a share");
}

export function recordCash(
  _orderId: string,
  _payment: { amount: number; tendered: number },
): Promise<boolean> {
  return notWired("Record cash");
}

export function mergeChecks(_targetOrderId: string, _sourceOrderIds: string[]): Promise<boolean> {
  return notWired("Merge checks");
}

export function sendReceipt(
  _orderId: string,
  _channel: ReceiptChannel,
  _to?: string,
): Promise<boolean> {
  return notWired("Send receipt");
}

export function refundPayment(
  _orderId: string,
  _paymentId: string,
  _refund: { amount: number; reason: string; approvedBy: string },
): Promise<boolean> {
  return notWired("Refund");
}

export function adjustTip(_orderId: string, _paymentId: string, _tip: number): Promise<boolean> {
  return notWired("Adjust tip");
}
