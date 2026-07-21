/**
 * Wave 2.8 — markOperationBlocked + dispatcher invariants
 *
 * Tests the side-channel "blocked" mechanism that prevents add_item ops
 * from burning their retry budget while waiting for create_order to sync.
 *
 * State note: offlineSyncService maintains module-level singleton arrays
 * (pendingOperations, deadLetterQueue). Each test isolates via jest.resetModules
 * so we get a fresh queue.
 */

// uuid is ESM in newer versions; jest-expo doesn't transform it. Stub.
jest.mock('uuid', () => ({
  v4: () => `uuid-${Math.random().toString(36).slice(2, 10)}`,
  v5: (name: string) => `v5-${name}`
}))

// Storage mock — service expects sync MMKV-style API. Backed by an in-memory
// Map so persistence-shape calls work without writing to a real device.
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
    mmkvStorage: {
      getItem: jest.fn(),
      setItem: jest.fn(),
      removeItem: jest.fn()
    }
  }
})

// Stub useOrderStore — markOperationBlocked uses it lazily to check void status.
jest.mock('@/stores/useOrderStore', () => ({
  useOrderStore: {
    getState: () => ({ ordersById: {} })
  }
}))

// Avoid pulling the connectionQuality singleton from another test file's state.
jest.mock('@/lib/network/connectionQuality', () => ({
  connectionQuality: {
    isSlow: () => false,
    reportTimeout: jest.fn(),
    reportSuccess: jest.fn()
  }
}))

// Feature flag: default true (enabled). Each test can flip via the holder.
const mockFlagHolder = { enabled: true }
jest.mock('@/lib/network/featureFlags', () => ({
  isBlockedAddItemEnabled: () => mockFlagHolder.enabled,
  setBlockedAddItemEnabled: (v: boolean) => {
    mockFlagHolder.enabled = v
  }
}))

describe('Wave 2.8: markOperationBlocked + dispatcher', () => {
  let service: typeof import('@/services/offlineSyncService')

  beforeEach(() => {
    jest.resetModules()
    mockFlagHolder.enabled = true
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    service = require('@/services/offlineSyncService')
  })

  function queueAddItem (localOrderId = 'order_test_1', localItemId = 'item_1') {
    return service.queueOperation({
      type: 'add_item',
      params: { localOrderId, localItemId },
      localOrderId,
      localItemId
    })
  }

  it('markOperationBlocked: flips status to blocked, sets blockedAtMs, increments blockCount', async () => {
    const opId = await queueAddItem()
    const before = service.getOperationsForOrder('order_test_1')[0]
    expect(before.status).toBe('pending')
    expect(before.retryCount).toBe(0)
    expect(before.blockCount).toBeUndefined()

    await service.markOperationBlocked(opId, 'order_id_unresolved')

    const after = service.getOperationsForOrder('order_test_1')[0]
    expect(after.status).toBe('blocked')
    expect(after.blockCount).toBe(1)
    expect(after.blockReason).toBe('order_id_unresolved')
    expect(after.blockedAtMs).toBeGreaterThan(0)
    // Critical invariant: retry budget is preserved.
    expect(after.retryCount).toBe(0)
  })

  it('markOperationBlocked: increments blockCount on repeated calls but does not bump retryCount', async () => {
    const opId = await queueAddItem()

    await service.markOperationBlocked(opId, 'r1')
    await service.markOperationBlocked(opId, 'r2')
    await service.markOperationBlocked(opId, 'r3')

    const after = service.getOperationsForOrder('order_test_1')[0]
    expect(after.blockCount).toBe(3)
    expect(after.retryCount).toBe(0)
    expect(after.blockReason).toBe('r3')
  })

  it('markOperationBlocked: dead-letters after MAX_BLOCK_COUNT (20) ping-pongs', async () => {
    const opId = await queueAddItem()

    // 20 blocks should still keep it in active queue.
    for (let i = 0; i < 20; i++) {
      await service.markOperationBlocked(opId, 'pingpong')
    }
    expect(service.getOperationsForOrder('order_test_1')).toHaveLength(1)

    // 21st transition tips it over — moved to dead-letter.
    await service.markOperationBlocked(opId, 'pingpong')

    expect(service.getOperationsForOrder('order_test_1')).toHaveLength(0)
    const dead = service.getDeadLetterOperations()
    expect(dead.find(op => op.id === opId)).toBeDefined()
  })

  it('markOperationBlocked: kill-switch flag off → no-op', async () => {
    mockFlagHolder.enabled = false

    const opId = await queueAddItem()
    await service.markOperationBlocked(opId, 'order_id_unresolved')

    const after = service.getOperationsForOrder('order_test_1')[0]
    // Status unchanged — caller falls back to legacy retry-burning behavior.
    expect(after.status).toBe('pending')
    expect(after.blockCount).toBeUndefined()
  })

  it('cancelOrderOperations: discards blocked ops (regression for 2.8d)', async () => {
    const opId = await queueAddItem('order_test_voided', 'item_x')
    await service.markOperationBlocked(opId, 'order_id_unresolved')

    expect(
      service.getOperationsForOrder('order_test_voided')[0].status
    ).toBe('blocked')

    await service.cancelOrderOperations('order_test_voided')

    // Cancel marks status='discarded', preventing wake-on-create_order.
    const ops = service.getOperationsForOrder('order_test_voided')
    expect(ops).toHaveLength(1)
    expect(ops[0].status).toBe('discarded')
  })

  it('isTransientError: matches idempotency_in_flight (Postgres 40001)', async () => {
    const { isTransientError } = service
    expect(
      isTransientError({
        code: '40001',
        message: 'idempotency_in_flight: key abc-123'
      })
    ).toBe(true)
    // Permanent 4xx still permanent.
    expect(isTransientError({ status: 404 })).toBe(false)
    expect(isTransientError({ status: 500 })).toBe(true)
  })

  it('markOperationBlocked: discards op if order has been voided since queueing', async () => {
    // Override the useOrderStore mock to return a voided order, then reload.
    jest.resetModules()
    mockFlagHolder.enabled = true
    jest.doMock('@/stores/useOrderStore', () => ({
      useOrderStore: {
        getState: () => ({
          ordersById: {
            order_voided_test: { order_status: 'void' }
          }
        })
      }
    }))
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const reloaded: typeof import('@/services/offlineSyncService') = require('@/services/offlineSyncService')

    const opId = await reloaded.queueOperation({
      type: 'add_item',
      params: { localOrderId: 'order_voided_test', localItemId: 'item_v' },
      localOrderId: 'order_voided_test',
      localItemId: 'item_v'
    })

    await reloaded.markOperationBlocked(opId, 'order_id_unresolved')

    const ops = reloaded.getOperationsForOrder('order_voided_test')
    expect(ops[0].status).toBe('discarded')
    expect(ops[0].blockCount).toBeUndefined()
  })
})
