import type { OrderProfile } from '@/lib/types'
import type { TableSession } from '@/types/db-floor-plan-types'

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

export interface ReadOnlyTableAccess {
  orderId: string
  ownerStationId: string | null
  ownerStationName: string | null
}

interface TableAccessOptions {
  tableId: string
  currentStationId: string | null
  getSession: (tableId: string) => TableSession | null | undefined
  getOrder: (orderId: string) => OrderProfile | null | undefined
}

/**
 * Returns the first foreign-station order attached to this table session.
 *
 * We treat merged sessions as one access unit: if any linked order is owned by
 * another station, the table detail UI should be blocked entirely.
 */
export function getReadOnlyTableAccess ({
  tableId,
  currentStationId,
  getSession,
  getOrder
}: TableAccessOptions): ReadOnlyTableAccess | null {
  if (!currentStationId) return null

  const rootSession = getSession(tableId)
  if (!rootSession) return null

  const relatedTableIds =
    rootSession.merged_tables && rootSession.merged_tables.length > 0
      ? rootSession.merged_tables
      : [tableId]

  for (const relatedTableId of relatedTableIds) {
    const session = getSession(relatedTableId)
    const orderId = session?.order_id
    if (!orderId) continue

    const order = getOrder(orderId)
    if (!isOrderReadOnly(order, currentStationId)) continue

    return {
      orderId,
      ownerStationId: order?.station_id ?? null,
      ownerStationName: order?.station_name?.trim() || null
    }
  }

  return null
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
