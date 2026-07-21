/**
 * Wave 2.5 — `isOwnershipError` recogniser unit tests.
 *
 * Pulled out of `useOrderStore.ts` (it was a private `_isOwnershipError`) and
 * re-exported from `lib/orderAccessControl.ts` so:
 *   1. The offline-sync service can short-circuit ownership rejections to
 *      dead-letter immediately instead of burning MAX_RETRY_ATTEMPTS.
 *   2. Both the inline-mutation path (useOrderStore) and the queue-replay path
 *      (offlineSyncService) agree on what the marker looks like.
 *
 * Server-side guards return one of two shapes:
 *   - PostgREST data envelope: `{ success: false, error: 'ORDER_OWNED_BY_OTHER_STATION', ... }`
 *     (with PostgREST `error` field being null — the function ran fine, the
 *     row just rejected the write).
 *   - Thrown exception: `Error('… ORDER_OWNED_BY_OTHER_STATION (owner=X, caller=Y)')`
 *     (legacy RPCs that RAISE EXCEPTION instead of returning the typed result).
 *
 * Both must be caught. These tests pin the recognition contract so a future
 * refactor (e.g., one that adds `error.code === 'OWNERSHIP_REJECTED'` from
 * Wave 2.3 RPCs) doesn't accidentally drop one of the existing shapes.
 */

import { isOwnershipError } from '@/lib/orderAccessControl'

describe('isOwnershipError — recognises both response shapes', () => {
  // ----------------------------------------------------------------
  // Typed-result shape (PostgREST data envelope)
  // ----------------------------------------------------------------

  it('detects `{ success: false, error: "ORDER_OWNED_BY_OTHER_STATION" }` with error=null', () => {
    const result = {
      success: false,
      error: 'ORDER_OWNED_BY_OTHER_STATION',
      owner_station_id: 'b-station',
      caller_station_id: 'a-station'
    }
    expect(isOwnershipError(result, null)).toBe(true)
  })

  it('does NOT match success=true even if error string sneaks in (defensive against backend bugs)', () => {
    const result = {
      success: true,
      error: 'ORDER_OWNED_BY_OTHER_STATION'
    }
    expect(isOwnershipError(result, null)).toBe(false)
  })

  it('does NOT match a different error code on the typed result', () => {
    expect(
      isOwnershipError({ success: false, error: 'ORDER_NOT_FOUND' }, null)
    ).toBe(false)
    expect(
      isOwnershipError({ success: false, error: 'ORDER_FINALIZED' }, null)
    ).toBe(false)
    expect(
      isOwnershipError(
        { success: false, error: 'CONCURRENT_CLAIM' },
        null
      )
    ).toBe(false)
  })

  // ----------------------------------------------------------------
  // Thrown-exception shape (legacy RPC RAISE EXCEPTION)
  // ----------------------------------------------------------------

  it('detects an Error whose message contains the marker', () => {
    const error = new Error(
      'ORDER_OWNED_BY_OTHER_STATION (owner=b, caller=a)'
    )
    expect(isOwnershipError(null, error)).toBe(true)
  })

  it('detects a plain object with a `message` field carrying the marker', () => {
    expect(
      isOwnershipError(null, {
        message: 'ORDER_OWNED_BY_OTHER_STATION'
      })
    ).toBe(true)
  })

  it('matches the marker even when surrounded by other text', () => {
    expect(
      isOwnershipError(null, {
        message:
          'PostgrestError: pg_proc raised: ORDER_OWNED_BY_OTHER_STATION owner=B'
      })
    ).toBe(true)
  })

  it('is case-sensitive — different casing is treated as a different error (regression guard)', () => {
    expect(
      isOwnershipError(null, {
        message: 'order_owned_by_other_station'
      })
    ).toBe(false)
  })

  it('does NOT match an Error with a different message', () => {
    expect(isOwnershipError(null, new Error('Network timeout'))).toBe(false)
    expect(isOwnershipError(null, new Error('ORDER_NOT_FOUND'))).toBe(false)
  })

  // ----------------------------------------------------------------
  // Empty / null inputs
  // ----------------------------------------------------------------

  it('returns false when both args are null', () => {
    expect(isOwnershipError(null, null)).toBe(false)
  })

  it('returns false for undefined inputs', () => {
    expect(isOwnershipError(undefined, undefined)).toBe(false)
  })

  it('returns false for an error with non-string message (defensive)', () => {
    expect(isOwnershipError(null, { message: 12345 })).toBe(false)
    expect(isOwnershipError(null, { message: null })).toBe(false)
    expect(isOwnershipError(null, {})).toBe(false)
  })

  // ----------------------------------------------------------------
  // Both shapes simultaneously — first match wins, but either should fire
  // ----------------------------------------------------------------

  it('returns true if EITHER the result OR the error matches', () => {
    const result = { success: false, error: 'ORDER_OWNED_BY_OTHER_STATION' }
    const error = new Error('Network timeout')
    expect(isOwnershipError(result, error)).toBe(true)

    const result2 = { success: true }
    const error2 = new Error('ORDER_OWNED_BY_OTHER_STATION (owner=b)')
    expect(isOwnershipError(result2, error2)).toBe(true)
  })

  // ----------------------------------------------------------------
  // String error (current behaviour: false-negative, document the gap)
  // ----------------------------------------------------------------

  it('does NOT match a bare-string error (the recogniser only looks at error.message — documented limitation)', () => {
    // Some callers throw plain strings instead of Error objects. The current
    // recogniser only inspects `error.message`, so a bare string slips
    // through. This test pins that behaviour so a future refactor that
    // changes it is intentional, not accidental.
    expect(isOwnershipError(null, 'ORDER_OWNED_BY_OTHER_STATION')).toBe(false)
  })

  // ----------------------------------------------------------------
  // Mutation safety
  // ----------------------------------------------------------------

  it('does not mutate the result or error arguments', () => {
    const result = { success: false, error: 'ORDER_OWNED_BY_OTHER_STATION' }
    const error = new Error('ORDER_OWNED_BY_OTHER_STATION')
    const resultSnap = JSON.parse(JSON.stringify(result))
    const errorMessageSnap = error.message
    isOwnershipError(result, error)
    expect(result).toEqual(resultSnap)
    expect(error.message).toBe(errorMessageSnap)
  })
})
