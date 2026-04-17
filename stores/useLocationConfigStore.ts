/**
 * Unified Location Config Store
 *
 * Single source of truth for all per-location POS settings.
 * Replaces fragmented storage across useSettingsStore (dining) and
 * useStoreSettingsStore (KDS, cash drawer, online ordering, etc.).
 *
 * Usage:
 *   const enableCoursing = useLocationConfigStore(s => s.config.dining.enableCoursing)
 *   const updateConfig = useLocationConfigStore(s => s.updateConfig)
 *   updateConfig('dining', { enableCoursing: true })
 */

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { persist } from 'zustand/middleware'
import { createLazyPersistStorage } from '@/lib/storage'
import { debounce } from 'lodash'
import type {
  LocationPosConfig,
  ConfigNamespace,
  ConfigForNamespace,
} from '@/types/locationConfig'
import { DEFAULT_POS_CONFIG } from '@/types/locationConfig'
import type { SupabaseClient } from '@supabase/supabase-js'

// ============================================================================
// TYPES
// ============================================================================

interface LocationConfigState {
  config: LocationPosConfig
  _locationId: string | null
  _lastSyncedAt: number | null

  // Actions
  hydrateConfig: (locationId: string, fullConfig: Partial<LocationPosConfig>) => void
  updateConfig: <N extends ConfigNamespace>(
    namespace: N,
    partialData: Partial<ConfigForNamespace<N>>
  ) => void
  applyRemoteConfig: <N extends ConfigNamespace>(
    namespace: N,
    data: Partial<ConfigForNamespace<N>>
  ) => void
  _setSupabase: (client: SupabaseClient, stationId: string | null) => void
}

// ============================================================================
// INTERNAL — debounced RPC + broadcast
// ============================================================================

let _supabase: SupabaseClient | null = null
let _stationId: string | null = null

/** Per-namespace debounced backend sync */
const _debouncedSyncers: Partial<Record<ConfigNamespace, ReturnType<typeof debounce>>> = {}

function _getDebouncedSyncer(namespace: ConfigNamespace) {
  if (!_debouncedSyncers[namespace]) {
    _debouncedSyncers[namespace] = debounce(async (locationId: string, data: any) => {
      if (!_supabase || !locationId) return

      try {
        const { error } = await _supabase.rpc('update_location_pos_config', {
          p_location_id: locationId,
          p_namespace: namespace,
          p_config: data,
        })

        if (error) {
          console.error(`[LocationConfig] RPC error for ${namespace}:`, error.message)
          return
        }

        // Broadcast to other stations
        _broadcastConfigUpdate(locationId, namespace, data)
      } catch (err) {
        console.error(`[LocationConfig] Sync failed for ${namespace}:`, err)
      }
    }, 500)
  }
  return _debouncedSyncers[namespace]!
}

function _broadcastConfigUpdate(locationId: string, namespace: string, data: any) {
  if (!_supabase) return

  const channel = _supabase.channel(`location:${locationId}:settings`)
  channel.subscribe((status: string) => {
    if (status === 'SUBSCRIBED') {
      channel.send({
        type: 'broadcast',
        event: 'CONFIG_UPDATE',
        payload: {
          namespace,
          data,
          sender_station_id: _stationId,
          timestamp: Date.now(),
        },
      })
      // Clean up after sending
      setTimeout(() => _supabase?.removeChannel(channel), 1000)
    }
  })
}

// ============================================================================
// STORE
// ============================================================================

export const useLocationConfigStore = create<LocationConfigState>()(
  persist(
    immer((set, get) => ({
      config: { ...DEFAULT_POS_CONFIG },
      _locationId: null,
      _lastSyncedAt: null,

      _setSupabase: (client: SupabaseClient, stationId: string | null) => {
        _supabase = client
        _stationId = stationId
      },

      hydrateConfig: (locationId: string, fullConfig: Partial<LocationPosConfig>) => {
        set((state) => {
          state._locationId = locationId
          state._lastSyncedAt = Date.now()

          // Deep merge each namespace: defaults ← backend values
          const namespaces: ConfigNamespace[] = [
            'dining', 'kds', 'printing', 'cashDrawer',
            'onlineOrdering', 'tips', 'preAuth', 'waitlist', 'payment',
            'notifications',
          ]

          for (const ns of namespaces) {
            if (fullConfig[ns]) {
              state.config[ns] = {
                ...DEFAULT_POS_CONFIG[ns],
                ...fullConfig[ns],
              } as any
            }
          }

          if (fullConfig._version != null) {
            state.config._version = fullConfig._version
          }
          if (fullConfig._updated_at != null) {
            state.config._updated_at = fullConfig._updated_at
          }
        })
      },

      updateConfig: <N extends ConfigNamespace>(
        namespace: N,
        partialData: Partial<ConfigForNamespace<N>>
      ) => {
        const locationId = get()._locationId

        // 1. Optimistic local update
        set((state) => {
          state.config[namespace] = {
            ...state.config[namespace],
            ...partialData,
          } as any
        })

        // 2. Debounced backend sync + broadcast
        if (locationId) {
          _getDebouncedSyncer(namespace)(locationId, partialData)
        }
      },

      applyRemoteConfig: <N extends ConfigNamespace>(
        namespace: N,
        data: Partial<ConfigForNamespace<N>>
      ) => {
        set((state) => {
          state.config[namespace] = {
            ...state.config[namespace],
            ...data,
          } as any
          state._lastSyncedAt = Date.now()
        })
      },
    })),
    {
      name: 'location-config-storage',
      storage: createLazyPersistStorage(),
      partialize: (state) => ({
        config: state.config,
        _locationId: state._locationId,
        _lastSyncedAt: state._lastSyncedAt,
      }),
      // Deep-merge persisted config against defaults so newly-added namespaces
      // are always present even if the stored blob pre-dates them.
      merge: (persistedState: any, currentState: LocationConfigState) => {
        const namespaces: ConfigNamespace[] = [
          'dining', 'kds', 'printing', 'cashDrawer',
          'onlineOrdering', 'tips', 'preAuth', 'waitlist', 'payment',
          'notifications',
        ]
        const mergedConfig = { ...DEFAULT_POS_CONFIG }
        for (const ns of namespaces) {
          if (persistedState?.config?.[ns]) {
            mergedConfig[ns] = {
              ...DEFAULT_POS_CONFIG[ns],
              ...persistedState.config[ns],
            } as any
          }
        }
        if (persistedState?.config?._version != null) {
          mergedConfig._version = persistedState.config._version
        }
        if (persistedState?.config?._updated_at != null) {
          mergedConfig._updated_at = persistedState.config._updated_at
        }
        return {
          ...currentState,
          ...persistedState,
          config: mergedConfig,
        }
      },
    }
  )
)
