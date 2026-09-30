export interface RefundApprovalData {
  rrn: string | null;
  authCode: string | null;
  referenceId: string | null;
  transactionNumber: string | null;
  resultCode: string | null;
  responseMessage: string | null;
  cardBrand: string | null;
  cardLast4: string | null;
  entryMode: string | null;
  batchNumber: string | null;
  invoiceNumber: string | null;
}
function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return null;
}

/**
 * Normalizes processor-specific refund responses without changing the raw JSON
 * retained for forensics. Castles approval data is nested under
 * `castles_transaction`; Dejavoo and Valor commonly return top-level fields.
 */
export function parseRefundApproval(
  response: Record<string, unknown> | null | undefined,
): RefundApprovalData {
  const root = asRecord(response);
  if (root.terminal_vendor === "codepay") return parseCodePayApproval(root);
  const castles = asRecord(root.castles_transaction);
  const general = asRecord(root.GeneralResponse);
  const card = asRecord(root.CardData);

  return {
    rrn: firstString(
      root.RRN,
      root.rrn,
      castles.rrn,
      root.PNReferenceId,
    ),
    authCode: firstString(
      root.AuthCode,
      root.authCode,
      root.AuthorizationCode,
      castles.approvalCode,
    ),
    referenceId: firstString(
      root.ReferenceId,
      root.referenceId,
      root.PNReferenceId,
      castles.referenceId,
    ),
    transactionNumber: firstString(
      root.TransactionNumber,
      root.transactionNumber,
      root.TranNo,
      castles.stan,
      castles.txnInvoiceNumber,
    ),
    resultCode: firstString(
      general.ResultCode,
      root.ResultCode,
      root.resultCode,
      castles.resultCode,
    ),
    responseMessage: firstString(
      general.Message,
      root.Message,
      root.message,
      root.responseMessage,
      castles.responseMessage,
      castles.resultMessage,
    ),
    cardBrand: firstString(
      root.CardType,
      root.cardType,
      card.CardType,
      card.cardType,
      castles.cardType,
    ),
    cardLast4: firstString(
      root.Last4,
      root.last4,
      root.CardLast4,
      card.Last4,
      card.last4,
      castles.last4,
    ),
    entryMode: firstString(
      root.EntryMode,
      root.entryMode,
      castles.entryMode,
    ),
    batchNumber: firstString(
      root.BatchNumber,
      root.batchNumber,
      castles.batch,
      castles.batchNumber,
    ),
    invoiceNumber: firstString(
      root.InvoiceNumber,
      root.invoiceNumber,
      castles.txnInvoiceNumber,
    ),
  };
}

/**
 * CodePay reversal result (buildCodePayTerminalResponse): snake_case flat keys
 * plus the nested `codepay_transaction`. `reference_number` is the reversal's
 * own merchant_order_no, `transaction_number` its trans_no.
 */
function parseCodePayApproval(root: Record<string, unknown>): RefundApprovalData {
  const txn = asRecord(root.codepay_transaction);
  return {
    rrn: firstString(root.rrn, txn.rrn),
    authCode: firstString(root.authorization_code, root.auth_code, txn.authCode),
    referenceId: firstString(root.reference_number, txn.merchantOrderNo),
    transactionNumber: firstString(root.transaction_number, txn.transNo),
    resultCode: firstString(root.result_code, root.response_code),
    responseMessage: firstString(root.response_message, root.response_msg),
    cardBrand: firstString(root.card_type, txn.cardType),
    cardLast4: firstString(root.card_last_four, txn.cardLast4),
    entryMode: firstString(root.entry_type, txn.entryMode),
    batchNumber: firstString(root.batch_number),
    invoiceNumber: null,
  };
}
