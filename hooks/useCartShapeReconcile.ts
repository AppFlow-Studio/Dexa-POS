/**
 * Wave 3.0f-3 — Cart-shape reconcile trigger.
 *
 * Subscribes to two recovery events and fires `reconcileAllOwnedOrders` on
 * each:
 *   1. connectionQuality transitioning out of 'slow' → reconcile catches
 *      anything that drifted while the network was bad (the layer-1 + layer-2
 *      hardening already minimizes this, but reconcile is the belt-and-
 *      suspenders catch-all)
 *   2. AppState transitioning background → active → reconcile catches drift
 *      that happened while the app was suspended (e.g., another station
 *      claimed the order, or a queued op dead-lettered while the app was
 *      offscreen and we weren't watching the chip)
 *
 * Both triggers are debounced 5s and the inner reconcile already has its own
 * 30s per-order rate-limit. Conservative: this hook does not own per-order
 * cooldown — it just fires `reconcileAllOwnedOrders` and lets the service
 * decide which orders are actually due.
 */

import { connectionQuality } from '@/lib/network/connectionQuality'
import { reconcileAllOwnedOrders } from '@/services/cartShapeReconcile'
import { useEffect, useRef } from 'react'
import { AppState, type AppStateStatus } from 'react-native'

const TRIGGER_DEBOUNCE_MS = 5000

export function useCartShapeReconcile (
  options: { enabled?: boolean } = {}
): void {
  const { enabled = true } = options
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastQualityRef = useRef(connectionQuality.get())

  useEffect(() => {
    if (!enabled) return
    const fire = (reason: string) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null
        if (__DEV__) {
          console.log('[useCartShapeReconcile] firing reconcile', { reason })
        }
        reconcileAllOwnedOrders().catch(err => {
          console.error('[useCartShapeReconcile] reconcile failed:', err)
        })
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

    // Trigger 2: AppState background → active.
    let lastAppState: AppStateStatus = AppState.currentState
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      const wasBackground =
        lastAppState === 'background' || lastAppState === 'inactive'
      lastAppState = next
      if (wasBackground && next === 'active') {
        fire('foreground')
      }
    })

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
        debounceTimerRef.current = null
      }
      unsubQuality()
      sub.remove()
    }
  }, [enabled])
}
