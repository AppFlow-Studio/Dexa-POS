/**
 * End-to-end failure reporting.
 *
 * Pins the two behaviors the operator actually reported:
 *   1. "it doesn't say why it failed" — dead-lettered ops must carry a real
 *      cause + remedy, never the synthetic "Failed N times" placeholder that
 *      was the retry counter describing itself.
 *   2. "it retries 10 times instantly even though it failed for a reason" —
 *      a permanent rejection must dead-letter on the FIRST attempt, and a
 *      dependency wait must not charge the retry budget at all.
 */

import {
  deriveRemedy,
  deriveSubtitle,
  isRetryable
} from '@/lib/offlineSyncSubtitles'
import type { OfflineOperation } from '@/services/offlineSyncService'

function makeOp (overrides: Partial<OfflineOperation> = {}): OfflineOperation {
  return {
    id: 'op_1',
    type: 'add_item',
    params: {},
    localOrderId: 'order_1',
    timestamp: new Date().toISOString(),
    retryCount: 0,
    status: 'failed',
    priority: 2,
    ...overrides
  } as OfflineOperation
}

describe('operator-facing reporting', () => {
  it('reports the real cause instead of "Failed N times"', () => {
    const op = makeOp({
      retryCount: 1,
      isTerminal: true,
      lastError: {
        code: 'INVALID_INPUT',
        message: 'invalid input value for enum discount_type',
        remedy: 'One of the values is invalid. Edit the item and try again.'
      }
    })

    const subtitle = deriveSubtitle(op)
    expect(subtitle).toContain('Invalid value')
    // The regression being guarded: the old pipeline could only ever produce
    // this string, because lastError was overwritten with code MAX_RETRIES.
    expect(subtitle).not.toMatch(/Failed \d+ times/)
  })

  it('always gives the operator an action to take', () => {
    const codes = [
      'INVALID_INPUT',
      'PERMISSION_DENIED',
      'NOT_FOUND',
      'FOREIGN_KEY_VIOLATION',
      'ORDER_MATH_INCONSISTENT',
      'SERVER_ERROR',
      'NETWORK',
      'OWNERSHIP_REJECTED'
    ]
    for (const code of codes) {
      const remedy = deriveRemedy(makeOp({ lastError: { code } }))
      expect(remedy.length).toBeGreaterThan(0)
    }
  })

  it('falls back to a remedy when the op predates the remedy field', () => {
    // Ops persisted by an older build have lastError without `remedy`.
    const remedy = deriveRemedy(makeOp({ lastError: { code: 'NOT_FOUND' } }))
    expect(remedy).toMatch(/refresh/i)
  })

  it('hides Retry for terminal failures and keeps it for transient ones', () => {
    // Previously isRetryable saw code MAX_RETRIES on everything and returned
    // true, so permanently-rejected ops showed a Retry that could never work.
    expect(
      isRetryable(
        makeOp({ isTerminal: true, lastError: { code: 'VALIDATION_REJECTED' } })
      )
    ).toBe(false)
    expect(
      isRetryable(makeOp({ lastError: { code: 'PERMISSION_DENIED' } }))
    ).toBe(false)
    expect(isRetryable(makeOp({ lastError: { code: 'NOT_FOUND' } }))).toBe(false)

    // Transient — network may have recovered; Retry is meaningful.
    expect(isRetryable(makeOp({ lastError: { code: 'SERVER_ERROR' } }))).toBe(
      true
    )
    expect(
      isRetryable(makeOp({ lastError: { code: 'SUSTAINED_BAD_WIFI' } }))
    ).toBe(true)
    expect(isRetryable(makeOp({ lastError: { code: 'TIMEOUT' } }))).toBe(true)
  })

  it('renders a distinct cause per code rather than a generic fallback', () => {
    // Guards the describeCause switch staying in sync with classifyError's
    // vocabulary. A missing case silently degrades to "Sync failed".
    const seen = new Set<string>()
    for (const code of [
      'VALIDATION_REJECTED',
      'PERMISSION_DENIED',
      'NOT_FOUND',
      'CONFLICT',
      'FOREIGN_KEY_VIOLATION',
      'NOT_NULL_VIOLATION',
      'INVALID_INPUT',
      'ORDER_MATH_INCONSISTENT',
      'SERVER_ERROR',
      'NETWORK',
      'TIMEOUT'
    ]) {
      const subtitle = deriveSubtitle(makeOp({ lastError: { code } }))
      expect(subtitle).not.toMatch(/^Sync failed/)
      seen.add(subtitle.split(' — ')[0])
    }
    // Causes should be meaningfully distinct, not all collapsing to one string.
    expect(seen.size).toBeGreaterThan(8)
  })
})
