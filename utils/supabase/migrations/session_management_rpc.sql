-- ============================================================
-- Migration 013: Session Management RPCs
-- ============================================================
-- File: supabase/migrations/013_session_management_rpcs.sql

-- ============================================================
-- START SESSION (with optional force takeover)
-- ============================================================
CREATE OR REPLACE FUNCTION start_station_session(
  p_station_id UUID,
  p_device_id TEXT,
  p_device_name TEXT DEFAULT NULL,
  p_device_model TEXT DEFAULT NULL,
  p_device_os TEXT DEFAULT NULL,
  p_app_version TEXT DEFAULT NULL,
  p_staff_id UUID DEFAULT NULL,
  p_staff_name TEXT DEFAULT NULL,
  p_force_takeover BOOLEAN DEFAULT FALSE,
  p_ip_address INET DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_station RECORD;
  v_existing_session RECORD;
  v_existing_device_session RECORD;
  v_new_session_id UUID;
  v_new_session_token UUID;
  v_kicked_device_id TEXT;
BEGIN
  -- 1. Verify station exists and get info
  SELECT s.*, l.location_name, m.business_name
  INTO v_station
  FROM stations s
  JOIN locations l ON l.id = s.location_id
  JOIN merchants m ON m.id = s.merchant_id
  WHERE s.id = p_station_id AND s.is_active = TRUE;
  
  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Station not found or inactive',
      'error_code', 'STATION_NOT_FOUND'
    );
  END IF;
  
  -- 2. Check if THIS DEVICE already has an active session on ANOTHER station
  SELECT * INTO v_existing_device_session
  FROM station_sessions
  WHERE device_id = p_device_id
    AND status = 'active'
    AND station_id != p_station_id;
  
  IF FOUND THEN
    -- End the device's session on the other station
    UPDATE station_sessions
    SET 
      status = 'ended',
      ended_at = NOW(),
      updated_at = NOW()
    WHERE id = v_existing_device_session.id;
  END IF;
  
  -- 3. Check if station already has an active session
  SELECT * INTO v_existing_session
  FROM station_sessions
  WHERE station_id = p_station_id
    AND status = 'active';
  
  IF FOUND THEN
    -- Check if it's the same device reconnecting
    IF v_existing_session.device_id = p_device_id THEN
      -- Same device - just refresh the session
      UPDATE station_sessions
      SET 
        last_heartbeat_at = NOW(),
        expires_at = NOW() + INTERVAL '5 minutes',
        staff_id = COALESCE(p_staff_id, staff_id),
        staff_name = COALESCE(p_staff_name, staff_name),
        app_version = COALESCE(p_app_version, app_version),
        ip_address = COALESCE(p_ip_address, ip_address),
        updated_at = NOW()
      WHERE id = v_existing_session.id
      RETURNING session_token INTO v_new_session_token;
      
      RETURN json_build_object(
        'success', true,
        'session_id', v_existing_session.id,
        'session_token', v_new_session_token,
        'station', json_build_object(
          'id', v_station.id,
          'name', v_station.station_name,
          'type', v_station.station_type,
          'number', v_station.station_number
        ),
        'is_reconnection', true,
        'message', 'Session refreshed'
      );
    END IF;
    
    -- Different device - check if we can take over
    IF NOT p_force_takeover THEN
      -- Return info about existing session so UI can ask for confirmation
      RETURN json_build_object(
        'success', false,
        'error', 'Station is currently in use',
        'error_code', 'STATION_IN_USE',
        'existing_session', json_build_object(
          'device_name', v_existing_session.device_name,
          'device_id', v_existing_session.device_id,
          'staff_name', v_existing_session.staff_name,
          'started_at', v_existing_session.started_at,
          'last_heartbeat_at', v_existing_session.last_heartbeat_at
        ),
        'require_confirmation', true
      );
    END IF;
    
    -- Force takeover - kick the existing session
    v_kicked_device_id := v_existing_session.device_id;
    
    UPDATE station_sessions
    SET 
      status = 'kicked',
      ended_at = NOW(),
      kicked_by_device_id = p_device_id,
      kick_reason = 'Forced takeover by another device',
      updated_at = NOW()
    WHERE id = v_existing_session.id;
    
    -- Send kick notification to the old device (for Realtime)
    INSERT INTO session_notifications (
      target_device_id,
      target_session_id,
      notification_type,
      payload,
      source_device_id,
      source_station_name
    ) VALUES (
      v_kicked_device_id,
      v_existing_session.id,
      'session_kicked',
      json_build_object(
        'station_id', p_station_id,
        'station_name', v_station.station_name,
        'kicked_by_device', p_device_name,
        'kicked_by_staff', p_staff_name,
        'message', 'Your session was taken over by another device'
      ),
      p_device_id,
      v_station.station_name
    );
  END IF;
  
  -- 4. Create new session
  v_new_session_id := gen_random_uuid();
  v_new_session_token := gen_random_uuid();
  
  INSERT INTO station_sessions (
    id,
    station_id,
    merchant_id,
    location_id,
    device_id,
    device_name,
    device_model,
    device_os,
    app_version,
    session_token,
    staff_id,
    staff_name,
    status,
    ip_address
  ) VALUES (
    v_new_session_id,
    p_station_id,
    v_station.merchant_id,
    v_station.location_id,
    p_device_id,
    p_device_name,
    p_device_model,
    p_device_os,
    p_app_version,
    v_new_session_token,
    p_staff_id,
    p_staff_name,
    'active',
    p_ip_address
  );
  
  -- 5. Update station's online status
  UPDATE stations
  SET 
    is_online = TRUE,
    device_id = p_device_id,
    device_name = p_device_name,
    hardware_model = p_device_model,
    os_version = p_device_os,
    app_version = p_app_version,
    ip_address = p_ip_address,
    last_heartbeat_at = NOW(),
    updated_at = NOW()
  WHERE id = p_station_id;
  
  -- 6. Return success with session info
  RETURN json_build_object(
    'success', true,
    'session_id', v_new_session_id,
    'session_token', v_new_session_token,
    'station', json_build_object(
      'id', v_station.id,
      'name', v_station.station_name,
      'type', v_station.station_type,
      'number', v_station.station_number,
      'location_name', v_station.location_name,
      'can_create_orders', v_station.can_create_orders,
      'can_process_payments', v_station.can_process_payments,
      'can_update_kitchen_status', v_station.can_update_kitchen_status,
      'view_scope', v_station.view_scope
    ),
    'took_over_from', CASE WHEN v_kicked_device_id IS NOT NULL 
      THEN v_kicked_device_id 
      ELSE NULL 
    END,
    'message', CASE WHEN v_kicked_device_id IS NOT NULL 
      THEN 'Session started (previous device was kicked)' 
      ELSE 'Session started' 
    END
  );
END;
$$;


-- ============================================================
-- SESSION HEARTBEAT (keeps session alive)
-- ============================================================
CREATE OR REPLACE FUNCTION session_heartbeat(
  p_session_token UUID,
  p_ip_address INET DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session RECORD;
BEGIN
  -- Update session and return status
  UPDATE station_sessions
  SET 
    last_heartbeat_at = NOW(),
    expires_at = NOW() + INTERVAL '5 minutes',
    ip_address = COALESCE(p_ip_address, ip_address),
    updated_at = NOW()
  WHERE session_token = p_session_token
    AND status = 'active'
  RETURNING * INTO v_session;
  
  IF NOT FOUND THEN
    -- Check if session exists but is not active
    SELECT * INTO v_session
    FROM station_sessions
    WHERE session_token = p_session_token;
    
    IF FOUND THEN
      -- Session was kicked or expired
      RETURN json_build_object(
        'success', false,
        'error', 'Session is no longer active',
        'error_code', 'SESSION_INVALID',
        'status', v_session.status,
        'kick_reason', v_session.kick_reason
      );
    ELSE
      RETURN json_build_object(
        'success', false,
        'error', 'Session not found',
        'error_code', 'SESSION_NOT_FOUND'
      );
    END IF;
  END IF;
  
  -- Update station heartbeat too
  UPDATE stations
  SET 
    is_online = TRUE,
    last_heartbeat_at = NOW(),
    ip_address = COALESCE(p_ip_address, ip_address)
  WHERE id = v_session.station_id;
  
  RETURN json_build_object(
    'success', true,
    'expires_at', v_session.expires_at,
    'session_id', v_session.id
  );
END;
$$;


-- ============================================================
-- VALIDATE SESSION (check if session is still valid)
-- ============================================================
CREATE OR REPLACE FUNCTION validate_session(
  p_session_token UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session RECORD;
BEGIN
  SELECT 
    ss.*,
    s.station_name,
    s.station_type,
    s.can_create_orders,
    s.can_process_payments,
    s.can_update_kitchen_status,
    s.view_scope
  INTO v_session
  FROM station_sessions ss
  JOIN stations s ON s.id = ss.station_id
  WHERE ss.session_token = p_session_token;
  
  IF NOT FOUND THEN
    RETURN json_build_object(
      'valid', false,
      'error', 'Session not found',
      'error_code', 'SESSION_NOT_FOUND'
    );
  END IF;
  
  -- Check if expired by time
  IF v_session.status = 'active' AND v_session.expires_at < NOW() THEN
    -- Mark as expired
    UPDATE station_sessions
    SET status = 'expired', ended_at = NOW(), updated_at = NOW()
    WHERE id = v_session.id;
    
    RETURN json_build_object(
      'valid', false,
      'error', 'Session expired',
      'error_code', 'SESSION_EXPIRED',
      'expired_at', v_session.expires_at
    );
  END IF;
  
  -- Check status
  IF v_session.status != 'active' THEN
    RETURN json_build_object(
      'valid', false,
      'error', 'Session is ' || v_session.status,
      'error_code', 'SESSION_' || UPPER(v_session.status),
      'kick_reason', v_session.kick_reason,
      'kicked_by_device', v_session.kicked_by_device_id
    );
  END IF;
  
  -- Session is valid
  RETURN json_build_object(
    'valid', true,
    'session_id', v_session.id,
    'station_id', v_session.station_id,
    'station_name', v_session.station_name,
    'station_type', v_session.station_type,
    'expires_at', v_session.expires_at,
    'capabilities', json_build_object(
      'can_create_orders', v_session.can_create_orders,
      'can_process_payments', v_session.can_process_payments,
      'can_update_kitchen_status', v_session.can_update_kitchen_status,
      'view_scope', v_session.view_scope
    )
  );
END;
$$;


-- ============================================================
-- END SESSION (graceful logout)
-- ============================================================
CREATE OR REPLACE FUNCTION end_station_session(
  p_session_token UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session RECORD;
BEGIN
  UPDATE station_sessions
  SET 
    status = 'ended',
    ended_at = NOW(),
    updated_at = NOW()
  WHERE session_token = p_session_token
    AND status = 'active'
  RETURNING * INTO v_session;
  
  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Active session not found'
    );
  END IF;
  
  -- Update station offline
  UPDATE stations
  SET 
    is_online = FALSE,
    updated_at = NOW()
  WHERE id = v_session.station_id;
  
  RETURN json_build_object(
    'success', true,
    'message', 'Session ended',
    'session_id', v_session.id
  );
END;
$$;


-- ============================================================
-- GET STATION STATUS (for station selection screen)
-- ============================================================
CREATE OR REPLACE FUNCTION get_location_station_statuses(
  p_location_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN (
    SELECT json_agg(station_info ORDER BY s.station_number)
    FROM (
      SELECT 
        s.id,
        s.station_name,
        s.station_code,
        s.station_type,
        s.station_number,
        s.is_active,
        s.can_create_orders,
        s.can_process_payments,
        s.can_update_kitchen_status,
        CASE 
          WHEN ss.id IS NOT NULL AND ss.status = 'active' AND ss.expires_at > NOW() 
          THEN TRUE 
          ELSE FALSE 
        END as is_in_use,
        CASE 
          WHEN ss.id IS NOT NULL AND ss.status = 'active' AND ss.expires_at > NOW() 
          THEN json_build_object(
            'device_name', ss.device_name,
            'staff_name', ss.staff_name,
            'started_at', ss.started_at,
            'last_heartbeat_at', ss.last_heartbeat_at
          )
          ELSE NULL
        END as current_session
      FROM stations s
      LEFT JOIN station_sessions ss ON ss.station_id = s.id AND ss.status = 'active'
      WHERE s.location_id = p_location_id
        AND s.is_active = TRUE
    ) station_info
  );
END;
$$;


-- ============================================================
-- EXPIRE STALE SESSIONS (run via cron every minute)
-- ============================================================
CREATE OR REPLACE FUNCTION expire_stale_sessions()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_expired_count INTEGER;
  v_session RECORD;
BEGIN
  -- Find and expire stale sessions
  FOR v_session IN 
    SELECT id, device_id, station_id
    FROM station_sessions
    WHERE status = 'active'
      AND expires_at < NOW()
  LOOP
    -- Update session
    UPDATE station_sessions
    SET 
      status = 'expired',
      ended_at = NOW(),
      updated_at = NOW()
    WHERE id = v_session.id;
    
    -- Send notification to device
    INSERT INTO session_notifications (
      target_device_id,
      target_session_id,
      notification_type,
      payload
    ) VALUES (
      v_session.device_id,
      v_session.id,
      'session_expired',
      json_build_object(
        'message', 'Your session expired due to inactivity',
        'station_id', v_session.station_id
      )
    );
    
    -- Mark station offline
    UPDATE stations
    SET is_online = FALSE
    WHERE id = v_session.station_id;
  END LOOP;
  
  GET DIAGNOSTICS v_expired_count = ROW_COUNT;
  
  RETURN json_build_object(
    'expired_count', v_expired_count,
    'timestamp', NOW()
  );
END;
$$;


-- ============================================================
-- KICK DEVICE FROM STATION (admin action)
-- ============================================================
CREATE OR REPLACE FUNCTION kick_station_session(
  p_station_id UUID,
  p_reason TEXT DEFAULT 'Kicked by administrator'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session RECORD;
BEGIN
  -- Find and kick active session
  UPDATE station_sessions
  SET 
    status = 'kicked',
    ended_at = NOW(),
    kick_reason = p_reason,
    updated_at = NOW()
  WHERE station_id = p_station_id
    AND status = 'active'
  RETURNING * INTO v_session;
  
  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'No active session on this station'
    );
  END IF;
  
  -- Send notification
  INSERT INTO session_notifications (
    target_device_id,
    target_session_id,
    notification_type,
    payload
  ) VALUES (
    v_session.device_id,
    v_session.id,
    'session_kicked',
    json_build_object(
      'message', p_reason,
      'station_id', p_station_id
    )
  );
  
  -- Mark station offline
  UPDATE stations
  SET is_online = FALSE
  WHERE id = p_station_id;
  
  RETURN json_build_object(
    'success', true,
    'kicked_device_id', v_session.device_id,
    'kicked_device_name', v_session.device_name
  );
END;
$$;