import { useFloorPlanStore } from '@/stores/useFloorPlanStore'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const isUuid = (value?: string | null) => !!value && UUID_RE.test(value)

const ORDER_TYPE_DISPLAY: Record<string, string> = {
  'Dine In': 'Dine In',
  dine_in: 'Dine In',
  Dinein: 'Dine In',
  Takeaway: 'Takeaway',
  takeout: 'Takeaway',
  take_out: 'Takeaway',
  'To Go': 'Takeaway',
  Delivery: 'Delivery',
  delivery: 'Delivery',
  Pickup: 'Pickup',
  pickup: 'Pickup',
  Online: 'Online'
}

/** Maps raw `orders.order_type` (snake_case or otherwise) to a display label. */
export function getOrderTypeDisplay (orderType?: string | null): string {
  if (!orderType) return 'Dine In'
  return ORDER_TYPE_DISPLAY[orderType] ?? orderType
}

/**
 * Resolves a printable / UI-safe table label for an order. Prefers the
 * snapshotted `service_location_name`, falls back to looking up the current
 * name on the floor-plan store, and refuses to surface raw UUIDs.
 */
export function resolveTableDisplayName (
  serviceLocationId?: string | null,
  serviceLocationName?: string | null
): string | null {
  const rawName = serviceLocationName?.trim()
  if (rawName && !isUuid(rawName)) return rawName

  const rawId = serviceLocationId?.trim()
  if (rawId) {
    const table = useFloorPlanStore.getState().tablesById[rawId]
    const tableName = table?.name?.trim()
    if (tableName && !isUuid(tableName)) return tableName
  }

  return null
}

// Snapshots the current human-readable table label from the floor-plan store.
// Use at the moment a table is assigned to an order so the label survives
// sync, reprint, and offline. Returns undefined when the floor plan isn't
// loaded, the id is unknown, or the stored name is a raw UUID.
export function snapshotTableName (
  tableId: string | null | undefined
): string | undefined {
  if (!tableId) return undefined
  const name = useFloorPlanStore.getState().tablesById[tableId]?.name?.trim()
  if (!name || isUuid(name)) return undefined
  return name
}
