/**
 * Payment Preview Service
 *
 * Implements the "Calculate -> Confirm -> Charge" pattern:
 * 1. Calculate locally (instant UI feedback)
 * 2. Validate with backend (if online and has db_order_id)
 * 3. Return preview for user confirmation
 *
 * This service ensures payment amounts are accurate before
 * initiating terminal transactions.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  OrderCalculationInput,
  OrderCalculationResult,
  PaymentPreviewInput,
  PaymentPreviewResult,
  PreviewPaymentOptions,
  ValidatePaymentResult,
} from "@/types/order-calculations";
import {
  calculateOrderTotalsWithDetails,
  calculatePaymentPreview,
  hashCalculationInput,
} from "@/lib/order-calculator";
import { getOrderStoreSupabaseClient } from "@/stores/useOrderStore";
import { getIsOnline } from "@/services/offlineSyncService";

// ============================================================================
// CACHE CONFIGURATION
// ============================================================================

const CACHE_TTL_MS = 5000; // 5 seconds
const MAX_CACHE_ENTRIES = 50;

// ============================================================================
// SERVICE CLASS
// ============================================================================

/**
 * Payment Preview Service
 *
 * Provides cached order calculations and payment preview with
 * optional backend validation.
 */
class PaymentPreviewServiceClass {
  private cache: Map<
    string,
    { result: OrderCalculationResult; timestamp: number }
  > = new Map();

  /**
   * Get order calculation, using cache if valid.
   *
   * @param orderId - Local order ID
   * @param input - Calculation input
   * @returns Calculated order totals with item details
   */
  getOrderCalculation(
    orderId: string,
    input: OrderCalculationInput
  ): OrderCalculationResult {
    const inputHash = hashCalculationInput(input);
    const cacheKey = `${orderId}:${inputHash}`;

    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.result;
    }

    const result = calculateOrderTotalsWithDetails(input);
    this.cache.set(cacheKey, { result, timestamp: Date.now() });

    // Prune old cache entries
    this.pruneCache();

    return result;
  }

  /**
   * Preview a payment - local first, then validate with backend if online.
   *
   * Flow:
   * 1. Calculate locally (instant)
   * 2. If online + has db_order_id: validate with backend
   * 3. If backend returns different amount, use backend's
   * 4. Return combined result
   *
   * @param options - Preview options
   * @returns Validation result with local and backend data
   */
  async previewPayment(
    options: PreviewPaymentOptions
  ): Promise<ValidatePaymentResult> {
    const {
      orderId,
      dbOrderId,
      input,
      calculationInput,
      amountPaidSoFar,
      localOnly,
    } = options;

    // Step 1: Calculate locally (instant)
    const orderCalc = this.getOrderCalculation(orderId, calculationInput);
    const localPreview = calculatePaymentPreview(
      orderCalc,
      amountPaidSoFar,
      input,
      orderCalc.items
    );

    // Step 2: Return immediately if local-only, offline, or no backend ID
    const isOnline = getIsOnline();
    const supabase = getOrderStoreSupabaseClient();

    if (localOnly || !isOnline || !supabase || !dbOrderId) {
      return {
        isValid: localPreview.isValid,
        localPreview,
        finalAmount: localPreview.amountToCharge,
        discrepancy: 0,
      };
    }

    // Step 3: Validate with backend
    try {
      const backendValidation = await this.validateWithBackend(
        supabase,
        dbOrderId,
        input,
        localPreview.amountToCharge
      );

      const discrepancy = Math.abs(
        (backendValidation.suggestedAmount ?? localPreview.amountToCharge) -
          localPreview.amountToCharge
      );

      // Use backend amount if there's a discrepancy
      const finalAmount =
        backendValidation.valid && backendValidation.suggestedAmount
          ? backendValidation.suggestedAmount
          : localPreview.amountToCharge;

      return {
        isValid: localPreview.isValid && backendValidation.valid,
        localPreview: {
          ...localPreview,
          backendValidated: true,
          amountToCharge: finalAmount,
        },
        backendValidation,
        finalAmount,
        discrepancy,
      };
    } catch (error) {
      console.warn(
        "[PaymentPreviewService] Backend validation failed:",
        error
      );
      // Fallback to local calculation on backend error
      return {
        isValid: localPreview.isValid,
        localPreview,
        backendValidation: {
          valid: false,
          errors: [(error as Error).message],
        },
        finalAmount: localPreview.amountToCharge,
        discrepancy: 0,
      };
    }
  }

  /**
   * Preview a full payment quickly (convenience method).
   *
   * @param orderId - Local order ID
   * @param dbOrderId - Backend order ID
   * @param calculationInput - Order calculation input
   * @param amountPaidSoFar - Already paid amount
   * @param paymentMethod - "card" or "cash"
   * @returns Payment preview result
   */
  async previewFullPayment(
    orderId: string,
    dbOrderId: string | undefined,
    calculationInput: OrderCalculationInput,
    amountPaidSoFar: number,
    paymentMethod: "card" | "cash"
  ): Promise<ValidatePaymentResult> {
    return this.previewPayment({
      orderId,
      dbOrderId,
      input: {
        type: "full",
        paymentMethod,
      },
      calculationInput,
      amountPaidSoFar,
    });
  }

  /**
   * Preview an even split payment (convenience method).
   *
   * @param orderId - Local order ID
   * @param dbOrderId - Backend order ID
   * @param calculationInput - Order calculation input
   * @param amountPaidSoFar - Already paid amount
   * @param paymentMethod - "card" or "cash"
   * @param splitCount - Number of people splitting
   * @param splitIndex - Which split this is (1-based)
   * @returns Payment preview result
   */
  async previewSplitPayment(
    orderId: string,
    dbOrderId: string | undefined,
    calculationInput: OrderCalculationInput,
    amountPaidSoFar: number,
    paymentMethod: "card" | "cash",
    splitCount: number,
    splitIndex: number
  ): Promise<ValidatePaymentResult> {
    return this.previewPayment({
      orderId,
      dbOrderId,
      input: {
        type: "split_even",
        paymentMethod,
        splitCount,
        splitIndex,
      },
      calculationInput,
      amountPaidSoFar,
    });
  }

  /**
   * Validate payment amount with backend.
   * Calls preview_payment RPC.
   */
  private async validateWithBackend(
    supabase: SupabaseClient,
    dbOrderId: string,
    input: PaymentPreviewInput,
    localAmount: number
  ): Promise<{
    valid: boolean;
    errors: string[];
    suggestedAmount?: number;
  }> {
    // Build params based on payment type
    const params: Record<string, unknown> = {
      p_order_id: dbOrderId,
      p_payment_method: input.paymentMethod,
      p_amount: localAmount,
    };

    if (input.type === "split_even" && input.splitCount) {
      params.p_split_count = input.splitCount;
      params.p_split_portion_index = input.splitIndex ?? 1;
    }

    if (input.type === "split_by_item" && input.itemAllocations) {
      // Convert to backend format - use dbOrderItemId if available
      params.p_item_allocations = input.itemAllocations.map((a) => ({
        order_item_id: a.dbOrderItemId ?? a.itemId,
        quantity: a.quantity,
      }));
    }

    // Call backend validation
    const { data, error } = await supabase.rpc("preview_payment", params);

    if (error) {
      return {
        valid: false,
        errors: [error.message],
      };
    }

    // Handle backend response
    if (data && typeof data === "object") {
      return {
        valid: (data as { is_valid?: boolean }).is_valid ?? false,
        errors: (data as { errors?: string[] }).errors ?? [],
        suggestedAmount: (data as { suggested_amount?: number }).suggested_amount,
      };
    }

    // If RPC returns unexpected format, trust local
    return {
      valid: true,
      errors: [],
      suggestedAmount: localAmount,
    };
  }

  /**
   * Clear cache for a specific order (call after modifications).
   *
   * @param orderId - Local order ID to invalidate
   */
  invalidateCache(orderId: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${orderId}:`)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear entire cache.
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Remove stale cache entries.
   */
  private pruneCache(): void {
    const now = Date.now();

    // Remove expired entries
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > CACHE_TTL_MS * 2) {
        this.cache.delete(key);
      }
    }

    // If still too many entries, remove oldest
    if (this.cache.size > MAX_CACHE_ENTRIES) {
      const entries = Array.from(this.cache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);

      const toRemove = entries.slice(
        0,
        this.cache.size - MAX_CACHE_ENTRIES
      );
      for (const [key] of toRemove) {
        this.cache.delete(key);
      }
    }
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

/**
 * Singleton instance of PaymentPreviewService.
 * Use this for all payment preview operations.
 */
export const paymentPreviewService = new PaymentPreviewServiceClass();

// Also export the class for testing
export { PaymentPreviewServiceClass };
