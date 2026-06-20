/**
 * Units of an order item that still need to be paid, accounting for refunds.
 *
 * Refunding a paid unit makes it payable again, so:
 *   payable = quantity - paid_quantity + refunded_quantity
 *
 * This mirrors the server (`process_payment` v6–v16) and the order-level
 * outstanding calculation (`lib/order-calculator.ts` ~line 603). Use this
 * everywhere instead of the bare `quantity - paidQuantity`, which wrongly treats
 * a refunded item as fully paid — that mismatch made the per-item payment
 * coverage come back empty and the POS reject a re-payment with "No Unpaid
 * Items" AFTER the terminal had already charged the card.
 *
 * Invariant: `refunded_quantity <= paid_quantity` (you can only refund what was
 * paid — enforced in `buildItemRefundAllocation`), so the result is always
 * `<= quantity`; no capping is required.
 */
export function payableQuantity(item: {
  quantity: number;
  paidQuantity?: number | null;
  refundedQuantity?: number | null;
}): number {
  return item.quantity - (item.paidQuantity ?? 0) + (item.refundedQuantity ?? 0);
}
