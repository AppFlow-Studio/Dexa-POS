-- Adds current_receipt_printer_id to the get_location_stations_with_status
-- payload so the Printers screen can render "Used by N other stations" chips
-- and the "Your Station's Receipt Printer" card without an extra query.
--
-- Replaces the function in-place. All other returned columns are preserved
-- (matches utils/supabase/migrations/stations_and_devices/get_location_stations_with_status.sql).

CREATE OR REPLACE FUNCTION get_location_stations_with_status(
  p_location_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  RETURN (
    SELECT COALESCE(json_agg(station_data ORDER BY station_number, station_name), '[]'::json)
    FROM (
      SELECT
        s.id,
        s.station_name,
        s.station_type,
        s.station_number,
        s.is_active,
        ss.id IS NULL as is_available,
        CASE WHEN ss.id IS NOT NULL THEN json_build_object(
          'session_id', ss.id,
          'device_name', ss.device_name,
          'staff_name', ss.staff_name,
          'started_at', ss.started_at
        ) ELSE null END as current_session,
        s.view_scope,
        s.can_create_orders,
        s.can_process_payments,
        s.can_void_orders,
        s.can_apply_discounts,
        s.can_update_kitchen_status,
        s.is_online,
        s.last_heartbeat_at,
        s.hardware_model,
        s.device_manufacturer,
        s.device_model,
        s.network_type,
        s.battery_level,
        s.has_builtin_printer,
        s.has_builtin_cfd,
        s.has_cash_drawer_port,
        s.has_nfc,
        s.app_version,
        s.os_version,
        s.current_receipt_printer_id,
        CASE WHEN pt.id IS NOT NULL THEN json_build_object(
          'id', pt.id,
          'terminal_name', pt.terminal_name,
          'tpn', pt.tpn,
          'register_id', pt.register_id,
          'terminal_type', pt.terminal_type,
          'terminal_model', pt.terminal_model,
          'is_connected', pt.is_connected,
          'last_connection_status', pt.last_connection_status,
          'last_connection_test_at', pt.last_connection_test_at,
          'ip_address', pt.local_ip_address,
          'port', pt.local_port,
          'connection_type', pt.connection_type
        ) ELSE null END as payment_terminal
      FROM stations s
      LEFT JOIN station_sessions ss
        ON s.id = ss.station_id
        AND ss.session_status = 'active'
      LEFT JOIN station_devices sd
        ON s.id = sd.station_id
        AND sd.device_type = 'payment_terminal'
        AND sd.is_active = TRUE
      LEFT JOIN payment_terminals pt
        ON sd.payment_terminal_id = pt.id
        AND pt.is_active = TRUE
      WHERE s.location_id = p_location_id
        AND s.is_active = TRUE
    ) station_data
  );
END;
$$;
