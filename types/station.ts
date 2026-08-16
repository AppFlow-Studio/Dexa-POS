// === STATION VIEW SCOPE (Phase 1 Foundation) ===
// Determines what orders a station can see:
// - 'own': Only orders created by this station
// - 'location': All orders at this location
// - 'online': All online/delivery orders
export type StationViewScope = "own" | "location" | "online";

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
  register_id: string | null;
  auth_key: string | null;
  terminal_type:
    | "dejavoo"
    | "clover"
    | "square"
    | "stripe_terminal"
    | "castles"
    | "valor"
    | "atom";
  terminal_model: string | null;
  is_connected: boolean;
  /** Castles/Valor terminal IP address */
  ip_address?: string;
  /** Castles terminal port (default 8080) / Valor port (default 5000) */
  port?: number;
  /** Valor cancel-before-card port (default 5001) */
  cancel_port?: number;
  /** Valor EPI (merchant/device identifier) */
  epi?: string;
  /** Hardware serial number printed on the device */
  serial_number?: string | null;
  /** Terminal firmware / app version (Castles infAppVersion, Valor APP_VERSION) */
  firmware_version?: string | null;
  last_connection_status:
    | "Online"
    | "Offline"
    | "NotFound"
    | "IdentityMismatch"
    | null;
  last_connection_test_at: string | null;
  consecutive_failures?: number;
  health_check_interval?: number;
  connection_type?: "cloud" | "local" | "local_socket" | "usb";
  /**
   * Auto-batch settlement config (Castles). Projected from payment_terminals by
   * get_location_stations_with_status. Undefined on un-migrated environments —
   * treat undefined as OFF (the auto-settle scheduler fails safe).
   */
  auto_settle?: boolean | null;
  /** Wall-clock time-of-day ("HH:MM[:SS]") the daily auto-batch fires, in the location timezone. */
  settle_time?: string | null;
}

// Station as returned from get_location_stations_with_status RPC
export interface Station {
  id: string;
  station_name: string;
  station_type:
    | "register"
    | "terminal"
    | "self_service"
    | "kiosk"
    | "mobile"
    | "kds";
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

  // The printer this station currently claims as its receipt printer.
  // Soft sharing: multiple stations may point at the same printer. Source of
  // truth lives in the stations row (was MMKV-only previously).
  current_receipt_printer_id?: string | null;

  // Payment terminal linked to this station (non-sensitive metadata only)
  payment_terminal?: StationPaymentTerminal | null;

  // Kiosk profile linked to this (self_service) station. Drives the kiosk
  // appearance/behavior config — see hooks/kiosk/useKioskProfile.ts.
  kiosk_profile_id?: string | null;
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
  // The printer this station currently claims as its receipt printer. Hydrated
  // from the stations row on boot; mutated via usePrinterStore.setStationReceiptPrinter.
  current_receipt_printer_id?: string | null;
  // Payment terminal linked to this station (safe to persist - non-sensitive metadata only)
  payment_terminal?: StationPaymentTerminal | null;
  // Kiosk profile linked to this (self_service) station — drives kiosk config.
  kiosk_profile_id?: string | null;
}

// Response from pos_staff_login RPC
export interface PosStaffLoginResponse {
  success: boolean;
  error?: string;
  error_code?:
    | "INVALID_PIN"
    | "STATION_NOT_FOUND"
    | "STATION_IN_USE"
    | "SUBSCRIPTION_SUSPENDED"
    | "BILLING_SUSPENDED"
    | "PAYMENT_REQUIRED"
    | "STATION_QUOTA_EXCEEDED"
    | "STATION_LIMIT_REACHED"
    | "LOCKOUT_5MIN"
    | "LOCKOUT_30MIN";
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
    /** Session ID that was kicked, used so clients ignore stale/self kick broadcasts */
    kicked_session_id?: string | null;
  };
  current_session?: StationCurrentSession;
  shift?: Record<string, unknown>;
}

// === STATION DEVICE TYPES ===
export type StationDeviceType =
  | "payment_terminal"
  | "receipt_printer"
  | "label_printer"
  | "kitchen_printer"
  | "cash_drawer"
  | "barcode_scanner"
  | "scale"
  | "customer_display"
  | "pos_device";

// === DEVICE LOGIN HISTORY ===
// Audit trail of all POS device logins/logouts
export interface DeviceLoginHistory {
  id: string;
  station_id: string;
  merchant_id: string;
  location_id: string;
  session_id: string | null;
  device_id: string;
  device_name: string | null;
  device_model: string | null;
  staff_id: string | null;
  staff_name: string | null;
  app_version: string | null;
  os_version: string | null;
  ip_address: string | null;
  logged_in_at: string;
  logged_out_at: string | null;
  logout_reason: "logout" | "kicked" | "ended" | "expired" | null;
  created_at: string;
}

// Response from pos_staff_logout RPC
export interface PosStaffLogoutResponse {
  success: boolean;
  error?: string;
  clocked_out: boolean;
  clock_result?: Record<string, unknown>;
}
