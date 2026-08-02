// ============================================================
// Dejavoo SPIN API Service
// File: services/payment/DejavooService.ts
// ============================================================

import {
    DEJAVOO_ERROR_CODES,
    DejavooCredentials,
    DejavooSaleResponse,
    PaymentType
} from "@/types/dejavoo-spin-api";
import * as Sentry from "@sentry/react-native";
import { SupabaseClient } from "@supabase/supabase-js";

const SPIN_API_URLS = {
  sandbox: "https://test.spinpos.net",
  production: "https://api.spinpos.net",
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
      const { data, error } = await this.supabase.rpc(
        "get_terminal_credentials",
        {
          p_terminal_id: terminalId,
        },
      );

      if (error || !data?.success) {
        console.error(
          "[Dejavoo] Failed to load credentials:",
          error || data?.error,
        );
        return false;
      }

      this.credentials = {
        authKey: data.auth_key,
        registerId: data.register_id,
        environment: data.api_environment,
        baseUrl: data.api_base_url,
        timeout: data.spin_proxy_timeout,
      };

      return true;
    } catch (err) {
      console.error("[Dejavoo] Error loading credentials:", err);
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
    if (!this.credentials) throw new Error("Credentials not loaded");
    return (
      this.credentials.baseUrl || SPIN_API_URLS[this.credentials.environment]
    );
  }

  private getAuthParams(): {
    RegisterId: string;
    Authkey: string;
    SPInProxyTimeout?: number;
  } {
    if (!this.credentials) throw new Error("Credentials not loaded");
    return {
      RegisterId: this.credentials.registerId,
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
    status: "Online" | "Offline" | "NotFound";
    error?: string;
  }> {
    if (!this.credentials) {
      return {
        success: false,
        status: "NotFound",
        error: "Credentials not loaded",
      };
    }

    try {
      const url = `${this.getBaseUrl()}/v2/Report/Summary`;
      const body = {
        RegisterId: this.credentials.registerId,
        Authkey: this.credentials.authKey,
        SPInProxyTimeout: null,
      };

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      const isOnline = data?.GeneralResponse?.ResultCode === "0";
      const status = isOnline ? "Online" : "Offline";

      // Update terminal status in database
      await this.updateTerminalStatus(status, isOnline);

      return {
        success: isOnline,
        status,
        error: isOnline
          ? undefined
          : data?.GeneralResponse?.Message || "Terminal unreachable",
      };
    } catch (err) {
      console.error("[Dejavoo] Terminal status check failed:", err);
      return {
        success: false,
        status: "Offline",
        error: err instanceof Error ? err.message : "Network error",
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
      return { success: false, error: "Credentials not loaded" };
    }

    try {
      const request: Record<string, any> = {
        PaymentType: params.paymentType || "Credit",
        TransactionType: "Sale",
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
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error(
          `Dejavoo HTTP ${response.status}: ${response.statusText}`,
        );
      }

      const data: DejavooSaleResponse = await response.json();

      if (data.GeneralResponse.ResultCode === "Ok") {
        return { success: true, data };
      } else {
        const errorCode = this.parseErrorCode(data.GeneralResponse.StatusCode);
        return {
          success: false,
          error:
            data.GeneralResponse.Message ||
            data.GeneralResponse.DetailedMessage,
          errorCode,
          data,
        };
      }
    } catch (err) {
      Sentry.captureException(err, {
        tags: { terminal: "dejavoo", operation: "sale" },
      });
      console.error("[Dejavoo] Sale failed:", err);
      return {
        success: false,
        error: err instanceof Error ? err.message : "Network error",
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
    data?: Record<string, any>;
    error?: string;
  }> {
    if (!this.credentials) {
      return { success: false, error: "Credentials not loaded" };
    }

    try {
      const request: Record<string, any> = {
        PaymentType: params.paymentType || "Credit",
        TransactionType: "Void",
        ReferenceId: params.referenceId,
        ...this.getAuthParams(),
      };

      const voidUrl = `${this.getBaseUrl()}/v2/Payment/Void`;
      const voidResponse = await fetch(voidUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });

      if (!voidResponse.ok) {
        throw new Error(
          `Dejavoo HTTP ${voidResponse.status}: ${voidResponse.statusText}`,
        );
      }

      const data: Record<string, any> = await voidResponse.json();

      return {
        success: data.GeneralResponse.ResultCode === "Ok",
        data,
        error:
          data.GeneralResponse.ResultCode !== "Ok"
            ? data.GeneralResponse.Message
            : undefined,
      };
    } catch (err) {
      Sentry.captureException(err, {
        tags: { terminal: "dejavoo", operation: "void" },
      });
      console.error("[Dejavoo] Void failed:", err);
      return {
        success: false,
        error: err instanceof Error ? err.message : "Network error",
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
      return { success: false, error: "Credentials not loaded" };
    }

    try {
      const request: Record<string, any> = {
        PaymentType: params.paymentType || "Credit",
        TransactionType: "Refund",
        Amount: params.amount,
        ReferenceId: params.referenceId,
        OriginalReferenceId: params.originalReferenceId,
        ...this.getAuthParams(),
      };

      const refundUrl = `${this.getBaseUrl()}/v2/Payment/Return`;
      const refundResponse = await fetch(refundUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });

      if (!refundResponse.ok) {
        throw new Error(
          `Dejavoo HTTP ${refundResponse.status}: ${refundResponse.statusText}`,
        );
      }

      const data: DejavooSaleResponse = await refundResponse.json();

      return {
        success: data.GeneralResponse.ResultCode === "Ok",
        data,
        error:
          data.GeneralResponse.ResultCode !== "Ok"
            ? data.GeneralResponse.Message
            : undefined,
      };
    } catch (err) {
      Sentry.captureException(err, {
        tags: { terminal: "dejavoo", operation: "refund" },
      });
      console.error("[Dejavoo] Refund failed:", err);
      return {
        success: false,
        error: err instanceof Error ? err.message : "Network error",
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
    data?: Record<string, any>;
    error?: string;
  }> {
    if (!this.credentials) {
      return { success: false, error: "Credentials not loaded" };
    }

    try {
      const request: Record<string, any> = {
        PaymentType: "Credit",
        Amount: params.originalAmount,
        TipAmount: params.newTipAmount,
        ReferenceId: params.referenceId,
        ...this.getAuthParams(),
      };

      const url = `${this.getBaseUrl()}/v2/Payment/TipAdjust`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });

      const data: Record<string, any> = await response.json();

      return {
        success: data.GeneralResponse.ResultCode === "Ok",
        data,
        error:
          data.GeneralResponse.ResultCode !== "Ok"
            ? data.GeneralResponse.Message
            : undefined,
      };
    } catch (err) {
      console.error("[Dejavoo] Tip adjust failed:", err);
      return {
        success: false,
        error: err instanceof Error ? err.message : "Network error",
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
      return { success: false, error: "Credentials not loaded" };
    }

    try {
      const request = {
        PaymentType: params.paymentType || "Credit",
        TransactionType: "Auth",
        Amount: params.amount,
        ReferenceId: params.referenceId,
        ...this.getAuthParams(),
      };

      const url = `${this.getBaseUrl()}/v2/Payment/Auth`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });

      const data: DejavooSaleResponse = await response.json();

      return {
        success: data.GeneralResponse.ResultCode === "Ok",
        data,
        error:
          data.GeneralResponse.ResultCode !== "Ok"
            ? data.GeneralResponse.Message
            : undefined,
      };
    } catch (err) {
      console.error("[Dejavoo] Pre-auth failed:", err);
      return {
        success: false,
        error: err instanceof Error ? err.message : "Network error",
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
      return { success: false, error: "Credentials not loaded" };
    }

    try {
      const request = {
        PaymentType: params.paymentType || "Credit",
        TransactionType: "Capture",
        Amount: params.amount,
        TipAmount: params.tipAmount,
        ReferenceId: params.referenceId,
        ...this.getAuthParams(),
      };

      const url = `${this.getBaseUrl()}/v2/Payment/Capture`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });

      const data: DejavooSaleResponse = await response.json();

      return {
        success: data.GeneralResponse.ResultCode === "Ok",
        data,
        error:
          data.GeneralResponse.ResultCode !== "Ok"
            ? data.GeneralResponse.Message
            : undefined,
      };
    } catch (err) {
      console.error("[Dejavoo] Capture failed:", err);
      return {
        success: false,
        error: err instanceof Error ? err.message : "Network error",
      };
    }
  }

  /**
   * Settle/close the batch
   */
  async settleBatch(paymentType?: PaymentType): Promise<{
    success: boolean;
    data?: Record<string, any>;
    error?: string;
  }> {
    if (!this.credentials) {
      return { success: false, error: "Credentials not loaded" };
    }

    try {
      const request: Record<string, any> = {
        PaymentType: paymentType,
        ...this.getAuthParams(),
      };

      const url = `${this.getBaseUrl()}/v2/Payment/Settle`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });

      const data: Record<string, any> = await response.json();

      return {
        success: data.GeneralResponse.ResultCode === "Ok",
        data,
        error:
          data.GeneralResponse.ResultCode !== "Ok"
            ? data.GeneralResponse.Message
            : undefined,
      };
    } catch (err) {
      console.error("[Dejavoo] Settle failed:", err);
      return {
        success: false,
        error: err instanceof Error ? err.message : "Network error",
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
      return { success: false, error: "Credentials not loaded" };
    }

    try {
      const request = {
        ReferenceId: referenceId,
        ...this.getAuthParams(),
      };

      const url = `${this.getBaseUrl()}/v2/Payment/Status`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });

      const data: DejavooSaleResponse = await response.json();

      return {
        success: data.GeneralResponse.ResultCode === "Ok",
        data,
        error:
          data.GeneralResponse.ResultCode !== "Ok"
            ? data.GeneralResponse.Message
            : undefined,
      };
    } catch (err) {
      console.error("[Dejavoo] Status check failed:", err);
      return {
        success: false,
        error: err instanceof Error ? err.message : "Network error",
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
      return { success: false, error: "Credentials not loaded" };
    }

    try {
      const request = {
        ReferenceId: referenceId,
        ...this.getAuthParams(),
      };

      const url = `${this.getBaseUrl()}/v2/Payment/AbortTransaction`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });

      const data: Record<string, any> = await response.json();

      return {
        success: data.GeneralResponse.ResultCode === "Ok",
        error:
          data.GeneralResponse.ResultCode !== "Ok"
            ? data.GeneralResponse.Message
            : undefined,
      };
    } catch (err) {
      console.error("[Dejavoo] Abort failed:", err);
      return {
        success: false,
        error: err instanceof Error ? err.message : "Network error",
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

  private async updateTerminalStatus(
    status: string,
    isConnected: boolean,
  ): Promise<void> {
    // This would be called with the terminal ID from the caller
    // For now, just log
    console.log(
      "[Dejavoo] Terminal status:",
      status,
      "Connected:",
      isConnected,
    );
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
  static generateReferenceId(
    orderId: string,
    paymentIndex: number = 0,
  ): string {
    // Format: ORD-{shortOrderId}-{paymentIndex}-{timestamp}
    const shortId = orderId.substring(0, 8);
    const timestamp = Date.now().toString(36);
    return `${shortId}-${paymentIndex}-${timestamp}`.substring(0, 50);
  }
}
