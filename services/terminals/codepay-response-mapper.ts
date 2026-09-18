// ============================================================
// CodePay Response Mapper
// File: services/terminals/codepay-response-mapper.ts
// ============================================================
// Maps a CodePay on-terminal result (response_code + biz_data JSON) into the
// JSONB shape stored on order_payments.processor_response and consumed by the
// process_payment RPC. Mirrors buildAtomTerminalResponse / buildValorTerminal
// Response: the SAME flattened top-level keys (terminal_type, card_last_four,
// card_type, authorization_code, rrn, entry_type, transaction_id/number,
// batch_number) that the RPC lifts into columns, PLUS a nested
// codepay_transaction blob for the detail sheet.
//
// Field names are per the CodePay "Common data" table (docs/guides/api-structure):
//   card_no = masked PAN (e.g. 430277****5723), auth_code = approval code,
//   ref_no = RRN, entry_mode = 1(swipe)/2(chip)/3(contactless)/4(manual).
// There is NO card-brand field — brand is derived from the PAN BIN. The raw biz
// object is always retained, so any extra/renamed keys survive for inspection.
// Still verify on live hardware: whether trans_status arrives as a string or a
// number, and whether response_code is a top-level Intent extra vs. nested in
// biz_data (the service handles both).
// ============================================================

import {
  CODEPAY_ENTRY_MODE,
  CODEPAY_SUCCESS_CODE,
  type CodePayBizResult,
} from "@/types/codepay";
import { extractLast4, normalizeCardType } from "./valor-response-mapper";

/** Map CodePay's numeric entry_mode (1–4) to the canonical entry_type string. */
export function normalizeCodePayEntryMode(raw: string | undefined): string {
  switch (raw) {
    case CODEPAY_ENTRY_MODE.SWIPE:
      return "swipe";
    case CODEPAY_ENTRY_MODE.CHIP:
      return "chip";
    case CODEPAY_ENTRY_MODE.CONTACTLESS:
      return "contactless";
    case CODEPAY_ENTRY_MODE.MANUAL:
      return "manual";
    default:
      return raw ? String(raw) : "unknown";
  }
}

/**
 * CodePay's result has no card-brand field — only the masked PAN (card_no).
 * Derive the brand from the leading BIN digits (best-effort). Returns "" when
 * the PAN is absent/unrecognized so callers can fall back gracefully.
 */
export function cardBrandFromPan(pan: string | undefined): string {
  const digits = (pan ?? "").replace(/[^0-9]/g, "");
  if (!digits) return "";
  if (/^4/.test(digits)) return "Visa";
  if (/^(5[1-5]|2[2-7])/.test(digits)) return "Mastercard";
  if (/^3[47]/.test(digits)) return "Amex";
  if (/^(6011|65|64[4-9])/.test(digits)) return "Discover";
  if (/^3(0[0-5]|6|8)/.test(digits)) return "Diners";
  if (/^35/.test(digits)) return "JCB";
  return "";
}

/** Safe-parse the biz_data JSON string CodePay Register returns. */
export function parseCodePayBiz(
  bizDataJson: string | null | undefined,
): CodePayBizResult {
  if (!bizDataJson) return {};
  try {
    const parsed = JSON.parse(bizDataJson);
    return (parsed ?? {}) as CodePayBizResult;
  } catch {
    return {};
  }
}

/** A CodePay op succeeded when the Intent response_code is "000". */
export function isCodePaySuccess(
  responseCode: string | null | undefined,
): boolean {
  return responseCode === CODEPAY_SUCCESS_CODE;
}

/** First non-empty string among a set of biz aliases. */
function firstStr(
  biz: CodePayBizResult,
  ...keys: string[]
): string {
  for (const k of keys) {
    const v = biz[k];
    if (typeof v === "string" && v.trim()) return v;
    if (typeof v === "number") return String(v);
  }
  return "";
}

/**
 * Build the JSONB payload stored alongside the payment record.
 * Shape: { terminal_vendor: "codepay", <flat fields>, codepay_transaction,
 * raw_codepay_response }. Keep the flat keys in sync with codepay_transaction
 * (same convention as ATOM/Valor).
 */
export function buildCodePayTerminalResponse(
  biz: CodePayBizResult,
  dbTerminalId?: string,
  terminalSn?: string,
): Record<string, unknown> {
  // Confirmed field names (docs/guides/api-structure "Common data"):
  //   card_no = masked PAN, auth_code = approval, ref_no = RRN, entry_mode = 1-4.
  // No card-brand field exists — derive it from the PAN BIN.
  const maskedPan = firstStr(biz, "card_no");
  const cardLast4 = extractLast4(maskedPan);
  const cardType = normalizeCardType(cardBrandFromPan(maskedPan));
  const authCode = firstStr(biz, "auth_code");
  const rrn = firstStr(biz, "ref_no");
  const entryType = normalizeCodePayEntryMode(firstStr(biz, "entry_mode") || undefined);
  const cardHolderName = firstStr(biz, "card_holder_name");
  const transNo = firstStr(biz, "trans_no");
  const merchantOrderNo = firstStr(biz, "merchant_order_no");

  return {
    terminal_vendor: "codepay",
    // Flat fields the process_payment RPC lifts into order_payments columns —
    // the SAME keys Castles/Valor/ATOM/Dejavoo emit, so every hydration path
    // that reads the flat columns works unchanged.
    terminal_type: "codepay",
    card_last_four: cardLast4,
    card_type: cardType,
    authorization_code: authCode,
    auth_code: authCode,
    rrn,
    entry_type: entryType,
    transaction_id: transNo || merchantOrderNo,
    transaction_number: transNo,
    reference_number: merchantOrderNo,
    batch_number: firstStr(biz, "batch_no", "batch_number"),
    serial_number: terminalSn ?? firstStr(biz, "terminal_sn", "device_sn"),
    codepay_transaction: {
      transNo,
      merchantOrderNo,
      transType: biz.trans_type ?? "",
      transStatus: biz.trans_status ?? "",
      orderAmount: biz.order_amount ?? "",
      transAmount: biz.trans_amount ?? "",
      tipAmount: biz.tip_amount ?? "",
      taxAmount: biz.tax_amount ?? "",
      paidAmount: biz.paid_amount ?? "",
      currency: biz.price_currency ?? "",
      payScenario: biz.pay_scenario ?? "",
      payMethodId: biz.pay_method_id ?? "",
      transEndTime: biz.trans_end_time ?? "",
      authCode,
      rrn,
      entryMode: entryType,
      cardLast4,
      cardType,
      maskedPan,
      cardHolderName,
      merchantNo: biz.merchant_no ?? "",
      merchantName: biz.merchant_name ?? "",
      signatureUrl: biz.signature_url ?? "",
      terminalSn: terminalSn ?? "",
      terminalId: dbTerminalId ?? "",
    },
    raw_codepay_response: { ...biz },
  };
}
