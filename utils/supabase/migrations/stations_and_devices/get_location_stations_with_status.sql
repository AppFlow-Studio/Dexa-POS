-- Reference definition (authoritative migration lives in the website repo:
-- dexapos-website/supabase/migrations/20260722140000_fix_station_terminal_resolution_valor.sql).
-- Kept in sync here for POS-side visibility only.
--
-- Resolves the station's payment terminal directly from
-- payment_terminals.station_id + is_active (the station_devices link table is
-- never written by the client), returns JSON (not JSONB — matches deployed
-- signature), preserves current_receipt_printer_id / kiosk_profile_id, and
-- casts ip_address to text (valor_/local_ip_address have mismatched inet/text
-- types that a bare COALESCE rejects).

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
        s.kiosk_profile_id,
        -- Payment terminal data (non-sensitive metadata only).
        -- Resolved DIRECTLY from payment_terminals.station_id + is_active — the
        -- same source of truth the client uses (loadTerminals / register /
        -- switch). The old station_devices join is dead: the client never
        -- writes that link table, so it resolved to null (or a stale device)
        -- for every station. LEFT JOIN LATERAL ... LIMIT 1 keeps this
        -- deterministic even if a station briefly has >1 active terminal row.
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
          -- Valor stores its network config in valor_* columns; everything else
          -- uses local_*. Fall back to local_* so a Valor row that only wrote
          -- local_ip_address still resolves.
          'ip_address', CASE WHEN pt.terminal_type = 'valor'
                             THEN COALESCE(pt.valor_ip_address::text, pt.local_ip_address::text)
                             ELSE pt.local_ip_address::text END,
          'port', CASE WHEN pt.terminal_type = 'valor'
                       THEN COALESCE(pt.valor_port, pt.local_port)
                       ELSE pt.local_port END,
          'cancel_port', pt.valor_cancel_port,
          'epi', pt.valor_epi,
          'connection_type', pt.connection_type
        ) ELSE null END as payment_terminal
      FROM stations s
      LEFT JOIN station_sessions ss
        ON s.id = ss.station_id
        AND ss.session_status = 'active'
      LEFT JOIN LATERAL (
        SELECT p.*
        FROM payment_terminals p
        WHERE p.station_id = s.id
          AND p.is_active = TRUE
        ORDER BY p.updated_at DESC NULLS LAST, p.created_at DESC
        LIMIT 1
      ) pt ON TRUE
      WHERE s.location_id = p_location_id
        AND s.is_active = TRUE
    ) station_data
  );
END;
$$;
