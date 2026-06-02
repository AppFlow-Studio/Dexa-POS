/**
 * Order Calculator - Pure Calculation Functions
 *
 * This module contains ALL order calculation logic as pure functions.
 * These functions have NO side effects and are completely deterministic.
 *
 * CRITICAL: This is the SINGLE SOURCE OF TRUTH for order calculations.
 * Used by: store, payment preview, offline mode, tests
 */

import { isServiceChargeEnabled } from '@/lib/serviceCharge'
import { CartItem } from '@/lib/types'
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
  PaymentPreviewResult
} from '@/types/order-calculations'
import { round2 as round2FromMoney } from '@/utils/money'
import Decimal from 'decimal.js'

// Re-export the correct round2 implementation (decimal.js, PostgreSQL-compatible)
// Fixes: replaces broken Math.round + Number.EPSILON version
export const round2 = round2FromMoney

// ============================================================================
// CALCULATION CACHE - TTL-based memoization for performance
// ============================================================================

interface CacheEntry {
  result: OrderTotals
  timestamp: number
}

const calculationCache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 2000 // 2 seconds - covers rapid UI updates
const MAX_CACHE_SIZE = 20 // Limit memory usage

/**
 * Clear the calculation cache.
 * Call when tax rates change or on critical actions like payment.
 */
export function invalidateCalculationCache (): void {
  calculationCache.clear()
}

/**
 * Coalesced cache invalidation — batches multiple calls within the same microtask.
 * Use for broadcast handlers and batch sync paths where multiple items may trigger
 * invalidation in rapid succession.
 */
let _cacheInvalidationScheduled = false
export function scheduleCalculationCacheInvalidation (): void {
  if (_cacheInvalidationScheduled) return
  _cacheInvalidationScheduled = true
  queueMicrotask(() => {
    _cacheInvalidationScheduled = false
    invalidateCalculationCache()
  })
}

/**
 * Prune expired entries from cache.
 * Called automatically during cache operations.
 */
function pruneCache (): void {
  const now = Date.now()
  for (const [key, entry] of calculationCache) {
    if (now - entry.timestamp > CACHE_TTL_MS * 2) {
      calculationCache.delete(key)
    }
  }
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
// export function calculateItemEffectiveCashPrice(item: CartItem): number {
//   // For synced items (from backend), cash_price already includes modifiers
//   // Return it directly to avoid double-counting
//   // TODO: This is a temporary fix to ensure the correct price is used for synced items
//   if (item.db_order_item_id && item.baseCashPrice !== undefined && item.originalPrice > 0) {
//     // return round2(item.originalPrice);
//     let effectivePrice = item.baseCashPrice ?? 0;
//     if (item.customizations?.modifiers) {
//       for (const modifierGroup of item.customizations.modifiers) {
//         for (const option of modifierGroup.options) {
//           effectivePrice += option.price ?? 0;
//         }
//       }
//     }

//     return round2(effectivePrice);
//   }

//   // For local items, calculate including modifiers
//   // Use originalPrice (base cash price), then cashPrice, then unitPrice as fallback
//   let effectivePrice = item.baseCashPrice ?? item.cashPrice ?? item.unitPrice ?? 0;
//   console.log('CalculateItemEffective Cash Price', effectivePrice)
//   // Add size modifier if present
//   if (item.customizations?.size?.priceModifier) {
//     effectivePrice += item.customizations.size.priceModifier;
//   }

//   // Add all modifier options
//   if (item.customizations?.modifiers) {
//     for (const modifierGroup of item.customizations.modifiers) {
//       for (const option of modifierGroup.options) {
//         effectivePrice += option.price ?? 0;
//       }
//     }
//   }
//   console.log('CalculateItemEffective Cash Price After Modifiers', effectivePrice)
//   return round2(effectivePrice);
// }
export function calculateItemEffectiveCashPrice (item: CartItem): number {
  let effectivePrice = new Decimal(item.baseCashPrice ?? item.unitPrice ?? 0)

  if (item.customizations?.size?.priceModifier) {
    effectivePrice = effectivePrice.plus(item.customizations.size.priceModifier)
  }

  if (item.customizations?.modifiers) {
    for (const modifierGroup of item.customizations.modifiers) {
      for (const option of modifierGroup.options) {
        effectivePrice = effectivePrice.plus(option.price ?? 0)
      }
    }
  }

  return effectivePrice.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber()
}

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
// export function calculateItemEffectiveCardPrice(item: CartItem): number {
//   // For synced items (from backend), cash_price already includes modifiers
//   // Return it directly to avoid double-counting
//   if (item.db_order_item_id && item.baseCardPrice !== undefined && item.unitPrice > 0) {
//     // return round2(item.cashPrice);
//     let effectivePrice = item.baseCardPrice ?? 0;
//     if (item.customizations?.modifiers) {
//       for (const modifierGroup of item.customizations.modifiers) {
//         for (const option of modifierGroup.options) {
//           effectivePrice += option.price ?? 0;
//         }
//       }
//     }

//     return round2(effectivePrice);
//   }

//   // For local items, calculate including modifiers
//   // Use originalPrice (base cash price), then cashPrice, then unitPrice as fallback
//   let effectivePrice = item.baseCardPrice ?? item.cashPrice ?? item.unitPrice ?? 0;
//   console.log('CalculateItemEffective', effectivePrice)
//   // Add size modifier if present
//   if (item.customizations?.size?.priceModifier) {
//     effectivePrice += item.customizations.size.priceModifier;
//   }

//   console.log('[CalculateItemEffective]', item.customizations?.modifiers)
//   // Add all modifier options
//   if (item.customizations?.modifiers) {
//     for (const modifierGroup of item.customizations.modifiers) {
//       for (const option of modifierGroup.options) {
//         effectivePrice += option.price ?? 0;
//       }
//     }
//   }
//   console.log('CalculateItemEffective Card Price After Modifiers', effectivePrice)
//   return round2(effectivePrice);
// }
// Use Decimal for modifier calculations too
export function calculateItemEffectiveCardPrice (item: CartItem): number {
  let effectivePrice = new Decimal(item.baseCardPrice ?? item.unitPrice ?? 0)

  if (item.customizations?.size?.priceModifier) {
    effectivePrice = effectivePrice.plus(item.customizations.size.priceModifier)
  }

  if (item.customizations?.modifiers) {
    for (const modifierGroup of item.customizations.modifiers) {
      for (const option of modifierGroup.options) {
        effectivePrice = effectivePrice.plus(option.price ?? 0)
      }
    }
  }

  return effectivePrice.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber()
}

/**
 * Calculate tax for a single item given its taxable amount and tax rate.
 */
export function calculateItemTax (
  taxableAmount: number,
  taxRatePercent: number,
  isTaxExempt: boolean
): number {
  if (isTaxExempt || taxRatePercent <= 0) return 0
  return round2(taxableAmount * (taxRatePercent / 100))
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
export function calculatePaidStatus (
  payments: PaymentForCalculation[] | undefined,
  totalAmount: number
): PaidStatus {
  const nonVoidedPayments = payments?.filter(p => !p.isVoided) ?? []
  const totalPaid = nonVoidedPayments.reduce((sum, p) => {
    // For cash-priced payments, add back cashSavings to get card-equivalent amount
    // so comparison against card totalAmount is apples-to-apples
    const cardEquivalent =
      p.isCashPriced && p.cashSavings
        ? (p.amount ?? 0) + p.cashSavings
        : p.amount ?? 0
    // Refund subtraction must scale by the cash↔card ratio: refundedAmount is
    // stored in the payment's own currency, so for a fully-refunded cash
    // payment we have to remove the entire card-equivalent (cash + savings),
    // not just the cash portion — otherwise the cashSavings residue is left
    // counted as "paid" and the order misreads as fully settled. Mirrors the
    // proportional refund handling in calculateOrderTotals.
    const refunded = p.refundedAmount ?? 0
    const amount = p.amount ?? 0
    const cardEquivalentRefunded =
      amount > 0 ? (cardEquivalent * refunded) / amount : refunded
    return sum + (cardEquivalent - cardEquivalentRefunded)
  }, 0)

  // No payments or zero total paid
  if (totalPaid <= 0 || nonVoidedPayments.length === 0) {
    return 'Pending'
  }

  // Fully paid
  if (totalPaid >= totalAmount - 0.01) {
    return 'Paid'
  }

  // Has some payments but not fully paid
  return 'Partial'
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
export function distributeDiscountToItems (
  items: CartItem[],
  totalCardDiscount: number,
  totalCashDiscount?: number
): CartItem[] {
  const cashDiscount = totalCashDiscount ?? totalCardDiscount
  // Calculate totals for proportion
  let orderCardSubtotal = 0
  let orderCashSubtotal = 0
  const activeItems = items.filter(item => !item.is_voided && !item.isDraft)

  for (const item of activeItems) {
    orderCardSubtotal += item.price * item.quantity
    orderCashSubtotal += item.cashPrice * item.quantity
  }

  // Track distributed amounts for rounding adjustment
  let distributedCard = 0
  let distributedCash = 0
  let lastActiveIndex = -1

  const result = items.map((item, index) => {
    if (item.is_voided) return item

    lastActiveIndex = index

    const itemCardSubtotal = item.price * item.quantity
    const itemCashSubtotal =
      calculateItemEffectiveCashPrice(item) * item.quantity

    // Calculate proportions
    const cardProportion =
      orderCardSubtotal > 0 ? itemCardSubtotal / orderCardSubtotal : 0
    const cashProportion =
      orderCashSubtotal > 0 ? itemCashSubtotal / orderCashSubtotal : 0

    // Calculate discounts
    const itemCardDiscount = round2(totalCardDiscount * cardProportion)
    const itemCashDiscount = round2(cashDiscount * cashProportion)

    distributedCard += itemCardDiscount
    distributedCash += itemCashDiscount

    return {
      ...item,
      discount_amount: itemCardDiscount,
      discount_cash_amount: itemCashDiscount,
      subtotal: round2(itemCardSubtotal - itemCardDiscount),
      cashSubtotal: round2(itemCashSubtotal - itemCashDiscount)
    }
  })

  // Handle rounding remainder on last active item
  if (lastActiveIndex >= 0) {
    const cardRemainder = round2(totalCardDiscount - distributedCard)
    const cashRemainder = round2(cashDiscount - distributedCash)

    if (cardRemainder !== 0 || cashRemainder !== 0) {
      const lastItem = result[lastActiveIndex]
      result[lastActiveIndex] = {
        ...lastItem,
        discount_amount: round2(
          (lastItem.discount_amount ?? 0) + cardRemainder
        ),
        discount_cash_amount: round2(
          (lastItem.discount_cash_amount ?? 0) + cashRemainder
        ),
        subtotal: round2(lastItem.subtotal - cardRemainder),
        cashSubtotal: round2(lastItem.cashSubtotal - cashRemainder)
      }
    }
  }

  return result
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
export function calculateOrderTotals (
  input: OrderCalculationInput
): OrderTotals {
  // CACHE CHECK - Return cached result if valid
  const cacheKey = hashCalculationInput(input)
  const cached = calculationCache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.result
  }

  const {
    items,
    checkDiscount,
    taxRatesMap,
    payments = [],
    preserveItemLevelOutstanding = false,
    serviceChargeRule,
    partySize,
    orderType,
    snapshottedRate,
    snapshottedAppliesOn,
    snapshottedName
  } = input
  const activeItems = items.filter(item => !item.is_voided && !item.isDraft)

  if (activeItems.length === 0) {
    return createEmptyTotals()
  }

  // =========================================================================
  // FIRST PASS: Calculate gross subtotals (using Decimal for exact arithmetic)
  // =========================================================================

  let grossCardSubtotal = new Decimal(0)
  let grossCashSubtotal = new Decimal(0)

  const itemData: Array<{
    item: CartItem
    cardSubtotal: Decimal
    cashSubtotal: Decimal
    taxRatePercent: number
    isTaxExempt: boolean
  }> = []

  for (const item of activeItems) {
    const effectiveCardPrice = calculateItemEffectiveCardPrice(item)
    const effectiveCashPrice = calculateItemEffectiveCashPrice(item)

    const cardSubtotal = new Decimal(effectiveCardPrice).times(item.quantity)
    const cashSubtotal = new Decimal(effectiveCashPrice).times(item.quantity)

    grossCardSubtotal = grossCardSubtotal.plus(cardSubtotal)
    grossCashSubtotal = grossCashSubtotal.plus(cashSubtotal)

    const taxCategory = item.tax_category ?? 'standard'
    const taxRatePercent = taxRatesMap[taxCategory] ?? 0

    itemData.push({
      item,
      cardSubtotal,
      cashSubtotal,
      taxRatePercent: item.is_tax_exempt ? 0 : taxRatePercent,
      isTaxExempt: item.is_tax_exempt ?? false
    })
  }

  // =========================================================================
  // DISCOUNT CALCULATION (matching recalculate_order_discount)
  // =========================================================================

  let totalDiscountAmount = new Decimal(0)
  let totalCashDiscountAmount = new Decimal(0)

  if (checkDiscount) {
    if (checkDiscount.type === 'percentage') {
      // value is already a decimal fraction (e.g., 0.05 for 5%)
      totalDiscountAmount = grossCardSubtotal
        .times(checkDiscount.value)
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
      // Apply same percentage to cash subtotal (matching SQL calculate_item_totals)
      totalCashDiscountAmount = grossCashSubtotal
        .times(checkDiscount.value)
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    } else {
      // Fixed: can't exceed subtotal
      totalDiscountAmount = Decimal.min(
        new Decimal(checkDiscount.value),
        grossCardSubtotal
      ).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
      // Scale fixed discount proportionally for cash (matching SQL ratio: cash_price / card_price)
      totalCashDiscountAmount = grossCardSubtotal.gt(0)
        ? Decimal.min(
            totalDiscountAmount
              .times(grossCashSubtotal)
              .dividedBy(grossCardSubtotal),
            grossCashSubtotal
          ).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
        : totalDiscountAmount
    }
  }

  // =========================================================================
  // DISTRIBUTE DISCOUNT TO ITEMS (matching backend's proportional distribution)
  // =========================================================================

  let distributedDiscount = new Decimal(0)
  let distributedCashDiscount = new Decimal(0)
  const itemDiscounts: Decimal[] = []
  const itemCashDiscounts: Decimal[] = []

  for (let i = 0; i < itemData.length; i++) {
    const data = itemData[i]

    // PostgreSQL: v_item_proportion := v_item.item_gross_subtotal / v_applicable_subtotal
    // PostgreSQL: v_item_discount_amount := ROUND(v_new_calculated_amount * v_item_proportion, 2)
    const cardProportion = grossCardSubtotal.isZero()
      ? new Decimal(0)
      : data.cardSubtotal.dividedBy(grossCardSubtotal)

    let itemDiscount = totalDiscountAmount
      .times(cardProportion)
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)

    distributedDiscount = distributedDiscount.plus(itemDiscount)
    itemDiscounts.push(itemDiscount)

    // Cash discount: distribute using cash proportions (matching SQL calculate_item_totals)
    const cashProportion = grossCashSubtotal.isZero()
      ? new Decimal(0)
      : data.cashSubtotal.dividedBy(grossCashSubtotal)

    let itemCashDiscount = totalCashDiscountAmount
      .times(cashProportion)
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)

    distributedCashDiscount = distributedCashDiscount.plus(itemCashDiscount)
    itemCashDiscounts.push(itemCashDiscount)
  }

  // CRITICAL: Assign rounding remainder to last item (matching PostgreSQL)
  if (itemData.length > 0) {
    if (!distributedDiscount.equals(totalDiscountAmount)) {
      const remainder = totalDiscountAmount.minus(distributedDiscount)
      itemDiscounts[itemDiscounts.length - 1] =
        itemDiscounts[itemDiscounts.length - 1].plus(remainder)
    }
    if (!distributedCashDiscount.equals(totalCashDiscountAmount)) {
      const cashRemainder = totalCashDiscountAmount.minus(
        distributedCashDiscount
      )
      itemCashDiscounts[itemCashDiscounts.length - 1] =
        itemCashDiscounts[itemCashDiscounts.length - 1].plus(cashRemainder)
    }
  }

  // =========================================================================
  // SECOND PASS: Calculate tax on discounted amounts
  // Per-item: ROUND((itemSubtotal - itemDiscount) * taxRate / 100, 2)
  // =========================================================================

  let totalCardTax = new Decimal(0)
  let totalCashTax = new Decimal(0)
  let netCardSubtotal = new Decimal(0)
  let netCashSubtotal = new Decimal(0)

  // Outstanding tracking
  let outstandingCardSubtotal = new Decimal(0)
  let outstandingCashSubtotal = new Decimal(0)
  let outstandingCardTax = new Decimal(0)
  let outstandingCashTax = new Decimal(0)

  for (let i = 0; i < itemData.length; i++) {
    const data = itemData[i]
    const itemDiscount = itemDiscounts[i]
    const itemCashDiscount = itemCashDiscounts[i]

    // Net subtotals (after discount)
    const itemNetCardSubtotal = data.cardSubtotal.minus(itemDiscount)
    const itemNetCashSubtotal = data.cashSubtotal.minus(itemCashDiscount)

    netCardSubtotal = netCardSubtotal.plus(itemNetCardSubtotal)
    netCashSubtotal = netCashSubtotal.plus(itemNetCashSubtotal)

    // Tax: ROUND(discounted_subtotal * rate / 100, 2) - PER ITEM
    if (!data.isTaxExempt && data.taxRatePercent > 0) {
      const itemCardTax = itemNetCardSubtotal
        .times(data.taxRatePercent)
        .dividedBy(100)
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)

      const itemCashTax = itemNetCashSubtotal
        .times(data.taxRatePercent)
        .dividedBy(100)
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)

      totalCardTax = totalCardTax.plus(itemCardTax)
      totalCashTax = totalCashTax.plus(itemCashTax)

      // Outstanding calculations
      // Account for refunded quantities - refunded items need to be paid again
      // Cap at quantity to prevent over-counting from stale refunded/paid state
      const effectivePaidQty =
        (data.item.paidQuantity ?? 0) - (data.item.refundedQuantity ?? 0)
      const unpaidQty = Math.min(
        data.item.quantity,
        data.item.quantity - effectivePaidQty
      )
      if (unpaidQty > 0) {
        const unpaidProportion = new Decimal(unpaidQty).dividedBy(
          data.item.quantity
        )

        const unpaidCardSubtotal = itemNetCardSubtotal.times(unpaidProportion)
        const unpaidCashSubtotal = itemNetCashSubtotal.times(unpaidProportion)

        outstandingCardSubtotal =
          outstandingCardSubtotal.plus(unpaidCardSubtotal)
        outstandingCashSubtotal =
          outstandingCashSubtotal.plus(unpaidCashSubtotal)

        // Tax on unpaid portion - round per item
        const unpaidCardTax = unpaidCardSubtotal
          .times(data.taxRatePercent)
          .dividedBy(100)
          .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)

        const unpaidCashTax = unpaidCashSubtotal
          .times(data.taxRatePercent)
          .dividedBy(100)
          .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)

        outstandingCardTax = outstandingCardTax.plus(unpaidCardTax)
        outstandingCashTax = outstandingCashTax.plus(unpaidCashTax)
      }
    } else {
      // Tax exempt item - still track outstanding subtotals
      // Account for refunded quantities - refunded items need to be paid again
      // Cap at quantity to prevent over-counting from stale refunded/paid state
      const effectivePaidQty =
        (data.item.paidQuantity ?? 0) - (data.item.refundedQuantity ?? 0)
      const unpaidQty = Math.min(
        data.item.quantity,
        data.item.quantity - effectivePaidQty
      )
      if (unpaidQty > 0) {
        const unpaidProportion = new Decimal(unpaidQty).dividedBy(
          data.item.quantity
        )
        outstandingCardSubtotal = outstandingCardSubtotal.plus(
          itemNetCardSubtotal.times(unpaidProportion)
        )
        outstandingCashSubtotal = outstandingCashSubtotal.plus(
          itemNetCashSubtotal.times(unpaidProportion)
        )
      }
    }
  }

  // =========================================================================
  // SERVICE CHARGE
  // Flat $ folded into both card and cash totals (matches calculate_order_totals_fast).
  // Snapshot rate/name/applies_on take precedence over the live rule, so mid-shift
  // rule edits don't retroactively change an open order's SC.
  // =========================================================================

  let serviceCharge = new Decimal(0)
  let cashServiceCharge = new Decimal(0)
  let serviceChargeName = ''

  const effectiveRate =
    snapshottedRate != null && snapshottedRate > 0
      ? snapshottedRate
      : serviceChargeRule?.rate_percent ?? 0
  const effectiveAppliesOn =
    snapshottedAppliesOn ?? serviceChargeRule?.applies_on ?? 'pre_discount'
  const effectiveName = snapshottedName ?? serviceChargeRule?.name ?? ''

  const ruleEligible =
    isServiceChargeEnabled &&
    serviceChargeRule != null &&
    serviceChargeRule.is_active &&
    serviceChargeRule.auto_apply &&
    effectiveRate > 0 &&
    serviceChargeRule.applies_to_order_types.includes(orderType ?? '') &&
    partySize != null &&
    partySize >= serviceChargeRule.min_party_size

  if (ruleEligible) {
    const cardBase =
      effectiveAppliesOn === 'pre_discount' ? grossCardSubtotal : netCardSubtotal
    serviceCharge = cardBase
      .times(effectiveRate)
      .dividedBy(100)
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)

    // The SC dollar amount is identical for cash and card. Cash pricing only
    // changes the item subtotal; taxable SC is added before the cash tax total.
    cashServiceCharge = serviceCharge

    serviceChargeName = effectiveName

    if (__DEV__ && partySize != null && partySize < serviceChargeRule!.min_party_size) {
      // Invariant: should never reach here per the eligibility check above.
      // Logged in case the eligibility branch is later refactored unsafely.
      console.warn(
        '[service_charge] applied below threshold',
        { partySize, threshold: serviceChargeRule!.min_party_size }
      )
    }
  }

  // =========================================================================
  // SERVICE CHARGE TAX (when is_taxable = true)
  // Tax is applied to the SC amount using the weighted effective tax rate.
  // =========================================================================

  let serviceChargeTax = new Decimal(0)
  let cashServiceChargeTax = new Decimal(0)

  if (ruleEligible && serviceChargeRule!.is_taxable) {
    // Resolve the SC tax rate: prefer 'standard', fall back to the first non-zero
    // rate in the map (handles locations where the category key differs from 'standard').
    const rawScTaxRate =
      taxRatesMap['standard'] ??
      Object.values(taxRatesMap).find((r) => r > 0) ??
      0
    const scTaxRate = new Decimal(rawScTaxRate)
    if (scTaxRate.gt(0)) {
      serviceChargeTax = serviceCharge
        .times(scTaxRate)
        .dividedBy(100)
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
      cashServiceChargeTax = cashServiceCharge
        .times(scTaxRate)
        .dividedBy(100)
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
      totalCardTax = totalCardTax.plus(serviceChargeTax)
      totalCashTax = totalCashTax.plus(cashServiceChargeTax)
    }
  }

  // =========================================================================
  // FINAL TOTALS
  // =========================================================================

  const cardTotal = netCardSubtotal.plus(totalCardTax).plus(serviceCharge)
  const cashTotal = netCashSubtotal.plus(totalCashTax).plus(cashServiceCharge)

  // Outstanding SC: proportional to the unpaid portion of the net subtotal.
  // When nothing has been paid yet, outstanding ~= net, so full SC is outstanding.
  const scUnpaidProportion = netCardSubtotal.gt(0)
    ? Decimal.min(outstandingCardSubtotal.div(netCardSubtotal), new Decimal(1))
    : new Decimal(activeItems.length > 0 ? 1 : 0)
  const outstandingServiceCharge = serviceCharge
    .times(scUnpaidProportion)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)

  const cashScUnpaidProportion = netCashSubtotal.gt(0)
    ? Decimal.min(outstandingCashSubtotal.div(netCashSubtotal), new Decimal(1))
    : new Decimal(activeItems.length > 0 ? 1 : 0)
  const outstandingCashServiceCharge = cashServiceCharge
    .times(cashScUnpaidProportion)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
  const outstandingCashServiceChargeTax = cashServiceChargeTax
    .times(cashScUnpaidProportion)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
  const outstandingServiceChargeTax = serviceChargeTax
    .times(scUnpaidProportion)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)

  let outstandingCardTotal = outstandingCardSubtotal
    .plus(outstandingCardTax)
    .plus(outstandingServiceCharge)
    .plus(outstandingServiceChargeTax)
  let outstandingCashTotal = outstandingCashSubtotal
    .plus(outstandingCashTax)
    .plus(outstandingCashServiceCharge)
    .plus(outstandingCashServiceChargeTax)

  // =========================================================================
  // PAYMENT-LEVEL REFUND HANDLING
  // For custom amount refunds that aren't tied to specific items
  // =========================================================================

  if (payments.length > 0) {
    // Calculate effective paid using card-equivalent amounts (matches SQL §10)
    // For cash-priced payments, amount is cash price but cashSavings = original_amount - amount
    // So amount + cashSavings = original_amount = card equivalent
    //
    // Refund subtraction must scale by the same card↔cash ratio: order_payments
    // stores refunded_amount in the payment's own currency (cash for a
    // cash-priced payment). Subtracting that raw cash amount from
    // cardEquivalent leaves the cashSavings residue counted as "paid", which
    // diverges from the backend (it removes the refunded payment's full
    // card-equivalent share). Proportional refund: cardEquiv × (refunded /
    // amount), so a full refund zeros the contribution exactly.
    const effectivePaid = payments
      .filter(p => !p.isVoided && !p.isPreAuth)
      .reduce((sum, p) => {
        const refunded = p.refundedAmount ?? 0
        // Use card-equivalent: for cash-priced payments, add cashSavings to get original_amount
        const cardEquivalentAmount =
          p.isCashPriced && p.cashSavings
            ? new Decimal(p.amount).plus(p.cashSavings)
            : new Decimal(p.amount)
        const cardEquivalentRefunded =
          p.amount > 0
            ? cardEquivalentAmount
                .times(refunded)
                .div(p.amount)
            : new Decimal(refunded)
        return sum.plus(cardEquivalentAmount.minus(cardEquivalentRefunded))
      }, new Decimal(0))

    // Payment-based outstanding = total - effective_paid
    const paymentBasedOutstanding = Decimal.max(
      cardTotal.minus(effectivePaid),
      new Decimal(0)
    )

    // Custom refund balance = payment-based due NOT covered by item-level unpaid (upward adjustment)
    const customRefundBalance = Decimal.max(
      paymentBasedOutstanding.minus(outstandingCardTotal),
      new Decimal(0)
    )
    outstandingCardTotal = outstandingCardTotal.plus(customRefundBalance)
    // This balance is the shared order-level SC (and its tax). Cash and card
    // carry the same flat remainder, so do not dual-price it.
    outstandingCashTotal = outstandingCashTotal.plus(customRefundBalance)

    // Clamping: when payments exceed item-level tracking (e.g., split-evenly doesn't mark items),
    // clamp outstanding down to payment-based remaining (matches SQL §10 lines 796-803)
    if (
      !preserveItemLevelOutstanding &&
      paymentBasedOutstanding.lt(outstandingCardTotal)
    ) {
      if (outstandingCardTotal.gt(0)) {
        outstandingCashTotal = outstandingCashTotal
          .times(paymentBasedOutstanding)
          .div(outstandingCardTotal)
          .toDecimalPlaces(2)
      }
      outstandingCardTotal = paymentBasedOutstanding
    }
  }

  // CACHE STORE - Save result for future calls
  const result: OrderTotals = {
    // Gross subtotals (pre-discount)
    subtotal: grossCardSubtotal.toDecimalPlaces(2).toNumber(),
    cash_subtotal: grossCashSubtotal.toDecimalPlaces(2).toNumber(),

    // Discount
    discount_amount: totalDiscountAmount.toNumber(),
    cash_discount_amount: totalCashDiscountAmount.toNumber(),

    // Net subtotals (post-discount) - these match effective_subtotal in PostgreSQL
    // effective_subtotal: netCardSubtotal.toDecimalPlaces(2).toNumber(),
    // effective_cash_subtotal: netCashSubtotal.toDecimalPlaces(2).toNumber(),

    // Tax
    tax_amount: totalCardTax.toNumber(),
    cash_tax_amount: totalCashTax.toNumber(),

    // Totals
    total_amount: cardTotal.toDecimalPlaces(2).toNumber(),
    cash_total_amount: cashTotal.toDecimalPlaces(2).toNumber(),

    // Outstanding (for payment UI)
    outstanding_subtotal: outstandingCardSubtotal.toDecimalPlaces(2).toNumber(),
    outstanding_tax: outstandingCardTax.toNumber(),
    outstanding_total: outstandingCardTotal.toDecimalPlaces(2).toNumber(),
    cash_outstanding_subtotal: outstandingCashSubtotal
      .toDecimalPlaces(2)
      .toNumber(),
    cash_outstanding_tax: outstandingCashTax.toNumber(),
    cash_outstanding_total: outstandingCashTotal.toDecimalPlaces(2).toNumber(),

    // Service Charge
    service_charge: serviceCharge.toNumber(),
    cash_service_charge: cashServiceCharge.toNumber(),
    service_charge_name: serviceChargeName
  }

  if (calculationCache.size >= MAX_CACHE_SIZE) pruneCache()
  if (calculationCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = calculationCache.keys().next().value
    if (oldestKey) calculationCache.delete(oldestKey)
  }
  calculationCache.set(cacheKey, { result, timestamp: Date.now() })

  return result
}

/**
 * Create empty totals object - used for empty orders
 */
function createEmptyTotals (): OrderTotals {
  return {
    subtotal: 0,
    discount_amount: 0,
    tax_amount: 0,
    total_amount: 0,
    outstanding_subtotal: 0,
    outstanding_tax: 0,
    outstanding_total: 0,
    cash_subtotal: 0,
    cash_discount_amount: 0,
    cash_tax_amount: 0,
    cash_total_amount: 0,
    cash_outstanding_subtotal: 0,
    cash_outstanding_tax: 0,
    cash_outstanding_total: 0,
    service_charge: 0,
    cash_service_charge: 0,
    service_charge_name: ''
  }
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
export function calculateOrderTotalsWithDetails (
  input: OrderCalculationInput
): OrderCalculationResult {
  const totals = calculateOrderTotals(input)
  const { items, taxRatesMap, checkDiscount } = input

  const activeItems = items.filter(item => !item.is_voided && !item.isDraft)
  const itemDetails: ItemCalculationDetail[] = []

  // Calculate total discount for proportional distribution
  const totalDiscount = totals.discount_amount

  // Calculate cash discount using the same logic as calculateOrderTotals
  let totalCashDiscount = 0
  if (checkDiscount) {
    if (checkDiscount.type === 'percentage') {
      // Apply the same percentage to cash subtotal
      totalCashDiscount = totals.cash_subtotal * checkDiscount.value
    } else {
      // For fixed discounts, use the same amount but don't exceed cash subtotal
      totalCashDiscount = Math.min(totalDiscount, totals.cash_subtotal)
    }
  }
  totalCashDiscount = round2(totalCashDiscount)

  for (const item of activeItems) {
    const cashUnitPrice = calculateItemEffectiveCashPrice(item)
    const taxCategory = item.tax_category ?? 'standard'
    const taxRatePercent = taxRatesMap[taxCategory] ?? 0

    // Calculate subtotals
    const subtotal = item.price * item.quantity
    const cashSubtotal = cashUnitPrice * item.quantity

    // Calculate proportional discount
    const proportion = totals.subtotal > 0 ? subtotal / totals.subtotal : 0
    const discountAmount = round2(totalDiscount * proportion)

    const cashProportion =
      totals.cash_subtotal > 0 ? cashSubtotal / totals.cash_subtotal : 0
    const cashDiscountAmount = round2(totalCashDiscount * cashProportion)

    // Calculate taxable amounts
    const taxableAmount = Math.max(0, subtotal - discountAmount)
    const cashTaxableAmount = Math.max(0, cashSubtotal - cashDiscountAmount)

    // Calculate tax
    const taxAmount = calculateItemTax(
      taxableAmount,
      taxRatePercent,
      item.is_tax_exempt ?? false
    )
    const cashTaxAmount = calculateItemTax(
      cashTaxableAmount,
      taxRatePercent,
      item.is_tax_exempt ?? false
    )

    // Calculate totals with tax
    const totalWithTax = round2(taxableAmount + taxAmount)
    const cashTotalWithTax = round2(cashTaxableAmount + cashTaxAmount)

    // Per-unit totals (for split by item)
    const unitTotalWithTax = round2(totalWithTax / item.quantity)
    const cashUnitTotalWithTax = round2(cashTotalWithTax / item.quantity)

    // Outstanding amounts
    const unpaidQuantity = item.quantity - (item.paidQuantity ?? 0)
    const outstandingProportion =
      item.quantity > 0 ? unpaidQuantity / item.quantity : 0

    const outstandingSubtotal = round2(subtotal * outstandingProportion)
    const outstandingTax = round2(taxAmount * outstandingProportion)
    const outstandingTotal = round2(totalWithTax * outstandingProportion)

    const cashOutstandingSubtotal = round2(cashSubtotal * outstandingProportion)
    const cashOutstandingTax = round2(cashTaxAmount * outstandingProportion)
    const cashOutstandingTotal = round2(
      cashTotalWithTax * outstandingProportion
    )

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
      isTaxExempt: item.is_tax_exempt ?? false
    })
  }

  return {
    ...totals,
    items: itemDetails,
    calculatedAt: new Date().toISOString(),
    isOfflineCalculation: true // Will be updated by caller if validated with backend
  }
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
export function calculateEvenSplit (
  total: number,
  splitCount: number
): EvenSplitResult {
  if (splitCount <= 0) {
    return { perPerson: total, lastPerson: total, amounts: [total] }
  }

  if (splitCount === 1) {
    return { perPerson: total, lastPerson: total, amounts: [total] }
  }

  // Calculate base amount per person (floor to avoid overpaying)
  const perPerson = Math.floor((total / splitCount) * 100) / 100

  // Calculate what the first N-1 people pay
  const sumOfFirst = round2(perPerson * (splitCount - 1))

  // Last person pays the remainder
  const lastPerson = round2(total - sumOfFirst)

  // Build amounts array
  const amounts: number[] = []
  for (let i = 0; i < splitCount - 1; i++) {
    amounts.push(perPerson)
  }
  amounts.push(lastPerson)

  return { perPerson, lastPerson, amounts }
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
export function calculateDualPriceSplit (
  cardTotal: number,
  cashTotal: number,
  splitCount: number
): DualPriceSplitResult {
  return {
    card: calculateEvenSplit(cardTotal, splitCount),
    cash: calculateEvenSplit(cashTotal, splitCount)
  }
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
export function calculatePaymentPreview (
  totals: OrderTotals,
  amountPaidSoFar: number,
  input: PaymentPreviewInput,
  itemDetails?: ItemCalculationDetail[]
): PaymentPreviewResult {
  const errors: string[] = []
  let amountToCharge = 0
  const itemsCovered: PaymentPreviewResult['itemsCovered'] = []

  const isCash = input.paymentMethod === 'cash'
  const totalAmount = isCash ? totals.cash_total_amount : totals.total_amount
  const outstandingAmount = isCash
    ? totals.cash_outstanding_total
    : totals.outstanding_total

  switch (input.type) {
    case 'full':
      amountToCharge = outstandingAmount
      break

    case 'split_even':
      if (!input.splitCount || input.splitCount < 2) {
        errors.push('Split count must be at least 2')
        break
      }
      const split = calculateEvenSplit(outstandingAmount, input.splitCount)
      const index = (input.splitIndex ?? 1) - 1 // Convert 1-based to 0-based
      amountToCharge = split.amounts[index] ?? split.perPerson
      break

    case 'split_by_item':
      if (!input.itemAllocations || input.itemAllocations.length === 0) {
        errors.push('No items selected for payment')
        break
      }
      if (!itemDetails) {
        errors.push('Item details required for split by item')
        break
      }

      for (const alloc of input.itemAllocations) {
        const itemDetail = itemDetails.find(i => i.itemId === alloc.itemId)
        if (!itemDetail) {
          errors.push(`Item ${alloc.itemId} not found`)
          continue
        }
        if (alloc.quantity > itemDetail.unpaidQuantity) {
          errors.push(
            `Cannot pay for ${alloc.quantity} of ${itemDetail.name} - only ${itemDetail.unpaidQuantity} unpaid`
          )
          continue
        }

        const perUnitAmount = isCash
          ? itemDetail.cashUnitTotalWithTax
          : itemDetail.unitTotalWithTax
        const itemAmount = round2(perUnitAmount * alloc.quantity)

        amountToCharge += itemAmount
        itemsCovered.push({
          itemId: alloc.itemId,
          dbOrderItemId: alloc.dbOrderItemId,
          name: itemDetail.name,
          quantity: alloc.quantity,
          amount: itemAmount
        })
      }
      break

    case 'custom_amount':
      if (!input.customAmount || input.customAmount <= 0) {
        errors.push('Custom amount must be greater than 0')
        break
      }
      if (input.customAmount > outstandingAmount + 0.01) {
        // Allow 1 cent tolerance
        errors.push(
          `Custom amount ${input.customAmount} exceeds outstanding ${outstandingAmount}`
        )
        break
      }
      amountToCharge = input.customAmount
      break
  }

  const tipAmount = input.tipAmount ?? 0
  const totalToCollect = round2(amountToCharge + tipAmount)

  // Change calculation for cash
  let changeToGive = 0
  if (isCash && input.amountTendered) {
    if (input.amountTendered < totalToCollect) {
      errors.push(
        `Amount tendered ${input.amountTendered} is less than total ${totalToCollect}`
      )
    } else {
      changeToGive = round2(input.amountTendered - totalToCollect)
    }
  }

  // Post-payment state
  const orderAmountPaidAfter = round2(amountPaidSoFar + amountToCharge)
  const orderAmountDueAfter = round2(
    Math.max(0, totalAmount - orderAmountPaidAfter)
  )
  const orderFullyPaidAfter = orderAmountDueAfter < 0.01

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
    source: 'local',
    backendValidated: false
  }
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
export function applyPaymentToItems (
  items: CartItem[],
  allocations: ItemPaymentAllocation[]
): CartItem[] {
  const allocationMap = new Map(allocations.map(a => [a.itemId, a]))

  return items.map(item => {
    const allocation = allocationMap.get(item.id)
    if (!allocation) return item

    const newPaidQuantity = Math.min(
      item.quantity,
      (item.paidQuantity ?? 0) + allocation.quantityPaid
    )

    return {
      ...item,
      paidQuantity: newPaidQuantity,
      paymentId:
        allocation.quantityPaid > 0 ? `payment_${Date.now()}` : item.paymentId
    }
  })
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
export function hashCalculationInput (input: OrderCalculationInput): string {
  const key = {
    items: input.items.map(i => ({
      id: i.id,
      price: i.price,
      quantity: i.quantity,
      paidQuantity: i.paidQuantity,
      is_voided: i.is_voided,
      tax_category: i.tax_category,
      is_tax_exempt: i.is_tax_exempt,
      appliedDiscount: i.appliedDiscount?.id
    })),
    discount: input.checkDiscount
      ? {
          id: input.checkDiscount.id,
          type: input.checkDiscount.type,
          value: input.checkDiscount.value
        }
      : null,
    // Service charge inputs — must invalidate cache when these change.
    preserveItemLevelOutstanding: input.preserveItemLevelOutstanding ?? false,
    sc: {
      ruleId: input.serviceChargeRule?.id ?? null,
      rate: input.serviceChargeRule?.rate_percent ?? null,
      appliesOn: input.serviceChargeRule?.applies_on ?? null,
      minParty: input.serviceChargeRule?.min_party_size ?? null,
      active: input.serviceChargeRule?.is_active ?? null,
      auto: input.serviceChargeRule?.auto_apply ?? null,
      taxable: input.serviceChargeRule?.is_taxable ?? null,
      partySize: input.partySize ?? null,
      orderType: input.orderType ?? null,
      snapRate: input.snapshottedRate ?? null,
      snapAppliesOn: input.snapshottedAppliesOn ?? null,
      snapName: input.snapshottedName ?? null
    }
    // Don't include taxRatesMap in hash - it rarely changes
  }
  return JSON.stringify(key)
}

// ============================================================================
// LEGACY COMPATIBILITY
// ============================================================================

/**
 * Legacy function name for backward compatibility.
 * @deprecated Use calculatePaidStatus instead
 */
export const calculatePaidStatusFromPayments = calculatePaidStatus
