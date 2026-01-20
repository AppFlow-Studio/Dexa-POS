// ============================================================
// Dejavoo SPIN API Service
// File: services/payment/DejavooService.ts
// ============================================================

import { SupabaseClient } from '@supabase/supabase-js';
import {
  DejavooCredentials,
  DejavooSaleRequest,
  DejavooSaleResponse,
  DejavooVoidRequest,
  DejavooRefundRequest,
  DejavooTipAdjustRequest,
  DejavooStatusRequest,
  DejavooTerminalStatusResponse,
  DejavooSettleRequest,
  DejavooResponse,
  PaymentType,
  DEJAVOO_ERROR_CODES,
} from '@/types/dejavoo-spin-api';

const SPIN_API_URLS = {
  sandbox: 'https://test.spinpos.net',
  production: 'https://api.spinpos.net',
};

export class DejavooService {
  private credentials: DejavooCredentials | null = null;
  private supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  // ============================================================
  // CREDENTIAL MANAGEMENT
  // ============================================================

  /**
   * Load credentials from database for a specific terminal
   */
  async loadCredentials(terminalId: string): Promise<boolean> {
    try {
      const { data, error } = await this.supabase.rpc('get_terminal_credentials', {
        p_terminal_id: terminalId,
      });

      if (error || !data?.success) {
        console.error('[Dejavoo] Failed to load credentials:', error || data?.error);
        return false;
      }

      this.credentials = {
        tpn: data.tpn,
        authKey: data.auth_key,
        environment: data.api_environment,
        baseUrl: data.api_base_url,
        timeout: data.spin_proxy_timeout,
      };

      return true;
    } catch (err) {
      console.error('[Dejavoo] Error loading credentials:', err);
      return false;
    }
  }

  /**
   * Set credentials directly (for testing or initialization)
   */
  setCredentials(credentials: DejavooCredentials): void {
    this.credentials = credentials;
  }

  private getBaseUrl(): string {
    if (!this.credentials) throw new Error('Credentials not loaded');
    return this.credentials.baseUrl || SPIN_API_URLS[this.credentials.environment];
  }

  private getAuthParams(): { Tpn: string; Authkey: string; SPInProxyTimeout?: number } {
    if (!this.credentials) throw new Error('Credentials not loaded');
    return {
      Tpn: this.credentials.tpn,
      Authkey: this.credentials.authKey,
      SPInProxyTimeout: this.credentials.timeout,
    };
  }

  // ============================================================
  // API METHODS
  // ============================================================

  /**
   * Check terminal status (Online/Offline/NotFound)
   */
  async checkTerminalStatus(): Promise<{
    success: boolean;
    status: 'Online' | 'Offline' | 'NotFound';
    error?: string;
  }> {
    if (!this.credentials) {
      return { success: false, status: 'NotFound', error: 'Credentials not loaded' };
    }

    try {
      const url = `${this.getBaseUrl()}/v2/Common/TerminalStatus`;
      const params = new URLSearchParams({
        'request.tpn': this.credentials.tpn,
        'request.authkey': this.credentials.authKey,
      });

      const response = await fetch(`${url}?${params}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      const data: DejavooTerminalStatusResponse = await response.json();

      // Update terminal status in database
      await this.updateTerminalStatus(data.TerminalStatus, data.TerminalStatus === 'Online');

      return {
        success: response.ok,
        status: data.TerminalStatus,
        error: data.ErrorDescription,
      };
    } catch (err) {
      console.error('[Dejavoo] Terminal status check failed:', err);
      return {
        success: false,
        status: 'Offline',
        error: err instanceof Error ? err.message : 'Network error',
      };
    }
  }

  /**
   * Process a sale transaction
   */
  async processSale(params: {
    amount: number;
    tipAmount?: number;
    taxAmount?: number;
    referenceId: string;
    invoiceNumber?: string;
    paymentType?: PaymentType;
  }): Promise<{
    success: boolean;
    data?: DejavooSaleResponse;
    error?: string;
    errorCode?: number;
  }> {
    if (!this.credentials) {
      return { success: false, error: 'Credentials not loaded' };
    }

    try {
      const request: DejavooSaleRequest = {
        PaymentType: params.paymentType || 'Card',
        TransactionType: 'Sale',
        Amount: params.amount,
        TipAmount: params.tipAmount,
        TaxAmount: params.taxAmount,
        ReferenceId: params.referenceId,
        InvoiceNumber: params.invoiceNumber,
        IsReadyForIS: true,
        ...this.getAuthParams(),
      };

      const url = `${this.getBaseUrl()}/v2/Payment/Sale`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      const data: DejavooSaleResponse = await response.json();

      if (data.GeneralResponse.ResultCode === 'Ok') {
        return { success: true, data };
      } else {
        const errorCode = this.parseErrorCode(data.GeneralResponse.StatusCode);
        return {
          success: false,
          error: data.GeneralResponse.Message || data.GeneralResponse.DetailedMessage,
          errorCode,
          data,
        };
      }
    } catch (err) {
      console.error('[Dejavoo] Sale failed:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Network error',
      };
    }
  }

  /**
   * Void a transaction
   */
  async voidTransaction(params: {
    referenceId: string;
    paymentType?: PaymentType;
  }): Promise<{
    success: boolean;
    data?: DejavooResponse;
    error?: string;
  }> {
    if (!this.credentials) {
      return { success: false, error: 'Credentials not loaded' };
    }

    try {
      const request: DejavooVoidRequest = {
        PaymentType: params.paymentType || 'Card',
        TransactionType: 'Void',
        ReferenceId: params.referenceId,
        ...this.getAuthParams(),
      };

      const url = `${this.getBaseUrl()}/v2/Payment/Void`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      const data: DejavooResponse = await response.json();

      return {
        success: data.GeneralResponse.ResultCode === 'Ok',
        data,
        error: data.GeneralResponse.ResultCode !== 'Ok' 
          ? data.GeneralResponse.Message 
          : undefined,
      };
    } catch (err) {
      console.error('[Dejavoo] Void failed:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Network error',
      };
    }
  }

  /**
   * Process a refund
   */
  async processRefund(params: {
    amount: number;
    referenceId: string;
    originalReferenceId?: string;
    paymentType?: PaymentType;
  }): Promise<{
    success: boolean;
    data?: DejavooSaleResponse;
    error?: string;
  }> {
    if (!this.credentials) {
      return { success: false, error: 'Credentials not loaded' };
    }

    try {
      const request: DejavooRefundRequest = {
        PaymentType: params.paymentType || 'Card',
        TransactionType: 'Refund',
        Amount: params.amount,
        ReferenceId: params.referenceId,
        OriginalReferenceId: params.originalReferenceId,
        ...this.getAuthParams(),
      };

      const url = `${this.getBaseUrl()}/v2/Payment/Return`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      const data: DejavooSaleResponse = await response.json();

      return {
        success: data.GeneralResponse.ResultCode === 'Ok',
        data,
        error: data.GeneralResponse.ResultCode !== 'Ok' 
          ? data.GeneralResponse.Message 
          : undefined,
      };
    } catch (err) {
      console.error('[Dejavoo] Refund failed:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Network error',
      };
    }
  }

  /**
   * Adjust tip on a credit transaction
   */
  async adjustTip(params: {
    originalAmount: number;
    newTipAmount: number;
    referenceId: string;
  }): Promise<{
    success: boolean;
    data?: DejavooResponse;
    error?: string;
  }> {
    if (!this.credentials) {
      return { success: false, error: 'Credentials not loaded' };
    }

    try {
      const request: DejavooTipAdjustRequest = {
        PaymentType: 'Credit',
        TransactionType: 'TipAdjust',
        Amount: params.originalAmount,
        TipAmount: params.newTipAmount,
        ReferenceId: params.referenceId,
        ...this.getAuthParams(),
      };

      const url = `${this.getBaseUrl()}/v2/Payment/TipAdjust`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      const data: DejavooResponse = await response.json();

      return {
        success: data.GeneralResponse.ResultCode === 'Ok',
        data,
        error: data.GeneralResponse.ResultCode !== 'Ok' 
          ? data.GeneralResponse.Message 
          : undefined,
      };
    } catch (err) {
      console.error('[Dejavoo] Tip adjust failed:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Network error',
      };
    }
  }

  /**
   * Pre-authorize a card (for bar tabs, etc.)
   */
  async preAuthorize(params: {
    amount: number;
    referenceId: string;
    paymentType?: PaymentType;
  }): Promise<{
    success: boolean;
    data?: DejavooSaleResponse;
    error?: string;
  }> {
    if (!this.credentials) {
      return { success: false, error: 'Credentials not loaded' };
    }

    try {
      const request = {
        PaymentType: params.paymentType || 'Credit',
        TransactionType: 'Auth',
        Amount: params.amount,
        ReferenceId: params.referenceId,
        ...this.getAuthParams(),
      };

      const url = `${this.getBaseUrl()}/v2/Payment/Auth`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      const data: DejavooSaleResponse = await response.json();

      return {
        success: data.GeneralResponse.ResultCode === 'Ok',
        data,
        error: data.GeneralResponse.ResultCode !== 'Ok' 
          ? data.GeneralResponse.Message 
          : undefined,
      };
    } catch (err) {
      console.error('[Dejavoo] Pre-auth failed:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Network error',
      };
    }
  }

  /**
   * Capture a pre-authorized transaction
   */
  async captureAuth(params: {
    amount: number;
    tipAmount?: number;
    referenceId: string;
    paymentType?: PaymentType;
  }): Promise<{
    success: boolean;
    data?: DejavooSaleResponse;
    error?: string;
  }> {
    if (!this.credentials) {
      return { success: false, error: 'Credentials not loaded' };
    }

    try {
      const request = {
        PaymentType: params.paymentType || 'Credit',
        TransactionType: 'Capture',
        Amount: params.amount,
        TipAmount: params.tipAmount,
        ReferenceId: params.referenceId,
        ...this.getAuthParams(),
      };

      const url = `${this.getBaseUrl()}/v2/Payment/Capture`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      const data: DejavooSaleResponse = await response.json();

      return {
        success: data.GeneralResponse.ResultCode === 'Ok',
        data,
        error: data.GeneralResponse.ResultCode !== 'Ok' 
          ? data.GeneralResponse.Message 
          : undefined,
      };
    } catch (err) {
      console.error('[Dejavoo] Capture failed:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Network error',
      };
    }
  }

  /**
   * Settle/close the batch
   */
  async settleBatch(paymentType?: PaymentType): Promise<{
    success: boolean;
    data?: DejavooResponse;
    error?: string;
  }> {
    if (!this.credentials) {
      return { success: false, error: 'Credentials not loaded' };
    }

    try {
      const request: DejavooSettleRequest = {
        PaymentType: paymentType,
        ...this.getAuthParams(),
      };

      const url = `${this.getBaseUrl()}/v2/Payment/Settle`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      const data: DejavooResponse = await response.json();

      return {
        success: data.GeneralResponse.ResultCode === 'Ok',
        data,
        error: data.GeneralResponse.ResultCode !== 'Ok' 
          ? data.GeneralResponse.Message 
          : undefined,
      };
    } catch (err) {
      console.error('[Dejavoo] Settle failed:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Network error',
      };
    }
  }

  /**
   * Get transaction status
   */
  async getTransactionStatus(referenceId: string): Promise<{
    success: boolean;
    data?: DejavooSaleResponse;
    error?: string;
  }> {
    if (!this.credentials) {
      return { success: false, error: 'Credentials not loaded' };
    }

    try {
      const request = {
        ReferenceId: referenceId,
        ...this.getAuthParams(),
      };

      const url = `${this.getBaseUrl()}/v2/Payment/Status`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      const data: DejavooSaleResponse = await response.json();

      return {
        success: data.GeneralResponse.ResultCode === 'Ok',
        data,
        error: data.GeneralResponse.ResultCode !== 'Ok' 
          ? data.GeneralResponse.Message 
          : undefined,
      };
    } catch (err) {
      console.error('[Dejavoo] Status check failed:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Network error',
      };
    }
  }

  /**
   * Abort a pending transaction
   */
  async abortTransaction(referenceId: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    if (!this.credentials) {
      return { success: false, error: 'Credentials not loaded' };
    }

    try {
      const request = {
        ReferenceId: referenceId,
        ...this.getAuthParams(),
      };

      const url = `${this.getBaseUrl()}/v2/Payment/AbortTransaction`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      const data: DejavooResponse = await response.json();

      return {
        success: data.GeneralResponse.ResultCode === 'Ok',
        error: data.GeneralResponse.ResultCode !== 'Ok' 
          ? data.GeneralResponse.Message 
          : undefined,
      };
    } catch (err) {
      console.error('[Dejavoo] Abort failed:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Network error',
      };
    }
  }

  // ============================================================
  // HELPER METHODS
  // ============================================================

  private parseErrorCode(statusCode: string): number | undefined {
    const match = statusCode.match(/\d+/);
    return match ? parseInt(match[0], 10) : undefined;
  }

  private async updateTerminalStatus(status: string, isConnected: boolean): Promise<void> {
    // This would be called with the terminal ID from the caller
    // For now, just log
    console.log('[Dejavoo] Terminal status:', status, 'Connected:', isConnected);
  }

  /**
   * Get human-readable error message from error code
   */
  static getErrorMessage(errorCode: number): string {
    return DEJAVOO_ERROR_CODES[errorCode] || `Unknown error (${errorCode})`;
  }

  /**
   * Generate a unique reference ID for a transaction
   */
  static generateReferenceId(orderId: string, paymentIndex: number = 0): string {
    // Format: ORD-{shortOrderId}-{paymentIndex}-{timestamp}
    const shortId = orderId.substring(0, 8);
    const timestamp = Date.now().toString(36);
    return `${shortId}-${paymentIndex}-${timestamp}`.substring(0, 50);
  }
}





