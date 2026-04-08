import {
  AddFloorPlanObjectParams,
  AddToWaitlistParams,
  BatchUpdateObjectParams,
  CheckAvailabilityParams,
  CreateFloorPlanParams,
  CreateReservationParams,
  FloorPlan,
  FloorPlanObject,
  LocationTableStatusRow,
  MergeTableParams,
  Reservation,
  ServerSection,
  TransferTableSessionParams,
  UpdateFloorPlanObjectPositionParams,
  UpdateTableSessionStatusParams,
  WaitlistEntry
} from '@/types/db-floor-plan-types'
import type {
  SeatGuestsParams,
  SeatGuestsResponse
} from '@/types/sessionRpcTypes'
import { SupabaseClient } from '@supabase/supabase-js'

export class FloorPlanService {
  // --- FLOOR PLAN OPERATIONS ---

  static async getLocationFloorPlans (
    client: SupabaseClient,
    locationId: string
  ): Promise<{ data: FloorPlan[] | null; error: any }> {
    const { data, error } = await client.rpc('get_location_floor_plans', {
      p_location_id: locationId
    })
    // console.log("[FloorPlanService] getLocationFloorPlans", data, error);
    return { data, error }
  }

  static async createFloorPlan (
    client: SupabaseClient,
    params: CreateFloorPlanParams
  ): Promise<{ data: { floor_plan_id: string } | null; error: any }> {
    const { data, error } = await client.rpc('create_floor_plan', params)
    return { data, error }
  }

  static async updateFloorPlan (
    client: SupabaseClient,
    floorPlanId: string,
    updates: Partial<FloorPlan>
  ): Promise<{ error: any }> {
    const { error } = await client
      .from('floor_plans')
      .update(updates)
      .eq('id', floorPlanId)
    return { error }
  }

  static async deleteFloorPlan (
    client: SupabaseClient,
    floorPlanId: string
  ): Promise<{ error: any }> {
    const { error } = await client
      .from('floor_plans')
      .delete()
      .eq('id', floorPlanId)
    return { error }
  }

  static async getFloorPlanStatus (
    client: SupabaseClient,
    floorPlanId: string
  ): Promise<{
    data: { tables: FloorPlanObject[] } | null
    error: any
  }> {
    const { data, error } = await client.rpc('get_floor_plan_status', {
      p_floor_plan_id: floorPlanId
    })
    return { data, error }
  }

  /**
   * Fetch ALL floor plan objects (tables, walls, decorations, zones, etc.) with their sessions.
   * This includes all categories, not just tables with active sessions.
   *
   * Strategy: Get all objects, then enrich with session data by joining the junction table.
   */
  static async getAllFloorPlanObjects (
    client: SupabaseClient,
    floorPlanId: string
  ): Promise<{
    data: FloorPlanObject[] | null
    error: any
  }> {
    try {
      console.log(
        `[getAllFloorPlanObjects] Fetching objects for floor plan: ${floorPlanId}`
      )

      // 1. Fetch ALL active floor plan objects (not filtered by category)
      const { data: allObjects, error: objectsError } = await client
        .from('floor_plan_objects')
        .select('*')
        .eq('floor_plan_id', floorPlanId)
        .eq('is_active', true)
        .order('z_index', { ascending: true })

      if (objectsError) {
        console.error(
          '[getAllFloorPlanObjects] Error fetching objects:',
          objectsError
        )
        return { data: null, error: objectsError }
      }

      if (!allObjects || allObjects.length === 0) {
        console.warn('[getAllFloorPlanObjects] No objects found for floor plan')
        return { data: [], error: null }
      }

      console.log(
        `[getAllFloorPlanObjects] Found ${allObjects.length} total objects`
      )

      // 2. Fetch session data for tables that have sessions
      // Scope junction query to only tables in this floor plan to avoid cross-plan pollution
      const tableIds = allObjects.map((obj: any) => obj.id)
      const { data: junctionData, error: junctionError } = await client
        .from('table_session_tables')
        .select(`table_id, session_id, seated_position`)
        .eq('is_active', true)
        .in('table_id', tableIds)

      // Collect unique session IDs from junctions, then fetch only those sessions
      const sessionIdsFromJunctions = new Set<string>()
      if (junctionData) {
        junctionData.forEach((row: any) =>
          sessionIdsFromJunctions.add(row.session_id)
        )
      }

      let sessionsData: any[] | null = null
      let sessionsError: any = null

      if (sessionIdsFromJunctions.size > 0) {
        const result = await client
          .from('table_sessions')
          .select(
            `id, session_number, status, party_size, guest_name, order_id, reservation_id, server_staff_id, seated_at, current_course, needs_attention, is_vip, is_active`
          )
          .eq('is_active', true)
          .in('id', Array.from(sessionIdsFromJunctions))
        sessionsData = result.data
        sessionsError = result.error
      }

      if (junctionError) {
        console.warn(
          '[getAllFloorPlanObjects] Warning: error fetching junctions:',
          junctionError
        )
      }
      if (sessionsError) {
        console.warn(
          '[getAllFloorPlanObjects] Warning: error fetching sessions:',
          sessionsError
        )
      }

      // 3. Build efficient lookups
      const sessionMap = new Map<string, any>()
      const tableToSessionId = new Map<string, string>()
      const mergedTablesBySession = new Map<string, string[]>()

      // Index all sessions
      if (sessionsData) {
        sessionsData.forEach((sess: any) => {
          sessionMap.set(sess.id, sess)
        })
      }

      // Map tables to sessions and collect merged tables
      // Only map junctions whose session actually exists in sessionMap (is_active=true)
      if (junctionData) {
        const staleJunctionCount = junctionData.filter(
          (row: any) => !sessionMap.has(row.session_id)
        ).length
        if (staleJunctionCount > 0) {
          console.warn(
            `[getAllFloorPlanObjects] ${staleJunctionCount} stale junction(s) pointing to inactive sessions`
          )
        }

        junctionData.forEach((row: any) => {
          // Skip junctions whose session is no longer active
          if (!sessionMap.has(row.session_id)) return

          tableToSessionId.set(row.table_id, row.session_id)

          if (!mergedTablesBySession.has(row.session_id)) {
            mergedTablesBySession.set(row.session_id, [])
          }
          mergedTablesBySession.get(row.session_id)!.push(row.table_id)
        })
      }

      // 4. Combine all objects with their session data
      const result: FloorPlanObject[] = allObjects.map((obj: any) => {
        const sessionId = tableToSessionId.get(obj.id)
        const session =
          sessionId && sessionMap.has(sessionId)
            ? {
                ...sessionMap.get(sessionId),
                merged_tables: mergedTablesBySession.get(sessionId) || []
              }
            : null

        return { ...obj, session }
      })

      console.log(
        `[getAllFloorPlanObjects] Returning ${result.length} objects with session data`
      )
      return { data: result, error: null }
    } catch (err: any) {
      console.error('[getAllFloorPlanObjects] Fatal error:', err)
      return { data: null, error: err }
    }
  }

  // --- OBJECT OPERATIONS ---

  static async addFloorPlanObject (
    client: SupabaseClient,
    params: AddFloorPlanObjectParams
  ): Promise<{ data: { object_id: string } | null; error: any }> {
    const { data, error } = await client.rpc('add_floor_plan_object', params)
    return { data, error }
  }

  static async updateFloorPlanObject (
    client: SupabaseClient,
    objectId: string,
    updates: Partial<FloorPlanObject>
  ): Promise<{ data: FloorPlanObject | null; error: any }> {
    const { data, error } = await client
      .from('floor_plan_objects')
      .update(updates)
      .eq('id', objectId)
      .select()
      .single()

    return { data, error }
  }

  static async updateFloorPlanObjectPosition (
    client: SupabaseClient,
    params: UpdateFloorPlanObjectPositionParams
  ): Promise<{ error: any }> {
    const { error } = await client.rpc(
      'update_floor_plan_object_position',
      params
    )
    return { error }
  }

  static async updateFloorPlanObjectsBatch (
    client: SupabaseClient,
    params: BatchUpdateObjectParams
  ): Promise<{ error: any }> {
    const { error } = await client.rpc(
      'update_floor_plan_objects_batch',
      params
    )
    return { error }
  }

  static async deleteFloorPlanObject (
    client: SupabaseClient,
    objectId: string
  ): Promise<{ error: any }> {
    const { error } = await client
      .from('floor_plan_objects')
      .delete()
      .eq('id', objectId)
    return { error }
  }

  // --- SESSION OPERATIONS ---

  static async getLocationTableStatus (
    client: SupabaseClient,
    locationId: string
  ): Promise<{ data: LocationTableStatusRow[] | null; error: any }> {
    const { data, error } = await client.rpc('get_location_table_status_v2', {
      p_location_id: locationId
    })
    return { data, error }
  }

  static async seatGuests (
    client: SupabaseClient,
    params: SeatGuestsParams
  ): Promise<{
    data: SeatGuestsResponse | null
    error: any
  }> {
    const { data, error } = await client.rpc('seat_guests_v3', params)
    // Handle JSONB error: RPC returns { success: false, error: "..." }
    if (!error && data && data.success === false) {
      return {
        data: null,
        error: { message: data.error || 'seat_guests_v3 failed' }
      }
    }
    return { data, error }
  }

  static async updateTableSessionStatus (
    client: SupabaseClient,
    params: UpdateTableSessionStatusParams
  ): Promise<{ error: any }> {
    // Direct update to table_sessions instead of RPC (RPC doesn't exist)
    const updateData: any = {
      status: params.p_status,
      updated_at: new Date().toISOString()
    }

    // When cleaning or marking available, close the session (is_active = false)
    if (params.p_status === 'cleaning' || params.p_status === 'available') {
      const now = new Date().toISOString()

      // First, mark all junctions as inactive so polling won't re-attach the session
      // This must happen before we mark the session inactive
      const { error: junctionError } = await client
        .from('table_session_tables')
        .update({ is_active: false })
        .eq('session_id', params.p_session_id)

      if (junctionError) {
        console.warn(
          '[updateTableSessionStatus] Failed to deactivate junctions:',
          junctionError
        )
      } else {
        console.log(
          '[updateTableSessionStatus] Deactivated junctions for session:',
          params.p_session_id
        )
      }

      updateData.is_active = false
      updateData.cleared_at = now
      updateData.closed_at = now
      if (params.p_staff_id) {
        updateData.closed_by = params.p_staff_id
      }
    }

    // Only add notes if it exists and the column exists
    if (params.p_notes) {
      updateData.notes = params.p_notes
    }

    console.log('[updateTableSessionStatus] Attempting update:', {
      sessionId: params.p_session_id,
      status: params.p_status,
      updateData
    })

    const { error } = await client
      .from('table_sessions')
      .update(updateData)
      .eq('id', params.p_session_id)

    console.log('[updateTableSessionStatus] Result:', {
      sessionId: params.p_session_id,
      status: params.p_status,
      error
    })

    return { error }
  }

  static async transferTableSession (
    client: SupabaseClient,
    params: TransferTableSessionParams
  ): Promise<{ error: any }> {
    const { error } = await client.rpc('transfer_table_session', params)
    return { error }
  }

  static async mergeTableToSession (
    client: SupabaseClient,
    params: MergeTableParams
  ): Promise<{ error: any }> {
    const { error } = await client.rpc('merge_table_to_session', params)
    return { error }
  }

  static async unmergeTableFromSession (
    client: SupabaseClient,
    params: MergeTableParams
  ): Promise<{ error: any }> {
    const { error } = await client.rpc('unmerge_table_from_session', params)
    return { error }
  }

  static async advanceCourse (
    client: SupabaseClient,
    sessionId: string,
    staffId?: string
  ): Promise<{ data: { current_course: number } | null; error: any }> {
    const { data, error } = await client.rpc('advance_course', {
      p_session_id: sessionId,
      p_staff_id: staffId
    })
    return { data, error }
  }

  // --- WAITLIST OPERATIONS ---

  static async getWaitlist (
    client: SupabaseClient,
    locationId: string
  ): Promise<{ data: { waitlist: WaitlistEntry[] } | null; error: any }> {
    const { data, error } = await client.rpc('get_waitlist', {
      p_location_id: locationId
    })
    return { data, error }
  }

  static async addToWaitlist (
    client: SupabaseClient,
    params: AddToWaitlistParams
  ): Promise<{
    data: {
      waitlist_id: string
      position: number
      quoted_wait_minutes: number
    } | null
    error: any
  }> {
    // Keep RPC payload backward-compatible with the current DB function signature.
    // estimated_ready_at is persisted via a follow-up table update.
    const { data, error } = await client.rpc('add_to_waitlist', {
      p_location_id: params.p_location_id,
      p_party_name: params.p_party_name,
      p_party_size: params.p_party_size,
      p_phone: params.p_phone,
      p_email: params.p_email,
      p_notes: params.p_notes,
      p_preferred_section: params.p_preferred_section,
      p_seating_preference: params.p_seating_preference,
      p_quoted_wait_minutes: params.p_quoted_wait_minutes
    })
    return { data, error }
  }

  static async updateWaitlistEstimatedReadyAt (
    client: SupabaseClient,
    waitlistId: string,
    estimatedReadyAt: string
  ): Promise<{ data: { success: boolean } | null; error: any }> {
    const { error } = await client
      .from('waitlist')
      .update({ estimated_ready_at: estimatedReadyAt })
      .eq('id', waitlistId)

    return { data: { success: !error }, error }
  }

  static async notifyWaitlistParty (
    client: SupabaseClient,
    waitlistId: string
  ): Promise<{
    data: {
      success: boolean
      phone: string
      party_name: string
      message_template: string
      notified_at: string
      notification_count: number
      last_notification_type: string
      notification_failures: number
      error?: string
    } | null
    error: any
  }> {
    const { data, error } = await client.rpc('notify_waitlist_party', {
      p_waitlist_id: waitlistId
    })
    return { data, error }
  }

  static async resendWaitlistNotification (
    client: SupabaseClient,
    waitlistId: string
  ): Promise<{
    data: {
      success: boolean
      phone: string
      party_name: string
      message_template: string
      notified_at: string
      notification_count: number
      last_notification_type: string
      notification_failures: number
      error?: string
    } | null
    error: any
  }> {
    const { data, error } = await client.rpc('resend_waitlist_notification', {
      p_waitlist_id: waitlistId
    })
    return { data, error }
  }

  static async sendWaitlistSms (
    client: SupabaseClient,
    params: { phone: string; message: string; waitlist_id: string }
  ): Promise<{
    data: {
      success: boolean
      sms?: boolean
      error?: string
      message?: string
      reason?: string
      twilio_error?: string
    } | null
    error: any
  }> {
    const { data, error } = await client.functions.invoke(
      'notify-waitlist-guest',
      {
        body: {
          phone: params.phone,
          message: params.message,
          waitlist_id: params.waitlist_id
        }
      }
    )
    return { data, error }
  }

  static async updateWaitlistStatus (
    client: SupabaseClient,
    waitlistId: string,
    status: string
  ): Promise<{ error: any }> {
    const { error } = await client.rpc('update_waitlist_status', {
      p_waitlist_id: waitlistId,
      p_status: status
    })
    return { error }
  }

  static async seatFromWaitlist (
    client: SupabaseClient,
    waitlistId: string,
    tableIds: string[]
  ): Promise<{
    data: { session_id: string; order_id?: string } | null
    error: any
  }> {
    const { data, error } = await client.rpc('seat_from_waitlist', {
      p_waitlist_id: waitlistId,
      p_table_ids: tableIds
    })
    return { data, error }
  }

  // --- RESERVATION OPERATIONS ---

  static async getReservations (
    client: SupabaseClient,
    locationId: string,
    date?: string
  ): Promise<{ data: { reservations: Reservation[] } | null; error: any }> {
    const { data, error } = await client.rpc('get_reservations', {
      p_location_id: locationId,
      p_date: date
    })
    return { data, error }
  }

  static async createReservation (
    client: SupabaseClient,
    params: CreateReservationParams
  ): Promise<{
    data: { reservation_id: string; confirmation_number: string } | null
    error: any
  }> {
    const { data, error } = await client.rpc('create_reservation', params)
    return { data, error }
  }

  static async updateReservationStatus (
    client: SupabaseClient,
    reservationId: string,
    status: string
  ): Promise<{ error: any }> {
    const { error } = await client.rpc('update_reservation_status', {
      p_reservation_id: reservationId,
      p_status: status
    })
    return { error }
  }

  static async assignReservationTables (
    client: SupabaseClient,
    reservationId: string,
    tableIds: string[]
  ): Promise<{ error: any }> {
    const { error } = await client.rpc('assign_reservation_tables', {
      p_reservation_id: reservationId,
      p_table_ids: tableIds
    })
    return { error }
  }

  static async seatReservation (
    client: SupabaseClient,
    reservationId: string,
    tableIds?: string[]
  ): Promise<{
    data: { session_id: string; order_id?: string } | null
    error: any
  }> {
    const { data, error } = await client.rpc('seat_reservation', {
      p_reservation_id: reservationId,
      p_table_ids: tableIds
    })
    return { data, error }
  }

  static async checkTableAvailability (
    client: SupabaseClient,
    params: CheckAvailabilityParams
  ): Promise<{ data: FloorPlanObject[] | null; error: any }> {
    const { data, error } = await client.rpc('check_table_availability', params)
    return { data, error }
  }

  static async getServerSections (
    client: SupabaseClient,
    floorPlanId: string
  ): Promise<{ data: ServerSection[] | null; error: any }> {
    const { data, error } = await client
      .from('server_sections')
      .select('id, name, color, assigned_staff_id, floor_plan_id')
      .eq('floor_plan_id', floorPlanId)
      .eq('is_active', true)
    return { data, error }
  }

  /**
   * Record actual wait time for a waitlist entry that was just seated.
   * Used for accuracy tracking and improving future estimates.
   */
  static async recordWaitAccuracy (
    client: SupabaseClient,
    waitlistId: string,
    actualWaitMinutes: number
  ): Promise<{ data: { success: boolean } | null; error: any }> {
    // Update the waitlist entry with actual wait time
    const { data, error } = await client
      .from('waitlist')
      .update({
        actual_wait_minutes: actualWaitMinutes,
        seated_at: new Date().toISOString()
      })
      .eq('id', waitlistId)
      .select('id')

    const success = !error && Array.isArray(data) && data.length > 0
    return { data: { success }, error }
  }
}
