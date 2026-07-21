import { URGENCY_COLORS } from '@/lib/theme'
import { useKDSStore } from '@/stores/useKDSStore'
import { useEffect, useRef } from 'react'
import { AppState, AppStateStatus } from 'react-native'

const TICK_INTERVAL_MS = 1000 // 1 second

/**
 * Single global timer that drives all KDS card time displays.
 * Increments timerTick every second; pauses when app is backgrounded.
 */
export function useKDSTimer () {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    // Directly get the incremenTimerTick function from store (avoids dependency)
    const incrementTimerTick = useKDSStore.getState().incrementTimerTick

    // Start interval
    intervalRef.current = setInterval(incrementTimerTick, TICK_INTERVAL_MS)

    // AppState listener: pause on background, resume on foreground
    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        // Immediate tick on foreground return
        useKDSStore.getState().incrementTimerTick()
        if (!intervalRef.current) {
          intervalRef.current = setInterval(
            () => useKDSStore.getState().incrementTimerTick(),
            TICK_INTERVAL_MS
          )
        }
      } else {
        // Background/inactive — clear interval
        if (intervalRef.current) {
          clearInterval(intervalRef.current)
          intervalRef.current = null
        }
      }
    }

    const subscription = AppState.addEventListener('change', handleAppState)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      subscription.remove()
    }
  }, [])
}

/**
 * Returns a stable bucketed elapsed string that only changes
 * at minute boundaries, preventing unnecessary re-renders.
 * Displays as MM:SS (minutes:seconds).
 * If doneTimeEpoch is provided, calculates elapsed time from start to completion (frozen).
 * @param startTimeEpoch — milliseconds since epoch (0 = unknown)
 * @param doneTimeEpoch — optional completion time; if provided, timer is frozen at this value
 */
export function getBucketedElapsed (
  startTimeEpoch: number,
  doneTimeEpoch?: number,
  nowEpoch: number = Date.now()
): string {
  if (startTimeEpoch === 0) return '0:00'

  const currentTime = doneTimeEpoch || nowEpoch
  const diffMs = currentTime - startTimeEpoch
  // Clamp at zero: when the server-issued start time (fire_time /
  // sent_to_kitchen_at) is ahead of this device's clock — clock skew between the
  // tablet and Supabase, common right after a ticket is sent — diffMs is negative
  // and the raw formatter renders garbage like "-13:-51". A negative "time since
  // sent" is never meaningful, so floor it to 0:00 until the clock catches up.
  const totalSeconds = Math.max(0, Math.floor(diffMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export interface UrgencyThresholds {
  yellow: number
  orange: number
  red: number
}

const DEFAULT_THRESHOLDS: UrgencyThresholds = { yellow: 5, orange: 10, red: 15 }

/**
 * Returns urgency level 0-3 based on elapsed time.
 * 0 = green, 1 = yellow, 2 = orange, 3 = red
 * @param startTimeEpoch — milliseconds since epoch (0 = unknown)
 * @param thresholds — configurable minute thresholds (defaults to 5/10/15)
 */
export function getUrgencyLevel (
  startTimeEpoch: number,
  thresholds: UrgencyThresholds = DEFAULT_THRESHOLDS,
  nowEpoch: number = Date.now()
): number {
  if (startTimeEpoch === 0) return 0
  const diffMins = Math.floor((nowEpoch - startTimeEpoch) / 60000)
  if (diffMins >= thresholds.red) return 3
  if (diffMins >= thresholds.orange) return 2
  if (diffMins >= thresholds.yellow) return 1
  return 0
}

/** Maps urgency level to color hex */
export function getUrgencyColor (
  startTimeEpoch: number,
  thresholds?: UrgencyThresholds
): string {
  return URGENCY_COLORS[getUrgencyLevel(startTimeEpoch, thresholds)]
}
