// === STATION VIEW SCOPE (Phase 1 Foundation) ===
// Determines what orders a station can see:
// - 'own': Only orders created by this station
// - 'location': All orders at this location
// - 'online': All online/delivery orders
export type StationViewScope = 'own' | 'location' | 'online';

// === STATION CAPABILITIES (Phase 1 Foundation) ===
// Defines what actions a station can perform
export interface StationCapabilities {
  can_create_orders: boolean;
  can_process_payments: boolean;
  can_void_orders: boolean;
  can_apply_discounts: boolean;
  can_update_kitchen_status: boolean;
}

// === PAYMENT TERMINAL (Non-sensitive metadata only) ===
// Payment terminal linked to a station
// NOTE: auth_key is NEVER included here - fetched separately when needed
export interface StationPaymentTerminal {
  id: string;
  terminal_name: string;
  tpn: string;
  register_id: string | null;
  auth_key: string | null;
  terminal_type: 'dejavoo' | 'clover' | 'square' | 'stripe_terminal';
  terminal_model: string | null;
  is_connected: boolean;
  last_connection_status: 'Online' | 'Offline' | 'NotFound' | null;
  last_connection_test_at: string | null;
  consecutive_failures?: number;
  health_check_interval?: number;
  connection_type?: 'cloud' | 'local';
}

// Station as returned from get_location_stations_with_status RPC
export interface Station {
  id: string;
  station_name: string;
  station_type: "register" | "terminal" | "kiosk" | "mobile" | "kds";
  station_number: number;
  is_active: boolean;
  is_available: boolean;
  current_session: StationCurrentSession | null;

  // === EXTENDED FIELDS (Phase 1 Foundation) ===
  // Optional for backward compatibility with existing RPC responses
  view_scope?: StationViewScope;
  can_create_orders?: boolean;
  can_process_payments?: boolean;
  can_void_orders?: boolean;
  can_apply_discounts?: boolean;
  can_update_kitchen_status?: boolean;
  is_online?: boolean;
  last_heartbeat_at?: string | null;

  // Device hardware fields
  hardware_model?: string | null;
  device_manufacturer?: string | null;
  device_model?: string | null;
  network_type?: string | null;
  battery_level?: number | null;
  has_builtin_printer?: boolean | null;
  has_builtin_cfd?: boolean | null;
  has_cash_drawer_port?: boolean | null;
  has_nfc?: boolean | null;
  app_version?: string | null;
  os_version?: string | null;

  // Payment terminal linked to this station (non-sensitive metadata only)
  payment_terminal?: StationPaymentTerminal | null;
}

export interface StationCurrentSession {
  session_id: string;
  device_name: string | null;
  staff_name: string;
  started_at: string;
}

// Selected station to persist in store
// Extended in Phase 1 to include view_scope and capabilities
export interface SelectedStation {
  id: string;
  station_name: string;
  station_type: string;
  station_number: number;
  // Phase 1 Foundation: view_scope and capabilities for station-based order management
  view_scope?: StationViewScope;
  can_create_orders?: boolean;
  can_process_payments?: boolean;
  can_void_orders?: boolean;
  can_apply_discounts?: boolean;
  can_update_kitchen_status?: boolean;
  // Payment terminal linked to this station (safe to persist - non-sensitive metadata only)
  payment_terminal?: StationPaymentTerminal | null;
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
    /** Device ID of the session that was kicked (only set when kicked_previous is true) */
    kicked_device_id?: string | null;
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
