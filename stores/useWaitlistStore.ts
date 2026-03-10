import { FloorPlanService } from '@/services/floorPlanService'
import { AddToWaitlistParams, WaitlistEntry } from '@/types/db-floor-plan-types'
import { SupabaseClient } from '@supabase/supabase-js'
import { create } from 'zustand'

// Global client reference (pattern used by other stores)
let _supabaseClient: SupabaseClient | null = null

export const setWaitlistSupabaseClient = (client: SupabaseClient | null) => {
  _supabaseClient = client
}

const getClient = () => {
  if (!_supabaseClient) {
    console.warn(
      'Supabase client not set in useWaitlistStore, some actions may fail.'
    )
  }
  return _supabaseClient!
}

interface WaitlistState {
  waitlist: WaitlistEntry[]
  isLoading: boolean
  error: string | null

  // Backend-connected methods
  fetchWaitlist: (
    locationId: string,
    options?: { silent?: boolean }
  ) => Promise<void>
  addToWaitlistAsync: (
    params: Omit<AddToWaitlistParams, 'p_location_id'> & { locationId: string }
  ) => Promise<void>
  removeFromWaitlistAsync: (entryId: string) => Promise<void>
  seatFromWaitlistAsync: (
    entryId: string,
    tableIds: string[]
  ) => Promise<{ session_id: string; order_id?: string } | null>
  updateWaitlistStatus: (entryId: string, status: string) => Promise<void>

  // Local methods (for offline/fallback)
  addToWaitlist: (
    newEntry: Omit<
      WaitlistEntry,
      | 'id'
      | 'status'
      | 'created_at'
      | 'position'
      | 'quoted_wait_minutes'
      | 'location_id'
    > & { quoted_wait_minutes?: number }
  ) => void
  reorderWaitlist: (newWaitlist: WaitlistEntry[]) => void
  deleteFromWaitlist: (entryId: string) => void
  removeWaitlistEntry: (entryId: string) => void
}

export const useWaitlistStore = create<WaitlistState>((set, get) => ({
  waitlist: [],
  isLoading: false,
  error: null,

  // --- BACKEND-CONNECTED METHODS ---

  fetchWaitlist: async (locationId: string, options) => {
    const silent = options?.silent ?? false
    if (!silent) {
      set({ isLoading: true, error: null })
    }
    try {
      const { data, error } = await FloorPlanService.getWaitlist(
        getClient(),
        locationId
      )
      if (error) throw error

      // Keep active statuses used by Host Station UI.
      const activeEntries = (data?.waitlist || []).filter(entry =>
        ['waiting', 'notified', 'arrived'].includes(entry.status)
      )

      set(state => {
        const prevById = new Map(state.waitlist.map(entry => [entry.id, entry]))

        const merged = activeEntries.map(entry => {
          const prev = prevById.get(entry.id)
          if (!prev) return entry

          const isSame =
            prev.status === entry.status &&
            prev.position === entry.position &&
            prev.quoted_wait_minutes === entry.quoted_wait_minutes &&
            prev.party_name === entry.party_name &&
            prev.party_size === entry.party_size &&
            prev.phone === entry.phone &&
            prev.email === entry.email &&
            prev.preferred_section === entry.preferred_section &&
            prev.seating_preference === entry.seating_preference &&
            prev.notes === entry.notes

          return isSame ? prev : entry
        })

        const isUnchanged =
          merged.length === state.waitlist.length &&
          merged.every((entry, idx) => entry === state.waitlist[idx])

        if (isUnchanged) {
          return silent ? {} : { isLoading: false, error: null }
        }

        return { waitlist: merged, isLoading: false, error: null }
      })
    } catch (err: any) {
      console.error('Failed to fetch waitlist:', err)
      set({
        error: err.message || 'Failed to fetch waitlist',
        isLoading: false
      })
    }
  },

  addToWaitlistAsync: async params => {
    set({ isLoading: true, error: null })
    try {
      const { data, error } = await FloorPlanService.addToWaitlist(
        getClient(),
        {
          p_location_id: params.locationId,
          p_party_name: params.p_party_name,
          p_party_size: params.p_party_size,
          p_phone: params.p_phone,
          p_email: params.p_email,
          p_seating_preference: params.p_seating_preference,
          p_preferred_section: params.p_preferred_section,
          p_notes: params.p_notes,
          p_quoted_wait_minutes: params.p_quoted_wait_minutes
        }
      )

      if (error) throw error

      // Create local entry with the returned data
      const newEntry: WaitlistEntry = {
        id: data?.waitlist_id || `wl_${Date.now()}`,
        location_id: params.locationId,
        status: 'waiting',
        created_at: new Date().toISOString(),
        position: data?.position || get().waitlist.length + 1,
        quoted_wait_minutes:
          data?.quoted_wait_minutes || params.p_quoted_wait_minutes || 15,
        party_name: params.p_party_name,
        party_size: params.p_party_size,
        phone: params.p_phone,
        email: params.p_email,
        seating_preference: params.p_seating_preference,
        preferred_section: params.p_preferred_section,
        notes: params.p_notes
      }

      set(state => ({
        waitlist: [...state.waitlist, newEntry],
        isLoading: false
      }))
    } catch (err: any) {
      console.error('Failed to add to waitlist:', err)
      set({
        error: err.message || 'Failed to add to waitlist',
        isLoading: false
      })

      // Fallback: add locally anyway for offline support
      get().addToWaitlist({
        party_name: params.p_party_name,
        party_size: params.p_party_size,
        phone: params.p_phone,
        email: params.p_email,
        seating_preference: params.p_seating_preference,
        preferred_section: params.p_preferred_section,
        notes: params.p_notes,
        quoted_wait_minutes: params.p_quoted_wait_minutes
      })
    }
  },

  removeFromWaitlistAsync: async (entryId: string) => {
    try {
      const { error } = await FloorPlanService.updateWaitlistStatus(
        getClient(),
        entryId,
        'cancelled'
      )

      if (error) throw error

      // Remove from local state
      set(state => ({
        waitlist: state.waitlist.filter(entry => entry.id !== entryId)
      }))
    } catch (err: any) {
      console.error('Failed to remove from waitlist:', err)
      // Still remove locally for UX
      set(state => ({
        waitlist: state.waitlist.filter(entry => entry.id !== entryId)
      }))
    }
  },

  seatFromWaitlistAsync: async (entryId: string, tableIds: string[]) => {
    try {
      const { data, error } = await FloorPlanService.seatFromWaitlist(
        getClient(),
        entryId,
        tableIds
      )

      if (error) throw error

      // Remove from local state
      set(state => ({
        waitlist: state.waitlist.filter(entry => entry.id !== entryId)
      }))

      return data
    } catch (err: any) {
      console.error('Failed to seat from waitlist:', err)
      // Still remove locally
      set(state => ({
        waitlist: state.waitlist.filter(entry => entry.id !== entryId)
      }))
      return null
    }
  },

  updateWaitlistStatus: async (entryId: string, status: string) => {
    try {
      const { error } = await FloorPlanService.updateWaitlistStatus(
        getClient(),
        entryId,
        status
      )

      if (error) throw error

      // Update local state
      set(state => ({
        waitlist: state.waitlist.map(entry =>
          entry.id === entryId ? { ...entry, status: status as any } : entry
        )
      }))
    } catch (err: any) {
      console.error('Failed to update waitlist status:', err)
      // Optionally still update locally for UX
      set(state => ({
        waitlist: state.waitlist.map(entry =>
          entry.id === entryId ? { ...entry, status: status as any } : entry
        )
      }))
    }
  },

  // --- LOCAL METHODS (for offline/fallback) ---

  addToWaitlist: newEntryData => {
    const newEntry: WaitlistEntry = {
      id: `wl_${Date.now()}`,
      location_id: 'loc_demo',
      status: 'waiting',
      created_at: new Date().toISOString(),
      position: get().waitlist.length + 1,
      quoted_wait_minutes: newEntryData.quoted_wait_minutes || 15,
      ...newEntryData
    }

    if (!newEntry.party_size) newEntry.party_size = 2
    if (!newEntry.party_name) newEntry.party_name = 'Guest'

    set(state => ({
      waitlist: [...state.waitlist, newEntry]
    }))
  },

  reorderWaitlist: newWaitlist => {
    set({ waitlist: newWaitlist })
  },

  deleteFromWaitlist: entryId => {
    set(state => ({
      waitlist: state.waitlist.filter(entry => entry.id !== entryId)
    }))
  },

  removeWaitlistEntry: entryId => {
    get().deleteFromWaitlist(entryId)
  }
}))
