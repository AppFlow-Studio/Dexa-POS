export type TableStatus =
  | "available"
  | "reserved"
  | "seated"
  | "ordered"
  | "served"
  | "check_presented"
  | "paid"
  | "cleaning"
  | "blocked"
  | "not_in_service";

export type ObjectCategory =
  | "table"
  | "booth"
  | "functional"
  | "structure"
  | "decor"
  | "zone";

export interface FloorPlan {
  id: string;
  name: string;
  description?: string;
  canvas_width: number;
  canvas_height: number;
  grid_size: number;
  background_color: string;
  is_active: boolean;
  is_default: boolean;
  table_count?: number;
  total_capacity?: number;
}

export interface FloorPlanObject {
  id: string;
  floor_plan_id: string;
  name: string;
  shape_id: string;
  category: ObjectCategory;
  x: number;
  y: number;
  rotation: number;
  width?: number;
  height?: number;
  capacity?: number;
  min_capacity?: number;
  is_reservable?: boolean;
  is_combinable?: boolean;
  default_turn_time?: number;
  section_id?: string;
  zone_name?: string;
  label_override?: string;
  color_override?: string;
  z_index: number;
  is_visible: boolean;
  is_active: boolean;
  // Join fields
  session?: TableSession | null;
  next_reservation?: {
    id: string;
    party_name: string;
    party_size: number;
    time: string;
    status: string;
  } | null;
}

export interface TableSession {
  id: string;
  session_number: string;
  status: TableStatus;
  party_size: number;
  guest_name?: string;
  guest_phone?: string;
  guest_notes?: string;
  order_id?: string;
  server_staff_id?: string;
  seated_at: string;
  current_course: number;
  needs_attention: boolean;
  is_vip: boolean;
  minutes_seated?: number;
  merged_tables?: string[];
}

export interface WaitlistEntry {
  id: string;
  location_id: string;
  party_name: string;
  party_size: number;
  phone?: string;
  status:
    | "waiting"
    | "notified"
    | "arrived"
    | "seated"
    | "no_show"
    | "cancelled"
    | "expired";
  position: number;
  quoted_wait_minutes: number;
  estimated_ready_at?: string;
  actual_wait_minutes?: number;
  preferred_section?: string;
  seating_preference?: string;
  notes?: string;
  created_at: string;
  notified_at?: string;
  minutes_waiting?: number;
}

export interface Reservation {
  id: string;
  location_id: string;
  confirmation_number: string;
  party_name: string;
  party_size: number;
  phone: string;
  email?: string;
  reservation_time: string;
  duration_minutes: number;
  end_time?: string;
  status:
    | "pending"
    | "confirmed"
    | "reminded"
    | "arrived"
    | "seated"
    | "completed"
    | "no_show"
    | "cancelled";
  assigned_table_ids?: string[];
  assigned_tables?: string[];
  preferred_section?: string;
  seating_preference?: string;
  notes?: string;
  special_requests?: string;
  is_vip: boolean;
  source: string;
}

// RPC Parameters

export interface CreateFloorPlanParams {
  p_location_id: string;
  p_name: string;
  p_description?: string;
}

export interface AddFloorPlanObjectParams {
  p_floor_plan_id: string;
  p_name: string;
  p_shape_id: string;
  p_category: ObjectCategory;
  p_x: number;
  p_y: number;
  p_rotation: number;
  p_capacity?: number;
  p_width?: number;
  p_height?: number;
}

export interface UpdateFloorPlanObjectPositionParams {
  p_object_id: string;
  p_x: number;
  p_y: number;
  p_rotation?: number;
}

export interface BatchUpdateObjectParams {
  p_updates: {
    id: string;
    x: number;
    y: number;
    rotation?: number;
  }[];
}

export interface SeatGuestsParams {
  p_table_ids: string[];
  p_party_size: number;
  p_guest_name?: string;
  p_guest_phone?: string;
  p_guest_notes?: string;
  p_reservation_id?: string;
  p_waitlist_id?: string;
  p_create_order?: boolean;
  p_staff_id?: string;
}

export interface UpdateTableSessionStatusParams {
  p_session_id: string;
  p_status: TableStatus;
  p_notes?: string;
  p_staff_id?: string;
}

export interface TransferTableSessionParams {
  p_session_id: string;
  p_new_table_ids: string[];
}

export interface MergeTableParams {
  p_session_id: string;
  p_table_id: string;
}

export interface AddToWaitlistParams {
  p_location_id: string;
  p_party_name: string;
  p_party_size: number;
  p_phone?: string;
  p_notes?: string;
  p_preferred_section?: string;
  p_quoted_wait_minutes?: number;
}

export interface CreateReservationParams {
  p_location_id: string;
  p_party_name: string;
  p_party_size: number;
  p_phone: string;
  p_date: string;
  p_time: string;
  p_email?: string;
  p_notes?: string;
  p_special_requests?: string;
  p_is_vip?: boolean;
}

export interface CheckAvailabilityParams {
  p_location_id: string;
  p_date: string;
  p_time: string;
  p_party_size: number;
}
