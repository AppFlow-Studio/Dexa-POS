// ============================================================
// Castles Response Mapper
// File: services/terminals/castles-response-mapper.ts
// ============================================================
// Maps raw Castles TCP JSON responses into the JSONB shape
// expected by process_payment_v7 (terminal_vendor: 'castles').
// ============================================================

/**
 * Raw JSON response from Castles terminal over TCP socket.
 * All values are strings per Castles protocol.
 *
 * Field names follow the CastlesPay spec. Legacy aliases (from early
 * integration) are kept as optional for backwards compatibility.
 */
export interface CastlesRawResponse {
  txnPosTxnId: string;
  txnType: string;
  txnReturnCode: string;
  txnApprovalCode: string;
  txnAmtBase: string;
  txnAmtTip: string;
  txnDateTime: string;
  txnMerchantId: string;
  txnTerminalId: string;
  txnStatusMessage: string;

  // --- Spec field names (CastlesPay v6) ---
  txnRrn?: string;
  txnAmtTrans?: string;
  txnMaskedCardNum?: string;
  txnCardBrand?: string;
  txnEntryMode?: string;
  txnBatchNo?: string;

  // --- Legacy aliases (keep for fallback) ---
  txnRRN?: string;
  txnAmtTotal?: string;
  txnCardMaskedPan?: string;
  txnCardType?: string;
  txnCardEntryMode?: string;
  txnBatchNum?: string;

  txnCardAID: string;
  txnCardAppLabel: string;
  txnCardExpiry: string;

  /** STAN (System Trace Audit Number) — needed for incremental auth / capture */
  txnStan?: string;

  /** Optional — only present on some responses */
  txnCardholderName?: string;
  txnReceiptData?: string;
}

/** Maps CastlesPay return codes to human-readable message + success boolean */
export const parseCastlesReturnCode = (code: string): { success: boolean; message: string } => {
  if (code === '00000000') return { success: true, message: 'Approved' };

  const errorMap: Record<string, string> = {
    'E0000001': 'Initialization failed',
    'E0000002': 'Invalid parameter or command format',
    'E0000003': 'Unsupported function',
    'E0000004': 'Device busy',
    'E0000005': 'Network error',
    'E0000006': 'Card read timeout',
    'E0000007': 'Host response timeout',
    'E0000008': 'User cancelled',
    'E0000009': 'Declined by terminal/card',
    'E000000A': 'Card read failure',
    'E000000B': 'Contactless collision',
    'E000000C': 'Transaction not found',
    'E000000D': 'Settlement failed',
    'E000000E': 'Duplicate transaction ID',
    'E0000011': 'Transaction already voided',
    'E0000012': 'Declined by card',
  };

  return {
    success: false,
    message: errorMap[code] ?? `Unknown error: ${code}`,
  };
};

/**
 * Extract last 4 digits from Castles masked PAN.
 * Castles format: "4748 32** **** 9818"
 */
export function extractLast4(masked: string): string {
  if (!masked) return '';
  // Remove all spaces and asterisks, take last 4 digits
  const digits = masked.replace(/[\s*]/g, '');
  return digits.slice(-4);
}

/**
 * Normalize Castles entry mode to a standard string.
 * Castles returns values like "EMVCL", "MSR", "ICC", "MANUAL", "FALLBACK".
 */
export function normalizeEntryMode(raw: string): string {
  if (!raw) return 'unknown';
  const upper = raw.toUpperCase();
  switch (upper) {
    case 'EMVCL':
    case 'CTLS':
    case 'CONTACTLESS':
      return 'contactless';
    case 'MSR':
    case 'SWIPE':
      return 'swipe';
    case 'ICC':
    case 'CHIP':
    case 'EMV':
      return 'chip';
    case 'MANUAL':
    case 'KEYED':
      return 'manual';
    case 'FALLBACK':
      return 'fallback';
    default:
      return raw.toLowerCase();
  }
}

/**
 * Map Castles card type string to a normalized card brand.
 */
function normalizeCardType(raw: string): string {
  if (!raw) return 'Unknown';
  const upper = raw.toUpperCase();
  if (upper.includes('VISA')) return 'VISA';
  if (upper.includes('MASTER')) return 'MASTERCARD';
  if (upper.includes('AMEX') || upper.includes('AMERICAN')) return 'AMEX';
  if (upper.includes('DISCOVER')) return 'DISCOVER';
  if (upper.includes('DINERS')) return 'DINERS';
  if (upper.includes('JCB')) return 'JCB';
  if (upper.includes('UNIONPAY') || upper.includes('CUP')) return 'UNIONPAY';
  return raw;
}

/**
 * Build the JSONB payload stored alongside the payment record.
 * Shape: { terminal_vendor, castles_transaction, raw_castles_response }
 *
 * This is what gets passed to process_payment_v7's terminal_response parameter.
 */
export function buildCastlesTerminalResponse(raw: CastlesRawResponse, dbTerminalId?: string): Record<string, unknown> {
  // Use spec field names with legacy fallbacks
  const maskedPan = raw.txnMaskedCardNum ?? raw.txnCardMaskedPan ?? '';
  const cardBrand = raw.txnCardBrand ?? raw.txnCardType ?? '';
  const entryMode = raw.txnEntryMode ?? raw.txnCardEntryMode ?? '';
  const rrn = raw.txnRrn ?? raw.txnRRN ?? '';
  const stan = raw.txnStan ?? '';
  const amountTotal = raw.txnAmtTrans ?? raw.txnAmtTotal ?? '';
  const batchNo = raw.txnBatchNo ?? raw.txnBatchNum ?? '';

  return {
    terminal_vendor: 'castles',
    castles_transaction: {
      transactionType: raw.txnType,
      referenceId: raw.txnPosTxnId,
      resultCode: raw.txnReturnCode,
      approvalCode: raw.txnApprovalCode,
      rrn,
      stan,
      cardLast4: extractLast4(maskedPan),
      cardType: normalizeCardType(cardBrand),
      entryMode: normalizeEntryMode(entryMode),
      cardAID: raw.txnCardAID,
      cardAppLabel: raw.txnCardAppLabel,
      amountBase: raw.txnAmtBase,
      amountTip: raw.txnAmtTip,
      amountTotal,
      batchNumber: batchNo,
      dateTime: raw.txnDateTime,
      merchantId: raw.txnMerchantId,
      terminalId: dbTerminalId ?? raw.txnTerminalId,
      hardwareTerminalId: raw.txnTerminalId,
      statusMessage: raw.txnStatusMessage,
    },
    raw_castles_response: { ...raw },
  };
}
