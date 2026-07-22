import { DEADLINES } from "@/lib/network/deadlines";
import { runWithDeadline } from "@/lib/network/runWithDeadline";
import { rpcWithIdempotency } from "@/lib/network/idempotencyKey";
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
  WaitlistEntry,
} from "@/types/db-floor-plan-types";
import type {
  SeatGuestsParams,
  SeatGuestsResponse,
} from "@/types/sessionRpcTypes";
import { SupabaseClient } from "@supabase/supabase-js";

export class FloorPlanService {
  // --- FLOOR PLAN OPERATIONS ---

  static async getLocationFloorPlans(
    client: SupabaseClient,
    locationId: string,
  ): Promise<{ data: FloorPlan[] | null; error: any }> {
    const { data, error } = await client.rpc("get_location_floor_plans", {
      p_location_id: locationId,
    });
    // console.log("[FloorPlanService] getLocationFloorPlans", data, error);
    return { data, error };
  }

  static async createFloorPlan(
    client: SupabaseClient,
    params: CreateFloorPlanParams,
  ): Promise<{ data: { floor_plan_id: string } | null; error: any }> {
    const { data, error } = await client.rpc("create_floor_plan", params);
    return { data, error };
  }

  static async updateFloorPlan(
    client: SupabaseClient,
    floorPlanId: string,
    updates: Partial<FloorPlan>,
  ): Promise<{ error: any }> {
    const { error } = await client
      .from("floor_plans")
      .update(updates)
      .eq("id", floorPlanId);
    return { error };
  }

  static async deleteFloorPlan(
    client: SupabaseClient,
    floorPlanId: string,
  ): Promise<{ error: any }> {
    const { error } = await client
      .from("floor_plans")
      .delete()
      .eq("id", floorPlanId);
    return { error };
  }

  static async getFloorPlanStatus(
    client: SupabaseClient,
    floorPlanId: string,
  ): Promise<{
    data: { tables: FloorPlanObject[] } | null;
    error: any;
  }> {
    const { data, error } = await client.rpc("get_floor_plan_status", {
      p_floor_plan_id: floorPlanId,
    });
    return { data, error };
  }

  /**
   * Fetch ALL floor plan objects (tables, walls, decorations, zones, etc.) with their sessions.
   * This includes all categories, not just tables with active sessions.
   *
   * Strategy: Get all objects, then enrich with session data by joining the junction table.
   */
  static async getAllFloorPlanObjects(
    client: SupabaseClient,
    floorPlanId: string,
  ): Promise<{
    data: FloorPlanObject[] | null;
    error: any;
  }> {
    try {
      if (__DEV__)
        console.log(
          `[getAllFloorPlanObjects] Fetching objects for floor plan: ${floorPlanId}`,
        );

      // 1. Fetch ALL active floor plan objects (not filtered by category)
      const { data: allObjects, error: objectsError } = await client
        .from("floor_plan_objects")
        .select("*")
        .eq("floor_plan_id", floorPlanId)
        .eq("is_active", true)
        .order("z_index", { ascending: true });

      if (objectsError) {
        console.error(
          "[getAllFloorPlanObjects] Error fetching objects:",
          objectsError,
        );
        return { data: null, error: objectsError };
      }

      if (!allObjects || allObjects.length === 0) {
        console.warn(
          "[getAllFloorPlanObjects] No objects found for floor plan",
        );
        return { data: [], error: null };
      }

      if (__DEV__)
        console.log(
          `[getAllFloorPlanObjects] Found ${allObjects.length} total objects`,
        );

      // 2. Fetch session data for tables that have sessions
      // Scope junction query to only tables in this floor plan to avoid cross-plan pollution
      const tableIds = allObjects.map((obj: any) => obj.id);
      const { data: junctionData, error: junctionError } = await client
        .from("table_session_tables")
        .select(`table_id, session_id, seated_position`)
        .eq("is_active", true)
        .in("table_id", tableIds);

      // Collect unique session IDs from junctions, then fetch only those sessions
      const sessionIdsFromJunctions = new Set<string>();
      if (junctionData) {
        junctionData.forEach((row: any) =>
          sessionIdsFromJunctions.add(row.session_id),
        );
      }

      let sessionsData: any[] | null = null;
      let sessionsError: any = null;

      if (sessionIdsFromJunctions.size > 0) {
        const result = await client
          .from("table_sessions")
          .select(
            `id, session_number, status, party_size, guest_name, order_id, reservation_id, server_staff_id, seated_at, current_course, needs_attention, is_vip, is_active`,
          )
          .eq("is_active", true)
          .in("id", Array.from(sessionIdsFromJunctions));
        sessionsData = result.data;
        sessionsError = result.error;
      }

      // FAIL CLOSED: if the junction or session sub-queries error, we cannot
      // tell which tables are occupied. Returning the objects anyway would strip
      // EVERY session (tables fall back to "available" → whole floor turns green)
      // until the next good fetch. Return an error instead so callers keep the
      // last known-good state rather than committing a false "all available".
      if (junctionError) {
        console.error(
          "[getAllFloorPlanObjects] junction fetch failed — aborting to avoid wiping sessions:",
          junctionError,
        );
        return { data: null, error: junctionError };
      }
      if (sessionsError) {
        console.error(
          "[getAllFloorPlanObjects] session fetch failed — aborting to avoid wiping sessions:",
          sessionsError,
        );
        return { data: null, error: sessionsError };
      }

      // 3. Build efficient lookups
      const sessionMap = new Map<string, any>();
      const tableToSessionId = new Map<string, string>();
      const mergedTablesBySession = new Map<string, string[]>();

      // Index all sessions
      if (sessionsData) {
        sessionsData.forEach((sess: any) => {
          sessionMap.set(sess.id, sess);
        });
      }

      // Map tables to sessions and collect merged tables
      // Only map junctions whose session actually exists in sessionMap (is_active=true)
      if (junctionData) {
        const staleJunctionCount = junctionData.filter(
          (row: any) => !sessionMap.has(row.session_id),
        ).length;
        if (staleJunctionCount > 0) {
          console.warn(
            `[getAllFloorPlanObjects] ${staleJunctionCount} stale junction(s) pointing to inactive sessions`,
          );
        }

        junctionData.forEach((row: any) => {
          // Skip junctions whose session is no longer active
          if (!sessionMap.has(row.session_id)) return;

          tableToSessionId.set(row.table_id, row.session_id);

          if (!mergedTablesBySession.has(row.session_id)) {
            mergedTablesBySession.set(row.session_id, []);
          }
          mergedTablesBySession.get(row.session_id)!.push(row.table_id);
        });
      }

      // 4. Combine all objects with their session data
      const result: FloorPlanObject[] = allObjects.map((obj: any) => {
        const sessionId = tableToSessionId.get(obj.id);
        const session =
          sessionId && sessionMap.has(sessionId)
            ? {
                ...sessionMap.get(sessionId),
                merged_tables: mergedTablesBySession.get(sessionId) || [],
              }
            : null;

        return { ...obj, session };
      });

      if (__DEV__)
        console.log(
          `[getAllFloorPlanObjects] Returning ${result.length} objects with session data`,
        );
      return { data: result, error: null };
    } catch (err: any) {
      console.error("[getAllFloorPlanObjects] Fatal error:", err);
      return { data: null, error: err };
    }
  }

  // --- OBJECT OPERATIONS ---

  static async addFloorPlanObject(
    client: SupabaseClient,
    params: AddFloorPlanObjectParams,
  ): Promise<{ data: { object_id: string } | null; error: any }> {
    const { data, error } = await client.rpc("add_floor_plan_object", params);
    return { data, error };
  }

  static async updateFloorPlanObject(
    client: SupabaseClient,
    objectId: string,
    updates: Partial<FloorPlanObject>,
  ): Promise<{ data: FloorPlanObject | null; error: any }> {
    const { data, error } = await client
      .from("floor_plan_objects")
      .update(updates)
      .eq("id", objectId)
      .select()
      .single();

    return { data, error };
  }

  static async updateFloorPlanObjectPosition(
    client: SupabaseClient,
    params: UpdateFloorPlanObjectPositionParams,
  ): Promise<{ error: any }> {
    const { error } = await client.rpc(
      "update_floor_plan_object_position",
      params,
    );
    return { error };
  }

  static async updateFloorPlanObjectsBatch(
    client: SupabaseClient,
    params: BatchUpdateObjectParams,
  ): Promise<{ error: any }> {
    const { error } = await client.rpc(
      "update_floor_plan_objects_batch",
      params,
    );
    return { error };
  }

  static async deleteFloorPlanObject(
    client: SupabaseClient,
    objectId: string,
  ): Promise<{ error: any }> {
    const { error } = await client
      .from("floor_plan_objects")
      .delete()
      .eq("id", objectId);
    return { error };
  }

  // --- SESSION OPERATIONS ---

  static async getLocationTableStatus(
    client: SupabaseClient,
    locationId: string,
  ): Promise<{ data: LocationTableStatusRow[] | null; error: any }> {
    const { data, error } = await client.rpc("get_location_table_status_v2", {
      p_location_id: locationId,
    });
    return { data, error };
  }

  static async seatGuests(
    client: SupabaseClient,
    params: SeatGuestsParams,
  ): Promise<{
    data: SeatGuestsResponse | null;
    error: any;
  }> {
    // NOTE: client always calls 'seat_guests_v3'. Two functions exist on
    // staging with the same name — Postgres dispatches by signature.
    // Passing p_idempotency_key routes to the array-param + idempotency version.
    let { data, error } = await rpcWithIdempotency<
      SeatGuestsResponse & { success?: boolean; error?: string }
    >(
      client,
      "seat_guests",
      "seat_guests_v3",
      "seat_guests_v3",
      params as Record<string, any>,
      { deadline: DEADLINES.closeCheck }, // seating creates a session + maybe an order
    );

    // Backward-compat: some environments expose seat_guests_v3 without
    // p_idempotency_key. Retry once with the legacy signature so queued
    // seating ops don't burn all retries on a deterministic mismatch.
    const details = String(error?.details || "");
    const message = String(error?.message || "");
    const hint = String(error?.hint || "");
    const missingIdempotencyArg =
      error?.code === "PGRST202" &&
      (details.includes("p_idempotency_key") ||
        message.includes("p_idempotency_key") ||
        hint.includes("Perhaps you meant to call"));

    if (missingIdempotencyArg) {
      // Bad-WiFi: bound the legacy fallback too (the MAIN path above is already
      // deadline-wrapped via rpcWithIdempotency). On timeout this returns
      // { error: DEADLINE_EXCEEDED } which flows to the seatGuests caller and
      // queues 'seat_guests' (replays the idempotency-keyed MAIN path). PGRST202
      // is a deterministic signature mismatch, not a timeout, so no retry loop.
      const retry = await runWithDeadline<
        SeatGuestsResponse & { success?: boolean; error?: string }
      >("seat_guests_legacy", DEADLINES.closeCheck, async (signal) => {
        const res = await client
          .rpc("seat_guests_v3", params as Record<string, any>)
          .abortSignal(signal);
        return { data: res.data, error: res.error };
      });
      data = retry.data as SeatGuestsResponse & {
        success?: boolean;
        error?: string;
      };
      error = retry.error;
    }

    // Handle JSONB error: RPC returns { success: false, error: "..." }
    if (!error && data && data.success === false) {
      return {
        data: null,
        error: { message: data.error || "seat_guests_v3 failed" },
      };
    }
    return { data, error };
  }

  static async updateTableSessionStatus(
    client: SupabaseClient,
    params: UpdateTableSessionStatusParams,
  ): Promise<{ error: any }> {
    // Direct update to table_sessions instead of RPC (RPC doesn't exist)
    const updateData: any = {
      status: params.p_status,
      updated_at: new Date().toISOString(),
    };

    // When cleaning or marking available, close the session (is_active = false)
    if (params.p_status === "cleaning" || params.p_status === "available") {
      const now = new Date().toISOString();

      // First, mark all junctions as inactive so polling won't re-attach the session
      // This must happen before we mark the session inactive
      const { error: junctionError } = await client
        .from("table_session_tables")
        .update({ is_active: false })
        .eq("session_id", params.p_session_id);

      if (junctionError) {
        console.warn(
          "[updateTableSessionStatus] Failed to deactivate junctions:",
          junctionError,
        );
      } else {
        console.log(
          "[updateTableSessionStatus] Deactivated junctions for session:",
          params.p_session_id,
        );
      }

      updateData.is_active = false;
      updateData.cleared_at = now;
      updateData.closed_at = now;
      if (params.p_staff_id) {
        updateData.closed_by = params.p_staff_id;
      }
    }

    // Only add notes if it exists and the column exists
    if (params.p_notes) {
      updateData.notes = params.p_notes;
    }

    console.log("[updateTableSessionStatus] Attempting update:", {
      sessionId: params.p_session_id,
      status: params.p_status,
      updateData,
    });

    const { error } = await client
      .from("table_sessions")
      .update(updateData)
      .eq("id", params.p_session_id);

    console.log("[updateTableSessionStatus] Result:", {
      sessionId: params.p_session_id,
      status: params.p_status,
      error,
    });

    return { error };
  }

  static async transferTableSession(
    client: SupabaseClient,
    params: TransferTableSessionParams,
  ): Promise<{ error: any }> {
    const targetTableIds = params.p_new_table_ids;
    if (!Array.isArray(targetTableIds) || targetTableIds.length === 0) {
      return { error: { message: "At least one target table is required" } };
    }
    if (targetTableIds.some(tableId => !tableId)) {
      return { error: { message: "Target table IDs cannot be empty" } };
    }
    if (new Set(targetTableIds).size !== targetTableIds.length) {
      return { error: { message: "Duplicate target tables are not allowed" } };
    }

    const { error } = await client.rpc("transfer_table_session", {
      ...params,
      p_reason: null,
    });
    const message = String(error?.message || "");
    const details = String(error?.details || "");
    const hint = String(error?.hint || "");
    const missingTransferRpc =
      error?.code === "PGRST202" ||
      error?.code === "PGRST203" ||
      message.includes("transfer_table_session") ||
      details.includes("transfer_table_session") ||
      hint.includes("transfer_table_session");
    const targetReportedOccupied =
      error?.code === "P0001" &&
      message.toLowerCase().includes("target") &&
      message.toLowerCase().includes("occupied");

    if (!missingTransferRpc && !targetReportedOccupied) {
      if (error) {
        console.error("[transferTableSession] RPC failed", {
          error,
          params,
        });
      }
      return { error };
    }

    console.warn(
      "[transferTableSession] RPC unavailable/ambiguous or reported stale occupancy; falling back to direct junction update",
      error,
    );

    const { data: session, error: sessionError } = await client
      .from("table_sessions")
      .select("id, merchant_id, location_id, order_id, is_active")
      .eq("id", params.p_session_id)
      .maybeSingle();

    if (sessionError) {
      console.error("[transferTableSession] Session lookup failed", {
        error: sessionError,
        params,
      });
      return { error: sessionError };
    }
    if (!session || session.is_active === false) {
      const notFoundError = { message: "Active table session not found" };
      console.error("[transferTableSession] Session lookup returned empty", {
        error: notFoundError,
        params,
      });
      return { error: notFoundError };
    }

    const { data: targetTables, error: targetError } = await client
      .from("floor_plan_objects")
      .select("id, name, merchant_id, location_id, is_active")
      .in("id", params.p_new_table_ids);

    if (targetError) {
      console.error("[transferTableSession] Target table lookup failed", {
        error: targetError,
        params,
      });
      return { error: targetError };
    }
    if ((targetTables?.length ?? 0) !== params.p_new_table_ids.length) {
      const missingTargetError = {
        message: "One or more target tables were not found",
      };
      console.error("[transferTableSession] Target table lookup incomplete", {
        error: missingTargetError,
        params,
        targetTables,
      });
      return { error: missingTargetError };
    }

    const invalidTarget = targetTables?.find(
      table =>
        table.is_active === false ||
        table.merchant_id !== session.merchant_id ||
        table.location_id !== session.location_id,
    );

    if (invalidTarget) {
      const invalidTargetError = {
        message: "Target table is inactive or belongs to another location",
      };
      console.error("[transferTableSession] Invalid target table", {
        error: invalidTargetError,
        params,
        invalidTarget,
      });
      return {
        error: invalidTargetError,
      };
    }

    const { data: occupiedRows, error: occupiedError } = await client
      .from("table_session_tables")
      .select("table_id, session_id")
      .in("table_id", params.p_new_table_ids)
      .eq("is_active", true);

    if (occupiedError) {
      console.error("[transferTableSession] Occupancy lookup failed", {
        error: occupiedError,
        params,
      });
      return { error: occupiedError };
    }
    const otherSessionIds = [
      ...new Set(
        (occupiedRows ?? [])
          .map(row => row.session_id)
          .filter(sessionId => sessionId && sessionId !== params.p_session_id),
      ),
    ];

    let occupiedTarget:
      | { table_id: string; session_id: string }
      | undefined;

    if (otherSessionIds.length > 0) {
      const { data: activeOccupants, error: activeOccupantsError } =
        await client
          .from("table_sessions")
          .select("id, is_active, status")
          .in("id", otherSessionIds);

      if (activeOccupantsError) {
        console.error("[transferTableSession] Active occupant lookup failed", {
          error: activeOccupantsError,
          params,
          otherSessionIds,
        });
        return { error: activeOccupantsError };
      }

      const activeOccupantIds = new Set(
        (activeOccupants ?? [])
          .filter(
            activeSession =>
              activeSession.is_active === true &&
              activeSession.status !== "cleaning",
          )
          .map(activeSession => activeSession.id),
      );

      occupiedTarget = occupiedRows?.find(
        row =>
          row.session_id !== params.p_session_id &&
          activeOccupantIds.has(row.session_id),
      );
    }

    if (occupiedTarget) {
      const occupiedTargetError = {
        message: "Target table already has an active session",
      };
      console.error("[transferTableSession] Target occupied", {
        error: occupiedTargetError,
        params,
        occupiedTarget,
      });
      return { error: occupiedTargetError };
    }

    if (otherSessionIds.length > 0) {
      const { error: staleTargetLinksError } = await client
        .from("table_session_tables")
        .update({ is_active: false })
        .in("table_id", params.p_new_table_ids)
        .in("session_id", otherSessionIds);

      if (staleTargetLinksError) {
        console.error("[transferTableSession] Clear stale target links failed", {
          error: staleTargetLinksError,
          params,
          otherSessionIds,
        });
        return { error: staleTargetLinksError };
      }
    }

    const { error: deactivateError } = await client
      .from("table_session_tables")
      .update({ is_active: false })
      .eq("session_id", params.p_session_id);

    if (deactivateError) {
      console.error("[transferTableSession] Deactivate old links failed", {
        error: deactivateError,
        params,
      });
      return { error: deactivateError };
    }

    const rows = params.p_new_table_ids.map((tableId, index) => ({
      session_id: params.p_session_id,
      table_id: tableId,
      is_primary: index === 0,
      seated_position: index,
      is_active: true,
    }));

    const { error: insertError } = await client
      .from("table_session_tables")
      .insert(rows);

    if (insertError) {
      console.error("[transferTableSession] Insert new links failed", {
        error: insertError,
        params,
        rows,
      });
      return { error: insertError };
    }

    if (session.order_id) {
      const primaryTable = targetTables?.find(
        target => target.id === params.p_new_table_ids[0],
      );
      await client
        .from("orders")
        .update({
          table_number: primaryTable?.name ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", session.order_id);
    }

    return { error: null };
  }

  static async mergeTableToSession(
    client: SupabaseClient,
    params: MergeTableParams,
  ): Promise<{ error: any }> {
    const { error } = await client.rpc("merge_table_to_session", params);
    return { error };
  }

  static async unmergeTableFromSession(
    client: SupabaseClient,
    params: MergeTableParams,
  ): Promise<{ error: any }> {
    const { error } = await client.rpc("unmerge_table_from_session", params);
    return { error };
  }

  static async advanceCourse(
    client: SupabaseClient,
    sessionId: string,
    staffId?: string,
  ): Promise<{ data: { current_course: number } | null; error: any }> {
    const { data, error } = await client.rpc("advance_course", {
      p_session_id: sessionId,
      p_staff_id: staffId,
    });
    return { data, error };
  }

  // --- WAITLIST OPERATIONS ---

  static async getWaitlist(
    client: SupabaseClient,
    locationId: string,
  ): Promise<{ data: { waitlist: WaitlistEntry[] } | null; error: any }> {
    const { data, error } = await client.rpc("get_waitlist", {
      p_location_id: locationId,
    });
    return { data, error };
  }

  static async addToWaitlist(
    client: SupabaseClient,
    params: AddToWaitlistParams,
  ): Promise<{
    data: {
      waitlist_id: string;
      position: number;
      quoted_wait_minutes: number;
    } | null;
    error: any;
  }> {
    // Keep RPC payload backward-compatible with the current DB function signature.
    // estimated_ready_at is persisted via a follow-up table update.
    const { data, error } = await client.rpc("add_to_waitlist", {
      p_location_id: params.p_location_id,
      p_party_name: params.p_party_name,
      p_party_size: params.p_party_size,
      p_phone: params.p_phone,
      p_email: params.p_email,
      p_notes: params.p_notes,
      p_preferred_section: params.p_preferred_section,
      p_seating_preference: params.p_seating_preference,
      p_quoted_wait_minutes: params.p_quoted_wait_minutes,
    });
    return { data, error };
  }

  static async updateWaitlistEstimatedReadyAt(
    client: SupabaseClient,
    waitlistId: string,
    estimatedReadyAt: string,
  ): Promise<{ data: { success: boolean } | null; error: any }> {
    const { error } = await client
      .from("waitlist")
      .update({ estimated_ready_at: estimatedReadyAt })
      .eq("id", waitlistId);

    return { data: { success: !error }, error };
  }

  static async updateWaitlistEntry(
    client: SupabaseClient,
    waitlistId: string,
    updates: {
      party_name?: string;
      party_size?: number;
      phone?: string | null;
      email?: string | null;
      seating_preference?: string | null;
      preferred_section?: string | null;
      notes?: string | null;
      quoted_wait_minutes?: number;
      estimated_ready_at?: string | null;
    },
  ): Promise<{ error: any }> {
    const { error } = await client
      .from("waitlist")
      .update(updates)
      .eq("id", waitlistId);
    return { error };
  }

  static async notifyWaitlistParty(
    client: SupabaseClient,
    waitlistId: string,
  ): Promise<{
    data: {
      success: boolean;
      phone: string;
      party_name: string;
      message_template: string;
      notified_at: string;
      notification_count: number;
      last_notification_type: string;
      notification_failures: number;
      error?: string;
    } | null;
    error: any;
  }> {
    const { data, error } = await client.rpc("notify_waitlist_party", {
      p_waitlist_id: waitlistId,
    });
    return { data, error };
  }

  static async resendWaitlistNotification(
    client: SupabaseClient,
    waitlistId: string,
  ): Promise<{
    data: {
      success: boolean;
      phone: string;
      party_name: string;
      message_template: string;
      notified_at: string;
      notification_count: number;
      last_notification_type: string;
      notification_failures: number;
      error?: string;
    } | null;
    error: any;
  }> {
    const { data, error } = await client.rpc("resend_waitlist_notification", {
      p_waitlist_id: waitlistId,
    });
    return { data, error };
  }

  static async sendWaitlistSms(
    client: SupabaseClient,
    params: {
      waitlist_id: string;
      template_key?: string;
      message?: string;
      // Legacy field kept for back-compat with older call sites — ignored by
      // the edge function (phone is read from the waitlist row server-side).
      phone?: string;
    },
  ): Promise<{
    data: {
      success: boolean;
      sms?: boolean;
      error?: string;
      message?: string;
      reason?: string;
      provider_error?: string;
    } | null;
    error: any;
  }> {
    const { data, error } = await client.functions.invoke(
      "notify-waitlist-guest",
      {
        body: {
          waitlist_id: params.waitlist_id,
          template_key: params.template_key,
          message: params.message,
        },
      },
    );
    return { data, error };
  }

  static async sendReservationSms(
    client: SupabaseClient,
    params: {
      reservation_id: string;
      template_key?: string;
      message?: string;
      // Legacy — ignored by the edge function (phone read server-side).
      phone?: string;
    },
  ): Promise<{
    data: {
      success: boolean;
      sms?: boolean;
      error?: string;
      message?: string;
      reason?: string;
      provider_error?: string;
    } | null;
    error: any;
  }> {
    const { data, error } = await client.functions.invoke(
      "notify-reservation-guest",
      {
        body: {
          reservation_id: params.reservation_id,
          template_key: params.template_key,
          message: params.message,
        },
      },
    );
    return { data, error };
  }

  static async updateWaitlistStatus(
    client: SupabaseClient,
    waitlistId: string,
    status: string,
  ): Promise<{ error: any }> {
    const { error } = await client.rpc("update_waitlist_status", {
      p_waitlist_id: waitlistId,
      p_status: status,
    });
    return { error };
  }

  static async seatFromWaitlist(
    client: SupabaseClient,
    waitlistId: string,
    tableIds: string[],
  ): Promise<{
    data: { session_id: string; order_id?: string } | null;
    error: any;
  }> {
    const { data, error } = await client.rpc("seat_from_waitlist", {
      p_waitlist_id: waitlistId,
      p_table_ids: tableIds,
    });
    return { data, error };
  }

  // --- RESERVATION OPERATIONS ---

  static async getReservations(
    client: SupabaseClient,
    locationId: string,
    date?: string,
  ): Promise<{ data: { reservations: Reservation[] } | null; error: any }> {
    const { data, error } = await client.rpc("get_reservations", {
      p_location_id: locationId,
      p_date: date,
    });
    return { data, error };
  }

  static async createReservation(
    client: SupabaseClient,
    params: CreateReservationParams,
  ): Promise<{
    data: { reservation_id: string; confirmation_number: string } | null;
    error: any;
  }> {
    const { data, error } = await client.rpc("create_reservation", params);
    return { data, error };
  }

  static async updateReservation(
    client: SupabaseClient,
    reservationId: string,
    params: CreateReservationParams,
  ): Promise<{ error: any }> {
    const { error: updateError } = await client
      .from("reservations")
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
        is_vip: params.p_is_vip ?? false,
      })
      .eq("id", reservationId);

    if (updateError) return { error: updateError };

    const tableIds = params.p_assigned_table_ids ?? [];
    const { error: tableError } =
      await FloorPlanService.assignReservationTables(
        client,
        reservationId,
        tableIds,
      );

    return { error: tableError };
  }

  static async updateReservationStatus(
    client: SupabaseClient,
    reservationId: string,
    status: string,
  ): Promise<{ error: any }> {
    const { error } = await client.rpc("update_reservation_status", {
      p_reservation_id: reservationId,
      p_status: status,
    });
    return { error };
  }

  static async assignReservationTables(
    client: SupabaseClient,
    reservationId: string,
    tableIds: string[],
  ): Promise<{ error: any }> {
    const { error } = await client.rpc("assign_reservation_tables", {
      p_reservation_id: reservationId,
      p_table_ids: tableIds,
    });
    return { error };
  }

  static async seatReservation(
    client: SupabaseClient,
    reservationId: string,
    tableIds?: string[],
  ): Promise<{
    data: { session_id: string; order_id?: string } | null;
    error: any;
  }> {
    const { data, error } = await client.rpc("seat_reservation", {
      p_reservation_id: reservationId,
      p_table_ids: tableIds,
    });
    return { data, error };
  }

  static async checkTableAvailability(
    client: SupabaseClient,
    params: CheckAvailabilityParams,
  ): Promise<{ data: FloorPlanObject[] | null; error: any }> {
    const { data, error } = await client.rpc(
      "check_table_availability",
      params,
    );
    return { data, error };
  }

  static async getServerSections(
    client: SupabaseClient,
    floorPlanId: string,
  ): Promise<{ data: ServerSection[] | null; error: any }> {
    const { data, error } = await client
      .from("server_sections")
      .select("id, name, color, assigned_staff_id, floor_plan_id")
      .eq("floor_plan_id", floorPlanId)
      .eq("is_active", true);
    return { data, error };
  }

  /**
   * Record actual wait time for a waitlist entry that was just seated.
   * Used for accuracy tracking and improving future estimates.
   */
  static async recordWaitAccuracy(
    client: SupabaseClient,
    waitlistId: string,
    actualWaitMinutes: number,
  ): Promise<{ data: { success: boolean } | null; error: any }> {
    // Update the waitlist entry with actual wait time
    const { data, error } = await client
      .from("waitlist")
      .update({
        actual_wait_minutes: actualWaitMinutes,
        seated_at: new Date().toISOString(),
      })
      .eq("id", waitlistId)
      .select("id");

    const success = !error && Array.isArray(data) && data.length > 0;
    return { data: { success }, error };
  }

  // --- QR TABLE ORDERING ---

  /**
   * Generate/reprint/regenerate the QR code for a table.
   * Server RPC: no regenerate + active code => action 'reprint_existing' (same token);
   * regenerate=true => rotates (token_version bump, old rows deactivated with rotated_at).
   */
  static async generateTableQrCode(
    client: SupabaseClient,
    params: { floorPlanObjectId: string; regenerate?: boolean },
  ): Promise<{ data: TableQrCodeResult | null; error: any }> {
    const { data, error } = await client.rpc("generate_table_qr_code", {
      p_floor_plan_object_id: params.floorPlanObjectId,
      p_regenerate: params.regenerate === true,
    });
    if (error) return { data: null, error };
    const result = data as TableQrCodeResult;
    if (!result?.success) {
      return { data: null, error: { message: result?.error || "QR generation failed" } };
    }
    return { data: result, error: null };
  }

  /** Read the current active QR code row for a table (drives Print vs Reprint / On-Off state). */
  static async getActiveTableQrCode(
    client: SupabaseClient,
    floorPlanObjectId: string,
  ): Promise<{ data: ActiveTableQrCode | null; error: any }> {
    const { data, error } = await client
      .from("table_qr_codes")
      .select("id, token, token_version, is_active, scan_count, last_scanned_at, table_label")
      .eq("floor_plan_object_id", floorPlanObjectId)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return { data: (data as ActiveTableQrCode | null) ?? null, error };
  }

  /**
   * Revoke (turn off) the active QR code for a table.
   * Mirrors the dashboard's revokeTableQrCode: is_active=false + rotated_at.
   * Re-enabling requires generateTableQrCode (new token — printed tent must be reprinted).
   */
  static async revokeTableQrCode(
    client: SupabaseClient,
    floorPlanObjectId: string,
  ): Promise<{ data: { success: boolean } | null; error: any }> {
    const { data: activeCode, error: readError } = await client
      .from("table_qr_codes")
      .select("id")
      .eq("floor_plan_object_id", floorPlanObjectId)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (readError) return { data: null, error: readError };
    if (!activeCode?.id) {
      return { data: null, error: { message: "No active QR code to revoke" } };
    }

    const { error } = await client
      .from("table_qr_codes")
      .update({ is_active: false, rotated_at: new Date().toISOString() })
      .eq("id", activeCode.id);
    if (error) return { data: null, error };
    return { data: { success: true }, error: null };
  }

  /** Read the online store config gate fields needed before printing a QR tent. */
  static async getQrStoreConfig(
    client: SupabaseClient,
    locationId: string,
  ): Promise<{ data: QrStoreConfig | null; error: any }> {
    const { data, error } = await client
      .from("online_store_config")
      .select(
        "id, store_name, slug, custom_domain, is_active, accepts_dine_in, qr_kill_switch",
      )
      .eq("location_id", locationId)
      .maybeSingle();
    return { data: (data as QrStoreConfig | null) ?? null, error };
  }
}

export interface TableQrCodeResult {
  success: boolean;
  error?: string;
  action?: "reprint_existing" | "generated" | "regenerated";
  id?: string;
  merchant_id?: string;
  location_id?: string;
  floor_plan_object_id?: string;
  table_label?: string;
  token?: string;
  token_version?: number;
  is_active?: boolean;
  scan_count?: number;
  last_scanned_at?: string | null;
  created_at?: string;
  section_id?: string | null;
  zone_name?: string | null;
  capacity?: number | null;
}

export interface ActiveTableQrCode {
  id: string;
  token: string;
  token_version: number;
  is_active: boolean;
  scan_count: number;
  last_scanned_at: string | null;
  table_label: string | null;
}

export interface QrStoreConfig {
  id: string;
  store_name: string | null;
  slug: string | null;
  custom_domain: string | null;
  is_active: boolean | null;
  accepts_dine_in: boolean | null;
  qr_kill_switch: boolean | null;
}
