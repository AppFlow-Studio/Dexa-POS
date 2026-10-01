-- ============================================================
-- pos_station_login: claim a KDS or kiosk station without a staff PIN
-- ============================================================
--
-- KDS and kiosk (self_service) stations run unattended, so the POS no longer
-- asks for a staff PIN to start them. This claims the station for the device
-- the same way pos_staff_login_v2 does (one active session per station and per
-- device, takeover with kick notification, station/device bookkeeping), but:
--   * no staff: the session's staff_profile_id / staff_name stay NULL;
--   * no clock-in;
--   * no PIN, so instead the caller's signed-in account must belong to the
--     station's merchant or location;
--   * KDS and kiosk stations only — every other station still needs a staff
--     PIN through pos_staff_login_v2.

CREATE OR REPLACE FUNCTION public.pos_station_login(
    p_location_id    uuid,
    p_station_id     uuid,
    p_device_id      text,
    p_device_name    text,
    p_force_takeover boolean DEFAULT false,
    p_ip_address     text    DEFAULT NULL::text,
    p_app_version    text    DEFAULT NULL::text,
    p_os_version     text    DEFAULT NULL::text,
    p_hardware_model text    DEFAULT NULL::text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_station           RECORD;
  v_existing_session  RECORD;
  v_session_id        UUID;
  v_was_kicked        BOOLEAN := FALSE;
  v_is_reconnect      BOOLEAN := FALSE;
  v_kicked_device_id  TEXT;
  v_kicked_session_id UUID;
  v_ip_address        INET;
  v_claimed_by        TEXT;
BEGIN

  -- STEP 0: PARSE IP
  IF p_ip_address IS NOT NULL AND p_ip_address <> '' THEN
    v_ip_address := p_ip_address::INET;
  ELSE
    v_ip_address := NULL;
  END IF;

  -- STEP 1: STATION + ACCESS
  SELECT s.id, s.station_name, s.station_type, s.location_id, l.merchant_id
  INTO v_station
  FROM public.stations  s
  JOIN public.locations l ON l.id = s.location_id
  WHERE s.id          = p_station_id
    AND s.location_id = p_location_id
    AND s.is_active   = TRUE;

  IF NOT FOUND THEN
    RETURN json_build_object(
      'success',    false,
      'error',      'Station not found',
      'error_code', 'STATION_NOT_FOUND'
    );
  END IF;

  -- No PIN here, so the device's signed-in account is the credential.
  IF NOT (
    public.user_belongs_to_merchant(v_station.merchant_id)
    OR public.is_location_member(v_station.location_id)
  ) THEN
    RETURN json_build_object(
      'success',    false,
      'error',      'Access denied',
      'error_code', 'ACCESS_DENIED'
    );
  END IF;

  IF v_station.station_type NOT IN ('kds', 'self_service') THEN
    RETURN json_build_object(
      'success',    false,
      'error',      'This station requires a staff PIN',
      'error_code', 'PIN_REQUIRED'
    );
  END IF;

  -- Shown to a device this one takes the station from ("Taken over by ...").
  v_claimed_by := COALESCE(NULLIF(p_device_name, ''), v_station.station_name);

  -- STEP 2: CLAIM STATION
  UPDATE public.station_sessions
  SET session_status = 'ended', ended_at = NOW()
  WHERE device_id      = p_device_id
    AND session_status = 'active'
    AND station_id    != p_station_id;

  SELECT * INTO v_existing_session
  FROM public.station_sessions
  WHERE station_id     = p_station_id
    AND session_status = 'active'
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing_session.device_id = p_device_id THEN
      -- Reconnect. Drop any staff an earlier PIN login left on the session.
      UPDATE public.station_sessions
      SET
        staff_profile_id = NULL,
        staff_name       = NULL,
        ip_address       = COALESCE(v_ip_address, ip_address::INET),
        app_version      = COALESCE(NULLIF(p_app_version,    ''), app_version),
        os_version       = COALESCE(NULLIF(p_os_version,     ''), os_version),
        hardware_model   = COALESCE(NULLIF(p_hardware_model, ''), hardware_model)
      WHERE id = v_existing_session.id;

      v_session_id   := v_existing_session.id;
      v_is_reconnect := TRUE;
    ELSE
      IF NOT p_force_takeover THEN
        RETURN json_build_object(
          'success',    false,
          'error',      'Station in use',
          'error_code', 'STATION_IN_USE',
          'current_session', json_build_object(
            'session_id',  v_existing_session.id,
            'device_name', v_existing_session.device_name,
            'staff_name',  v_existing_session.staff_name,
            'started_at',  v_existing_session.started_at
          )
        );
      END IF;

      UPDATE public.station_sessions
      SET
        session_status       = 'kicked',
        ended_at             = NOW(),
        kicked_by_device_id  = p_device_id,
        kicked_by_staff_name = v_claimed_by,
        kick_reason          = 'Taken over'
      WHERE id = v_existing_session.id;

      INSERT INTO public.session_kick_notifications (
        session_id, device_id, kicked_by_staff_name, kick_reason
      ) VALUES (
        v_existing_session.id,
        v_existing_session.device_id,
        v_claimed_by,
        'Taken over'
      );

      v_was_kicked        := TRUE;
      v_kicked_device_id  := v_existing_session.device_id;
      v_kicked_session_id := v_existing_session.id;
    END IF;
  END IF;

  IF v_session_id IS NULL THEN
    INSERT INTO public.station_sessions (
      station_id,   merchant_id,           location_id,
      device_id,    device_name,
      staff_profile_id, staff_name,
      session_status,
      ip_address,   app_version,           os_version,   hardware_model
    ) VALUES (
      p_station_id, v_station.merchant_id, v_station.location_id,
      p_device_id,  p_device_name,
      NULL, NULL,
      'active',
      v_ip_address,
      NULLIF(p_app_version,    ''),
      NULLIF(p_os_version,     ''),
      NULLIF(p_hardware_model, '')
    )
    RETURNING id INTO v_session_id;

    UPDATE public.stations SET
      device_id      = p_device_id,
      device_name    = p_device_name,
      is_online      = TRUE,
      ip_address     = v_ip_address,
      app_version    = NULLIF(p_app_version,    ''),
      os_version     = NULLIF(p_os_version,     ''),
      hardware_model = NULLIF(p_hardware_model, '')
    WHERE id = p_station_id;
  END IF;

  INSERT INTO public.station_devices (
    station_id,  merchant_id,           location_id,
    device_type, device_name,           device_model,
    connection_type, device_id,         staff_id,    staff_name,
    app_version, os_version,            ip_address,  session_id,
    is_connected, last_seen_at
  ) VALUES (
    p_station_id, v_station.merchant_id, v_station.location_id,
    'pos_device', p_device_name, NULLIF(p_hardware_model, ''),
    'integrated', p_device_id,   NULL,        NULL,
    NULLIF(p_app_version, ''), NULLIF(p_os_version, ''),
    v_ip_address, v_session_id,
    TRUE, NOW()
  )
  ON CONFLICT (station_id, device_id) WHERE device_type = 'pos_device'
  DO UPDATE SET
    device_name    = EXCLUDED.device_name,
    device_model   = EXCLUDED.device_model,
    staff_id       = EXCLUDED.staff_id,
    staff_name     = EXCLUDED.staff_name,
    app_version    = EXCLUDED.app_version,
    os_version     = EXCLUDED.os_version,
    ip_address     = EXCLUDED.ip_address,
    session_id     = EXCLUDED.session_id,
    is_connected   = TRUE,
    last_seen_at   = NOW(),
    updated_at     = NOW();

  INSERT INTO public.device_login_history (
    station_id,   merchant_id,           location_id,  session_id,
    device_id,    device_name,           device_model,
    staff_id,     staff_name,
    app_version,  os_version,            ip_address,
    logged_in_at
  ) VALUES (
    p_station_id, v_station.merchant_id, v_station.location_id, v_session_id,
    p_device_id,  p_device_name,     NULLIF(p_hardware_model, ''),
    NULL,         NULL,
    NULLIF(p_app_version, ''), NULLIF(p_os_version, ''),
    v_ip_address,
    NOW()
  );

  RETURN json_build_object(
    'success', true,
    'session', json_build_object(
      'session_id',        v_session_id,
      'station_id',        p_station_id,
      'station_name',      v_station.station_name,
      'station_type',      v_station.station_type,
      'is_reconnect',      v_is_reconnect,
      'kicked_previous',   v_was_kicked,
      'kicked_device_id',  v_kicked_device_id,
      'kicked_session_id', v_kicked_session_id
    )
  );
END;
$function$;

-- PIN-less, so signed-in accounts only (the access check above also rejects
-- a caller with no account).
REVOKE ALL ON FUNCTION public.pos_station_login(uuid, uuid, text, text, boolean, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_station_login(uuid, uuid, text, text, boolean, text, text, text, text) TO authenticated, service_role;
