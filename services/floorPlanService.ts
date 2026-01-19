import {
  AddFloorPlanObjectParams,
  AddToWaitlistParams,
  BatchUpdateObjectParams,
  CheckAvailabilityParams,
  CreateFloorPlanParams,
  CreateReservationParams,
  FloorPlan,
  FloorPlanObject,
  MergeTableParams,
  Reservation,
  SeatGuestsParams,
  TransferTableSessionParams,
  UpdateFloorPlanObjectPositionParams,
  UpdateTableSessionStatusParams,
  WaitlistEntry,
} from "@/types/db-floor-plan-types";
import { SupabaseClient } from "@supabase/supabase-js";

export class FloorPlanService {
  // --- FLOOR PLAN OPERATIONS ---

  static async getLocationFloorPlans(
    client: SupabaseClient,
    locationId: string
  ): Promise<{ data: FloorPlan[] | null; error: any }> {
    const { data, error } = await client.rpc("get_location_floor_plans", {
      p_location_id: locationId,
    });
    // console.log("[FloorPlanService] getLocationFloorPlans", data, error);
    return { data, error };
  }

  static async createFloorPlan(
    client: SupabaseClient,
    params: CreateFloorPlanParams
  ): Promise<{ data: { floor_plan_id: string } | null; error: any }> {
    const { data, error } = await client.rpc("create_floor_plan", params);
    return { data, error };
  }

  static async updateFloorPlan(
    client: SupabaseClient,
    floorPlanId: string,
    updates: Partial<FloorPlan>
  ): Promise<{ error: any }> {
    const { error } = await client
      .from("floor_plans")
      .update(updates)
      .eq("id", floorPlanId);
    return { error };
  }

  static async deleteFloorPlan(
    client: SupabaseClient,
    floorPlanId: string
  ): Promise<{ error: any }> {
    const { error } = await client
      .from("floor_plans")
      .delete()
      .eq("id", floorPlanId);
    return { error };
  }

  static async getFloorPlanStatus(
    client: SupabaseClient,
    floorPlanId: string
  ): Promise<{
    data: { tables: FloorPlanObject[] } | null;
    error: any;
  }> {
    const { data, error } = await client.rpc("get_floor_plan_status", {
      p_floor_plan_id: floorPlanId,
    });
    return { data, error };
  }

  // --- OBJECT OPERATIONS ---

  static async addFloorPlanObject(
    client: SupabaseClient,
    params: AddFloorPlanObjectParams
  ): Promise<{ data: { object_id: string } | null; error: any }> {
    const { data, error } = await client.rpc("add_floor_plan_object", params);
    return { data, error };
  }

  static async updateFloorPlanObject(
    client: SupabaseClient,
    objectId: string,
    updates: Partial<FloorPlanObject>
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
    params: UpdateFloorPlanObjectPositionParams
  ): Promise<{ error: any }> {
    const { error } = await client.rpc(
      "update_floor_plan_object_position",
      params
    );
    return { error };
  }

  static async updateFloorPlanObjectsBatch(
    client: SupabaseClient,
    params: BatchUpdateObjectParams
  ): Promise<{ error: any }> {
    const { error } = await client.rpc(
      "update_floor_plan_objects_batch",
      params
    );
    return { error };
  }

  static async deleteFloorPlanObject(
    client: SupabaseClient,
    objectId: string
  ): Promise<{ error: any }> {
    const { error } = await client
      .from("floor_plan_objects")
      .delete()
      .eq("id", objectId);
    return { error };
  }

  // --- SESSION OPERATIONS ---

  static async seatGuests(
    client: SupabaseClient,
    params: SeatGuestsParams
  ): Promise<{
    data: { session_id: string; order_id?: string } | null;
    error: any;
  }> {
    const { data, error } = await client.rpc("seat_guests_v2", params);
    return { data, error };
  }

  static async updateTableSessionStatus(
    client: SupabaseClient,
    params: UpdateTableSessionStatusParams
  ): Promise<{ error: any }> {
    const { data, error } = await client.rpc(
      "update_table_session_status",
      params
    );
    console.log("updateTableSessionStatus", data, error);

    return { error };
  }

  static async transferTableSession(
    client: SupabaseClient,
    params: TransferTableSessionParams
  ): Promise<{ error: any }> {
    const { error } = await client.rpc("transfer_table_session", params);
    return { error };
  }

  static async mergeTableToSession(
    client: SupabaseClient,
    params: MergeTableParams
  ): Promise<{ error: any }> {
    const { error } = await client.rpc("merge_table_to_session", params);
    return { error };
  }

  static async unmergeTableFromSession(
    client: SupabaseClient,
    params: MergeTableParams
  ): Promise<{ error: any }> {
    const { error } = await client.rpc("unmerge_table_from_session", params);
    return { error };
  }

  static async advanceCourse(
    client: SupabaseClient,
    sessionId: string,
    staffId?: string
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
    locationId: string
  ): Promise<{ data: { waitlist: WaitlistEntry[] } | null; error: any }> {
    const { data, error } = await client.rpc("get_waitlist", {
      p_location_id: locationId,
    });
    return { data, error };
  }

  static async addToWaitlist(
    client: SupabaseClient,
    params: AddToWaitlistParams
  ): Promise<{
    data: {
      waitlist_id: string;
      position: number;
      quoted_wait_minutes: number;
    } | null;
    error: any;
  }> {
    const { data, error } = await client.rpc("add_to_waitlist", params);
    return { data, error };
  }

  static async notifyWaitlistParty(
    client: SupabaseClient,
    waitlistId: string
  ): Promise<{
    data: { phone: string; message_template: string } | null;
    error: any;
  }> {
    const { data, error } = await client.rpc("notify_waitlist_party", {
      p_waitlist_id: waitlistId,
    });
    return { data, error };
  }

  static async updateWaitlistStatus(
    client: SupabaseClient,
    waitlistId: string,
    status: string
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
    tableIds: string[]
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
    date?: string
  ): Promise<{ data: { reservations: Reservation[] } | null; error: any }> {
    const { data, error } = await client.rpc("get_reservations", {
      p_location_id: locationId,
      p_date: date,
    });
    return { data, error };
  }

  static async createReservation(
    client: SupabaseClient,
    params: CreateReservationParams
  ): Promise<{
    data: { reservation_id: string; confirmation_number: string } | null;
    error: any;
  }> {
    const { data, error } = await client.rpc("create_reservation", params);
    return { data, error };
  }

  static async updateReservationStatus(
    client: SupabaseClient,
    reservationId: string,
    status: string
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
    tableIds: string[]
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
    tableIds?: string[]
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
    params: CheckAvailabilityParams
  ): Promise<{ data: FloorPlanObject[] | null; error: any }> {
    const { data, error } = await client.rpc(
      "check_table_availability",
      params
    );
    return { data, error };
  }
}
