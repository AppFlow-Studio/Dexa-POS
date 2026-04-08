-- ============================================================
-- Terminal Health Monitoring Migration
-- Adds health monitoring columns and RPC to payment_terminals
-- ============================================================

-- Add health monitoring columns to payment_terminals
ALTER TABLE payment_terminals ADD COLUMN IF NOT EXISTS firmware_version TEXT;
ALTER TABLE payment_terminals ADD COLUMN IF NOT EXISTS battery_level INTEGER;
ALTER TABLE payment_terminals ADD COLUMN IF NOT EXISTS last_batch_at TIMESTAMPTZ;
ALTER TABLE payment_terminals ADD COLUMN IF NOT EXISTS open_batch_count INTEGER DEFAULT 0;
ALTER TABLE payment_terminals ADD COLUMN IF NOT EXISTS consecutive_failures INTEGER DEFAULT 0;
ALTER TABLE payment_terminals ADD COLUMN IF NOT EXISTS last_error_message TEXT;
ALTER TABLE payment_terminals ADD COLUMN IF NOT EXISTS health_check_interval INTEGER DEFAULT 300;

-- ============================================================
-- update_terminal_health RPC
-- Extends existing update_terminal_status with health fields
-- ============================================================
CREATE OR REPLACE FUNCTION update_terminal_health(
  p_terminal_id UUID,
  p_is_connected BOOLEAN,
  p_status TEXT DEFAULT NULL,
  p_firmware_version TEXT DEFAULT NULL,
  p_battery_level INTEGER DEFAULT NULL,
  p_consecutive_failures INTEGER DEFAULT NULL,
  p_last_error_message TEXT DEFAULT NULL
) RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSON;
BEGIN
  UPDATE payment_terminals
  SET
    is_connected = p_is_connected,
    last_connection_test_at = NOW(),
    last_connection_status = COALESCE(p_status, last_connection_status),
    firmware_version = COALESCE(p_firmware_version, firmware_version),
    battery_level = COALESCE(p_battery_level, battery_level),
    consecutive_failures = COALESCE(p_consecutive_failures, consecutive_failures),
    last_error_message = CASE
      WHEN p_is_connected = TRUE THEN NULL
      ELSE COALESCE(p_last_error_message, last_error_message)
    END,
    updated_at = NOW()
  WHERE id = p_terminal_id;

  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', FALSE,
      'error', 'Terminal not found'
    );
  END IF;

  SELECT json_build_object(
    'success', TRUE,
    'terminal_id', id,
    'is_connected', is_connected,
    'consecutive_failures', consecutive_failures,
    'last_connection_status', last_connection_status
  ) INTO v_result
  FROM payment_terminals
  WHERE id = p_terminal_id;

  RETURN v_result;
END;
$$;
