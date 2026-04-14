import { findReservationTableConflict } from '@/lib/reservationConflicts'
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

interface ReservationState {
  reservations: Reservation[]
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

  updateStatus: async (reservationId, status) => {
    try {
      const { error } = await FloorPlanService.updateReservationStatus(
        getClient(),
        reservationId,
        status
      )
      if (error) throw error

      set(state => ({
        reservations: state.reservations.map(r =>
          r.id === reservationId
            ? { ...r, status: status as Reservation['status'] }
            : r
        )
      }))
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

      set(state => ({
        reservations: state.reservations.filter(r => r.id !== reservationId)
      }))
    } catch (err: any) {
      console.error('Failed to cancel reservation:', err)
      // Remove locally for UX
      set(state => ({
        reservations: state.reservations.filter(r => r.id !== reservationId)
      }))
    }
  },

  seatReservation: async (reservationId, tableIds) => {
    try {
      const reservation = get().reservations.find(r => r.id === reservationId)
      if (!reservation) throw new Error('Reservation not found')
      if (!tableIds || tableIds.length === 0) throw new Error('No tables provided')

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
        createOrder: true,
      })

      // Only proceed if seating was successful
      if (!result.sessionId) {
        throw new Error('Failed to seat reservation: no session created')
      }

      // Mark reservation as seated and update local state
      set(state => ({
        reservations: state.reservations.filter(r => r.id !== reservationId),
        reservationBySessionId: {
          ...state.reservationBySessionId,
          [result.sessionId]: reservationId
        }
      }))

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
        return {
          reservationBySessionId: nextMap,
          reservations: state.reservations.map(r =>
            r.id === mappedReservationId
              ? { ...r, status: 'completed' as Reservation['status'] }
              : r
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
