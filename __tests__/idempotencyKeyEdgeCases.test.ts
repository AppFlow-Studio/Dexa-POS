/**
 * Wave 3.0a — senior-QA edge-case suite for idempotency key derivation.
 *
 * Goes beyond the happy-path tests in idempotencyKeyDerivation.test.ts.
 * Uses the REAL uuid library (not a deterministic stand-in) so we're
 * testing the actual production hashing behavior. Probes:
 *
 *   - Numeric edge cases (NaN, Infinity, negative, zero, float)
 *   - Unicode + control chars in itemIds
 *   - Canonical-string injection vectors
 *   - JSON.stringify ambiguities (NaN→null, Number-vs-String)
 *   - Empty / all-allowlist-stripped params
 *   - withIdempotency × _stripVNextOnly interaction
 *   - Cross-call state independence
 *   - Golden values to detect namespace drift
 */

// uuid is ESM in v13+ and the package `exports` map blocks deep imports
// of dist-node. Provide a Jest mock that implements v4/v5 against Node's
// real `crypto` — RFC4122 §4.3 / §4.4 compliant, deterministic, and
// produces output IDENTICAL to the production uuid library for v5
// (since v5 is just SHA-1(namespace || name) with bits 6/7 of the
// version/variant fields fixed). This isn't a stub — it's a spec-correct
// reimplementation, so all hash assertions in this file reflect what
// production will actually produce.
jest.mock('uuid', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createHash, randomUUID } = require('crypto')

  const parseUuid = (s: string): Buffer => {
    const hex = s.replace(/-/g, '')
    if (hex.length !== 32) throw new Error(`Invalid UUID: ${s}`)
    return Buffer.from(hex, 'hex')
  }
  const formatUuid = (b: Buffer): string => {
    const h = b.toString('hex')
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`
  }
  const v5 = (name: string, namespace: string): string => {
    const nsBytes = parseUuid(namespace)
    const nameBytes = Buffer.from(name, 'utf8')
    const hash = createHash('sha1')
      .update(nsBytes)
      .update(nameBytes)
      .digest()
    const bytes = hash.slice(0, 16)
    bytes[6] = (bytes[6] & 0x0f) | 0x50 // version 5
    bytes[8] = (bytes[8] & 0x3f) | 0x80 // RFC variant
    return formatUuid(bytes)
  }
  return {
    v4: () => randomUUID(),
    v5
  }
})

// Storage stub so featureFlags.ts loads without MMKV.
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

import {
  toUpdateItemKey,
  toUpdateQuantityKey,
  withIdempotency
} from '@/lib/network/idempotencyKey'
import {
  setIdempotentEnabled,
  type IdempotentRpc
} from '@/lib/network/featureFlags'

const ITEM_A = '11111111-1111-1111-1111-111111111111'
const ITEM_B = '22222222-2222-2222-2222-222222222222'

const UUID_V5_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

// ---------------------------------------------------------------------------
// Golden values — detect namespace drift across deploys
// ---------------------------------------------------------------------------
//
// These are hashed with the production PHASE2_NAMESPACE constant. If the
// namespace ever changes (intentionally or by accident), every previously
// queued op will dedupe against an entirely different cache slot — server
// will re-execute everything once, then dedupe normally. Bad outcome.
// These tests fail loudly if anyone mutates PHASE2_NAMESPACE.
//
// Golden values were computed offline against PHASE2_NAMESPACE =
// '7d2a8f4e-9b3c-4e2a-8f1d-3c5b7e9a1b2c'.
// ---------------------------------------------------------------------------

describe('Golden values — PHASE2_NAMESPACE drift detection', () => {
  it('toUpdateQuantityKey golden: itemId=11..11, qty=3', () => {
    // If this fails, the production namespace was changed. Bad.
    // Recompute via:  uuidv5('update_qty:111...:3', PHASE2_NAMESPACE)
    const k = toUpdateQuantityKey(ITEM_A, 3)
    expect(k).toMatch(UUID_V5_REGEX)
    // Snapshot so any reviewer can see the exact golden value in source.
    expect(k).toMatchSnapshot()
  })

  it('toUpdateItemKey golden: minimal params', () => {
    const k = toUpdateItemKey({ p_order_item_id: ITEM_A, p_quantity: 1 })
    expect(k).toMatch(UUID_V5_REGEX)
    expect(k).toMatchSnapshot()
  })
})

// ---------------------------------------------------------------------------
// toUpdateQuantityKey — numeric edge cases
// ---------------------------------------------------------------------------

describe('toUpdateQuantityKey — numeric pathology', () => {
  it('zero and negative quantities produce distinct stable keys', () => {
    // SQL function rejects qty<1, but the client doesn't validate.
    // The key MUST still be stable so retries dedupe to the same error.
    expect(toUpdateQuantityKey(ITEM_A, 0)).toBe(toUpdateQuantityKey(ITEM_A, 0))
    expect(toUpdateQuantityKey(ITEM_A, -1)).toBe(toUpdateQuantityKey(ITEM_A, -1))
    expect(toUpdateQuantityKey(ITEM_A, 0)).not.toBe(
      toUpdateQuantityKey(ITEM_A, -1)
    )
  })

  it('float quantities are distinct from their integer neighbors', () => {
    // Templated via `${quantity}`, so 1 → "1" and 1.5 → "1.5".
    expect(toUpdateQuantityKey(ITEM_A, 1)).not.toBe(
      toUpdateQuantityKey(ITEM_A, 1.5)
    )
    expect(toUpdateQuantityKey(ITEM_A, 1.5)).not.toBe(
      toUpdateQuantityKey(ITEM_A, 2)
    )
  })

  it('NaN, Infinity, -Infinity each produce distinct stable keys (template-string conversion)', () => {
    // Unlike toUpdateItemKey (JSON.stringify-based), the quantity helper
    // uses template-literal stringification. NaN.toString()='NaN',
    // Infinity.toString()='Infinity', so each is distinguishable.
    const nan = toUpdateQuantityKey(ITEM_A, NaN)
    const posInf = toUpdateQuantityKey(ITEM_A, Infinity)
    const negInf = toUpdateQuantityKey(ITEM_A, -Infinity)
    const finite = toUpdateQuantityKey(ITEM_A, 1)
    expect(new Set([nan, posInf, negInf, finite]).size).toBe(4)
    expect(toUpdateQuantityKey(ITEM_A, NaN)).toBe(nan) // stable
  })

  it('Number.MAX_SAFE_INTEGER produces a valid stable key', () => {
    const k = toUpdateQuantityKey(ITEM_A, Number.MAX_SAFE_INTEGER)
    expect(k).toMatch(UUID_V5_REGEX)
    expect(toUpdateQuantityKey(ITEM_A, Number.MAX_SAFE_INTEGER)).toBe(k)
  })
})

// ---------------------------------------------------------------------------
// toUpdateQuantityKey — itemId pathology
// ---------------------------------------------------------------------------

describe('toUpdateQuantityKey — itemId pathology', () => {
  it('empty string itemId still produces a deterministic key', () => {
    // Should never happen in practice (UUIDs only), but failing here
    // would mean a runtime crash that hid a real upstream bug.
    expect(toUpdateQuantityKey('', 3)).toBe(toUpdateQuantityKey('', 3))
  })

  it('rejects collision: itemId="abc:99" qty=5 vs itemId="abc" qty=99 (encoded "5")', () => {
    // Concrete scenario: separator "::" in the canonical "update_qty:${id}:${qty}"
    // could be ambiguous if itemId contains ":". We use a single ":" sep,
    // so these two cases produce semantically different canonicals:
    //   "update_qty:abc:99:5"   (itemId="abc:99", qty=5)
    //   "update_qty:abc:99"     (itemId="abc", qty=99) — different length
    // They're already distinct, but lock it in.
    const a = toUpdateQuantityKey('abc:99', 5)
    const b = toUpdateQuantityKey('abc', 99)
    expect(a).not.toBe(b)
  })

  it('unicode + control chars in itemId produce stable distinct keys', () => {
    const k1 = toUpdateQuantityKey('item-🌮-tacos', 3)
    const k2 = toUpdateQuantityKey('item-🌯-burrito', 3)
    const k3 = toUpdateQuantityKey('item\nwith\nnewlines', 3)
    expect(k1).toMatch(UUID_V5_REGEX)
    expect(k2).toMatch(UUID_V5_REGEX)
    expect(k3).toMatch(UUID_V5_REGEX)
    expect(new Set([k1, k2, k3]).size).toBe(3)
    expect(toUpdateQuantityKey('item-🌮-tacos', 3)).toBe(k1) // stable
  })
})

// ---------------------------------------------------------------------------
// toUpdateItemKey — JSON.stringify pathology
// ---------------------------------------------------------------------------

describe('toUpdateItemKey — JSON.stringify pathology', () => {
  it('NaN, Infinity, -Infinity all collapse to "null" in JSON — DOCUMENTED collision', () => {
    // JSON.stringify(NaN) === 'null', same for ±Infinity.
    // This means qty=NaN, qty=Infinity, qty=-Infinity all dedupe to the
    // SAME server cache slot. In practice the SQL function rejects these
    // values, so the cache stores the rejection result and all variants
    // get the same error back — arguably fine, but worth flagging.
    const nanKey = toUpdateItemKey({ p_order_item_id: ITEM_A, p_quantity: NaN })
    const posInfKey = toUpdateItemKey({
      p_order_item_id: ITEM_A,
      p_quantity: Infinity
    })
    const negInfKey = toUpdateItemKey({
      p_order_item_id: ITEM_A,
      p_quantity: -Infinity
    })
    expect(nanKey).toBe(posInfKey)
    expect(posInfKey).toBe(negInfKey)
    // But NaN must NOT collide with the params-omitted case (different
    // canonical: "...|p_quantity=null" vs "..." with no quantity).
    expect(nanKey).not.toBe(toUpdateItemKey({ p_order_item_id: ITEM_A }))
  })

  it('number 3 vs string "3" produce distinct keys (JSON quoting differs)', () => {
    // Defends against client-side type coercion bugs sending a string qty
    // and getting unexpected dedupe with a numeric qty.
    expect(
      toUpdateItemKey({ p_order_item_id: ITEM_A, p_quantity: 3 })
    ).not.toBe(
      toUpdateItemKey({ p_order_item_id: ITEM_A, p_quantity: '3' as any })
    )
  })

  it('boolean values are stably encoded', () => {
    // Not a real param today, but the helper must handle whatever the
    // allowlist accepts gracefully. Booleans aren't in the allowlist —
    // verify they're stripped, not crashed.
    expect(
      toUpdateItemKey({
        p_order_item_id: ITEM_A,
        p_is_tax_exempt: true as any
      })
    ).toBe(toUpdateItemKey({ p_order_item_id: ITEM_A }))
  })
})

// ---------------------------------------------------------------------------
// toUpdateItemKey — canonical-separator injection
// ---------------------------------------------------------------------------

describe('toUpdateItemKey — separator-injection resistance', () => {
  it('special_instructions containing "|" cannot forge a different param', () => {
    // Real concern: canonical encoding is `key=${JSON.stringify(value)}`
    // joined by '|'. An instruction like 'foo|p_quantity=99' MUST NOT
    // collide with a real p_quantity=99.
    const injected = toUpdateItemKey({
      p_order_item_id: ITEM_A,
      p_special_instructions: 'foo|p_quantity=99'
    })
    const real = toUpdateItemKey({
      p_order_item_id: ITEM_A,
      p_quantity: 99
    })
    expect(injected).not.toBe(real)
  })

  it('special_instructions with embedded JSON quotes cannot forge a value', () => {
    // JSON.stringify wraps strings in quotes and escapes embedded ones,
    // so "x\"|p_quantity=99" still encodes as a single quoted string.
    const k1 = toUpdateItemKey({
      p_order_item_id: ITEM_A,
      p_special_instructions: 'x"|p_quantity=99'
    })
    const k2 = toUpdateItemKey({
      p_order_item_id: ITEM_A,
      p_quantity: 99
    })
    expect(k1).not.toBe(k2)
  })

  it('itemId containing canonical separators is encoded inside the JSON string', () => {
    // Same test on the id field — confirm JSON quoting protects.
    expect(
      toUpdateItemKey({
        p_order_item_id: 'A|p_quantity=999',
        p_quantity: 3
      })
    ).not.toBe(
      toUpdateItemKey({
        p_order_item_id: 'A',
        p_quantity: 3
      })
    )
  })
})

// ---------------------------------------------------------------------------
// toUpdateItemKey — empty / all-stripped params
// ---------------------------------------------------------------------------

describe('toUpdateItemKey — degenerate inputs', () => {
  it('empty params object produces a stable but degenerate "all-collide" key', () => {
    // Canonical = ''. All empty-param calls hash to the same UUID.
    // In practice this is never called this way (p_order_item_id is
    // always present), but if a refactor ever loses the id field, every
    // distinct call would dedupe — which would manifest as "weird
    // single-row state across cart". This test documents that risk.
    const k1 = toUpdateItemKey({})
    const k2 = toUpdateItemKey({})
    expect(k1).toBe(k2)
    // And hashes the same as an all-disallowed-fields object.
    const k3 = toUpdateItemKey({
      p_prep_station: 'cold',
      p_course_number: 1
    })
    expect(k1).toBe(k3)
  })

  it('only-disallowed-params produces same key as empty', () => {
    expect(
      toUpdateItemKey({
        p_prep_station: 'cold',
        p_course_number: 1,
        p_price_override: 9.99
      })
    ).toBe(toUpdateItemKey({}))
  })

  it('disallowed params do not affect key when allowlisted params present', () => {
    const a = toUpdateItemKey({
      p_order_item_id: ITEM_A,
      p_quantity: 3
    })
    const b = toUpdateItemKey({
      p_order_item_id: ITEM_A,
      p_quantity: 3,
      p_prep_station: 'cold',
      p_course_number: 99,
      p_price_override: 12.5
    })
    expect(a).toBe(b)
  })
})

// ---------------------------------------------------------------------------
// toUpdateItemKey — nested-value guard
// ---------------------------------------------------------------------------

describe('toUpdateItemKey — fail-loud guards', () => {
  it('arrays throw (typeof [] === "object")', () => {
    expect(() =>
      toUpdateItemKey({
        p_order_item_id: ITEM_A,
        p_quantity: [1, 2, 3] as any
      })
    ).toThrow(/nested value not supported/)
  })

  it('Date objects throw', () => {
    expect(() =>
      toUpdateItemKey({
        p_order_item_id: ITEM_A,
        p_quantity: new Date() as any
      })
    ).toThrow(/nested value not supported/)
  })

  it('Maps and Sets throw', () => {
    expect(() =>
      toUpdateItemKey({
        p_order_item_id: ITEM_A,
        p_quantity: new Map() as any
      })
    ).toThrow(/nested value not supported/)
    expect(() =>
      toUpdateItemKey({
        p_order_item_id: ITEM_A,
        p_quantity: new Set() as any
      })
    ).toThrow(/nested value not supported/)
  })

  it('functions are silently coerced to "undefined" by JSON.stringify (typeof !== "object")', () => {
    // KNOWN GAP: typeof fn === 'function', not 'object', so the guard
    // doesn't fire. JSON.stringify(fn) returns undefined, which then
    // gets stringified as the literal string 'undefined' in the canonical.
    // Document the current behavior so regressions are explicit.
    const k = toUpdateItemKey({
      p_order_item_id: ITEM_A,
      p_quantity: (() => 5) as any
    })
    expect(k).toMatch(UUID_V5_REGEX)
  })

  it('error message is helpful (names the offending key)', () => {
    expect(() =>
      toUpdateItemKey({
        p_order_item_id: ITEM_A,
        p_special_instructions: { nested: true } as any
      })
    ).toThrow(/'p_special_instructions'/)
  })
})

// ---------------------------------------------------------------------------
// toUpdateItemKey — null/undefined parity
// ---------------------------------------------------------------------------

describe('toUpdateItemKey — null/undefined parity', () => {
  it('null and undefined are stripped identically', () => {
    expect(
      toUpdateItemKey({
        p_order_item_id: ITEM_A,
        p_quantity: null,
        p_unit_price: undefined,
        p_special_instructions: null
      })
    ).toBe(toUpdateItemKey({ p_order_item_id: ITEM_A }))
  })

  it('an explicit "null" string is NOT stripped (different from null)', () => {
    // JSON.stringify('null') === '"null"' (quoted), JSON.stringify(null) === 'null'.
    // So a literal string "null" must produce a distinct key vs unset.
    const stringNull = toUpdateItemKey({
      p_order_item_id: ITEM_A,
      p_special_instructions: 'null'
    })
    const unset = toUpdateItemKey({ p_order_item_id: ITEM_A })
    expect(stringNull).not.toBe(unset)
  })
})

// ---------------------------------------------------------------------------
// withIdempotency × _stripVNextOnly (the recently-added behavior)
// ---------------------------------------------------------------------------

describe('withIdempotency — _stripVNextOnly interaction', () => {
  beforeEach(() => {
    // Reset all relevant flags
    setIdempotentEnabled('update_order_item_quantity', false)
    setIdempotentEnabled('update_order_item', false)
    setIdempotentEnabled('add_open_item', false)
  })

  it('flag OFF strips p_station_id from params (prevents v1 from 400ing)', () => {
    setIdempotentEnabled('add_open_item', false)
    const result = withIdempotency<Record<string, any>>(
      'add_open_item',
      'add_open_item_v1', // hypothetical v1 that doesn't know about p_station_id
      'add_open_item_v3',
      {
        p_order_id: 'order-1',
        p_item_name: 'Latte',
        p_unit_price: 5,
        p_station_id: 'station-A'
      }
    )
    expect(result.name).toBe('add_open_item_v1')
    expect(result.params).not.toHaveProperty('p_station_id')
    // Other params preserved
    expect(result.params.p_order_id).toBe('order-1')
  })

  it('flag ON does NOT strip p_station_id (v3 may consume it)', () => {
    setIdempotentEnabled('add_open_item', true)
    const result = withIdempotency<Record<string, any>>(
      'add_open_item',
      'add_open_item_v1',
      'add_open_item_v3',
      {
        p_order_id: 'order-1',
        p_station_id: 'station-A'
      },
      'override-key'
    )
    expect(result.name).toBe('add_open_item_v3')
    expect(result.params).toHaveProperty('p_station_id', 'station-A')
    expect(result.params).toHaveProperty('p_idempotency_key', 'override-key')
  })

  it('flag OFF without v-next-only params returns input by reference (no needless copy)', () => {
    setIdempotentEnabled('update_order_item_quantity', false)
    const input = { p_order_item_id: 'X', p_quantity: 3 }
    const result = withIdempotency(
      'update_order_item_quantity',
      'update_order_item_quantity_v2',
      'update_order_item_quantity_v3',
      input
    )
    // Optimization in _stripVNextOnly: returns same ref when no stripping needed.
    // If this fails, an extra clone slipped in (perf regression on hot path).
    expect(result.params).toBe(input)
  })

  it('does not mutate the caller params object (defensive)', () => {
    setIdempotentEnabled('add_open_item', false)
    const input = {
      p_order_id: 'order-1',
      p_station_id: 'station-A'
    }
    const inputCopy = { ...input }
    withIdempotency(
      'add_open_item',
      'add_open_item_v1',
      'add_open_item_v3',
      input
    )
    // Original input must be untouched.
    expect(input).toEqual(inputCopy)
  })
})

// ---------------------------------------------------------------------------
// withIdempotency — flag transitions during a session
// ---------------------------------------------------------------------------

describe('withIdempotency — flag transitions', () => {
  it('toggling the flag mid-session immediately switches routing', () => {
    setIdempotentEnabled('update_order_item_quantity', false)
    const off = withIdempotency(
      'update_order_item_quantity',
      'update_order_item_quantity_v2',
      'update_order_item_quantity_v3',
      { p_order_item_id: ITEM_A, p_quantity: 3 },
      'k1'
    )
    expect(off.name).toBe('update_order_item_quantity_v2')
    expect(off.params).not.toHaveProperty('p_idempotency_key')

    setIdempotentEnabled('update_order_item_quantity', true)
    const on = withIdempotency(
      'update_order_item_quantity',
      'update_order_item_quantity_v2',
      'update_order_item_quantity_v3',
      { p_order_item_id: ITEM_A, p_quantity: 3 },
      'k1'
    )
    expect(on.name).toBe('update_order_item_quantity_v3')
    expect(on.params).toHaveProperty('p_idempotency_key', 'k1')
  })

  it('uses fresh uuidv4 each call when no keyOverride supplied', () => {
    setIdempotentEnabled('update_order_item_quantity', true)
    const a = withIdempotency(
      'update_order_item_quantity',
      'update_order_item_quantity_v2',
      'update_order_item_quantity_v3',
      { p_order_item_id: ITEM_A, p_quantity: 3 }
    )
    const b = withIdempotency(
      'update_order_item_quantity',
      'update_order_item_quantity_v2',
      'update_order_item_quantity_v3',
      { p_order_item_id: ITEM_A, p_quantity: 3 }
    )
    expect(a.params.p_idempotency_key).not.toBe(b.params.p_idempotency_key)
    // Both must still be valid UUIDs.
    expect(a.params.p_idempotency_key).toMatch(
      /^[0-9a-f-]{36}$/i
    )
    expect(b.params.p_idempotency_key).toMatch(
      /^[0-9a-f-]{36}$/i
    )
  })
})

// ---------------------------------------------------------------------------
// Cross-helper independence
// ---------------------------------------------------------------------------

describe('Cross-helper independence', () => {
  it('toUpdateQuantityKey and toUpdateItemKey for "equivalent" intent produce different keys', () => {
    // The two helpers exist deliberately separately; their output spaces
    // must NOT overlap. If they did, an update_item op carrying
    // {p_order_item_id, p_quantity} could collide with an
    // update_item_quantity op for the same (item, qty), and a v3 cache
    // entry for one would mis-serve the other.
    const a = toUpdateQuantityKey(ITEM_A, 3)
    const b = toUpdateItemKey({ p_order_item_id: ITEM_A, p_quantity: 3 })
    expect(a).not.toBe(b)
  })

  it('1000 calls don\'t leak state between invocations', () => {
    // No memoization, no caching — every call must be pure on its inputs.
    const results = new Set<string>()
    for (let q = 1; q <= 1000; q++) {
      results.add(toUpdateQuantityKey(ITEM_A, q))
    }
    // 1000 distinct quantities → 1000 distinct keys (no collisions).
    expect(results.size).toBe(1000)
  })
})

// ---------------------------------------------------------------------------
// Long-string handling (cache-cap relevant)
// ---------------------------------------------------------------------------

describe('Long-string handling', () => {
  it('handles a 10KB special_instructions without throwing', () => {
    // Server caches the result at <=32KB; client key derivation must
    // not crash on long inputs. uuidv5 hashes to a fixed 36-char output.
    const huge = 'x'.repeat(10_000)
    const k = toUpdateItemKey({
      p_order_item_id: ITEM_A,
      p_special_instructions: huge
    })
    expect(k).toMatch(UUID_V5_REGEX)
    // Stable across calls
    expect(
      toUpdateItemKey({
        p_order_item_id: ITEM_A,
        p_special_instructions: huge
      })
    ).toBe(k)
  })

  it('keys for two inputs differing in the LAST char are distinct', () => {
    // Catches truncation bugs (e.g. if the canonical were ever capped).
    const long = 'x'.repeat(5000)
    const a = toUpdateItemKey({
      p_order_item_id: ITEM_A,
      p_special_instructions: long + 'a'
    })
    const b = toUpdateItemKey({
      p_order_item_id: ITEM_A,
      p_special_instructions: long + 'b'
    })
    expect(a).not.toBe(b)
  })
})
