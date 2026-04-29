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
