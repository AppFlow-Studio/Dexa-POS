import { FloorPlanService } from '@/services/floorPlanService'
import { AddToWaitlistParams, WaitlistEntry } from '@/types/db-floor-plan-types'
import { SupabaseClient } from '@supabase/supabase-js'
import { create } from 'zustand'
import { useLocationConfigStore } from './useLocationConfigStore'
import { useTableSessionStore } from './useTableSessionStore'

// Automated guest SMS (add/cancel confirmations) only fire when the merchant has
// left the "auto SMS" toggle on. Manual "Notify" composer sends are unaffected.
const isAutoSmsEnabled = () =>
  useLocationConfigStore.getState().config.waitlist.autoSmsEnabled !== false

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
  updateWaitlistEntryAsync: (
    entryId: string,
    updates: {
      party_name?: string
      party_size?: number
      phone?: string | null
      email?: string | null
      seating_preference?: string | null
      preferred_section?: string | null
      notes?: string | null
      quoted_wait_minutes?: number
    }
  ) => Promise<void>
  notifyWaitlistPartyAsync: (entryId: string) => Promise<{
    success: boolean
    sms?: boolean
    error?: string
    message?: string
    reason?: string
  }>
  sendWaitlistCustomNotification: (
    entryId: string,
    message: string,
    templateKey: string
  ) => Promise<{
    success: boolean
    sms?: boolean
    error?: string
    message?: string
    reason?: string
  }>

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

          // Backend writes can lag briefly after notify/re-notify.
          // Keep the highest local counters so UI does not regress.
          const mergedNotificationCount = Math.max(
            prev.notification_count ?? 0,
            entry.notification_count ?? 0
          )
          const mergedNotificationFailures = Math.max(
            prev.notification_failures ?? 0,
            entry.notification_failures ?? 0
          )

          const isSame =
            prev.status === entry.status &&
            prev.quoted_wait_minutes === entry.quoted_wait_minutes &&
            prev.party_name === entry.party_name &&
            prev.party_size === entry.party_size &&
            prev.phone === entry.phone &&
            prev.email === entry.email &&
            prev.preferred_section === entry.preferred_section &&
            prev.seating_preference === entry.seating_preference &&
            prev.notes === entry.notes &&
            prev.notification_count === mergedNotificationCount &&
            prev.notification_failures === mergedNotificationFailures

          // Always preserve local position — reorderWaitlist sets it optimistically
          // and persists to backend. Server position can lag during the write window.
          return isSame
            ? prev
            : {
                ...entry,
                position: prev.position,
                notification_count: mergedNotificationCount,
                notification_failures: mergedNotificationFailures
              }
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

      if (params.p_estimated_ready_at && data?.waitlist_id) {
        await FloorPlanService.updateWaitlistEstimatedReadyAt(
          getClient(),
          data.waitlist_id,
          params.p_estimated_ready_at
        )
      }

      // Create local entry with the returned data
      const newEntry: WaitlistEntry = {
        id: data?.waitlist_id || `wl_${Date.now()}`,
        location_id: params.locationId,
        status: 'waiting',
        created_at: new Date().toISOString(),
        position: data?.position || get().waitlist.length + 1,
        quoted_wait_minutes:
          data?.quoted_wait_minutes || params.p_quoted_wait_minutes || 15,
        estimated_ready_at: params.p_estimated_ready_at,
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

      // Fire-and-forget add-confirmation SMS to the guest. The edge function
      // renders the message server-side from `template_key` + waitlist row.
      const phoneDigits = (newEntry.phone ?? '').replace(/\D/g, '')
      if (phoneDigits.length > 0 && data?.waitlist_id && isAutoSmsEnabled()) {
        // No await — we don't want to block the add flow if SMS provider is slow.
        FloorPlanService.sendWaitlistSms(getClient(), {
          waitlist_id: data.waitlist_id,
          template_key: 'waitlist.added'
        }).catch(err => {
          console.warn('Add-confirmation SMS failed:', err)
        })
      }
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
        quoted_wait_minutes: params.p_quoted_wait_minutes,
        estimated_ready_at: params.p_estimated_ready_at
      })
    }
  },

  removeFromWaitlistAsync: async (entryId: string) => {
    // Snapshot phone before we mutate so we can fire the cancel SMS on success.
    const entry = get().waitlist.find(e => e.id === entryId)
    const phoneDigits = (entry?.phone ?? '').replace(/\D/g, '')
    try {
      const { error } = await FloorPlanService.updateWaitlistStatus(
        getClient(),
        entryId,
        'cancelled'
      )

      if (error) throw error

      // Remove from local state
      set(state => ({
        waitlist: state.waitlist.filter(e => e.id !== entryId)
      }))

      // Fire-and-forget cancellation SMS. Edge function reads the row
      // server-side and renders the message from template_key.
      if (phoneDigits.length > 0 && isAutoSmsEnabled()) {
        FloorPlanService.sendWaitlistSms(getClient(), {
          waitlist_id: entryId,
          template_key: 'waitlist.cancelled'
        }).catch(err => {
          console.warn('Cancel SMS failed:', err)
        })
      }
    } catch (err: any) {
      console.error('Failed to remove from waitlist:', err)
      // Still remove locally for UX
      set(state => ({
        waitlist: state.waitlist.filter(e => e.id !== entryId)
      }))
    }
  },

  seatFromWaitlistAsync: async (entryId: string, tableIds: string[]) => {
    try {
      // Get the entry before seating to calculate actual wait time
      const entry = get().waitlist.find(e => e.id === entryId)
      if (!entry) throw new Error('Waitlist entry not found')

      const actualWaitMinutes = Math.floor(
        (Date.now() - new Date(entry.created_at).getTime()) / 60000
      )

      // Try to persist accuracy before seat transition to avoid RLS/status policy issues.
      const preSeatAccuracy = await FloorPlanService.recordWaitAccuracy(
        getClient(),
        entryId,
        actualWaitMinutes
      )

      // Use seatGuests to seat the party — this handles optimistic updates,
      // session store hydration, and order creation so TableOrderView renders
      // immediately without hitting the loading skeleton.
      const result = await useTableSessionStore.getState().seatGuests({
        tableIds,
        partySize: entry.party_size,
        guestName: entry.party_name,
        guestPhone: entry.phone ?? undefined,
        waitlistId: entryId,
        createOrder: true
      })

      // Retry accuracy tracking post-seat if pre-seat write did not persist.
      if (!preSeatAccuracy.data?.success) {
        const postSeatAccuracy = await FloorPlanService.recordWaitAccuracy(
          getClient(),
          entryId,
          actualWaitMinutes
        )

        if (postSeatAccuracy.error || !postSeatAccuracy.data?.success) {
          console.warn('Wait accuracy was not persisted for seated party', {
            entryId,
            actualWaitMinutes,
            error: postSeatAccuracy.error || preSeatAccuracy.error
          })
        }
      }

      // Remove from local state
      set(state => ({
        waitlist: state.waitlist.filter(entry => entry.id !== entryId)
      }))

      return result.sessionId
        ? { session_id: result.sessionId, order_id: result.orderId }
        : null
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

  updateWaitlistEntryAsync: async (entryId, updates) => {
    // Optimistic local update
    set(state => ({
      waitlist: state.waitlist.map(entry =>
        entry.id === entryId ? { ...entry, ...updates } : entry
      )
    }))
    try {
      const { error } = await FloorPlanService.updateWaitlistEntry(
        getClient(),
        entryId,
        updates
      )
      if (error) throw error
    } catch (err: any) {
      console.error('Failed to update waitlist entry:', err)
      // Revert: refetch to restore server state
      const locationId = get().waitlist.find(e => e.id === entryId)?.location_id
      if (locationId) get().fetchWaitlist(locationId, { silent: true })
    }
  },

  notifyWaitlistPartyAsync: async (entryId: string) => {
    try {
      const entry = get().waitlist.find(e => e.id === entryId)
      if (!entry) return { success: false, error: 'Entry not found' }

      const rpcResult = await FloorPlanService.notifyWaitlistParty(
        getClient(),
        entryId
      )

      if (!rpcResult.data?.success) {
        return {
          success: false,
          error: rpcResult.data?.error || 'Failed to prepare notification'
        }
      }

      const { phone, message_template } = rpcResult.data

      if (!phone) {
        return { success: true, sms: false, reason: 'in_app_only' }
      }

      const smsResult = await FloorPlanService.sendWaitlistSms(getClient(), {
        phone,
        message: message_template,
        waitlist_id: entryId
      })

      const smsData = smsResult.data
      const smsFailed =
        !!smsResult.error ||
        !smsData ||
        !smsData.success ||
        smsData.sms === false

      if (smsData?.success && smsData.sms) {
        set(state => ({
          waitlist: state.waitlist.map(e =>
            e.id === entryId
              ? {
                  ...e,
                  status: 'notified',
                  notified_at: new Date().toISOString()
                }
              : e
          )
        }))
      } else if (smsFailed) {
        set(state => ({
          waitlist: state.waitlist.map(e =>
            e.id === entryId
              ? {
                  ...e,
                  notification_failures: (e.notification_failures ?? 0) + 1
                }
              : e
          )
        }))
      }

      if (smsFailed) {
        const failureMessage =
          smsData?.message ||
          smsData?.provider_error ||
          (typeof smsResult.error?.message === 'string' &&
            smsResult.error.message) ||
          (typeof smsData?.error === 'string' && smsData.error !== 'sms_failed'
            ? smsData.error
            : undefined) ||
          'Could not send SMS. Failure logged. Please notify guest verbally.'

        return {
          success: false,
          error: 'sms_failed',
          message: failureMessage,
          reason: smsData?.reason
        }
      }

      return smsData
    } catch (err: any) {
      console.error('Failed to notify waitlist party:', err)
      const currentEntry = get().waitlist.find(e => e.id === entryId)
      if (currentEntry?.phone?.replace(/\D/g, '')) {
        set(state => ({
          waitlist: state.waitlist.map(e =>
            e.id === entryId
              ? {
                  ...e,
                  notification_failures: (e.notification_failures ?? 0) + 1
                }
              : e
          )
        }))
      }
      return {
        success: false,
        error: 'sms_failed',
        message:
          err.message ||
          'Could not send SMS. Failure logged. Please notify guest verbally.'
      }
    }
  },

  sendWaitlistCustomNotification: async (
    entryId: string,
    message: string,
    templateKey: string
  ) => {
    try {
      const entry = get().waitlist.find(e => e.id === entryId)
      if (!entry) return { success: false, error: 'Entry not found' }

      const phoneDigits = entry.phone?.replace(/\D/g, '') ?? ''
      if (!phoneDigits) {
        return {
          success: false,
          error: 'no_phone',
          message: 'No phone on file for this guest'
        }
      }

      const isCustom = templateKey === 'custom'
      const smsResult = await FloorPlanService.sendWaitlistSms(getClient(), {
        waitlist_id: entryId,
        template_key: templateKey,
        // Only forward the freeform body when the template explicitly allows it.
        message: isCustom ? message : undefined
      })

      const smsData = smsResult.data
      const smsFailed =
        !!smsResult.error ||
        !smsData ||
        !smsData.success ||
        smsData.sms === false

      if (smsData?.success && smsData.sms) {
        set(state => ({
          waitlist: state.waitlist.map(e =>
            e.id === entryId
              ? {
                  ...e,
                  notified_at: new Date().toISOString(),
                  last_notification_type: templateKey
                }
              : e
          )
        }))
      } else if (smsFailed) {
        set(state => ({
          waitlist: state.waitlist.map(e =>
            e.id === entryId
              ? {
                  ...e,
                  notification_failures: (e.notification_failures ?? 0) + 1
                }
              : e
          )
        }))
      }

      if (smsFailed) {
        const failureMessage =
          smsData?.message ||
          smsData?.provider_error ||
          (typeof smsResult.error?.message === 'string' &&
            smsResult.error.message) ||
          'Could not send SMS. Failure logged. Please notify guest verbally.'
        return {
          success: false,
          error: 'sms_failed',
          message: failureMessage,
          reason: smsData?.reason
        }
      }

      return smsData ?? { success: true, sms: true }
    } catch (err: any) {
      console.error('Failed to send custom waitlist notification:', err)
      return {
        success: false,
        error: 'sms_failed',
        message:
          err.message ||
          'Could not send SMS. Please notify guest verbally.'
      }
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

    // Fire-and-forget: persist positions to backend
    const client = getClient()
    if (client) {
      Promise.all(
        newWaitlist.map(entry =>
          client
            .from('waitlist')
            .update({ position_in_queue: entry.position })
            .eq('id', entry.id)
            .then(({ error }) => {
              if (error)
                console.warn(
                  `Failed to update position for ${entry.id}:`,
                  error
                )
            })
        )
      )
    }
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
