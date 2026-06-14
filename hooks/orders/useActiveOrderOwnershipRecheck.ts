import { useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useRef } from 'react'

import { connectionQuality } from '@/lib/network/connectionQuality'
import { maybeFireTakeoverToast } from '@/lib/takeoverToast'
import { recheckOrderOwnership } from '@/services/orderOwnershipRecheck'
import {
  getOrderStoreSupabaseClient,
  useOrderStore
} from '@/stores/useOrderStore'
import { usePaymentDetailSheetStore } from '@/stores/usePaymentDetailSheetStore'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'

/**
 * Wave 2.7 — per-order ownership recheck on focus + connection-quality recovery.
 *
 * Closes the gap between Wave 2.1 (realtime broadcast → flip) and Wave 2.1.1
 * (polling + reconnect refetch → flip). Both leave a window where the local
 * store carries stale `station_id` / `station_name`:
 *   - realtime is up but a specific broadcast was missed (rare but real)
 *   - the 0–30s gap between `useOrderSyncRecovery` polling cycles
 *   - app was backgrounded long enough that broadcasts went stale before RN's
 *     auto-reconnect re-subscribed
 *
 * Triggers (intentionally NOT periodic polling — that duplicates Wave 2.1.1's
 * 30s cycle and burns battery for no marginal coverage):
 *   1. Active order screen receives focus (catches background → foreground).
 *   2. Active order id changes (catches user-switches-orders without a flip).
 *   3. `connectionQuality` transitions back to `fast` after slow/probing
 *      (catches the realtime-was-flaky case).
 *
 * Throttled to at most one recheck per orderId per 5 seconds to absorb a
 * focus-event burst (e.g., focus + activeOrderId-change firing in the same
 * tick when the user navigates from orderline to detail).
 */

const RECHECK_THROTTLE_MS = 5_000

// Module-scoped so two instances of the hook (e.g., two screens during a
// transition) share the throttle map and don't double-fire.
const _lastRecheckAt: Record<string, number> = {}

export function useActiveOrderOwnershipRecheck (): void {
  const activeOrderId = useOrderStore(s => s.activeOrderId)

  const recheck = useCallback(
    async (reason: 'focus' | 'order-change' | 'connection-recovery') => {
      const state = useOrderStore.getState()
      const orderId = state.activeOrderId
      if (!orderId) return

      const localOrder = state.ordersById[orderId]
      if (!localOrder?.db_order_id) return // offline draft — no server row to check

      const now = Date.now()
      const lastAt = _lastRecheckAt[orderId] ?? 0
      if (now - lastAt < RECHECK_THROTTLE_MS) {
        if (__DEV__) {
          console.log(
            `[OwnershipRecheck] skipping (throttled) — orderId=${orderId} reason=${reason}`
          )
        }
        return
      }
      _lastRecheckAt[orderId] = now

      const client = getOrderStoreSupabaseClient()
      if (!client) return

      const snapshot = await recheckOrderOwnership(client, localOrder.db_order_id)
      if (!snapshot) return

      const currentStationId =
        useStoreSettingsStore.getState().selectedStation?.id ?? null
      const priorStationId = localOrder.station_id ?? null
      const newStationId = snapshot.stationId

      const wasMine =
        currentStationId != null && priorStationId === currentStationId
      const isMine =
        currentStationId != null && newStationId === currentStationId
      const orderIsTerminal =
        localOrder.order_status === 'void' ||
        localOrder.order_status === 'completed' ||
        localOrder.check_status === 'Closed'
      const flippedAway =
        wasMine && newStationId != null && !isMine && !orderIsTerminal

      // Always refresh the local snapshot (covers the case where local has
      // stale station_name even when station_id matches).
      const stationIdChanged = priorStationId !== newStationId
      const stationNameChanged =
        (localOrder.station_name ?? null) !== (snapshot.stationName ?? null)
      if (stationIdChanged || stationNameChanged) {
        useOrderStore.setState(state => {
          const o = state.ordersById[orderId]
          if (!o) return state
          return {
            ordersById: {
              ...state.ordersById,
              [orderId]: {
                ...o,
                station_id: newStationId,
                station_name: snapshot.stationName ?? null
              }
            }
          }
        })
      }

      if (flippedAway) {
        if (__DEV__) {
          console.log(
            `[OwnershipRecheck] flip-away detected — orderId=${orderId} reason=${reason}`
          )
        }
        // Reuse the same dedup helper as Wave 2.1's broadcast handler so a
        // recheck firing right after a broadcast doesn't double-toast.
        maybeFireTakeoverToast(orderId, localOrder)
        const sheet = usePaymentDetailSheetStore.getState()
        if (sheet.isOpen && sheet.orderId === orderId) {
          sheet.close()
        }
      }
    },
    []
  )

  // Trigger 1 + 2: focus AND order-change together. useFocusEffect re-runs
  // whenever the screen regains focus; the activeOrderId dep makes it also
  // re-run on intra-screen order switches.
  useFocusEffect(
    useCallback(() => {
      void recheck(activeOrderId ? 'focus' : 'order-change')
      return undefined
    }, [recheck, activeOrderId])
  )

  // Trigger 3: connectionQuality transition. We subscribe to ALL transitions
  // and check `quality.get()` inside — only fire when we just flipped to
  // `fast` from a non-fast prior state.
  const lastQualityRef = useRef(connectionQuality.get())
  useEffect(() => {
    const unsubscribe = connectionQuality.subscribe(() => {
      const next = connectionQuality.get()
      const prior = lastQualityRef.current
      lastQualityRef.current = next
      if (next === 'fast' && prior !== 'fast') {
        void recheck('connection-recovery')
      }
    })
    return unsubscribe
  }, [recheck])
}
