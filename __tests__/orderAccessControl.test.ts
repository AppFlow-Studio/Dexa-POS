/**
 * Tests for lib/orderAccessControl.isOrderReadOnly — the cross-station
 * cart-edit gate. Mirrors the truth table from the C.3 helper.
 */

import type { OrderProfile } from '@/lib/types'
import { isOrderReadOnly } from '@/lib/orderAccessControl'

const STATION_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const STATION_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

function makeOrder (
  overrides: Partial<OrderProfile> = {}
): OrderProfile {
  return {
    id: 'local-1',
    station_id: STATION_A,
    items: [],
    ...(overrides as any)
  } as OrderProfile
}

describe('isOrderReadOnly', () => {
  it('returns false when order is null/undefined', () => {
    expect(isOrderReadOnly(null, STATION_A)).toBe(false)
    expect(isOrderReadOnly(undefined, STATION_A)).toBe(false)
  })

  it('returns false when currentStationId is null (no station context)', () => {
    expect(isOrderReadOnly(makeOrder(), null)).toBe(false)
  })

  it('returns false when order.station_id matches the current station (mine)', () => {
    expect(isOrderReadOnly(makeOrder({ station_id: STATION_A }), STATION_A)).toBe(false)
  })

  it('returns false when order.station_id is null (unowned/external/online)', () => {
    expect(isOrderReadOnly(makeOrder({ station_id: null }), STATION_A)).toBe(false)
  })

  it('returns true when order is owned by another station', () => {
    expect(isOrderReadOnly(makeOrder({ station_id: STATION_B }), STATION_A)).toBe(true)
  })
})
