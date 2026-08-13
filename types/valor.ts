// ============================================================
// Valor PayTech Payment Terminal Types
// File: types/valor.ts
// ============================================================
// Valor terminals run a TCP socket server (like Castles); the POS
// connects as a client. Per Valor POS Integration Spec v1.1.6:
//   - Every request is framed  <STX>(0x02) + JSON + <ETX>(0x03).
//   - Amounts are integer CENTS as strings ("1500" == $15.00).
//   - Each command returns a stateful handshake:
//       ACK -> "Payload Request Received"(STAN_NO) -> final -> ACK.
//   - Transactions run on port 5000; cancel-before-card on port 5001.
//   - TRAN_MODE 90 (+ STAN_NO) re-queries an in-flight txn (recovery).
//   - TRAN_MODE 96 (TERMINAL_QUERY) is the lightweight health/test ping.
//
// Scope of this file: sale, preauth (hold) + completion (capture), void, refund,
// tip-adjust, settlement, cancel, terminal-query, transaction-status (recovery).
// Tokenize / presale are deferred.
// ============================================================

import type { ValorTransportType } from "@/services/terminals/valor-transport.types";

// ============================================================
// CONNECTION CONFIG
// ============================================================

export interface ValorConnectionConfig {
  /** Transport type — defaults to 'local_socket' (TCP WiFi). */
  connectionType?: ValorTransportType;
  /** Terminal IP address (required for local_socket, ignored for USB). */
  host?: string;
  /** Transaction TCP port (default 5000). */
  port?: number;
  /** Cancel TCP port (default 5001) — cancel-before-card second socket. */
  cancelPort?: number;
  /** Valor EPI (merchant/device identifier). */
  epi?: string;
  /** Final-response read timeout in ms (live sale window). */
  timeout: number;
  /** payment_terminals.id — used for counter + DB ops. */
  terminalId: string;
  /**
   * Background auto-connect after a plug/power-cycle (USB attach or cold boot)
   * where the terminal may still be rebooting. When true the connect path stays
   * boot-tolerant and treats empty buffers as retryable rather than wedged.
   */
  coldConnect?: boolean;
}

// ============================================================
// REQUEST TAG ENUMS (values are the on-wire strings)
// ============================================================

/** TRAN_MODE — top-level transaction mode. */
export const VALOR_TRAN_MODE = {
  CREDIT: "1",
  DEBIT: "2",
  EBT_FOOD: "3",
  EBT_CASH: "4",
  GIFT: "5",
  CASH: "6",
  /** FETCH transaction — used for Void / Tip Adjust / Ticket / Settlement / Reprint / Reports. */
  FETCH: "0",
  VAULT: "9",
  FLEET: "8",
  CANCEL: "99",
  CUSTOMIZE_PROMPT: "98",
  CUSTOMIZE_RECEIPT: "97",
  TERMINAL_QUERY: "96",
  STATIC_IP: "95",
  UPLOAD_OFFLINE: "94",
  FETCH_UPLOAD_OFFLINE: "93",
  FETCH_OFFLINE: "92",
  USB_STATUS_CHECK: "91",
  TRANSACTION_STATUS: "90",
} as const;
export type ValorTranMode = (typeof VALOR_TRAN_MODE)[keyof typeof VALOR_TRAN_MODE];

/** TRAN_CODE — transaction operation. */
export const VALOR_TRAN_CODE = {
  SALE: "1",
  VOID: "2",
  PREAUTH: "3",
  TICKET: "4", // completion
  REFUND: "5",
  SETTLEMENT: "9",
  REPRINT: "11",
  REPORTS: "12",
  PRESALE: "19",
  TIP_ADJUSTMENT: "20",
  BALANCE_INQUIRY: "38",
  GIFT_ACTIVATION: "49",
  GIFT_DEACTIVATION: "50",
  GIFT_ADDVALUE: "51",
  POST_AUTH: "64",
  GENERATE_TOKEN: "65",
} as const;
export type ValorTranCode = (typeof VALOR_TRAN_CODE)[keyof typeof VALOR_TRAN_CODE];

/** PAPER_RECEIPT request tag values. */
export const VALOR_PAPER_RECEIPT = {
  /** 0 or 3 — outcome follows VALOR TMS config. */
  TMS_CONFIG: "0",
  ELECTRONIC_ONLY: "1",
  PAPER_ONLY: "2",
} as const;

/** Boolean-ish request flag values (1 = enable, 0 = disable). */
export const VALOR_FLAG = { ON: "1", OFF: "0" } as const;

/** A framed request body — flat JSON of string values (+ optional nested arrays). */
export type ValorRequestBody = Record<string, unknown>;

// ============================================================
// RAW RESPONSE (de-framed JSON object from the terminal)
// ============================================================

export interface ValorRawResponse {
  /** "0" success, "-1" failed, "-2" cleared/in-progress (indeterminate). */
  STATE?: string;
  /** "ACK" | "Payload Request Received" | ... on handshake frames. */
  MSG?: string;
  EPI?: string;
  SERIAL_NO?: string;
  /** System Trace Audit Number — recovery key for TRAN_MODE 90. */
  STAN_NO?: string;
  STAN_ID?: string;
  /** Switch-assigned unique transaction id. */
  TXN_ID?: string;
  /** The "Trans" number on the charge slip — reversal reference for VOID/TIP_ADJUST. */
  TRAN_NO?: string;
  TRAN_TYPE?: string;
  TRAN_METHOD?: string;
  AMOUNT?: string;
  TIP_AMOUNT?: string;
  TOTAL_AMOUNT?: string;
  SURCHARGE_AMOUNT?: string;
  /** "1" when the card approved less than requested (partial approval). */
  PARTIAL?: string;
  MASKED_PAN?: string;
  ENTRY_MODE?: string;
  EXPIRY_DATE?: string;
  RRN?: string;
  CARDHOLDER_NAME?: string;
  /** 6-digit authorization code. */
  CODE?: string;
  AUTH_RSP_TEXT?: string;
  DATE?: string;
  BATCH_NO?: string;
  AID?: string;
  TVR?: string;
  TSI?: string;
  ISSUER?: string;
  CARD_BRAND?: string;
  CARD_TYPE?: string;
  /** Echoes REQ_TXN_ID (cloud). */
  MER_TXN_ID?: string;
  REQ_TXN_ID?: string;
  TOKEN?: string;
  TOKEN_ID?: string;
  VAULT_ID?: string;
  /** Valor unique error code (5–8 digits). */
  ERROR_CODE?: string;
  ERROR_MSG?: string;
  APP_VERSION?: string;
  DATETIME?: string;
  [key: string]: unknown;
}

// ============================================================
// COMMAND PARAMS / RESULTS
// ============================================================

/** Shared result shape for Valor transactions. */
export interface ValorTxnResult {
  success: boolean;
  raw?: ValorRawResponse;
  /** JSONB payload from buildValorTerminalResponse() for process_payment_v17. */
  terminalResponse?: Record<string, unknown>;
  error?: string;
  /** Valor ERROR_CODE when the transaction failed. */
  errorCode?: string;
  /** Captured at S2 (Payload-Received) — recovery key for TRAN_MODE 90. */
  stan?: string;
  /** The charge-slip "Trans" number — reversal reference for VOID / TIP_ADJUST. */
  tranNo?: string;
  rrn?: string;
  /**
   * true when the outcome is INDETERMINATE (final STATE "-2", or the socket
   * died after STAN capture) — the caller must NOT treat this as success or a
   * clean decline; it routes to TRAN_MODE 90 recovery.
   */
  indeterminate?: boolean;
}

export interface ValorSaleParams {
  /** Base amount in cents. */
  amount: number;
  /** Tip in cents (optional). */
  tipAmount?: number;
  /** Client transaction id (REQ_TXN_ID) — the idempotency handle. */
  referenceId: string;
  /** Prompt for an on-terminal tip (default off). */
  tipEntry?: boolean;
  /** Prompt for a signature (default off). */
  signature?: boolean;
  /**
   * Send the final response BEFORE the receipt prints (EARLY_RESPONSE=1).
   * Default true so the POS is not blocked on printing.
   */
  earlyResponse?: boolean;
  /**
   * Invoked with the STAN captured at S2 ("Payload Request Received"), BEFORE
   * the card is presented. Persist it (e.g. to the payment journal) so an
   * immediate crash can still recover via TRAN_MODE 90.
   */
  onStan?: (stan: string) => void;
}

export interface ValorSaleResult extends ValorTxnResult {
  /** PARTIAL="1" — card approved less than requested; collect the remainder. */
  partial?: boolean;
  /** Approved amount in cents when `partial` is true. */
  approvedAmount?: number;
}

/**
 * Pre-authorization / hold (CREDIT PREAUTH — TRAN_MODE 1 / TRAN_CODE 3). Card-present,
 * so it mirrors sale params (STAN capture + TRAN_MODE 90 recovery). The response's
 * TRAN_NO is the reference the later completion (TICKET) / release (VOID) needs.
 */
export interface ValorPreAuthParams {
  /** Hold amount in cents. */
  amount: number;
  /** Client transaction id (REQ_TXN_ID) — the idempotency handle. */
  referenceId: string;
  /** Prompt for a signature (default off). */
  signature?: boolean;
  /**
   * Send the final response BEFORE the receipt prints (EARLY_RESPONSE=1).
   * Default true so the POS is not blocked on printing.
   */
  earlyResponse?: boolean;
  /**
   * Invoked with the STAN captured at S2 ("Payload Request Received"), BEFORE the
   * card is presented. Persist it so an immediate crash can recover via TRAN_MODE 90.
   */
  onStan?: (stan: string) => void;
}

export interface ValorPreAuthResult extends ValorTxnResult {
  /** PARTIAL="1" — card authorized less than requested; collect the remainder. */
  partial?: boolean;
  /** Authorized amount in cents when `partial` is true. */
  approvedAmount?: number;
}

/**
 * Completion / capture of a prior pre-auth (TICKET — TRAN_MODE 0 / TRAN_CODE 4).
 * References the pre-auth by exactly ONE of tranNo / cardNo (like VOID / TIP_ADJUST).
 * The wire AMOUNT is the final capture (tip folded in) — the completion captures
 * whatever amount is sent, so an over-the-hold final total is captured here.
 */
export interface ValorAuthCompleteParams {
  /** Base capture amount in cents. */
  captureAmount: number;
  /** Tip in cents (optional) — folded into the wire AMOUNT. */
  tipAmount?: number;
  /** The pre-auth's charge-slip "Trans" number. */
  tranNo?: string;
  /** Last-4 of the original card (CARD_NO) — fallback reference. */
  cardNo?: string;
  referenceId: string;
}

export interface ValorAuthCompleteResult extends ValorTxnResult {
  /** PARTIAL="1" — completion captured less than requested (e.g. expired hold). */
  partial?: boolean;
  /** Captured amount in cents when `partial` is true. */
  approvedAmount?: number;
}

export interface ValorRefundParams {
  /** Refund amount in cents. */
  amount: number;
  referenceId: string;
}

/** VOID references a prior txn by exactly ONE of tranNo / cardNo (NOT RRN/STAN). */
export interface ValorVoidParams {
  /** The "Trans" number printed on the original charge slip. */
  tranNo?: string;
  /** Last-4 of the original card (CARD_NO). */
  cardNo?: string;
  referenceId: string;
  /** Prompt an on-terminal void confirmation (default off). */
  voidConfirmation?: boolean;
}

/** TIP_ADJUST references a prior txn by exactly ONE of tranNo / cardNo. */
export interface ValorTipAdjustParams {
  /** New tip amount in cents. */
  tipAmount: number;
  tranNo?: string;
  cardNo?: string;
  referenceId: string;
}

export interface ValorTerminalQueryResult {
  success: boolean;
  data?: {
    serialNumber?: string;
    epi?: string;
    appVersion?: string;
    dateTime?: string;
  };
  raw?: ValorRawResponse;
  error?: string;
}

/** Outcome of a TRAN_MODE 90 status re-query (in-flight recovery). */
export type ValorRecoveryOutcome = "approved" | "declined" | "unknown";

export interface ValorRecoveryResult {
  outcome: ValorRecoveryOutcome;
  raw?: ValorRawResponse;
  terminalResponse?: Record<string, unknown>;
}

/** Batch-out / settlement (TRAN_MODE 0 FETCH + TRAN_CODE 9 SETTLEMENT). */
export interface ValorSettlementParams {
  /** Client transaction id (REQ_TXN_ID) for this settlement request. */
  referenceId: string;
}

/**
 * Settlement outcome is 3-state — the caller marks the batch's payments settled
 * ONLY on `outcome === "settled"`. Settlement has no STAN, so a lost final frame
 * after dispatch is `indeterminate` (route to manual reconcile), never a clean
 * decline. Summary totals are best-effort metadata, never authoritative.
 */
export interface ValorSettlementResult {
  outcome: "settled" | "declined" | "indeterminate";
  /** BATCH_NO — the terminal's closed batch number (arrives as a JSON number; stringified). */
  batchNo?: string;
  /** TOTAL_TRAN_COUNT — count of transactions the terminal closed; cross-check vs the DB snapshot. */
  totalTranCount?: number;
  /** AMOUNT — terminal-reported total settled amount in CENTS. Metadata only, never authoritative. */
  settledAmount?: number;
  /**
   * EPI / SERIAL_NO — the settlement response DOES carry terminal identity (unlike the 96 health
   * ping, which only ACKs over USB). Cross-check against payment_terminals before marking settled.
   */
  epi?: string;
  serialNo?: string;
  /** Untouched terminal response — passed verbatim to finalize_valor_settlement. */
  raw?: ValorRawResponse;
  terminalResponse?: Record<string, unknown>;
  error?: string;
  errorCode?: string;
}

export interface ValorCancelResult {
  /** true only when the terminal confirmed the txn was cleared before card entry. */
  cleared: boolean;
  /**
   * USB only: the CANCEL command was dispatched on the shared serial line but the
   * outcome is NOT observed here — it surfaces on the in-flight sale's final frame
   * (or TRAN_MODE 90). `cleared` stays false in that case; `sent` reports dispatch.
   */
  sent?: boolean;
  raw?: ValorRawResponse;
  error?: string;
}

// ============================================================
// CONSTANTS
// ============================================================

export const VALOR_DEFAULT_PORT = 5000;
export const VALOR_CANCEL_PORT = 5001;

/** Frame delimiters — every request/response body is wrapped in these. */
export const VALOR_STX = "\x02";
export const VALOR_ETX = "\x03";

export const VALOR_SUCCESS_STATE = "0";
export const VALOR_FAILED_STATE = "-1";
/** Cleared / in-progress — INDETERMINATE; route to TRAN_MODE 90 recovery. */
export const VALOR_CLEARED_STATE = "-2";

// Per-step + per-op timeouts (ms)
export const VALOR_CONNECT_TIMEOUT_MS = 10_000;
export const VALOR_ACK_TIMEOUT_MS = 5_000;
export const VALOR_PAYLOAD_RECEIVED_TIMEOUT_MS = 10_000;
/** Live TCP sale/refund window (Valor Connect cloud would use 180_000). */
export const VALOR_SALE_TIMEOUT_MS = 120_000;
export const VALOR_TERMINAL_QUERY_TIMEOUT_MS = 10_000;
export const VALOR_CANCEL_TIMEOUT_MS = 10_000;
export const VALOR_STATUS_TIMEOUT_MS = 15_000;
/** Batch settlement contacts the acquirer host and can take minutes. */
export const VALOR_SETTLEMENT_TIMEOUT_MS = 180_000;
/**
 * Mutex-acquire wait for settlement — must exceed a full in-flight sale window
 * (VALOR_SALE_TIMEOUT_MS) + the settle window so a settle queued behind a live
 * sale doesn't throw a pre-dispatch mutex timeout mid-batch. Settlement is
 * end-of-day, so a long queue wait here is acceptable.
 */
export const VALOR_SETTLEMENT_MUTEX_ACQUIRE_TIMEOUT_MS = 300_000;
/** Hard ceiling for the interactive "Test Connection" spinner. */
export const VALOR_TEST_DEADLINE_MS = 30_000;
export const VALOR_TEST_OP_NAME = "_probe_valor_test";

/**
 * USB serial baud rate — model-dependent, selected per device in
 * valor-transport-usb.ts by vendor id.
 *
 * VP550 (Qualcomm CDC ACM, 0x1E0E): a virtual serial endpoint where the baud is
 * ignored and bytes move regardless. 9600 (from Valor's semi-integration guide)
 * is the known-good value; we keep it so this path is untouched.
 *
 * VP350 (Prolific PL2303, 0x067B): a REAL UART bridge where the host baud must
 * physically match the terminal's serial rate, or nothing decodes in either
 * direction. 115200 is the common terminal rate (Castles' Saturn1000 PL-serial
 * runs 115200 too). If the VP350 still yields no data at 115200, retry
 * 57600 / 38400 / 19200 / 9600.
 */
export const VALOR_USB_BAUD_RATE_CDC = 9600;
export const VALOR_USB_BAUD_RATE_PROLIFIC = 115200;
