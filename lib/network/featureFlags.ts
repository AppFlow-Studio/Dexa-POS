import { storage } from '@/lib/storage'

/**
 * Per-RPC feature flags for the bad-WiFi Phase 2 idempotency rollout.
 *
 * Mirrors the pattern in `lib/network/killSwitch.ts`: MMKV-backed boolean
 * with in-memory cache and listener subscription. No Supabase round-trip
 * on the hot path.
 *
 * Default = false. Flag flipping is the L1 rollback: <30s end-to-end.
 */

export type IdempotentRpc =
  | 'seat_guests'
  | 'add_order_item'
  | 'manage_order_discount'
  | 'add_order_item_modifier'
  | 'remove_order_item_modifier'
  | 'duplicate_order_item'
  | 'replace_order_item_modifiers'
  | 'recall_kds_items'
  | 'add_open_item'
  | 'create_order'
  | 'apply_refund_to_payment'
  | 'record_refund_items'
  | 'create_reversal'
  | 'process_payment'
  // Wave 3.0a — UPDATE-op retrofit
  | 'update_order_item_quantity'
  | 'update_order_item'

const FLAG_PREFIX = 'idempotent.'
const RECOVERY_UI_KEY = 'flag.paymentRecoveryUI'
const BLOCKED_ADD_ITEM_KEY = 'bad_wifi.blocked_add_item_v1'

const cache = new Map<string, boolean>()
const listeners = new Set<() => void>()

function readBool (key: string): boolean {
  if (cache.has(key)) return cache.get(key) as boolean
  const v = storage.getBoolean(key)
  const value = v ?? false
  cache.set(key, value)
  return value
}

function writeBool (key: string, value: boolean): void {
  cache.set(key, value)
  storage.set(key, value)
  for (const l of listeners) {
    try {
      l()
    } catch (err) {
      if (__DEV__) console.warn('[featureFlags] listener error:', err)
    }
  }
}

export function isIdempotentEnabled (rpc: IdempotentRpc): boolean {
  return readBool(FLAG_PREFIX + rpc)
}

export function setIdempotentEnabled (rpc: IdempotentRpc, enabled: boolean): void {
  writeBool(FLAG_PREFIX + rpc, enabled)
}

export function isPaymentRecoveryUIEnabled (): boolean {
  return readBool(RECOVERY_UI_KEY)
}

export function setPaymentRecoveryUIEnabled (enabled: boolean): void {
  writeBool(RECOVERY_UI_KEY, enabled)
}

// Wave 2.8: gates the markOperationBlocked side-channel + dispatcher guard.
// When false, add_item ops with unresolved order ID fall back to the legacy
// retry-burning behavior (rollback path).
export function isBlockedAddItemEnabled (): boolean {
  if (cache.has(BLOCKED_ADD_ITEM_KEY)) {
    return cache.get(BLOCKED_ADD_ITEM_KEY) as boolean
  }
  const v = storage.getBoolean(BLOCKED_ADD_ITEM_KEY)
  // Default true — opposite of the per-RPC idempotency flags. This is a
  // correctness fix, not a rollout flag.
  const value = v ?? true
  cache.set(BLOCKED_ADD_ITEM_KEY, value)
  return value
}

export function setBlockedAddItemEnabled (enabled: boolean): void {
  writeBool(BLOCKED_ADD_ITEM_KEY, enabled)
}

export function subscribeFlags (listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
