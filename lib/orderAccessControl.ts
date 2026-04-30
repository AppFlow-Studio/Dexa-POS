import type { OrderProfile } from '@/lib/types'

/**
 * Cart-edit access control for cross-station orders.
 *
 * `station_id` is the canonical owner. We treat it as:
 *   - `null`           → unowned (external/online order, or never claimed) → editable
 *   - matches my id    → mine → editable
 *   - mismatches my id → owned by another station → read-only
 *
 * Lifecycle actions (mark ready, archive, close/reopen check) are NOT gated by
 * this — those are progressive and any station with the order in their orderline
 * can advance them. Only cart-shape mutations require ownership.
 *
 * Pure function — no React/Zustand imports — so unit tests don't need to load
 * the entire store world. The hook variant lives in `orderAccessControlHooks.ts`.
 */
export function isOrderReadOnly (
  order: OrderProfile | null | undefined,
  currentStationId: string | null
): boolean {
  if (!order || !currentStationId) return false
  return order.station_id != null && order.station_id !== currentStationId
}

/**
 * Wave 2.5 — typed-error detector for `ORDER_OWNED_BY_OTHER_STATION`.
 *
 * Server-side station guards (Wave 1's RPCs and Wave 2.3+ extensions) reject
 * cross-station mutations by returning `{ success: false, error:
 * 'ORDER_OWNED_BY_OTHER_STATION', ... }` via PostgREST as `data`, with `error`
 * being null. Some legacy RPCs RAISE EXCEPTION instead, in which case the
 * marker lives on `error.message`.
 *
 * Pulled out of `useOrderStore.ts` (it lived as a private helper there) so:
 *   - The offline-sync service can short-circuit ownership rejections to
 *     dead-letter immediately instead of burning through MAX_RETRY_ATTEMPTS.
 *   - Unit tests can cover the recogniser without loading the whole store.
 */
export function isOwnershipError (result: any, error: any): boolean {
  if (
    result &&
    result.success === false &&
    result.error === 'ORDER_OWNED_BY_OTHER_STATION'
  ) {
    return true
  }
  if (
    error &&
    typeof error.message === 'string' &&
    error.message.includes('ORDER_OWNED_BY_OTHER_STATION')
  ) {
    return true
  }
  return false
}
