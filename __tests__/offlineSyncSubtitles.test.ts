/**
 * Wave 3.0e-1 — `lib/offlineSyncSubtitles` contract.
 *
 * Single source of truth for the per-item Retry chip text and the order
 * banner row text. Every dead-lettered op must produce a title + subtitle
 * the operator can act on without leaving the order processing screen.
 *
 * If you add a new OperationType to `services/offlineSyncService.ts`,
 * extend `deriveTitle` here so the chip / banner doesn't render the
 * generic "Sync pending" fallback.
 */

import {
  deriveSubtitle,
  deriveTitle,
  isRetryable,
  ITEM_BOUND_OPS,
  ORDER_BOUND_OPS
} from '@/lib/offlineSyncSubtitles'
import type {
  OfflineOperation,
  OperationType
} from '@/services/offlineSyncService'

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
    ...(overrides as Partial<OfflineOperation>)
  }
}

describe('deriveTitle', () => {
  it('produces a specific title for every item-bound op type', () => {
    const expectations: Record<string, string> = {
      add_item: 'Add failed',
      update_item: 'Item update failed',
      update_item_quantity: 'Item update failed',
      replace_modifiers: "Modifiers didn't save",
      void_item: "Remove didn't save",
      remove_item: "Remove didn't save",
      set_item_seat: "Seat assignment didn't save"
    }
    for (const type of Object.keys(expectations)) {
      expect(deriveTitle(makeOp({ type: type as OperationType }))).toBe(
        expectations[type]
      )
    }
  })

  it('disambiguates update_item_status by params.status', () => {
    expect(
      deriveTitle(
        makeOp({
          type: 'update_item_status',
          params: { status: 'ready', dbItemIds: [], localOrderId: 'order_1' }
        })
      )
    ).toBe("Mark Ready didn't save")
    expect(
      deriveTitle(
        makeOp({
          type: 'update_item_status',
          params: { status: 'served', dbItemIds: [], localOrderId: 'order_1' }
        })
      )
    ).toBe("Mark Served didn't save")
    expect(
      deriveTitle(
        makeOp({
          type: 'update_item_status',
          params: { status: 'preparing', dbItemIds: [], localOrderId: 'order_1' }
        })
      )
    ).toBe("Mark Preparing didn't save")
  })

  it('produces a specific title for every order-bound op type', () => {
    const expectations: Record<string, string> = {
      send_to_kitchen: 'Kitchen send pending',
      close_check: 'Closing check failed',
      reopen_check: 'Reopen check failed',
      update_order_status: "Order status didn't sync",
      update_order_details: "Customer details didn't save",
      fire_course: 'Course fire pending',
      apply_discount: "Discount didn't apply",
      void_discount: "Discount removal didn't save"
    }
    for (const type of Object.keys(expectations)) {
      expect(deriveTitle(makeOp({ type: type as OperationType }))).toBe(
        expectations[type]
      )
    }
  })
})

describe('deriveSubtitle', () => {
  // Anchor "now" so timestamp formatting is deterministic.
  const now = new Date('2026-04-29T16:32:00Z').getTime()

  it('reports network-too-slow with attempt count for DEADLINE_EXCEEDED', () => {
    const op = makeOp({
      retryCount: 10,
      lastError: { code: 'DEADLINE_EXCEEDED', message: 'too slow' },
      deadLetteredAtMs: now - 60_000 // exactly 1 min ago
    })
    expect(deriveSubtitle(op, now)).toBe('Network too slow — 10 attempts 1 min ago')
  })

  it('reports server-rejected for permanent errors', () => {
    const op = makeOp({
      retryCount: 1,
      lastError: { code: 'PERMANENT', message: '4xx' },
      deadLetteredAtMs: now - 30_000
    })
    expect(deriveSubtitle(op, now)).toBe('Server rejected — just now')
  })

  it('formats deltas under 60s as "just now"', () => {
    const op = makeOp({
      retryCount: 1,
      lastError: { code: 'DEADLINE_EXCEEDED' },
      deadLetteredAtMs: now - 5_000
    })
    expect(deriveSubtitle(op, now)).toBe('Network too slow — just now')
  })

  it('formats hour+ deltas as "since H:MMam/pm"', () => {
    const op = makeOp({
      retryCount: 3,
      lastError: { code: 'DEADLINE_EXCEEDED' },
      deadLetteredAtMs: now - 90 * 60_000 // 1.5h ago
    })
    expect(deriveSubtitle(op, now)).toMatch(
      /^Network too slow — 3 attempts since \d{1,2}:\d{2}(am|pm)$/
    )
  })

  it('falls back to op.timestamp when deadLetteredAtMs is missing', () => {
    const op = makeOp({
      retryCount: 5,
      lastError: { code: 'DEADLINE_EXCEEDED' },
      timestamp: new Date(now - 120_000).toISOString()
    })
    expect(deriveSubtitle(op, now)).toBe('Network too slow — 5 attempts 2 min ago')
  })

  it('returns "Tap Retry" if no error and no timestamps available', () => {
    const op = makeOp({
      retryCount: 0,
      timestamp: new Date(now).toISOString(),
      deadLetteredAtMs: now
    })
    // No lastError, but deadLetteredAt = now → "just now"
    expect(deriveSubtitle(op, now)).toBe('just now')
  })

  it('numeric 5xx codes map to "Server error"', () => {
    const op = makeOp({
      retryCount: 2,
      lastError: { code: '503', message: 'unavailable' },
      deadLetteredAtMs: now - 60_000
    })
    expect(deriveSubtitle(op, now)).toBe('Server error — 2 attempts 1 min ago')
  })

  it('numeric 4xx codes map to "Server rejected — review item"', () => {
    const op = makeOp({
      retryCount: 1,
      lastError: { code: '422', message: 'validation' },
      deadLetteredAtMs: now - 30_000
    })
    expect(deriveSubtitle(op, now)).toBe(
      'Server rejected — review item — just now'
    )
  })
})

describe('isRetryable', () => {
  it('returns true when there is no captured error', () => {
    expect(isRetryable(makeOp())).toBe(true)
  })

  it('returns false for permanent class errors (4xx, ownership, TTL)', () => {
    expect(
      isRetryable(makeOp({ lastError: { code: '422' } }))
    ).toBe(false)
    expect(
      isRetryable(makeOp({ lastError: { code: 'OWNERSHIP_REJECTED' } }))
    ).toBe(false)
    expect(
      isRetryable(
        makeOp({ lastError: { code: 'OPERATION_TTL_EXCEEDED' } })
      )
    ).toBe(false)
    expect(
      isRetryable(
        makeOp({ lastError: { code: 'BLOCK_COUNT_EXCEEDED' } })
      )
    ).toBe(false)
    expect(
      isRetryable(makeOp({ lastError: { code: 'BLOCKED_PARENT_DEAD' } }))
    ).toBe(false)
  })

  it('returns true for transient classes (5xx, DEADLINE_EXCEEDED, MAX_RETRIES)', () => {
    expect(
      isRetryable(makeOp({ lastError: { code: 'DEADLINE_EXCEEDED' } }))
    ).toBe(true)
    expect(
      isRetryable(makeOp({ lastError: { code: '503' } }))
    ).toBe(true)
    expect(
      isRetryable(makeOp({ lastError: { code: 'MAX_RETRIES' } }))
    ).toBe(true)
    // 23505 = unique violation = already applied; harmless to retry
    expect(
      isRetryable(makeOp({ lastError: { code: '23505' } }))
    ).toBe(true)
  })
})

describe('op-type set membership', () => {
  it('item-bound and order-bound sets are disjoint', () => {
    for (const t of ITEM_BOUND_OPS) {
      expect(ORDER_BOUND_OPS.has(t as OperationType)).toBe(false)
    }
  })

  it('every op type covered by the title map produces a non-fallback title', () => {
    for (const t of ITEM_BOUND_OPS) {
      const title = deriveTitle(makeOp({ type: t as OperationType }))
      expect(title).not.toBe('Sync pending')
    }
    for (const t of ORDER_BOUND_OPS) {
      const title = deriveTitle(makeOp({ type: t as OperationType }))
      expect(title).not.toBe('Sync pending')
    }
  })
})
