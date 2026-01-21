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