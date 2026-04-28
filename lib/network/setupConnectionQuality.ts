import { connectionQuality } from './connectionQuality'
import { DEADLINES } from './deadlines'
import { withDeadline } from './withDeadline'
import { processQueueNow } from '@/services/offlineSyncService'
import type { SupabaseClient } from '@supabase/supabase-js'

let installed = false

/**
 * Wires the connection-quality state machine to the live Supabase client and
 * the offline-sync queue. Must be called once per app lifecycle from a place
 * that has access to a usable Supabase client (PosSyncProvider).
 *
 * - Registers a probe function that calls `ping()` via the supabase client.
 * - Registers a slow→fast hook that drains the offline queue.
 *
 * Re-installing replaces both registrations (safe across hot reload).
 */
export function setupConnectionQuality (supabase: SupabaseClient | null): void {
  if (!supabase) {
    connectionQuality.setProbeFn(null)
    connectionQuality.setSlowToFastHook(null)
    installed = false
    return
  }

  connectionQuality.setProbeFn(async () => {
    // opName 'probe' is exempt from quality reporting (see withDeadline.ts)
    // so probe failures don't promote slow→slow recursively.
    await withDeadline(
      async (signal) => {
        const { data, error } = await supabase.rpc('ping').abortSignal(signal)
        if (error) throw error
        return data
      },
      DEADLINES.probe,
      'probe',
    )
  })

  connectionQuality.setSlowToFastHook(() => {
    processQueueNow().catch(err => {
      if (__DEV__) {
        console.warn('[connectionQuality] processQueueNow failed:', err)
      }
    })
  })

  installed = true
}

export function isConnectionQualityInstalled (): boolean {
  return installed
}
