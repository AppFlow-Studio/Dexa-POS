import { toastService } from '@/lib/toastService'
import type { OrderProfile } from '@/lib/types'

/**
 * Wave 2.1 — cross-station "your order was claimed" toast.
 *
 * Module-scoped dedup so a noisy realtime stream (e.g., a flurry of broadcasts
 * after a Take Over) only surfaces the warning once per `TAKEOVER_TOAST_DEDUP_TTL_MS`
 * window per orderId. Mirrors the pattern in `stores/useSyncStatusStore.ts:64-72`.
 *
 * Extracted from `useOrderStore.ts` so the dedup contract can be unit-tested
 * without loading the full order store and its 50+ transitive imports.
 */

const _recentlyToastedTakeovers = new Set<string>()
export const TAKEOVER_TOAST_DEDUP_TTL_MS = 30_000

export function maybeFireTakeoverToast (
  orderId: string,
  prior: OrderProfile | null
): void {
  if (_recentlyToastedTakeovers.has(orderId)) return
  _recentlyToastedTakeovers.add(orderId)
  setTimeout(
    () => _recentlyToastedTakeovers.delete(orderId),
    TAKEOVER_TOAST_DEDUP_TTL_MS
  )
  toastService.show({
    title: 'Order taken over',
    message: `Order #${prior?.order_number ?? '—'} was claimed by another station`,
    type: 'warning',
    duration: 5000
  })
}
