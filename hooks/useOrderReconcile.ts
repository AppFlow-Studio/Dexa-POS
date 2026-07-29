/**
 * Wave 3.0d-5 — Combined order reconcile hook (push + pull).
 *
 * Replaces the standalone `useCartShapeReconcile` hook with a single
 * sequenced trigger:
 *   1. cart-shape reconcile (Wave 3.0f-3) — pushes local→server for cart-
 *      shape mutations the operator owns.
 *   2. ~500ms gap — let the offline-sync dispatcher pick up the queued ops
 *      and mark their items `sync_status='pending'`. That's what
 *      `syncOrderFromBackendComplete`'s inner guard at line 14333+ reads to
 *      preserve local quantity. Without the gap, the soft sequence has a
 *      race where header pull would clobber freshly-queued cart-shape ops.
 *   3. order header reconcile (Wave 3.0d-5) — pulls server→local for
 *      kitchen statuses, payments, paid_status, totals, refunds, order
 *      status. No ownership gate; read-only orders get refreshed too.
 *
 * Triggers (same as the previous cart-shape-only hook):
 *   - connectionQuality slow → fast (catches drift while WiFi was bad)
 *   - AppState background → active (catches drift while app was suspended)
 *
 * Both passes are individually flag-gated:
 *   - EXPO_PUBLIC_CART_SHAPE_RECONCILE=1
 *   - EXPO_PUBLIC_ORDER_HEADER_RECONCILE=1
 * If either flag is off, that pass no-ops via `isFlagEnabled()` inside the
 * service — but the other pass still runs.
 */

import { connectionQuality } from '@/lib/network/connectionQuality'
import { reconcileAllOwnedOrders } from '@/services/cartShapeReconcile'
import { reconcileAllActiveOrdersHeader } from '@/services/orderHeaderReconcile'
import { useEffect, useRef } from 'react'
import { registerResumeTask } from '@/lib/lifecycle/appLifecycleCoordinator'

const TRIGGER_DEBOUNCE_MS = 5000
const INTER_PASS_DELAY_MS = 500

export function useOrderReconcile (
  options: { enabled?: boolean } = {}
): void {
  const { enabled = true } = options
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastQualityRef = useRef(connectionQuality.get())
  const inFlightRef = useRef(false)

  useEffect(() => {
    if (!enabled) return
    const fire = (reason: string) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
      debounceTimerRef.current = setTimeout(async () => {
        debounceTimerRef.current = null
        if (inFlightRef.current) return
        inFlightRef.current = true
        if (__DEV__) {
          console.log('[useOrderReconcile] firing reconcile', { reason })
        }
        try {
          await reconcileAllOwnedOrders()
          await new Promise(resolve =>
            setTimeout(resolve, INTER_PASS_DELAY_MS)
          )
          await reconcileAllActiveOrdersHeader()
        } catch (err) {
          console.error('[useOrderReconcile] reconcile failed:', err)
        } finally {
          inFlightRef.current = false
        }
      }, TRIGGER_DEBOUNCE_MS)
    }

    // Trigger 1: connectionQuality slow → fast transition.
    const unsubQuality = connectionQuality.subscribe(() => {
      const current = connectionQuality.get()
      const prev = lastQualityRef.current
      lastQualityRef.current = current
      const wasSlow = prev === 'slow' || prev === 'probing'
      const nowFast = current === 'fast'
      if (wasSlow && nowFast) {
        fire('connection_recovered')
      }
    })

    // Trigger 2: resume. Registered in the coordinator's `frame` bucket —
    // order convergence is what the operator is actually looking at after
    // wake, so it goes ahead of settings/heartbeat/printer work but behind
    // auth validity. The background→active edge detection the old private
    // listener did is now the coordinator's job (it only drains on a real
    // background edge, not on iOS `inactive` flicker).
    const unregisterResume = registerResumeTask({
      id: 'orders.reconcile-on-resume',
      bucket: 'frame',
      requiresNetwork: true,
      run: () => fire('foreground'),
    })

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
        debounceTimerRef.current = null
      }
      unsubQuality()
      unregisterResume()
    }
  }, [enabled])
}
