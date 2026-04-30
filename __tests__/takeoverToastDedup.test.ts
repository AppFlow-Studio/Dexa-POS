/**
 * Wave 2.1 — `maybeFireTakeoverToast` dedup contract.
 *
 * The cross-station Take Over flow may produce a flurry of realtime broadcasts
 * (claim_order_v1 UPDATE → trigger → broadcast → potentially several follow-up
 * broadcasts as totals settle). The user must see the "your order was claimed"
 * warning ONCE per orderId per 30s window — not once per broadcast.
 *
 * The helper is module-scoped (its dedup `Set` lives at file load), so we
 * `jest.resetModules()` between tests to reset state. We use fake timers to
 * probe the TTL boundary precisely — too tight and we'd miss recurring
 * take-overs after the same order was reclaimed; too loose and we'd retoast
 * within a single broadcast burst.
 */

import type { OrderProfile } from '@/lib/types'

const mockShow = jest.fn()

// Mock toastService BEFORE the module imports it.
jest.mock('@/lib/toastService', () => ({
  toastService: {
    show: (...args: unknown[]) => mockShow(...args),
    setToast: jest.fn()
  }
}))

type ToastModule = typeof import('@/lib/takeoverToast')

function makeOrder (overrides: Partial<OrderProfile> = {}): OrderProfile {
  return {
    id: 'local-1',
    order_number: 'ORD-20260429-0001',
    items: [],
    ...(overrides as Partial<OrderProfile>)
  } as OrderProfile
}

describe('maybeFireTakeoverToast — Wave 2.1 dedup contract', () => {
  let mod: ToastModule

  beforeEach(() => {
    jest.resetModules()
    jest.useFakeTimers()
    mockShow.mockReset()
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('@/lib/takeoverToast')
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('fires a warning toast on the FIRST call for an orderId', () => {
    mod.maybeFireTakeoverToast('order-A', makeOrder())
    expect(mockShow).toHaveBeenCalledTimes(1)
    expect(mockShow.mock.calls[0][0]).toMatchObject({
      title: 'Order taken over',
      type: 'warning',
      duration: 5000
    })
  })

  it('includes the order_number in the toast message', () => {
    mod.maybeFireTakeoverToast(
      'order-A',
      makeOrder({ order_number: 'ORD-20260429-0042' })
    )
    expect(mockShow.mock.calls[0][0].message).toBe(
      'Order #ORD-20260429-0042 was claimed by another station'
    )
  })

  it('falls back to em-dash when prior is null', () => {
    mod.maybeFireTakeoverToast('order-A', null)
    expect(mockShow.mock.calls[0][0].message).toBe(
      'Order #— was claimed by another station'
    )
  })

  it('falls back to em-dash when order_number is missing', () => {
    const order = makeOrder()
    delete (order as Partial<OrderProfile>).order_number
    mod.maybeFireTakeoverToast('order-A', order)
    expect(mockShow.mock.calls[0][0].message).toBe(
      'Order #— was claimed by another station'
    )
  })

  it('SUPPRESSES a second toast for the same orderId within the 30s dedup window', () => {
    mod.maybeFireTakeoverToast('order-A', makeOrder())
    expect(mockShow).toHaveBeenCalledTimes(1)

    // Same broadcast burst, follow-up event for same order — must stay silent.
    mod.maybeFireTakeoverToast('order-A', makeOrder())
    expect(mockShow).toHaveBeenCalledTimes(1)

    // 29.999s later — still inside the dedup window.
    jest.advanceTimersByTime(29_999)
    mod.maybeFireTakeoverToast('order-A', makeOrder())
    expect(mockShow).toHaveBeenCalledTimes(1)
  })

  it('RETOASTS for the same orderId once the 30s TTL elapses (catches re-claim scenarios)', () => {
    mod.maybeFireTakeoverToast('order-A', makeOrder())
    expect(mockShow).toHaveBeenCalledTimes(1)

    // Cross the boundary — TTL is exclusive, the entry is deleted at 30_000.
    jest.advanceTimersByTime(30_000)

    mod.maybeFireTakeoverToast('order-A', makeOrder())
    expect(mockShow).toHaveBeenCalledTimes(2)
  })

  it('dedup is per-orderId — different orders each toast independently', () => {
    mod.maybeFireTakeoverToast('order-A', makeOrder({ id: 'A' }))
    mod.maybeFireTakeoverToast('order-B', makeOrder({ id: 'B' }))
    mod.maybeFireTakeoverToast('order-C', makeOrder({ id: 'C' }))
    expect(mockShow).toHaveBeenCalledTimes(3)
  })

  it('dedup TTL is independent per orderId — order-A retoasts at 30s without affecting order-B`s window', () => {
    mod.maybeFireTakeoverToast('order-A', makeOrder())
    expect(mockShow).toHaveBeenCalledTimes(1)

    jest.advanceTimersByTime(15_000)
    mod.maybeFireTakeoverToast('order-B', makeOrder())
    expect(mockShow).toHaveBeenCalledTimes(2) // B is fresh

    // 15s more → A's TTL elapses (30s total), B is at 15s.
    jest.advanceTimersByTime(15_000)
    mod.maybeFireTakeoverToast('order-A', makeOrder())
    expect(mockShow).toHaveBeenCalledTimes(3) // A retoasts

    mod.maybeFireTakeoverToast('order-B', makeOrder())
    expect(mockShow).toHaveBeenCalledTimes(3) // B still inside its window
  })

  it('exports the TTL constant so call sites can reference it without redefining', () => {
    expect(mod.TAKEOVER_TOAST_DEDUP_TTL_MS).toBe(30_000)
  })
})
