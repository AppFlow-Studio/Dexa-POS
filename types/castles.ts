// ============================================================
// Castles Technology Payment Terminal Types
// File: types/castles.ts
// ============================================================
// Castles terminals run a TCP socket server. The POS app connects
// as a client, sends JSON commands, and receives JSON responses.
// All JSON values are strings. Amounts are dollar strings ("100.00").
// ============================================================

export { type CastlesRawResponse } from '@/services/terminals/castles-response-mapper';

// ============================================================
// CONNECTION CONFIG
// ============================================================

export interface CastlesConnectionConfig {
  /** Terminal IP address */
  host: string;
  /** Terminal TCP port (default 8080) */
  port: number;
  /** Socket timeout in ms (default 120000) */
  timeout: number;
  /** payment_terminals.id — used for counter + DB ops */
  terminalId: string;
}

// ============================================================
// SALE REQUEST / RESULT
// ============================================================

export interface CastlesSaleRequest {
  /** 6-digit counter ("000001"-"999999") */
  txnPosTxnId: string;
  /** Transaction type — lowercase per Castles spec */
  txnType: 'sale';
  /** Base amount in dollars ("20.99") */
  txnAmtBase: string;
  /** Tip in dollars ("5.00"), "0.00" if no tip per spec §3.2 */
  txnAmtTip: string;
}

export interface CastlesSaleResult {
  success: boolean;
  raw?: import('@/services/terminals/castles-response-mapper').CastlesRawResponse;
  /** JSONB payload from buildCastlesTerminalResponse() for process_payment_v6 */
  terminalResponse?: Record<string, unknown>;
  error?: string;
}

// ============================================================
// GET DATA REQUEST / RESULT
// ============================================================

export interface CastlesGetDataRequest {
  txnPosTxnId: string;
  txnType: 'getData';
}

export interface CastlesGetDataHostInfo {
  txnAcquirerName?: string;
  txnTid?: string;
  txnMid?: string;
}

export interface CastlesGetDataResponse {
  txnPosTxnId?: string;
  txnType?: string;
  txnReturnCode?: string;
  txnDateTime?: string;
  txnHostInfo?: CastlesGetDataHostInfo[];
  infAppVersion?: string;
  infEmvVersion?: string;
  infEmvclVersion?: string;
  infAndroidVersion?: string;
  infSecureModuleVersion?: string;
  infSN?: string;
}

export interface CastlesGetDataResult {
  success: boolean;
  data?: CastlesGetDataResponse;
  error?: string;
}

// ============================================================
// TIP ADJUSTMENT REQUEST / RESULT
// ============================================================

export interface CastlesTipAdjustRequest {
  txnPosTxnId: string;
  txnType: 'tipAdjustment';
  /** New tip amount in dollars ("5.00") */
  txnAmtTip: string;
  /** Original transaction RRN */
  txnRrn: string;
}

export interface CastlesTipAdjustResult {
  success: boolean;
  raw?: import('@/services/terminals/castles-response-mapper').CastlesRawResponse;
  terminalResponse?: Record<string, unknown>;
  error?: string;
}

// ============================================================
// VOID REQUEST / RESULT
// ============================================================

export interface CastlesVoidRequest {
  txnPosTxnId: string;
  txnType: 'void';
  /** Original transaction RRN (at least one of rrn/stan required) */
  txnRrn?: string;
  /** Original transaction STAN (at least one of rrn/stan required) */
  txnStan?: string;
}

export interface CastlesVoidResult {
  success: boolean;
  raw?: import('@/services/terminals/castles-response-mapper').CastlesRawResponse;
  terminalResponse?: Record<string, unknown>;
  error?: string;
}

// ============================================================
// REFUND REQUEST / RESULT
// ============================================================

export interface CastlesRefundRequest {
  txnPosTxnId: string;
  txnType: 'refund';
  /** Total refund amount in dollars ("150.00") */
  txnAmtTrans: string;
}

export interface CastlesRefundResult {
  success: boolean;
  raw?: import('@/services/terminals/castles-response-mapper').CastlesRawResponse;
  terminalResponse?: Record<string, unknown>;
  error?: string;
}

// ============================================================
// RETURN TO IDLE (recovery command)
// ============================================================

export interface CastlesReturn2IdleRequest {
  txnPosTxnId: string;
  txnType: 'return2Idle';
}

// ============================================================
// CONSTANTS
// ============================================================

export const CASTLES_DEFAULT_PORT = 8080;
export const CASTLES_SOCKET_TIMEOUT_MS = 120_000;
export const CASTLES_GET_DATA_TIMEOUT_MS = 10_000;
export const CASTLES_RETURN2IDLE_TIMEOUT_MS = 8_000;
export const CASTLES_CONNECT_TIMEOUT_MS = 10_000;
export const CASTLES_CONNECT_RETRY_DELAY_MS = 2_000;
export const CASTLES_CONNECT_MAX_RETRIES = 3;

// ============================================================
// RETURN CODES (8-character format per Castles Appendix B)
// ============================================================

/** Success code: 8-character "00000000" per CastlesPay spec */
export const CASTLES_SUCCESS_CODE = '00000000';

/** Castles txnReturnCode → human-readable description */
export const CASTLES_RETURN_CODES: Record<string, string> = {
  '00000000': 'Approved',
  '00000001': 'Refer to card issuer',
  '00000002': 'Refer to card issuer, special condition',
  '00000003': 'Invalid merchant',
  '00000004': 'Pick-up card',
  '00000005': 'Do not honour',
  '00000006': 'Error',
  '00000007': 'Pick-up card, special condition',
  '00000012': 'Invalid transaction',
  '00000013': 'Invalid amount',
  '00000014': 'Invalid card number',
  '00000030': 'Format error',
  '00000041': 'Lost card, pick-up',
  '00000043': 'Stolen card, pick-up',
  '00000051': 'Insufficient funds',
  '00000054': 'Expired card',
  '00000055': 'Incorrect PIN',
  '00000057': 'Transaction not permitted',
  '00000058': 'Transaction not permitted to terminal',
  '00000061': 'Exceeds withdrawal amount limit',
  '00000062': 'Restricted card',
  '00000063': 'Security violation',
  '00000065': 'Exceeds withdrawal frequency limit',
  '00000075': 'PIN tries exceeded',
  '00000076': 'Unable to locate previous message',
  '00000077': 'Inconsistent data, reversal required',
  '00000078': 'No account',
  '00000080': 'Network error',
  '00000085': 'No reason to decline',
  '00000089': 'Invalid terminal ID',
  '00000091': 'Issuer or switch is unavailable',
  '00000094': 'Duplicate transaction',
  '00000096': 'System malfunction',
};
