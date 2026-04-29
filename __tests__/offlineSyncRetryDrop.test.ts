/**
 * Senior-QA edge-case suite for offlineSyncService PR D.2:
 * `retrySyncForItem` (the "Retry" affordance) and `dropQueuedOpsForItem`
 * (the "Remove" affordance). The cashier sees these on the FailedItemRow
 * and reaches them via item id, so cross-order/cross-item isolation must
 * be airtight or one user's tap nukes another order's queue.
 *
 * Module state: offlineSyncService maintains module-level singleton arrays.
 * Each test isolates via jest.resetModules() — same pattern as
 * offlineSyncBlocking.test.ts.
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
    mmkvStorage: {
      getItem: jest.fn(),
      setItem: jest.fn(),
      removeItem: jest.fn()
    }
  }
})

jest.mock('@/stores/useOrderStore', () => ({
  useOrderStore: {
    getState: () => ({ ordersById: {} })
  }
}))

jest.mock('@/lib/network/connectionQuality', () => ({
  connectionQuality: {
    isSlow: () => false,
    reportTimeout: jest.fn(),
    reportSuccess: jest.fn()
  }
}))

jest.mock('@/lib/network/featureFlags', () => ({
  isBlockedAddItemEnabled: () => true,
  setBlockedAddItemEnabled: jest.fn()
}))

describe('offlineSyncService — retrySyncForItem / dropQueuedOpsForItem (PR D.2)', () => {
  let svc: typeof import('@/services/offlineSyncService')

  beforeEach(() => {
    jest.resetModules()
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    svc = require('@/services/offlineSyncService')
  })

  async function queueAddItem (
    localOrderId: string,
    localItemId: string
  ): Promise<string> {
    return svc.queueOperation({
      type: 'add_item',
      params: { localOrderId, localItemId },
      localOrderId,
      localItemId
    })
  }

  function findOp (
    opId: string
  ): import('@/services/offlineSyncService').OfflineOperation | undefined {
    return svc.getQueueSnapshot().find(o => o.id === opId)
  }

  // ----------------------------------------------------------------
  // retrySyncForItem
  // ----------------------------------------------------------------

  it('retrySyncForItem returns 0 when no ops match the item id', async () => {
    await queueAddItem('order_1', 'item_alpha')
    const count = await svc.retrySyncForItem('item_unknown')
    expect(count).toBe(0)
    // Pre-existing op is untouched.
    expect(svc.getOperationsForOrder('order_1')).toHaveLength(1)
  })

  it('retrySyncForItem resets retryCount, status, and firstAttemptedAtMs on a failed pending op', async () => {
    const opId = await queueAddItem('order_1', 'item_1')
    const op = findOp(opId)!
    op.status = 'failed'
    op.retryCount = 4
    op.firstAttemptedAtMs = Date.now() - 60_000

    const count = await svc.retrySyncForItem('item_1')
    expect(count).toBe(1)

    const after = findOp(opId)!
    expect(after.status).toBe('pending')
    expect(after.retryCount).toBe(0)
    expect(after.firstAttemptedAtMs).toBeUndefined()
  })

  it('retrySyncForItem leaves a pending (non-failed) op untouched but does not count it', async () => {
    const opId = await queueAddItem('order_1', 'item_1')
    const before = findOp(opId)!
    expect(before.status).toBe('pending') // freshly queued
    expect(before.retryCount).toBe(0)

    const count = await svc.retrySyncForItem('item_1')
    expect(count).toBe(0) // already pending, nothing to "retry"

    const after = findOp(opId)!
    expect(after.status).toBe('pending')
    expect(after.retryCount).toBe(0)
  })

  it('retrySyncForItem does NOT touch other items in the same order', async () => {
    const opA = await queueAddItem('order_1', 'item_a')
    const opB = await queueAddItem('order_1', 'item_b')

    findOp(opA)!.status = 'failed'
    findOp(opA)!.retryCount = 5
    findOp(opB)!.status = 'failed'
    findOp(opB)!.retryCount = 5

    const count = await svc.retrySyncForItem('item_a')
    expect(count).toBe(1)

    expect(findOp(opA)!.status).toBe('pending')
    // Item B must remain failed — cross-item isolation is the whole point.
    expect(findOp(opB)!.status).toBe('failed')
    expect(findOp(opB)!.retryCount).toBe(5)
  })

  it('retrySyncForItem retries multiple ops on the same item (e.g., add + modifier add)', async () => {
    const op1 = await svc.queueOperation({
      type: 'add_item',
      params: { localOrderId: 'order_1', localItemId: 'item_combo' },
      localOrderId: 'order_1',
      localItemId: 'item_combo'
    })
    const op2 = await svc.queueOperation({
      type: 'add_order_item_modifier' as never, // intentional: we just need a different op type
      params: { localOrderId: 'order_1', localItemId: 'item_combo' },
      localOrderId: 'order_1',
      localItemId: 'item_combo'
    } as never)

    findOp(op1)!.status = 'failed'
    findOp(op1)!.retryCount = 3
    findOp(op2)!.status = 'failed'
    findOp(op2)!.retryCount = 3

    const count = await svc.retrySyncForItem('item_combo')
    expect(count).toBe(2)
    expect(findOp(op1)!.status).toBe('pending')
    expect(findOp(op2)!.status).toBe('pending')
  })

  // ----------------------------------------------------------------
  // dropQueuedOpsForItem
  // ----------------------------------------------------------------

  it('dropQueuedOpsForItem returns 0 when no ops match', async () => {
    await queueAddItem('order_1', 'item_alpha')
    const count = await svc.dropQueuedOpsForItem('item_does_not_exist')
    expect(count).toBe(0)
    expect(svc.getOperationsForOrder('order_1')).toHaveLength(1)
  })

  it('dropQueuedOpsForItem removes pending ops for that item', async () => {
    const opId = await queueAddItem('order_1', 'item_1')
    expect(findOp(opId)).toBeDefined()

    const count = await svc.dropQueuedOpsForItem('item_1')
    expect(count).toBe(1)
    expect(findOp(opId)).toBeUndefined()
  })

  it('dropQueuedOpsForItem keeps OTHER items in the same order intact (cross-item isolation)', async () => {
    const opA = await queueAddItem('order_1', 'item_a')
    const opB = await queueAddItem('order_1', 'item_b')

    const count = await svc.dropQueuedOpsForItem('item_a')
    expect(count).toBe(1)

    expect(findOp(opA)).toBeUndefined()
    expect(findOp(opB)).toBeDefined()
  })

  it('dropQueuedOpsForItem keeps OTHER orders intact when item ids are namespaced', async () => {
    const op1 = await queueAddItem('order_1', 'item_x')
    const op2 = await queueAddItem('order_2', 'item_y')

    await svc.dropQueuedOpsForItem('item_x')

    expect(findOp(op1)).toBeUndefined()
    expect(findOp(op2)).toBeDefined()
  })

  it('dropQueuedOpsForItem removes multiple ops for the same item across types', async () => {
    const op1 = await queueAddItem('order_1', 'item_combo')
    const op2 = await svc.queueOperation({
      type: 'update_item_quantity',
      params: { localOrderId: 'order_1', localItemId: 'item_combo', quantity: 2 },
      localOrderId: 'order_1',
      localItemId: 'item_combo'
    })

    const count = await svc.dropQueuedOpsForItem('item_combo')
    expect(count).toBe(2)

    expect(findOp(op1)).toBeUndefined()
    expect(findOp(op2)).toBeUndefined()
  })
})
