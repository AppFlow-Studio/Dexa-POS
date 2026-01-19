// ============================================================
// Dejavoo SPIN API - Fluent Builder Pattern
// ============================================================
// Modern, type-safe fluent API for Dejavoo SPIN payment processing
// Replaces /services/payments/dejavoo.ts with cleaner interface
// ============================================================

import { SupabaseClient } from '@supabase/supabase-js';
import {
  DejavooCredentials,
  DejavooSaleRequest,
  DejavooSaleResponse,
  DejavooBaseResponse,
  DejavooEnvironment,
  PaymentType,
  PrintReceiptOption,
  SigCaptureOption,
  parseExtData,
  ExtendedData,
  isApprovedResponse,
  isDeclinedResponse,
  isErrorResponse,
  generateRefId,
  DEJAVOO_ERROR_CODES,
  DEJAVOO_TIMEOUTS,
} from '@/types/dejavoo-spin-api';
import { toastService } from '@/lib/toastService';

// ============================================================
// RESPONSE TYPES
// ============================================================

/**
 * Enhanced response type with parsed data and type guards
 * Provides structured access to transaction results
 */
export interface DejavooAPIResponse<T extends DejavooBaseResponse> {
  /** Whether the transaction was successful */
  success: boolean;
  /** Response data (only present on success) */
  data?: T;
  /** Parsed extended data (card type, account number, etc.) */
  parsedExtData?: Partial<ExtendedData>;
  /** Error message (only present on failure) */
  error?: string;
  /** Numeric error code for lookup in DEJAVOO_ERROR_CODES */
  errorCode?: number;
  /** Raw response for debugging */
  rawResponse?: T;
  /** Helper methods for easy access to important transaction data */
  helpers?: {
    // Transaction identifiers
    getTransactionType(): string | undefined;
    getTransactionDate(): string | undefined;
    getTransactionTime(): string | undefined;
    getTransactionAmount(): number | undefined;
    getTransactionTip(): number | undefined;
    getTransactionFee(): number | undefined;
    getTransactionTax(): number | undefined;
    getTransactionTotal(): number | undefined;
    getTransactionStatus(): string | undefined;
    getReferenceId(): string | undefined;
    getTransactionNumber(): string | undefined;
    getInvoiceNumber(): string | undefined;
    getBatchNumber(): string | undefined;
    getAuthCode(): string | undefined;

    // Amounts
    getTotalAmount(): number | undefined;
    getBaseAmount(): number | undefined;
    getTipAmount(): number | undefined;

    // Card info
    getCardType(): string | undefined;
    getCardLast4(): string | undefined;
    getEntryMode(): string | undefined;
    getCardholderName(): string | undefined;

    // Status
    isApproved(): boolean;
    getResultCode(): string | undefined;
    getStatusCode(): string | undefined;
    getMessage(): string | undefined;
    getRRN(): string | undefined;
  };
}

// ============================================================
// MAIN API CLASS
// ============================================================

/**
 * Main Dejavoo SPIN API Class
 *
 * Provides fluent interface for payment terminal operations with:
 * - Database credential loading and caching
 * - Terminal status monitoring
 * - Transaction builders for intuitive request construction
 * - Automatic error handling and user notifications
 *
 * @example
 * ```typescript
 * const api = new DejavooSpinAPI(supabase);
 * await api.loadTerminal(terminalId);
 *
 * const result = await api
 *   .sale()
 *   .amount(25.99)
 *   .tip(5.00)
 *   .performedBy('alice@restaurant.com')
 *   .withTags('DineIn', 'Table5')
 *   .execute();
 * ```
 */
export class DejavooSpinAPI {
  private supabase: SupabaseClient;
  private credentials: DejavooCredentials | null = null;
  private terminalId: string | null = null;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  // ============================================================
  // CREDENTIAL MANAGEMENT
  // ============================================================

  /**
   * Load terminal credentials from local store or database
   *
   * If paymentTerminal object is provided with credentials, uses those directly (fast path).
   * Otherwise, fetches credentials from database via RPC (slow path).
   * Credentials are cached in memory until a different terminal is loaded.
   *
   * @param terminalId - UUID of the payment terminal
   * @param paymentTerminal - Optional payment terminal object with local credentials
   * @returns Promise<boolean> - true if credentials loaded successfully
   *
   * @example
   * ```typescript
   * // Fast path: Use local credentials from selectedStation
   * const loaded = await api.loadTerminal(
   *   selectedStation.payment_terminal.id,
   *   selectedStation.payment_terminal
   * );
   *
   * // Slow path: Fetch from database
   * const loaded = await api.loadTerminal(terminalId);
   * ```
   */
  async loadTerminal(
    terminalId: string,
    paymentTerminal?: {
      tpn: string;
      register_id: string | null;
      auth_key: string | null;
      terminal_type?: string;
    }
  ): Promise<boolean> {
    // Check if already loaded for this terminal
    if (this.terminalId === terminalId && this.credentials) {
      console.log('[DejavooSpinAPI] Using cached credentials for terminal:', terminalId);
      return true;
    }

    try {
      // FAST PATH: Use local credentials if provided
      if (paymentTerminal?.tpn && paymentTerminal?.auth_key) {
        console.log('[DejavooSpinAPI] Using local credentials from store (fast path)');

        // Use local credentials with default environment settings
        // TODO: These defaults should ideally come from a config or the terminal object
        const environment: DejavooEnvironment = 'sandbox'; // or 'sandbox' based on config
        const baseUrl = 'https://test.spinpos.net/spin';
        //   environment === 'production'
        //     ? 'https://spinpos.net:443'
        //     : 'https://test.spinpos.net:443';

        this.credentials = {
          tpn: paymentTerminal.tpn,
          authKey: paymentTerminal.auth_key,
          registerId: paymentTerminal.register_id || undefined,
          environment,
          baseUrl,
          timeout: 120, // Default timeout in seconds
        };

        this.terminalId = terminalId;

        console.log('[DejavooSpinAPI] Local credentials loaded successfully');
        console.log('[DejavooSpinAPI] TPN:', this.credentials.tpn);
        console.log('[DejavooSpinAPI] Register ID:', this.credentials.registerId);
        console.log('[DejavooSpinAPI] Environment:', this.credentials.environment);
        console.log('[DejavooSpinAPI] Base URL:', this.credentials.baseUrl);

        return true;
      }

      // SLOW PATH: Fetch from database via RPC
      console.log('[DejavooSpinAPI] Loading credentials from database (slow path)');

      const { data, error } = await this.supabase.rpc('get_terminal_credentials', {
        p_terminal_id: terminalId,
      });

      if (error || !data?.success) {
        const errorMsg = error?.message || data?.error || 'Failed to load credentials';
        console.error('[DejavooSpinAPI] Credential load failed:', errorMsg);

        toastService.show({
          title: 'Terminal Error',
          message: errorMsg,
          type: 'error',
        });

        return false;
      }

      // Map RPC response to credentials structure
      this.credentials = {
        tpn: data.tpn,
        authKey: data.auth_key,
        registerId: data.register_id,
        environment: data.api_environment,
        baseUrl: data.api_base_url,
        timeout: data.spin_proxy_timeout,
      };

      this.terminalId = terminalId;

      console.log('[DejavooSpinAPI] Credentials loaded successfully from database');
      console.log('[DejavooSpinAPI] Environment:', this.credentials.environment);
      console.log('[DejavooSpinAPI] Base URL:', this.credentials.baseUrl);

      return true;
    } catch (err) {
      console.error('[DejavooSpinAPI] Exception loading credentials:', err);

      toastService.show({
        title: 'Terminal Error',
        message: err instanceof Error ? err.message : 'Failed to load terminal',
        type: 'error',
      });

      return false;
    }
  }

  /**
   * Clear cached credentials
   * Useful for testing or when switching terminals
   */
  clearCredentials(): void {
    this.credentials = null;
    this.terminalId = null;
    console.log('[DejavooSpinAPI] Credentials cleared');
  }

  // ============================================================
  // TERMINAL STATUS
  // ============================================================

  /**
   * Check terminal connectivity status
   *
   * Verifies that the terminal is online and ready to process transactions.
   * Updates the database with the current terminal status.
   *
   * @returns Promise with status information
   *
   * @example
   * ```typescript
   * const status = await api.checkStatus();
   * if (status.status !== 'Online') {
   *   console.error('Terminal is offline');
   * }
   * ```
   */
  async checkStatus(): Promise<{
    success: boolean;
    status: 'Online' | 'Offline' | 'NotFound';
    error?: string;
  }> {
    if (!this.credentials) {
      return { success: false, status: 'NotFound', error: 'No terminal loaded. Call loadTerminal() first.' };
    }

    try {
      console.log('[DejavooSpinAPI] Checking terminal status...');

      const url = `${this.getBaseUrl()}/v2/Common/TerminalStatus`;
      const params = new URLSearchParams({
        'request.tpn': this.credentials.tpn,
        'request.registerId': this.credentials.registerId!,
        'request.authkey': this.credentials.authKey,
      });

      const response = await fetch(`${url}?${params}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await response.json();

      console.log('[DejavooSpinAPI] Terminal status:', data.TerminalStatus);

      // Update database with status
      if (this.terminalId) {
        await this.updateTerminalStatus(data.TerminalStatus, data.TerminalStatus === 'Online');
      }

      return {
        success: response.ok,
        status: data.TerminalStatus,
        error: data.ErrorDescription,
      };
    } catch (err) {
      console.error('[DejavooSpinAPI] Status check failed:', err);
      return {
        success: false,
        status: 'Offline',
        error: err instanceof Error ? err.message : 'Network error',
      };
    }
  }

  // ============================================================
  // TRANSACTION BUILDERS
  // ============================================================

  /**
   * Create a SALE transaction builder
   *
   * Returns a fluent builder for constructing and executing a payment transaction.
   *
   * @returns SaleTransactionBuilder for method chaining
   *
   * @example
   * ```typescript
   * const result = await api
   *   .sale()
   *   .amount(25.99)
   *   .tip(5.00)
   *   .performedBy('cashier@example.com')
   *   .execute();
   * ```
   */
  sale(): SaleTransactionBuilder {
    return new SaleTransactionBuilder(this);
  }

  // ============================================================
  // INTERNAL METHODS
  // ============================================================

  /**
   * Execute HTTP request to SPIN API
   *
   * @internal
   * @param endpoint - API endpoint (e.g., '/v2/Payment/Sale')
   * @param request - Request payload
   * @returns Promise with structured response
   */
  async executeRequest<T extends DejavooBaseResponse>(
    endpoint: string,
    request: Record<string, any>
  ): Promise<DejavooAPIResponse<T>> {
    if (!this.credentials) {
      return {
        success: false,
        error: 'No terminal loaded. Call loadTerminal() first.',
      };
    }

    try {
      const url = `${this.getBaseUrl()}${endpoint}`;

      console.log('[DejavooSpinAPI] Executing request to:', endpoint);
      console.log('[DejavooSpinAPI] Request data:', JSON.stringify(request, null, 2));

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      const data: T = await response.json();

      console.log('[DejavooSpinAPI] Response:', JSON.stringify(data, null, 2));

      // Parse ExtData if present
      const parsedExtData = data.ExtData ? parseExtData(data.ExtData) : undefined;

      // Determine success based on result code
      const success = isApprovedResponse(data);

      // Extract error code if present
      let errorCode: number | undefined;
      if (!success) {
        const match = data.Message?.match(/\d+/);
        errorCode = match ? parseInt(match[0], 10) : undefined;
      }

      // Create helper methods for easy data access
      const helpers = {
        getTransactionType: () => {
          // New format
          if ('TransactionType' in data) return (data as any).TransactionType;
          return undefined;
        },
        // Transaction identifiers
        getReferenceId: () => {
          // New format
          if ('ReferenceId' in data) return (data as any).ReferenceId;
          // Old format
          return (data as any).RefId;
        },
        getTransactionNumber: () => {
          // New format
          if ('TransactionNumber' in data) return (data as any).TransactionNumber;
          // Old format - check parsedExtData or TransNum
          return (data as any).TransNum;
        },
        getInvoiceNumber: () => {
          // New format
          if ('InvoiceNumber' in data) return (data as any).InvoiceNumber;
          return undefined;
        },
        getBatchNumber: () => {
          // New format
          if ('BatchNumber' in data) return (data as any).BatchNumber;
          // Old format - check parsedExtData
          return parsedExtData?.BatchNum;
        },
        getAuthCode: () => {
          // New format - nested in ExtendedDataByApplication
          if ('AuthCode' in data) return (data as any).AuthCode;
          return undefined;
        },

        getRRN: () => {
          // New format
          if ('RRN' in data) return (data as any).RRN;
          return undefined;
        },
        // Amounts
        getTotalAmount: () => {
          // New format
          if ('Amounts' in data) return (data as any).Amounts?.TotalAmount;
          // Old format
          return (data as any).TotalAmount;
        },
        getBaseAmount: () => {
          // New format - nested in ExtendedDataByApplication
          if ('ExtendedDataByApplication' in data) {
            const extData = (data as any).ExtendedDataByApplication;
            const baseAmtStr = extData?.['0']?.BaseAmount;
            return baseAmtStr ? parseFloat(baseAmtStr) : undefined;
          }
          // Old format
          return (data as any).Amount;
        },
        getTipAmount: () => {
          // New format
          if ('Amounts' in data) return (data as any).Amounts?.TipAmount;
          // Old format
          return (data as any).Tip || parsedExtData?.Tip ? parseFloat(parsedExtData?.Tip || '0') : undefined;
        },

        // Card info
        getCardType: () => {
          // New format
          if ('CardData' in data) return (data as any).CardData?.CardType;
          // Old format
          return parsedExtData?.CardType;
        },
        getCardLast4: () => {
          // New format
          if ('CardData' in data) return (data as any).CardData?.Last4;
          // Old format - extract from AccountNum
          const accountNum = parsedExtData?.AccountNum;
          return accountNum ? accountNum.slice(-4) : undefined;
        },
        getEntryMode: () => {
          // New format
          if ('CardData' in data) return (data as any).CardData?.EntryType;
          // Old format
          return parsedExtData?.EntryMode;
        },
        getCardholderName: () => {
          // New format
          if ('CardData' in data) return (data as any).CardData?.Name;
          // Old format
          return parsedExtData?.CardHolderName;
        },

        // Status
        isApproved: () => isApprovedResponse(data),
        getResultCode: () => {
          // New format
          if ('GeneralResponse' in data) return (data as any).GeneralResponse?.ResultCode;
          // Old format
          return data.ResultCode;
        },
        getStatusCode: () => {
          // New format
          if ('GeneralResponse' in data) return (data as any).GeneralResponse?.StatusCode;
          return undefined;
        },
        getMessage: () => {
          // New format
          if ('GeneralResponse' in data) return (data as any).GeneralResponse?.Message;
          // Old format
          return data.Message;
        },
      };

      const result: DejavooAPIResponse<T> = {
        success,
        data: success ? data : undefined,
        parsedExtData,
        error: success ? undefined : (data.Message || helpers.getMessage() || 'Transaction failed'),
        errorCode,
        rawResponse: data,
        helpers,
      };

      console.log('[DejavooSpinAPI] Result success:', success);
      if (!success) {
        console.error('[DejavooSpinAPI] Transaction failed:', result.error);
        if (errorCode) {
          console.error('[DejavooSpinAPI] Error code:', errorCode, '-', DEJAVOO_ERROR_CODES[errorCode]);
        }
        return {
            success: false,
            error: result.error,
          };
      }

      return result;
    } catch (err) {
      console.error('[DejavooSpinAPI] Request failed:', err);

      return {
        success: false,
        error: err instanceof Error ? err.message : 'Network error',
      };
    }
  }

  /**
   * Get authentication parameters for requests
   *
   * @internal
   * @returns Auth parameters object
   */
  getAuthParams(): { AuthKey: string; RegisterId: string; Tpn?: string; OperationalTimeout?: number } {
    if (!this.credentials) {
      throw new Error('No terminal loaded. Call loadTerminal() first.');
    }

    return {
      AuthKey: this.credentials.authKey,
      RegisterId: this.credentials.registerId || this.credentials.tpn,
      Tpn: this.credentials.tpn,
      OperationalTimeout: this.credentials.timeout,
    };
  }

  /**
   * Get base URL for API requests
   *
   * @internal
   * @returns Base URL string
   */
  private getBaseUrl(): string {
    if (!this.credentials) {
      throw new Error('No terminal loaded. Call loadTerminal() first.');
    }
    return this.credentials.baseUrl;
  }

  /**
   * Update terminal status in database
   *
   * @internal
   * @param status - Terminal status string
   * @param isConnected - Whether terminal is connected
   */
  private async updateTerminalStatus(status: string, isConnected: boolean): Promise<void> {
    if (!this.terminalId) return;

    try {
      await this.supabase.rpc('update_terminal_status', {
        p_terminal_id: this.terminalId,
        p_status: status,
        p_is_connected: isConnected,
      });
    } catch (err) {
      console.error('[DejavooSpinAPI] Failed to update terminal status:', err);
      // Don't throw - this is a non-critical operation
    }
  }
}

// ============================================================
// SALE TRANSACTION BUILDER
// ============================================================

/**
 * Fluent builder for SALE transactions
 *
 * Provides chainable methods for constructing payment requests with:
 * - Required field validation
 * - Type-safe parameters
 * - Auto-generation of optional fields
 * - Clear error messages
 *
 * @example
 * ```typescript
 * const result = await api
 *   .sale()
 *   .amount(50.00)
 *   .tip(10.00)
 *   .refId('ORDER_12345')
 *   .performedBy('alice@restaurant.com')
 *   .paymentType('Credit')
 *   .withTags('DineIn', 'Table5', 'Server_Alice')
 *   .invoiceNumber('INV-12345')
 *   .printReceipt('Both')
 *   .signatureCapture('Yes')
 *   .timeout(180)
 *   .execute();
 * ```
 */
export class SaleTransactionBuilder {
  private api: DejavooSpinAPI;

  // Required fields (validated at execute time)
  private _amount?: number;
  private _performedBy?: string;

  // Optional fields with defaults
  private _paymentType: PaymentType = 'Credit';
  private _refId?: string; // Auto-generated if not provided
  private _tip?: number;
  private _customFee?: number;
  private _taxAmount?: number;
  private _invoiceNumber?: string;
  private _printReceipt?: PrintReceiptOption;
  private _sigCapture?: SigCaptureOption;
  private _tag1?: string;
  private _tag2?: string;
  private _tag3?: string;
  private _merchantId?: string;
  private _timeout?: number;

  // HSA/FSA fields
  private _hsaTotalAmount?: number;
  private _hsaRxAmount?: number;
  private _hsaClinicAmount?: number;
  private _hsaDentalAmount?: number;

  constructor(api: DejavooSpinAPI) {
    this.api = api;
  }

  // ============================================================
  // REQUIRED FIELDS
  // ============================================================

  /**
   * Set transaction amount (REQUIRED)
   *
   * @param value - Amount in dollars (must be > 0)
   * @returns this for chaining
   * @throws Error if amount <= 0
   *
   * @example
   * ```typescript
   * builder.amount(25.99)
   * ```
   */
  amount(value: number): this {
    if (value <= 0) {
      throw new Error('Amount must be greater than 0');
    }
    this._amount = value;
    return this;
  }

  /**
   * Set user performing the transaction (REQUIRED)
   *
   * @param value - User identifier, typically email (max 100 chars)
   * @returns this for chaining
   * @throws Error if length > 100
   *
   * @example
   * ```typescript
   * builder.performedBy('cashier@restaurant.com')
   * ```
   */
  performedBy(value: string): this {
    if (value.length > 100) {
      throw new Error('PerformedBy cannot exceed 100 characters');
    }
    this._performedBy = value;
    return this;
  }

  // ============================================================
  // OPTIONAL FIELDS
  // ============================================================

  /**
   * Set tip/gratuity amount
   *
   * @param value - Tip amount in dollars (must be >= 0)
   * @returns this for chaining
   * @throws Error if tip < 0
   *
   * @example
   * ```typescript
   * builder.tip(5.00)
   * ```
   */
  tip(value: number): this {
    if (value < 0) {
      throw new Error('Tip amount cannot be negative');
    }
    this._tip = value;
    return this;
  }

  /**
   * Set custom merchant fee amount
   *
   * @param value - Fee amount in dollars
   * @returns this for chaining
   *
   * @example
   * ```typescript
   * builder.customFee(2.50)
   * ```
   */
  customFee(value: number): this {
    this._customFee = value;
    return this;
  }

  /**
   * Set reference ID (OPTIONAL - auto-generated if not provided)
   *
   * Must be unique within the current open batch.
   *
   * @param value - Reference ID (max 50 chars)
   * @returns this for chaining
   * @throws Error if length > 50
   *
   * @example
   * ```typescript
   * builder.refId('ORDER_12345')
   * ```
   */
  refId(value: string): this {
    if (value.length > 50) {
      throw new Error('RefId cannot exceed 50 characters');
    }
    this._refId = value;
    return this;
  }

  /**
   * Set payment type
   *
   * @param value - Payment method type
   * @returns this for chaining
   * @default 'Credit'
   *
   * @example
   * ```typescript
   * builder.paymentType('Debit')
   * ```
   */
  paymentType(value: PaymentType): this {
    this._paymentType = value;
    return this;
  }

  /**
   * Set receipt printing preference
   *
   * @param value - Print option
   * @returns this for chaining
   * @default undefined (terminal default)
   *
   * @example
   * ```typescript
   * builder.printReceipt('Both')
   * ```
   */
  printReceipt(value: PrintReceiptOption): this {
    this._printReceipt = value;
    return this;
  }

  /**
   * Set signature capture preference
   *
   * @param value - Signature capture setting
   * @returns this for chaining
   * @default undefined (terminal default)
   *
   * @example
   * ```typescript
   * builder.signatureCapture('Yes')
   * ```
   */
  signatureCapture(value: SigCaptureOption): this {
    this._sigCapture = value;
    return this;
  }

  /**
   * Set transaction tags for categorization and reporting
   *
   * Supports 1-3 tags, each up to 8 characters.
   *
   * @param tags - Up to 3 tags (8 chars each max)
   * @returns this for chaining
   * @throws Error if more than 3 tags or any tag > 8 chars
   *
   * @example
   * ```typescript
   * builder.withTags('DineIn', 'Table5', 'Server1')
   * ```
   */
  withTags(...tags: string[]): this {
    if (tags.length > 3) {
      throw new Error('Maximum 3 tags allowed');
    }

    tags.forEach((tag, i) => {
      if (tag.length > 8) {
        throw new Error(`Tag ${i + 1} exceeds 8 character limit`);
      }
    });

    this._tag1 = tags[0];
    this._tag2 = tags[1];
    this._tag3 = tags[2];

    return this;
  }

  /**
   * Set invoice number for reference
   *
   * @param value - Invoice number
   * @returns this for chaining
   *
   * @example
   * ```typescript
   * builder.invoiceNumber('INV-2024-001')
   * ```
   */
  invoiceNumber(value: string): this {
    this._invoiceNumber = value;
    return this;
  }

  /**
   * Set tax amount (informational only)
   *
   * @param value - Tax amount in dollars
   * @returns this for chaining
   *
   * @example
   * ```typescript
   * builder.taxAmount(2.08)
   * ```
   */
  taxAmount(value: number): this {
    this._taxAmount = value;
    return this;
  }

  /**
   * Set merchant ID (required with Multi MID enabled)
   *
   * @param value - Merchant ID (max 12 chars)
   * @returns this for chaining
   * @throws Error if length > 12
   *
   * @example
   * ```typescript
   * builder.merchantId('MERCH_12345')
   * ```
   */
  merchantId(value: string): this {
    if (value.length > 12) {
      throw new Error('MerchantId cannot exceed 12 characters');
    }
    this._merchantId = value;
    return this;
  }

  /**
   * Set custom timeout in seconds
   *
   * Overrides the terminal's default timeout.
   *
   * @param value - Timeout in seconds (1-720)
   * @returns this for chaining
   * @throws Error if not in range 1-720
   *
   * @example
   * ```typescript
   * builder.timeout(180) // 3 minutes
   * ```
   */
  timeout(value: number): this {
    if (value < DEJAVOO_TIMEOUTS.min || value > DEJAVOO_TIMEOUTS.max) {
      throw new Error(
        `Timeout must be between ${DEJAVOO_TIMEOUTS.min} and ${DEJAVOO_TIMEOUTS.max} seconds`
      );
    }
    this._timeout = value;
    return this;
  }

  /**
   * Set HSA/FSA healthcare amounts
   *
   * Used for healthcare-specific payment processing.
   *
   * @param params - Healthcare amounts
   * @returns this for chaining
   *
   * @example
   * ```typescript
   * builder.hsaAmounts({
   *   total: 100.00,
   *   rx: 50.00,
   *   clinic: 30.00,
   *   dental: 20.00
   * })
   * ```
   */
  hsaAmounts(params: {
    total?: number;
    rx?: number;
    clinic?: number;
    dental?: number;
  }): this {
    this._hsaTotalAmount = params.total;
    this._hsaRxAmount = params.rx;
    this._hsaClinicAmount = params.clinic;
    this._hsaDentalAmount = params.dental;
    return this;
  }

  // ============================================================
  // EXECUTE
  // ============================================================

  /**
   * Execute the SALE transaction
   *
   * Validates required fields, builds the request, and sends to the terminal.
   * Shows toast notification for user feedback.
   *
   * @returns Promise with transaction result
   *
   * @example
   * ```typescript
   * const result = await builder.execute();
   *
   * if (result.success) {
   *   console.log('Approved!', result.data?.AuthCode);
   *   console.log('Card:', result.parsedExtData?.CardType);
   * } else {
   *   console.error('Failed:', result.error);
   * }
   * ```
   */
  async execute(): Promise<DejavooAPIResponse<DejavooSaleResponse>> {
    // Validate required fields
    if (!this._amount) {
      const error = 'Amount is required. Call .amount() before execute()';
      console.error('[SaleTransactionBuilder]', error);
      return { success: false, error };
    }

    // if (!this._performedBy) {
    //   const error = 'PerformedBy is required. Call .performedBy() before execute()';
    //   console.error('[SaleTransactionBuilder]', error);
    //   return { success: false, error };
    // }

    // Auto-generate RefId if not provided
    if (!this._refId) {
      this._refId = generateRefId('SALE');
      console.log('[SaleTransactionBuilder] Auto-generated RefId:', this._refId);
    }

    try {
      // Get auth params from API instance
      const authParams = this.api.getAuthParams();

      // Build request object
      const request: DejavooSaleRequest = {
        ...authParams,
        TransType: 'Sale',
        PaymentType: this._paymentType,
        Amount: this._amount,
        ReferenceId: this._refId,
        // PerformedBy: this._performedBy,
        TipAmount: this._tip,
        CustomFee: this._customFee,
        TaxAmount: this._taxAmount,
        InvoiceNumber: this._invoiceNumber,
        PrintReceipt: this._printReceipt,
        SigCapture: this._sigCapture,
        Tag1: this._tag1,
        Tag2: this._tag2,
        Tag3: this._tag3,
        MerchantId: this._merchantId,
        OperationalTimeout: this._timeout || authParams.OperationalTimeout,
        HSA_TotalAmount: this._hsaTotalAmount,
        HSA_RxAmount: this._hsaRxAmount,
        HSA_ClinicAmount: this._hsaClinicAmount,
        HSA_DentalAmount: this._hsaDentalAmount,
      };

      // Execute request through API
      const response = await this.api.executeRequest<DejavooSaleResponse>(
        '/v2/Payment/Sale',
        request
      );

      // Show toast notification for user feedback
      if (response.success) {
        const total = this._amount + (this._tip || 0) + (this._customFee || 0);
        toastService.show({
          title: 'Payment Approved',
          message: `$${total.toFixed(2)} charged successfully`,
          type: 'success',
          duration: 3000,
        });
      } else {
        const errorMsg = response.error || 'Transaction declined';
        const detailedMsg = response.errorCode
          ? `${errorMsg} (${DEJAVOO_ERROR_CODES[response.errorCode] || `Code ${response.errorCode}`})`
          : errorMsg;

        toastService.show({
          title: 'Payment Failed',
          message: detailedMsg,
          type: 'error',
          duration: 5000,
        });
      }

      return response;
    } catch (err) {
      console.error('[SaleTransactionBuilder] Execute failed:', err);

      const errorMsg = err instanceof Error ? err.message : 'Unknown error';

      toastService.show({
        title: 'Payment Error',
        message: errorMsg,
        type: 'error',
        duration: 5000,
      });

      return {
        success: false,
        error: errorMsg,
      };
    }
  }
}
