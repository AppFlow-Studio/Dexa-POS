/**
 * Order Calculator - Pure Calculation Functions
 *
 * This module contains ALL order calculation logic as pure functions.
 * These functions have NO side effects and are completely deterministic.
 *
 * CRITICAL: This is the SINGLE SOURCE OF TRUTH for order calculations.
 * Used by: store, payment preview, offline mode, tests
 */

import { CartItem } from "@/lib/types";
import {
  DualPriceSplitResult,
  EvenSplitResult,
  ItemCalculationDetail,
  ItemPaymentAllocation,
  OrderCalculationInput,
  OrderCalculationResult,
  OrderTotals,
  PaidStatus,
  PaymentForCalculation,
  PaymentPreviewInput,
  PaymentPreviewResult,
} from "@/types/order-calculations";

// ============================================================================
// CALCULATION CACHE - TTL-based memoization for performance
// ============================================================================

interface CacheEntry {
  result: OrderTotals;
  timestamp: number;
}

const calculationCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 2000; // 2 seconds - covers rapid UI updates
const MAX_CACHE_SIZE = 20; // Limit memory usage

/**
 * Clear the calculation cache.
 * Call when tax rates change or on critical actions like payment.
 */
export function invalidateCalculationCache(): void {
  calculationCache.clear();
}

/**
 * Prune expired entries from cache.
 * Called automatically during cache operations.
 */
function pruneCache(): void {
  const now = Date.now();
  for (const [key, entry] of calculationCache) {
    if (now - entry.timestamp > CACHE_TTL_MS * 2) {
      calculationCache.delete(key);
    }
  }
}

// ============================================================================
// ROUNDING UTILITY - Matches PostgreSQL ROUND(x, 2)
// ============================================================================

/**
 * Round to 2 decimal places matching PostgreSQL's rounding behavior.
 * Uses Math.round with EPSILON to handle floating point edge cases.
 *
 * CRITICAL: All monetary calculations MUST use this function.
 *
 * @example
 * round2(10.005) // 10.01 (matches PostgreSQL)
 * round2(0.1 + 0.2) // 0.30 (handles floating point)
 */
export function round2(num: number): number {
  // console.log('[round2] num', num);
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

// ============================================================================
// ITEM-LEVEL CALCULATIONS
// ============================================================================

/**
 * Calculate the effective cash price for a single cart item.
 *
 * **Logic:**
 * - Backend-synced items (has db_order_item_id): Returns cashPrice as-is
 *   (backend already stored base + modifiers)
 * - Local items (no db_order_item_id): Calculates base + modifiers
 *
 * Formula for local items: base cash price + size modifier + all modifier options
 *
 * @param item - The cart item
 * @returns The effective unit price using cash pricing (before quantity)
 */
export function calculateItemEffectiveCashPrice(item: CartItem): number {
  // For synced items (from backend), cash_price already includes modifiers
  // Return it directly to avoid double-counting
  if (item.db_order_item_id && item.cashPrice !== undefined && item.cashPrice > 0) {
    // return round2(item.cashPrice);
    let effectivePrice = item.cashPrice ?? 0;
    // if (item.customizations?.modifiers) {
    //   for (const modifierGroup of item.customizations.modifiers) {
    //     for (const option of modifierGroup.options) {
    //       effectivePrice += option.price ?? 0;
    //     }
    //   }
    // }
  
    return round2(effectivePrice);
  }

  // For local items, calculate including modifiers
  // Use originalPrice (base cash price), then cashPrice, then unitPrice as fallback
  let effectivePrice = item.originalPrice ?? item.cashPrice ?? item.unitPrice ?? 0;
  console.log('CalculateItemEffective', effectivePrice)
  // Add size modifier if present
  if (item.customizations?.size?.priceModifier) {
    effectivePrice += item.customizations.size.priceModifier;
  }

  // Add all modifier options
  if (item.customizations?.modifiers) {
    for (const modifierGroup of item.customizations.modifiers) {
      for (const option of modifierGroup.options) {
        effectivePrice += option.price ?? 0;
      }
    }
  }

  return round2(effectivePrice);
}

/**
 * Calculate tax for a single item given its taxable amount and tax rate.
 */
export function calculateItemTax(
  taxableAmount: number,
  taxRatePercent: number,
  isTaxExempt: boolean
): number {
  if (isTaxExempt || taxRatePercent <= 0) return 0;
  return round2(taxableAmount * (taxRatePercent / 100));
}

// ============================================================================
// PAID STATUS CALCULATION
// ============================================================================

/**
 * Calculate paid_status purely from payments array.
 * This is the single source of truth for payment status.
 *
 * @param payments - Array of payments (may include voided)
 * @param totalAmount - The order's total amount (card price)
 * @returns The calculated paid status
 */
export function calculatePaidStatus(
  payments: PaymentForCalculation[] | undefined,
  totalAmount: number
): PaidStatus {
  const nonVoidedPayments = payments?.filter((p) => !p.isVoided) ?? [];
  const totalPaid = nonVoidedPayments.reduce(
    (sum, p) => sum + (p.amount ?? 0),
    0
  );

  // No payments or zero total paid
  if (totalPaid <= 0 || nonVoidedPayments.length === 0) {
    return "Pending";
  }

  // Fully paid (within 1 cent rounding tolerance)
  if (totalPaid >= totalAmount - 0.01) {
    return "Paid";
  }

  // Has some payments but not fully paid
  return "Partial";
}

// ============================================================================
// DISCOUNT DISTRIBUTION
// ============================================================================

/**
 * Distribute an order-level discount proportionally to individual items.
 * This mirrors the database's discount distribution algorithm exactly.
 *
 * Algorithm:
 * 1. Calculate total order subtotals (card and cash)
 * 2. For each non-voided item, calculate its proportion of the total
 * 3. Distribute discount based on proportion
 * 4. Handle rounding remainder by adding to last item
 *
 * @param items - Cart items to distribute discount across
 * @param totalCardDiscount - Total discount for card pricing
 * @param totalCashDiscount - Total discount for cash pricing (defaults to card)
 * @returns Items with updated discount_amount and discount_cash_amount
 */
export function distributeDiscountToItems(
  items: CartItem[],
  totalCardDiscount: number,
  totalCashDiscount?: number
): CartItem[] {
  const cashDiscount = totalCashDiscount ?? totalCardDiscount;

  // Calculate totals for proportion
  let orderCardSubtotal = 0;
  let orderCashSubtotal = 0;
  const activeItems = items.filter((item) => !item.is_voided);

  for (const item of activeItems) {
    orderCardSubtotal += item.price * item.quantity;
    orderCashSubtotal += calculateItemEffectiveCashPrice(item) * item.quantity;
  }

  // Track distributed amounts for rounding adjustment
  let distributedCard = 0;
  let distributedCash = 0;
  let lastActiveIndex = -1;

  const result = items.map((item, index) => {
    if (item.is_voided) return item;

    lastActiveIndex = index;

    const itemCardSubtotal = item.price * item.quantity;
    const itemCashSubtotal =
      calculateItemEffectiveCashPrice(item) * item.quantity;

    // Calculate proportions
    const cardProportion =
      orderCardSubtotal > 0 ? itemCardSubtotal / orderCardSubtotal : 0;
    const cashProportion =
      orderCashSubtotal > 0 ? itemCashSubtotal / orderCashSubtotal : 0;

    // Calculate discounts
    const itemCardDiscount = round2(totalCardDiscount * cardProportion);
    const itemCashDiscount = round2(cashDiscount * cashProportion);

    distributedCard += itemCardDiscount;
    distributedCash += itemCashDiscount;

    return {
      ...item,
      discount_amount: itemCardDiscount,
      discount_cash_amount: itemCashDiscount,
      subtotal: round2(itemCardSubtotal - itemCardDiscount),
      cashSubtotal: round2(itemCashSubtotal - itemCashDiscount),
    };
  });

  // Handle rounding remainder on last active item
  if (lastActiveIndex >= 0) {
    const cardRemainder = round2(totalCardDiscount - distributedCard);
    const cashRemainder = round2(cashDiscount - distributedCash);

    if (cardRemainder !== 0 || cashRemainder !== 0) {
      const lastItem = result[lastActiveIndex];
      result[lastActiveIndex] = {
        ...lastItem,
        discount_amount: round2(
          (lastItem.discount_amount ?? 0) + cardRemainder
        ),
        discount_cash_amount: round2(
          (lastItem.discount_cash_amount ?? 0) + cashRemainder
        ),
        subtotal: round2(lastItem.subtotal - cardRemainder),
        cashSubtotal: round2(lastItem.cashSubtotal - cashRemainder),
      };
    }
  }

  return result;
}

// ============================================================================
// MAIN CALCULATION FUNCTION - SINGLE-PASS O(n)
// ============================================================================

/**
 * Calculate all order totals in a single pass - PURE FUNCTION.
 *
 * This is the SINGLE SOURCE OF TRUTH for order calculations.
 * Used everywhere: store, payment preview, offline mode, tests.
 *
 * Optimizations:
 * - Single-pass O(n) through items
 * - Pre-calculates per-item data in first pass
 * - Second pass only for items needing tax calculation
 *
 * @param input - OrderCalculationInput with items, discount, taxRates
 * @returns OrderTotals with all calculated values
 */
export function calculateOrderTotals(input: OrderCalculationInput): OrderTotals {
  // =========================================================================
  // CACHE CHECK - Return cached result if valid
  // =========================================================================
  const cacheKey = hashCalculationInput(input);
  const cached = calculationCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.result;
  }

  // =========================================================================
  // CALCULATION - No valid cache, compute result
  // =========================================================================
  const { items, checkDiscount, taxRatesMap, payments = [] } = input;

  // Filter active items once
  const activeItems = items.filter((item) => !item.is_voided);

  // Empty order short-circuit
  if (activeItems.length === 0) {
    return createEmptyTotals();
  }

  // =========================================================================
  // FIRST PASS: Collect all item data
  // =========================================================================

  interface ItemTaxData {
    itemSubtotal: number;
    itemCashSubtotal: number;
    unpaidQty: number;
    unpaidSubtotal: number;
    unpaidCashSubtotal: number;
    taxRateDecimal: number;
    isTaxExempt: boolean;
  }

  let subtotal = 0;
  let itemDiscountsTotal = 0;
  let cashSubtotal = 0;
  const itemsData: ItemTaxData[] = [];

  for (const item of activeItems) {
    // Card price subtotal
    const itemSubtotal = item.price * item.quantity;
    subtotal += itemSubtotal;

    // Item-level discounts (individual item discounts, not check discount)
    if (item.appliedDiscount) {
      itemDiscountsTotal +=
        item.originalPrice * item.appliedDiscount.value * item.quantity;
    }

    // Cash price subtotal
    const effectiveCashPrice = calculateItemEffectiveCashPrice(item);
    console.log("effectiveCashPrice [calculateOrderTotals]", effectiveCashPrice);
    const itemCashSubtotal = effectiveCashPrice * item.quantity;
    cashSubtotal += itemCashSubtotal;

    // Unpaid quantities
    const unpaidQty = item.quantity - (item.paidQuantity ?? 0);
    const unpaidSubtotal = unpaidQty > 0 ? unpaidQty * item.price : 0;
    const unpaidCashSubtotal =
      unpaidQty > 0 ? unpaidQty * effectiveCashPrice : 0;

    // Tax rate
    const taxCategory = item.tax_category ?? "standard";
    const taxRatePercent = taxRatesMap[taxCategory] ?? 0;
    const taxRateDecimal = taxRatePercent / 100;

    itemsData.push({
      itemSubtotal,
      itemCashSubtotal,
      unpaidQty,
      unpaidSubtotal,
      unpaidCashSubtotal,
      taxRateDecimal,
      isTaxExempt: item.is_tax_exempt ?? false,
    });
  }

  // =========================================================================
  // CALCULATE CHECK-LEVEL DISCOUNT
  // =========================================================================

  const subtotalAfterItemDiscounts = subtotal - itemDiscountsTotal;
  let checkDiscountAmount = 0;

  if (checkDiscount) {
    if (checkDiscount.type === "percentage") {
      checkDiscountAmount = subtotalAfterItemDiscounts * checkDiscount.value;
    } else {
      // Fixed amount - can't exceed subtotal
      checkDiscountAmount = Math.min(
        checkDiscount.value,
        subtotalAfterItemDiscounts
      );
    }
  }

  const totalDiscountAmount = round2(itemDiscountsTotal + checkDiscountAmount);

  // =========================================================================
  // SECOND PASS: Calculate taxes and outstanding amounts
  // =========================================================================

  let taxAmount = 0;
  let outstandingSubtotal = 0;
  let outstandingTax = 0;
  let cashTaxAmount = 0;
  let cashOutstandingSubtotal = 0;
  let cashOutstandingTax = 0;

  for (const data of itemsData) {
    if (!data.isTaxExempt && data.taxRateDecimal > 0) {
      // Card price tax
      const itemDiscountProportion =
        subtotal > 0 ? data.itemSubtotal / subtotal : 0;
      const itemDiscountAmount = totalDiscountAmount * itemDiscountProportion;
      const itemTaxableAmount = Math.max(
        0,
        data.itemSubtotal - itemDiscountAmount
      );
      taxAmount += itemTaxableAmount * data.taxRateDecimal;

      // Cash price tax
      const cashDiscountProportion =
        cashSubtotal > 0 ? data.itemCashSubtotal / cashSubtotal : 0;
      const cashItemDiscountAmount =
        totalDiscountAmount * cashDiscountProportion;
      const cashItemTaxableAmount = Math.max(
        0,
        data.itemCashSubtotal - cashItemDiscountAmount
      );
      cashTaxAmount += cashItemTaxableAmount * data.taxRateDecimal;
    }

    // Outstanding calculations
    if (data.unpaidQty > 0) {
      outstandingSubtotal += data.unpaidSubtotal;
      cashOutstandingSubtotal += data.unpaidCashSubtotal;

      if (!data.isTaxExempt && data.taxRateDecimal > 0) {
        // Outstanding card tax
        const outDiscountProp =
          subtotal > 0 ? data.unpaidSubtotal / subtotal : 0;
        const outDiscountAmt = totalDiscountAmount * outDiscountProp;
        const outTaxableAmt = Math.max(0, data.unpaidSubtotal - outDiscountAmt);
        outstandingTax += outTaxableAmt * data.taxRateDecimal;

        // Outstanding cash tax
        const cashOutDiscountProp =
          cashSubtotal > 0 ? data.unpaidCashSubtotal / cashSubtotal : 0;
        const cashOutDiscountAmt = totalDiscountAmount * cashOutDiscountProp;
        const cashOutTaxableAmt = Math.max(
          0,
          data.unpaidCashSubtotal - cashOutDiscountAmt
        );
        cashOutstandingTax += cashOutTaxableAmt * data.taxRateDecimal;
      }
    }
  }

  // =========================================================================
  // ROUND AND CALCULATE TOTALS
  // =========================================================================

  taxAmount = round2(taxAmount);
  outstandingSubtotal = round2(outstandingSubtotal);
  outstandingTax = round2(outstandingTax);
  cashTaxAmount = round2(cashTaxAmount);
  cashOutstandingSubtotal = round2(cashOutstandingSubtotal);
  cashOutstandingTax = round2(cashOutstandingTax);

  // Card total
  const taxableAmount = Math.max(0, subtotal - totalDiscountAmount);
  const totalAmount = round2(taxableAmount + taxAmount);

  // Card outstanding total
  const proportionOutstanding =
    subtotal > 0 ? outstandingSubtotal / subtotal : 0;
  const outstandingDiscount = totalDiscountAmount * proportionOutstanding;
  const outstandingSubtotalAfterDiscount =
    outstandingSubtotal - outstandingDiscount;
  const outstandingTotal = round2(
    outstandingSubtotalAfterDiscount + outstandingTax
  );

  // Cash total
  const cashTaxableAmount = Math.max(0, cashSubtotal - totalDiscountAmount);
  const cashTotalAmount = round2(cashTaxableAmount + cashTaxAmount);

  // Cash outstanding total
  const cashProportionOutstanding =
    cashSubtotal > 0 ? cashOutstandingSubtotal / cashSubtotal : 0;
  const cashOutstandingDiscount =
    totalDiscountAmount * cashProportionOutstanding;
  const cashOutstandingSubtotalAfterDiscount =
    cashOutstandingSubtotal - cashOutstandingDiscount;
  const cashOutstandingTotal = round2(
    cashOutstandingSubtotalAfterDiscount + cashOutstandingTax
  );

  const result: OrderTotals = {
    subtotal: round2(subtotal),
    discount_amount: totalDiscountAmount,
    tax_amount: taxAmount,
    total_amount: totalAmount,
    outstanding_subtotal: outstandingSubtotal,
    outstanding_tax: outstandingTax,
    outstanding_total: outstandingTotal,
    cash_subtotal: round2(cashSubtotal),
    cash_tax_amount: cashTaxAmount,
    cash_total_amount: cashTotalAmount,
    cash_outstanding_subtotal: cashOutstandingSubtotal,
    cash_outstanding_tax: cashOutstandingTax,
    cash_outstanding_total: cashOutstandingTotal,
  };

  // =========================================================================
  // CACHE STORE - Save result for future calls
  // =========================================================================

  // Prune expired entries periodically
  if (calculationCache.size >= MAX_CACHE_SIZE) {
    pruneCache();
  }

  // If still at max after pruning, remove oldest entry
  if (calculationCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = calculationCache.keys().next().value;
    if (oldestKey) calculationCache.delete(oldestKey);
  }

  calculationCache.set(cacheKey, { result, timestamp: Date.now() });

  return result;
}

/**
 * Create empty totals object - used for empty orders
 */
function createEmptyTotals(): OrderTotals {
  return {
    subtotal: 0,
    discount_amount: 0,
    tax_amount: 0,
    total_amount: 0,
    outstanding_subtotal: 0,
    outstanding_tax: 0,
    outstanding_total: 0,
    cash_subtotal: 0,
    cash_tax_amount: 0,
    cash_total_amount: 0,
    cash_outstanding_subtotal: 0,
    cash_outstanding_tax: 0,
    cash_outstanding_total: 0,
  };
}

// ============================================================================
// EXTENDED CALCULATION WITH PER-ITEM BREAKDOWN
// ============================================================================

/**
 * Calculate order totals with detailed per-item breakdown.
 * Used for split payments, auditing, and detailed receipts.
 *
 * @param input - Order calculation input
 * @returns Extended result with item-level details
 */
export function calculateOrderTotalsWithDetails(
  input: OrderCalculationInput
): OrderCalculationResult {
  const totals = calculateOrderTotals(input);
  const { items, taxRatesMap } = input;

  const activeItems = items.filter((item) => !item.is_voided);
  const itemDetails: ItemCalculationDetail[] = [];

  // Calculate total discount for proportional distribution
  const totalDiscount = totals.discount_amount;

  for (const item of activeItems) {
    const cashUnitPrice = calculateItemEffectiveCashPrice(item);
    const taxCategory = item.tax_category ?? "standard";
    const taxRatePercent = taxRatesMap[taxCategory] ?? 0;

    // Calculate subtotals
    const subtotal = item.price * item.quantity;
    const cashSubtotal = cashUnitPrice * item.quantity;

    // Calculate proportional discount
    const proportion = totals.subtotal > 0 ? subtotal / totals.subtotal : 0;
    const discountAmount = round2(totalDiscount * proportion);

    const cashProportion =
      totals.cash_subtotal > 0 ? cashSubtotal / totals.cash_subtotal : 0;
    const cashDiscountAmount = round2(totalDiscount * cashProportion);

    // Calculate taxable amounts
    const taxableAmount = Math.max(0, subtotal - discountAmount);
    const cashTaxableAmount = Math.max(0, cashSubtotal - cashDiscountAmount);

    // Calculate tax
    const taxAmount = calculateItemTax(
      taxableAmount,
      taxRatePercent,
      item.is_tax_exempt ?? false
    );
    const cashTaxAmount = calculateItemTax(
      cashTaxableAmount,
      taxRatePercent,
      item.is_tax_exempt ?? false
    );

    // Calculate totals with tax
    const totalWithTax = round2(taxableAmount + taxAmount);
    const cashTotalWithTax = round2(cashTaxableAmount + cashTaxAmount);

    // Per-unit totals (for split by item)
    const unitTotalWithTax = round2(totalWithTax / item.quantity);
    const cashUnitTotalWithTax = round2(cashTotalWithTax / item.quantity);

    // Outstanding amounts
    const unpaidQuantity = item.quantity - (item.paidQuantity ?? 0);
    const outstandingProportion =
      item.quantity > 0 ? unpaidQuantity / item.quantity : 0;

    const outstandingSubtotal = round2(subtotal * outstandingProportion);
    const outstandingTax = round2(taxAmount * outstandingProportion);
    const outstandingTotal = round2(totalWithTax * outstandingProportion);

    const cashOutstandingSubtotal = round2(
      cashSubtotal * outstandingProportion
    );
    const cashOutstandingTax = round2(cashTaxAmount * outstandingProportion);
    const cashOutstandingTotal = round2(
      cashTotalWithTax * outstandingProportion
    );

    itemDetails.push({
      itemId: item.id,
      dbOrderItemId: item.db_order_item_id,
      menuItemId: item.menuItemId,
      name: item.name,
      quantity: item.quantity,
      paidQuantity: item.paidQuantity ?? 0,
      unpaidQuantity,
      unitPrice: item.price,
      subtotal,
      discountAmount,
      taxableAmount,
      taxAmount,
      totalWithTax,
      unitTotalWithTax,
      cashUnitPrice,
      cashSubtotal,
      cashDiscountAmount,
      cashTaxableAmount,
      cashTaxAmount,
      cashTotalWithTax,
      cashUnitTotalWithTax,
      outstandingSubtotal,
      outstandingTax,
      outstandingTotal,
      cashOutstandingSubtotal,
      cashOutstandingTax,
      cashOutstandingTotal,
      taxCategory,
      taxRate: taxRatePercent,
      isTaxExempt: item.is_tax_exempt ?? false,
    });
  }

  return {
    ...totals,
    items: itemDetails,
    calculatedAt: new Date().toISOString(),
    isOfflineCalculation: true, // Will be updated by caller if validated with backend
  };
}

// ============================================================================
// SPLIT PAYMENT CALCULATIONS
// ============================================================================

/**
 * Calculate even split amounts for N people.
 * Handles rounding to ensure exact total coverage.
 *
 * The last person pays any rounding difference to ensure
 * the sum of all splits equals the total exactly.
 *
 * @param total - Total amount to split
 * @param splitCount - Number of people splitting
 * @returns Split amounts for each person
 */
export function calculateEvenSplit(
  total: number,
  splitCount: number
): EvenSplitResult {
  if (splitCount <= 0) {
    return { perPerson: total, lastPerson: total, amounts: [total] };
  }

  if (splitCount === 1) {
    return { perPerson: total, lastPerson: total, amounts: [total] };
  }

  // Calculate base amount per person (floor to avoid overpaying)
  const perPerson = Math.floor((total / splitCount) * 100) / 100;

  // Calculate what the first N-1 people pay
  const sumOfFirst = round2(perPerson * (splitCount - 1));

  // Last person pays the remainder
  const lastPerson = round2(total - sumOfFirst);

  // Build amounts array
  const amounts: number[] = [];
  for (let i = 0; i < splitCount - 1; i++) {
    amounts.push(perPerson);
  }
  amounts.push(lastPerson);

  return { perPerson, lastPerson, amounts };
}

/**
 * Calculate split amounts for both card and cash pricing.
 * Used when displaying dual pricing during split payments.
 *
 * @param cardTotal - Card price total
 * @param cashTotal - Cash price total
 * @param splitCount - Number of people splitting
 * @returns Split results for both pricing modes
 */
export function calculateDualPriceSplit(
  cardTotal: number,
  cashTotal: number,
  splitCount: number
): DualPriceSplitResult {
  return {
    card: calculateEvenSplit(cardTotal, splitCount),
    cash: calculateEvenSplit(cashTotal, splitCount),
  };
}

// ============================================================================
// PAYMENT PREVIEW CALCULATION
// ============================================================================

/**
 * Calculate payment preview for various payment types.
 * This is a local-only calculation - validation with backend happens separately.
 *
 * @param totals - Current order totals
 * @param amountPaidSoFar - Total amount already paid
 * @param input - Payment preview parameters
 * @param itemDetails - Optional item details for split by item
 * @returns Payment preview result
 */
export function calculatePaymentPreview(
  totals: OrderTotals,
  amountPaidSoFar: number,
  input: PaymentPreviewInput,
  itemDetails?: ItemCalculationDetail[]
): PaymentPreviewResult {
  const errors: string[] = [];
  let amountToCharge = 0;
  const itemsCovered: PaymentPreviewResult["itemsCovered"] = [];

  const isCash = input.paymentMethod === "cash";
  const totalAmount = isCash ? totals.cash_total_amount : totals.total_amount;
  const outstandingAmount = isCash
    ? totals.cash_outstanding_total
    : totals.outstanding_total;

  switch (input.type) {
    case "full":
      amountToCharge = outstandingAmount;
      break;

    case "split_even":
      if (!input.splitCount || input.splitCount < 2) {
        errors.push("Split count must be at least 2");
        break;
      }
      const split = calculateEvenSplit(outstandingAmount, input.splitCount);
      const index = (input.splitIndex ?? 1) - 1; // Convert 1-based to 0-based
      amountToCharge = split.amounts[index] ?? split.perPerson;
      break;

    case "split_by_item":
      if (!input.itemAllocations || input.itemAllocations.length === 0) {
        errors.push("No items selected for payment");
        break;
      }
      if (!itemDetails) {
        errors.push("Item details required for split by item");
        break;
      }

      for (const alloc of input.itemAllocations) {
        const itemDetail = itemDetails.find((i) => i.itemId === alloc.itemId);
        if (!itemDetail) {
          errors.push(`Item ${alloc.itemId} not found`);
          continue;
        }
        if (alloc.quantity > itemDetail.unpaidQuantity) {
          errors.push(
            `Cannot pay for ${alloc.quantity} of ${itemDetail.name} - only ${itemDetail.unpaidQuantity} unpaid`
          );
          continue;
        }

        const perUnitAmount = isCash
          ? itemDetail.cashUnitTotalWithTax
          : itemDetail.unitTotalWithTax;
        const itemAmount = round2(perUnitAmount * alloc.quantity);

        amountToCharge += itemAmount;
        itemsCovered.push({
          itemId: alloc.itemId,
          dbOrderItemId: alloc.dbOrderItemId,
          name: itemDetail.name,
          quantity: alloc.quantity,
          amount: itemAmount,
        });
      }
      break;

    case "custom_amount":
      if (!input.customAmount || input.customAmount <= 0) {
        errors.push("Custom amount must be greater than 0");
        break;
      }
      if (input.customAmount > outstandingAmount + 0.01) {
        // Allow 1 cent tolerance
        errors.push(
          `Custom amount ${input.customAmount} exceeds outstanding ${outstandingAmount}`
        );
        break;
      }
      amountToCharge = input.customAmount;
      break;
  }

  const tipAmount = input.tipAmount ?? 0;
  const totalToCollect = round2(amountToCharge + tipAmount);

  // Change calculation for cash
  let changeToGive = 0;
  if (isCash && input.amountTendered) {
    if (input.amountTendered < totalToCollect) {
      errors.push(
        `Amount tendered ${input.amountTendered} is less than total ${totalToCollect}`
      );
    } else {
      changeToGive = round2(input.amountTendered - totalToCollect);
    }
  }

  // Post-payment state
  const orderAmountPaidAfter = round2(amountPaidSoFar + amountToCharge);
  const orderAmountDueAfter = round2(
    Math.max(0, totalAmount - orderAmountPaidAfter)
  );
  const orderFullyPaidAfter = orderAmountDueAfter < 0.01;

  return {
    amountToCharge: round2(amountToCharge),
    tipAmount,
    totalToCollect,
    changeToGive,
    itemsCovered,
    orderAmountPaidAfter,
    orderAmountDueAfter,
    orderFullyPaidAfter,
    isValid: errors.length === 0,
    validationErrors: errors,
    source: "local",
    backendValidated: false,
  };
}

// ============================================================================
// MARK ITEMS PAID UTILITY
// ============================================================================

/**
 * Update paidQuantity on items after a payment.
 * Returns new items array with updated paidQuantity fields.
 *
 * @param items - Current cart items
 * @param allocations - What was paid
 * @returns New items array with updated paidQuantity
 */
export function applyPaymentToItems(
  items: CartItem[],
  allocations: ItemPaymentAllocation[]
): CartItem[] {
  const allocationMap = new Map(allocations.map((a) => [a.itemId, a]));

  return items.map((item) => {
    const allocation = allocationMap.get(item.id);
    if (!allocation) return item;

    const newPaidQuantity = Math.min(
      item.quantity,
      (item.paidQuantity ?? 0) + allocation.quantityPaid
    );

    return {
      ...item,
      paidQuantity: newPaidQuantity,
      paymentId:
        allocation.quantityPaid > 0
          ? `payment_${Date.now()}`
          : item.paymentId,
    };
  });
}

// ============================================================================
// CACHE UTILITIES
// ============================================================================

/**
 * Generate a hash for calculation input to detect changes.
 * Used for cache invalidation.
 *
 * @param input - Order calculation input
 * @returns String hash of the input
 */
export function hashCalculationInput(input: OrderCalculationInput): string {
  const key = {
    items: input.items.map((i) => ({
      id: i.id,
      price: i.price,
      quantity: i.quantity,
      paidQuantity: i.paidQuantity,
      is_voided: i.is_voided,
      tax_category: i.tax_category,
      is_tax_exempt: i.is_tax_exempt,
      appliedDiscount: i.appliedDiscount?.id,
    })),
    discount: input.checkDiscount
      ? {
          id: input.checkDiscount.id,
          type: input.checkDiscount.type,
          value: input.checkDiscount.value,
        }
      : null,
    // Don't include taxRatesMap in hash - it rarely changes
  };
  return JSON.stringify(key);
}

// ============================================================================
// LEGACY COMPATIBILITY
// ============================================================================

/**
 * Legacy function name for backward compatibility.
 * @deprecated Use calculatePaidStatus instead
 */
export const calculatePaidStatusFromPayments = calculatePaidStatus;
