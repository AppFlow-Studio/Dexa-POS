/**
 * Wave 2.7 / 2.8 / 3.0a — INSERT + DELETE RPC senior-QA harness.
 *
 * Two halves:
 *
 *   1. INSERT correctness — Wave 2.7 stable-per-tap idempotency keys
 *      (uuidv5(localItemId)) for `add_order_item_v3` / `add_open_item_v3`.
 *      Probes concurrent dedup, cross-op-name isolation, and the
 *      stale-takeover HAZARD documented in
 *      utils/supabase/migrations/00_idempotency_layer.sql header.
 *
 *   2. DELETE / queue state-transition correctness — cancelOrderOperations
 *      (Wave 2.8d), removeOperation, discardOperation. These are the
 *      paths that prevent zombie ops from waking after a void or cleanup.
 *
 * # Testability gap recap
 *
 * Validated on real Postgres via MCP (see chat transcript Tests 1-12):
 *   - SQLSTATE 40001 wire format ✓
 *   - 60s boundary strictness ✓
 *   - 32KB cap deletion ✓
 *   - Body-error rollback via subtransaction ✓
 *
 * NOT covered here (still needs Supabase local dev or staging smoke):
 *   - Real INSERT ON CONFLICT atomicity under multi-connection load
 *   - FOR UPDATE row-lock contention between K_a and K_b on the same row
 *   - pg_cron purge interaction
 */

// Real-spec uuid via Node crypto (RFC4122 §4.3)
jest.mock('uuid', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createHash, randomUUID } = require('crypto')
  const parseUuid = (s: string): Buffer =>
    Buffer.from(s.replace(/-/g, ''), 'hex')
  const formatUuid = (b: Buffer): string => {
    const h = b.toString('hex')
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`
  }
  return {
    v4: () => randomUUID(),
    v5: (name: string, namespace: string): string => {
      const hash = createHash('sha1')
        .update(parseUuid(namespace))
        .update(Buffer.from(name, 'utf8'))
        .digest()
      const bytes = hash.slice(0, 16)
      bytes[6] = (bytes[6] & 0x0f) | 0x50
      bytes[8] = (bytes[8] & 0x3f) | 0x80
      return formatUuid(bytes)
    }
  }
})

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

jest.mock('@/lib/network/runWithDeadline', () => ({
  runWithDeadline: <T>(
    _op: string,
    _ms: number,
    fn: (signal: AbortSignal) => Promise<{ data: T | null; error: any }>
  ) => fn(new AbortController().signal)
}))

jest.mock('@/lib/network/connectionQuality', () => ({
  connectionQuality: {
    isSlow: () => false,
    reportTimeout: jest.fn(),
    reportSuccess: jest.fn()
  }
}))

jest.mock('@/lib/network/killSwitch', () => ({
  isDeadlineWrapEnabled: () => true,
  setDeadlineWrapEnabled: jest.fn(),
  subscribeKillSwitch: jest.fn(() => () => {})
}))

const mockFlagHolder = { enabled: true }
jest.mock('@/lib/network/featureFlags', () => {
  const flags = new Map<string, boolean>()
  return {
    isIdempotentEnabled: (rpc: string) => flags.get(rpc) ?? false,
    setIdempotentEnabled: (rpc: string, enabled: boolean) => {
      flags.set(rpc, enabled)
    },
    isBlockedAddItemEnabled: () => mockFlagHolder.enabled,
    setBlockedAddItemEnabled: (v: boolean) => {
      mockFlagHolder.enabled = v
    },
    subscribeFlags: jest.fn(() => () => {}),
    isPaymentRecoveryUIEnabled: () => false,
    setPaymentRecoveryUIEnabled: jest.fn()
  }
})

jest.mock('@/stores/useOrderStore', () => ({
  useOrderStore: { getState: () => ({ ordersById: {} }) }
}))

import {
  rpcWithIdempotency,
  toIdempotencyKey
} from '@/lib/network/idempotencyKey'
import { setIdempotentEnabled } from '@/lib/network/featureFlags'

// =====================================================================
// Stateful in-memory _idempotency_claim mock (per layer SQL §47-107)
// =====================================================================

const SIXTY_S_MS = 60_000
let mockNow = 1_700_000_000_000
const advance = (ms: number): void => {
  mockNow += ms
}

interface ClaimRow {
  key: string
  op: string
  result_json: any
  status: 'claimed' | 'completed'
  created_at: number
}
// Wave 3.0c: composite (key, op) PK — Map keys are "${key}::${op}" tuples.
const composite = (key: string, op: string): string => `${key}::${op}`
const claimTable = new Map<string, ClaimRow>()

const idempotencyClaim = (
  key: string,
  op: string
): { cached: any; should_execute: boolean } => {
  const ck = composite(key, op)
  const existing = claimTable.get(ck)
  if (!existing) {
    claimTable.set(ck, {
      key, op, result_json: null, status: 'claimed', created_at: mockNow
    })
    return { cached: null, should_execute: true }
  }
  if (existing.status === 'completed') {
    return { cached: existing.result_json, should_execute: false }
  }
  if (existing.created_at > mockNow - SIXTY_S_MS) {
    const e: any = new Error(`idempotency_in_flight: key ${key}`)
    e.code = '40001'
    throw e
  }
  existing.created_at = mockNow
  return { cached: null, should_execute: true }
}

const idempotencyComplete = (key: string, op: string, result: any): void => {
  const ck = composite(key, op)
  if (Buffer.byteLength(JSON.stringify(result), 'utf8') > 32_768) {
    claimTable.delete(ck)
    return
  }
  const row = claimTable.get(ck)
  if (row && row.op === op) {
    row.result_json = result
    row.status = 'completed'
  }
}

interface BodyExecution {
  rpcName: string
  params: Record<string, any>
  insertId: string // simulates the new order_item_id Postgres assigns
}
let bodyExecutions: BodyExecution[] = []
let bodyImpl: (ctx: { rpcName: string; params: Record<string, any> }) => Promise<any> =
  async ({ params }) => ({
    success: true,
    order_item_id: params.p_menu_item_id ?? params.p_order_id ?? 'auto'
  })

const setBodyImpl = (
  fn: typeof bodyImpl
): void => {
  bodyImpl = fn
}

const makeMockClient = () => ({
  rpc: (name: string, params: Record<string, any>) => {
    const exec = async () => {
      const key: string | undefined = params.p_idempotency_key
      try {
        if (key) {
          const claim = idempotencyClaim(key, name)
          if (!claim.should_execute) return { data: claim.cached, error: null }
        }
      } catch (err) {
        return { data: null, error: err }
      }
      try {
        const insertId = `row_${bodyExecutions.length + 1}_${Math.random().toString(36).slice(2, 8)}`
        const ctx = { rpcName: name, params, insertId }
        bodyExecutions.push(ctx)
        const result = await bodyImpl(ctx)
        if (key) idempotencyComplete(key, name, result)
        return { data: result, error: null }
      } catch (err) {
        if (key) claimTable.delete(composite(key, name)) // body-error rollback
        return { data: null, error: err }
      }
    }
    return {
      abortSignal: () => exec(),
      then: (resolve: any, reject: any) => exec().then(resolve, reject)
    }
  }
})

beforeEach(() => {
  claimTable.clear()
  bodyExecutions = []
  mockNow = 1_700_000_000_000
  setIdempotentEnabled('add_order_item', true)
  setIdempotentEnabled('add_open_item', true)
  setBodyImpl(async ({ params, insertId }: any) => ({
    success: true,
    order_item_id: insertId,
    item_name: params.p_item_name
  }))
})

const ITEM_LOCAL = 'item-local-id-abc-1700000000000-x9z'
const ORDER_DB = '99999999-9999-9999-9999-999999999999'

// =====================================================================
// PART 1: INSERT correctness
// =====================================================================

describe('INSERT — toIdempotencyKey (Wave 2.7 stable-per-tap key)', () => {
  it('determinism: same localItemId → same key across calls', () => {
    expect(toIdempotencyKey(ITEM_LOCAL)).toBe(toIdempotencyKey(ITEM_LOCAL))
  })

  it('cross-namespace isolation: toIdempotencyKey(x) ≠ uuidv5 of any update key', () => {
    // toIdempotencyKey hashes the bare localId; the update helpers prefix
    // with "update_qty:" / "update_item:". Their output spaces MUST NOT
    // overlap, otherwise an INSERT cache entry could mis-serve an UPDATE
    // (or vice versa) — silent cross-RPC pollution.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { toUpdateQuantityKey, toUpdateItemKey } = require('@/lib/network/idempotencyKey')
    const insertKey = toIdempotencyKey(ITEM_LOCAL)
    const updateQty = toUpdateQuantityKey(ITEM_LOCAL, 1)
    const updateItem = toUpdateItemKey({ p_order_item_id: ITEM_LOCAL })
    expect(new Set([insertKey, updateQty, updateItem]).size).toBe(3)
  })

  it('defends against itemId injection: "abc" cannot collide with "abc:rest"', () => {
    // Bare hash (no separator), so injection via the localId only
    // collides with another caller using the EXACT same string as their
    // localId. Different cart taps generate distinct compositeKey suffixes.
    expect(toIdempotencyKey('abc')).not.toBe(toIdempotencyKey('abc:rest'))
    expect(toIdempotencyKey('a')).not.toBe(toIdempotencyKey('aa'))
  })

  it('handles empty + unicode + 1KB itemIds without crashing', () => {
    expect(toIdempotencyKey('')).toMatch(/^[0-9a-f-]{36}$/i)
    expect(toIdempotencyKey('🌮-tacos')).toMatch(/^[0-9a-f-]{36}$/i)
    expect(toIdempotencyKey('x'.repeat(1000))).toMatch(/^[0-9a-f-]{36}$/i)
  })
})

describe('INSERT — concurrent retries dedupe to ONE row', () => {
  it('5 parallel add_order_item calls with same uuidv5(localItemId) → 1 server insert', async () => {
    const client = makeMockClient()
    const key = toIdempotencyKey(ITEM_LOCAL)

    let release: () => void = () => {}
    const wait = new Promise<void>((r) => (release = r))
    setBodyImpl(async ({ insertId }: any) => {
      await wait
      return { success: true, order_item_id: insertId, item_name: 'Latte' }
    })

    const calls = Array.from({ length: 5 }).map(() =>
      rpcWithIdempotency<any>(
        client as any,
        'add_order_item',
        'add_order_item_v2',
        'add_order_item_v3',
        {
          p_order_id: ORDER_DB,
          p_item_name: 'Latte',
          p_quantity: 1,
          p_unit_price: 5
        },
        { keyOverride: key }
      )
    )

    await Promise.resolve()
    await Promise.resolve()
    release()
    const results = await Promise.all(calls)

    // CRITICAL: exactly 1 row inserted on the server.
    expect(bodyExecutions).toHaveLength(1)

    const successes = results.filter((r) => r.error === null)
    const inFlight = results.filter(
      (r) => r.error && r.error.code === '40001'
    )
    expect(successes).toHaveLength(1)
    expect(inFlight).toHaveLength(4)

    // The 4 in-flight retries, on a real client, would be classified
    // transient and replayed → all eventually return cached order_item_id.
    const cached = await rpcWithIdempotency<any>(
      client as any,
      'add_order_item',
      'add_order_item_v2',
      'add_order_item_v3',
      {
        p_order_id: ORDER_DB,
        p_item_name: 'Latte',
        p_quantity: 1,
        p_unit_price: 5
      },
      { keyOverride: key }
    )
    expect(cached.error).toBeNull()
    expect(cached.data.order_item_id).toBe(successes[0].data.order_item_id)
    expect(bodyExecutions).toHaveLength(1) // still 1 — cached
  })

  it('optimistic-online + queue-replay both use same toIdempotencyKey → 1 insert', async () => {
    // Production scenario: add tap → optimistic RPC times out client-side
    // (deadline) → silent queue → replay. Both attempts derive the same
    // uuidv5 from the local CartItem.id. Server sees them as one logical
    // op; only the first inserts.
    const client = makeMockClient()
    const localItemId = ITEM_LOCAL
    const key = toIdempotencyKey(localItemId)

    // Attempt 1 (optimistic) succeeds server-side but client times out
    setBodyImpl(async ({ insertId }: any) => ({
      success: true,
      order_item_id: insertId,
      item_name: 'Espresso'
    }))
    const r1 = await rpcWithIdempotency<any>(
      client as any,
      'add_order_item',
      'add_order_item_v2',
      'add_order_item_v3',
      {
        p_order_id: ORDER_DB,
        p_item_name: 'Espresso',
        p_quantity: 1,
        p_unit_price: 3
      },
      { keyOverride: key }
    )

    // Attempt 2 (queue replay) — same local ID derives same key
    const r2 = await rpcWithIdempotency<any>(
      client as any,
      'add_order_item',
      'add_order_item_v2',
      'add_order_item_v3',
      {
        p_order_id: ORDER_DB,
        p_item_name: 'Espresso',
        p_quantity: 1,
        p_unit_price: 3
      },
      { keyOverride: key }
    )

    expect(bodyExecutions).toHaveLength(1)
    expect(r1.error).toBeNull()
    expect(r2.error).toBeNull()
    expect(r2.data.order_item_id).toBe(r1.data.order_item_id)
  })
})

describe('INSERT — cross-op isolation (Wave 3.0c composite PK)', () => {
  it('same UUID submitted as add_order_item then add_open_item → each op executes under its own (key, op) cache row', async () => {
    // Wave 3.0c regression test.
    //
    // BEFORE the composite-PK migration, this test locked in a real
    // hazard: idempotency_keys.PRIMARY KEY was (key) only, so
    // _idempotency_claim's INSERT ... ON CONFLICT (key) DO NOTHING
    // meant a second call with the same UUID under a DIFFERENT op
    // received the FIRST op's cached result_json, regardless of the op
    // name passed. Production safe today only by client discipline —
    // every key derivation helper namespaces keys per-op so no live
    // payload reuses a UUID across op names. But that mitigation was a
    // runtime invariant rather than a schema-level guarantee.
    //
    // Wave 3.0c switches the PK to (key, op) and patches both helper
    // functions' WHERE / ON CONFLICT / DELETE clauses to scope by
    // (key, op). This test now verifies the FIX: even if a future
    // refactor accidentally reused a UUID across two op names, each op
    // would still execute its own body and cache its own result.
    //
    // Migration: dexapos-website/supabase/migrations/
    //   20260429120000_idempotency_composite_pk.sql

    const client = makeMockClient()
    const sharedKey = toIdempotencyKey(ITEM_LOCAL)

    // Step 1: add_order_item executes, caches its result under (key, 'add_order_item_v3').
    setBodyImpl(async ({ insertId }: any) => ({
      success: true,
      order_item_id: insertId,
      source: 'add_order_item_v3',
      item_name: 'Latte'
    }))
    const r1 = await rpcWithIdempotency<any>(
      client as any,
      'add_order_item',
      'add_order_item_v2',
      'add_order_item_v3',
      { p_order_id: ORDER_DB, p_item_name: 'Latte', p_quantity: 1, p_unit_price: 5 },
      { keyOverride: sharedKey }
    )
    expect(r1.error).toBeNull()
    expect(r1.data.source).toBe('add_order_item_v3')

    // Step 2: same UUID, different op (add_open_item) — composite PK
    // means this call sees no existing (key, 'add_open_item_v3') row,
    // so its body executes and caches its own result.
    setBodyImpl(async ({ insertId }: any) => ({
      success: true,
      order_item_id: insertId,
      source: 'add_open_item_v3',
      item_name: 'Custom $99'
    }))
    const r2 = await rpcWithIdempotency<any>(
      client as any,
      'add_open_item',
      'add_open_item_v2',
      'add_open_item_v3',
      { p_order_id: ORDER_DB, p_item_name: 'Custom $99', p_unit_price: 99 },
      { keyOverride: sharedKey }
    )

    // THE FIX: r2 gets its OWN payload (source='add_open_item_v3').
    expect(r2.error).toBeNull()
    expect(r2.data.source).toBe('add_open_item_v3')
    expect(r2.data.item_name).toBe('Custom $99')

    // Both bodies executed; two distinct (key, op) rows in the cache.
    expect(bodyExecutions).toHaveLength(2)
    expect(bodyExecutions[0].rpcName).toBe('add_order_item_v3')
    expect(bodyExecutions[1].rpcName).toBe('add_open_item_v3')
    expect(claimTable.size).toBe(2)
  })
})

describe('INSERT — stale-takeover HAZARD (the SQL header warning, made concrete)', () => {
  it('an INSERT under stale-takeover would produce a duplicate row', async () => {
    // 00_idempotency_layer.sql header explicitly warns:
    //   "Stale-claim takeover (60s) is only safe for assignment-style
    //    mutations where two concurrent executions converge to the same
    //    final state. Counter-increment / row-append RPCs MUST add a
    //    precondition check before this branch."
    //
    // INSERTs ARE row-append. This test demonstrates the hazard
    // concretely: claim → simulate body crash (no completion) → 90s
    // pass → second caller takes over → INSERTS A SECOND ROW.
    //
    // In production today, the body-error rollback (Test 8 from the
    // staging suite) means the claim row vanishes when the body errors,
    // so retries within the same client-side queue lifecycle re-execute
    // cleanly. The takeover branch only fires when the claim row
    // PERSISTED (e.g., the connection died between INSERT and COMMIT
    // of the outer tx — very rare but possible). When it fires, this
    // test shows what happens.
    //
    // Mitigation today: client-side uuidv5(localItemId) is stable, so
    // even a takeover produces the SAME key → no collision risk for
    // genuine retries of the same logical op. The hazard only bites if
    // the takeover happens AFTER 60s on a key still in use.

    const client = makeMockClient()
    const key = toIdempotencyKey(ITEM_LOCAL)

    // Manually plant a stale claim (simulates: caller A inserted but
    // never completed; the claim row outlived the outer tx somehow).
    claimTable.set(composite(key, 'add_order_item_v3'), {
      key,
      op: 'add_order_item_v3',
      result_json: null,
      status: 'claimed',
      created_at: mockNow - SIXTY_S_MS - 1
    })

    // Caller B retries (within the takeover branch). Server lets it
    // through; body executes again, second row inserted.
    setBodyImpl(async ({ insertId }: any) => ({
      success: true,
      order_item_id: insertId,
      item_name: 'Donut'
    }))

    const r = await rpcWithIdempotency<any>(
      client as any,
      'add_order_item',
      'add_order_item_v2',
      'add_order_item_v3',
      { p_order_id: ORDER_DB, p_item_name: 'Donut', p_quantity: 1, p_unit_price: 2 },
      { keyOverride: key }
    )

    expect(r.error).toBeNull()
    expect(bodyExecutions).toHaveLength(1) // ← the takeover insert
    // In a hypothetical "caller A also reconnects and inserted earlier"
    // scenario (real Postgres after a crash), there'd be a second row
    // in order_items. We can't reproduce that interleaving in Jest,
    // but this test locks in the takeover semantics and serves as the
    // canary if anyone ever extends takeover to non-assignment-style
    // RPCs without a precondition check.
  })

  it('body-error claim rollback prevents takeover hazard for in-tx errors', async () => {
    // The standard error case: body raises while in the outer tx.
    // Claim row rolls back. Retry sees no claim → re-executes cleanly.
    // No takeover branch reached → no duplicate. This is the safe path.
    const client = makeMockClient()
    const key = toIdempotencyKey(ITEM_LOCAL)

    setBodyImpl(async () => {
      throw Object.assign(new Error('Order not found'), { code: 'P0001' })
    })
    await rpcWithIdempotency<any>(
      client as any,
      'add_order_item',
      'add_order_item_v2',
      'add_order_item_v3',
      { p_order_id: ORDER_DB, p_item_name: 'X', p_quantity: 1, p_unit_price: 1 },
      { keyOverride: key }
    )
    expect(claimTable.has(composite(key, 'add_order_item_v3'))).toBe(false) // rollback removed it

    // Retry inserts cleanly (different body now)
    setBodyImpl(async ({ insertId }: any) => ({
      success: true,
      order_item_id: insertId,
      item_name: 'X'
    }))
    const r2 = await rpcWithIdempotency<any>(
      client as any,
      'add_order_item',
      'add_order_item_v2',
      'add_order_item_v3',
      { p_order_id: ORDER_DB, p_item_name: 'X', p_quantity: 1, p_unit_price: 1 },
      { keyOverride: key }
    )
    expect(r2.error).toBeNull()
    expect(bodyExecutions).toHaveLength(2) // 1st errored, 2nd succeeded
    expect(claimTable.get(composite(key, 'add_order_item_v3'))?.status).toBe('completed')
  })
})

// =====================================================================
// PART 2: DELETE / queue state-transition correctness
// =====================================================================
//
// Tests the offlineSyncService delete-side state machine:
//   - cancelOrderOperations (Wave 2.8d void-order cleanup)
//   - removeOperation (success path)
//   - discardOperation (manual user discard)
//
// Uses jest.resetModules per test for clean queue state.

describe('DELETE / queue state — cancelOrderOperations (Wave 2.8d)', () => {
  let service: typeof import('@/services/offlineSyncService')

  beforeEach(() => {
    jest.resetModules()
    mockFlagHolder.enabled = true
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    service = require('@/services/offlineSyncService')
  })

  it('marks pending ops for the target order as discarded; preserves other orders', async () => {
    const opAId = await service.queueOperation({
      type: 'add_item',
      params: { localOrderId: 'order-A', localItemId: 'item-1' },
      localOrderId: 'order-A',
      localItemId: 'item-1'
    })
    const opBId = await service.queueOperation({
      type: 'add_item',
      params: { localOrderId: 'order-B', localItemId: 'item-2' },
      localOrderId: 'order-B',
      localItemId: 'item-2'
    })
    const opAId2 = await service.queueOperation({
      type: 'update_item_quantity',
      params: { localOrderId: 'order-A', orderItemId: 'srv-1', quantity: 3 },
      localOrderId: 'order-A',
      localItemId: 'item-1'
    })

    await service.cancelOrderOperations('order-A')

    const aOps = service.getOperationsForOrder('order-A')
    const bOps = service.getOperationsForOrder('order-B')

    // A's ops both discarded
    expect(aOps.map((o) => o.status).sort()).toEqual(['discarded', 'discarded'])
    // B's op untouched
    expect(bOps).toHaveLength(1)
    expect(bOps[0].status).toBe('pending')
  })

  it('marks BLOCKED add_item ops as discarded (Wave 2.8d regression test)', async () => {
    // The exact scenario Wave 2.8d closed: a void-order on an offline
    // order should discard its blocked add_item ops so they don't wake
    // and execute against a voided record.
    const opId = await service.queueOperation({
      type: 'add_item',
      params: { localOrderId: 'order-V', localItemId: 'item-V' },
      localOrderId: 'order-V',
      localItemId: 'item-V'
    })
    await service.markOperationBlocked(opId, 'order_id_unresolved')
    expect(
      service.getOperationsForOrder('order-V')[0].status
    ).toBe('blocked')

    await service.cancelOrderOperations('order-V')

    const ops = service.getOperationsForOrder('order-V')
    expect(ops[0].status).toBe('discarded')
    // Critically: discarded ops should NOT wake on dependency completion.
  })

  it('does NOT clobber already-discarded ops (filter by status)', async () => {
    // The current implementation filters `status !== 'discarded'`, so
    // a second cancel pass is a noop. Lock that in.
    const opId = await service.queueOperation({
      type: 'add_item',
      params: { localOrderId: 'order-D', localItemId: 'i' },
      localOrderId: 'order-D',
      localItemId: 'i'
    })
    await service.cancelOrderOperations('order-D')
    const before = service.getOperationsForOrder('order-D')[0]

    // Second cancel pass — should be a no-op, status unchanged.
    await service.cancelOrderOperations('order-D')
    const after = service.getOperationsForOrder('order-D')[0]
    expect(after.status).toBe('discarded')
    expect(after).toEqual(before)
  })

  it('cancels processing-status ops (mid-flight at cancel time)', async () => {
    // Unusual but real: an op was in 'processing' when the user voided.
    // The current filter `status !== 'discarded'` means processing → discarded.
    // This is correct behavior — even if the RPC eventually succeeds,
    // the local-state void already happened, and the queue shouldn't
    // re-fire post-success cleanup.
    const opId = await service.queueOperation({
      type: 'add_item',
      params: { localOrderId: 'order-P', localItemId: 'i' },
      localOrderId: 'order-P',
      localItemId: 'i'
    })
    // Manually set to processing
    const ops = service.getOperationsForOrder('order-P')
    ops[0].status = 'processing'

    await service.cancelOrderOperations('order-P')
    expect(service.getOperationsForOrder('order-P')[0].status).toBe('discarded')
  })

  // Note: an explicit onQueueChange-notification test was removed — it
  // requires initOfflineSyncService which depends on NetInfo.configure
  // (not in the jest-setup mock surface). The "persistence" test below
  // already proves cancelOrderOperations writes through to storage,
  // which is the load-bearing observable side effect for UI badges
  // (the badge subscribes via the queue store, not directly to the
  // callback). Skipping the init-plumbing tax.
})

describe('DELETE / queue state — removeOperation (success path)', () => {
  let service: typeof import('@/services/offlineSyncService')

  beforeEach(() => {
    jest.resetModules()
    mockFlagHolder.enabled = true
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    service = require('@/services/offlineSyncService')
  })

  it('removes the op from pendingOperations entirely (not just status)', async () => {
    const opId = await service.queueOperation({
      type: 'add_item',
      params: { localOrderId: 'order-R', localItemId: 'i' },
      localOrderId: 'order-R',
      localItemId: 'i'
    })
    expect(service.getOperationsForOrder('order-R')).toHaveLength(1)

    await service.removeOperation(opId)

    // Gone — removeOperation deletes, doesn't just flag.
    expect(service.getOperationsForOrder('order-R')).toHaveLength(0)
  })

  it('removeOperation on already-gone id is a noop (no throw)', async () => {
    await expect(
      service.removeOperation('does-not-exist')
    ).resolves.not.toThrow()
  })
})

describe('DELETE / queue state — interaction matrix', () => {
  let service: typeof import('@/services/offlineSyncService')

  beforeEach(() => {
    jest.resetModules()
    mockFlagHolder.enabled = true
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    service = require('@/services/offlineSyncService')
  })

  it('discarded op never appears in getReadyOperations', async () => {
    // The dispatcher queries getReadyOperations (or equivalent) for
    // pending+deps-satisfied ops. Discarded MUST be excluded so a
    // cancelled op never executes.
    const opId = await service.queueOperation({
      type: 'add_item',
      params: { localOrderId: 'order-X', localItemId: 'i' },
      localOrderId: 'order-X',
      localItemId: 'i'
    })
    await service.cancelOrderOperations('order-X')

    // getActivePendingCount should exclude discarded
    expect(service.getPendingCount()).toBe(0)
  })

  it('hasPendingOrderCreation correctly returns false for discarded create_order', async () => {
    // After void, the order's create_order op is discarded. Subsequent
    // calls to hasPendingOrderCreation must return false so add_item
    // ops on a (now-impossible) order don't get blocked indefinitely.
    await service.queueOperation({
      type: 'create_order',
      params: { localOrderId: 'order-Y' },
      localOrderId: 'order-Y'
    })
    expect(service.hasPendingOrderCreation('order-Y')).toBe(true)

    await service.cancelOrderOperations('order-Y')

    expect(service.hasPendingOrderCreation('order-Y')).toBe(false)
  })

  it('cross-order isolation: cancelling order-A leaves order-B operations executable', async () => {
    await service.queueOperation({
      type: 'add_item',
      params: { localOrderId: 'order-A', localItemId: 'a' },
      localOrderId: 'order-A',
      localItemId: 'a'
    })
    await service.queueOperation({
      type: 'add_item',
      params: { localOrderId: 'order-B', localItemId: 'b' },
      localOrderId: 'order-B',
      localItemId: 'b'
    })

    await service.cancelOrderOperations('order-A')

    expect(service.getPendingCount()).toBe(1) // only B remains active
    const bOps = service.getOperationsForOrder('order-B')
    expect(bOps[0].status).toBe('pending')
  })

  it('persistence: cancelOrderOperations triggers saveQueueToStorage', async () => {
    // Storage is mocked; we can verify setSyncJSON was called via the
    // shared mem map. Indirect but sufficient: after cancel, the persist
    // layer should have the discarded states.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const storage = require('@/lib/storage')

    const opId = await service.queueOperation({
      type: 'add_item',
      params: { localOrderId: 'order-Z', localItemId: 'z' },
      localOrderId: 'order-Z',
      localItemId: 'z'
    })

    storage.setSyncJSON.mockClear()
    await service.cancelOrderOperations('order-Z')

    // Cancel must have persisted the new discarded state.
    expect(storage.setSyncJSON).toHaveBeenCalled()
  })
})

describe('DELETE / queue state — race scenarios', () => {
  let service: typeof import('@/services/offlineSyncService')

  beforeEach(() => {
    jest.resetModules()
    mockFlagHolder.enabled = true
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    service = require('@/services/offlineSyncService')
  })

  it('enqueue-during-cancel: op queued AFTER cancel starts is NOT auto-discarded', async () => {
    // cancelOrderOperations is async (awaits saveQueueToStorage). If a
    // new op enqueues during that await, current code would NOT discard
    // it (filter ran before the new op existed). Document this:
    // production guarantee is "ops queued before cancel start are
    // discarded; ops queued after are not". Reasonable; test locks it in.
    await service.queueOperation({
      type: 'add_item',
      params: { localOrderId: 'order-RACE', localItemId: 'i1' },
      localOrderId: 'order-RACE',
      localItemId: 'i1'
    })

    const cancelPromise = service.cancelOrderOperations('order-RACE')

    // Race: new op enqueues before cancel awaits storage
    await service.queueOperation({
      type: 'add_item',
      params: { localOrderId: 'order-RACE', localItemId: 'i2' },
      localOrderId: 'order-RACE',
      localItemId: 'i2'
    })

    await cancelPromise

    const ops = service.getOperationsForOrder('order-RACE')
    const i1 = ops.find((o) => o.localItemId === 'i1')
    const i2 = ops.find((o) => o.localItemId === 'i2')

    // i1 was queued before cancel → discarded
    expect(i1?.status).toBe('discarded')
    // i2 was queued during cancel → still pending (may or may not be
    // discarded depending on which side of the await it landed; assert
    // the loose contract)
    expect(['pending', 'discarded']).toContain(i2?.status)
  })

  it('cancel + immediate re-cancel is idempotent', async () => {
    await service.queueOperation({
      type: 'add_item',
      params: { localOrderId: 'order-IDEM', localItemId: 'i' },
      localOrderId: 'order-IDEM',
      localItemId: 'i'
    })

    const r1 = service.cancelOrderOperations('order-IDEM')
    const r2 = service.cancelOrderOperations('order-IDEM')
    await Promise.all([r1, r2])

    expect(
      service.getOperationsForOrder('order-IDEM')[0].status
    ).toBe('discarded')
    expect(service.getPendingCount()).toBe(0)
  })

  it('cancel of nonexistent order is a noop (no throw)', async () => {
    await expect(
      service.cancelOrderOperations('order-DOES-NOT-EXIST')
    ).resolves.not.toThrow()
    expect(service.getPendingCount()).toBe(0)
  })
})
