// ============================================================
// ATOM Response Mapper
// File: services/terminals/atom-response-mapper.ts
// ============================================================
// Maps an ATOM PaymentResponse into the JSONB shape stored on
// order_payments.processor_response and consumed by the process_payment RPC.
// Mirrors buildValorTerminalResponse / buildCastlesTerminalResponse: the SAME
// flattened top-level keys (terminal_type, card_last_four, card_type,
// authorization_code, rrn, entry_type, transaction_number…) that the RPC lifts
// into columns, PLUS a nested atom_transaction blob for the detail sheet.
// ============================================================

import type { AtomPaymentResponse } from "@/types/atom";
import { extractLast4, normalizeCardType } from "./valor-response-mapper";

/** Normalize an ATOM EntryMode enum to the canonical entry_type string. */
export function normalizeAtomEntryMode(raw: string | undefined): string {
  if (!raw) return "unknown";
  const upper = raw.toUpperCase();
  switch (upper) {
    case "EMV_TAP":
    case "MSR_RFID":
    case "CONTACTLESS":
      return "contactless";
    case "MSR_SWIPE":
    case "SWIPE":
      return "swipe";
    case "EMV_DIP":
    case "CHIP":
      return "chip";
    case "MANUAL":
    case "KEYED":
      return "manual";
    default:
      return raw.toLowerCase();
  }
}

/** Interpret an ATOM responseCategory. */
export function parseAtomCategory(category: string | undefined): {
  success: boolean;
  declined: boolean;
} {
  const c = String(category ?? "").toUpperCase();
  if (c === "APPROVED") return { success: true, declined: false };
  // DECLINED / FAILED are both non-success; DECLINED is a clean decline.
  return { success: false, declined: c === "DECLINED" };
}

/**
 * Build the JSONB payload stored alongside the payment record.
 * Shape: { terminal_vendor: "atom", <flat fields>, atom_transaction, raw_atom_response }.
 * Keep the flat keys in sync with atom_transaction below (same convention as Valor).
 */
export function buildAtomTerminalResponse(
  pr: AtomPaymentResponse,
  dbTerminalId?: string,
): Record<string, unknown> {
  const results = pr.paymentResults ?? {};
  const card = pr.cardInfo ?? {};
  const receipt = pr.receiptData ?? {};

  const maskedPan = card.maskedPan ?? receipt.maskedPan ?? "";
  const cardLast4 = extractLast4(maskedPan);
  const cardType = normalizeCardType(card.cardBrand ?? receipt.cardType);
  const entryType = normalizeAtomEntryMode(card.entryMode ?? receipt.cardEntryMethod);
  const approvalCode = results.approvalCode ?? receipt.approvalCode ?? "";
  const rrn = results.processorReferenceNumber ?? "";
  const paymentId = pr.paymentId ?? "";

  return {
    terminal_vendor: "atom",
    // Flat fields the process_payment RPC lifts into order_payments columns
    // (terminal_type, card_last_four, card_type, authorization_code, rrn,
    // entry_type, transaction_id/number…) — the SAME keys Castles/Valor/Dejavoo
    // emit, so every hydration path that reads the flat columns works.
    terminal_type: "atom",
    card_last_four: cardLast4,
    card_type: cardType,
    authorization_code: approvalCode,
    auth_code: approvalCode,
    rrn,
    entry_type: entryType,
    transaction_id: paymentId || pr.posReferenceNumber || "",
    transaction_number: paymentId,
    batch_number: "", // ATOM sale response has no batch; comes from /status.currentBatch if needed later.
    atom_transaction: {
      /** ATOM's unique payment id — the handle for lookup / refund / void / tipAdjust (v2). */
      paymentId,
      posReferenceNumber: pr.posReferenceNumber ?? "",
      responseCategory: results.responseCategory ?? "",
      responseMessage: results.responseMessage ?? "",
      transactionStatus: results.transactionStatus ?? "",
      approvalCode,
      rrn,
      hostResponseCode: results.hostResponseCode ?? "",
      processorResponseCode: results.processorResponseCode ?? "",
      processorResponseMessage: results.processorResponseMessage ?? "",
      authorizedAmount: results.authorizedAmount ?? "",
      tipAmount: results.tipAmount ?? "",
      taxAmount: results.taxAmount ?? "",
      finalTotalAmount: results.finalTotalAmount ?? "",
      cardLast4,
      cardType,
      entryMode: entryType,
      cardholderName: card.cardholderName ?? "",
      paymentMethod: card.paymentMethod ?? "",
      accountType: card.accountType ?? "",
      maskedPan,
      mid: receipt.mid ?? "",
      tid: receipt.tid ?? "",
      transactionTimestamp: receipt.transactionTimestamp ?? "",
      currency: receipt.currency ?? "",
      storeAndForwardMode: results.storeAndForwardMode ?? false,
      terminalId: dbTerminalId ?? "",
    },
    raw_atom_response: { ...pr },
  };
}
