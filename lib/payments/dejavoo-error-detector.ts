import type { DejavooAPIResponse, DejavooBaseResponse } from '@/types/dejavoo-spin-api';

/**
 * Error types categorization for Dejavoo API responses
 */
export type DejavooErrorType = 'connectivity' | 'declined' | 'timeout' | 'cancelled' | 'unknown';

/**
 * Detects if the error is a terminal connectivity issue (StatusCode 2001 or ResultCode "2")
 * This indicates the terminal is not connected to the SPIN Proxy server
 *
 * @param response - The Dejavoo API response
 * @returns true if this is a terminal connectivity error
 */
export function isTerminalConnectivityError(
  response: DejavooAPIResponse<any>
): boolean {
  // Check if response has helpers (preferred method)
  if (response.helpers) {
    const statusCode = response.helpers.getStatusCode();
    const resultCode = response.helpers.getResultCode();

    // StatusCode 2001 = Terminal not connected to SPIN Proxy server
    // ResultCode "2" = SPIN Proxy error or timeout
    return statusCode === '2001' || resultCode === '2';
  }

  // Fallback: Check raw response if helpers not available
  if (response.rawResponse) {
    const raw = response.rawResponse;

    // Check new format (nested GeneralResponse)
    if ('GeneralResponse' in raw) {
      return raw.GeneralResponse?.StatusCode === '2001' || raw.GeneralResponse?.ResultCode === '2';
    }

    // Check old format (flat structure)
    if ('StatusCode' in raw || 'ResultCode' in raw) {
      return (raw as any).StatusCode === '2001' || (raw as any).ResultCode === '2';
    }
  }

  // Check errorCode extracted from message
  return response.errorCode === 2001;
}

/**
 * Returns a user-friendly error message for Dejavoo API errors
 * Provides specific messaging for terminal connectivity issues
 *
 * @param response - The Dejavoo API response
 * @returns User-friendly error message
 */
export function getTerminalErrorMessage(response: DejavooAPIResponse<any>): string {
  // Check for terminal connectivity error first
  if (isTerminalConnectivityError(response)) {
    return 'Terminal not connected. Please check device connection.';
  }

  // Use helper getMessage if available
  if (response.helpers) {
    const message = response.helpers.getMessage();
    if (message && message !== 'Error') {
      return message;
    }
  }

  // Fallback to response.error or generic message
  return response.error || 'Transaction failed. Please try again.';
}

/**
 * Categorizes the type of error from a Dejavoo API response
 * Useful for analytics and conditional error handling
 *
 * @param response - The Dejavoo API response
 * @returns The error category
 */
export function categorizeError(response: DejavooAPIResponse<any>): DejavooErrorType {
  if (!response.success) {
    // Check for terminal connectivity error
    if (isTerminalConnectivityError(response)) {
      return 'connectivity';
    }

    // Check for cancellation
    if (response.errorCode === 1012 || response.error?.toLowerCase().includes('cancel')) {
      return 'cancelled';
    }

    // Check for timeout
    if (response.error?.toLowerCase().includes('timeout')) {
      return 'timeout';
    }

    // Check for declined (ResultCode "1")
    if (response.helpers) {
      const resultCode = response.helpers.getResultCode();
      if (resultCode === '1') {
        return 'declined';
      }
    }
  }

  return 'unknown';
}

/**
 * Checks if the error should trigger an immediate payment view close
 * Currently only terminal connectivity errors should close immediately
 *
 * @param response - The Dejavoo API response
 * @returns true if the payment view should close immediately
 */
export function shouldClosePaymentView(response: DejavooAPIResponse<any>): boolean {
  // Only terminal connectivity errors should force immediate close
  // Other errors (declined, timeout, etc.) allow the user to retry
  return isTerminalConnectivityError(response);
}
