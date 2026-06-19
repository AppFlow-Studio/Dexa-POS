/**
 * KDS ticket timer formatting — getBucketedElapsed.
 *
 * Regression: when the server-issued start time (fire_time / sent_to_kitchen_at)
 * is ahead of the device clock (clock skew, common right after a ticket is sent),
 * the elapsed diff goes negative and the raw formatter rendered garbage like
 * "-13:-51" on the KDS card. Elapsed must clamp to 0:00, never go negative.
 */
// getBucketedElapsed is a pure function, but useKDSTimer.ts imports useKDSStore
// at module load (used only by the useKDSTimer hook), which transitively pulls in
// the `uuid` ESM that Jest doesn't transform. Mock the store to break that chain.
jest.mock('@/stores/useKDSStore', () => ({ useKDSStore: { getState: () => ({}) } }))

import { getBucketedElapsed } from '@/hooks/useKDSTimer'

describe('getBucketedElapsed', () => {
  const START = 1_000_000_000_000 // arbitrary fixed epoch ms

  it('formats a normal positive elapsed as M:SS', () => {
    // 12 min 51 sec after start
    const now = START + (12 * 60 + 51) * 1000
    expect(getBucketedElapsed(START, undefined, now)).toBe('12:51')
  })

  it('zero-pads seconds', () => {
    const now = START + (3 * 60 + 5) * 1000
    expect(getBucketedElapsed(START, undefined, now)).toBe('3:05')
  })

  it('returns 0:00 when the start time is in the future (clock skew)', () => {
    // now is ~13 minutes BEFORE the server start time — the exact -13:-51 case.
    const now = START - (12 * 60 + 51) * 1000
    expect(getBucketedElapsed(START, undefined, now)).toBe('0:00')
  })

  it('returns 0:00 for a start time one second in the future', () => {
    expect(getBucketedElapsed(START, undefined, START - 1000)).toBe('0:00')
  })

  it('returns 0:00 for an unknown start time (epoch 0)', () => {
    expect(getBucketedElapsed(0, undefined, START)).toBe('0:00')
  })

  it('freezes at doneTimeEpoch when provided, and never negative', () => {
    const done = START + 90 * 1000 // 1:30
    expect(getBucketedElapsed(START, done, START + 999_999_999)).toBe('1:30')
    // done before start (skew) still clamps
    expect(getBucketedElapsed(START, START - 5000, START + 999)).toBe('0:00')
  })
})
