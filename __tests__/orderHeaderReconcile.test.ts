/**
 * Wave 3.0d-5 — orderHeaderReconcile contract.
 *
 * Trigger + driver around `useOrderStore.syncOrderFromBackendComplete`. We
 * do NOT re-test the merge logic itself — that lives in the store. We DO
 * test the gates this wave introduces:
 *   - terminal-state filter
 *   - pendingBackendUpdates skip + age escape
 *   - 30s cooldown + force bypass
 *   - flag gate
 *   - reconcileAllActiveOrdersHeader iterates ordersById (not persistableOrderIds)
 *     and includes read-only orders
 *   - sync_failed does not abort batch iteration
 *   - 200ms inter-RPC throttle
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

jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => jest.fn()),
  fetch: jest.fn(() =>
    Promise.resolve({ isConnected: true, isInternetReachable: true })
  ),
  configure: jest.fn(),
  useNetInfo: () => ({ isConnected: true, isInternetReachable: true })
}))

jest.mock('@/lib/network/connectionQuality', () => ({
  connectionQuality: {
    isSlow: () => false,
    reportTimeout: jest.fn(),
    reportSuccess: jest.fn()
  }
}))

const origEnv = process.env.EXPO_PUBLIC_ORDER_HEADER_RECONCILE
beforeEach(() => {
  process.env.EXPO_PUBLIC_ORDER_HEADER_RECONCILE = '1'
})
afterAll(() => {
  if (origEnv === undefined) {
    delete process.env.EXPO_PUBLIC_ORDER_HEADER_RECONCILE
  } else {
    process.env.EXPO_PUBLIC_ORDER_HEADER_RECONCILE = origEnv
  }
})

// Mock useOrderStore lazily so each test can set its own ordersById state
// AND control the inner sync mock independently per test.
const mockSyncOrderFromBackendComplete = jest.fn()
const orderStoreState = {
  ordersById: {} as Record<string, any>,
  pendingBackendUpdates: {} as Record<string, { timestamp: number }>,
  syncOrderFromBackendComplete: (...args: any[]) =>
    mockSyncOrderFromBackendComplete(...args)
}
jest.mock('@/stores/useOrderStore', () => ({
  useOrderStore: {
    getState: () => orderStoreState
  }
}))

describe('Wave 3.0d-5 — orderHeaderReconcile', () => {
  let svc: typeof import('@/services/orderHeaderReconcile')

  beforeEach(() => {
    jest.resetModules()
    process.env.EXPO_PUBLIC_ORDER_HEADER_RECONCILE = '1'
    orderStoreState.ordersById = {}
    orderStoreState.pendingBackendUpdates = {}
    mockSyncOrderFromBackendComplete.mockReset()
    mockSyncOrderFromBackendComplete.mockResolvedValue(undefined)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    svc = require('@/services/orderHeaderReconcile')
    svc._resetOrderHeaderReconcileForTests()
  })

  function seedOrder (overrides: Partial<any> = {}): any {
    const order = {
      id: 'order_local_1',
      db_order_id: 'db-uuid-1',
      station_id: 'station-A',
      order_status: 'sent_to_kitchen',
      paid_status: 'Unpaid',
      ...overrides
    }
    orderStoreState.ordersById[order.id] = order
    return order
  }

  it('reconciled — order has db_order_id, no pending updates, cooldown clear', async () => {
    seedOrder()

    const result = await svc.reconcileOrderHeader('order_local_1')

    expect(result.outcome).toBe('reconciled')
    expect(mockSyncOrderFromBackendComplete).toHaveBeenCalledTimes(1)
    expect(mockSyncOrderFromBackendComplete).toHaveBeenCalledWith(
      'order_local_1'
    )
  })

  it('skipped_no_dbid — draft order without db_order_id; inner sync NOT called', async () => {
    seedOrder({ db_order_id: null })

    const result = await svc.reconcileOrderHeader('order_local_1')

    expect(result.outcome).toBe('skipped_no_dbid')
    expect(mockSyncOrderFromBackendComplete).not.toHaveBeenCalled()
  })

  it('skipped_terminal — closed + Paid order is filtered; inner sync NOT called', async () => {
    seedOrder({ order_status: 'closed', paid_status: 'Paid' })

    const result = await svc.reconcileOrderHeader('order_local_1')

    expect(result.outcome).toBe('skipped_terminal')
    expect(mockSyncOrderFromBackendComplete).not.toHaveBeenCalled()
  })

  it('skipped_terminal — voided order is filtered; inner sync NOT called', async () => {
    seedOrder({ order_status: 'voided' })

    const result = await svc.reconcileOrderHeader('order_local_1')

    expect(result.outcome).toBe('skipped_terminal')
    expect(mockSyncOrderFromBackendComplete).not.toHaveBeenCalled()
  })

  it('skipped_pending_updates — fresh pendingBackendUpdates entry blocks reconcile', async () => {
    seedOrder()
    orderStoreState.pendingBackendUpdates['order_local_1'] = {
      timestamp: Date.now() // fresh
    }

    const result = await svc.reconcileOrderHeader('order_local_1')

    expect(result.outcome).toBe('skipped_pending_updates')
    expect(mockSyncOrderFromBackendComplete).not.toHaveBeenCalled()
  })

  it('age escape — pendingBackendUpdates older than 60s does NOT block reconcile', async () => {
    seedOrder()
    orderStoreState.pendingBackendUpdates['order_local_1'] = {
      timestamp: Date.now() - 70_000 // > 60s old; probably dead-lettered
    }

    const result = await svc.reconcileOrderHeader('order_local_1')

    expect(result.outcome).toBe('reconciled')
    expect(mockSyncOrderFromBackendComplete).toHaveBeenCalledTimes(1)
  })

  it('skipped_cooldown — second call within 30s window returns skipped without re-firing', async () => {
    seedOrder()

    const first = await svc.reconcileOrderHeader('order_local_1')
    expect(first.outcome).toBe('reconciled')
    expect(mockSyncOrderFromBackendComplete).toHaveBeenCalledTimes(1)

    mockSyncOrderFromBackendComplete.mockClear()
    const second = await svc.reconcileOrderHeader('order_local_1')
    expect(second.outcome).toBe('skipped_cooldown')
    expect(mockSyncOrderFromBackendComplete).not.toHaveBeenCalled()
  })

  it('force: true bypasses cooldown', async () => {
    seedOrder()

    await svc.reconcileOrderHeader('order_local_1')
    mockSyncOrderFromBackendComplete.mockClear()
    const second = await svc.reconcileOrderHeader('order_local_1', {
      force: true
    })

    expect(second.outcome).toBe('reconciled')
    expect(mockSyncOrderFromBackendComplete).toHaveBeenCalledTimes(1)
  })

  it('force: true bypasses pending-updates gate', async () => {
    seedOrder()
    orderStoreState.pendingBackendUpdates['order_local_1'] = {
      timestamp: Date.now() // fresh; would normally block
    }

    const result = await svc.reconcileOrderHeader('order_local_1', {
      force: true
    })

    expect(result.outcome).toBe('reconciled')
    expect(mockSyncOrderFromBackendComplete).toHaveBeenCalledTimes(1)
  })

  it('skipped_disabled — flag off; inner sync NOT called', async () => {
    process.env.EXPO_PUBLIC_ORDER_HEADER_RECONCILE = ''
    seedOrder()

    const result = await svc.reconcileOrderHeader('order_local_1')

    expect(result.outcome).toBe('skipped_disabled')
    expect(mockSyncOrderFromBackendComplete).not.toHaveBeenCalled()
  })

  it('sync_failed — inner sync throws; outcome includes error message', async () => {
    seedOrder()
    mockSyncOrderFromBackendComplete.mockRejectedValueOnce(
      new Error('network timeout')
    )

    const result = await svc.reconcileOrderHeader('order_local_1')

    expect(result.outcome).toBe('sync_failed')
    expect(result.error).toBe('network timeout')
  })

  it('reconcileAllActiveOrdersHeader walks ordersById and includes read-only (other-station) orders', async () => {
    // Owned order
    seedOrder({ id: 'order_owned', db_order_id: 'db-owned' })
    // Read-only order (different station_id)
    seedOrder({
      id: 'order_readonly',
      db_order_id: 'db-readonly',
      station_id: 'station-OTHER'
    })
    // Terminal order (should be skipped)
    seedOrder({
      id: 'order_terminal',
      db_order_id: 'db-terminal',
      order_status: 'closed',
      paid_status: 'Paid'
    })

    const results = await svc.reconcileAllActiveOrdersHeader()

    expect(results).toHaveLength(3)
    const byId = Object.fromEntries(results.map(r => [r.orderId, r.outcome]))
    expect(byId['order_owned']).toBe('reconciled')
    expect(byId['order_readonly']).toBe('reconciled') // no ownership gate
    expect(byId['order_terminal']).toBe('skipped_terminal')
    // Inner sync called for the two non-terminal orders only
    expect(mockSyncOrderFromBackendComplete).toHaveBeenCalledTimes(2)
    expect(mockSyncOrderFromBackendComplete).toHaveBeenCalledWith('order_owned')
    expect(mockSyncOrderFromBackendComplete).toHaveBeenCalledWith(
      'order_readonly'
    )
  })

  it('sync_failed in batch does not abort iteration over remaining orders', async () => {
    seedOrder({ id: 'order_a', db_order_id: 'db-a' })
    seedOrder({ id: 'order_b', db_order_id: 'db-b' })
    seedOrder({ id: 'order_c', db_order_id: 'db-c' })

    mockSyncOrderFromBackendComplete.mockImplementation(
      async (orderId: string) => {
        if (orderId === 'order_b') throw new Error('boom')
      }
    )

    const results = await svc.reconcileAllActiveOrdersHeader()

    expect(results).toHaveLength(3)
    const byId = Object.fromEntries(results.map(r => [r.orderId, r.outcome]))
    expect(byId['order_a']).toBe('reconciled')
    expect(byId['order_b']).toBe('sync_failed')
    expect(byId['order_c']).toBe('reconciled') // iteration continued past failure
  })

  it('inter-order 200ms throttle is applied between RPCs', async () => {
    jest.useFakeTimers()
    seedOrder({ id: 'order_a', db_order_id: 'db-a' })
    seedOrder({ id: 'order_b', db_order_id: 'db-b' })
    seedOrder({ id: 'order_c', db_order_id: 'db-c' })

    const promise = svc.reconcileAllActiveOrdersHeader()

    // First order resolves immediately (mock is synchronous resolve).
    // Each subsequent order waits 200ms.
    // Use real timers for the await chain, advance fake timer for delays.
    await jest.advanceTimersByTimeAsync(200) // gap between order_a and order_b
    await jest.advanceTimersByTimeAsync(200) // gap between order_b and order_c

    const results = await promise

    expect(results).toHaveLength(3)
    expect(mockSyncOrderFromBackendComplete).toHaveBeenCalledTimes(3)
    jest.useRealTimers()
  })
})
