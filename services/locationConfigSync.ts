/**
 * Location Config Sync Service
 *
 * Centralizes all per-location config synchronization:
 * 1. Fetches pos_config from locations table on init
 * 2. Subscribes to broadcast channel for real-time CONFIG_UPDATE events
 * 3. Handles legacy SETTINGS_UPDATE events for backward compat
 *
 * Usage (in PosSyncProvider):
 *   const cleanup = initLocationConfigSync(supabase, locationId, stationId)
 *   // On unmount:
 *   cleanup()
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { useLocationConfigStore } from '@/stores/useLocationConfigStore'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import { useKDSStore } from '@/stores/useKDSStore'
import type { ConfigNamespace, LocationPosConfig } from '@/types/locationConfig'
import { DEFAULT_POS_CONFIG } from '@/types/locationConfig'

const LOG_TAG = '[LocationConfigSync]'

/**
 * Initialize location config sync.
 * Call once when location is selected. Returns cleanup function.
 */
export function initLocationConfigSync(
  supabase: SupabaseClient,
  locationId: string,
  stationId: string | null
): () => void {
  // 1. Provide supabase client to the store for outbound syncing
  useLocationConfigStore.getState()._setSupabase(supabase, stationId)

  // 2. Fetch current pos_config from backend and hydrate
  _fetchAndHydrate(supabase, locationId)

  // 3. Subscribe to broadcast channel for inbound config updates
  const channel = supabase.channel(`location:${locationId}:config`)

  // Handle new CONFIG_UPDATE events (from useLocationConfigStore.updateConfig)
  channel.on('broadcast', { event: 'CONFIG_UPDATE' }, (msg: any) => {
    const payload = msg.payload
    if (!payload) return

    // Skip if we sent this (already applied optimistically)
    if (payload.sender_station_id && payload.sender_station_id === stationId) return

    const namespace = payload.namespace as ConfigNamespace
    const data = payload.data

    if (namespace && data) {
      console.log(`${LOG_TAG} Received CONFIG_UPDATE for ${namespace}`)
      useLocationConfigStore.getState().applyRemoteConfig(namespace, data)

      // Side effect: KDS re-fetch when workflow mode changes
      if (namespace === 'kds' && data.workflowMode) {
        // Also sync to selectedStore for backward compat
        const current = useStoreSettingsStore.getState().selectedStore
        if (current) {
          useStoreSettingsStore.getState().setSelectedStore({
            ...current,
            kds_workflow_mode: data.workflowMode,
          })
        }
        _refreshKdsIfNeeded()
      }
    }
  })

  // Handle legacy SETTINGS_UPDATE events (backward compat during migration)
  channel.on('broadcast', { event: 'SETTINGS_UPDATE' }, (msg: any) => {
    const payload = msg.payload
    if (!payload) return

    // Skip self
    if (payload.sender_station_id && payload.sender_station_id === stationId) return

    if (payload.setting === 'dining_settings' && payload.value) {
      console.log(`${LOG_TAG} Received legacy dining_settings update`)
      useLocationConfigStore.getState().applyRemoteConfig('dining', payload.value)
    }

    if (payload.setting === 'kds_workflow_mode' && payload.value) {
      console.log(`${LOG_TAG} Received legacy kds_workflow_mode update`)
      useLocationConfigStore.getState().applyRemoteConfig('kds', {
        workflowMode: payload.value,
      })
      // Also update selectedStore for backward compat (other code may still read from there)
      const current = useStoreSettingsStore.getState().selectedStore
      if (current) {
        useStoreSettingsStore.getState().setSelectedStore({
          ...current,
          kds_workflow_mode: payload.value,
        })
      }
      _refreshKdsIfNeeded()
    }
  })

  channel.subscribe()

  // Also subscribe to the old channel name for backward compat with stations
  // that haven't updated yet and still broadcast on the old channel
  const legacyChannel = supabase.channel(`location:${locationId}:settings`)

  legacyChannel.on('broadcast', { event: 'SETTINGS_UPDATE' }, (msg: any) => {
    const payload = msg.payload
    if (!payload) return
    if (payload.sender_station_id && payload.sender_station_id === stationId) return

    if (payload.setting === 'dining_settings' && payload.value) {
      useLocationConfigStore.getState().applyRemoteConfig('dining', payload.value)
    }

    if (payload.setting === 'kds_workflow_mode' && payload.value) {
      useLocationConfigStore.getState().applyRemoteConfig('kds', {
        workflowMode: payload.value,
      })
      const current = useStoreSettingsStore.getState().selectedStore
      if (current) {
        useStoreSettingsStore.getState().setSelectedStore({
          ...current,
          kds_workflow_mode: payload.value,
        })
      }
      _refreshKdsIfNeeded()
    }
  })

  legacyChannel.subscribe()

  // Return cleanup
  return () => {
    supabase.removeChannel(channel)
    supabase.removeChannel(legacyChannel)
    // Flush any pending debounced syncs
  }
}

// ============================================================================
// INTERNAL
// ============================================================================

async function _fetchAndHydrate(supabase: SupabaseClient, locationId: string) {
  try {
    const { data, error } = await supabase
      .from('locations')
      .select('pos_config, public_metadata, kds_workflow_mode')
      .eq('id', locationId)
      .single()

    if (error) {
      console.error(`${LOG_TAG} Failed to fetch pos_config:`, error.message)
      return
    }

    if (!data) return

    let config = (data.pos_config as Record<string, any>) ?? {}

    // Backward compat: if pos_config.dining is empty but public_metadata.dining_settings exists,
    // use that as the dining config source
    const publicMeta = data.public_metadata as Record<string, any> | null
    if (
      (!config.dining || Object.keys(config.dining).length === 0) &&
      publicMeta?.dining_settings
    ) {
      config = { ...config, dining: publicMeta.dining_settings }
    }

    // Backward compat: if kds.workflowMode not in pos_config, pull from column
    if (
      (!config.kds || !config.kds.workflowMode) &&
      data.kds_workflow_mode
    ) {
      config = {
        ...config,
        kds: { ...(config.kds ?? {}), workflowMode: data.kds_workflow_mode },
      }
    }

    useLocationConfigStore.getState().hydrateConfig(locationId, config)
    console.log(`${LOG_TAG} Hydrated config for location ${locationId}`)

    // Backfill: if any namespace in the DB is missing fields that have defaults,
    // write the complete merged config back so the DB is fully populated.
    // This is a one-time heal — subsequent updates are partial and that's fine.
    _backfillMissingDefaults(supabase, locationId, config)

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

/**
 * Backfill missing default fields into the DB.
 * If a namespace exists in the DB but is missing fields that have defaults,
 * write the full merged config back so the DB is complete.
 * Uses the RPC (deep merge) so it won't overwrite existing values.
 */
async function _backfillMissingDefaults(
  supabase: SupabaseClient,
  locationId: string,
  dbConfig: Record<string, any>
) {
  const namespaces: ConfigNamespace[] = [
    'dining', 'kds', 'printing', 'cashDrawer',
    'onlineOrdering', 'tips', 'preAuth', 'waitlist', 'payment',
    'notifications',
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
      console.log(`${LOG_TAG} Backfilling ${Object.keys(missingFields).length} missing defaults for ${ns}:`, Object.keys(missingFields))
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

function _refreshKdsIfNeeded() {
  const kds = useKDSStore.getState()
  if (kds._lastLocationId) {
    kds._backgroundFetchTickets(kds._lastLocationId)
  }
}
