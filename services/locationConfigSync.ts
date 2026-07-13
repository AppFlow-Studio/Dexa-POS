/**
 * Location Config Sync Service
 *
 * Centralizes all per-location config synchronization:
 * 1. Fetches effective POS config on init
 * 2. Polls every 5 minutes for config changes from other stations
 *
 * Config changes are infrequent (settings page only). Polling is simpler,
 * cheaper, and more reliable than maintaining dedicated realtime channels.
 *
 * Outbound broadcasts (when THIS station updates config) still happen via
 * useLocationConfigStore._broadcastConfigUpdate - fire-and-forget ephemeral
 * channels that self-cleanup.
 *
 * Usage (in PosSyncProvider):
 *   const cleanup = initLocationConfigSync(supabase, locationId, stationId)
 *   // On unmount:
 *   cleanup()
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { useLocationConfigStore } from '@/stores/useLocationConfigStore'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import type { ConfigNamespace } from '@/types/locationConfig'
import { DEFAULT_POS_CONFIG } from '@/types/locationConfig'

const LOG_TAG = '[LocationConfigSync]'
const CONFIG_POLL_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

/**
 * Initialize location config sync.
 * Call once when location/station is selected. Returns cleanup function.
 */
export function initLocationConfigSync(
  supabase: SupabaseClient,
  locationId: string,
  stationId: string | null
): () => void {
  // 1. Provide supabase client to the store for outbound syncing
  useLocationConfigStore.getState()._setSupabase(supabase, stationId)

  // 2. Fetch current effective POS config from backend and hydrate
  _fetchAndHydrate(supabase, locationId, stationId)

  // 3. Poll every 5 minutes for config changes from other stations
  const pollInterval = setInterval(() => {
    _fetchAndHydrate(supabase, locationId, stationId)
  }, CONFIG_POLL_INTERVAL_MS)

  return () => {
    clearInterval(pollInterval)
  }
}

// ============================================================================
// INTERNAL
// ============================================================================

export async function refreshLocationConfig(
  supabase: SupabaseClient,
  locationId: string,
  stationId: string | null = null
) {
  const resolvedStationId =
    stationId ?? useStoreSettingsStore.getState().selectedStation?.id ?? null
  await _fetchAndHydrate(supabase, locationId, resolvedStationId)
}

async function _fetchAndHydrate(
  supabase: SupabaseClient,
  locationId: string,
  stationId: string | null = null
) {
  try {
    let config: Record<string, any> | null = null
    let shouldBackfillLocationDefaults = false

    if (stationId) {
      const { data: effectiveConfig, error: effectiveError } =
        await supabase.rpc('get_effective_pos_config', {
          p_station_id: stationId,
        })

      if (effectiveError) {
        console.warn(
          `${LOG_TAG} Effective station config unavailable; falling back to location config:`,
          effectiveError.message
        )
      } else if (effectiveConfig) {
        config = (effectiveConfig as Record<string, any>) ?? {}
      }
    }

    if (!config) {
      config = await _fetchLocationConfig(supabase, locationId)
      if (!config) return
      shouldBackfillLocationDefaults = true
    }

    useLocationConfigStore.getState().hydrateConfig(locationId, config, stationId)
    if (__DEV__) {
      console.log(
        `${LOG_TAG} Hydrated config for location ${locationId}` +
          (stationId ? ` / station ${stationId}` : '')
      )
    }

    // Backfill only when reading raw location config. Effective station config
    // may include station overrides and must not be written back to location
    // defaults.
    if (shouldBackfillLocationDefaults) {
      void _backfillMissingDefaults(supabase, locationId, config)
    }

    // Sync resolved workflowMode to selectedStore for backward compat
    const resolvedMode = useLocationConfigStore.getState().config.kds.workflowMode
    const current = useStoreSettingsStore.getState().selectedStore
    if (current) {
      useStoreSettingsStore.getState().setSelectedStore({
        ...current,
        kds_workflow_mode: resolvedMode,
      })
    }
  } catch (err) {
    console.error(`${LOG_TAG} Failed to hydrate config:`, err)
  }
}

async function _fetchLocationConfig(
  supabase: SupabaseClient,
  locationId: string
): Promise<Record<string, any> | null> {
  const { data, error } = await supabase
    .from('locations')
    .select('pos_config, public_metadata, kds_workflow_mode')
    .eq('id', locationId)
    .maybeSingle()

  if (error) {
    console.error(`${LOG_TAG} Failed to fetch pos_config:`, error.message)
    return null
  }

  if (!data) {
    // 0 rows. RLS on `locations` is authenticated-only and scoped to
    // (user_belongs_to_merchant OR is_location_member), so an empty result
    // means the active session cannot see this location. Almost always the
    // persisted selectedStore belongs to a different environment/identity
    // than the one now running, or the signed-in user is not a member of this
    // location. Config falls back to defaults rather than surfacing a cryptic
    // PGRST116 error.
    console.warn(
      `${LOG_TAG} Location ${locationId} not visible to current session - ` +
        `wrong environment for this store, or no access. Skipping config hydrate; using defaults.`
    )
    return null
  }

  let config = (data.pos_config as Record<string, any>) ?? {}

  // Backward compat: if pos_config.dining is empty but
  // public_metadata.dining_settings exists, use that as the dining config.
  const publicMeta = data.public_metadata as Record<string, any> | null
  if (
    (!config.dining || Object.keys(config.dining).length === 0) &&
    publicMeta?.dining_settings
  ) {
    config = { ...config, dining: publicMeta.dining_settings }
  }

  // Backward compat: if kds.workflowMode is absent, pull from legacy column.
  if ((!config.kds || !config.kds.workflowMode) && data.kds_workflow_mode) {
    config = {
      ...config,
      kds: { ...(config.kds ?? {}), workflowMode: data.kds_workflow_mode },
    }
  }

  return config
}

/**
 * Backfill missing default fields into the DB.
 * If a namespace exists in the DB but is missing fields that have defaults,
 * write the full merged config back so the DB is complete.
 * Uses the RPC (deep merge) so it will not overwrite existing values.
 */
async function _backfillMissingDefaults(
  supabase: SupabaseClient,
  locationId: string,
  dbConfig: Record<string, any>
) {
  const namespaces: ConfigNamespace[] = [
    'dining', 'kds', 'printing', 'cashDrawer',
    'onlineOrdering', 'tips', 'preAuth', 'waitlist', 'payment',
    'notifications', 'timeclock', 'fraudDetection',
  ]

  for (const ns of namespaces) {
    const dbNamespace = dbConfig[ns]
    const defaults = DEFAULT_POS_CONFIG[ns] as unknown as Record<string, unknown>
    if (!defaults) continue

    // Find fields present in defaults but missing from DB
    const missingFields: Record<string, unknown> = {}
    for (const key of Object.keys(defaults)) {
      if (!dbNamespace || dbNamespace[key] === undefined) {
        missingFields[key] = defaults[key]
      }
    }

    if (Object.keys(missingFields).length > 0) {
      if (__DEV__) {
        console.log(
          `${LOG_TAG} Backfilling ${Object.keys(missingFields).length} missing defaults for ${ns}:`,
          Object.keys(missingFields)
        )
      }
      try {
        await supabase.rpc('update_location_pos_config', {
          p_location_id: locationId,
          p_namespace: ns,
          p_config: missingFields,
        })
      } catch (err) {
        console.warn(`${LOG_TAG} Backfill failed for ${ns}:`, err)
      }
    }
  }
}
