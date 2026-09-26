import type { OrderProfilePayment } from "@/lib/types";
import type { PaymentJournalEntry } from "@/services/paymentJournal";

/**
 * Whether an incoming payment should be rejected because the order has no
 * meaningful balance left to collect.
 *
 * A $0.01 order (or a tiny final split remainder, e.g. $0.05 split 3 ways
 * leaves $0.01) is a REAL balance the guest owes and MUST be collectable, so
 * only genuine sub-cent rounding dust (< $0.005) is treated as "already paid".
 * Any payment that actually covers the outstanding balance — including a null
 * "pay the entire remaining balance" (full-pay) amount — is allowed through.
 *
 * Pure & unit-tested so this penny-payment behaviour can't be silently reverted
 * again (it regressed once when commit 90f0ed1e clobbered the 40dee0fd fix).
 *
 * @param outstandingBeforePayment Order balance still owed, in dollars.
 * @param amount This payment's amount in dollars, or null/undefined for a
 *               "pay the entire remaining balance" (full-pay) payment.
 * @returns true when the payment should be rejected as "already paid".
 */
export function isNothingLeftToCollect(
  outstandingBeforePayment: number,
  amount: number | null | undefined,
): boolean {
  // Does this payment actually collect what's still owed? A null amount means
  // "pay the entire remaining balance" (full-pay), which collects by definition.
  const collectsRemaining =
    amount == null ||
    (amount > 0 && amount >= outstandingBeforePayment - 0.001);

  // Only genuine sub-cent dust counts as nothing left to collect.
  const nothingLeftToCollect = outstandingBeforePayment < 0.005;

  return (
    nothingLeftToCollect ||
    (outstandingBeforePayment <= 0.01 && !collectsRemaining)
  );
}

/**
 * A card charge that still has money on the customer's card — i.e. one that
 * must be refunded (or recorded) before the order can be voided.
 */
export interface UnrefundedCardCharge {
  /** `payment` = on the order; `journal` = terminal approved, no payment row. */
  source: "payment" | "journal";
  amount: number;
  last4?: string;
  /** Whether the server already has it. Unsynced charges exist only on this tablet. */
  synced: boolean;
  journalId?: string;
}

type ChargeCheckPayment = Pick<
  OrderProfilePayment,
  | "method"
  | "status"
  | "isVoided"
  | "isReturned"
  | "amount"
  | "total_collected"
  | "refundedAmount"
  | "last4"
  | "sync_status"
  | "db_payment_id"
  | "transactionDetails"
>;

type ChargeCheckJournal = Pick<
  PaymentJournalEntry,
  "id" | "paymentMethod" | "status" | "amount" | "tipAmount"
>;

/**
 * Card money still sitting on a customer's card for this order.
 *
 * Voiding an order never refunds a card, and `process_payment` refuses void
 * orders — so voiding with any of these outstanding strands a real charge
 * with no record (2026-09-25, Bread & Butter: $15.13 charged, order voided,
 * queued payment discarded). Callers block the void until this is empty.
 *
 * Journals count too: a `terminal_approved` card journal with no payment on
 * the order is a charge the terminal took that never made it onto the order
 * (or an indeterminate result awaiting reconciliation). Clean declines fail
 * their journal, so they never appear here.
 */
export function getUnrefundedCardCharges(
  payments: readonly ChargeCheckPayment[] | null | undefined,
  journals: readonly ChargeCheckJournal[] = [],
): UnrefundedCardCharge[] {
  const charges: UnrefundedCardCharge[] = [];
  const journalIdsOnOrder = new Set<string>();

  for (const p of payments ?? []) {
    const handleId = (p.transactionDetails as any)?.paymentJournalHandle?.id;
    if (typeof handleId === "string") journalIdsOnOrder.add(handleId);

    if (p.method !== "Card" || p.status !== "captured") continue;
    if (p.isVoided || p.isReturned) continue;
    const collected = p.total_collected ?? p.amount ?? 0;
    const remaining = collected - (p.refundedAmount ?? 0);
    if (remaining < 0.005) continue;
    charges.push({
      source: "payment",
      amount: remaining,
      last4: p.last4,
      synced: p.sync_status !== "pending" && p.sync_status !== "failed",
      journalId: handleId,
    });
  }

  for (const j of journals) {
    if (j.paymentMethod !== "Card" || j.status !== "terminal_approved") continue;
    if (journalIdsOnOrder.has(j.id)) continue;
    charges.push({
      source: "journal",
      amount: (j.amount ?? 0) + (j.tipAmount ?? 0),
      synced: false,
      journalId: j.id,
    });
  }

  return charges;
}

/** Operator copy for a blocked void. */
export function describeVoidBlock(charges: readonly UnrefundedCardCharge[]): string {
  const total = charges.reduce((s, c) => s + c.amount, 0);
  const cards = charges
    .map((c) => c.last4)
    .filter((l): l is string => !!l)
    .map((l) => `••${l}`);
  const cardText = cards.length ? ` on ${Array.from(new Set(cards)).join(", ")}` : "";
  const unsynced = charges.some((c) => !c.synced);
  return (
    `$${total.toFixed(2)} is still charged to a card${cardText}. ` +
    (unsynced
      ? "The payment hasn't finished saving — wait for it to sync, then refund it before voiding."
      : "Refund the card payment first, then void the order.")
  );
}

/** `void_order` refusal (P0010) — the server still has card money on the order. */
export function isCardPaymentVoidRefusal(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null | undefined;
  return (
    e?.code === "P0010" ||
    (e?.message ?? "").includes("ORDER_HAS_CAPTURED_CARD_PAYMENTS")
  );
}
