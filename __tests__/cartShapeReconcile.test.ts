/**
 * Wave 3.0f-3 — cartShapeReconcile contract.
 *
 * "What I see is what happens." When the local cart diverges from the server
 * (qty=3 local, qty=1 server), the reconcile queues the existing per-RPC
 * ops to push local→server. Strict scoping:
 *   - Only owned orders push.
 *   - Other-station orders return 'skipped_unowned' (caller refresh-reads).
 *   - Cooldown prevents thrash.
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

jest.mock('@/lib/network/featureFlags', () => ({
  isBlockedAddItemEnabled: () => true,
  setBlockedAddItemEnabled: jest.fn()
}))

// Toggleable feature flag.
const flagHolder = { enabled: true }
const origEnv = process.env.EXPO_PUBLIC_CART_SHAPE_RECONCILE
beforeEach(() => {
  process.env.EXPO_PUBLIC_CART_SHAPE_RECONCILE = flagHolder.enabled ? '1' : ''
})
afterAll(() => {
  if (origEnv === undefined) {
    delete process.env.EXPO_PUBLIC_CART_SHAPE_RECONCILE
  } else {
    process.env.EXPO_PUBLIC_CART_SHAPE_RECONCILE = origEnv
  }
})

// Mock useOrderStore lazily so each test can set its own ordersById state.
const orderStoreState = {
  ordersById: {} as Record<string, any>,
  persistableOrderIds: {} as Record<string, true>,
  currentStationId: 'station-A' as string | null
}
jest.mock('@/stores/useOrderStore', () => ({
  useOrderStore: {
    getState: () => orderStoreState
  }
}))

// Mock OrderService.fetchOrderById to control the server snapshot.
// Variable prefixed with `mock` so Jest's hoist-safety check allows it.
const mockFetchOrderById = jest.fn()
jest.mock('@/services/orderService', () => ({
  OrderService: {
    fetchOrderById: (...args: any[]) => mockFetchOrderById(...args)
  }
}))

describe('Wave 3.0f-3 — cartShapeReconcile', () => {
  let svc: typeof import('@/services/cartShapeReconcile')
  let queue: typeof import('@/services/offlineSyncService')

  beforeEach(() => {
    jest.resetModules()
    flagHolder.enabled = true
    process.env.EXPO_PUBLIC_CART_SHAPE_RECONCILE = '1'
    orderStoreState.ordersById = {}
    orderStoreState.persistableOrderIds = {}
    orderStoreState.currentStationId = 'station-A'
    mockFetchOrderById.mockReset()
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    queue = require('@/services/offlineSyncService')
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    svc = require('@/services/cartShapeReconcile')
    svc._resetCartShapeReconcileForTests()
    // Provide a non-null Supabase client (mocked at jest-setup level).
    svc.setCartShapeReconcileSupabaseClient({} as any)
  })

  function seedOrder (overrides: Partial<any> = {}): any {
    const order = {
      id: 'order_local_1',
      db_order_id: 'db-uuid-1',
      station_id: 'station-A', // owned
      items: [],
      ...overrides
    }
    orderStoreState.ordersById[order.id] = order
    orderStoreState.persistableOrderIds[order.id] = true
    return order
  }

  function seedServerItems (rows: any[]): void {
    mockFetchOrderById.mockResolvedValue({
      data: { order_items: rows },
      error: null
    })
  }

  it('queues update_item_quantity when local qty > server qty', async () => {
    seedOrder({
      items: [
        {
          id: 'local_1',
          db_order_item_id: 'srv_1',
          quantity: 3,
          customizations: { modifiers: [], addOns: [] }
        }
      ]
    })
    seedServerItems([
      { id: 'srv_1', quantity: 1, is_voided: false, order_item_modifiers: [] }
    ])

    const result = await svc.reconcileOrderCartShape('order_local_1')

    expect(result.outcome).toBe('reconciled')
    expect(result.divergences).toBe(1)
    expect(result.queuedOpIds).toHaveLength(1)
    const ops = queue.getQueueSnapshot()
    const qtyOp = ops.find(o => o.type === 'update_item_quantity')
    expect(qtyOp).toBeDefined()
    expect(qtyOp!.params.orderItemId).toBe('srv_1')
    expect(qtyOp!.params.quantity).toBe(3)
  })

  it('queues add_item when local item missing from server (no db_order_item_id yet)', async () => {
    seedOrder({
      items: [
        {
          id: 'local_2',
          db_order_item_id: null,
          quantity: 1,
          customizations: { modifiers: [], addOns: [] }
        }
      ]
    })
    seedServerItems([])

    const result = await svc.reconcileOrderCartShape('order_local_1')

    expect(result.outcome).toBe('reconciled')
    expect(result.divergences).toBe(1)
    const ops = queue.getQueueSnapshot()
    const addOp = ops.find(o => o.type === 'add_item')
    expect(addOp).toBeDefined()
    expect(addOp!.localItemId).toBe('local_2')
  })

  it('queues replace_modifiers when modifier set differs', async () => {
    seedOrder({
      items: [
        {
          id: 'local_3',
          db_order_item_id: 'srv_3',
          quantity: 1,
          customizations: {
            modifiers: [
              {
                categoryId: 'g1',
                categoryName: 'Milk',
                options: [{ id: 'oat', name: 'Oat', price: 0.5, isNo: false }]
              }
            ],
            addOns: []
          }
        }
      ]
    })
    seedServerItems([
      {
        id: 'srv_3',
        quantity: 1,
        is_voided: false,
        order_item_modifiers: [
          { modifier_item_id: 'almond', quantity: 1 }
        ]
      }
    ])

    const result = await svc.reconcileOrderCartShape('order_local_1')

    expect(result.outcome).toBe('reconciled')
    expect(result.divergences).toBe(1)
    const ops = queue.getQueueSnapshot()
    const modOp = ops.find(o => o.type === 'replace_modifiers')
    expect(modOp).toBeDefined()
  })

  it('nulls out group/item ids for custom modifiers in queued replace_modifiers (UUID-cast safety)', async () => {
    // Custom modifiers carry sentinel ids ("custom-modifiers" / "custom_mod_…")
    // that aren't UUIDs. The RPC hard-casts to uuid, so the reconcile push
    // must pass null for those columns or every retry fails with an invalid
    // input syntax error and the op dead-letters after MAX_RETRY_ATTEMPTS.
    seedOrder({
      items: [
        {
          id: 'local_custom_1',
          db_order_item_id: 'srv_custom_1',
          quantity: 1,
          customizations: {
            modifiers: [
              {
                categoryId: 'custom-modifiers',
                categoryName: 'Custom',
                options: [
                  {
                    id: 'custom_mod_1234_abcd',
                    name: 'Extra Sugar Powder',
                    price: 2,
                    isNo: false
                  }
                ]
              }
            ],
            addOns: []
          }
        }
      ]
    })
    // Server has no modifiers — fingerprint diverges, reconcile fires.
    seedServerItems([
      {
        id: 'srv_custom_1',
        quantity: 1,
        is_voided: false,
        order_item_modifiers: []
      }
    ])

    const result = await svc.reconcileOrderCartShape('order_local_1')

    expect(result.outcome).toBe('reconciled')
    const modOp = queue
      .getQueueSnapshot()
      .find(o => o.type === 'replace_modifiers')
    expect(modOp).toBeDefined()
    const queued = modOp!.params.modifiers[0]
    expect(queued.modifier_group_id).toBeNull()
    expect(queued.modifier_item_id).toBeNull()
    // Name + price columns still carry the real data.
    expect(queued.modifier_group_name).toBe('Custom')
    expect(queued.modifier_name).toBe('Extra Sugar Powder')
    expect(queued.price_modifier).toBe(2)
  })

  it('does not queue replace_modifiers when local custom modifier matches server (post-broadcast shape)', async () => {
    // After add_order_item_v3 succeeds, the realtime broadcast comes back with
    // null modifier_group_id / modifier_item_id and orderTransformers groups
    // by name. The fingerprint must treat that server shape as identical to
    // the local sentinel shape — otherwise we re-queue replace_modifiers on
    // every reconcile (false-positive divergence loop).
    seedOrder({
      items: [
        {
          id: 'local_custom_2',
          db_order_item_id: 'srv_custom_2',
          quantity: 1,
          customizations: {
            modifiers: [
              {
                categoryId: 'custom-modifiers',
                categoryName: 'Custom',
                options: [
                  {
                    id: 'custom_mod_1234_abcd',
                    name: 'Extra Sugar Powder',
                    price: 2,
                    isNo: false
                  }
                ]
              }
            ],
            addOns: []
          }
        }
      ]
    })
    seedServerItems([
      {
        id: 'srv_custom_2',
        quantity: 1,
        is_voided: false,
        order_item_modifiers: [
          {
            modifier_group_id: null,
            modifier_item_id: null,
            modifier_group_name: 'Custom',
            modifier_name: 'Extra Sugar Powder',
            price_modifier: 2,
            quantity: 1
          }
        ]
      }
    ])

    const result = await svc.reconcileOrderCartShape('order_local_1')

    expect(result.outcome).toBe('skipped_no_diff')
    expect(
      queue.getQueueSnapshot().find(o => o.type === 'replace_modifiers')
    ).toBeUndefined()
  })

  it('returns skipped_unowned when station_id mismatches and never queues anything', async () => {
    seedOrder({
      station_id: 'station-OTHER', // different station owns this
      items: [
        {
          id: 'local_4',
          db_order_item_id: 'srv_4',
          quantity: 5,
          customizations: { modifiers: [], addOns: [] }
        }
      ]
    })
    seedServerItems([
      { id: 'srv_4', quantity: 1, is_voided: false, order_item_modifiers: [] }
    ])

    const result = await svc.reconcileOrderCartShape('order_local_1')

    expect(result.outcome).toBe('skipped_unowned')
    expect(result.divergences).toBe(0)
    expect(result.queuedOpIds).toHaveLength(0)
    // Critical: no fetch should have happened either — we bail before
    // touching the network.
    expect(mockFetchOrderById).not.toHaveBeenCalled()
    // And no ops queued.
    const ops = queue.getQueueSnapshot()
    expect(ops).toHaveLength(0)
  })

  it('returns skipped_no_diff when local cart matches server', async () => {
    seedOrder({
      items: [
        {
          id: 'local_5',
          db_order_item_id: 'srv_5',
          quantity: 2,
          is_voided: false,
          customizations: { modifiers: [], addOns: [] }
        }
      ]
    })
    seedServerItems([
      { id: 'srv_5', quantity: 2, is_voided: false, order_item_modifiers: [] }
    ])

    const result = await svc.reconcileOrderCartShape('order_local_1')

    expect(result.outcome).toBe('skipped_no_diff')
    expect(result.divergences).toBe(0)
  })

  it('respects per-order 30s cooldown (second call in window returns skipped_no_diff without fetch)', async () => {
    seedOrder({
      items: [
        {
          id: 'local_6',
          db_order_item_id: 'srv_6',
          quantity: 3,
          customizations: { modifiers: [], addOns: [] }
        }
      ]
    })
    seedServerItems([
      { id: 'srv_6', quantity: 1, is_voided: false, order_item_modifiers: [] }
    ])

    const first = await svc.reconcileOrderCartShape('order_local_1')
    expect(first.outcome).toBe('reconciled')
    expect(mockFetchOrderById).toHaveBeenCalledTimes(1)

    mockFetchOrderById.mockClear()
    const second = await svc.reconcileOrderCartShape('order_local_1')
    expect(second.outcome).toBe('skipped_no_diff')
    expect(mockFetchOrderById).not.toHaveBeenCalled()
  })

  it('cooldown can be bypassed via { force: true }', async () => {
    seedOrder({
      items: [
        {
          id: 'local_7',
          db_order_item_id: 'srv_7',
          quantity: 3,
          customizations: { modifiers: [], addOns: [] }
        }
      ]
    })
    seedServerItems([
      { id: 'srv_7', quantity: 1, is_voided: false, order_item_modifiers: [] }
    ])

    await svc.reconcileOrderCartShape('order_local_1')
    mockFetchOrderById.mockClear()
    const second = await svc.reconcileOrderCartShape('order_local_1', {
      force: true
    })
    expect(mockFetchOrderById).toHaveBeenCalledTimes(1)
    expect(second.outcome).toBe('reconciled')
  })

  it('returns skipped_disabled when feature flag is off', async () => {
    process.env.EXPO_PUBLIC_CART_SHAPE_RECONCILE = ''

    seedOrder({
      items: [
        {
          id: 'local_8',
          db_order_item_id: 'srv_8',
          quantity: 99,
          customizations: { modifiers: [], addOns: [] }
        }
      ]
    })
    seedServerItems([
      { id: 'srv_8', quantity: 1, is_voided: false, order_item_modifiers: [] }
    ])

    const result = await svc.reconcileOrderCartShape('order_local_1')

    expect(result.outcome).toBe('skipped_disabled')
    expect(mockFetchOrderById).not.toHaveBeenCalled()
  })

  it('reconcileAllOwnedOrders walks every persistable order id', async () => {
    seedOrder({
      id: 'order_a',
      db_order_id: 'db-a',
      items: [
        {
          id: 'l_a',
          db_order_item_id: 'srv_a',
          quantity: 2,
          customizations: { modifiers: [], addOns: [] }
        }
      ]
    })
    seedOrder({
      id: 'order_b',
      db_order_id: 'db-b',
      station_id: 'station-A',
      items: [
        {
          id: 'l_b',
          db_order_item_id: 'srv_b',
          quantity: 4,
          customizations: { modifiers: [], addOns: [] }
        }
      ]
    })
    mockFetchOrderById.mockImplementation((_c, id) => {
      if (id === 'db-a')
        return Promise.resolve({
          data: {
            order_items: [
              {
                id: 'srv_a',
                quantity: 2,
                is_voided: false,
                order_item_modifiers: []
              }
            ]
          },
          error: null
        })
      return Promise.resolve({
        data: {
          order_items: [
            {
              id: 'srv_b',
              quantity: 1, // diverges
              is_voided: false,
              order_item_modifiers: []
            }
          ]
        },
        error: null
      })
    })

    const results = await svc.reconcileAllOwnedOrders()

    expect(results.map(r => r.outcome).sort()).toEqual([
      'reconciled',
      'skipped_no_diff'
    ])
  })
})
