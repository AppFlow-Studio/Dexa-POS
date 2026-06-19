/**
 * Optimistic TO GO guard — prevents a stale concurrent fetch/broadcast from
 * clobbering an in-flight to-go toggle ("TO GO lost sometimes on broadcast/fetch").
 */
import {
  clearPendingToGo,
  markPendingToGo,
  resolveInboundToGo,
} from '@/lib/pendingToGo'

describe('pendingToGo guard', () => {
  afterEach(() => clearPendingToGo(['a', 'b', 'c']))

  it('passes through the backend value when nothing is pending', () => {
    expect(resolveInboundToGo('a', true)).toBe(true)
    expect(resolveInboundToGo('a', false)).toBe(false)
    expect(resolveInboundToGo(undefined, true)).toBe(true)
  })

  it('keeps the optimistic value while the backend is still stale', () => {
    markPendingToGo(['a'], true)
    // A fetch lands carrying the pre-toggle value (false) — must NOT clobber.
    expect(resolveInboundToGo('a', false)).toBe(true)
    expect(resolveInboundToGo('a', false)).toBe(true) // still protected
  })

  it('auto-clears once the backend agrees, then passes through', () => {
    markPendingToGo(['a'], true)
    expect(resolveInboundToGo('a', false)).toBe(true) // protected
    expect(resolveInboundToGo('a', true)).toBe(true) // server caught up → confirm+clear
    // Marker cleared: a later stale false is now respected (no longer pinned).
    expect(resolveInboundToGo('a', false)).toBe(false)
  })

  it('protects toggling OFF (true → false) symmetrically', () => {
    markPendingToGo(['b'], false)
    expect(resolveInboundToGo('b', true)).toBe(false) // stale true ignored
    expect(resolveInboundToGo('b', false)).toBe(false) // confirmed + cleared
    expect(resolveInboundToGo('b', true)).toBe(true)
  })

  it('clearPendingToGo drops the marker so fetches reconcile (RPC-failure path)', () => {
    markPendingToGo(['c'], true)
    expect(resolveInboundToGo('c', false)).toBe(true) // protected
    clearPendingToGo(['c'])
    expect(resolveInboundToGo('c', false)).toBe(false) // reconciles to DB value
  })
})
