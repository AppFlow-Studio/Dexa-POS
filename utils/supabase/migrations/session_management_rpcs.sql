-- ============================================================
-- MIGRATION 9: Combined POS Login V2 (Station + Clock In)
-- Single call: Claim station → Verify PIN → Clock in
-- V2 adds: ip_address, app_version, os_version, hardware_model
-- and returns kicked_device_id for broadcast kick support
-- ============================================================

CREATE OR REPLACE FUNCTION pos_staff_login_v2(
  p_location_id UUID,
  p_pin_code TEXT,
  p_station_id UUID,
  p_device_id TEXT,
  p_device_name TEXT DEFAULT NULL,
  p_auto_clock_in BOOLEAN DEFAULT TRUE,
  p_force_takeover BOOLEAN DEFAULT FALSE,
  p_ip_address TEXT DEFAULT NULL,
  p_app_version TEXT DEFAULT NULL,
  p_os_version TEXT DEFAULT NULL,
  p_hardware_model TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_staff RECORD;
  v_station RECORD;
  v_existing_session RECORD;
  v_session_id UUID;
  v_shift_result JSON;
  v_was_kicked BOOLEAN := FALSE;
  v_is_reconnect BOOLEAN := FALSE;
  v_ip_address INET;
BEGIN
  -- ========================================
  -- STEP 1: VERIFY PIN
  -- ========================================
  IF p_ip_address IS NOT NULL AND p_ip_address <> '' THEN
    v_ip_address := p_ip_address::INET;
  ELSE
    v_ip_address := NULL;
  END IF;

  SELECT
    sp.id as staff_profile_id,
    sp.first_name,
    sp.last_name,
    lm.role_code,
    lm.hourly_rate,
    lm.merchant_id,
    lm.id as location_member_id,
    lm.pin_plain
  INTO v_staff
  FROM location_members lm
  JOIN staff_profiles sp ON sp.id = lm.staff_profile_id
  WHERE lm.location_id = p_location_id
    AND lm.is_active = true
    AND (
        -- Fast path: plain-text PIN match
        (lm.pin_plain IS NOT NULL AND lm.pin_plain = p_pin_code)
        OR
        -- Bcrypt fallback: un-migrated employees only
        (lm.pin_plain IS NULL AND lm.pin_code IS NOT NULL
         AND replace(lm.pin_code, '$2b$', '$2a$') = crypt(p_pin_code, replace(lm.pin_code, '$2b$', '$2a$')))
    );

  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Invalid PIN',
      'error_code', 'INVALID_PIN'
    );
  END IF;

  -- Auto-migrate: populate pin_plain on first successful bcrypt login
  IF v_staff.pin_plain IS NULL THEN
    UPDATE location_members SET pin_plain = p_pin_code WHERE id = v_staff.location_member_id;
  END IF;

  -- ========================================
  -- STEP 2: CLAIM STATION
  -- ========================================
  
  SELECT s.*, l.merchant_id 
  INTO v_station
  FROM stations s
  JOIN locations l ON l.id = s.location_id
  WHERE s.id = p_station_id AND s.is_active = TRUE;
  
  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Station not found',
      'error_code', 'STATION_NOT_FOUND'
    );
  END IF;
  
  -- End any session this device has at OTHER stations
  UPDATE station_sessions
  SET session_status = 'ended', ended_at = NOW()
  WHERE device_id = p_device_id
    AND session_status = 'active'
    AND station_id != p_station_id;
  
  -- Check for existing session at this station
  SELECT * INTO v_existing_session
  FROM station_sessions
  WHERE station_id = p_station_id
    AND session_status = 'active'
  FOR UPDATE;
  
  IF FOUND THEN
    IF v_existing_session.device_id = p_device_id THEN
      -- Same device reconnecting
      UPDATE station_sessions
      SET 
        staff_profile_id = v_staff.staff_profile_id,
        staff_name = v_staff.first_name || ' ' || LEFT(v_staff.last_name, 1) || '.',
        ip_address = COALESCE(v_ip_address, ip_address::INET),
        app_version = COALESCE(NULLIF(p_app_version, ''), app_version),
        os_version = COALESCE(NULLIF(p_os_version, ''), os_version),
        hardware_model = COALESCE(NULLIF(p_hardware_model, ''), hardware_model)
      WHERE id = v_existing_session.id;
      
      v_session_id := v_existing_session.id;
      v_is_reconnect := TRUE;
    ELSE
      -- Different device
      IF NOT p_force_takeover THEN
        RETURN json_build_object(
          'success', false,
          'error', 'Station in use',
          'error_code', 'STATION_IN_USE',
          'staff', json_build_object(
            'staff_profile_id', v_staff.staff_profile_id,
            'display_name', v_staff.first_name || ' ' || LEFT(v_staff.last_name, 1) || '.'
          ),
          'current_session', json_build_object(
            'device_name', v_existing_session.device_name,
            'staff_name', v_existing_session.staff_name,
            'started_at', v_existing_session.started_at
          )
        );
      END IF;
      
      -- Kick existing session
      UPDATE station_sessions
      SET 
        session_status = 'kicked',
        ended_at = NOW(),
        kicked_by_device_id = p_device_id,
        kicked_by_staff_name = v_staff.first_name || ' ' || LEFT(v_staff.last_name, 1) || '.',
        kick_reason = 'Taken over'
      WHERE id = v_existing_session.id;
      
      INSERT INTO session_kick_notifications (session_id, device_id, kicked_by_staff_name, kick_reason)
      VALUES (v_existing_session.id, v_existing_session.device_id, 
              v_staff.first_name || ' ' || LEFT(v_staff.last_name, 1) || '.', 'Taken over');
      
      v_was_kicked := TRUE;
    END IF;
  END IF;
  
  -- Create new session if not reconnecting
  IF v_session_id IS NULL THEN
    INSERT INTO station_sessions (
      station_id, merchant_id, location_id,
      device_id, device_name,
      staff_profile_id, staff_name,
      session_status,
      ip_address, app_version, os_version, hardware_model
    ) VALUES (
      p_station_id, v_station.merchant_id, v_station.location_id,
      p_device_id, p_device_name,
      v_staff.staff_profile_id, 
      v_staff.first_name || ' ' || LEFT(v_staff.last_name, 1) || '.',
      'active',
      v_ip_address,
      NULLIF(p_app_version, ''),
      NULLIF(p_os_version, ''),
      NULLIF(p_hardware_model, '')
    )
    RETURNING id INTO v_session_id;
    
    -- Update station with device info
    UPDATE stations SET 
      device_id = p_device_id, 
      device_name = p_device_name, 
      is_online = TRUE,
      ip_address = v_ip_address,
      app_version = NULLIF(p_app_version, ''),
      os_version = NULLIF(p_os_version, ''),
      hardware_model = NULLIF(p_hardware_model, '')
    WHERE id = p_station_id;
  END IF;

  -- ========================================
  -- LOG DEVICE CONNECTION (UPSERT)
  -- ========================================
  INSERT INTO station_devices (
    station_id, merchant_id, location_id,
    device_type, device_name, device_model,
    connection_type, device_id, staff_id, staff_name,
    app_version, os_version, ip_address, session_id,
    is_connected, last_seen_at
  ) VALUES (
    p_station_id, v_station.merchant_id, v_station.location_id,
    'pos_device', p_device_name, NULLIF(p_hardware_model, ''),
    'integrated', p_device_id, v_staff.staff_profile_id,
    v_staff.first_name || ' ' || LEFT(v_staff.last_name, 1) || '.',
    NULLIF(p_app_version, ''), NULLIF(p_os_version, ''),
    v_ip_address, v_session_id,
    TRUE, NOW()
  )
  ON CONFLICT (station_id, device_id) WHERE device_type = 'pos_device'
  DO UPDATE SET
    device_name = EXCLUDED.device_name,
    device_model = EXCLUDED.device_model,
    staff_id = EXCLUDED.staff_id,
    staff_name = EXCLUDED.staff_name,
    app_version = EXCLUDED.app_version,
    os_version = EXCLUDED.os_version,
    ip_address = EXCLUDED.ip_address,
    session_id = EXCLUDED.session_id,
    is_connected = TRUE,
    last_seen_at = NOW(),
    updated_at = NOW();

  -- Audit trail: record login in device_login_history
  INSERT INTO device_login_history (
    station_id, merchant_id, location_id, session_id,
    device_id, device_name, device_model,
    staff_id, staff_name,
    app_version, os_version, ip_address,
    logged_in_at
  ) VALUES (
    p_station_id, v_station.merchant_id, v_station.location_id, v_session_id,
    p_device_id, p_device_name, NULLIF(p_hardware_model, ''),
    v_staff.staff_profile_id,
    v_staff.first_name || ' ' || LEFT(v_staff.last_name, 1) || '.',
    NULLIF(p_app_version, ''), NULLIF(p_os_version, ''),
    v_ip_address,
    NOW()
  );

  -- ========================================
  -- STEP 3: AUTO CLOCK IN
  -- ========================================
  IF p_auto_clock_in THEN
    v_shift_result := handle_time_clock(
      p_pin_code,
      p_location_id,
      'sign_in'::TEXT,
      p_device_id
    );
  END IF;

  -- ========================================
  -- RETURN SUCCESS
  -- ========================================
  RETURN json_build_object(
    'success', true,
    'staff', json_build_object(
      'staff_profile_id', v_staff.staff_profile_id,
      'first_name', v_staff.first_name,
      'last_name', v_staff.last_name,
      'display_name', v_staff.first_name || ' ' || LEFT(v_staff.last_name, 1) || '.',
      'role_code', v_staff.role_code
    ),
    'session', json_build_object(
      'session_id', v_session_id,
      'station_id', p_station_id,
      'station_name', v_station.station_name,
      'station_type', v_station.station_type,
      'is_reconnect', v_is_reconnect,
      'kicked_previous', v_was_kicked,
      'kicked_device_id', CASE WHEN v_was_kicked THEN v_existing_session.device_id ELSE NULL END
    ),
    'shift', v_shift_result
  );
END;
$$;


-- ============================================================
-- MIGRATION 10: Logout (End session + optional clock out)
-- ============================================================

CREATE OR REPLACE FUNCTION pos_staff_logout(
  p_session_id UUID,
  p_location_id UUID,
  p_pin_code TEXT,
  p_device_id UUID,
  p_clock_out BOOLEAN DEFAULT FALSE
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session RECORD;
  v_clock_result JSON;
BEGIN
  -- End session
  UPDATE station_sessions
  SET session_status = 'ended', ended_at = NOW(), updated_at = NOW()
  WHERE id = p_session_id AND session_status = 'active'
  RETURNING * INTO v_session;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Session not found');
  END IF;
  
  -- Update station
  UPDATE stations SET is_online = FALSE
  WHERE id = v_session.station_id AND device_id = v_session.device_id;

  -- Mark device as disconnected
  UPDATE station_devices
  SET is_connected = FALSE, last_seen_at = NOW(), updated_at = NOW()
  WHERE session_id = p_session_id AND device_type = 'pos_device';

  -- Close login history entry
  UPDATE device_login_history
  SET logged_out_at = NOW(), logout_reason = 'logout'
  WHERE session_id = p_session_id AND logged_out_at IS NULL;

  -- Clock out if requested
  IF p_clock_out THEN
    v_clock_result := handle_time_clock(
      p_location_id,
      p_pin_code,
      'clock_out',
      p_device_id,
      v_session.station_id
    );
  END IF;
  
  RETURN json_build_object(
    'success', true,
    'clocked_out', p_clock_out,
    'clock_result', v_clock_result
  );
END;
$$;


-- ============================================================
-- MIGRATION 11: RLS Policies
-- ============================================================

ALTER TABLE station_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_kick_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view sessions for their merchant"
  ON station_sessions FOR SELECT
  USING (
    is_merchant_admin(merchant_id)
  );

CREATE POLICY "Users can manage sessions for their merchant"
  ON station_sessions FOR ALL
  USING (
    is_merchant_admin(merchant_id)
  );
