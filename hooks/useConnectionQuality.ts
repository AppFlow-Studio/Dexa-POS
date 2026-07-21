import { useSyncExternalStore } from 'react'
import { connectionQuality, Quality } from '@/lib/network/connectionQuality'

export function useConnectionQuality (): Quality {
  return useSyncExternalStore(
    (cb) => connectionQuality.subscribe(cb),
    () => connectionQuality.get(),
    () => connectionQuality.get(),
  )
}
