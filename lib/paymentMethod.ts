import type { PaymentType } from "@/lib/types";

/**
 * Canonical conversion between the DB `payment_method` enum and the UI
 * `PaymentType`.
 *
 * WHY THIS EXISTS
 * The codebase grew ~12 independent inline normalizers, and they disagree.
 * Most follow "not 'cash' ⇒ Card" (utils/orderTransformers.ts,
 * hooks/orders/useOrderPayments.ts, components/settings/batchout/BatchoutPanel.tsx);
 * at least one follows the inverse, "not 'card' ⇒ Cash"
 * (components/menu/PaymentDetailBottomSheetBody.tsx). With only 'cash' and
 * 'card' in play the disagreement was invisible. The moment a third method
 * exists it stops being invisible: the SAME in-kind payment renders as
 * "Card" on one screen and "Cash" on another, and lands in the wrong
 * money bucket in reporting.
 *
 * Route every DB↔UI method conversion through here. The fallbacks are
 * explicit and identical everywhere, so a future enum value degrades the
 * same way on every screen instead of splitting the app's story.
 */

/** DB `payment_method` enum values that represent a real card tender. */
const DB_CARD_METHODS = new Set([
  "card",
  "card_spinapi",
  "card_dvpaylite",
  "card_manual",
  "card_online",
]);

/**
 * The DB enum value for an in-kind settlement. Single source of truth for
 * the literal — never hand-write 'inkind' at a call site.
 */
export const DB_INKIND_METHOD = "inkind";

/**
 * UI label shown wherever an in-kind payment is surfaced to a human.
 *
 * Casing is intentional and spec'd: lowercase 'i', capital 'K'. Do not
 * "correct" it to In-Kind / InKind / Inkind — it is a product name here,
 * not a word. Referenced everywhere so all screens, receipts and reports
 * spell it identically.
 */
export const INKIND_LABEL = "inKind";

/**
 * The inKind visual identity lives in the PALETTE, not here:
 *   colors.inKindField — the fill
 *   colors.inKindOn    — text, icon and border on that fill
 *
 * Dark mode is black field / yellow on; light mode inverts to yellow field /
 * near-black on (a pure black card read as a hole punched in the light UI).
 * Because the pair is semantic rather than literal, swapping the two is all
 * an "emphasis" state needs — and that swap stays correct in both themes.
 *
 * Deliberately not re-exported from this module: it is imported by
 * services (refunds, end-of-day) that must not pull in UI theming.
 */

/**
 * True when the DB method represents a NON-TENDER settlement: revenue is
 * posted but no money moved. Such payments must be excluded from the
 * expected cash drawer, card settlement totals, and net deposit.
 */
export function isInKindMethod(
  method: string | null | undefined,
): boolean {
  return method?.toLowerCase().trim() === DB_INKIND_METHOD;
}

/**
 * True when this payment moved real money (cash drawer or processor).
 * Use for drawer/deposit/settlement math rather than `!== 'cash'`, which
 * silently sweeps every non-cash method into the card bucket.
 */
export function isMonetaryMethod(
  method: string | null | undefined,
): boolean {
  return !isInKindMethod(method);
}

/**
 * DB `payment_method` → UI `PaymentType`.
 *
 * Unknown/missing values fall back to "Card", matching the historical
 * majority behaviour so this change is not a silent re-bucketing of
 * existing data — but 'inkind' is now recognised explicitly instead of
 * being swept into that fallback.
 */
export function fromDbPaymentMethod(
  method: string | null | undefined,
): PaymentType {
  const normalized = method?.toLowerCase().trim();
  if (!normalized) return "Card";
  if (normalized === "cash") return "Cash";
  if (normalized === DB_INKIND_METHOD) return "InKind";
  if (DB_CARD_METHODS.has(normalized)) return "Card";
  // gift_card / house_account / external and any future value: treated as
  // card-like for display, which is the long-standing behaviour.
  return "Card";
}

/**
 * UI `PaymentType` → the DB `payment_method` value sent to process_payment.
 *
 * Deliberately does NOT throw. This sits on the money path, and the offline
 * queue replays payment payloads that were persisted by earlier builds — a
 * throw there would strand a real payment rather than sync it. Unrecognised
 * input therefore falls back to "card", which is exactly what the inline
 * `isCash ? "cash" : "card"` expressions this replaces already did, so no
 * legacy payload changes behaviour.
 *
 * "Split" is not a tender: it describes how a check was divided, and each
 * portion carries its own real method. No call site produces it (every
 * caller passes "Cash", "Card" or "InKind"), but if one ever did it is
 * logged loudly instead of crashing the payment.
 *
 * The `never` guard still makes adding a PaymentType without handling it
 * here a COMPILE error — strictness where it is free, resilience where it
 * is not.
 */
export function toDbPaymentMethod(method: PaymentType): string {
  switch (method) {
    case "Cash":
      return "cash";
    case "InKind":
      return DB_INKIND_METHOD;
    case "Card":
      return "card";
    case "Split":
      console.error(
        "[paymentMethod] 'Split' reached toDbPaymentMethod — it is not a " +
          "tender. Recording as 'card'; resolve to the portion's real " +
          "method at the call site.",
      );
      return "card";
    default: {
      const exhaustive: never = method;
      console.error(
        `[paymentMethod] Unrecognised PaymentType ${JSON.stringify(
          exhaustive,
        )} — recording as 'card'.`,
      );
      return "card";
    }
  }
}

/**
 * Human-readable label for a UI `PaymentType`. Use for receipts, reports
 * and payment history so the label is spelled the same way everywhere.
 */
export function paymentTypeLabel(method: PaymentType): string {
  return method === "InKind" ? INKIND_LABEL : method;
}

/**
 * True when the payment should be priced at CARD rates.
 *
 * In-kind is card-priced by design, so this is deliberately NOT
 * `method !== 'Cash'`-with-a-caveat: both Card and InKind are card-priced,
 * and only Cash is not.
 */
export function usesCardPricing(method: PaymentType): boolean {
  return method !== "Cash";
}
