/**
 * Order Calculation Types
 *
 * Type definitions for the bulletproof order calculation system.
 * These types support:
 * - Pure calculation functions
 * - Split payments (even, by item, custom)
 * - Dual pricing (card vs cash)
 * - Per-item tax categories
 * - Payment preview with backend validation
 */

import { CartItem, Discount } from "@/lib/types";
import { TaxRatesMap } from "@/types/menu";

// ============================================================================
// CORE CALCULATION TYPES
// ============================================================================

/**
 * Input for order calculations - pure data, no side effects
 */
export interface OrderCalculationInput {
  items: CartItem[];
  checkDiscount: Discount | null;
  taxRatesMap: TaxRatesMap;
  payments?: { amount: number; isVoided?: boolean; refundedAmount?: number; isCashPriced?: boolean; cashSavings?: number; isPreAuth?: boolean }[];
  /** Optional cash discount rate for dual pricing (default uses store settings) */
  cashDiscountRate?: number;
}

/**
 * Complete order totals - the core calculation result
 */
export interface OrderTotals {
  // Card pricing totals
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;

  // Outstanding (unpaid) amounts - card pricing
  outstanding_subtotal: number;
  outstanding_tax: number;
  outstanding_total: number;

  // Cash pricing totals
  cash_subtotal: number;
  cash_discount_amount: number;
  cash_tax_amount: number;
  cash_total_amount: number;

  // Outstanding (unpaid) amounts - cash pricing
  cash_outstanding_subtotal: number;
  cash_outstanding_tax: number;
  cash_outstanding_total: number;
}

/**
 * Per-item calculation details
 * Used for split payments, itemized receipts, and auditing
 */
export interface ItemCalculationDetail {
  // Identifiers
  itemId: string;
  dbOrderItemId?: string;
  menuItemId: string;
  name: string;

  // Quantities
  quantity: number;
  paidQuantity: number;
  unpaidQuantity: number;

  // Card pricing breakdown
  unitPrice: number;
  subtotal: number;
  discountAmount: number;
  taxableAmount: number;
  taxAmount: number;
  totalWithTax: number;
  /** Per-unit total including tax (for split by item) */
  unitTotalWithTax: number;

  // Cash pricing breakdown
  cashUnitPrice: number;
  cashSubtotal: number;
  cashDiscountAmount: number;
  cashTaxableAmount: number;
  cashTaxAmount: number;
  cashTotalWithTax: number;
  /** Per-unit cash total including tax */
  cashUnitTotalWithTax: number;

  // Outstanding amounts (unpaid portion)
  outstandingSubtotal: number;
  outstandingTax: number;
  outstandingTotal: number;
  cashOutstandingSubtotal: number;
  cashOutstandingTax: number;
  cashOutstandingTotal: number;

  // Tax info
  taxCategory: string;
  taxRate: number;
  isTaxExempt: boolean;
}

/**
 * Extended calculation result with per-item breakdown
 */
export interface OrderCalculationResult extends OrderTotals {
  items: ItemCalculationDetail[];
  calculatedAt: string; // ISO timestamp
  isOfflineCalculation: boolean;
}

// ============================================================================
// PAYMENT PREVIEW TYPES
// ============================================================================

export type PaymentPreviewType =
  | "full" // Full payment (card or cash)
  | "split_even" // Split evenly among N people
  | "split_by_item" // Pay for specific items
  | "custom_amount"; // Pay a custom amount

export type PaymentMethod = "card" | "cash";

/**
 * Input parameters for payment preview calculation
 */
export interface PaymentPreviewInput {
  type: PaymentPreviewType;
  paymentMethod: PaymentMethod;

  /** For split_even: number of people splitting */
  splitCount?: number;
  /** For split_even: 1-based index of this split */
  splitIndex?: number;

  /** For split_by_item: which items and quantities to pay for */
  itemAllocations?: {
    itemId: string;
    dbOrderItemId?: string;
    quantity: number;
  }[];

  /** For custom_amount: the specific amount to pay */
  customAmount?: number;

  /** Optional tip amount */
  tipAmount?: number;

  /** For cash: amount tendered */
  amountTendered?: number;
}

/**
 * Result of payment preview calculation
 */
export interface PaymentPreviewResult {
  // Amount to charge
  amountToCharge: number;
  tipAmount: number;
  totalToCollect: number;

  // For cash payments
  changeToGive: number;

  // What items this payment covers
  itemsCovered: {
    itemId: string;
    dbOrderItemId?: string;
    name: string;
    quantity: number;
    amount: number;
  }[];

  // Post-payment state
  orderAmountPaidAfter: number;
  orderAmountDueAfter: number;
  orderFullyPaidAfter: boolean;

  // Validation
  isValid: boolean;
  validationErrors: string[];

  // Source tracking
  source: "local" | "backend";
  backendValidated: boolean;
}

/**
 * Result from previewPayment service call
 */
export interface ValidatePaymentResult {
  isValid: boolean;
  localPreview: PaymentPreviewResult;
  backendValidation?: {
    valid: boolean;
    errors: string[];
    suggestedAmount?: number;
  };
  finalAmount: number;
  discrepancy: number;
}

// ============================================================================
// ITEM PAYMENT ALLOCATION TYPES
// ============================================================================

/**
 * Allocation for marking items as paid after a payment
 */
export interface ItemPaymentAllocation {
  itemId: string;
  dbOrderItemId?: string;
  quantityPaid: number;
  amountPaid: number;
}

// ============================================================================
// SPLIT PAYMENT TYPES
// ============================================================================

/**
 * Result of even split calculation
 */
export interface EvenSplitResult {
  /** Amount per person (for all but last) */
  perPerson: number;
  /** Amount for last person (handles rounding) */
  lastPerson: number;
  /** Array of amounts for each person */
  amounts: number[];
}

/**
 * Result of dual price split calculation
 */
export interface DualPriceSplitResult {
  card: EvenSplitResult;
  cash: EvenSplitResult;
}

// ============================================================================
// CALCULATION CACHE TYPES
// ============================================================================

/**
 * Single cache entry for order calculation
 */
export interface CalculationCacheEntry {
  orderId: string;
  result: OrderCalculationResult;
  inputHash: string;
  timestamp: number;
}

/**
 * Cache configuration
 */
export interface CalculationCacheConfig {
  maxEntries: number;
  ttlMs: number;
}

// ============================================================================
// PAID STATUS TYPES
// ============================================================================

export type PaidStatus = "Paid" | "Partial" | "Pending" | "Unpaid";

// ============================================================================
// SERVICE OPTIONS TYPES
// ============================================================================

/**
 * Options for payment preview service
 */
export interface PreviewPaymentOptions {
  orderId: string;
  dbOrderId?: string;
  input: PaymentPreviewInput;
  calculationInput: OrderCalculationInput;
  amountPaidSoFar: number;
  /** If true, skip backend validation even when online */
  localOnly?: boolean;
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

/**
 * Payment record for calculations
 */
export interface PaymentForCalculation {
  amount: number;
  isVoided?: boolean;
  isCashPriced?: boolean;
  cashSavings?: number;
}

/**
 * Minimal item data needed for discount distribution
 */
export interface ItemForDiscountDistribution {
  id: string;
  price: number;
  quantity: number;
  is_voided?: boolean;
  originalPrice?: number;
  cashPrice?: number;
  customizations?: CartItem["customizations"];
  discount_amount?: number;
  discount_cash_amount?: number;
  subtotal?: number;
  cashSubtotal?: number;
}
