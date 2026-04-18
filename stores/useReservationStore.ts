import {
  findReservationTableConflict,
  findReservationTableConflictForWindow
} from '@/lib/reservationConflicts'
import { FloorPlanService } from '@/services/floorPlanService'
import {
  CreateReservationParams,
  Reservation
} from '@/types/db-floor-plan-types'
import { SupabaseClient } from '@supabase/supabase-js'
import { create } from 'zustand'

// Lazy accessor avoids import cycle between reservation and floor-plan stores.
const getFloorPlanStore = () =>
  (require('./useFloorPlanStore') as typeof import('./useFloorPlanStore'))
    .useFloorPlanStore

let _supabaseClient: SupabaseClient | null = null

export const setReservationSupabaseClient = (client: SupabaseClient | null) => {
  _supabaseClient = client
}

const getClient = () => {
  if (!_supabaseClient) {
    console.warn(
      'Supabase client not set in useReservationStore, some actions may fail.'
    )
  }
  return _supabaseClient!
}

const toLocalDateKey = (date: Date) => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const isReservationInFuture = (params: CreateReservationParams): boolean => {
  const rawTime = (params.p_reservation_time ?? '').trim()
  if (!params.p_reservation_date || !rawTime) return false

  const hasDatePart = rawTime.includes('T') || rawTime.includes('-')
  const parsed = hasDatePart
    ? new Date(rawTime)
    : new Date(`${params.p_reservation_date}T${rawTime}`)

  if (!Number.isFinite(parsed.getTime())) return false
  return parsed.getTime() > Date.now()
}

const getReservationEpoch = (reservation: Reservation): number | null => {
  const direct = new Date(reservation.reservation_time).getTime()
  if (Number.isFinite(direct)) return direct

  if (reservation.reservation_date && reservation.reservation_time) {
    const combined = new Date(
      `${reservation.reservation_date}T${reservation.reservation_time}`
    ).getTime()
    if (Number.isFinite(combined)) return combined
  }

  return null
}

const normalizeReservationDateTime = (
  reservation: Reservation
): Reservation => {
  const rawTime = (reservation.reservation_time ?? '').trim()
  const hasDatePart = rawTime.includes('T') || rawTime.includes('-')

  if (hasDatePart || !reservation.reservation_date || !rawTime) {
    return reservation
  }

  const combined = `${reservation.reservation_date}T${rawTime}`
  if (Number.isFinite(new Date(combined).getTime())) {
    return { ...reservation, reservation_time: combined }
  }

  return reservation
}

const normalizeReservationRecord = (
  raw: any,
  fallbackDate?: string
): Reservation => {
  const reservation = {
    ...raw,
    reservation_date:
      raw?.reservation_date ??
      raw?.reservationDate ??
      raw?.date ??
      fallbackDate ??
      undefined,
    reservation_time:
      raw?.reservation_time ?? raw?.reservationTime ?? raw?.time ?? ''
  } as Reservation

  return normalizeReservationDateTime(reservation)
}

const extractReservationRows = (
  payload: any,
  fallbackDate?: string
): Reservation[] => {
  if (!payload) return []

  const topLevelDate =
    payload?.date ?? payload?.reservation_date ?? payload?.reservationDate
  const inheritedDate = topLevelDate ?? fallbackDate

  if (Array.isArray(payload)) {
    return payload.map(row => normalizeReservationRecord(row, inheritedDate))
  }
  if (Array.isArray(payload?.reservations)) {
    return payload.reservations.map((row: any) =>
      normalizeReservationRecord(row, inheritedDate)
    )
  }
  if (Array.isArray(payload?.data)) {
    return payload.data.map((row: any) =>
      normalizeReservationRecord(row, inheritedDate)
    )
  }
  if (Array.isArray(payload?.data?.reservations)) {
    return payload.data.reservations.map((row: any) =>
      normalizeReservationRecord(row, inheritedDate)
    )
  }
  if (Array.isArray(payload?.items)) {
    return payload.items.map((row: any) =>
      normalizeReservationRecord(row, inheritedDate)
    )
  }

  return []
}

/**
 * Build a map of tableId → nearest upcoming reservation.
 * Computed once when reservations change instead of O(n) per-table in components.
 */
function buildNextReservationByTableId(
  reservations: Reservation[],
  oldMap?: Record<string, Reservation>
): Record<string, Reservation> {
  const nowMs = Date.now()

  const active = reservations.filter(r => {
    const epoch = getReservationEpoch(r)
    return (
      ['pending', 'confirmed', 'reminded'].includes(r.status) &&
      epoch !== null &&
      epoch > nowMs
    )
  })

  active.sort((a, b) => {
    const aE = getReservationEpoch(a) ?? Number.MAX_SAFE_INTEGER
    const bE = getReservationEpoch(b) ?? Number.MAX_SAFE_INTEGER
    return aE - bE
  })

  const map: Record<string, Reservation> = {}
  for (const r of active) {
    for (const tableId of r.assigned_table_ids ?? []) {
      if (!map[tableId]) map[tableId] = r
    }
  }

  // Stabilize: reuse old object references when reservation hasn't changed,
  // so zustand's Object.is check on s.nextReservationByTableId[tableId]
  // returns true for tables with no change → prevents unnecessary re-renders.
  if (oldMap) {
    let same = true
    const allKeys = new Set([...Object.keys(map), ...Object.keys(oldMap)])
    for (const key of allKeys) {
      if (map[key]?.id === oldMap[key]?.id) {
        if (oldMap[key]) map[key] = oldMap[key]
      } else {
        same = false
      }
    }
    if (same) return oldMap
  }

  return map
}

interface ReservationState {
  reservations: Reservation[]
  nextReservationByTableId: Record<string, Reservation>
  reservationBySessionId: Record<string, string>
  selectedDate: Date
  isLoading: boolean
  error: string | null

  fetchReservations: (
    locationId: string,
    date?: Date,
    options?: { silent?: boolean }
  ) => Promise<void>
  createReservation: (
    params: CreateReservationParams
  ) => Promise<{ reservation_id: string; confirmation_number: string } | null>
  updateReservation: (
    reservationId: string,
    params: CreateReservationParams
  ) => Promise<boolean>
  updateStatus: (reservationId: string, status: string) => Promise<void>
  cancelReservation: (reservationId: string) => Promise<void>
  seatReservation: (
    reservationId: string,
    tableIds?: string[]
  ) => Promise<{ session_id: string; order_id?: string } | null>
  registerReservationSession: (sessionId: string, reservationId: string) => void
  completeReservationForSession: (sessionId: string) => Promise<void>
  getUpcomingForTable: (tableId: string) => Reservation[]
  setSelectedDate: (date: Date) => void
}

export const useReservationStore = create<ReservationState>((set, get) => ({
  reservations: [],
  nextReservationByTableId: {},
  reservationBySessionId: {},
  selectedDate: new Date(),
  isLoading: false,
  error: null,

  setSelectedDate: (date: Date) => {
    set({ selectedDate: date })
  },

  fetchReservations: async (locationId, date, options) => {
    const silent = options?.silent ?? false
    const effectiveDate = date ?? get().selectedDate
    if (!silent) {
      set({ isLoading: true, error: null, selectedDate: effectiveDate })
    } else if (date) {
      set({ selectedDate: date })
    }
    try {
      const dateStr = toLocalDateKey(effectiveDate)
      const { data, error } = await FloorPlanService.getReservations(
        getClient(),
        locationId,
        dateStr
      )
      if (error) throw error

      let reservationRows = extractReservationRows(data, dateStr)

      // Some backend environments ignore/interpret p_date differently; fallback
      // to undated fetch instead of showing an empty UI.
      if (reservationRows.length === 0) {
        const { data: fallbackData, error: fallbackError } =
          await FloorPlanService.getReservations(getClient(), locationId)
        if (!fallbackError) {
          reservationRows = extractReservationRows(fallbackData, dateStr)
        }
      }

      set({
        reservations: reservationRows,
        nextReservationByTableId: buildNextReservationByTableId(
          reservationRows,
          get().nextReservationByTableId
        ),
        isLoading: false,
        error: null
      })
    } catch (err: any) {
      console.error('Failed to fetch reservations:', err)
      set({
        error: err.message || 'Failed to fetch reservations',
        isLoading: false
      })
    }
  },

  createReservation: async params => {
    set({ isLoading: true, error: null })
    try {
      if (!isReservationInFuture(params)) {
        throw new Error(
          'Reservations must be scheduled for a future date/time.'
        )
      }

      if ((params.p_assigned_table_ids ?? []).length > 0) {
        const { data: existingData, error: existingError } =
          await FloorPlanService.getReservations(
            getClient(),
            params.p_location_id,
            params.p_reservation_date
          )

        if (!existingError) {
          const existingReservations = extractReservationRows(
            existingData,
            params.p_reservation_date
          )
          const conflict = findReservationTableConflict(
            params,
            existingReservations
          )

          if (conflict) {
            throw new Error(
              `Table already reserved for ${conflict.partyName} at ${conflict.reservationTime}.`
            )
          }
        } else {
          console.warn(
            '[useReservationStore.createReservation] Conflict pre-check skipped:',
            existingError
          )
        }
      }

      const { data, error } = await FloorPlanService.createReservation(
        getClient(),
        params
      )
      if (error) throw error
      set({ isLoading: false })
      return data
    } catch (err: any) {
      console.error('Failed to create reservation:', err)
      set({
        error: err.message || 'Failed to create reservation',
        isLoading: false
      })
      return null
    }
  },

  updateReservation: async (reservationId, params) => {
    set({ isLoading: true, error: null })
    try {
      if (!isReservationInFuture(params)) {
        throw new Error(
          'Reservations must be scheduled for a future date/time.'
        )
      }

      if ((params.p_assigned_table_ids ?? []).length > 0) {
        const { data: existingData, error: existingError } =
          await FloorPlanService.getReservations(
            getClient(),
            params.p_location_id,
            params.p_reservation_date
          )

        if (!existingError) {
          const existingReservations = extractReservationRows(
            existingData,
            params.p_reservation_date
          )
          const conflict = findReservationTableConflictForWindow(
            {
              reservationDate: params.p_reservation_date,
              reservationTime: params.p_reservation_time,
              durationMinutes: params.p_duration_minutes,
              tableIds: params.p_assigned_table_ids ?? [],
              ignoreReservationId: reservationId
            },
            existingReservations
          )

          if (conflict) {
            throw new Error(
              `Table already reserved for ${conflict.partyName} at ${conflict.reservationTime}.`
            )
          }
        } else {
          console.warn(
            '[useReservationStore.updateReservation] Conflict pre-check skipped:',
            existingError
          )
        }
      }

      let error: any = null
      const floorPlanServiceAny = FloorPlanService as any

      if (typeof floorPlanServiceAny.updateReservation === 'function') {
        const result = await floorPlanServiceAny.updateReservation(
          getClient(),
          reservationId,
          params
        )
        error = result?.error
      } else {
        console.warn(
          '[useReservationStore.updateReservation] FloorPlanService.updateReservation missing; using inline fallback'
        )

        const { error: updateError } = await getClient()
          .from('reservations')
          .update({
            party_name: params.p_party_name,
            party_size: params.p_party_size,
            phone: params.p_phone,
            email: params.p_email ?? null,
            reservation_date: params.p_reservation_date,
            reservation_time: params.p_reservation_time,
            duration_minutes: params.p_duration_minutes ?? null,
            notes: params.p_notes ?? null,
            special_requests: params.p_special_requests ?? null,
            preferred_section: params.p_preferred_section ?? null,
            seating_preference: params.p_seating_preference ?? null,
            source: params.p_source ?? null,
            is_vip: params.p_is_vip ?? false
          })
          .eq('id', reservationId)

        if (updateError) {
          error = updateError
        } else {
          const { error: assignError } = await getClient().rpc(
            'assign_reservation_tables',
            {
              p_reservation_id: reservationId,
              p_table_ids: params.p_assigned_table_ids ?? []
            }
          )
          error = assignError
        }
      }

      if (error) throw error

      set(state => {
        const reservations = state.reservations.map(r =>
          r.id === reservationId
            ? {
                ...r,
                party_name: params.p_party_name,
                party_size: params.p_party_size,
                phone: params.p_phone,
                reservation_date: params.p_reservation_date,
                reservation_time: params.p_reservation_time,
                assigned_table_ids: params.p_assigned_table_ids ?? [],
                duration_minutes:
                  params.p_duration_minutes ?? r.duration_minutes,
                email: params.p_email,
                notes: params.p_notes,
                special_requests: params.p_special_requests,
                preferred_section: params.p_preferred_section,
                seating_preference: params.p_seating_preference,
                source: params.p_source ?? r.source,
                is_vip: params.p_is_vip ?? false
              }
            : r
        )
        return {
          reservations,
          nextReservationByTableId: buildNextReservationByTableId(
            reservations,
            state.nextReservationByTableId
          ),
          isLoading: false,
          error: null
        }
      })
      return true
    } catch (err: any) {
      console.error('Failed to update reservation:', err)
      set({
        error: err.message || 'Failed to update reservation',
        isLoading: false
      })
      return false
    }
  },

  updateStatus: async (reservationId, status) => {
    try {
      const { error } = await FloorPlanService.updateReservationStatus(
        getClient(),
        reservationId,
        status
      )
      if (error) throw error

      set(state => {
        const reservations = state.reservations.map(r =>
          r.id === reservationId
            ? { ...r, status: status as Reservation['status'] }
            : r
        )
        return {
          reservations,
          nextReservationByTableId: buildNextReservationByTableId(
            reservations,
            state.nextReservationByTableId
          )
        }
      })
    } catch (err: any) {
      console.error('Failed to update reservation status:', err)
    }
  },

  cancelReservation: async reservationId => {
    try {
      const { error } = await FloorPlanService.updateReservationStatus(
        getClient(),
        reservationId,
        'cancelled'
      )
      if (error) throw error

      set(state => {
        const reservations = state.reservations.filter(r => r.id !== reservationId)
        return {
          reservations,
          nextReservationByTableId: buildNextReservationByTableId(
            reservations,
            state.nextReservationByTableId
          )
        }
      })
    } catch (err: any) {
      console.error('Failed to cancel reservation:', err)
      // Remove locally for UX
      set(state => {
        const reservations = state.reservations.filter(r => r.id !== reservationId)
        return {
          reservations,
          nextReservationByTableId: buildNextReservationByTableId(
            reservations,
            state.nextReservationByTableId
          )
        }
      })
    }
  },

  seatReservation: async (reservationId, tableIds) => {
    try {
      const reservation = get().reservations.find(r => r.id === reservationId)
      if (!reservation) throw new Error('Reservation not found')
      if (!tableIds || tableIds.length === 0)
        throw new Error('No tables provided')

      const { useTableSessionStore } =
        require('./useTableSessionStore') as typeof import('./useTableSessionStore')

      // Use seatGuests (same as waitlist) so the order is created locally with
      // the currently logged-in employee as the server.
      const result = await useTableSessionStore.getState().seatGuests({
        tableIds,
        partySize: reservation.party_size,
        guestName: reservation.party_name,
        guestPhone: reservation.phone ?? undefined,
        reservationId,
        createOrder: true
      })

      // Only proceed if seating was successful
      if (!result.sessionId) {
        throw new Error('Failed to seat reservation: no session created')
      }

      // Mark reservation as seated and update local state
      set(state => {
        const reservations = state.reservations.filter(r => r.id !== reservationId)
        return {
          reservations,
          nextReservationByTableId: buildNextReservationByTableId(
            reservations,
            state.nextReservationByTableId
          ),
          reservationBySessionId: {
            ...state.reservationBySessionId,
            [result.sessionId]: reservationId
          }
        }
      })

      // Also update reservation status in DB
      await FloorPlanService.updateReservationStatus(
        getClient(),
        reservationId,
        'seated'
      )

      return { session_id: result.sessionId, order_id: result.orderId }
    } catch (err: any) {
      console.error('Failed to seat reservation:', err)
      throw err // Re-throw so caller knows it failed
    }
  },

  registerReservationSession: (sessionId, reservationId) => {
    if (!sessionId || !reservationId) return
    set(state => ({
      reservationBySessionId: {
        ...state.reservationBySessionId,
        [sessionId]: reservationId
      }
    }))
  },

  completeReservationForSession: async sessionId => {
    if (!sessionId) return

    const sessionStore = (
      require('./useTableSessionStore') as typeof import('./useTableSessionStore')
    ).useTableSessionStore.getState()
    const sessionReservationId = Object.values(sessionStore.sessions).find(
      session => session.id === sessionId
    )?.reservation_id

    const mappedReservationId =
      get().reservationBySessionId[sessionId] ?? sessionReservationId ?? null
    if (!mappedReservationId) return

    try {
      const { error } = await FloorPlanService.updateReservationStatus(
        getClient(),
        mappedReservationId,
        'completed'
      )
      if (error) {
        console.warn(
          '[useReservationStore] updateReservationStatus RPC failed, falling back to direct update:',
          error
        )

        const { error: fallbackError } = await getClient()
          .from('reservations')
          .update({
            status: 'completed',
            updated_at: new Date().toISOString()
          })
          .eq('id', mappedReservationId)

        if (fallbackError) throw fallbackError
      }

      set(state => {
        const nextMap = { ...state.reservationBySessionId }
        delete nextMap[sessionId]
        const reservations = state.reservations.map(r =>
          r.id === mappedReservationId
            ? { ...r, status: 'completed' as Reservation['status'] }
            : r
        )
        return {
          reservationBySessionId: nextMap,
          reservations,
          nextReservationByTableId: buildNextReservationByTableId(
            reservations,
            state.nextReservationByTableId
          )
        }
      })
    } catch (err) {
      console.error(
        '[useReservationStore] Failed to complete reservation for session:',
        err
      )
    }
  },

  getUpcomingForTable: tableId => {
    const now = new Date()
    const nowMs = now.getTime()

    return get()
      .reservations.filter(r => {
        const epoch = getReservationEpoch(r)
        return (
          ['pending', 'confirmed', 'reminded'].includes(r.status) &&
          (r.assigned_table_ids ?? []).includes(tableId) &&
          epoch !== null &&
          epoch > nowMs
        )
      })
      .sort((a, b) => {
        const aEpoch = getReservationEpoch(a)
        const bEpoch = getReservationEpoch(b)
        const aSafe = aEpoch ?? Number.MAX_SAFE_INTEGER
        const bSafe = bEpoch ?? Number.MAX_SAFE_INTEGER
        return aSafe - bSafe
      })
  }
}))
