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
import type { ServiceChargeRule } from "@/stores/useServiceChargeRulesStore";

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
  /**
   * Keep item-level unpaid quantities authoritative even when historical
   * payments exceed the current hydrated total. Used while a paid check is
   * explicitly reopened for ordering.
   */
  preserveItemLevelOutstanding?: boolean;
  /** Optional cash discount rate for dual pricing (default uses store settings) */
  cashDiscountRate?: number;

  // ---- Service Charge inputs ----
  /** Resolved active rule for the current location (null = no auto-grat). */
  serviceChargeRule?: ServiceChargeRule | null;
  /** Party size from the table session (null = no dine-in session). */
  partySize?: number | null;
  /** Order type — only `dine_in` qualifies for auto-apply in v1. */
  orderType?: string | null;
  /**
   * Rate snapshotted on the order at first apply. When set, drives recompute
   * for the order's lifetime — live rule changes won't retroactively alter rate.
   */
  snapshottedRate?: number | null;
  snapshottedAppliesOn?: "pre_discount" | "post_discount" | null;
  snapshottedName?: string | null;
  /**
   * Wave D — when the order has orders.service_charge_is_manual = true, the
   * server is authoritative for SC. Pass the override amount here so totals
   * (total_amount / outstanding_total / cash equivalents) include the manual
   * value instead of recomputing from the rule. Bypasses rule eligibility.
   */
  manualServiceCharge?: number | null;
  /**
   * Whether the manually-overridden SC (manualServiceCharge) should be taxed.
   * Snapshotted on the order as orders.service_charge_is_taxable. When true,
   * SC tax is added to both card and cash totals using the standard tax rate —
   * matching the server's calculate_order_totals_fast taxability fallback for
   * overrides (where service_charge_rule_id is null). Ignored unless
   * manualServiceCharge is set.
   */
  manualServiceChargeTaxable?: boolean | null;
  /**
   * Wave D follow-up — server-confirmed SC fallback. Used when local rule
   * eligibility fails (rules store not loaded, partySize unresolvable) but
   * the server has already applied a rule-derived SC to the order. Without
   * this, outstanding-cash drops SC entirely on the cashier prompt — the
   * customer sees $7.43 on CFD but cashier collects $5.72 (under-collection
   * surfaced by Latte / Table T-1 / order S6-0015 on staging 2026-05-29).
   * Unlike manualServiceCharge, this is a *fallback*: rule eligibility
   * still wins when it succeeds locally.
   */
  serverConfirmedServiceCharge?: number | null;
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

  // ---- Service Charge ----
  /** Flat $ added to both card and cash totals (same value, matching backend math). */
  service_charge: number;
  cash_service_charge: number;
  /**
   * Remaining (unpaid) SC, proportional to the unpaid subtotal portion. Equals
   * service_charge when nothing is paid; folded into outstanding_total. Lets the
   * breakdown UI show remaining SC so the rows reconcile to balance due.
   */
  outstanding_service_charge: number;
  cash_outstanding_service_charge: number;
  /** Snapshot label for display ("" when no SC applies). */
  service_charge_name: string;
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
  /** Amount refunded against this payment, in the payment's own currency. */
  refundedAmount?: number;
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
