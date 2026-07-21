import { useOrderStore } from '@/stores/useOrderStore'
import { isOrderReadOnly } from '@/lib/orderAccessControl'

/**
 * Hook variant — derives read-only state for the active order. Returns false
 * when there's no active order (the empty-cart UI shouldn't claim disabled).
 *
 * Lives in a separate file from `isOrderReadOnly` so the pure helper stays
 * testable without pulling Zustand stores into the test runtime.
 */
export function useIsActiveOrderReadOnly (): boolean {
  return useOrderStore(s => {
    const order = s.activeOrderId ? s.ordersById[s.activeOrderId] : null
    return isOrderReadOnly(order, s.currentStationId)
  })
}
