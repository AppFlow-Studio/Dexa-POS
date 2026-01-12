// Station as returned from get_location_stations_with_status RPC
export interface Station {
  id: string;
  station_name: string;
  station_type: "register" | "terminal" | "kiosk" | "mobile";
  station_number: number;
  is_active: boolean;
  is_available: boolean;
  current_session: StationCurrentSession | null;
}

export interface StationCurrentSession {
  session_id: string;
  device_name: string | null;
  staff_name: string;
  started_at: string;
}

// Selected station to persist in store
export interface SelectedStation {
  id: string;
  station_name: string;
  station_type: string;
  station_number: number;
}

// Response from pos_staff_login RPC
export interface PosStaffLoginResponse {
  success: boolean;
  error?: string;
  error_code?: "INVALID_PIN" | "STATION_NOT_FOUND" | "STATION_IN_USE";
  staff?: {
    staff_profile_id: string;
    first_name: string;
    last_name: string;
    display_name: string;
    role_code: string;
  };
  session?: {
    session_id: string;
    station_id: string;
    station_name: string;
    station_type: string;
    is_reconnect: boolean;
    kicked_previous: boolean;
  };
  current_session?: StationCurrentSession;
  shift?: Record<string, unknown>;
}

// Response from pos_staff_logout RPC
export interface PosStaffLogoutResponse {
  success: boolean;
  error?: string;
  clocked_out: boolean;
  clock_result?: Record<string, unknown>;
}
