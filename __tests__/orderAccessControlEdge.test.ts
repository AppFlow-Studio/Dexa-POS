/**
 * Senior-QA edge-case suite for `isOrderReadOnly` — the cross-station
 * cart-edit gate from `lib/orderAccessControl.ts`.
 *
 * The function is two lines but is the linchpin of Lever 2: every
 * `_checkCartEditable` call in `useOrderStore.ts` (~13 sites) delegates to
 * it. A subtle regression here disables read-only mode silently and lets
 * Station B mutate an order that Station A owns. These tests target the
 * **boundary semantics** — what counts as "owned" — where a sloppy
 * change (e.g., `==` for `===`, dropping the `!= null` guard, normalizing
 * casing on the server but not the client) would slip through unit tests
 * that only check the happy path.
 */

import type { OrderProfile } from '@/lib/types'
import { isOrderReadOnly } from '@/lib/orderAccessControl'

const STATION_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const STATION_A_UPPER = 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA'
const STATION_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

function makeOrder (overrides: Partial<OrderProfile> = {}): OrderProfile {
  return {
    id: 'local-1',
    station_id: STATION_A,
    items: [],
    ...(overrides as Partial<OrderProfile>)
  } as OrderProfile
}

describe('isOrderReadOnly — boundary semantics that protect Lever 2', () => {
  // ----------------------------------------------------------------
  // Documented contract: false on null/undefined inputs (no station context)
  // ----------------------------------------------------------------

  it('falsy order → false (cannot lock what does not exist)', () => {
    expect(isOrderReadOnly(null, STATION_A)).toBe(false)
    expect(isOrderReadOnly(undefined, STATION_A)).toBe(false)
  })

  it('falsy currentStationId → false (no station context = no enforcement)', () => {
    expect(isOrderReadOnly(makeOrder(), null)).toBe(false)
    // Empty string current station is a "no context" signal too — the early
    // `!currentStationId` short-circuit covers it.
    expect(isOrderReadOnly(makeOrder(), '' as unknown as string)).toBe(false)
  })

  // ----------------------------------------------------------------
  // Same-station / unowned positives
  // ----------------------------------------------------------------

  it('order.station_id === currentStationId → false (mine, editable)', () => {
    expect(isOrderReadOnly(makeOrder({ station_id: STATION_A }), STATION_A)).toBe(false)
  })

  it('order.station_id === null → false (unowned external/online order, editable)', () => {
    expect(isOrderReadOnly(makeOrder({ station_id: null }), STATION_A)).toBe(false)
  })

  it('order.station_id === undefined → false (treated as unowned, mirrors null)', () => {
    // The implementation uses `!= null` which catches BOTH null and undefined,
    // so an order missing station_id (e.g., legacy migration row) is editable.
    const order = makeOrder()
    delete (order as Partial<OrderProfile>).station_id
    expect(isOrderReadOnly(order, STATION_A)).toBe(false)
  })

  // ----------------------------------------------------------------
  // Cross-station rejection — the Lever 2 promise
  // ----------------------------------------------------------------

  it('order owned by another station → true (locked)', () => {
    expect(isOrderReadOnly(makeOrder({ station_id: STATION_B }), STATION_A)).toBe(true)
  })

  it('CASE-SENSITIVE comparison — different case is treated as different station (regression guard for any future toLowerCase normalization)', () => {
    // If someone "helpfully" lowercases station ids on one side but not the
    // other, this contract breaks. We assert the exact-match contract so a
    // refactor that only normalizes the order side gets caught immediately.
    expect(
      isOrderReadOnly(makeOrder({ station_id: STATION_A_UPPER }), STATION_A)
    ).toBe(true)
  })

  it('whitespace difference → treated as different station (no trim)', () => {
    expect(
      isOrderReadOnly(makeOrder({ station_id: STATION_A + ' ' }), STATION_A)
    ).toBe(true)
  })

  // ----------------------------------------------------------------
  // Truthy-but-empty pitfalls
  // ----------------------------------------------------------------

  it('order.station_id === "" → treated as owned-by-empty-string (read-only against any non-empty current)', () => {
    // `'' != null` is true → enters the comparison branch.
    // `'' !== STATION_A` is true → returns true.
    // Documented behaviour: empty-string ownership is NOT mapped back to
    // unowned. The backend should never emit empty-string station_id; if
    // it does, we'd rather lock the order than silently permit edits.
    expect(isOrderReadOnly(makeOrder({ station_id: '' }), STATION_A)).toBe(true)
  })

  // ----------------------------------------------------------------
  // No mutation
  // ----------------------------------------------------------------

  it('does not mutate the order argument', () => {
    const order = makeOrder({ station_id: STATION_B })
    const snapshot = JSON.parse(JSON.stringify(order))
    isOrderReadOnly(order, STATION_A)
    expect(order).toEqual(snapshot)
  })

  // ----------------------------------------------------------------
  // Return type: must be a boolean (not a truthy/falsy value)
  // ----------------------------------------------------------------

  it('always returns a strict boolean (no leaking of station_id strings via && short-circuits)', () => {
    const out = isOrderReadOnly(makeOrder({ station_id: STATION_B }), STATION_A)
    expect(out).toStrictEqual(true)
    expect(typeof out).toBe('boolean')
  })
})
