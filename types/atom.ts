// ============================================================
// LandiGlobal ATOM POS Payment Terminal Types
// File: types/atom.ts
// ============================================================
// ATOM terminals expose a REST/HTTPS API (unlike Valor/Castles which are raw
// TCP sockets). On the Landi P30 the ATOM payment app runs ON THE SAME DEVICE
// as Dexa-POS, so the POS talks to it over loopback:
//
//   https://127.0.0.1:8443/api/device/v1/...
//
// Discovered on-device (P30, adb):
//   - package: com.landiglobal.atom.nar
//   - HTTPS listener: 127.0.0.1:8443
//   - cert: self-signed CN=localhost, O=Landi Global, OU=ATOM, NO SubjectAltName
//     → OkHttp hostname verification fails → all HTTP goes through the native
//       AtomBridge module (custom TrustManager + loopback HostnameVerifier).
//   - amounts are decimal DOLLARS (e.g. 10.01), NOT integer cents (opposite of Valor).
//   - error shape: { error, errorCode }, HTTP 400 on VALIDATION_ERROR.
//
// Scope of this file (v1): ping, status, sale (authorize + capture in one step).
// Refund / void / cancel / tipAdjust / batch are deferred (seams only).
// ============================================================

// ============================================================
// CONNECTION CONFIG
// ============================================================

export interface AtomConnectionConfig {
  /** Loopback host — always "127.0.0.1" for the on-device ATOM app. */
  host: string;
  /** Discovered ATOM HTTPS server port (8443 on the P30). */
  port: number;
  /** payment_terminals.id (or synthetic id for the in-memory internal terminal). */
  terminalId: string;
  /** Per-request timeout in ms — the live sale window is long. */
  timeout: number;
}

// ============================================================
// REQUEST BODIES
// ============================================================

/**
 * Inline tip-prompt config (Flow A). When present on /authorize, the ATOM
 * terminal renders a tip-selection screen ON THE DEVICE before the card read,
 * adds the chosen tip to totalAmountToAuthorize, and authorizes the combined
 * total in one round trip. Mutually exclusive with tipAmount (Flow B).
 * A NO TIP button always shows; CANCEL/timeout aborts the whole sale
 * (HTTP 400 DEV008 = cancel, DEV009 = timeout — no card read, no charge).
 */
export interface AtomTipPromptOptions {
  /** Suggested tip % buttons. Omit → terminal default [15, 18, 20, 25]. */
  suggestedPercentages?: number[];
  /** Show the CUSTOM keypad button (capped at 50% of subtotal). Default true. */
  allowCustomAmount?: boolean;
  /** Override the "Add Tip" screen title. */
  message?: string;
  /** Per-screen timeout in seconds. Default 30. */
  timeoutSeconds?: number;
}

/** POST /api/device/v1/authorize body — the subset v1 sends. */
export interface AtomAuthorizationRequest {
  /** POS unique reference for this payment — our idempotency handle. Required. */
  posReferenceNumber: string;
  /** Total to authorize, in DOLLARS (e.g. 10.01). Required. Excludes the tip
   *  when using tipPrompt (Flow A) — the terminal adds it. */
  totalAmountToAuthorize: number;
  /** Tip in DOLLARS, when baked into the auth (Flow B). Mutually exclusive
   *  with tipPrompt. */
  tipAmount?: number;
  /** Inline on-device tip prompt (Flow A). Mutually exclusive with tipAmount. */
  tipPrompt?: AtomTipPromptOptions;
  /** Tax in DOLLARS. */
  taxAmount?: number;
  /** ISO 4217 trigraph. Defaults to "USD". */
  currency?: string;
  /** true = Sale (authorize AND capture in one step). v1 always sends true. */
  completeThisAuthorization?: boolean;
  /** Restrict accepted card types (default: all). */
  acceptedPaymentMethods?: AtomPaymentMethod[];
  /** Point-of-sale industry data (Restaurant Level 2/3). */
  posData?: {
    industryData?: {
      type?: "RESTAURANT";
      checkNumber?: string;
      tableNumber?: string;
      server?: string;
      numGuests?: number;
    };
  };
}

export type AtomPaymentMethod =
  | "ANY"
  | "CREDIT_CARD"
  | "DEBIT_CARD"
  | "EBT_CARD"
  | "GIFT_CARD";

// ============================================================
// RESPONSE SHAPES (from the ATOM REST API)
// ============================================================

export type AtomResponseCategory = "APPROVED" | "DECLINED" | "FAILED";

export interface AtomPaymentResults {
  responseMessage?: string;
  responseCategory?: AtomResponseCategory;
  authorizedAmount?: number;
  originalRequestedAmount?: number;
  tipAmount?: number;
  taxAmount?: number;
  finalTotalAmount?: number;
  approvalCode?: string;
  transactionStatus?: string;
  cvvResult?: string;
  avsResult?: string;
  signatureRequired?: boolean;
  partiallyApproved?: boolean;
  hostResponseCode?: string;
  processorResponseCode?: string;
  processorResponseMessage?: string;
  /** The processor's unique reference number for the txn (~ RRN). */
  processorReferenceNumber?: string;
  storeAndForwardMode?: boolean;
  balanceAmount?: number;
}

export interface AtomCardInfo {
  /** e.g. "XXXXXXXXXXXX1234". */
  maskedPan?: string;
  /** VISA / MASTERCARD / AMEX / DISCOVER / ... */
  cardBrand?: string;
  paymentMethod?: string;
  accountType?: string;
  cardholderName?: string;
  /** MANUAL / MSR_SWIPE / MSR_RFID / EMV_DIP / EMV_TAP / ... */
  entryMode?: string;
}

export interface AtomReceiptData {
  merchantName?: string;
  transactionType?: string;
  transactionStatus?: string;
  transactionTimestamp?: string;
  /** Merchant ID. */
  mid?: string;
  /** Terminal ID. */
  tid?: string;
  /** The payment ID used for the transaction. */
  transactionNumber?: string;
  receiptNumber?: string;
  cardType?: string;
  maskedPan?: string;
  cardEntryMethod?: string;
  approvalCode?: string;
  transactionAmount?: number;
  currency?: string;
}

/** 200 PaymentResponse. */
export interface AtomPaymentResponse {
  paymentId?: string;
  posReferenceNumber?: string;
  paymentResults?: AtomPaymentResults;
  cardInfo?: AtomCardInfo;
  receiptData?: AtomReceiptData;
  receipt?: unknown;
  [key: string]: unknown;
}

/** 4xx / 5xx ErrorResponse. */
export interface AtomErrorResponse {
  error?: string;
  errorCode?: string;
  field?: string;
}

/** GET /ping. Any 200 means reachable. */
export interface AtomPingResponse {
  status?: string;
  ready?: boolean;
  timestamp?: string;
  uptime?: string;
  [key: string]: unknown;
}

/** GET /status. */
export interface AtomDeviceStatusResponse {
  /** IDLE / WAITING_FOR_CARD / PROCESSING / OFFLINE / ERROR / ... */
  status?: string;
  deviceReady?: boolean;
  gatewayOnline?: boolean;
  currentBatch?: string | number;
  transactionCount?: number;
  batteryLevel?: number;
  isCharging?: boolean;
  networkConnected?: boolean;
  errorMessage?: string;
}

// ============================================================
// COMMAND PARAMS / RESULTS
// ============================================================

export interface AtomSaleParams {
  /** Base amount in DOLLARS (excludes tip when tipPrompt is used). */
  amount: number;
  /** Tip in DOLLARS, pre-known (Flow B). Mutually exclusive with tipPrompt. */
  tipAmount?: number;
  /**
   * Inline on-device tip prompt (Flow A). When set, the terminal collects the
   * tip on its own screen and returns the chosen amount in
   * paymentResults.tipAmount. Mutually exclusive with tipAmount.
   */
  tipPrompt?: AtomTipPromptOptions;
  /** posReferenceNumber — the idempotency handle. */
  referenceId: string;
  /** Restaurant industry data for interchange / receipts. */
  posData?: AtomAuthorizationRequest["posData"];
}

/** POST /tipAdjust — adds/updates the tip on a prior payment AND captures it. */
export interface AtomTipAdjustParams {
  /** ATOM paymentId of the original sale/auth. */
  paymentId: string;
  /** New tip in DOLLARS (replaces any existing tip). */
  tipAmount: number;
  /** New final total in DOLLARS (base + tip + other charges). */
  newFinalTotalAmount: number;
  /** posReferenceNumber for this adjustment. */
  referenceId: string;
}

/** POST /refund — linked refund/void of a prior payment by paymentId. */
export interface AtomRefundParams {
  /** ATOM paymentId of the original sale. */
  paymentId: string;
  /** Amount to refund in DOLLARS. Omit for a full refund (ATOM auto-voids if the batch is open). */
  amount?: number;
  /** posReferenceNumber for this refund. */
  referenceId: string;
}

/**
 * POST /cancel — full reversal of a prior payment by paymentId. ATOM auto-routes
 * by the original txn's state: COMPLETED (captured) → Return, APPROVED (auth-only)
 * → Void. Use this instead of /refund with an omitted amount, which ATOM rejects
 * (NOT_ALLOWED) on a captured sale.
 */
export interface AtomCancelParams {
  /** ATOM paymentId of the original sale. */
  paymentId: string;
  /** posReferenceNumber for this cancel. */
  referenceId: string;
}

/** Shared result shape for ATOM transactions. */
export interface AtomTxnResult {
  success: boolean;
  /**
   * true when the outcome could NOT be confirmed (network drop / abort after the
   * request was dispatched). The charge may have landed — the caller must NOT
   * treat this as success or clean decline; route to lookupPayment recovery (v2)
   * or a manual "Verifying Payment" hold.
   */
  indeterminate?: boolean;
  /**
   * true when the cardholder cancelled or let the on-device tip prompt time out
   * (HTTP 400 DEV008 / DEV009). No card was read and NO charge occurred — the
   * caller should treat this as a clean, retryable abort, not a decline.
   */
  aborted?: boolean;
  raw?: AtomPaymentResponse;
  /** JSONB payload from buildAtomTerminalResponse() for the process_payment RPC. */
  terminalResponse?: Record<string, unknown>;
  error?: string;
  errorCode?: string;
  /** ATOM paymentId — the id for lookup / refund / void / tipAdjust (v2). */
  paymentId?: string;
  rrn?: string;
}

// ============================================================
// CONSTANTS
// ============================================================

export const ATOM_API_BASE = "/api/device/v1";
export const ATOM_DEFAULT_CURRENCY = "USD";

/** Loopback host for the on-device ATOM app. */
export const ATOM_LOOPBACK_HOST = "127.0.0.1";
/**
 * Ports to probe on loopback, in order. 8443 is the observed P30 listener; the
 * extras are cheap fallbacks in case a firmware build moves it.
 */
export const ATOM_CANDIDATE_PORTS = [8443, 4443, 12345] as const;

// Per-op timeouts (ms)
export const ATOM_PING_TIMEOUT_MS = 2_000;
export const ATOM_STATUS_TIMEOUT_MS = 3_000;
/** Live sale window — ATOM foregrounds itself, reads the card, contacts the host. */
export const ATOM_SALE_TIMEOUT_MS = 120_000;
/** Hard ceiling for the interactive "Test Connection" spinner. */
export const ATOM_TEST_DEADLINE_MS = 15_000;
