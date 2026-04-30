import type { SupabaseClient } from '@supabase/supabase-js'

import { DEADLINES } from '@/lib/network/deadlines'
import { runWithDeadline } from '@/lib/network/runWithDeadline'

/**
 * Wave 2.7 — fast ownership snapshot for the per-order recheck.
 *
 * Wave 2.1 catches the realtime path; Wave 2.1.1 catches the polling /
 * reconnect path. Both have a window where the local store can carry
 * stale `station_id` / `station_name` — for example, when realtime is
 * up but a specific broadcast was missed, or during the 0–30s gap
 * between `useOrderSyncRecovery` polling cycles.
 *
 * This helper is the cheapest possible probe: a single SELECT that
 * pulls only the ownership fields, joined to `stations` for the display
 * name. RLS already filters by merchant + location, so no extra auth
 * check is needed. Wrapped in `runWithDeadline` so a stalled probe
 * trips the bad-wifi state machine like every other read.
 */

export type OwnershipSnapshot = {
  stationId: string | null
  stationName: string | null
  syncVersion: number | null
}

type FetchedOwnershipRow = {
  id: string
  station_id: string | null
  sync_version: number | null
  stations:
    | { station_name: string | null }
    | { station_name: string | null }[]
    | null
}

export async function recheckOrderOwnership (
  client: SupabaseClient,
  dbOrderId: string
): Promise<OwnershipSnapshot | null> {
  const { data, error } = await runWithDeadline<FetchedOwnershipRow>(
    'order_ownership_recheck',
    DEADLINES.read,
    async signal => {
      const { data: row, error: err } = await client
        .from('orders')
        .select('id, station_id, sync_version, stations(station_name)')
        .eq('id', dbOrderId)
        .abortSignal(signal)
        .single()
      return {
        data: (row as unknown as FetchedOwnershipRow) ?? null,
        error: err
      }
    }
  )

  if (error || !data) return null

  const row = data
  // Supabase returns the joined relation as an object for `.single()` but as
  // an array for non-single selects. Normalize both shapes defensively.
  const stations = Array.isArray(row.stations) ? row.stations[0] : row.stations
  return {
    stationId: row.station_id ?? null,
    stationName: stations?.station_name ?? null,
    syncVersion: row.sync_version ?? null
  }
}
