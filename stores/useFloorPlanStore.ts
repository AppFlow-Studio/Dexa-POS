import { findReservationTableConflictForWindow } from '@/lib/reservationConflicts'
import { createLazyPersistStorage } from '@/lib/storage'
import { TABLE_SHAPES } from '@/lib/table-shapes'
import { isLocalOnlyStatus } from '@/lib/tableStateMachine'
import { FloorPlanService } from '@/services/floorPlanService'
import { getIsOnline } from '@/services/offlineSyncService'
import {
  FloorPlan,
  FloorPlanObject,
  Reservation,
  ServerSection,
  TableSession,
  TableStatus,
  WaitlistEntry
} from '@/types/db-floor-plan-types'
import type { TableSessionPayload } from '@/types/real-time'
import { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import { create } from 'zustand'
import {
  persist,
  subscribeWithSelector
} from 'zustand/middleware'
// Lazy accessor — breaks circular dependency with useTableSessionStore
const getTableSessionStore = () =>
  (require('./useTableSessionStore') as typeof import('./useTableSessionStore'))
    .useTableSessionStore

// Lazy accessor — breaks circular dependency with useReservationStore
const getReservationStore = () =>
  (require('./useReservationStore') as typeof import('./useReservationStore'))
    .useReservationStore

// Global client reference to avoid direct dependency loops or hook usage outside components
let _supabaseClient: SupabaseClient | null = null

// Dedup concurrent loadFloorPlanStatus calls (module-level to avoid re-renders)
let _loadFloorPlanPromise: Promise<void> | null = null
let _loadFloorPlanId: string | null = null // Track which plan is being loaded

export const setFloorPlanSupabaseClient = (client: SupabaseClient | null) => {
  _supabaseClient = client
}

const getClient = () => {
  if (!_supabaseClient) {
    console.warn(
      'Supabase client not set in useFloorPlanStore, some actions may fail.'
    )
  }
  return _supabaseClient!
}

/** Expose client getter for useTableSessionStore (avoids duplicate registration) */
export const getFloorPlanClient = getClient

function getSelectedTablesCapacity (
  tablesById: Record<string, FloorPlanObject>,
  tableIds: string[]
): { totalCapacity: number; hasKnownCapacity: boolean } {
  let totalCapacity = 0
  let hasKnownCapacity = false

  for (const tableId of tableIds) {
    const capacity = tablesById[tableId]?.capacity
    if (typeof capacity === 'number' && capacity > 0) {
      totalCapacity += capacity
      hasKnownCapacity = true
    }
  }

  return { totalCapacity, hasKnownCapacity }
}

interface FloorPlanState {
  // Data
  locationId: string | null
  floorPlans: FloorPlan[]
  activeFloorPlanId: string | null
  tables: FloorPlanObject[]
  tablesById: Record<string, FloorPlanObject> // O(1) lookup map
  waitlist: WaitlistEntry[]
  reservations: Reservation[]
  sections: ServerSection[]
  sectionsById: Record<string, ServerSection>

  // Realtime State
  realtimeStatus: 'connected' | 'reconnecting' | 'disconnected'
  realtimeError: string | null
  _reconnectAttempts: number
  _reconnectTimeout: ReturnType<typeof setTimeout> | null
  _isCleaningUp: boolean
  _handleSessionChange: (payload: TableSessionPayload) => void
  _handleReconnect: (locationId: string) => void
  manualReconnect: () => void

  // UI State
  selectedTableIds: string[]
  isDesignMode: boolean
  isLoading: boolean
  error: string | null
  lastSyncAt: string | null // ISO string for persistence

  // Undo/Redo (design mode only)
  past: FloorPlanObject[][]
  future: FloorPlanObject[][]

  // Connection
  isOnline: boolean
  realtimeChannel: RealtimeChannel | null

  // Actions
  setFloorPlans: (floorPlans: FloorPlan[]) => void
  setActiveFloorPlanId: (floorPlanId: string | null) => void
  cleanup: () => void
  setupRealtimeSubscriptions: (locationId: string) => void

  // Floor Plan Actions
  setActiveFloorPlan: (floorPlanId: string) => Promise<void>
  createFloorPlan: (name: string, description?: string) => Promise<string>
  updateFloorPlan: (id: string, updates: Partial<FloorPlan>) => Promise<void>
  deleteFloorPlan: (id: string) => Promise<void>
  loadFloorPlanStatus: () => Promise<void>
  loadFloorPlanStatusIfStale: (ttlMs?: number) => Promise<void>
  refreshTableSessions: () => Promise<void>

  // Table Design Actions (Design Mode)
  setDesignMode: (enabled: boolean) => void
  addTable: (tableData: Partial<FloorPlanObject>) => Promise<string>
  updateTablePosition: (
    tableId: string,
    x: number,
    y: number,
    rotation?: number
  ) => Promise<void>
  updateTableName: (tableId: string, name: string) => Promise<void> // Added
  updateTableSize: (
    tableId: string,
    width: number,
    height: number
  ) => Promise<void>
  updateTablePositionsBatch: (
    updates: Array<{ id: string; x: number; y: number; rotation?: number }>
  ) => Promise<void>
  removeTable: (tableId: string) => Promise<void>

  // Table Session Actions (Service Mode)
  seatGuests: (params: {
    tableIds: string[]
    partySize: number
    guestName?: string
    guestPhone?: string
    guestNotes?: string
    reservationId?: string
    waitlistId?: string
    createOrder?: boolean
    selected_station?: string
    device_id?: string
    localOrderId?: string // Pre-created local order ID to use instead of generating one
  }) => Promise<{ sessionId: string; orderId?: string }>

  updateSessionStatus: (
    sessionId: string,
    status: TableStatus,
    notes?: string
  ) => Promise<void>
  transferSession: (sessionId: string, newTableIds: string[]) => Promise<void>
  mergeTable: (sessionId: string, tableId: string) => Promise<void>
  unmergeTable: (sessionId: string, tableId: string) => Promise<void>
  advanceCourse: (sessionId: string) => Promise<void>
  linkOrderToSession: (sessionId: string, orderId: string) => Promise<void>
  clearTableSession: (tableId: string) => Promise<void>
  finishCleaning: (tableId: string) => Promise<void>

  // Selection Actions
  toggleTableSelection: (tableId: string) => void
  clearSelection: () => void
  selectMultipleTables: (tableIds: string[]) => void

  // Waitlist Actions
  loadWaitlist: () => Promise<void>
  addToWaitlist: (params: {
    partyName: string
    partySize: number
    phone?: string
    notes?: string
    preferredSection?: string
    quotedWaitMinutes?: number
  }) => Promise<{ waitlistId: string; position: number; quotedWait: number }>
  notifyWaitlistParty: (
    waitlistId: string
  ) => Promise<{ phone: string; message: string }>
  updateWaitlistStatus: (waitlistId: string, status: string) => Promise<void>
  seatFromWaitlist: (
    waitlistId: string,
    tableIds: string[]
  ) => Promise<{ sessionId: string; orderId?: string }>

  // Reservation Actions
  loadReservations: (date?: string) => Promise<void>
  createReservation: (params: {
    partyName: string
    partySize: number
    phone: string
    date: string
    time: string
    email?: string
    notes?: string
    specialRequests?: string
    isVip?: boolean
  }) => Promise<{ reservationId: string; confirmationNumber: string }>
  updateReservationStatus: (
    reservationId: string,
    status: Reservation['status']
  ) => Promise<void>
  assignReservationTables: (
    reservationId: string,
    tableIds: string[]
  ) => Promise<void>
  seatReservation: (
    reservationId: string,
    tableIds?: string[]
  ) => Promise<{ sessionId: string; orderId?: string }>
  checkAvailability: (
    date: string,
    time: string,
    partySize: number
  ) => Promise<FloorPlanObject[]>

  // Undo/Redo (design mode)
  undo: () => void
  redo: () => void
  saveSnapshot: () => void

  // Server Section Actions
  assignServerToSection: (
    sectionId: string,
    staffProfileId: string
  ) => Promise<void>
  unassignServerFromSection: (sectionId: string) => Promise<void>

  // O(1) Getters
  getTableById: (id: string) => FloorPlanObject | undefined

  // Internal helpers
  _debouncedRefresh: () => void
}

// Helper to build tablesById map from tables array
// Helper function to rebuild the tablesById lookup map
// Exported for use in other stores that need to update table state
export const buildTablesById = (
  tables: FloorPlanObject[]
): Record<string, FloorPlanObject> => {
  return tables.reduce((acc, table) => {
    acc[table.id] = table
    return acc
  }, {} as Record<string, FloorPlanObject>)
}

export const useFloorPlanStore = create<FloorPlanState>()(
  subscribeWithSelector(
    persist(
      (set, get) => ({
        // Initial State
        locationId: null,
        floorPlans: [],
        activeFloorPlanId: null,
        tables: [],
        tablesById: {}, // O(1) lookup map
        waitlist: [],
        reservations: [],
        sections: [],
        sectionsById: {},
        selectedTableIds: [],
        isDesignMode: false,
        isLoading: false,
        error: null,
        lastSyncAt: null,
        past: [],
        future: [],
        isOnline: true,
        realtimeChannel: null,

        realtimeStatus: 'disconnected',
        realtimeError: null,
        // ====================================================================
        // SETTER ACTIONS (for external sync)
        // ====================================================================

        setFloorPlans: (floorPlans: FloorPlan[]) => {
          set({ floorPlans })
        },

        setActiveFloorPlanId: (floorPlanId: string | null) => {
          set({ activeFloorPlanId: floorPlanId })
        },

        // setupRealtimeSubscriptions with broadcast messages:
        setupRealtimeSubscriptions: async (locationId: string) => {
          const supabase = getClient()
          if (!supabase) return

          // Clean up existing
          const existingChannel = get().realtimeChannel
          if (existingChannel) {
            supabase.removeChannel(existingChannel)
          }

          // IMPORTANT: Set auth for private channels
          await supabase.realtime.setAuth()

          // NOTE: Realtime subscriptions are now handled ENTIRELY by useFloorRealtime hook
          // (in LocationRealtimeProvider). Creating duplicate subscriptions here caused
          // race conditions where multiple listeners tried to update the same state.
          // The hook calls _handleSessionChange() and loadFloorPlanStatus() in the correct order.
          const channel = supabase
            .channel(`location:${locationId}:tables`, {
              config: { private: true } // Use private channel with RLS
            })
            .subscribe((status, err) => {
              // console.log('[Realtime] Status:', status, err)

              switch (status) {
                case 'SUBSCRIBED':
                  set({
                    realtimeStatus: 'connected',
                    realtimeError: null,
                    isOnline: true,
                    _reconnectAttempts: 0 // Reset counter on success
                  })
                  // THROTTLE (Phase 1.3): Only refresh if last refresh was > 2 seconds ago
                  const lastSync = get().lastSyncAt
                  const now = Date.now()
                  if (!lastSync || now - new Date(lastSync).getTime() > 2000) {
                    get().loadFloorPlanStatus()
                  } else {
                    console.log(
                      '[FloorPlanStore] Skipping refresh - last sync was < 2s ago'
                    )
                  }
                  break

                case 'CHANNEL_ERROR':
                  set({
                    realtimeStatus: 'reconnecting',
                    realtimeError: err?.message || 'Connection error'
                  })
                  // Auto-reconnect with backoff
                  get()._handleReconnect(locationId)
                  break

                case 'TIMED_OUT':
                  set({ realtimeStatus: 'reconnecting' })
                  get()._handleReconnect(locationId)
                  break

                case 'CLOSED':
                  set({ realtimeStatus: 'disconnected', isOnline: false })
                  // Auto-reconnect on close (unless cleanup was called intentionally)
                  if (!get()._isCleaningUp) {
                    get()._handleReconnect(locationId)
                  }
                  break
              }
            })

          set({ realtimeChannel: channel, locationId })
        },

        // NEW: Smart session change handler (avoids full refresh when possible)
        _handleSessionChange: (payload: TableSessionPayload) => {
          const { operation, data } = payload

          if (operation === 'DELETE' || !data?.session) {
            // Full refresh for deletes (simpler)
            // NOTE: Cancel pending load to prevent stale data from overwriting cleared state
            _loadFloorPlanPromise = null
            _loadFloorPlanId = null
            get()._debouncedRefresh()
            return
          }

          // If session is no longer active, clear it from all tables
          if (data.session.is_active === false) {
            const sessionId = data.session.id
            set(state => {
              let changed = false
              const newTables = state.tables.map(t => {
                if (t.session?.id === sessionId) {
                  changed = true
                  return { ...t, session: undefined }
                }
                return t
              })
              if (!changed) return {}
              return {
                tables: newTables,
                tablesById: buildTablesById(newTables)
              }
            })
            // NOTE: Don't call _debouncedRefresh here - state is already cleared.
            // The realtime UPDATE with is_active=false means the DB is already updated.
            // If we refresh, we might re-fetch the session before it's marked inactive server-side,
            // causing it to briefly re-appear. Instead, let the clear stand and any future
            // updates will come via realtime.
            return
          }

          // For INSERT/UPDATE, try to patch local state
          const sessionId = data.session.id
          const tableIds = data.tables?.map(t => t.table_id) || []

          // Base session data from broadcast (server_staff_id is NOT in the payload;
          // it's preserved per-table inside the set() callback below)
          const newSessionData = {
            id: sessionId,
            status: data.session.status,
            party_size: data.session.party_size,
            guest_name: data.session.guest_name,
            seated_at: data.session.seated_at || new Date().toISOString(),
            current_course: data.session.current_course,
            needs_attention: data.session.needs_attention,
            is_vip: data.session.is_vip,
            order_id: data.session.order_id,
            reservation_id: (data.session as any).reservation_id ?? null,
            session_number: data.session.session_number,
            merged_tables: tableIds.length > 1 ? tableIds : undefined
          }

          set(state => {
            let changed = false
            const newTables = state.tables.map(t => {
              // Check if this table is part of the updated session
              if (tableIds.includes(t.id)) {
                // Preserve local-only status: if current session matches
                // and has a local-only status, don't overwrite
                if (
                  t.session?.id === sessionId &&
                  isLocalOnlyStatus(t.session.status)
                ) {
                  return t
                }
                // Build the final session with server_staff_id preserved from current table
                const sessionWithPreservedFields = {
                  ...newSessionData,
                  server_staff_id:
                    t.session?.id === sessionId
                      ? t.session.server_staff_id
                      : undefined
                }
                // Only create new object if data actually differs
                const s = t.session
                if (
                  s?.id === sessionId &&
                  s?.status === sessionWithPreservedFields.status &&
                  s?.party_size === sessionWithPreservedFields.party_size &&
                  s?.order_id === sessionWithPreservedFields.order_id &&
                  s?.guest_name === sessionWithPreservedFields.guest_name &&
                  s?.current_course ===
                    sessionWithPreservedFields.current_course &&
                  s?.needs_attention ===
                    sessionWithPreservedFields.needs_attention &&
                  s?.is_vip === sessionWithPreservedFields.is_vip &&
                  s?.server_staff_id ===
                    sessionWithPreservedFields.server_staff_id
                ) {
                  return t // same reference — no change
                }
                changed = true
                return { ...t, session: sessionWithPreservedFields }
              }
              // Clear session if table was previously in this session but isn't anymore
              if (t.session?.id === sessionId) {
                changed = true
                return { ...t, session: undefined }
              }
              return t
            })

            if (!changed) return {} // no state update
            return {
              tables: newTables,
              tablesById: buildTablesById(newTables)
            }
          })
        },

        // NEW: Reconnection with exponential backoff
        _reconnectAttempts: 0,
        _reconnectTimeout: null as ReturnType<typeof setTimeout> | null,
        _isCleaningUp: false,

        _handleReconnect: (locationId: string) => {
          const maxAttempts = 5
          const state = get()

          if (state._reconnectAttempts >= maxAttempts) {
            console.warn('[Realtime] Max reconnect attempts reached')
            set({
              realtimeStatus: 'disconnected',
              realtimeError: 'Connection failed. Tap to retry.'
            })
            return
          }

          // Clear existing timeout
          if (state._reconnectTimeout) {
            clearTimeout(state._reconnectTimeout)
          }

          // Faster backoff: 0ms (instant), 500ms, 1s, 2s, 4s
          const delay =
            state._reconnectAttempts === 0
              ? 0
              : 500 * Math.pow(2, state._reconnectAttempts - 1)

          console.log(
            `[Realtime] Reconnecting in ${delay}ms (attempt ${
              state._reconnectAttempts + 1
            })`
          )

          const timeout = setTimeout(async () => {
            set({ _reconnectAttempts: get()._reconnectAttempts + 1 })

            // Unsubscribe first (Reddit pattern)
            const channel = get().realtimeChannel
            if (channel) {
              const supabase = getClient()
              if (supabase) await supabase.removeChannel(channel)
            }

            // Re-subscribe
            get().setupRealtimeSubscriptions(locationId)
          }, delay)

          set({ _reconnectTimeout: timeout })
        },

        // NEW: Manual reconnect (for UI button)
        manualReconnect: () => {
          const locationId = get().locationId
          if (!locationId) return

          set({ _reconnectAttempts: 0, realtimeStatus: 'reconnecting' })
          get().setupRealtimeSubscriptions(locationId)
        },

        // Add debounced refresh helper (prevents rapid reloads)
        // UPDATED (Phase 1.3): Increased from 300ms to 500ms to reduce refresh frequency
        _debouncedRefresh: (() => {
          let timeoutId: ReturnType<typeof setTimeout> | null = null
          return () => {
            if (timeoutId) clearTimeout(timeoutId)
            timeoutId = setTimeout(() => {
              useFloorPlanStore.getState().loadFloorPlanStatus()
            }, 500) // Increased from 300ms to 500ms
          }
        })(),

        cleanup: () => {
          set({ _isCleaningUp: true })
          const supabase = getClient()
          const channel = get().realtimeChannel
          if (channel && supabase) {
            supabase.removeChannel(channel)
          }
          // Clear any pending reconnect timeout
          const timeout = get()._reconnectTimeout
          if (timeout) {
            clearTimeout(timeout)
          }
          set({
            realtimeChannel: null,
            locationId: null,
            floorPlans: [],
            activeFloorPlanId: null,
            tables: [],
            tablesById: {},
            waitlist: [],
            reservations: [],
            _reconnectAttempts: 0,
            _reconnectTimeout: null,
            _isCleaningUp: false
          })
        },

        // ====================================================================
        // FLOOR PLAN ACTIONS
        // ====================================================================

        setActiveFloorPlan: async (floorPlanId: string) => {
          set({ activeFloorPlanId: floorPlanId, isLoading: true })
          await get().loadFloorPlanStatus()
          set({ isLoading: false })
        },

        createFloorPlan: async (name: string, description?: string) => {
          const supabase = getClient()
          const locationId = get().locationId
          if (!locationId) throw new Error('No location set')

          const { data, error } = await FloorPlanService.createFloorPlan(
            supabase,
            {
              p_location_id: locationId,
              p_name: name,
              p_description: description
            }
          )

          if (error) throw error
          if (!data) throw new Error('Failed to create floor plan')

          // Reload floor plans
          const { data: floorPlans } =
            await FloorPlanService.getLocationFloorPlans(supabase, locationId)

          set({ floorPlans: floorPlans || [] })

          return data.floor_plan_id
        },

        updateFloorPlan: async (id: string, updates: Partial<FloorPlan>) => {
          const supabase = getClient()
          const locationId = get().locationId
          if (!locationId) return

          const { error } = await FloorPlanService.updateFloorPlan(
            supabase,
            id,
            updates
          )
          if (error) throw error

          // Reload
          const { data: floorPlans } =
            await FloorPlanService.getLocationFloorPlans(supabase, locationId)
          set({ floorPlans: floorPlans || [] })
        },

        deleteFloorPlan: async (id: string) => {
          const supabase = getClient()
          const locationId = get().locationId
          if (!locationId) return

          const { error } = await FloorPlanService.deleteFloorPlan(supabase, id)
          if (error) throw error

          // Reload
          const { data: floorPlans } =
            await FloorPlanService.getLocationFloorPlans(supabase, locationId)

          const newPlans = floorPlans || []
          const isActive = get().activeFloorPlanId === id

          set({
            floorPlans: newPlans,
            activeFloorPlanId: isActive
              ? newPlans[0]?.id || null
              : get().activeFloorPlanId
          })

          if (isActive && newPlans.length > 0) {
            get().setActiveFloorPlan(newPlans[0].id)
          } else if (newPlans.length === 0) {
            set({ tables: [], tablesById: {} })
          }
        },

        loadFloorPlanStatus: async () => {
          const supabase = getClient()
          const floorPlanId = get().activeFloorPlanId
          if (!floorPlanId || !supabase) return

          // Only reuse promise if loading same floor plan (avoid stale data on plan switch)
          if (_loadFloorPlanPromise && _loadFloorPlanId === floorPlanId) {
            return _loadFloorPlanPromise
          }

          _loadFloorPlanId = floorPlanId
          _loadFloorPlanPromise = (async () => {
            try {
              // Parallel fetch: all floor plan objects + sections
              const [objectsResult, sectionsResult] = await Promise.all([
                FloorPlanService.getAllFloorPlanObjects(supabase, floorPlanId),
                FloorPlanService.getServerSections(supabase, floorPlanId)
              ])

              const { data: freshObjects, error } = objectsResult

              if (error) {
                set({ error: error.message })
                return
              }
              const freshTables = freshObjects || []
              const currentTablesById = get().tablesById

              // Preserve local-only states: if an object currently has a local-only
              // status with the same session ID, keep the local session
              // Also don't restore inactive sessions (is_active=false) that were just cleared
              const mergedTables = freshTables.map(freshTable => {
                const currentTable = currentTablesById[freshTable.id]
                const freshSessionIsInactive =
                  (
                    freshTable.session as unknown as
                      | { is_active?: boolean }
                      | undefined
                  )?.is_active === false

                // Preserve local-only status if still same session
                if (
                  currentTable?.session &&
                  isLocalOnlyStatus(currentTable.session.status) &&
                  freshTable.session &&
                  currentTable.session.id === freshTable.session.id
                ) {
                  return { ...freshTable, session: currentTable.session }
                }

                // Don't restore an inactive session (is_active=false) that was cleared locally
                if (!currentTable?.session && freshSessionIsInactive) {
                  return { ...freshTable, session: undefined }
                }

                return freshTable
              })

              // Enrich next_reservation from reservation store
              const getUpcomingForTable =
                getReservationStore().getState().getUpcomingForTable
              const enrichedTables = mergedTables.map(table => {
                const upcoming = getUpcomingForTable(table.id)
                const next = upcoming[0]
                if (!next) return { ...table, next_reservation: null }
                return {
                  ...table,
                  next_reservation: {
                    id: next.id,
                    party_name: next.party_name,
                    party_size: next.party_size,
                    date: next.reservation_date,
                    time: next.reservation_time,
                    status: next.status
                  }
                }
              })

              // Build sectionsById map
              const freshSections = sectionsResult.data || []
              const newSectionsById = freshSections.reduce((acc, section) => {
                acc[section.id] = section
                return acc
              }, {} as Record<string, ServerSection>)

              set({
                tables: enrichedTables,
                tablesById: buildTablesById(enrichedTables),
                sections: freshSections,
                sectionsById: newSectionsById,
                lastSyncAt: new Date().toISOString(),
                error: null
              })

              // Hydrate session store from fresh table data
              getTableSessionStore()
                .getState()
                ._patchSessionsFromTables(enrichedTables)

              // Order prefetch is now handled by services/tableOrderPrefetch.ts subscriber
            } finally {
              _loadFloorPlanPromise = null
              _loadFloorPlanId = null
            }
          })()

          return _loadFloorPlanPromise
        },

        loadFloorPlanStatusIfStale: async (ttlMs: number = 30000) => {
          const { lastSyncAt, isLoading } = get()

          // Don't refresh if already loading
          if (isLoading) {
            console.log(
              '[loadFloorPlanStatusIfStale] Skipping - already loading'
            )
            return
          }

          // Check if offline - use cached data
          const isOnline = getIsOnline()
          if (!isOnline) {
            console.log(
              '[loadFloorPlanStatusIfStale] Offline - using cached data'
            )
            return
          }

          // Check if data is stale
          const isStale =
            !lastSyncAt || Date.now() - new Date(lastSyncAt).getTime() > ttlMs

          if (isStale) {
            console.log(
              '[loadFloorPlanStatusIfStale] Data is stale - refreshing'
            )
            if (get().tables.length > 0 && get().locationId) {
              await get().refreshTableSessions() // lightweight, no geometry
            } else {
              await get().loadFloorPlanStatus() // full load
            }
          } else {
            console.log(
              '[loadFloorPlanStatusIfStale] Data is fresh - skipping refresh'
            )
          }
        },

        // Lightweight session-only refresh using get_location_table_status_v2
        // Geometry is preserved from cache — only .session is updated
        refreshTableSessions: async () => {
          const supabase = getClient()
          const locationId = get().locationId
          if (!locationId || !supabase) return

          const { data, error } = await FloorPlanService.getLocationTableStatus(
            supabase,
            locationId
          )

          if (error) {
            // If offline, restore sessions from useTableSessionStore (persisted in MMKV)
            const isOnline = getIsOnline()
            if (!isOnline) {
              console.log(
                '[refreshTableSessions] Offline — restoring sessions from session store'
              )
              const sessionState = getTableSessionStore().getState()
              const currentTables = get().tables
              const restored = currentTables.map(table => {
                const session = sessionState.sessions[table.id]
                return session ? { ...table, session } : table
              })
              set({
                tables: restored,
                tablesById: buildTablesById(restored)
              })
              return
            }
            console.warn(
              '[refreshTableSessions] Error, falling back to full load:',
              error.message
            )
            await get().loadFloorPlanStatus()
            return
          }

          if (!data) return

          // Pre-group table IDs by session for merged_tables
          const tableIdsBySession: Record<string, string[]> = {}
          for (const row of data) {
            if (row.session_id) {
              ;(tableIdsBySession[row.session_id] ??= []).push(row.table_id)
            }
          }

          // Build session lookup from flat rows: tableId → TableSession | null
          const sessionByTableId: Record<string, TableSession | null> = {}
          for (const row of data) {
            if (row.session_id && row.session_status) {
              const mergedTables = tableIdsBySession[row.session_id]
              sessionByTableId[row.table_id] = {
                id: row.session_id,
                session_number: row.session_number,
                status: row.session_status,
                party_size: row.party_size ?? 0,
                guest_name: row.guest_name,
                guest_phone: row.guest_phone ?? undefined,
                order_id: row.order_id,
                server_staff_id: row.server_staff_id ?? undefined,
                seated_at: row.seated_at ?? new Date().toISOString(),
                current_course: row.current_course ?? 1,
                needs_attention: row.needs_attention ?? false,
                is_vip: row.is_vip ?? false,
                merged_tables:
                  (mergedTables?.length ?? 0) > 1 ? mergedTables : undefined
              }
            } else {
              sessionByTableId[row.table_id] = null
            }
          }

          const currentTables = get().tables
          const currentTablesById = get().tablesById

          // Merge sessions into existing tables, preserving geometry
          const mergedTables = currentTables.map(table => {
            const incomingSession = sessionByTableId[table.id]

            // Preserve local-only statuses with the same session ID
            const currentSession = currentTablesById[table.id]?.session
            if (
              currentSession &&
              isLocalOnlyStatus(currentSession.status) &&
              incomingSession &&
              currentSession.id === incomingSession.id
            ) {
              return { ...table, session: currentSession }
            }

            return {
              ...table,
              session:
                incomingSession !== undefined ? incomingSession : table.session
            }
          })

          set({
            tables: mergedTables,
            tablesById: buildTablesById(mergedTables),
            lastSyncAt: new Date().toISOString(),
            error: null
          })

          // Hydrate session store from merged tables
          getTableSessionStore()
            .getState()
            ._patchSessionsFromTables(mergedTables)
        },

        // ====================================================================
        // TABLE DESIGN ACTIONS (Design Mode)
        // ====================================================================

        setDesignMode: (enabled: boolean) => {
          set({ isDesignMode: enabled, selectedTableIds: [] })
          if (!enabled) {
            // Clear undo history when exiting design mode
            set({ past: [], future: [] })
          }
        },

        addTable: async (tableData: Partial<FloorPlanObject>) => {
          const supabase = getClient()
          const floorPlanId = get().activeFloorPlanId
          if (!floorPlanId) throw new Error('No floor plan selected')

          get().saveSnapshot()

          const shape =
            TABLE_SHAPES[tableData.shape_id as keyof typeof TABLE_SHAPES]

          const { data, error } = await FloorPlanService.addFloorPlanObject(
            supabase,
            {
              p_floor_plan_id: floorPlanId,
              p_name: tableData.name || `Table ${get().tables.length + 1}`,
              p_shape_id: tableData.shape_id || 'square-4',
              p_category: (shape?.category as any) || 'table',
              p_x: tableData.x ?? 100,
              p_y: tableData.y ?? 100,
              p_rotation: tableData.rotation ?? 0,
              p_capacity: shape?.capacity ?? undefined,
              p_width: shape?.width ?? undefined,
              p_height: shape?.height ?? undefined
            }
          )

          if (error) throw error
          if (!data) throw new Error('No object_id returned')

          await get().loadFloorPlanStatus()

          return data.object_id
        },

        updateTablePosition: async (
          tableId: string,
          x: number,
          y: number,
          rotation?: number
        ) => {
          const supabase = getClient()
          // Optimistic update - targeted O(1) tablesById update instead of full rebuild
          set(state => {
            const existing = state.tablesById[tableId]
            if (!existing) return state
            const updated = {
              ...existing,
              x,
              y,
              rotation: rotation ?? existing.rotation
            }
            const newTables = state.tables.map(t =>
              t.id === tableId ? updated : t
            )
            return {
              tables: newTables,
              tablesById: { ...state.tablesById, [tableId]: updated }
            }
          })

          const { error } =
            await FloorPlanService.updateFloorPlanObjectPosition(supabase, {
              p_object_id: tableId,
              p_x: x,
              p_y: y,
              p_rotation: rotation
            })

          if (error) {
            // Revert on error
            await get().loadFloorPlanStatus()
            throw error
          }
        },

        updateTableName: async (tableId: string, name: string) => {
          const supabase = getClient()
          // Optimistic update - targeted O(1) tablesById update instead of full rebuild
          set(state => {
            const existing = state.tablesById[tableId]
            if (!existing) return state
            const updated = { ...existing, name }
            const newTables = state.tables.map(t =>
              t.id === tableId ? updated : t
            )
            return {
              tables: newTables,
              tablesById: { ...state.tablesById, [tableId]: updated }
            }
          })

          const { error } = await FloorPlanService.updateFloorPlanObject(
            supabase,
            tableId,
            { name } // Assuming 'name' column exists and is updateable
          )

          if (error) {
            await get().loadFloorPlanStatus()
            throw error
          }
        },

        updateTableSize: async (
          tableId: string,
          width: number,
          height: number
        ) => {
          const supabase = getClient()
          // Optimistic update - targeted O(1) tablesById update instead of full rebuild
          set(state => {
            const existing = state.tablesById[tableId]
            if (!existing) return state
            const updated = { ...existing, width, height }
            const newTables = state.tables.map(t =>
              t.id === tableId ? updated : t
            )
            return {
              tables: newTables,
              tablesById: { ...state.tablesById, [tableId]: updated }
            }
          })

          const { error } = await FloorPlanService.updateFloorPlanObject(
            supabase,
            tableId,
            { width, height }
          )

          if (error) {
            await get().loadFloorPlanStatus()
            throw error
          }
        },

        updateTablePositionsBatch: async updates => {
          const supabase = getClient()
          // Create O(1) lookup map from updates to avoid O(n*m) nested loop
          const updatesById = new Map(updates.map(u => [u.id, u]))

          // Optimistic update - sync both tables array and tablesById map
          set(state => {
            const newTables = state.tables.map(t => {
              const update = updatesById.get(t.id) // O(1) instead of O(n)
              return update
                ? {
                    ...t,
                    x: update.x,
                    y: update.y,
                    rotation: update.rotation ?? t.rotation
                  }
                : t
            })
            return {
              tables: newTables,
              tablesById: buildTablesById(newTables)
            }
          })

          const { error } = await FloorPlanService.updateFloorPlanObjectsBatch(
            supabase,
            {
              p_updates: updates
            }
          )

          if (error) {
            await get().loadFloorPlanStatus()
            throw error
          }
        },

        removeTable: async (tableId: string) => {
          const supabase = getClient()
          get().saveSnapshot()

          const { error } = await FloorPlanService.deleteFloorPlanObject(
            supabase,
            tableId
          )

          if (error) throw error

          // Sync both tables array and tablesById map
          set(state => {
            const newTables = state.tables.filter(t => t.id !== tableId)
            return {
              tables: newTables,
              tablesById: buildTablesById(newTables),
              selectedTableIds: state.selectedTableIds.filter(
                id => id !== tableId
              )
            }
          })
        },

        // ====================================================================
        // TABLE SESSION ACTIONS (Service Mode)
        // ====================================================================

        // Forwarding stubs — session methods now delegate to useTableSessionStore
        seatGuests: async params =>
          getTableSessionStore().getState().seatGuests(params),

        updateSessionStatus: async (
          sessionId: string,
          status: TableStatus,
          notes?: string
        ) =>
          getTableSessionStore()
            .getState()
            .updateSessionStatus(sessionId, status, notes),

        transferSession: async (sessionId: string, newTableIds: string[]) =>
          getTableSessionStore()
            .getState()
            .transferSession(sessionId, newTableIds),

        mergeTable: async (sessionId: string, tableId: string) =>
          getTableSessionStore().getState().mergeTable(sessionId, tableId),

        unmergeTable: async (sessionId: string, tableId: string) =>
          getTableSessionStore().getState().unmergeTable(sessionId, tableId),

        advanceCourse: async (sessionId: string) =>
          getTableSessionStore().getState().advanceCourse(sessionId),

        linkOrderToSession: async (sessionId: string, orderId: string) =>
          getTableSessionStore()
            .getState()
            .linkOrderToSession(sessionId, orderId),

        clearTableSession: async (tableId: string) =>
          getTableSessionStore().getState().clearTableSession(tableId),

        finishCleaning: async (tableId: string) =>
          getTableSessionStore().getState().finishCleaning(tableId),

        finishCleaning: async (tableId: string) =>
          useTableSessionStore.getState().finishCleaning(tableId),

        // ====================================================================
        // SELECTION ACTIONS
        // ====================================================================

        toggleTableSelection: (tableId: string) => {
          set(state => ({
            selectedTableIds: state.selectedTableIds.includes(tableId)
              ? state.selectedTableIds.filter(id => id !== tableId)
              : [...state.selectedTableIds, tableId]
          }))
        },

        clearSelection: () => set({ selectedTableIds: [] }),

        selectMultipleTables: (tableIds: string[]) =>
          set({ selectedTableIds: tableIds }),

        // ====================================================================
        // WAITLIST ACTIONS
        // ====================================================================

        loadWaitlist: async () => {
          const supabase = getClient()
          const locationId = get().locationId
          if (!locationId || !supabase) return

          const { data, error } = await FloorPlanService.getWaitlist(
            supabase,
            locationId
          )

          if (error) {
            console.error('Failed to load waitlist:', error)
            return
          }

          set({ waitlist: data?.waitlist || [] })
        },

        addToWaitlist: async params => {
          const supabase = getClient()
          const locationId = get().locationId
          if (!locationId) throw new Error('No location set')

          const { data, error } = await FloorPlanService.addToWaitlist(
            supabase,
            {
              p_location_id: locationId,
              p_party_name: params.partyName,
              p_party_size: params.partySize,
              p_phone: params.phone,
              p_notes: params.notes,
              p_preferred_section: params.preferredSection,
              p_quoted_wait_minutes: params.quotedWaitMinutes
            }
          )

          if (error) throw error
          if (!data) throw new Error('Failed to add to waitlist')

          return {
            waitlistId: data.waitlist_id,
            position: data.position,
            quotedWait: data.quoted_wait_minutes
          }
        },

        notifyWaitlistParty: async (waitlistId: string) => {
          const supabase = getClient()
          const { data, error } = await FloorPlanService.notifyWaitlistParty(
            supabase,
            waitlistId
          )

          if (error) throw error
          if (!data) throw new Error('Failed to notify')

          return {
            phone: data.phone,
            message: data.message_template
          }
        },

        updateWaitlistStatus: async (waitlistId: string, status: string) => {
          const supabase = getClient()
          const { error } = await FloorPlanService.updateWaitlistStatus(
            supabase,
            waitlistId,
            status
          )

          if (error) throw error
        },

        seatFromWaitlist: async (waitlistId: string, tableIds: string[]) => {
          const waitlistEntry = get().waitlist.find(
            entry => entry.id === waitlistId
          )
          const supabase = getClient()
          const { data, error } = await FloorPlanService.seatFromWaitlist(
            supabase,
            waitlistId,
            tableIds
          )

          if (error) throw error
          if (!data) throw new Error('Failed to seat from waitlist')

          await get().loadFloorPlanStatus()
          get().clearSelection()

          return {
            sessionId: data.session_id,
            orderId: data.order_id
          }
        },

        // ====================================================================
        // RESERVATION ACTIONS
        // ====================================================================

        loadReservations: async (date?: string) => {
          const supabase = getClient()
          const locationId = get().locationId
          if (!locationId || !supabase) return

          const { data, error } = await FloorPlanService.getReservations(
            supabase,
            locationId,
            date
          )

          if (error) {
            console.error('Failed to load reservations:', error)
            return
          }

          set({ reservations: data?.reservations || [] })
        },

        createReservation: async params => {
          const supabase = getClient()
          const locationId = get().locationId
          if (!locationId) throw new Error('No location set')

          const { data, error } = await FloorPlanService.createReservation(
            supabase,
            {
              p_location_id: locationId,
              p_party_name: params.partyName,
              p_party_size: params.partySize,
              p_phone: params.phone,
              p_reservation_date: params.date,
              p_reservation_time: params.time,
              p_email: params.email,
              p_notes: params.notes,
              p_special_requests: params.specialRequests,
              p_is_vip: params.isVip
            }
          )

          if (error) throw error
          if (!data) throw new Error('Failed to create reservation')

          return {
            reservationId: data.reservation_id,
            confirmationNumber: data.confirmation_number
          }
        },

        updateReservationStatus: async (reservationId, status) => {
          const supabase = getClient()
          const { error } = await FloorPlanService.updateReservationStatus(
            supabase,
            reservationId,
            status
          )

          if (error) throw error
        },

        assignReservationTables: async (reservationId, tableIds) => {
          const supabase = getClient()

          if (tableIds.length > 0) {
            const targetReservation = get().reservations.find(
              r => r.id === reservationId
            )
            const reservationDate = targetReservation?.reservation_date
            const reservationTime = targetReservation?.reservation_time

            if (targetReservation && reservationDate && reservationTime) {
              const { data: existingData, error: existingError } =
                await FloorPlanService.getReservations(
                  supabase,
                  targetReservation.location_id,
                  reservationDate
                )

              if (!existingError) {
                const existingReservations =
                  existingData?.reservations ?? get().reservations
                const conflict = findReservationTableConflictForWindow(
                  {
                    reservationDate,
                    reservationTime,
                    durationMinutes: targetReservation.duration_minutes,
                    tableIds,
                    ignoreReservationId: reservationId
                  },
                  existingReservations
                )

                if (conflict) {
                  throw new Error(
                    `Table already reserved for ${conflict.partyName} at ${conflict.reservationTime}.`
                  )
                }
              }
            }
          }

          const { error } = await FloorPlanService.assignReservationTables(
            supabase,
            reservationId,
            tableIds
          )

          if (error) throw error
        },

        seatReservation: async (reservationId, tableIds) => {
          const reservation = get().reservations.find(
            entry => entry.id === reservationId
          )
          const supabase = getClient()
          const { data, error } = await FloorPlanService.seatReservation(
            supabase,
            reservationId,
            tableIds
          )

          if (error) throw error
          if (!data) throw new Error('Failed to seat reservation')

          await get().loadFloorPlanStatus()

          return {
            sessionId: data.session_id,
            orderId: data.order_id
          }
        },

        checkAvailability: async (date, time, partySize) => {
          const supabase = getClient()
          const locationId = get().locationId
          if (!locationId) throw new Error('No location set')

          const { data, error } = await FloorPlanService.checkTableAvailability(
            supabase,
            {
              p_location_id: locationId,
              p_date: date,
              p_time: time,
              p_party_size: partySize
            }
          )

          if (error) throw error
          return data || []
        },

        // ====================================================================
        // HISTORY (Design Mode)
        // ====================================================================

        undo: () => {
          set(state => {
            if (state.past.length === 0) return state
            const previous = state.past[state.past.length - 1]
            const newPast = state.past.slice(0, -1)
            return {
              tables: previous,
              tablesById: buildTablesById(previous),
              past: newPast,
              future: [state.tables, ...state.future]
            }
          })
        },

        redo: () => {
          set(state => {
            if (state.future.length === 0) return state
            const next = state.future[0]
            const newFuture = state.future.slice(1)
            return {
              tables: next,
              tablesById: buildTablesById(next),
              past: [...state.past, state.tables],
              future: newFuture
            }
          })
        },

        saveSnapshot: () => {
          set(state => ({
            past: [...state.past, state.tables].slice(-30),
            future: []
          }))
        },

        // Server Section Actions
        assignServerToSection: async (
          sectionId: string,
          staffProfileId: string
        ) => {
          const client = getClient()
          if (!client) return

          // Optimistic update
          set(state => {
            const updatedSections = state.sections.map(s =>
              s.id === sectionId
                ? { ...s, assigned_staff_id: staffProfileId }
                : s
            )
            const updatedSectionsById = { ...state.sectionsById }
            if (updatedSectionsById[sectionId]) {
              updatedSectionsById[sectionId] = {
                ...updatedSectionsById[sectionId],
                assigned_staff_id: staffProfileId
              }
            }
            return {
              sections: updatedSections,
              sectionsById: updatedSectionsById
            }
          })

          // Backend update
          const { error } = await client
            .from('server_sections')
            .update({
              assigned_staff_id: staffProfileId,
              updated_at: new Date().toISOString()
            })
            .eq('id', sectionId)

          if (error) {
            console.error(
              '[FloorPlan] Failed to assign server to section:',
              error
            )
            // Revert on error
            set(state => {
              const reverted = state.sections.map(s =>
                s.id === sectionId ? { ...s, assigned_staff_id: null } : s
              )
              const revertedById = { ...state.sectionsById }
              if (revertedById[sectionId]) {
                revertedById[sectionId] = {
                  ...revertedById[sectionId],
                  assigned_staff_id: null
                }
              }
              return { sections: reverted, sectionsById: revertedById }
            })
          }
        },

        unassignServerFromSection: async (sectionId: string) => {
          const client = getClient()
          if (!client) return

          const previousStaffId =
            get().sectionsById[sectionId]?.assigned_staff_id

          // Optimistic update
          set(state => {
            const updatedSections = state.sections.map(s =>
              s.id === sectionId ? { ...s, assigned_staff_id: null } : s
            )
            const updatedSectionsById = { ...state.sectionsById }
            if (updatedSectionsById[sectionId]) {
              updatedSectionsById[sectionId] = {
                ...updatedSectionsById[sectionId],
                assigned_staff_id: null
              }
            }
            return {
              sections: updatedSections,
              sectionsById: updatedSectionsById
            }
          })

          const { error } = await client
            .from('server_sections')
            .update({
              assigned_staff_id: null,
              updated_at: new Date().toISOString()
            })
            .eq('id', sectionId)

          if (error) {
            console.error(
              '[FloorPlan] Failed to unassign server from section:',
              error
            )
            // Revert
            if (previousStaffId) {
              set(state => {
                const reverted = state.sections.map(s =>
                  s.id === sectionId
                    ? { ...s, assigned_staff_id: previousStaffId }
                    : s
                )
                const revertedById = { ...state.sectionsById }
                if (revertedById[sectionId]) {
                  revertedById[sectionId] = {
                    ...revertedById[sectionId],
                    assigned_staff_id: previousStaffId
                  }
                }
                return { sections: reverted, sectionsById: revertedById }
              })
            }
          }
        },

        // O(1) Getter
        getTableById: (id: string) => get().tablesById[id]
      }),
      {
        name: 'floor-plan-db-storage',
        storage: createLazyPersistStorage(),
        partialize: state => ({
          floorPlans: state.floorPlans,
          activeFloorPlanId: state.activeFloorPlanId,
          tables: state.tables,
          locationId: state.locationId,
          lastSyncAt: state.lastSyncAt
        }),
        // Rebuild tablesById map after rehydrating from storage
        // Strip ephemeral session data to prevent stale sessions (e.g. 61h-old)
        onRehydrateStorage: () => state => {
          if (state?.tables) {
            // Clear session from all rehydrated tables — session data is ephemeral
            // Table geometry (positions, shapes, names) stays cached
            state.tables = state.tables.map(t => ({ ...t, session: undefined }))
            state.tablesById = buildTablesById(state.tables)
            // Force immediate refresh by clearing lastSyncAt
            state.lastSyncAt = null
          }
        }
      }
    )
  )
)

// After hydration finishes, fetch fresh session data
useFloorPlanStore.persist.onFinishHydration(() => {
  const { activeFloorPlanId, tables, locationId } = useFloorPlanStore.getState()
  if (!activeFloorPlanId) return

  // Immediately bridge persisted sessions → floor plan (sync, no flicker)
  const sessionState = getTableSessionStore().getState()
  const sessions = sessionState.sessions
  if (Object.keys(sessions).length > 0) {
    const currentTables = useFloorPlanStore.getState().tables
    const restored = currentTables.map(table => {
      const session = sessions[table.id]
      return session ? { ...table, session } : table
    })
    useFloorPlanStore.setState({
      tables: restored,
      tablesById: buildTablesById(restored)
    })
  }

  // Defer network refresh (non-blocking)
  setTimeout(() => {
    const store = useFloorPlanStore.getState()
    const isOnline = getIsOnline()
    if (!isOnline) return // already restored above

    if (store.tables.length > 0 && locationId) {
      store.refreshTableSessions() // lightweight, geometry already cached
    } else {
      store.loadFloorPlanStatus() // full load
    }
  }, 100)
})
