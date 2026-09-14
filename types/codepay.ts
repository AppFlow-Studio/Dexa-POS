// ============================================================
// CodePay on-terminal (ECR Hub) Payment Types
// File: types/codepay.ts
// ============================================================
// CodePay terminals run the "CodePay Register" app. When Dexa-POS runs ON the
// same CodePay terminal, we drive payments by launching CodePay Register via an
// Android Intent and receiving the result back through onActivityResult — no
// TCP socket (Castles/Valor) and no loopback HTTPS (ATOM). All traffic is local
// app-to-app; there is NO RSA signing on this path (that's the cloud REST path).
//
//   action:  com.codepay.transaction.call   (startActivityForResult)
//   extras:  version="2.0", app_id, topic, biz_data (JSON string)
//   result:  response_code ("000" = success), response_msg, biz_data (JSON)
//
// Every operation rides the SAME Intent, switched by `topic` + `trans_type`:
//   Sale / Refund / Void  → topic "ecrhub.pay.order"      (trans_type 1 / 3 / 2)
//   Query / Retrieve      → topic "ecrhub.pay.query"
//   Tip adjust            → topic "ecrhub.pay.tip.adjustment"
//   Batch close           → topic "ecrhub.pay.batch.close"
//
// Field-level payloads mirror the CodePay Cloud Open API (/docs/CloudAPI); the
// on-terminal path just wraps the same biz object in an Intent extra.
//
// biz_data field names follow the CodePay "Common data" table
// (docs/guides/api-structure): card_no (masked PAN), auth_code, ref_no (RRN),
// entry_mode (1-4). There is no card-brand field — it is derived from the PAN.
// Still verify on live hardware: trans_status string-vs-number, and whether
// response_code is a top-level Intent extra vs. nested in biz_data.
// ============================================================

// ============================================================
// INTENT CONTRACT
// ============================================================

/** Intent action CodePay Register responds to on the terminal. */
export const CODEPAY_TRANSACTION_ACTION = "com.codepay.transaction.call";

/** Intent protocol version the docs specify. */
export const CODEPAY_INTENT_VERSION = "2.0";

/** biz_data.topic — selects the operation family. */
export const CODEPAY_TOPIC = {
  /** Sale, referenced/unreferenced refund, and void all use the order topic. */
  ORDER: "ecrhub.pay.order",
  /** Look up a prior transaction by merchant_order_no / trans_no. */
  QUERY: "ecrhub.pay.query",
  /** Adjust the tip on a completed transaction. */
  TIP_ADJUST: "ecrhub.pay.tip.adjustment",
  /** Close the open batch (settlement). */
  BATCH_CLOSE: "ecrhub.pay.batch.close",
} as const;

export type CodePayTopic = (typeof CODEPAY_TOPIC)[keyof typeof CODEPAY_TOPIC];

/** biz_data.trans_type — string per the on-terminal spec. */
export const CODEPAY_TRANS_TYPE = {
  SALE: "1",
  VOID: "2",
  REFUND: "3",
  AUTH: "4",
  CASHBACK: "11",
} as const;

export type CodePayTransType =
  (typeof CODEPAY_TRANS_TYPE)[keyof typeof CODEPAY_TRANS_TYPE];

/** biz_data.pay_scenario. SWIPE_CARD is the standard card-present flow. */
export const CODEPAY_PAY_SCENARIO = {
  SWIPE_CARD: "SWIPE_CARD",
  SCANQR_PAY: "SCANQR_PAY",
  BSCANQR_PAY: "BSCANQR_PAY",
} as const;

/** response_code that means the operation succeeded. */
export const CODEPAY_SUCCESS_CODE = "000";

/**
 * trans_status from a Query/result biz object.
 *   2 = completed (paid / refunded / voided)
 *   9 = pre-paid / pushed, awaiting capture
 */
export const CODEPAY_TRANS_STATUS = {
  COMPLETED: 2,
  PREPAID: 9,
} as const;

/**
 * biz_data.entry_mode — card entry method (numeric string per api-structure):
 *   1 = Magnetic stripe swipe, 2 = Contact chip, 3 = Contactless, 4 = Manual.
 */
export const CODEPAY_ENTRY_MODE = {
  SWIPE: "1",
  CHIP: "2",
  CONTACTLESS: "3",
  MANUAL: "4",
} as const;

/**
 * biz_data.receipt_print_mode:
 *   0 = no printing (default), 1 = merchant copy, 2 = customer copy,
 *   3 = merchant + customer.
 */
export const CODEPAY_RECEIPT_PRINT_MODE = {
  NONE: 0,
  MERCHANT: 1,
  CUSTOMER: 2,
  BOTH: 3,
} as const;

// ============================================================
// CONNECTION CONFIG
// ============================================================

export interface CodePayConnectionConfig {
  /** Payment app id issued by CodePay (Intent extra `app_id`). */
  appId: string;
  /** payment_terminals.id (or the on-device internal terminal id). */
  terminalId: string;
  /** Terminal hardware serial (terminal_sn) — for identity + receipts. */
  terminalSn?: string;
  /** Per-op timeout in ms — the live card window is long. */
  timeout: number;
}

// ============================================================
// COMMAND PARAMS
// ============================================================

export interface CodePaySaleParams {
  /** Base amount to charge in DOLLARS (tip added on top when on_screen_tip). */
  amount: number;
  /** Pre-known tip in DOLLARS (0 if none / collected on-screen). */
  tipAmount?: number;
  /** Unique POS reference (idempotency handle) → merchant_order_no. */
  referenceId: string;
  /** Collect the tip on the terminal's own screen before the card read. */
  onScreenTip?: boolean;
  /** Show the on-terminal signature screen (default true). */
  onScreenSignature?: boolean;
  /** 0–3: control receipt printing on the terminal. */
  receiptPrintMode?: number;
  /** Card-present by default. */
  payScenario?: string;
}

export interface CodePayRefundParams {
  /** Unique POS reference for THIS refund → merchant_order_no. */
  referenceId: string;
  /**
   * Original sale's merchant_order_no. Present → referenced refund (no card
   * tap). Omit → unreferenced refund (cardholder must tap/insert).
   */
  origMerchantOrderNo?: string;
  /** Amount to refund in DOLLARS. Omit for a full refund. */
  amount?: number;
  /** Tip portion to refund in DOLLARS. */
  tipAmount?: number;
}

export interface CodePayVoidParams {
  /** Unique POS reference for THIS void → merchant_order_no. */
  referenceId: string;
  /**
   * Original sale's merchant_order_no → orig_merchant_order_no. This is how a
   * void references the original (the on-terminal spec has no trans_no field
   * for void). In-batch only.
   */
  origMerchantOrderNo?: string;
  /** Original transaction amount in DOLLARS → order_amount. */
  amount?: number;
}

export interface CodePayQueryParams {
  /** Merchant order number of the transaction to look up. */
  merchantOrderNo?: string;
  /** CodePay trans_no (takes priority if both are supplied). */
  transNo?: string;
}

export interface CodePayTipAdjustParams {
  /** Original sale's merchant_order_no (or trans_no). */
  origMerchantOrderNo?: string;
  transNo?: string;
  /** New/adjusted tip in DOLLARS → biz_data.tip_adjustment_amount. */
  tipAmount: number;
  /** Unique POS reference for this adjustment. */
  referenceId: string;
}

export interface CodePayBatchCloseParams {
  /** Optional POS reference for the batch-close request. */
  referenceId?: string;
}

// ============================================================
// RAW RESULT (parsed from the Intent + biz_data)
// ============================================================

/**
 * The structured result the native bridge resolves for every transact() call.
 * Never rejects for a transaction outcome — only for programmer errors
 * (no activity, CodePay Register not installed, a call already in flight).
 */
export interface CodePayIntentResult {
  /** Android activity result code (RESULT_OK = -1, RESULT_CANCELED = 0). */
  resultCode: number;
  /** biz response_code ("000" = success). Null if the Intent returned no data. */
  responseCode: string | null;
  /** biz response_msg. */
  responseMsg: string | null;
  /** Raw biz_data JSON string returned by CodePay Register. */
  bizData: string | null;
  /** True when the native timeout elapsed with no onActivityResult. */
  timedOut: boolean;
  /** True when the activity was cancelled (user backed out / RESULT_CANCELED). */
  canceled: boolean;
}

/**
 * biz_data payload (request echoed + result fields). Field names per the CodePay
 * API structure "Common data" table (docs/guides/api-structure):
 *   trans_no, merchant_order_no, order_amount, tip_amount, tax_amount,
 *   trans_status, trans_end_time, card_no (masked PAN, e.g. 430277****5723),
 *   auth_code, ref_no (RRN), entry_mode (1–4), merchant_no, merchant_name,
 *   card_holder_name, signature_url.
 * There is NO card brand/scheme field — derive it from the card_no BIN.
 * The index signature keeps any extra keys so nothing is silently dropped.
 */
export interface CodePayBizResult {
  trans_no?: string;
  merchant_order_no?: string;
  trans_type?: string | number;
  /** api-structure types this string; the cloud API showed a number — accept both. */
  trans_status?: string | number;
  order_amount?: string | number;
  trans_amount?: string | number;
  tip_amount?: string | number;
  tax_amount?: string | number;
  paid_amount?: string | number;
  price_currency?: string;
  pay_scenario?: string;
  pay_method_id?: string;
  trans_end_time?: string;
  /** Masked card PAN per PCI DSS, e.g. "430277****5723". */
  card_no?: string;
  /** Authentication/approval code (card transactions). */
  auth_code?: string;
  /** Retrieval Reference Number (RRN) — card transactions. */
  ref_no?: string;
  /** Card entry method: "1" swipe / "2" chip / "3" contactless / "4" manual. */
  entry_mode?: string;
  merchant_no?: string;
  merchant_name?: string;
  card_holder_name?: string;
  /** URL of the captured handwritten signature image, if any. */
  signature_url?: string;
  [key: string]: unknown;
}

/** Shared result shape for CodePay transactions (mirrors AtomTxnResult). */
export interface CodePayTxnResult {
  success: boolean;
  /**
   * true when the outcome could NOT be confirmed (the Intent timed out or
   * returned RESULT_OK with no readable result). The charge MAY have landed —
   * the caller must NOT re-charge; reconcile via query() / a manual hold.
   */
  indeterminate?: boolean;
  /**
   * true when the cardholder cancelled on the terminal (RESULT_CANCELED, no
   * card read, no charge) — a clean, retryable abort, not a decline.
   */
  aborted?: boolean;
  /** Parsed biz_data. */
  raw?: CodePayBizResult;
  /** JSONB payload for the process_payment RPC (`codepay_transaction`). */
  terminalResponse?: Record<string, unknown>;
  error?: string;
  errorCode?: string;
  /** CodePay trans_no — the id to reference for refund/void/tip/query. */
  transNo?: string;
  /** merchant_order_no we sent (referenced refund/void key). */
  merchantOrderNo?: string;
  rrn?: string;
}

// ============================================================
// CONSTANTS
// ============================================================

export const CODEPAY_DEFAULT_CURRENCY = "USD";

/** Sentinel id for the in-memory internal CodePay terminal (NOT a payment_terminals UUID). */
export const CODEPAY_INTERNAL_TERMINAL_ID = "codepay-internal";

/**
 * Merchant CodePay payment app id (Intent extra `app_id`). Seeds the persisted
 * app-id setting so the on-device auto-detect can activate CodePay with no other
 * config. Overridable at runtime via useCodePayTerminalStore.setAppId.
 */
export const CODEPAY_DEFAULT_APP_ID = "wz1f2e3295adc70112";
/** Default order expiry (seconds) handed to the terminal. */
export const CODEPAY_DEFAULT_EXPIRES_SEC = 120;

// Per-op timeouts (ms)
/** Live sale window — the terminal reads the card and contacts the host. */
export const CODEPAY_SALE_TIMEOUT_MS = 120_000;
/** Non-card ops (query / batch close / referenced refund). */
export const CODEPAY_QUERY_TIMEOUT_MS = 30_000;
/** Hard ceiling for the interactive "Test Connection" spinner. */
export const CODEPAY_TEST_DEADLINE_MS = 20_000;
