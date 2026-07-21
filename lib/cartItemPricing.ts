import type { CartItem } from './types'

/**
 * Resolves the unit prices we send to backend RPCs (`add_order_item_v2.p_unit_price` /
 * `p_cash_unit_price`) from a CartItem. Centralizes the fallback chain so adders
 * that don't set base prices still produce correct values, and so future RPCs can
 * reuse the same logic.
 *
 * Cash side falls back through CASH-flavored fields first; card price is only a
 * last-resort for cash. This guards against the historical bug where
 * `baseCashPrice || originalPrice` resolved to the card price for items built
 * by adders that didn't set base fields, which then triggered the server's 4%
 * cash-discount fallback (e.g., 3.95 × 0.96 = 3.79 stored when menu cash was 3.75).
 */
function firstDefined (
  ...vals: (number | undefined | null)[]
): number | undefined {
  for (const v of vals) {
    if (v !== undefined && v !== null) return v
  }
  return undefined
}

export function resolveBackendPrices (
  item: Pick<
    CartItem,
    'baseCardPrice' | 'baseCashPrice' | 'cashPrice' | 'price' | 'originalPrice'
  >,
): { p_unit_price: number; p_cash_unit_price: number } {
  const p_unit_price =
    firstDefined(item.baseCardPrice, item.price, item.originalPrice) ?? 0
  // Cash side falls back through CASH-flavored fields first; card price is only
  // a last-resort. This guards against the historical bug where
  // `baseCashPrice || originalPrice` resolved to the card price for items
  // built by adders that didn't set base fields.
  const p_cash_unit_price =
    firstDefined(
      item.baseCashPrice,
      item.cashPrice,
      item.baseCardPrice,
      item.price,
    ) ?? 0
  return { p_unit_price, p_cash_unit_price }
}
