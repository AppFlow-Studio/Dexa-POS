import { storage } from '@/lib/storage'

const KEY = 'deadlineWrapEnabled'
const listeners = new Set<() => void>()

let cached: boolean | null = null

function read (): boolean {
  if (cached !== null) return cached
  const v = storage.getBoolean(KEY)
  cached = v ?? true
  return cached
}

export function isDeadlineWrapEnabled (): boolean {
  return read()
}

export function setDeadlineWrapEnabled (enabled: boolean): void {
  cached = enabled
  storage.set(KEY, enabled)
  for (const l of listeners) {
    try {
      l()
    } catch (err) {
      if (__DEV__) console.warn('[killSwitch] listener error:', err)
    }
  }
}

// ---------------------------------------------------------------------------
// AUD-10 — confirmed local echo suppression.
//
// DEFAULTS OFF, unlike the deadline wrap above. This one changes which realtime
// events a station applies, so the failure mode is divergence between stations
// rather than a slow request. The ticket gates it behind a Fri/Sat rush
// baseline and a burst-replay convergence run, and Waves 1-2 may already have
// removed the load that motivated it — so it stays dark until someone measures
// and deliberately turns it on.
// ---------------------------------------------------------------------------
const ECHO_KEY = 'echoSuppressionEnabled'
let echoCached: boolean | null = null

export function isEchoSuppressionEnabled (): boolean {
  if (echoCached !== null) return echoCached
  const v = storage.getBoolean(ECHO_KEY)
  echoCached = v ?? false // default OFF
  return echoCached
}

export function setEchoSuppressionEnabled (enabled: boolean): void {
  echoCached = enabled
  storage.set(ECHO_KEY, enabled)
  for (const l of listeners) {
    try {
      l()
    } catch (err) {
      if (__DEV__) console.warn('[killSwitch] listener error:', err)
    }
  }
}

/** Test seam — lets a suite flip the flag without touching MMKV. */
export function __setEchoSuppressionForTest (enabled: boolean | null): void {
  echoCached = enabled
}

export function subscribeKillSwitch (listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
