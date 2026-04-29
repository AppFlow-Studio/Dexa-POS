/**
 * Senior-QA edge-case suite for useSyncStatusStore (PR D.4 + PR E.1).
 *
 * Covers two contracts that are easy to regress and silently:
 *
 *   1. **Failure-toast dedup** — `_maybeFireFailureToast` must fire exactly
 *      once per item per 30s window. Repeated failed↔failed transitions in
 *      that window must not retoast. After the TTL elapses, a fresh failure
 *      *must* retoast (otherwise users miss recurring problems).
 *
 *   2. **`itemFailedAt` stamping** — set on the first transition into
 *      `'failed'`, NOT bumped on subsequent failed→failed sets, and cleared
 *      on any transition out of `'failed'`. The Lever-4 broadcast-merge
 *      filter relies on this monotonic stamp to drop items only after the
 *      5s grace window.
 *
 * Module state reset: `_recentlyToastedFailures` is a module-level `Set`
 * + `setTimeout`. To keep tests isolated, we `jest.resetModules()` before
 * each test and re-require the store.
 */

const mockShow = jest.fn()

// Mock toastService BEFORE the store imports it. The store does
// `import { toastService } from '@/lib/toastService'` at module top-level.
jest.mock('@/lib/toastService', () => ({
  toastService: {
    show: (...args: unknown[]) => mockShow(...args),
    setToast: jest.fn()
  }
}))

type StoreModule = typeof import('@/stores/useSyncStatusStore')

describe('useSyncStatusStore — failure toast dedup + itemFailedAt edge cases', () => {
  let store: StoreModule

  beforeEach(() => {
    jest.resetModules()
    jest.useFakeTimers()
    mockShow.mockReset()
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    store = require('@/stores/useSyncStatusStore')
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  function setStatus (
    itemId: string,
    status: 'pending' | 'syncing' | 'synced' | 'failed',
    error?: string
  ): void {
    store.useSyncStatusStore.getState().setSyncStatus(itemId, status, error)
  }

  // -----------------------------------------------------------------
  // PR D.4 — toast dedup
  // -----------------------------------------------------------------

  it('fires a toast on the FIRST transition into failed', () => {
    setStatus('item_1', 'syncing')
    setStatus('item_1', 'failed', 'Network timeout')

    expect(mockShow).toHaveBeenCalledTimes(1)
    expect(mockShow.mock.calls[0][0]).toMatchObject({
      type: 'warning',
      title: "Couldn't save item"
    })
  })

  it('suppresses a second toast for the same item within the 30s dedup window', () => {
    setStatus('item_1', 'failed', 'first')
    expect(mockShow).toHaveBeenCalledTimes(1)

    // Same item fails again immediately (e.g., a flapping retry):
    // the store treats failed→failed as no-transition (prev === 'failed'),
    // and even synced→failed within the dedup window stays silent.
    setStatus('item_1', 'syncing')
    setStatus('item_1', 'failed', 'second')

    expect(mockShow).toHaveBeenCalledTimes(1)
  })

  it('retoasts after the 30s dedup TTL expires (catches recurring problems)', () => {
    setStatus('item_1', 'failed', 'first')
    expect(mockShow).toHaveBeenCalledTimes(1)

    // Reset prev status so the next failed transition is observable.
    setStatus('item_1', 'syncing')

    // 29.999s — still inside the dedup window. No retoast.
    jest.advanceTimersByTime(29_999)
    setStatus('item_1', 'failed', 'second')
    expect(mockShow).toHaveBeenCalledTimes(1)

    // Reset prev status, then cross the boundary.
    setStatus('item_1', 'syncing')
    jest.advanceTimersByTime(2) // total 30_001 since first toast
    setStatus('item_1', 'failed', 'third')
    expect(mockShow).toHaveBeenCalledTimes(2)
  })

  it('different items each get their own toast — dedup is per-item, not global', () => {
    setStatus('item_a', 'failed')
    setStatus('item_b', 'failed')
    setStatus('item_c', 'failed')

    expect(mockShow).toHaveBeenCalledTimes(3)
  })

  it('failed→failed (without leaving failed) does NOT retoast — prev still failed', () => {
    setStatus('item_1', 'failed', 'first')
    setStatus('item_1', 'failed', 'second')
    setStatus('item_1', 'failed', 'third')

    expect(mockShow).toHaveBeenCalledTimes(1)
  })

  // -----------------------------------------------------------------
  // PR D.4 — batch path
  // -----------------------------------------------------------------

  it('setSyncStatusBatch fires one toast per item transitioning to failed', () => {
    store.useSyncStatusStore.getState().setSyncStatusBatch([
      { itemId: 'item_a', status: 'failed' },
      { itemId: 'item_b', status: 'failed' },
      { itemId: 'item_c', status: 'synced' } // not a failure → no toast
    ])

    expect(mockShow).toHaveBeenCalledTimes(2)
  })

  it('setSyncStatusBatch skips items already in failed state (no double-toast)', () => {
    setStatus('item_a', 'failed')
    expect(mockShow).toHaveBeenCalledTimes(1)

    // Now re-batch with item_a still failed plus a new item_b failing.
    store.useSyncStatusStore.getState().setSyncStatusBatch([
      { itemId: 'item_a', status: 'failed' }, // prev=failed → no toast
      { itemId: 'item_b', status: 'failed' } // prev=undefined → toast
    ])

    expect(mockShow).toHaveBeenCalledTimes(2)
  })

  it('setSyncStatusBatch is a no-op for an empty array', () => {
    store.useSyncStatusStore.getState().setSyncStatusBatch([])
    expect(mockShow).not.toHaveBeenCalled()
  })

  // -----------------------------------------------------------------
  // PR E.1 — itemFailedAt monotonic stamping
  // -----------------------------------------------------------------

  it('stamps itemFailedAt on first failed transition', () => {
    const t0 = Date.now()
    setStatus('item_1', 'failed')

    const stamp = store.useSyncStatusStore.getState().itemFailedAt.get('item_1')
    expect(stamp).toBeDefined()
    expect(stamp).toBeGreaterThanOrEqual(t0)
  })

  it('does NOT bump itemFailedAt on subsequent failed→failed sets — Lever-4 needs the ORIGINAL timestamp', () => {
    setStatus('item_1', 'failed')
    const firstStamp = store.useSyncStatusStore.getState().itemFailedAt.get('item_1')

    jest.advanceTimersByTime(10_000)

    setStatus('item_1', 'failed')
    setStatus('item_1', 'failed')
    const laterStamp = store.useSyncStatusStore.getState().itemFailedAt.get('item_1')

    expect(laterStamp).toBe(firstStamp) // same epoch ms — never bumped
  })

  it('clears itemFailedAt on transition to synced (item recovered)', () => {
    setStatus('item_1', 'failed')
    expect(store.useSyncStatusStore.getState().itemFailedAt.has('item_1')).toBe(true)

    setStatus('item_1', 'synced')
    expect(store.useSyncStatusStore.getState().itemFailedAt.has('item_1')).toBe(false)
  })

  it('clears itemFailedAt on transition to syncing (retry in flight)', () => {
    setStatus('item_1', 'failed')
    setStatus('item_1', 'syncing')
    expect(store.useSyncStatusStore.getState().itemFailedAt.has('item_1')).toBe(false)
  })

  it('clears itemFailedAt on transition to pending (re-queued)', () => {
    setStatus('item_1', 'failed')
    setStatus('item_1', 'pending')
    expect(store.useSyncStatusStore.getState().itemFailedAt.has('item_1')).toBe(false)
  })

  it('re-stamps itemFailedAt with a fresh timestamp on failed→synced→failed cycle', () => {
    setStatus('item_1', 'failed')
    const first = store.useSyncStatusStore.getState().itemFailedAt.get('item_1')!

    setStatus('item_1', 'synced')
    jest.advanceTimersByTime(7_777)

    setStatus('item_1', 'failed')
    const second = store.useSyncStatusStore.getState().itemFailedAt.get('item_1')!

    expect(second).toBeGreaterThan(first)
  })

  // -----------------------------------------------------------------
  // Cleanup paths — clearSyncStatus / clearAllForOrder
  // -----------------------------------------------------------------

  it('clearSyncStatus removes itemFailedAt alongside status + error', () => {
    setStatus('item_1', 'failed', 'oops')
    store.useSyncStatusStore.getState().clearSyncStatus('item_1')

    const s = store.useSyncStatusStore.getState()
    expect(s.itemSyncStatus.has('item_1')).toBe(false)
    expect(s.itemSyncErrors.has('item_1')).toBe(false)
    expect(s.itemFailedAt.has('item_1')).toBe(false)
  })

  it('clearAllForOrder only clears ids in the supplied list, not unrelated items', () => {
    setStatus('item_a', 'failed')
    setStatus('item_b', 'failed')
    setStatus('item_c', 'failed')

    store.useSyncStatusStore.getState().clearAllForOrder(['item_a', 'item_c'])

    const s = store.useSyncStatusStore.getState()
    expect(s.itemFailedAt.has('item_a')).toBe(false)
    expect(s.itemFailedAt.has('item_b')).toBe(true)
    expect(s.itemFailedAt.has('item_c')).toBe(false)
  })

  it('clearAllForOrder is a no-op for an empty array (does not blow away other state)', () => {
    setStatus('item_a', 'failed')
    store.useSyncStatusStore.getState().clearAllForOrder([])

    expect(store.useSyncStatusStore.getState().itemFailedAt.has('item_a')).toBe(true)
  })

  // -----------------------------------------------------------------
  // Counts derivation — important for the Bill section badge
  // -----------------------------------------------------------------

  it('getOrderSyncCounts: untracked items count as synced (status=undefined)', () => {
    setStatus('item_a', 'failed')
    setStatus('item_b', 'pending')

    const counts = store.useSyncStatusStore
      .getState()
      .getOrderSyncCounts(['item_a', 'item_b', 'item_unknown'])
    expect(counts).toEqual({ pending: 1, failed: 1, synced: 1 })
  })

  it('getOrderSyncCounts: status=syncing is bucketed as pending (cashier-facing simplification)', () => {
    setStatus('item_a', 'syncing')
    setStatus('item_b', 'pending')
    const counts = store.useSyncStatusStore
      .getState()
      .getOrderSyncCounts(['item_a', 'item_b'])
    expect(counts.pending).toBe(2)
  })

  // -----------------------------------------------------------------
  // Defensive: error string handling
  // -----------------------------------------------------------------

  it("setSyncStatus without error doesn't clobber an existing error when status !== synced", () => {
    setStatus('item_1', 'failed', 'original error')
    setStatus('item_1', 'failed') // no new error string

    const err = store.useSyncStatusStore.getState().itemSyncErrors.get('item_1')
    expect(err).toBe('original error')
  })

  it('setSyncStatus(synced) without error string clears the prior error', () => {
    setStatus('item_1', 'failed', 'a thing went wrong')
    setStatus('item_1', 'synced')

    expect(store.useSyncStatusStore.getState().itemSyncErrors.has('item_1')).toBe(false)
  })
})
