/**
 * Card payments are never silently lost (2026-09-25 incident, Bread & Butter).
 *
 * A $15.13 card charge was approved on the Valor, its process_payment op sat
 * blocked behind an unsynced item, staff voided the order, and the void
 * discarded the queued payment — no record, no refund. These tests pin the
 * invariant: an approved charge ends synced, refunded, or visibly parked.
 */

jest.mock('uuid', () => ({
  v4: () => `uuid-${Math.random().toString(36).slice(2, 10)}`,
  v5: (name: string) => `v5-${name}`
}))

jest.mock('@/lib/storage', () => {
  const mem = new Map<string, unknown>()
  return {
    storage: {
      getString: jest.fn((k: string) => mem.get(k) as string | undefined),
      set: jest.fn((k: string, v: unknown) => mem.set(k, v)),
      delete: jest.fn((k: string) => mem.delete(k)),
      contains: jest.fn((k: string) => mem.has(k)),
      getBoolean: jest.fn((k: string) => mem.get(k) as boolean | undefined),
      getNumber: jest.fn((k: string) => mem.get(k) as number | undefined)
    },
    getSyncJSON: jest.fn(<T>(k: string) => (mem.get(k) as T) ?? null),
    setSyncJSON: jest.fn((k: string, v: unknown) => mem.set(k, v)),
    mmkvStorage: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() }
  }
})

const mockOrders: Record<string, { order_status?: string }> = {}
jest.mock('@/stores/useOrderStore', () => ({
  useOrderStore: { getState: () => ({ ordersById: mockOrders }) }
}))

jest.mock('@/lib/network/connectionQuality', () => ({
  connectionQuality: { isSlow: () => false, reportTimeout: jest.fn(), reportSuccess: jest.fn() }
}))

jest.mock('@/lib/network/featureFlags', () => ({
  isBlockedAddItemEnabled: () => true,
  setBlockedAddItemEnabled: jest.fn()
}))

import {
  describeVoidBlock,
  getUnrefundedCardCharges,
  isCardPaymentVoidRefusal
} from '@/lib/paymentGuards'

// ---------------------------------------------------------------------------
// Pure guard
// ---------------------------------------------------------------------------

const card = (over: Record<string, unknown> = {}) => ({
  method: 'Card' as const,
  status: 'captured' as const,
  isVoided: false,
  amount: 15.13,
  total_collected: 15.13,
  last4: '4549',
  sync_status: 'pending' as const,
  ...over
})

describe('getUnrefundedCardCharges', () => {
  it('counts an unsynced captured card payment (the incident)', () => {
    const charges = getUnrefundedCardCharges([card()])
    expect(charges).toHaveLength(1)
    expect(charges[0]).toMatchObject({ source: 'payment', amount: 15.13, synced: false })
  })

  it('counts a synced captured card payment (user decision: block until refunded)', () => {
    const charges = getUnrefundedCardCharges([card({ sync_status: 'synced', db_payment_id: 'p1' })])
    expect(charges).toHaveLength(1)
    expect(charges[0].synced).toBe(true)
  })

  it('ignores voided, returned, fully refunded, cash and pre-auth payments', () => {
    expect(
      getUnrefundedCardCharges([
        card({ isVoided: true }),
        card({ isReturned: true }),
        card({ refundedAmount: 15.13 }),
        card({ method: 'Cash' }),
        card({ status: 'authorized' })
      ])
    ).toHaveLength(0)
  })

  it('counts the remainder of a partially refunded card payment', () => {
    const [c] = getUnrefundedCardCharges([card({ refundedAmount: 5 })])
    expect(c.amount).toBeCloseTo(10.13)
  })

  it('counts a terminal_approved card journal with no payment on the order', () => {
    const charges = getUnrefundedCardCharges([], [
      { id: 'j1', paymentMethod: 'Card', status: 'terminal_approved', amount: 3.26 }
    ])
    expect(charges).toEqual([
      { source: 'journal', amount: 3.26, synced: false, journalId: 'j1' }
    ])
  })

  it('does not double-count a journal whose payment is already on the order', () => {
    const charges = getUnrefundedCardCharges(
      [card({ transactionDetails: { paymentJournalHandle: { id: 'j1', idempotencyKey: 'k' } } })],
      [{ id: 'j1', paymentMethod: 'Card', status: 'terminal_approved', amount: 15.13 }]
    )
    expect(charges).toHaveLength(1)
    expect(charges[0].source).toBe('payment')
  })

  it('ignores failed (declined) and cash journals', () => {
    expect(
      getUnrefundedCardCharges([], [
        { id: 'a', paymentMethod: 'Card', status: 'failed', amount: 5 },
        { id: 'b', paymentMethod: 'Cash', status: 'terminal_approved', amount: 5 }
      ])
    ).toHaveLength(0)
  })

  it('describes the block with amount and card', () => {
    const text = describeVoidBlock(getUnrefundedCardCharges([card()]))
    expect(text).toContain('$15.13')
    expect(text).toContain('••4549')
  })

  it('recognises the server P0010 refusal', () => {
    expect(isCardPaymentVoidRefusal({ code: 'P0010' })).toBe(true)
    expect(isCardPaymentVoidRefusal({ message: 'ORDER_HAS_CAPTURED_CARD_PAYMENTS' })).toBe(true)
    expect(isCardPaymentVoidRefusal({ code: '23505' })).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Legacy queue never drops a payment op
// ---------------------------------------------------------------------------

describe('offline queue keeps payment ops', () => {
  let service: typeof import('@/services/offlineSyncService')

  beforeEach(() => {
    jest.resetModules()
    for (const k of Object.keys(mockOrders)) delete mockOrders[k]
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    service = require('@/services/offlineSyncService')
  })

  const queuePayment = (localOrderId = 'order_1', journalId = 'journal_1') =>
    service.queueOperation({
      type: 'process_payment',
      params: {
        params: { p_order_id: localOrderId, p_payment_method: 'card', p_amount: 15.13 },
        paymentJournal: { id: journalId, idempotencyKey: 'key_1' }
      },
      localOrderId
    })

  it('cancelOrderOperations (void) keeps the payment op queued', async () => {
    await queuePayment()
    await service.queueOperation({
      type: 'send_to_kitchen',
      params: {},
      localOrderId: 'order_1'
    })

    await service.cancelOrderOperations('order_1')

    const ops = service.getOperationsForOrder('order_1')
    const byType = Object.fromEntries(ops.map(o => [o.type, o.status]))
    expect(byType.process_payment).not.toBe('discarded')
    expect(byType.send_to_kitchen).toBe('discarded')
  })

  it('a blocked payment on a voided order is dead-lettered, not discarded', async () => {
    const opId = await queuePayment()
    mockOrders.order_1 = { order_status: 'void' }

    await service.markOperationBlocked(opId, 'item_not_synced')

    const dead = service.getDeadLetterOperations()
    expect(dead).toHaveLength(1)
    expect(dead[0].type).toBe('process_payment')
    expect(dead[0].lastError?.code).toBe('PAYMENT_ORDER_VOID')
    expect(service.getOperationsForOrder('order_1')).toHaveLength(0)
  })

  it('hasQueuedPaymentForJournal sees queued and dead-lettered payments', async () => {
    const opId = await queuePayment('order_1', 'journal_x')
    expect(service.hasQueuedPaymentForJournal('journal_x')).toBe(true)
    expect(service.hasQueuedPaymentForJournal('journal_other')).toBe(false)

    mockOrders.order_1 = { order_status: 'void' }
    await service.markOperationBlocked(opId, 'item_not_synced')
    expect(service.hasQueuedPaymentForJournal('journal_x')).toBe(true)
  })

  it('dead-letter cap evicts non-payment ops first, never payments', () => {
    service._devSeedDeadLetter({ type: 'process_payment', localOrderId: 'order_pay' })
    for (let i = 0; i < 60; i++) {
      service._devSeedDeadLetter({ type: 'send_to_kitchen', localOrderId: `order_${i}` })
    }
    const dead = service.getDeadLetterOperations()
    expect(dead.length).toBe(50)
    expect(dead.some(o => o.type === 'process_payment')).toBe(true)
  })

  it('Retry resets blockCount so a BLOCK_COUNT_EXCEEDED op does not bounce straight back', async () => {
    const opId = await service.queueOperation({
      type: 'add_item',
      params: { localOrderId: 'order_2', localItemId: 'i1' },
      localOrderId: 'order_2',
      localItemId: 'i1'
    })
    for (let i = 0; i < 21; i++) await service.markOperationBlocked(opId, 'order_id_unresolved')
    expect(service.getDeadLetterOperations().map(o => o.id)).toContain(opId)

    await service.retryDeadLetterOperation(opId)

    const [op] = service.getOperationsForOrder('order_2')
    expect(op.status).toBe('pending')
    expect(op.blockCount).toBe(0)
    expect(op.blockReason).toBeUndefined()
  })
})
