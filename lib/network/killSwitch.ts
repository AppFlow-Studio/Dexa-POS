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

export function subscribeKillSwitch (listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
