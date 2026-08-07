/**
 * Failure-model classifier tests.
 *
 * Guards the core defect this module exists to fix: Supabase surfaces
 * `PostgrestError.code` as a STRING ("23503"), and the previous
 * `isTransientError` only inspected `status` when `typeof status === 'number'`.
 * Every Postgres error therefore fell through to `return true` and was retried
 * up to 44 times. These tests pin the string-code paths specifically.
 */

import {
  classifyError,
  fromLegacyBoolean,
  OpBlocked,
  OpOk,
  remedyFor,
  SHORT_BUDGET_CODES
} from '@/lib/network/opResult'

describe('classifyError — Postgres string codes', () => {
  it('treats FK / not-null / invalid-input / RLS as terminal', () => {
    const cases: [string, string][] = [
      ['23503', 'FOREIGN_KEY_VIOLATION'],
      ['23502', 'NOT_NULL_VIOLATION'],
      ['23514', 'CHECK_VIOLATION'],
      ['22P02', 'INVALID_INPUT'],
      ['42501', 'PERMISSION_DENIED'],
      ['P0005', 'ORDER_MATH_INCONSISTENT']
    ]
    for (const [pgCode, expected] of cases) {
      const result = classifyError({ code: pgCode, message: 'boom' })
      expect(result.outcome).toBe('terminal')
      expect(result).toMatchObject({ code: expected })
    }
  })

  it('treats serialization/deadlock/connection codes as retry', () => {
    for (const pgCode of ['40001', '40P01', '53300', '57014', '08006']) {
      expect(classifyError({ code: pgCode, message: 'x' }).outcome).toBe('retry')
    }
  })

  it('treats P0001 business-rule rejections as terminal, not transient', () => {
    const result = classifyError({
      code: 'P0001',
      message: 'Discount exceeds maximum allowed'
    })
    expect(result.outcome).toBe('terminal')
    expect(result).toMatchObject({ code: 'VALIDATION_REJECTED' })
  })

  it('maps P0001 + "not found" to NOT_FOUND', () => {
    const result = classifyError({ code: 'P0001', message: 'Order not found' })
    expect(result).toMatchObject({ outcome: 'terminal', code: 'NOT_FOUND' })
  })
})

describe('classifyError — idempotent success', () => {
  // These were previously ~8 scattered per-handler escape hatches, each added
  // after a production infinite-retry loop.
  it('treats unique violation (23505) as success', () => {
    expect(classifyError({ code: '23505', message: 'dup' }).outcome).toBe('success')
  })

  it.each([
    'Order already paid',
    'Payment has already been paid',
    'No unpaid items remaining',
    'Item already voided',
    'Check is closed',
    'Session already freed'
  ])('treats %j as success', message => {
    expect(classifyError({ code: 'P0001', message }).outcome).toBe('success')
  })

  it('prefers idempotent-success over the P0001 terminal branch', () => {
    // Ordering guard: "already" must be checked BEFORE P0001 → terminal,
    // otherwise a replayed-but-landed op dead-letters as a rejection.
    const result = classifyError({ code: 'P0001', message: 'Already applied' })
    expect(result.outcome).toBe('success')
  })
})

describe('classifyError — HTTP status', () => {
  it('retries 5xx / 408 / 429', () => {
    expect(classifyError({ status: 500 }).outcome).toBe('retry')
    expect(classifyError({ status: 503 }).outcome).toBe('retry')
    expect(classifyError({ status: 408 })).toMatchObject({ code: 'TIMEOUT' })
    expect(classifyError({ status: 429 })).toMatchObject({ code: 'RATE_LIMITED' })
  })

  it('dead-letters 4xx with specific codes', () => {
    expect(classifyError({ status: 401 })).toMatchObject({
      outcome: 'terminal',
      code: 'AUTH_EXPIRED'
    })
    expect(classifyError({ status: 403 })).toMatchObject({
      outcome: 'terminal',
      code: 'PERMISSION_DENIED'
    })
    expect(classifyError({ status: 404 })).toMatchObject({
      outcome: 'terminal',
      code: 'NOT_FOUND'
    })
    expect(classifyError({ status: 409 })).toMatchObject({
      outcome: 'terminal',
      code: 'CONFLICT'
    })
    expect(classifyError({ status: 422 })).toMatchObject({
      outcome: 'terminal',
      code: 'VALIDATION_REJECTED'
    })
  })

  it('handles numeric-string status the same as numeric', () => {
    expect(classifyError({ code: '404' })).toMatchObject({ outcome: 'terminal' })
    expect(classifyError({ code: '500' })).toMatchObject({ outcome: 'retry' })
  })
})

describe('classifyError — transport and ownership', () => {
  it('retries network-shaped messages with no code', () => {
    for (const message of [
      'Network request failed',
      'fetch failed',
      'ETIMEDOUT',
      'socket hang up'
    ]) {
      expect(classifyError(new Error(message)).outcome).toBe('retry')
    }
  })

  it('classifies ownership rejection as terminal', () => {
    const result = classifyError(
      new Error('ORDER_OWNED_BY_OTHER_STATION: station B holds this order')
    )
    expect(result).toMatchObject({
      outcome: 'terminal',
      code: 'OWNERSHIP_REJECTED'
    })
  })

  it('defaults unknown errors to retry with a short-budget code', () => {
    const result = classifyError({ weird: true })
    expect(result.outcome).toBe('retry')
    expect(result).toMatchObject({ code: 'UNKNOWN_ERROR' })
    // Never silently discard an operator's work on an error we don't recognize.
    expect(SHORT_BUDGET_CODES.has('UNKNOWN_ERROR')).toBe(true)
  })

  it('never returns terminal for null/undefined', () => {
    expect(classifyError(null).outcome).toBe('retry')
    expect(classifyError(undefined).outcome).toBe('retry')
  })
})

describe('remedies', () => {
  it('gives every classified failure an actionable remedy', () => {
    const errors = [
      { code: '23503' },
      { code: '22P02' },
      { code: '42501' },
      { code: 'P0001', message: 'rejected' },
      { status: 500 },
      { status: 404 },
      new Error('network down')
    ]
    for (const error of errors) {
      const result = classifyError(error)
      if (result.outcome === 'terminal' || result.outcome === 'retry') {
        expect(result.remedy.length).toBeGreaterThan(0)
        // Remedy must tell the operator what to DO, not restate the error.
        expect(result.remedy).not.toBe(result.message)
      }
    }
  })

  it('falls back by status class for unmapped numeric codes', () => {
    expect(remedyFor('503')).toBe(remedyFor('SERVER_ERROR'))
    expect(remedyFor('418')).toBe(remedyFor('VALIDATION_REJECTED'))
    expect(remedyFor(undefined)).toBe(remedyFor('UNSPECIFIED'))
  })
})

describe('constructors and legacy bridge', () => {
  it('maps legacy booleans without changing prior behavior', () => {
    expect(fromLegacyBoolean(true).outcome).toBe('success')
    const failed = fromLegacyBoolean(false)
    expect(failed.outcome).toBe('retry')
    expect(failed).toMatchObject({ code: 'UNSPECIFIED' })
  })

  it('builds blocked and success results', () => {
    expect(OpBlocked('order_id_unresolved')).toEqual({
      outcome: 'blocked',
      reason: 'order_id_unresolved'
    })
    expect(OpOk().outcome).toBe('success')
  })
})
