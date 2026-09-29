// ============================================================
// CodePay reversal rules (pure)
// File: services/terminals/codepay-reversal.ts
// ============================================================
// Which operation a reversal starts with, how a decline is read, and what the
// staff member is told. No I/O here; CodePayService.reverse() runs the Intents.
//
// Source: developer.codepay.us
//   - guides/integrate-with-codepay-terminal: "You can cancel a payment any
//     time while it is still in the batch. Once the batch is closed, the
//     payment can no longer be canceled." A referenced refund carries
//     orig_merchant_order_no and needs no card.
//   - ResponseCodes/codepay, /tsys, /fiserv: the codes below.
//
// The other operation is tried ONLY on a code or message that says the first
// one is wrong for the sale's batch state. Every such answer is a definitive
// decline, so no money moved. Timeouts, host errors and anything unrecognized
// never trigger a second attempt.
// ============================================================

import type {
  CodePayReversalDeclineKind,
  CodePayReversalOperation,
} from "@/types/codepay";

/** Processor prefix CodePay puts in front of a processor's own code ("TS-D2012"). */
const PROCESSOR_PREFIX = /^(TS|TSYS|FS|FD|FISERV|CP)[-_:\s]+/;

/** Upper-cased code with any processor prefix and brackets removed. */
export function normalizeCodePayCode(code: unknown): string {
  if (code == null) return "";
  return String(code)
    .trim()
    .toUpperCase()
    .replace(/^\[|\]$/g, "")
    .replace(PROCESSOR_PREFIX, "");
}

const CODES: Record<
  Exclude<CodePayReversalDeclineKind, "unknown">,
  readonly string[]
> = {
  void_not_allowed: [
    "ET008", // CodePay: Reversal not allowed, the transaction was settled
    "ET007", // CodePay: No pending transactions
    "CF008", // Fiserv via CodePay: no void on completed auth, use refund
    "D0004", // TSYS: Reversal Not Allowed
    "D0090", // TSYS: Reversal Not Allowed (Backend)
    "E8908", // TSYS: Voiding/Cancel not allowed
    "E8909", // TSYS: Transaction Originated, use refund
  ],
  refund_not_allowed: [
    "D0005", // TSYS: Return Not Allowed (not settled)
    "D0091", // TSYS: Return Not Allowed (Backend)
  ],
  not_found: [
    "ET002", // CodePay: The reversal transaction does not exist
    "ET003", // CodePay: The transaction does not exist
    "E04110", // CodePay: Transaction number is invalid
    "E04111", // CodePay: Merchant order number is invalid
  ],
  already_reversed: [],
  amount_exceeds: [
    "E04126", // CodePay: Refund amount exceeds the limit
    "E04130", // CodePay: No more than $X.XX amount refunds per transaction
  ],
  partial_not_allowed: [
    "E04132", // CodePay: Partial refund is not allowed for this transaction
    "E1502", // TSYS: Partial void/return is not allowed
  ],
  duplicate_reference: [
    "E04112", // CodePay: Merchant order number repeat
    "E04131", // CodePay: Transaction number cannot be duplicate
  ],
  card_mismatch: [
    "D0094", // TSYS: Return not allowed, card number does not match
  ],
};

/**
 * Message rules, first match wins. Fiserv's codes and CodePay's 119 ("Can not
 * void") are bare numbers that can collide between processors, so those are
 * read from the message, never from the number:
 *   Fiserv 902 "transaction already settled", 942 "settlement already
 *   occurred", 414 "cut-off window elapsed", 333 "No previous transaction",
 *   334 "Already reversed", 772 "Duplicate Return", 774 "Duplicate Reversal".
 * "not settled" is tested before "settled".
 */
const MESSAGES: [CodePayReversalDeclineKind, RegExp][] = [
  ["card_mismatch", /card number.*does not match/i],
  ["partial_not_allowed", /partial (refund|return|void)\S*.*not allowed/i],
  ["amount_exceeds", /(refund|return) amount exceeds|amount refunds per transaction/i],
  ["duplicate_reference", /order number repeat|number cannot be duplicate/i],
  [
    "already_reversed",
    /already (been )?(reversed|voided|refunded|returned)|duplicate (return|reversal)/i,
  ],
  ["refund_not_allowed", /(return|refund)( is)? not allowed|not (been |yet )?settled|unsettled/i],
  [
    "void_not_allowed",
    /\bsettled\b|settlement (has )?already occurred|cut-?off window|use (the )?refund|(reversal|void\w*|cancel\w*)( is)? not allowed|can ?not void/i,
  ],
  [
    "not_found",
    /(transaction|order) (does not exist|not found)|can'?t find original|no previous transaction|order number is invalid|transaction number is invalid/i,
  ],
];

function kindFromMessage(msg: string): CodePayReversalDeclineKind {
  for (const [kind, re] of MESSAGES) if (re.test(msg)) return kind;
  return "unknown";
}

/**
 * Read a definitive decline. `code` is the Intent response_code (or the
 * processor's own code); `message` is response_msg. A known code wins over
 * the message. Gateway / configuration errors (SYS…, E07…) are never a
 * verdict on the transaction.
 */
export function classifyCodePayReversalDecline(
  code: unknown,
  message: unknown,
  ...extraCodes: unknown[]
): CodePayReversalDeclineKind {
  const msg = typeof message === "string" ? message : "";
  // A code can also arrive inside the message, e.g. "[ET008] Reversal not …".
  const inMessage = msg.match(/\[([A-Za-z0-9_-]{3,12})\]/)?.[1];
  const codes = [code, ...extraCodes, inMessage]
    .map(normalizeCodePayCode)
    .filter(Boolean);

  if (codes.some((c) => /^(SYS|E07)/.test(c))) return "unknown";

  for (const c of codes) {
    for (const kind of Object.keys(CODES) as (keyof typeof CODES)[]) {
      if (CODES[kind].includes(c)) return kind;
    }
  }
  return msg ? kindFromMessage(msg) : "unknown";
}

/** The operation a reversal starts with. */
export function firstCodePayReversalOperation(p: {
  coversWholeSale: boolean;
  inOpenBatch: boolean;
}): CodePayReversalOperation {
  return p.coversWholeSale && p.inOpenBatch ? "void" : "refund";
}

/**
 * The operation to try after `declined` was turned down for `kind`, or null
 * when the decline is final. A void only ever stands in for a reversal of the
 * whole, untouched sale.
 */
export function nextCodePayReversalOperation(
  declined: CodePayReversalOperation,
  kind: CodePayReversalDeclineKind,
  coversWholeSale: boolean,
): CodePayReversalOperation | null {
  if (declined === "void" && kind === "void_not_allowed") return "refund";
  if (declined === "refund" && kind === "refund_not_allowed" && coversWholeSale) {
    return "void";
  }
  return null;
}

/** What staff are told when a reversal is turned down for good. */
export function codePayReversalDeclineMessage(
  kind: CodePayReversalDeclineKind,
  ctx: {
    operation: CodePayReversalOperation;
    coversWholeSale: boolean;
    code?: string;
    message?: string;
  },
): string {
  const detail = [ctx.code, ctx.message].filter(Boolean).join(": ");
  const tail = detail ? ` (CodePay ${detail})` : "";
  switch (kind) {
    case "refund_not_allowed":
      return ctx.coversWholeSale
        ? `The card processor turned this refund down.${tail}`
        : `This payment hasn't been batched out yet, so only the whole charge can be cancelled. Refund the full payment now, or batch out and then refund part of it.${tail}`;
    case "void_not_allowed":
      return `This payment can't be cancelled because it's already batched out.${tail}`;
    case "not_found":
      return `CodePay can't find the original payment, so it can't be refunded by reference. Check it in CodePay Register or PayPilot.${tail}`;
    case "already_reversed":
      return `CodePay says this payment was already cancelled or refunded. Check CodePay Register before trying again.${tail}`;
    case "amount_exceeds":
      return `This refund is more than CodePay allows for the payment. Part of it may already be refunded.${tail}`;
    case "partial_not_allowed":
      return `The card processor doesn't allow a partial refund on this payment. Refund the full payment instead.${tail}`;
    case "duplicate_reference":
      return `CodePay already has a transaction with this reference. Check CodePay Register, then try again.${tail}`;
    case "card_mismatch":
      return `The card doesn't match the one used for the original payment.${tail}`;
    default:
      return detail
        ? `CodePay turned the ${ctx.operation} down. ${detail}`
        : `CodePay turned the ${ctx.operation} down.`;
  }
}
