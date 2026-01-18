// ============================================================
// DEXA POS - Dejavoo SPIN API Integration
// ============================================================
// Based on official documentation:
// - https://docs.ipospays.com/spin-specification/apidocs
// - https://app.theneo.io/dejavoo/spin/spin-rest-api-methods
// ============================================================

export type DejavooEnvironment = 'sandbox' | 'production';

/**
 * Payment method types supported by Dejavoo terminals
 * @see https://docs.ipospays.com/spin-specification/apidocs
 */
export type PaymentType =
  | 'Credit'      // Credit card transaction
  | 'Debit'       // Debit card transaction
  | 'EBT_Food'    // EBT Food Stamps
  | 'EBT_Cash'    // EBT Cash Benefits
  | 'Gift'        // Gift card
  | 'userChoice'; // Let customer choose payment method

/**
 * Transaction operation types
 * @see https://docs.ipospays.com/spin-specification
 */
export type TransactionType =
  | 'Sale'       // Standard payment transaction
  | 'Void'       // Cancel a previous transaction in current batch
  | 'Refund'     // Return funds to customer
  | 'Auth'       // Pre-authorization (hold funds)
  | 'Capture'    // Capture a previously authorized transaction
  | 'TipAdjust'  // Adjust tip on a completed transaction
  | 'Settlement' // Close the batch
  | 'Status';    // Check transaction status

/**
 * Terminal connectivity status
 */
export type TerminalStatus = 'Online' | 'Offline' | 'NotFound';

/**
 * Result codes returned by SPIN API
 * @see https://docs.ipospays.com/spin-specification/apidocs
 */
export type ResultCode =
  | '0'  // Approved
  | '1'  // Declined
  | '2'  // SPIn Proxy error or timeout
  | 'Ok'
  | 'UserCancelled'
  | 'Declined'
  | 'Error'
  | 'Timeout'
  | 'AuthenticationFailed'
  | 'InvalidRequest';

/**
 * Receipt printing options
 */
export type PrintReceiptOption =
  | 'No'        // Don't print any receipts
  | 'Merchant'  // Print merchant copy only
  | 'Customer'  // Print customer copy only
  | 'Both';     // Print both copies (default)

/**
 * Signature capture setting
 */
export type SigCaptureOption = 'Yes' | 'No';

export interface DejavooCredentials {
  tpn: string;           // Terminal Profile Number (10-12 digits)
  authKey: string;       // Authorization password (10 chars)
  registerId?: string;   // Alternative to TPN (2-50 chars)
  environment: DejavooEnvironment;
  baseUrl: string;
  timeout?: number;      // SPIn proxy timeout (1-720 seconds)
}

/**
 * SALE Transaction Request
 * Creates a new payment transaction on the terminal
 * @see https://docs.ipospays.com/spin-specification/apidocs
 */
export interface DejavooSaleRequest {
  /**
   * Authentication key (25 chars max)
   * Authorizes Host system to use SPIn Web Service
   * @required
   */
  AuthKey: string;

  /**
   * Payment method type
   * @required
   * @example "Credit" | "Debit" | "userChoice"
   */
  PaymentType: PaymentType;

  /**
   * Must be set to "Sale" for sale transactions
   * @required
   */
  TransType: 'Sale';

  /**
   * Terminal identifier / Register ID (50 chars max)
   * @required
   */
  RegisterId: string;

  /**
   * Transaction amount in $$$$$$$.CC format
   * @required
   * @example 25.99
   */
  Amount: number;

  /**
   * Alphanumeric reference field (50 chars max)
   * Must be unique within the scope of an open batch
   * Maps to order ID in your system
   * @required
   */
  ReferenceId: string;

  /**
   * Gratuity/tip amount (requires terminal enablement)
   * @optional
   */
  Tip?: number;

  /**
   * Merchant-defined custom fee amount
   * @optional
   */
  CustomFee?: number;

  /**
   * Receipt printing preference
   * @optional
   * @default "Both"
   */
  PrintReceipt?: PrintReceiptOption;

  /**
   * Enable/disable signature capture
   * @optional
   * @default "Yes"
   */
  SigCapture?: SigCaptureOption;

  /**
   * Custom merchant-defined labels for filtering/reporting (8 chars max each)
   * Used for transaction categorization and reporting
   * @required (Tags 1-3)
   */
  Tag1?: string;
  Tag2?: string;
  Tag3?: string;

  // /**
  //  * User identifier performing the transaction (100 chars max)
  //  * Used for audit trail and reporting
  //  * @required
  //  */
  // PerformedBy: string;

  /**
   * Merchant ID (12 chars max)
   * Required when Multi MID is enabled
   * @optional (required with Multi MID)
   */
  MerchantId?: string;

  /**
   * Terminal Profile Number (optional if using RegisterId)
   * @optional
   */
  Tpn?: string;

  /**
   * Custom timeout in seconds (1-720)
   * @optional
   * @default 120 seconds
   */
  OperationalTimeout?: number;

  /**
   * HSA/FSA Healthcare amounts (if applicable)
   * @optional
   */
  HSA_TotalAmount?: number;
  HSA_RxAmount?: number;
  HSA_ClinicAmount?: number;
  HSA_DentalAmount?: number;

  /**
   * Invoice number for reference
   * @optional
   */
  InvoiceNumber?: string;

  /**
   * Tax amount for informational purposes
   * @optional
   */
  TaxAmount?: number;

  /**
   * Callback URL for async notifications
   * @optional
   */
  CallbackInfo?: {
    Url: string;
    Headers?: Record<string, string>;
  };
}

/**
 * VOID Transaction Request
 * Cancels a previous transaction within the current open batch
 * @see https://docs.ipospays.com/spin-specification/apidocs
 */
export interface DejavooVoidRequest {
  /**
   * Authentication key
   * @required
   */
  AuthKey: string;

  /**
   * Payment method type (must match original transaction)
   * @required
   */
  PaymentType: PaymentType;

  /**
   * Must be set to "Void"
   * @required
   */
  TransType: 'Void';

  /**
   * Terminal identifier / Register ID
   * @required
   */
  RegisterId: string;

  /**
   * Reference ID of the original transaction to void
   * @required
   */
  RefId: string;

  /**
   * Retrieval Reference Number from original transaction
   * @optional
   */
  RRN?: string;

  /**
   * User performing the void
   * @required
   */
  PerformedBy: string;

  /**
   * Tags for categorization
   * @optional
   */
  Tag1?: string;
  Tag2?: string;
  Tag3?: string;

  /**
   * Terminal Profile Number
   * @optional
   */
  Tpn?: string;

  /**
   * Merchant ID (required with Multi MID)
   * @optional
   */
  MerchantId?: string;
}

/**
 * REFUND Transaction Request
 * Returns funds to customer (can be standalone or linked to original sale)
 * @see https://docs.ipospays.com/spin-specification/apidocs
 */
export interface DejavooRefundRequest {
  /**
   * Authentication key
   * @required
   */
  AuthKey: string;

  /**
   * Payment method type
   * @required
   */
  PaymentType: PaymentType;

  /**
   * Must be set to "Refund"
   * @required
   */
  TransType: 'Refund';

  /**
   * Terminal identifier / Register ID
   * @required
   */
  RegisterId: string;

  /**
   * Refund amount
   * @required
   */
  Amount: number;

  /**
   * New reference ID for this refund transaction
   * @required
   */
  RefId: string;

  /**
   * Reference ID of original sale (for linked refunds)
   * @optional
   */
  OriginalRefId?: string;

  /**
   * User performing the refund
   * @required
   */
  PerformedBy: string;

  /**
   * Receipt printing preference
   * @optional
   */
  PrintReceipt?: PrintReceiptOption;

  /**
   * Tags for categorization
   * @optional
   */
  Tag1?: string;
  Tag2?: string;
  Tag3?: string;

  /**
   * Terminal Profile Number
   * @optional
   */
  Tpn?: string;

  /**
   * Merchant ID (required with Multi MID)
   * @optional
   */
  MerchantId?: string;

  /**
   * Custom timeout in seconds
   * @optional
   */
  OperationalTimeout?: number;
}

/**
 * TIP ADJUST Request
 * Adjusts tip amount on a completed Credit card transaction
 * @see https://docs.ipospays.com/spin-specification/apidocs
 */
export interface DejavooTipAdjustRequest {
  /**
   * Authentication key
   * @required
   */
  AuthKey: string;

  /**
   * Must be "Credit" for tip adjustments
   * @required
   */
  PaymentType: 'Credit';

  /**
   * Must be set to "TipAdjust"
   * @required
   */
  TransType: 'TipAdjust';

  /**
   * Terminal identifier / Register ID
   * @required
   */
  RegisterId: string;

  /**
   * Original sale amount (before tip)
   * @required
   */
  Amount: number;

  /**
   * New tip amount to apply
   * @required
   */
  Tip: number;

  /**
   * Reference ID of original sale transaction
   * @required
   */
  RefId: string;

  /**
   * User performing the adjustment
   * @required
   */
  PerformedBy: string;

  /**
   * Terminal Profile Number
   * @optional
   */
  Tpn?: string;

  /**
   * Merchant ID (required with Multi MID)
   * @optional
   */
  MerchantId?: string;
}

/**
 * AUTH (Pre-Authorization) Request
 * Holds funds without capturing - used for reservations/deposits
 * @see https://docs.ipospays.com/spin-specification/apidocs
 */
export interface DejavooAuthRequest {
  /**
   * Authentication key
   * @required
   */
  AuthKey: string;

  /**
   * Payment method type
   * @required
   */
  PaymentType: PaymentType;

  /**
   * Must be set to "Auth"
   * @required
   */
  TransType: 'Auth';

  /**
   * Terminal identifier / Register ID
   * @required
   */
  RegisterId: string;

  /**
   * Amount to authorize/hold
   * @required
   */
  Amount: number;

  /**
   * Unique reference ID for this authorization
   * @required
   */
  RefId: string;

  /**
   * User performing the authorization
   * @required
   */
  PerformedBy: string;

  /**
   * Receipt printing preference
   * @optional
   */
  PrintReceipt?: PrintReceiptOption;

  /**
   * Signature capture setting
   * @optional
   */
  SigCapture?: SigCaptureOption;

  /**
   * Tags for categorization
   * @optional
   */
  Tag1?: string;
  Tag2?: string;
  Tag3?: string;

  /**
   * Terminal Profile Number
   * @optional
   */
  Tpn?: string;

  /**
   * Merchant ID (required with Multi MID)
   * @optional
   */
  MerchantId?: string;

  /**
   * Custom timeout in seconds
   * @optional
   */
  OperationalTimeout?: number;
}

/**
 * CAPTURE Request
 * Captures funds from a previously authorized transaction
 * Amount can be different from (but not exceed) original auth amount
 * @see https://docs.ipospays.com/spin-specification/apidocs
 */
export interface DejavooCaptureRequest {
  /**
   * Authentication key
   * @required
   */
  AuthKey: string;

  /**
   * Payment method type (must match original auth)
   * @required
   */
  PaymentType: PaymentType;

  /**
   * Must be set to "Capture"
   * @required
   */
  TransType: 'Capture';

  /**
   * Terminal identifier / Register ID
   * @required
   */
  RegisterId: string;

  /**
   * Amount to capture (can be less than auth amount, not more)
   * @required
   */
  Amount: number;

  /**
   * Reference ID of the original Auth transaction
   * @required
   */
  RefId: string;

  /**
   * Optional tip amount to add during capture
   * @optional
   */
  Tip?: number;

  /**
   * User performing the capture
   * @required
   */
  PerformedBy: string;

  /**
   * Tags for categorization
   * @optional
   */
  Tag1?: string;
  Tag2?: string;
  Tag3?: string;

  /**
   * Terminal Profile Number
   * @optional
   */
  Tpn?: string;

  /**
   * Merchant ID (required with Multi MID)
   * @optional
   */
  MerchantId?: string;

  /**
   * Custom timeout in seconds
   * @optional
   */
  OperationalTimeout?: number;
}

/**
 * STATUS Request
 * Check the status of a pending or completed transaction
 * @see https://docs.ipospays.com/spin-specification/apidocs
 */
export interface DejavooStatusRequest {
  /**
   * Authentication key
   * @required
   */
  AuthKey: string;

  /**
   * Terminal identifier / Register ID
   * @required (use either this or Tpn)
   */
  RegisterId?: string;

  /**
   * Terminal Profile Number
   * @optional (use either this or RegisterId)
   */
  Tpn?: string;

  /**
   * Reference ID of transaction to check
   * @optional
   */
  RefId?: string;
}

/**
 * SETTLEMENT Request
 * Closes the current batch and settles all transactions
 * @see https://docs.ipospays.com/spin-specification/apidocs
 */
export interface DejavooSettleRequest {
  /**
   * Authentication key
   * @required
   */
  AuthKey: string;

  /**
   * Must be set to "Settlement"
   * @required
   */
  TransType: 'Settlement';

  /**
   * Terminal identifier / Register ID
   * @required
   */
  RegisterId: string;

  /**
   * Optional: settle specific payment type only
   * If omitted, settles all payment types
   * @optional
   */
  PaymentType?: PaymentType;

  /**
   * Terminal Profile Number
   * @optional
   */
  Tpn?: string;

  /**
   * User performing the settlement
   * @required
   */
  PerformedBy: string;

  /**
   * Merchant ID (required with Multi MID)
   * @optional
   */
  MerchantId?: string;
}

/**
 * PRINTER Request
 * Print receipts or reports on the terminal
 * @see https://docs.ipospays.com/spin-specification/apidocs
 */
export interface DejavooPrinterRequest {
  /**
   * Authentication key
   * @required
   */
  AuthKey: string;

  /**
   * Terminal identifier / Register ID
   * @required
   */
  RegisterId: string;

  /**
   * Type of print operation
   * @required
   */
  PrintType: 'Receipt' | 'Report' | 'BatchReport' | 'DetailReport';

  /**
   * Reference ID of transaction (for receipt reprint)
   * @optional
   */
  RefId?: string;

  /**
   * Terminal Profile Number
   * @optional
   */
  Tpn?: string;

  /**
   * Custom text to print (for custom receipts)
   * @optional
   */
  CustomText?: string;
}

// ============================================================
// NEW RESPONSE STRUCTURE - Matches Actual API Response
// ============================================================

/**
 * Amounts breakdown from actual Dejavoo API response
 */
export interface DejavooAmounts {
  TotalAmount: number;
  Amount: number;
  TipAmount: number;
  FeeAmount: number;
  TaxAmount: number;
}

/**
 * General response information from actual Dejavoo API
 */
export interface DejavooGeneralResponse {
  /**
   * Result code
   * "0" = Approved
   * "1" = Declined
   * "2" = SPIn Proxy error or timeout
   */
  ResultCode: ResultCode;

  /**
   * Status code from processor
   * @example "0000" for approved
   */
  StatusCode: string;

  /**
   * Status message
   * @example "Approved", "Declined"
   */
  Message: string;

  /**
   * Detailed message from processor
   */
  DetailedMessage: string;
}

/**
 * Card data from actual Dejavoo API response
 */
export interface DejavooCardData {
  /**
   * Card type
   * @example "None", "VISA", "MASTERCARD", "AMEX", "DISCOVER"
   */
  CardType: string;

  /**
   * Card entry method
   * @example "Swipe", "Chip", "Contactless", "Manual"
   */
  EntryType: string;

  /**
   * Last 4 digits of card number
   */
  Last4: string;

  /**
   * First 4 digits of card number (BIN)
   */
  First4: string;

  /**
   * Bank Identification Number
   */
  BIN: string;

  /**
   * Card expiration date
   * @example "0125" for January 2025 (MMYY format)
   */
  ExpirationDate: string;

  /**
   * Cardholder name or payment method name
   * @example "John Doe", "DenovoPay"
   */
  Name: string;
}

/**
 * Extended transaction data nested within ExtendedDataByApplication
 * Contains detailed transaction information
 */
export interface DejavooExtendedApplicationData {
  Amount: string;
  IsPartialApprovalTxn: string;
  InvNum: string;
  Tip: string;
  Fee: string;
  Disc: string;
  BatchNum: string;
  CashBack: string;
  Name: string;
  BaseAmount: string;
  TxnCode: string;
  TraceNum: string;
  TotalAmt: string;
  TaxAmount: string;
  TxnLabel: string;
  WalletPayMethod?: string;
  WalletTxnPaymentNum?: string;
  DateTime: string;
  // Additional fields may be present depending on transaction type
  [key: string]: string | undefined;
}

/**
 * Extended data by application container
 * Indexed by application ID (typically "0")
 */
export interface DejavooExtendedDataByApplication {
  [applicationId: string]: DejavooExtendedApplicationData;
}

/**
 * Base response structure for all Dejavoo SPIN API calls
 * @see https://docs.ipospays.com/spin-specification/apidocs
 * @deprecated Use the new structured response types (DejavooSaleResponse, etc.) instead
 */
export interface DejavooBaseResponse {
  /**
   * Result code
   * "0" = Approved
   * "1" = Declined
   * "2" = SPIn Proxy error or timeout
   */
  ResultCode: ResultCode;

  /**
   * Status message
   * @example "Approved", "Declined", "SPIn Proxy Error"
   */
  Message: string;

  /**
   * Processor authorization code (for approved transactions)
   * @optional
   */
  AuthCode?: string;

  /**
   * Unique transaction reference from processor
   * Used for voids, refunds, and status checks
   */
  PNRef?: string;

  /**
   * Terminal-assigned transaction number
   */
  TransNum?: string;

  /**
   * Extended data containing additional transaction details
   * Includes: CardType, BatchNum, AccountNum, Tip, CustomFee, etc.
   * Format: key=value pairs separated by &
   */
  ExtData?: string;

  /**
   * Tokenized card information (iPOSpays only)
   * @optional
   */
  iPOSToken?: string;

  /**
   * Delay before next request (if applicable)
   * @optional
   */
  DelayBeforeNextRequest?: number;
}

/**
 * Extended data fields parsed from ExtData string
 * @see https://docs.ipospays.com/spin-specification/apidocs
 */
export interface ExtendedData {
  /**
   * Card type (VISA, MASTERCARD, AMEX, DISCOVER, etc.)
   */
  CardType?: string;

  /**
   * Current batch number
   */
  BatchNum?: string;

  /**
   * Masked account number (e.g., ************1234)
   */
  AccountNum?: string;

  /**
   * Tip amount (if applicable)
   */
  Tip?: string;

  /**
   * Custom fee amount (if applicable)
   */
  CustomFee?: string;

  /**
   * Card entry mode (Swipe, Chip, Contactless, Manual)
   */
  EntryMode?: string;

  /**
   * Cardholder name
   */
  CardHolderName?: string;

  /**
   * Card expiration date (MMYY)
   */
  ExpDate?: string;

  /**
   * Application ID (for EMV transactions)
   */
  AID?: string;

  /**
   * Transaction Identifier (for EMV)
   */
  TVR?: string;

  /**
   * Application Cryptogram (for EMV)
   */
  TSI?: string;

  /**
   * Base64-encoded signature image
   */
  Signature?: string;
}

/**
 * SALE Transaction Response - New Structure
 * Matches the actual Dejavoo API response format
 * @see https://docs.ipospays.com/spin-specification/apidocs
 */
export interface DejavooSaleResponse {
  /**
   * Amounts breakdown (total, base, tip, fee, tax)
   */
  Amounts: DejavooAmounts;

  /**
   * General response information (result code, status, message)
   */
  GeneralResponse: DejavooGeneralResponse;

  /**
   * Payment method used
   */
  PaymentType: PaymentType;

  /**
   * Transaction type (should be "Sale")
   */
  TransactionType: string;

  /**
   * Reference ID from the request
   */
  ReferenceId: string;

  /**
   * Invoice number assigned by terminal
   */
  InvoiceNumber: string;

  /**
   * Terminal serial number
   */
  SerialNumber: string;

  /**
   * Current batch number
   */
  BatchNumber: string;

  /**
   * Transaction number within batch
   */
  TransactionNumber: string;

  /**
   * Whether this transaction has been voided
   */
  Voided: boolean;

  /**
   * Retrieval Reference Number
   */
  RRN: string;

  /**
   * Extended transaction data by application
   * Contains detailed transaction info like TraceNum, BaseAmount, etc.
   */
  ExtendedDataByApplication: DejavooExtendedDataByApplication;

  /**
   * Card data (type, entry mode, last 4, etc.)
   */
  CardData: DejavooCardData;

  /**
   * EMV chip data (if applicable)
   */
  EMVData: Record<string, any>;
}

/**
 * VOID Transaction Response
 */
export interface DejavooVoidResponse extends DejavooBaseResponse {
  PaymentType: PaymentType;
  TransType: 'Void';
  RefId: string;
}

/**
 * REFUND Transaction Response
 */
export interface DejavooRefundResponse extends DejavooBaseResponse {
  PaymentType: PaymentType;
  TransType: 'Refund';
  Amount: number;
  RefId: string;
}

/**
 * AUTH Transaction Response
 */
export interface DejavooAuthResponse extends DejavooBaseResponse {
  PaymentType: PaymentType;
  TransType: 'Auth';
  Amount: number;
  RefId: string;
}

/**
 * CAPTURE Transaction Response
 */
export interface DejavooCaptureResponse extends DejavooBaseResponse {
  PaymentType: PaymentType;
  TransType: 'Capture';
  Amount: number;
  Tip?: number;
  TotalAmount?: number;
  RefId: string;
}

/**
 * TIP ADJUST Response
 */
export interface DejavooTipAdjustResponse extends DejavooBaseResponse {
  PaymentType: 'Credit';
  TransType: 'TipAdjust';
  Amount: number;
  Tip: number;
  TotalAmount: number;
  RefId: string;
}

/**
 * STATUS Response
 */
export interface DejavooStatusResponse extends DejavooBaseResponse {
  /**
   * Current transaction status
   */
  Status: 'Approved' | 'Declined' | 'Pending' | 'NotFound' | 'Error';

  /**
   * Reference ID of the checked transaction
   */
  RefId?: string;
}

/**
 * SETTLEMENT Response
 */
export interface DejavooSettlementResponse extends DejavooBaseResponse {
  TransType: 'Settlement';

  /**
   * Number of transactions in batch
   */
  TransactionCount?: number;

  /**
   * Total batch amount
   */
  BatchTotal?: number;

  /**
   * Batch number that was settled
   */
  BatchNum?: string;
}

/**
 * Terminal Status Response
 */
export interface DejavooTerminalStatusResponse {
  /**
   * Terminal online/offline status
   */
  TerminalStatus: TerminalStatus;

  /**
   * Terminal Profile Number
   */
  Tpn?: string;

  /**
   * Register ID
   */
  RegisterId?: string;

  /**
   * Error description if terminal is offline
   */
  ErrorDescription?: string;
}

// ============================================================
// UNION TYPES FOR REQUEST/RESPONSE HANDLING
// ============================================================

/**
 * Union of all possible transaction request types
 * Use for type-safe request handling
 */
export type DejavooTransactionRequest =
  | DejavooSaleRequest
  | DejavooVoidRequest
  | DejavooRefundRequest
  | DejavooAuthRequest
  | DejavooCaptureRequest
  | DejavooTipAdjustRequest
  | DejavooSettleRequest
  | DejavooStatusRequest
  | DejavooPrinterRequest;

/**
 * Union of all possible transaction response types
 * Use for type-safe response handling
 */
export type DejavooTransactionResponse =
  | DejavooSaleResponse
  | DejavooVoidResponse
  | DejavooRefundResponse
  | DejavooAuthResponse
  | DejavooCaptureResponse
  | DejavooTipAdjustResponse
  | DejavooStatusResponse
  | DejavooSettlementResponse;

// ============================================================
// ERROR CODES AND CONSTANTS
// ============================================================

/**
 * Error codes returned by SPIN API
 * @see https://docs.ipospays.com/spin-specification/apidocs
 */
export const DEJAVOO_ERROR_CODES: Record<number, string> = {
  1001: 'Printer Error - Terminal is out of paper',
  1002: 'Card Reader Error',
  1003: 'User Timeout - No card presented',
  1004: 'Communication Error',
  1005: 'Low Battery',
  1006: 'Internal Error',
  1007: 'Format Error',
  1008: 'Wrong Payment Or Transaction Type',
  1009: 'Authentication Failed - Check AuthKey and pull parameters',
  1010: 'Missing Reference ID',
  1011: 'Duplicate Reference ID - Already exists in batch',
  1012: 'Cancelled - User cancelled or unknown reason',
  1013: 'Bad Request',
} as const;

/**
 * API Endpoints for different environments
 */
export const DEJAVOO_ENDPOINTS = {
  production: {
    rest: 'https://spinpos.net:443/spin/cgi.html',
    soap: 'https://spinpos.net:443/spin/SPInTxn.asmx',
  },
  sandbox: {
    rest: 'https://test.spinpos.net:443/spin/cgi.html',
    soap: 'https://test.spinpos.net:443/spin/SPInTxn.asmx',
  },
} as const;

/**
 * Default timeout values (in seconds)
 */
export const DEJAVOO_TIMEOUTS = {
  default: 120,
  min: 1,
  max: 720,
} as const;

// ============================================================
// TYPE GUARDS AND HELPERS
// ============================================================

/**
 * Type guard to check if a response is successful
 * Works with both old (DejavooBaseResponse) and new (DejavooSaleResponse) formats
 */
export function isApprovedResponse(
  response: DejavooBaseResponse | DejavooSaleResponse
): boolean {
  // New format: Check GeneralResponse.ResultCode
  if ('GeneralResponse' in response) {
    return response.GeneralResponse?.ResultCode === '0';
  }
  // Old format: Check flat ResultCode
  return response.ResultCode === '0' || response.ResultCode === 'Ok';
}

/**
 * Type guard to check if a response is declined
 * Works with both old (DejavooBaseResponse) and new (DejavooSaleResponse) formats
 */
export function isDeclinedResponse(
  response: DejavooBaseResponse | DejavooSaleResponse
): boolean {
  // New format: Check GeneralResponse.ResultCode
  if ('GeneralResponse' in response) {
    return response.GeneralResponse?.ResultCode === '1';
  }
  // Old format: Check flat ResultCode
  return response.ResultCode === '1' || response.ResultCode === 'Declined';
}

/**
 * Type guard to check if a response is an error
 * Works with both old (DejavooBaseResponse) and new (DejavooSaleResponse) formats
 */
export function isErrorResponse(
  response: DejavooBaseResponse | DejavooSaleResponse
): boolean {
  // New format: Check GeneralResponse.ResultCode
  if ('GeneralResponse' in response) {
    return response.GeneralResponse?.ResultCode === '2';
  }
  // Old format: Check flat ResultCode
  return (
    response.ResultCode === '2' ||
    response.ResultCode === 'Error' ||
    response.ResultCode === 'Timeout'
  );
}

/**
 * Parse ExtData string into structured object
 * @param extData - The ExtData string from API response
 * @returns Parsed ExtendedData object
 */
export function parseExtData(extData: string): Partial<ExtendedData> {
  const result: Partial<ExtendedData> = {};

  if (!extData) return result;

  const pairs = extData.split('&');
  for (const pair of pairs) {
    const [key, value] = pair.split('=');
    if (key && value) {
      // Map common keys to ExtendedData fields
      switch (key) {
        case 'CardType':
          result.CardType = value;
          break;
        case 'BatchNum':
          result.BatchNum = value;
          break;
        case 'AccountNum':
          result.AccountNum = value;
          break;
        case 'Tip':
          result.Tip = value;
          break;
        case 'CustomFee':
          result.CustomFee = value;
          break;
        case 'EntryMode':
          result.EntryMode = value;
          break;
        case 'CardHolderName':
          result.CardHolderName = value;
          break;
        case 'ExpDate':
          result.ExpDate = value;
          break;
        case 'Signature':
          result.Signature = value;
          break;
      }
    }
  }

  return result;
}

/**
 * Generate a unique RefId for transactions
 * Format: PREFIX_TIMESTAMP_RANDOM or PREFIX_SPLIT{n}_TIMESTAMP_RANDOM
 * @param prefix - Optional prefix (e.g., 'SALE', 'VOID')
 * @param splitIndex - Optional split index for split payments (e.g., 1, 2, 3)
 * @returns Unique reference ID (max 50 chars)
 * @example
 * generateRefId('SALE')          → 'SALE_1737168000123_4567'
 * generateRefId('SALE', 1)       → 'SALE_SPLIT1_1737168000123_4567'
 * generateRefId('SALE', 2)       → 'SALE_SPLIT2_1737168000456_8901'
 */
export function generateRefId(prefix: string = 'TXN', splitIndex?: number): string {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, '0');

  if (splitIndex !== undefined) {
    return `${prefix}_SPLIT${splitIndex}_${timestamp}_${random}`.substring(0, 50);
  }

  return `${prefix}_${timestamp}_${random}`.substring(0, 50); // Max 50 chars
}

// ============================================================
// TYPE HELPERS FOR REQUEST BUILDING
// ============================================================

/**
 * Base fields required for all transaction requests
 */
export type BaseTransactionFields = {
  AuthKey: string;
  RegisterId: string;
  PerformedBy: string;
  Tag1?: string;
  Tag2?: string;
  Tag3?: string;
  Tpn?: string;
  MerchantId?: string;
};

/**
 * Helper to create a SALE request with type safety and defaults
 */
export function createSaleRequest(
  base: BaseTransactionFields,
  details: {
    PaymentType: PaymentType;
    Amount: number;
    RefId: string;
    Tip?: number;
    CustomFee?: number;
    PrintReceipt?: PrintReceiptOption;
    SigCapture?: SigCaptureOption;
    OperationalTimeout?: number;
  }
): DejavooSaleRequest {
  return {
    ...base,
    ...details,
    TransType: 'Sale',
  };
}

/**
 * Helper to create a VOID request
 */
export function createVoidRequest(
  base: BaseTransactionFields,
  details: {
    PaymentType: PaymentType;
    RefId: string;
    RRN?: string;
  }
): DejavooVoidRequest {
  return {
    ...base,
    ...details,
    TransType: 'Void',
  };
}

/**
 * Helper to create a REFUND request
 */
export function createRefundRequest(
  base: BaseTransactionFields,
  details: {
    PaymentType: PaymentType;
    Amount: number;
    RefId: string;
    OriginalRefId?: string;
    PrintReceipt?: PrintReceiptOption;
    OperationalTimeout?: number;
  }
): DejavooRefundRequest {
  return {
    ...base,
    ...details,
    TransType: 'Refund',
  };
}


