/**
 * RPC types for table session operations.
 *
 * Matches the updated `seat_guests_v3` SQL function signature which accepts
 * separate staff IDs (POS logged-in staff vs assigned server) plus device
 * and station context.
 */

// ---------------------------------------------------------------------------
// seat_guests_v3
// ---------------------------------------------------------------------------

export interface SeatGuestsParams {
  p_table_id: string;
  p_merchant_id: string;
  p_staff_id?: string | null;
  p_server_staff_id?: string | null;
  p_party_size?: number;
  p_create_order?: boolean;
  p_guest_name?: string | null;
  p_guest_phone?: string | null;
  p_reservation_id?: string | null;
  p_waitlist_id?: string | null;
  p_device_id?: string | null;
  p_station_id?: string | null;
}

export interface SeatGuestsResponse {
  success: boolean;
  error?: string;
  session_id?: string;
  order_id?: string;
  order_number?: string;
  display_number?: string;
  session_number?: string;
  table_name?: string;
  status?: string;
}

// ---------------------------------------------------------------------------
// get_location_table_status_v2
// ---------------------------------------------------------------------------

export interface LocationTableStatusParams {
  p_location_id: string;
}

export interface LocationTableStatusRow {
  table_id: string;
  table_name: string;
  table_capacity: number;
  table_category: string;
  section_id: string | null;
  session_id: string | null;
  session_status: string | null;
  order_id: string | null;
  party_size: number | null;
  server_staff_id: string | null;
  guest_name: string | null;
  guest_phone: string | null;
  reservation_id: string | null;
  waitlist_id: string | null;
  session_number: string | null;
  seated_at: string | null;
  is_vip: boolean | null;
  needs_attention: boolean | null;
  current_course: number | null;
  first_order_at: string | null;
  food_served_at: string | null;
}
