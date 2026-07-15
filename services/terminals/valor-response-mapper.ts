// ============================================================
// Valor Response Mapper
// File: services/terminals/valor-response-mapper.ts
// ============================================================
// Maps a de-framed Valor response into the JSONB shape stored on
// order_payments.processor_response and consumed by process_payment_v17
// (terminal_vendor: 'valor'). Mirrors buildCastlesTerminalResponse.
// ============================================================

import type { ValorRawResponse } from "@/types/valor";

/** Last-4 from a Valor masked PAN ("4160 **** **** 5103" → "5103"). */
export function extractLast4(masked: string | undefined): string {
  if (!masked) return "";
  const digits = String(masked).replace(/[\s*]/g, "");
  return digits.slice(-4);
}

/** Normalize Valor ENTRY_MODE (TAP / CHIP / SWIPE) to a standard string. */
export function normalizeEntryMode(raw: string | undefined): string {
  if (!raw) return "unknown";
  const upper = raw.toUpperCase();
  switch (upper) {
    case "TAP":
    case "CTLS":
    case "CONTACTLESS":
    case "EMVCL":
      return "contactless";
    case "SWIPE":
    case "MSR":
      return "swipe";
    case "CHIP":
    case "ICC":
    case "EMV":
      return "chip";
    case "MANUAL":
    case "KEYED":
      return "manual";
    case "FALLBACK":
      return "fallback";
    default:
      return raw.toLowerCase();
  }
}

/** Normalize a Valor ISSUER / CARD_BRAND string to a canonical brand. */
export function normalizeCardType(raw: string | undefined): string {
  if (!raw) return "Unknown";
  const upper = raw.toUpperCase();
  if (upper.includes("VISA")) return "VISA";
  if (upper.includes("MASTER")) return "MASTERCARD";
  if (upper.includes("AMEX") || upper.includes("AMERICAN")) return "AMEX";
  if (upper.includes("DISCOVER")) return "DISCOVER";
  if (upper.includes("DINERS")) return "DINERS";
  if (upper.includes("JCB")) return "JCB";
  if (upper.includes("UNIONPAY") || upper.includes("CUP")) return "UNIONPAY";
  return raw;
}

/** Interpret a Valor STATE code. */
export function parseValorState(state: string | undefined): {
  success: boolean;
  /** true for STATE "-2" — indeterminate; must route to TRAN_MODE 90 recovery. */
  indeterminate: boolean;
} {
  const s = String(state ?? "").trim();
  if (s === "0") return { success: true, indeterminate: false };
  if (s === "-2") return { success: false, indeterminate: true };
  return { success: false, indeterminate: false };
}

/**
 * Build the JSONB payload stored alongside the payment record.
 * Shape: { terminal_vendor, valor_transaction, raw_valor_response }.
 *
 * NOTE: `tranNo` (the charge-slip "Trans" number) is the reversal reference
 * for VOID / TIP_ADJUST — persist it. `stanNo` is the TRAN_MODE 90 recovery
 * key, NOT a reversal reference.
 */
export function buildValorTerminalResponse(
  raw: ValorRawResponse,
  dbTerminalId?: string,
): Record<string, unknown> {
  const maskedPan = raw.MASKED_PAN ?? "";
  const cardBrand = raw.CARD_BRAND ?? raw.ISSUER ?? raw.CARD_TYPE ?? "";
  const entryMode = raw.ENTRY_MODE ?? "";
  const tranNo = raw.TRAN_NO ?? "";
  const reversalTypes = ["sale", "refund", "return"];
  if (!tranNo && reversalTypes.includes(String(raw.TRAN_METHOD ?? "").toLowerCase())) {
    console.warn(
      "[ValorMapper] TRAN_NO is empty — void and tip-adjust need it as the reversal key.",
      { TRAN_NO: raw.TRAN_NO, TRAN_METHOD: raw.TRAN_METHOD },
    );
  }

  return {
    terminal_vendor: "valor",
    valor_transaction: {
      transactionType: raw.TRAN_METHOD,
      cardKind: raw.TRAN_TYPE,
      /** Client transaction id (REQ_TXN_ID / echoed MER_TXN_ID). */
      reqTxnId: raw.REQ_TXN_ID ?? raw.MER_TXN_ID ?? "",
      /** Switch-assigned unique txn id. */
      txnId: raw.TXN_ID ?? "",
      /** Charge-slip "Trans" number — reversal reference for VOID / TIP_ADJUST. */
      tranNo,
      /** System Trace Audit Number — TRAN_MODE 90 recovery key (NOT a reversal ref). */
      stanNo: raw.STAN_NO ?? raw.STAN_ID ?? "",
      resultCode: raw.STATE,
      approvalCode: raw.CODE ?? "",
      rrn: raw.RRN ?? "",
      cardLast4: extractLast4(maskedPan),
      cardType: normalizeCardType(cardBrand),
      entryMode: normalizeEntryMode(entryMode),
      issuer: raw.ISSUER ?? "",
      cardAID: raw.AID ?? "",
      expiryDate: raw.EXPIRY_DATE ?? "",
      cardholderName: raw.CARDHOLDER_NAME ?? "",
      amountBase: raw.AMOUNT ?? "",
      amountTip: raw.TIP_AMOUNT ?? "",
      amountTotal: raw.TOTAL_AMOUNT ?? raw.AMOUNT ?? "",
      surchargeAmount: raw.SURCHARGE_AMOUNT ?? "",
      batchNumber: raw.BATCH_NO ?? "",
      token: raw.TOKEN ?? raw.TOKEN_ID ?? "",
      dateTime: raw.DATE ?? "",
      epi: raw.EPI ?? "",
      terminalId: dbTerminalId ?? "",
      hardwareSerial: raw.SERIAL_NO ?? "",
      statusMessage: raw.AUTH_RSP_TEXT ?? raw.ERROR_MSG ?? "",
      errorCode: raw.ERROR_CODE ?? "",
    },
    raw_valor_response: { ...raw },
  };
}
