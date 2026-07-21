import type { CartItem, OrderProfile } from '@/lib/types'

/**
 * Centralized auto-print trigger for kitchen tickets.
 * Checks the location config setting and fires print if enabled.
 * Call this from any code path that sends items to the kitchen.
 *
 * Uses lazy imports to avoid circular dependency:
 * useOrderStore → autoPrintKitchen → PrinterService → usePrinterStore → useOrderStore
 */
export function autoPrintKitchenTicketsIfEnabled(
  order: OrderProfile,
  items: CartItem[]
): void {
  // Lazy require to break circular dependency chain
  const { useLocationConfigStore } = require('@/stores/useLocationConfigStore')
  const { useStoreSettingsStore } = require('@/stores/useStoreSettingsStore')
  const { PrinterService } = require('./PrinterService')

  const enabled =
    useLocationConfigStore.getState().config.printing.autoPrintKitchenTickets
  const selectedStore = useStoreSettingsStore.getState().selectedStore

  if (!enabled || !selectedStore || items.length === 0) return

  PrinterService.printKitchenTickets(order, items, selectedStore).catch(
    (e: unknown) => console.warn('[autoPrintKitchen] Failed:', e)
  )
}
