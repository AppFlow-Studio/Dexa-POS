// ============================================================
// DEXA POS - Dejavoo SPIN API Integration
// ============================================================

// Types for Dejavoo SPIN API
// File: types/dejavoo.types.ts

export type DejavooEnvironment = 'sandbox' | 'production';

export type PaymentType = 'Credit' | 'Debit' | 'EBT_Food' | 'EBT_Cash' | 'Card' | 'Cash' | 'Check' | 'Gift';
export type TransactionType = 'Sale' | 'Void' | 'Refund' | 'Auth' | 'Capture' | 'TipAdjust';

export type TerminalStatus = 'Online' | 'Offline' | 'NotFound';

export type ResultCode = 
  | 'Ok' 
  | 'UserCancelled' 
  | 'Declined' 
  | 'Error' 
  | 'Timeout'
  | 'AuthenticationFailed'
  | 'InvalidRequest';

export interface DejavooCredentials {
  tpn: string;           // Terminal Profile Number (10-12 digits)
  authKey: string;       // Authorization password (10 chars)
  registerId?: string;   // Alternative to TPN (2-50 chars)
  environment: DejavooEnvironment;
  baseUrl: string;
  timeout?: number;      // SPIn proxy timeout (1-720 seconds)
}

export interface DejavooSaleRequest {
  PaymentType: PaymentType;
  TransactionType: 'Sale';
  Amount: number;
  TipAmount?: number;
  TaxAmount?: number;
  ReferenceId: string;    // Unique per batch, maps to order ID
  InvoiceNumber?: string;
  MerchantNumber?: number;
  IsReadyForIS?: boolean; // Ready for intermediate status
  Tpn: string;
  Authkey: string;
  SPInProxyTimeout?: number;
  CustomFields?: Record<string, string | number>;
  CallbackInfo?: {
    Url: string;
    Headers?: Record<string, string>;
  };
}

export interface DejavooVoidRequest {
  PaymentType: PaymentType;
  TransactionType: 'Void';
  ReferenceId: string;     // Original transaction reference
  Tpn: string;
  Authkey: string;
}

export interface DejavooRefundRequest {
  PaymentType: PaymentType;
  TransactionType: 'Refund';
  Amount: number;
  ReferenceId: string;
  OriginalReferenceId?: string;  // For linked refunds
  Tpn: string;
  Authkey: string;
}

export interface DejavooTipAdjustRequest {
  PaymentType: 'Credit';
  TransactionType: 'TipAdjust';
  Amount: number;          // Original sale amount
  TipAmount: number;       // New tip amount
  ReferenceId: string;     // Original transaction reference
  Tpn: string;
  Authkey: string;
}

export interface DejavooAuthRequest {
  PaymentType: PaymentType;
  TransactionType: 'Auth';
  Amount: number;
  ReferenceId: string;
  Tpn: string;
  Authkey: string;
}

export interface DejavooCaptureRequest {
  PaymentType: PaymentType;
  TransactionType: 'Capture';
  Amount: number;          // Can be different from auth amount
  ReferenceId: string;     // Original auth reference
  TipAmount?: number;
  Tpn: string;
  Authkey: string;
}

export interface DejavooStatusRequest {
  Tpn?: string;
  RegisterId?: string;
  Authkey: string;
}

export interface DejavooSettleRequest {
  PaymentType?: PaymentType;  // Optional: settle specific payment type
  Tpn: string;
  Authkey: string;
}

export interface DejavooResponse {
  GeneralResponse: {
    ResultCode: ResultCode;
    StatusCode: string;      // "Approved: 0000" or error code
    Message: string;
    DetailedMessage: string;
    DelayBeforeNextRequest?: number;
  };
}

export interface DejavooSaleResponse extends DejavooResponse {
  PaymentType: PaymentType;
  TransactionType: string;
  Amount: number;
  TipAmount: number;
  TotalAmount: number;
  ApprovedAmount: number;
  AuthCode: string;
  ReferenceId: string;
  TransactionId: string;      // Terminal's transaction ID
  CardNumber: string;         // Masked: ************1234
  CardType: string;           // VISA, MASTERCARD, AMEX, etc.
  CardHolderName: string;
  EntryMode: string;          // Swipe, Chip, Contactless, Manual
  BatchNumber: string;
  TransactionNumber: string;
  Token?: string;             // For tokenization if enabled
  Signature?: string;         // Base64 encoded signature
  ReceiptData?: {
    MerchantCopy: string;
    CustomerCopy: string;
  };
}

export interface DejavooTerminalStatusResponse {
  TerminalStatus: TerminalStatus;
  Tpn: string;
  ErrorDescription?: string;
}

// Error codes from SPIN API
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
};


