// utils/money.ts
// Use decimal.js for exact decimal arithmetic matching PostgreSQL NUMERIC

import Decimal from 'decimal.js';

// Configure to match PostgreSQL NUMERIC(10,2) behavior
Decimal.set({ 
  precision: 20,
  rounding: Decimal.ROUND_HALF_UP  // PostgreSQL default
});

/**
 * Round to 2 decimal places using PostgreSQL-compatible rounding.
 * HALF_UP: 2.225 → 2.23 (matches PostgreSQL ROUND)
 */
export function round2(num: number | Decimal): number {
  return new Decimal(num).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
}

/**
 * Safe division that handles zero divisor
 */
export function safeDivide(numerator: number, denominator: number): Decimal {
  if (denominator === 0) return new Decimal(0);
  return new Decimal(numerator).dividedBy(denominator);
}

/**
 * Multiply and round in one step (matches PostgreSQL behavior)
 */
export function multiplyRound2(a: number, b: number): number {
  return new Decimal(a).times(b).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
}

/**
 * Calculate tax matching PostgreSQL: ROUND(subtotal * rate / 100, 2)
 */
export function calculateTax(subtotal: number, ratePercent: number): number {
  return new Decimal(subtotal)
    .times(ratePercent)
    .dividedBy(100)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    .toNumber();
}

/**
 * Aggregate-per-rate-group tax (matches calculate_order_totals_fast v6 and
 * lib/order-calculator.ts): group lines by their resolved tax rate, then
 * ROUND(SUM(net in group) * rate / 100, 2) ONCE per group and sum across
 * groups. This is the ONLY correct way to compute tax over a set of items —
 * summing per-item ROUND(net * rate) drifts a cent on multi-item sets.
 *
 * Tax-exempt / zero-rate lines are excluded from the base entirely.
 * Card and cash must be aggregated separately (call twice with the right base).
 */
export function aggregateTaxByCategory(
  lines: Array<{ netSubtotal: number; taxCategory?: string | null; isTaxExempt?: boolean }>,
  taxRatesMap: Record<string, number>
): number {
  const baseByRate = new Map<number, Decimal>();
  for (const line of lines) {
    if (line.isTaxExempt) continue;
    const rate = taxRatesMap[line.taxCategory ?? 'standard'] ?? 0;
    if (rate <= 0) continue;
    baseByRate.set(
      rate,
      (baseByRate.get(rate) ?? new Decimal(0)).plus(line.netSubtotal)
    );
  }
  let tax = new Decimal(0);
  for (const [rate, base] of baseByRate) {
    tax = tax.plus(
      base.times(rate).dividedBy(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    );
  }
  return tax.toNumber();
}

/**
 * Format a tax rate percentage for display, preserving full precision up to 4
 * decimals and trimming trailing zeros. 8.875 -> "8.875", 8.88 -> "8.88",
 * 8 -> "8", 8.10 -> "8.1". Use this instead of `.toFixed(2)`, which truncates
 * 8.875 -> "8.88" and misrepresents the rate to the customer/merchant.
 */
export function formatTaxRate(rate: number | Decimal): string {
  return new Decimal(rate).toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toString();
}