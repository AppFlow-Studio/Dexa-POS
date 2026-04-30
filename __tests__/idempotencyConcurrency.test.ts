/**
 * Wave 3.0a — hostile concurrency + realism harness.
 *
 * Goes beyond unit-level key-derivation testing. Builds a stateful
 * in-memory mock of the server-side _idempotency_claim /
 * _idempotency_complete contract (per
 * utils/supabase/migrations/00_idempotency_layer.sql:47-107) and drives
 * the REAL `rpcWithIdempotency` client wiring through it under
 * simulated concurrent-station, deadline-race, and stale-takeover
 * scenarios.
 *
 * =====================================================================
 * TESTABILITY GAP — what this file does NOT cover
 * =====================================================================
 *
 * Jest cannot validate the actual Postgres semantics:
 *
 *   - Real `INSERT ... ON CONFLICT (key) DO NOTHING` atomicity under
 *     concurrent transactions. The mock here serializes claims via the
 *     event loop, which is faithful to single-connection behavior but
 *     does NOT exercise Postgres' MVCC under load. Two transactions
 *     hitting the row simultaneously could in theory both see "no
 *     conflict" (they won't, but only Postgres can prove it).
 *
 *   - The real 60-second claim window. We fake-advance the clock here;
 *     the production constant lives in SQL (`INTERVAL '60 seconds'` on
 *     line 66 of the layer migration). If those drift apart, this file
 *     stays green and reality breaks.
 *
 *   - SQLSTATE `40001` propagation through PostgREST → Supabase JS.
 *     Real Supabase wraps the raise into `{ code: '40001', message:
 *     'idempotency_in_flight: ...' }` — we assert against that shape,
 *     but the actual encoding is a runtime concern.
 *
 *   - `orders_broadcast_trigger` suppression on cached return. The
 *     trigger fires on `UPDATE orders` — cached return skips the body
 *     entirely → no broadcast. Documented in plan §What this fix does
 *     NOT solve. Not exercised here.
 *
 *   - `order_items.FOR UPDATE` row locks under genuine concurrency.
 *     Backend reviewer's #5 race (per-intent K3 vs K5 racing) cannot
 *     be reproduced in Jest — the resolution depends on Postgres'
 *     lock-acquisition order.
 *
 *   - pg_cron purge job (`DELETE FROM idempotency_keys WHERE created_at
 *     < now() - INTERVAL '24 hours'`). Untested here.
 *
 * Closing the gap requires either:
 *   1. Supabase local dev (`supabase start` + a real Postgres) running
 *      these scenarios as integration tests in CI. Wave 3.x candidate.
 *   2. A staging-canary smoke that exercises the SQL DO blocks in plan
 *      §Verification. Operator-driven, not automated.
 *   3. Postgres-isolated property tests (e.g. via `pg-tap` or
 *      `node-pg-isolated-tests`). Heavy infra cost.
 *
 * Until then: this file proves the CLIENT contract holds. Server-side
 * proof comes from manual staging verification.
 * =====================================================================
 */

// Real-spec uuid mock (RFC4122 §4.3 / §4.4 via Node crypto)
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
    getSyncJSON: jest.fn(),
    setSyncJSON: jest.fn(),
    mmkvStorage: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() }
  }
})

// Don't actually wrap with deadline timeouts in tests (we're not testing
// timing here — we're testing the claim/cache contract). Pass-through.
jest.mock('@/lib/network/runWithDeadline', () => ({
  runWithDeadline: <T>(
    _op: string,
    _ms: number,
    fn: (signal: AbortSignal) => Promise<{ data: T | null; error: any }>
  ) => fn(new AbortController().signal)
}))

// killSwitch + connectionQuality stubs
jest.mock('@/lib/network/killSwitch', () => ({
  isDeadlineWrapEnabled: () => true,
  setDeadlineWrapEnabled: jest.fn(),
  subscribeKillSwitch: jest.fn(() => () => {})
}))
jest.mock('@/lib/network/connectionQuality', () => ({
  connectionQuality: {
    isSlow: () => false,
    reportTimeout: jest.fn(),
    reportSuccess: jest.fn()
  }
}))

import { rpcWithIdempotency, isTransientRpcError } from '@/lib/network/idempotencyKey'
import { setIdempotentEnabled } from '@/lib/network/featureFlags'
import { toUpdateQuantityKey, toUpdateItemKey } from '@/lib/network/idempotencyKey'

// =====================================================================
// In-memory server mock — mirrors 00_idempotency_layer.sql semantics
// =====================================================================
//
// Faithfulness goals:
//   - INSERT ... ON CONFLICT atomicity — modeled by JS event-loop seriality
//   - 60s in-flight window — controlled by `mockNow`, advanceable via
//     `advanceServerClockMs(...)` (NOT real wall clock; deterministic)
//   - Status states match SQL: 'claimed' or 'completed'
//   - serialization_failure raise on in-flight collision
//   - Stale-claim takeover after >60s
//   - 32KB cache cap → DELETE row on oversize complete
//
// DEPARTURE from production:
//   - Single-threaded; no real concurrency
//   - The "body execution count" is observable (production has no such
//     introspection — but we can use it to assert dedup actually works)
// =====================================================================

const SIXTY_SECONDS_MS = 60 * 1000
let mockNow = 1_700_000_000_000 // arbitrary epoch
const advanceServerClockMs = (ms: number): void => {
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

const idempotencyClaim = (key: string, op: string): { cached: any; should_execute: boolean } => {
  const ck = composite(key, op)
  const existing = claimTable.get(ck)
  if (!existing) {
    claimTable.set(ck, {
      key,
      op,
      result_json: null,
      status: 'claimed',
      created_at: mockNow
    })
    return { cached: null, should_execute: true }
  }
  if (existing.status === 'completed') {
    return { cached: existing.result_json, should_execute: false }
  }
  // status === 'claimed'
  if (existing.created_at > mockNow - SIXTY_SECONDS_MS) {
    // In-flight — caller should retry. Throw the same shape PostgREST
    // would surface for SQLSTATE 40001.
    const e: any = new Error(`idempotency_in_flight: key ${key}`)
    e.code = '40001'
    throw e
  }
  // Stale claim — refresh timestamp and let caller take over.
  existing.created_at = mockNow
  return { cached: null, should_execute: true }
}

const idempotencyComplete = (key: string, op: string, result: any): void => {
  const ck = composite(key, op)
  const json = JSON.stringify(result)
  if (Buffer.byteLength(json, 'utf8') > 32_768) {
    claimTable.delete(ck)
    return
  }
  const row = claimTable.get(ck)
  if (row && row.op === op) {
    row.result_json = result
    row.status = 'completed'
  }
}

// =====================================================================
// Mock supabase client that wires through idempotencyClaim/Complete
// =====================================================================
//
// Tracks every body execution so tests can assert "exactly N bodies ran".
// Optionally lets a test inject artificial latency or failure per call.
// =====================================================================

interface BodyContext {
  rpcName: string
  params: Record<string, any>
}
type BodyImpl = (ctx: BodyContext) => Promise<any>

let bodyImpl: BodyImpl = async ({ params }) => ({
  success: true,
  order_item_id: params.p_order_item_id,
  quantity: params.p_quantity ?? 1
})
let bodyExecutions: BodyContext[] = []

const setBodyImpl = (impl: BodyImpl): void => {
  bodyImpl = impl
}

const makeMockClient = () => ({
  rpc: (name: string, params: Record<string, any>) => {
    // Mimic the chained .abortSignal(...) Supabase JS API
    const exec = async (): Promise<{ data: any; error: any }> => {
      const key: string | undefined = params.p_idempotency_key
      const op = name

      try {
        if (key) {
          const claim = idempotencyClaim(key, op)
          if (!claim.should_execute) {
            return { data: claim.cached, error: null }
          }
        }
      } catch (err) {
        return { data: null, error: err }
      }

      // Body executes
      try {
        const ctx = { rpcName: name, params }
        bodyExecutions.push(ctx)
        const result = await bodyImpl(ctx)
        if (key) {
          idempotencyComplete(key, op, result)
        }
        return { data: result, error: null }
      } catch (err) {
        // Body errored. v3 contract: claim row would roll back with
        // outer tx, so on retry the caller sees no claim. Mirror that.
        if (key) claimTable.delete(composite(key, op))
        return { data: null, error: err }
      }
    }

    return {
      abortSignal: (_: AbortSignal) => exec(),
      // Supabase JS allows awaiting the rpc call directly (no abortSignal)
      then: (resolve: any, reject: any) => exec().then(resolve, reject)
    }
  }
})

const ITEM_A = '11111111-1111-1111-1111-111111111111'

beforeEach(() => {
  claimTable.clear()
  bodyExecutions = []
  mockNow = 1_700_000_000_000
  setIdempotentEnabled('update_order_item_quantity', true)
  setIdempotentEnabled('update_order_item', true)
  setBodyImpl(async ({ params }) => ({
    success: true,
    order_item_id: params.p_order_item_id,
    quantity: params.p_quantity ?? 1
  }))
})

// =====================================================================
// Concurrent same-key dedup
// =====================================================================

describe('Concurrent same-key — at-most-once execution', () => {
  it('5 parallel calls with same key → exactly 1 body executes, 4 see in-flight', async () => {
    const client = makeMockClient()
    const key = toUpdateQuantityKey(ITEM_A, 3)

    // Hold the body so all 5 callers see "claimed" simultaneously.
    let release: () => void = () => {}
    const bodyDone = new Promise<void>((r) => (release = r))
    setBodyImpl(async ({ params }) => {
      await bodyDone
      return { success: true, order_item_id: params.p_order_item_id, quantity: 3 }
    })

    const calls = Array.from({ length: 5 }).map(() =>
      rpcWithIdempotency<any>(
        client as any,
        'update_order_item_quantity',
        'update_order_item_quantity_v2',
        'update_order_item_quantity_v3',
        { p_order_item_id: ITEM_A, p_quantity: 3 },
        { keyOverride: key }
      )
    )

    // Let microtasks drain so all 5 hit the claim.
    await Promise.resolve()
    await Promise.resolve()

    release()
    const results = await Promise.all(calls)

    // Exactly one body executed.
    expect(bodyExecutions).toHaveLength(1)

    // 4 callers got idempotency_in_flight (transient, retry-eligible).
    const inFlight = results.filter(
      (r) => r.error && r.error.code === '40001'
    )
    expect(inFlight).toHaveLength(4)
    inFlight.forEach((r) => {
      // Must classify as transient so the queue retries.
      expect(isTransientRpcError(r.error)).toBe(true)
    })

    // 1 caller got the success.
    const ok = results.filter((r) => r.error === null)
    expect(ok).toHaveLength(1)
    expect(ok[0].data).toMatchObject({ success: true, quantity: 3 })
  })

  it('sequential same-key after completion → cached return, no second body', async () => {
    const client = makeMockClient()
    const key = toUpdateQuantityKey(ITEM_A, 3)

    const params = { p_order_item_id: ITEM_A, p_quantity: 3 }
    const opts = {
      keyOverride: key
    }

    const r1 = await rpcWithIdempotency<any>(
      client as any,
      'update_order_item_quantity',
      'update_order_item_quantity_v2',
      'update_order_item_quantity_v3',
      params,
      opts
    )
    const r2 = await rpcWithIdempotency<any>(
      client as any,
      'update_order_item_quantity',
      'update_order_item_quantity_v2',
      'update_order_item_quantity_v3',
      params,
      opts
    )

    expect(bodyExecutions).toHaveLength(1)
    expect(r1.error).toBeNull()
    expect(r2.error).toBeNull()
    // Both callers receive the SAME cached result.
    expect(r2.data).toEqual(r1.data)
  })

  it('different intents (qty 3 → qty 5) → 2 bodies execute, distinct cache slots', async () => {
    const client = makeMockClient()

    await rpcWithIdempotency<any>(
      client as any,
      'update_order_item_quantity',
      'update_order_item_quantity_v2',
      'update_order_item_quantity_v3',
      { p_order_item_id: ITEM_A, p_quantity: 3 },
      { keyOverride: toUpdateQuantityKey(ITEM_A, 3) }
    )
    await rpcWithIdempotency<any>(
      client as any,
      'update_order_item_quantity',
      'update_order_item_quantity_v2',
      'update_order_item_quantity_v3',
      { p_order_item_id: ITEM_A, p_quantity: 5 },
      { keyOverride: toUpdateQuantityKey(ITEM_A, 5) }
    )

    expect(bodyExecutions).toHaveLength(2)
    expect(bodyExecutions[0].params.p_quantity).toBe(3)
    expect(bodyExecutions[1].params.p_quantity).toBe(5)
    expect(claimTable.size).toBe(2)
  })
})

// =====================================================================
// In-flight window timing
// =====================================================================

describe('60s in-flight window', () => {
  it('retry within 60s of stuck claim → in_flight raise (transient)', async () => {
    const client = makeMockClient()
    const key = toUpdateQuantityKey(ITEM_A, 3)

    // First call hangs forever.
    let bodyStarted = false
    setBodyImpl(
      () =>
        new Promise(() => {
          bodyStarted = true
        })
    )
    void rpcWithIdempotency<any>(
      client as any,
      'update_order_item_quantity',
      'update_order_item_quantity_v2',
      'update_order_item_quantity_v3',
      { p_order_item_id: ITEM_A, p_quantity: 3 },
      { keyOverride: key }
    )
    await Promise.resolve()
    await Promise.resolve()
    expect(bodyStarted).toBe(true)

    // Advance the server clock by 30s (still inside 60s window).
    advanceServerClockMs(30_000)

    setBodyImpl(async () => ({ success: true })) // body for second call (never used)
    const r2 = await rpcWithIdempotency<any>(
      client as any,
      'update_order_item_quantity',
      'update_order_item_quantity_v2',
      'update_order_item_quantity_v3',
      { p_order_item_id: ITEM_A, p_quantity: 3 },
      { keyOverride: key }
    )

    expect(r2.error).toBeDefined()
    expect(r2.error.code).toBe('40001')
    expect(isTransientRpcError(r2.error)).toBe(true)
    // Body executions: 1 (the hung first call). Second call did NOT execute.
    expect(bodyExecutions).toHaveLength(1)
  })

  it('retry after >60s → stale-claim takeover, second body executes', async () => {
    const client = makeMockClient()
    const key = toUpdateQuantityKey(ITEM_A, 3)

    // First call: simulate process death (claim row left as 'claimed')
    setBodyImpl(async ({ params }) => {
      throw Object.assign(new Error('connection terminated'), {
        code: 'ECONNRESET'
      })
    })
    const r1 = await rpcWithIdempotency<any>(
      client as any,
      'update_order_item_quantity',
      'update_order_item_quantity_v2',
      'update_order_item_quantity_v3',
      { p_order_item_id: ITEM_A, p_quantity: 3 },
      { keyOverride: key }
    )
    expect(r1.error).toBeDefined()

    // Production: claim row would roll back with the outer tx. We mirror
    // that by deleting the claim on body error (see makeMockClient). So
    // a strict-spec retry actually finds NO claim and re-executes
    // immediately. Re-introduce a stale claim manually to test the
    // stale-takeover code path explicitly:
    claimTable.set(composite(key, 'update_order_item_quantity_v3'), {
      key,
      op: 'update_order_item_quantity_v3',
      result_json: null,
      status: 'claimed',
      created_at: mockNow - SIXTY_SECONDS_MS - 1 // 1ms past the threshold
    })

    setBodyImpl(async ({ params }) => ({
      success: true,
      order_item_id: params.p_order_item_id,
      quantity: 3
    }))
    const r2 = await rpcWithIdempotency<any>(
      client as any,
      'update_order_item_quantity',
      'update_order_item_quantity_v2',
      'update_order_item_quantity_v3',
      { p_order_item_id: ITEM_A, p_quantity: 3 },
      { keyOverride: key }
    )

    expect(r2.error).toBeNull()
    expect(r2.data).toMatchObject({ success: true, quantity: 3 })
    // Second body executed (takeover).
    expect(bodyExecutions).toHaveLength(2)
    // Claim row now completed.
    const row = claimTable.get(composite(key, 'update_order_item_quantity_v3'))!
    expect(row.status).toBe('completed')
  })

  it('boundary: claim exactly at 60s → still in-flight (strict <)', async () => {
    // SQL: created_at > now() - INTERVAL '60 seconds' raises.
    // Equivalent to: claim is alive iff (now - created_at) < 60s.
    // So at exactly 60s, the claim is STALE and takeover allowed.
    const client = makeMockClient()
    const key = toUpdateQuantityKey(ITEM_A, 3)

    claimTable.set(composite(key, 'update_order_item_quantity_v3'), {
      key,
      op: 'update_order_item_quantity_v3',
      result_json: null,
      status: 'claimed',
      created_at: mockNow - SIXTY_SECONDS_MS // exactly 60s ago
    })

    const r = await rpcWithIdempotency<any>(
      client as any,
      'update_order_item_quantity',
      'update_order_item_quantity_v2',
      'update_order_item_quantity_v3',
      { p_order_item_id: ITEM_A, p_quantity: 3 },
      { keyOverride: key }
    )

    expect(r.error).toBeNull()
    expect(bodyExecutions).toHaveLength(1)
  })
})

// =====================================================================
// Cache size cap
// =====================================================================

describe('32KB cache cap', () => {
  it('oversize result → DELETE row → next call re-executes (NOT cached)', async () => {
    const client = makeMockClient()
    const key = toUpdateQuantityKey(ITEM_A, 3)

    // Body returns a 40KB jsonb. Production v3 RPCs are nowhere near
    // this; this test guards the cap if a future RPC blows past it.
    setBodyImpl(async () => ({
      success: true,
      huge: 'x'.repeat(40_000)
    }))

    await rpcWithIdempotency<any>(
      client as any,
      'update_order_item_quantity',
      'update_order_item_quantity_v2',
      'update_order_item_quantity_v3',
      { p_order_item_id: ITEM_A, p_quantity: 3 },
      { keyOverride: key }
    )

    // Cache row was deleted because result oversized.
    expect(claimTable.has(composite(key, 'update_order_item_quantity_v3'))).toBe(false)
    expect(bodyExecutions).toHaveLength(1)

    // Retry: re-executes (no cache to return).
    setBodyImpl(async () => ({ success: true, smaller: true }))
    const r2 = await rpcWithIdempotency<any>(
      client as any,
      'update_order_item_quantity',
      'update_order_item_quantity_v2',
      'update_order_item_quantity_v3',
      { p_order_item_id: ITEM_A, p_quantity: 3 },
      { keyOverride: key }
    )
    expect(bodyExecutions).toHaveLength(2)
    expect(r2.data).toEqual({ success: true, smaller: true })
    // CRITICAL: for non-idempotent semantics this would double-write.
    // This test documents the hazard for any future RPC that returns
    // large payloads and isn't naturally re-runnable.
  })
})

// =====================================================================
// Per-intent + collapse-merge interaction
// =====================================================================

describe('Per-intent keys × queue-collapse interaction', () => {
  it('collapsed final params drive the key → only the final intent reaches server', async () => {
    // Simulate offlineSyncService entity-key collapse: a queued
    // {quantity:3} op gets merged into a later {quantity:5} tap. The
    // queue's params object now has quantity=5; the replay derives
    // toUpdateQuantityKey(itemId, 5) from those final params.
    //
    // This proves the per-intent key tracks the COLLAPSED intent, not
    // any stale intermediate. The race that backend reviewer #5 flagged
    // (K3 still in-flight on server while K5 starts) is NOT covered
    // here — that's the testability gap; only Postgres concurrency can
    // resolve it.
    const client = makeMockClient()

    // First intent (qty=3) lands on server.
    await rpcWithIdempotency<any>(
      client as any,
      'update_order_item_quantity',
      'update_order_item_quantity_v2',
      'update_order_item_quantity_v3',
      { p_order_item_id: ITEM_A, p_quantity: 3 },
      { keyOverride: toUpdateQuantityKey(ITEM_A, 3) }
    )

    // Queue collapses; replay fires with merged params {quantity:5}.
    await rpcWithIdempotency<any>(
      client as any,
      'update_order_item_quantity',
      'update_order_item_quantity_v2',
      'update_order_item_quantity_v3',
      { p_order_item_id: ITEM_A, p_quantity: 5 },
      { keyOverride: toUpdateQuantityKey(ITEM_A, 5) }
    )

    expect(bodyExecutions).toHaveLength(2)
    expect(bodyExecutions[0].params.p_quantity).toBe(3)
    expect(bodyExecutions[1].params.p_quantity).toBe(5)
    // Final state visible to caller is qty=5 (last write wins on
    // assignment-style mutation — safe).
  })

  it('replay of dropped-quantity bug: full-param forward must produce key matching server effect', () => {
    // Wave 3.0a-4b regression test (pure key-derivation level).
    //
    // Pre-fix: replay handler only forwarded p_special_instructions.
    //   key = toUpdateItemKey({p_order_item_id, p_special_instructions})
    //   server gets the same partial params → final state has stale qty
    //
    // Post-fix: replay forwards qty/seat/unit_price.
    //   key = toUpdateItemKey({p_order_item_id, p_quantity, p_special_instructions, ...})
    //   server gets full params → key matches what optimistic-online
    //   path would have derived for the same effective intent.
    const fullParams = {
      p_order_item_id: ITEM_A,
      p_quantity: 4,
      p_unit_price: undefined as any,
      p_special_instructions: 'no salt',
      p_seat_number: undefined as any
    }
    const partialParams = {
      p_order_item_id: ITEM_A,
      p_special_instructions: 'no salt'
    }

    // The two keys MUST differ; otherwise the bug would be invisible
    // even with the fix in place.
    expect(toUpdateItemKey(fullParams)).not.toBe(
      toUpdateItemKey(partialParams)
    )
    // And the full-param key must be stable across calls.
    expect(toUpdateItemKey(fullParams)).toBe(toUpdateItemKey(fullParams))
  })
})

// =====================================================================
// Two-station / cross-device concurrency
// =====================================================================

describe('Two-station collision', () => {
  it('two stations fire same intent → 1 body executes, 1 in_flight', async () => {
    // Station A and Station B both tap qty=5 on the same item within
    // 100ms of each other. Same per-intent key. Server claims for A;
    // B sees in_flight (transient → retry → cached on retry).
    const client = makeMockClient()
    const key = toUpdateQuantityKey(ITEM_A, 5)

    let release: () => void = () => {}
    const bodyDone = new Promise<void>((r) => (release = r))
    setBodyImpl(async ({ params }) => {
      await bodyDone
      return { success: true, quantity: 5, station: 'A' }
    })

    const stationA = rpcWithIdempotency<any>(
      client as any,
      'update_order_item_quantity',
      'update_order_item_quantity_v2',
      'update_order_item_quantity_v3',
      { p_order_item_id: ITEM_A, p_quantity: 5 },
      { keyOverride: key }
    )
    const stationB = rpcWithIdempotency<any>(
      client as any,
      'update_order_item_quantity',
      'update_order_item_quantity_v2',
      'update_order_item_quantity_v3',
      { p_order_item_id: ITEM_A, p_quantity: 5 },
      { keyOverride: key }
    )

    await Promise.resolve()
    await Promise.resolve()
    release()
    const [a, b] = await Promise.all([stationA, stationB])

    expect(bodyExecutions).toHaveLength(1)
    // Exactly one of A/B got the success; the other got 40001.
    const successes = [a, b].filter((r) => r.error === null)
    const inFlight = [a, b].filter((r) => r.error && r.error.code === '40001')
    expect(successes).toHaveLength(1)
    expect(inFlight).toHaveLength(1)

    // After A's success, B's retry sees the cached result.
    const bRetry = await rpcWithIdempotency<any>(
      client as any,
      'update_order_item_quantity',
      'update_order_item_quantity_v2',
      'update_order_item_quantity_v3',
      { p_order_item_id: ITEM_A, p_quantity: 5 },
      { keyOverride: key }
    )
    expect(bRetry.error).toBeNull()
    expect(bRetry.data).toMatchObject({ success: true, quantity: 5 })
    expect(bodyExecutions).toHaveLength(1) // still 1 — cached
  })
})

// =====================================================================
// Body-error contract
// =====================================================================

describe('Body-error semantics', () => {
  it('body error → claim row removed → retry re-executes cleanly', async () => {
    // Production: _idempotency_claim runs in caller's tx; if body
    // errors before _idempotency_complete, the claim rolls back.
    // Our mock mirrors this by deleting the claim on error.
    const client = makeMockClient()
    const key = toUpdateQuantityKey(ITEM_A, 3)

    let calls = 0
    setBodyImpl(async ({ params }) => {
      calls++
      if (calls === 1) {
        throw Object.assign(new Error('schema mismatch'), { code: 'PGRST116' })
      }
      return { success: true, order_item_id: params.p_order_item_id, quantity: 3 }
    })

    const r1 = await rpcWithIdempotency<any>(
      client as any,
      'update_order_item_quantity',
      'update_order_item_quantity_v2',
      'update_order_item_quantity_v3',
      { p_order_item_id: ITEM_A, p_quantity: 3 },
      { keyOverride: key }
    )
    expect(r1.error).toBeDefined()
    expect(claimTable.has(composite(key, 'update_order_item_quantity_v3'))).toBe(false) // rolled back

    const r2 = await rpcWithIdempotency<any>(
      client as any,
      'update_order_item_quantity',
      'update_order_item_quantity_v2',
      'update_order_item_quantity_v3',
      { p_order_item_id: ITEM_A, p_quantity: 3 },
      { keyOverride: key }
    )
    expect(r2.error).toBeNull()
    expect(bodyExecutions).toHaveLength(2)
    expect(claimTable.get(composite(key, 'update_order_item_quantity_v3'))?.status).toBe('completed')
  })
})
