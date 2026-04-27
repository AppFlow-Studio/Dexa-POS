/**
 * Locks in the contract for `resolveBackendPrices`: the function that decides
 * what we send to `add_order_item_v2.p_unit_price` / `p_cash_unit_price`.
 *
 * Real-world bug this prevents: a Blueberry Muffin row stored
 * `cash_price = 3.79` (server's 4% fallback from card price 3.95) instead of
 * the menu's authoritative `cash_price = 3.75`. Cash total drifted by $0.13
 * per multi-quantity item — would silently leave outstanding balances on cash
 * payments. See plan: lets-look-into-this-stateless-blossom.md.
 */

import { resolveBackendPrices } from '@/lib/cartItemPricing'

describe('resolveBackendPrices', () => {
  it('uses base prices when both are set (well-formed item)', () => {
    expect(
      resolveBackendPrices({
        baseCardPrice: 3.95,
        baseCashPrice: 3.75,
        cashPrice: 3.75,
        price: 3.95,
        originalPrice: 3.95,
      }),
    ).toEqual({ p_unit_price: 3.95, p_cash_unit_price: 3.75 })
  })

  it('falls back through cashPrice when baseCashPrice is missing (Dialog/Sidebar bug shape)', () => {
    expect(
      resolveBackendPrices({
        baseCardPrice: 3.95,
        baseCashPrice: undefined as any,
        cashPrice: 3.75,
        price: 3.95,
        originalPrice: 3.95,
      }),
    ).toEqual({ p_unit_price: 3.95, p_cash_unit_price: 3.75 })
  })

  it('NEVER returns the card price for cash when cashPrice exists', () => {
    // The current bug: fallback to originalPrice (card 3.95) → stored as cash.
    // After fix: fallback uses cashPrice first.
    const result = resolveBackendPrices({
      baseCardPrice: 3.95,
      baseCashPrice: undefined as any,
      cashPrice: 3.75,
      price: 3.95,
      originalPrice: 3.95,
    })
    expect(result.p_cash_unit_price).not.toBe(3.95)
    expect(result.p_cash_unit_price).toBe(3.75)
  })

  it('handles 0 as a legitimate price (no || fallthrough)', () => {
    // Promotional comp item — base prices are 0, must not fall through.
    expect(
      resolveBackendPrices({
        baseCardPrice: 0,
        baseCashPrice: 0,
        cashPrice: 0,
        price: 0,
        originalPrice: 0,
      }),
    ).toEqual({ p_unit_price: 0, p_cash_unit_price: 0 })
  })

  it('NEVER returns undefined for either field given any sensible input', () => {
    // Backstop: even worst-case CartItems must not produce NULL params to the RPC.
    const minimal = {
      baseCardPrice: undefined as any,
      baseCashPrice: undefined as any,
      cashPrice: undefined as any,
      price: 5.0,
      originalPrice: undefined as any,
    }
    const result = resolveBackendPrices(minimal)
    expect(result.p_unit_price).toBeDefined()
    expect(result.p_cash_unit_price).toBeDefined()
    // Both should resolve to the only available price (5.00).
    expect(result.p_unit_price).toBe(5.0)
    expect(result.p_cash_unit_price).toBe(5.0)
  })

  it('reproduces the muffin scenario: baseCashPrice missing, cashPrice 3.75, originalPrice card', () => {
    // EXACT reproduction of the production bug.
    // Adder built CartItem without baseCashPrice. cashPrice was 3.75 from menu.
    // Old code: `baseCashPrice || originalPrice` where originalPrice = card 3.95.
    // Server then ran 3.95 × 0.96 = 3.79.
    const muffin = {
      baseCardPrice: 3.95,
      baseCashPrice: undefined as any,
      cashPrice: 3.75,
      price: 3.95,
      originalPrice: 3.95, // Dialog adder sets this to menuItem.price (card)
    }
    expect(resolveBackendPrices(muffin).p_cash_unit_price).toBe(3.75)
    expect(resolveBackendPrices(muffin).p_cash_unit_price).not.toBe(3.79)
  })
})
