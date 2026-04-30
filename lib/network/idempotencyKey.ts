import type { SupabaseClient } from '@supabase/supabase-js'
import { v4 as uuidv4, v5 as uuidv5 } from 'uuid'
import { DEADLINES } from './deadlines'
import { isIdempotentEnabled, type IdempotentRpc } from './featureFlags'
import { runWithDeadline } from './runWithDeadline'

/**
 * Fixed namespace for Bad-WiFi Phase 2 deterministic idempotency keys.
 * Generated once via uuidv4(); MUST NOT change — would invalidate dedup
 * across deploys.
 */
const PHASE2_NAMESPACE = '7d2a8f4e-9b3c-4e2a-8f1d-3c5b7e9a1b2c'

/**
 * Deterministically transform any local string id (e.g. CartItem id like
 * `<compositeKey>_<timestamp>_<random>`) into a valid UUID suitable for
 * `p_idempotency_key`. Same input → same output across attempts and across
 * the client/queue boundary. If the input is already a valid UUID, the
 * transformation still applies (deterministic, but namespaced — to keep
 * the contract uniform).
 */
export function toIdempotencyKey (localId: string): string {
  return uuidv5(localId, PHASE2_NAMESPACE)
}

/**
 * Wave 3.0a: per-intent key for `update_order_item_quantity_v3`.
 *
 * Same `(orderItemId, quantity)` retried → same key → server returns
 * cached result. Different quantity → different key → fresh execution.
 *
 * Critical for mutable updates: cannot use Wave 2.7's stable-per-target
 * pattern (uuidv5(itemId)) — that works for immutable creates only;
 * for updates, rapid changes (qty 3 → 5) would mis-cache to qty 3.
 */
export function toUpdateQuantityKey (orderItemId: string, quantity: number): string {
  return uuidv5(`update_qty:${orderItemId}:${quantity}`, PHASE2_NAMESPACE)
}

/**
 * Wave 3.0a: per-intent key for `update_order_item_v3`.
 *
 * Allowlists the params actually consumed by the deployed v2 signature
 * (verified via pg_get_functiondef on staging). The TS type
 * `UpdateOrderItemParams` advertises additional fields (p_prep_station,
 * p_course_number, p_price_override) that the server ignores; including
 * them in the key would produce divergent keys for identical server
 * effects, defeating dedupe.
 *
 * Fails loud on nested values: Hermes JSON.stringify ordering is
 * deterministic for plain primitive-keyed objects, but Maps/Dates/etc.
 * would silently produce non-deterministic keys.
 */
const UPDATE_ITEM_ALLOWED_KEYS = [
  'p_order_item_id',
  'p_quantity',
  'p_unit_price',
  'p_special_instructions',
  'p_seat_number'
] as const
type UpdateItemAllowedKey = (typeof UPDATE_ITEM_ALLOWED_KEYS)[number]

export function toUpdateItemKey (params: Record<string, unknown>): string {
  const canonical = Object.entries(params)
    .filter(([k, v]) =>
      (UPDATE_ITEM_ALLOWED_KEYS as readonly string[]).includes(k) &&
      v !== null &&
      v !== undefined
    )
    .map(([k, v]) => {
      if (typeof v === 'object') {
        throw new Error(
          `toUpdateItemKey: nested value not supported for key '${k}'. ` +
          `Update the allowlist + canonicalizer before adding nested params.`
        )
      }
      return [k, JSON.stringify(v)] as const
    })
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('|')
  return uuidv5(`update_item:${canonical}`, PHASE2_NAMESPACE)
}

/**
 * Wave 3.0d-4: per-intent key for `bulk_update_order_item_status_v2`.
 *
 * Same `(sortedItemIds, status)` retried → same key → server returns cached
 * result and SKIPS the UPDATE entirely (so fire_time / sync_version are
 * stamped exactly once, not on every retry).
 *
 * Sorts the ids so input order doesn't change the key — `[a, b]` and
 * `[b, a]` are the same intent. Status is part of the key so a Mark Ready
 * vs a Mark Served on the same items dedupe independently.
 */
export function toBulkUpdateStatusKey (
  orderItemIds: string[],
  status: string
): string {
  const sorted = [...orderItemIds].sort().join(',')
  return uuidv5(`bulk_update_status:${status}:${sorted}`, PHASE2_NAMESPACE)
}

/**
 * Classify an RPC error as transient (recoverable via offline queue retry)
 * vs permanent (auth/schema/business-logic — surfaces to user).
 *
 * Used by callers to decide whether to silently queue (sync_status='pending')
 * or mark-failed (sync_status='failed' → red banner). The latter should be
 * reserved for errors the user actually needs to act on.
 *
 * Transient indicators:
 *   - DEADLINE_EXCEEDED — the runWithDeadline timeout
 *   - OFFLINE_QUEUED   — the executeWithFallback queue handoff
 *   - PostgREST/network: code 'PGRST*' on its own can be either; we treat
 *     fetch/network/timeout messages as transient
 *   - No error object at all (raw fetch failure)
 *   - Common JS network errors: 'Network request failed', 'fetch failed',
 *     'TypeError: Failed to fetch'
 */
export function isTransientRpcError (err: unknown): boolean {
  if (!err) return false
  const e = err as { code?: string; message?: string; name?: string }
  if (e.code === 'DEADLINE_EXCEEDED') return true
  if (e.code === 'OFFLINE_QUEUED') return true
  // Wave 3.0a: idempotency_in_flight (SQLSTATE 40001) — peer station or
  // same-station retry hit a still-claimed key within the 60s window.
  // Mirrors offlineSyncService.isTransientError so the optimistic-online
  // path classifies these the same way as the queue-replay path.
  if (e.code === '40001') return true
  // PostgREST timeout/connect errors typically have status 0 or a network message
  const msg = (e.message || '').toLowerCase()
  if (msg.includes('idempotency_in_flight')) return true
  if (
    msg.includes('network') ||
    msg.includes('fetch') ||
    msg.includes('timeout') ||
    msg.includes('aborted') ||
    msg.includes('socket') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout')
  ) return true
  if (e.name === 'AbortError') return true
  return false
}

/**
 * Resolves the UUID to pass as `p_idempotency_key` for a Category B RPC call.
 *
 * Reuse priority (avoids parallel key mechanisms):
 *   1. paymentJournalKey — for `process_payment`, reuse the key already
 *      generated by `services/paymentJournal.ts:79` (`writePaymentJournal`).
 *      This survives app crashes.
 *   2. queueKey — for ops that originated from the offline queue, reuse the
 *      `OfflineOperation.idempotencyKey`. Replays don't generate new keys.
 *   3. Fresh uuidv4() per call.
 *
 * Generate the key BEFORE the first RPC attempt so retries reuse it.
 */
export type IdempotencyOpSignature = {
  /** Operation name, e.g. 'seat_guests'. Used for telemetry only. */
  op: string
  /**
   * For `process_payment`: pass `paymentJournal.idempotencyKey`. Mandatory
   * for that RPC — payment retries MUST reuse the journal's key.
   */
  paymentJournalKey?: string
  /**
   * For replays from `services/offlineSyncService.ts`: pass the existing
   * `OfflineOperation.idempotencyKey`.
   */
  queueKey?: string
}

export function getOrCreateIdempotencyKey (sig: IdempotencyOpSignature): string {
  if (sig.paymentJournalKey) return sig.paymentJournalKey
  if (sig.queueKey) return sig.queueKey
  return uuidv4()
}

/**
 * Helper for Wave 2 client wiring. Returns the RPC name + params to use
 * based on the per-RPC feature flag. When the flag is OFF, returns the
 * v(n) name and original params (zero behavior change). When ON, returns
 * the v(n+1) name and params with a fresh `p_idempotency_key`.
 *
 * Use the optional `keyOverride` to supply a key that must survive across
 * retries (e.g. paymentJournal.idempotencyKey, OfflineOperation.idempotencyKey).
 */
/**
 * Params that exist only on the station-guarded variant (Wave 1+) and would
 * cause PostgREST to reject the call when routed to a v1/v2 function whose
 * signature predates the guard. Stripped automatically when the idempotency
 * flag is off for a given RPC.
 */
const V_NEXT_ONLY_PARAMS = ['p_station_id'] as const

function _stripVNextOnly<P extends Record<string, any>> (params: P): P {
  let copy: any = null
  for (const k of V_NEXT_ONLY_PARAMS) {
    if (k in params) {
      if (!copy) copy = { ...params }
      delete copy[k]
    }
  }
  return (copy ?? params) as P
}

export function withIdempotency<P extends Record<string, any>> (
  rpc: IdempotentRpc,
  v1Name: string,
  v2Name: string,
  params: P,
  keyOverride?: string
): { name: string; params: P & { p_idempotency_key?: string } } {
  if (!isIdempotentEnabled(rpc)) {
    // Strip v-next-only params so v1 doesn't 400 on "function does not exist"
    return { name: v1Name, params: _stripVNextOnly(params) }
  }
  const p_idempotency_key =
    keyOverride ?? getOrCreateIdempotencyKey({ op: rpc })
  return {
    name: v2Name,
    params: { ...params, p_idempotency_key } as P & { p_idempotency_key: string }
  }
}

/**
 * Composed helper: idempotency-key swap + deadline-wrap in one call.
 *
 * Why combined:
 *   - Idempotency makes retries SAFE (server dedupes via _idempotency_claim).
 *   - Deadline-wrap makes retries TRIGGER (timeout → error → caller's queue).
 * Together they bring Category B RPCs into the connectionQuality state
 * machine on the same terms as the Phase 1 / Option C Category A wraps.
 *
 * On deadline timeout, returns Supabase-shaped `{ data: null, error: {
 * code: 'DEADLINE_EXCEEDED' } }` — caller's existing error path runs.
 *
 * Telemetry: timeouts report to `connectionQuality.reportTimeout(rpc, ms)`,
 * driving fast → degraded → slow transitions and `processQueueNow()` on
 * recovery (via the slow→fast hook in `setupConnectionQuality.ts`).
 */
export async function rpcWithIdempotency<T = unknown> (
  client: SupabaseClient,
  rpc: IdempotentRpc,
  v1Name: string,
  v2Name: string,
  params: Record<string, any>,
  opts?: {
    /** Deadline in ms. Defaults to DEADLINES.hotMutation (2500ms). */
    deadline?: number
    /** Override key for retry-stable operations (queue replays). */
    keyOverride?: string
  }
): Promise<{ data: T | null; error: any }> {
  const { name, params: rpcParams } = withIdempotency(
    rpc, v1Name, v2Name, params, opts?.keyOverride
  )
  const deadlineMs = opts?.deadline ?? DEADLINES.hotMutation
  return runWithDeadline<T>(rpc, deadlineMs, async (signal) => {
    const { data, error } = await client.rpc(name, rpcParams).abortSignal(signal)
    return { data: data as T | null, error }
  })
}
