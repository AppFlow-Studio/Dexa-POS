/**
 * Wave 3.0a — per-intent idempotency key derivation.
 *
 * The key correctness property: same `(target, value)` retried on bad WiFi
 * must produce the SAME UUID so the server-side _idempotency_claim returns
 * the cached result. Different values must produce DIFFERENT UUIDs so
 * legitimate intent changes (qty 3 → qty 5) are not silently mis-cached.
 */

// uuid is ESM-only in newer versions; jest-expo doesn't transform it.
jest.mock('uuid', () => {
  const actual = jest.requireActual('@noble/hashes/utils')
  // Use a deterministic stand-in for v5: hash the input string.
  // The real production code uses uuidv5 with a fixed namespace, which is
  // also deterministic but produces a v5-shaped UUID. For the shape test
  // we exercise the production path separately.
  return {
    v4: () => `00000000-0000-4000-8000-000000000000`,
    // Deterministic v5: the call shape is uuidv5(name, namespace) → string.
    v5: (name: string, namespace: string) => {
      // Stable hash → 32-char hex → format as UUID v5 shape
      let h = 0x811c9dc5
      const input = `${namespace}:${name}`
      for (let i = 0; i < input.length; i++) {
        h ^= input.charCodeAt(i)
        h = (h * 0x01000193) >>> 0
      }
      const hex = h.toString(16).padStart(8, '0').repeat(4).slice(0, 32)
      return [
        hex.slice(0, 8),
        hex.slice(8, 12),
        '5' + hex.slice(13, 16),
        '8' + hex.slice(17, 20),
        hex.slice(20, 32)
      ].join('-')
    }
  }
})

// Storage mock for featureFlags
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
    mmkvStorage: {
      getItem: jest.fn(),
      setItem: jest.fn(),
      removeItem: jest.fn()
    }
  }
})

import { toUpdateItemKey, toUpdateQuantityKey } from '@/lib/network/idempotencyKey'
import { withIdempotency } from '@/lib/network/idempotencyKey'
import { setIdempotentEnabled } from '@/lib/network/featureFlags'

const ITEM_A = '11111111-1111-1111-1111-111111111111'
const ITEM_B = '22222222-2222-2222-2222-222222222222'

describe('toUpdateQuantityKey — per-intent retry safety', () => {
  it('is deterministic for same (item, quantity)', () => {
    expect(toUpdateQuantityKey(ITEM_A, 3)).toBe(toUpdateQuantityKey(ITEM_A, 3))
  })

  it('differs when quantity differs', () => {
    expect(toUpdateQuantityKey(ITEM_A, 3)).not.toBe(
      toUpdateQuantityKey(ITEM_A, 5)
    )
  })

  it('differs when item differs', () => {
    expect(toUpdateQuantityKey(ITEM_A, 3)).not.toBe(
      toUpdateQuantityKey(ITEM_B, 3)
    )
  })
})

describe('toUpdateItemKey — allowlist + canonicalization', () => {
  it('is order-independent w.r.t. param key insertion', () => {
    const a = toUpdateItemKey({
      p_order_item_id: ITEM_A,
      p_quantity: 3,
      p_special_instructions: 'no salt'
    })
    const b = toUpdateItemKey({
      p_special_instructions: 'no salt',
      p_order_item_id: ITEM_A,
      p_quantity: 3
    })
    expect(a).toBe(b)
  })

  it('strips null and undefined values', () => {
    const withNulls = toUpdateItemKey({
      p_order_item_id: ITEM_A,
      p_quantity: 3,
      p_unit_price: null,
      p_seat_number: undefined
    })
    const without = toUpdateItemKey({
      p_order_item_id: ITEM_A,
      p_quantity: 3
    })
    expect(withNulls).toBe(without)
  })

  it('strips fields outside the deployed-RPC allowlist', () => {
    // Server ignores p_prep_station / p_course_number / p_price_override,
    // so the key must too — otherwise identical server effects produce
    // divergent keys and dedupe silently breaks.
    const withGhostFields = toUpdateItemKey({
      p_order_item_id: ITEM_A,
      p_special_instructions: 'x',
      p_prep_station: 'cold',
      p_course_number: 2,
      p_price_override: 9.99
    })
    const allowlistedOnly = toUpdateItemKey({
      p_order_item_id: ITEM_A,
      p_special_instructions: 'x'
    })
    expect(withGhostFields).toBe(allowlistedOnly)
  })

  it('throws on nested-object values (fail loud, not silent)', () => {
    expect(() =>
      toUpdateItemKey({
        p_order_item_id: ITEM_A,
        p_quantity: { foo: 1 } as any
      })
    ).toThrow(/nested value not supported/)
  })

  it('produces different keys for different intents on same target', () => {
    const intent1 = toUpdateItemKey({
      p_order_item_id: ITEM_A,
      p_special_instructions: 'no salt'
    })
    const intent2 = toUpdateItemKey({
      p_order_item_id: ITEM_A,
      p_special_instructions: 'extra cheese'
    })
    expect(intent1).not.toBe(intent2)
  })

  it('returns a UUID-shaped string', () => {
    const k = toUpdateItemKey({ p_order_item_id: ITEM_A, p_quantity: 1 })
    expect(k).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    )
  })
})

describe('withIdempotency — flag-OFF contract', () => {
  it('returns v1 name and untouched params when flag is OFF', () => {
    setIdempotentEnabled('update_order_item_quantity', false)
    const result = withIdempotency(
      'update_order_item_quantity',
      'update_order_item_quantity_v2',
      'update_order_item_quantity_v3',
      { p_order_item_id: ITEM_A, p_quantity: 3 }
    )
    expect(result.name).toBe('update_order_item_quantity_v2')
    expect(result.params).not.toHaveProperty('p_idempotency_key')
    expect(result.params).toEqual({ p_order_item_id: ITEM_A, p_quantity: 3 })
  })

  it('returns v2 name and adds p_idempotency_key when flag is ON', () => {
    setIdempotentEnabled('update_order_item_quantity', true)
    const result = withIdempotency(
      'update_order_item_quantity',
      'update_order_item_quantity_v2',
      'update_order_item_quantity_v3',
      { p_order_item_id: ITEM_A, p_quantity: 3 },
      'my-override-key'
    )
    expect(result.name).toBe('update_order_item_quantity_v3')
    expect(result.params).toMatchObject({
      p_order_item_id: ITEM_A,
      p_quantity: 3,
      p_idempotency_key: 'my-override-key'
    })
  })
})
