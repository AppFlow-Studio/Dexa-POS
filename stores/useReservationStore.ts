import { FloorPlanService } from '@/services/floorPlanService'
import {
  CreateReservationParams,
  Reservation
} from '@/types/db-floor-plan-types'
import { SupabaseClient } from '@supabase/supabase-js'
import { create } from 'zustand'

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

interface ReservationState {
  reservations: Reservation[]
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
  getUpcomingForTable: (tableId: string) => Reservation[]
  setSelectedDate: (date: Date) => void
}

export const useReservationStore = create<ReservationState>((set, get) => ({
  reservations: [],
  selectedDate: new Date(),
  isLoading: false,
  error: null,

  setSelectedDate: (date: Date) => {
    set({ selectedDate: date })
  },

  fetchReservations: async (locationId, date, options) => {
    const silent = options?.silent ?? false
    if (!silent) {
      set({ isLoading: true, error: null })
    }
    try {
      const dateStr = (date ?? get().selectedDate).toISOString().split('T')[0]
      const { data, error } = await FloorPlanService.getReservations(
        getClient(),
        locationId,
        dateStr
      )
      if (error) throw error

      set({
        reservations: data?.reservations ?? [],
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
      const { data, error } = await FloorPlanService.createReservation(
        getClient(),
        params
      )
      if (error) throw error
      set({ isLoading: false })
      return data
    } catch (err: any) {
      console.error('Failed to create reservation:', err)
      set({ error: err.message || 'Failed to create reservation', isLoading: false })
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
          r.id === reservationId ? { ...r, status: status as Reservation['status'] } : r
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
      const { data, error } = await FloorPlanService.seatReservation(
        getClient(),
        reservationId,
        tableIds
      )
      if (error) throw error

      set(state => ({
        reservations: state.reservations.filter(r => r.id !== reservationId)
      }))

      return data
    } catch (err: any) {
      console.error('Failed to seat reservation:', err)
      return null
    }
  },

  getUpcomingForTable: tableId => {
    const now = new Date()
    return get()
      .reservations.filter(
        r =>
          ['pending', 'confirmed', 'reminded'].includes(r.status) &&
          (r.assigned_table_ids ?? []).includes(tableId) &&
          new Date(r.reservation_time) > now
      )
      .sort(
        (a, b) =>
          new Date(a.reservation_time).getTime() -
          new Date(b.reservation_time).getTime()
      )
  }
}))
