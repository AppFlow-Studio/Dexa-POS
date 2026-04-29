-- Source: utils/supabase/migrations/pos_staff_login_rate_limiting.sql
-- See that file for full commentary.

-- ============================================================
-- 1. PERFORMANCE INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_lm_location_pin_plain
  ON public.location_members (location_id, pin_plain)
  WHERE is_active = true AND pin_plain IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lm_location_active
  ON public.location_members (location_id)
  WHERE is_active = true;

-- ============================================================
-- 2. pin_login_attempts
-- ============================================================

CREATE TABLE IF NOT EXISTS public.pin_login_attempts (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id      uuid        NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  device_id        text        NOT NULL,
  ip_address       inet,
  attempted_at     timestamptz NOT NULL DEFAULT now(),
  succeeded        boolean     NOT NULL,
  staff_profile_id uuid
);

CREATE INDEX IF NOT EXISTS idx_pin_attempts_device_time
  ON public.pin_login_attempts (device_id, attempted_at DESC)
  WHERE succeeded = false;

CREATE INDEX IF NOT EXISTS idx_pin_attempts_loc_device_time
  ON public.pin_login_attempts (location_id, device_id, attempted_at DESC)
  WHERE succeeded = false;

ALTER TABLE public.pin_login_attempts ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. security_alerts
-- ============================================================

CREATE TABLE IF NOT EXISTS public.security_alerts (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type       text        NOT NULL,
  location_id      uuid,
  device_id        text,
  ip_address       inet,
  details          jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  acknowledged_at  timestamptz
);

CREATE INDEX IF NOT EXISTS idx_security_alerts_device
  ON public.security_alerts (device_id, created_at DESC);

ALTER TABLE public.security_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_read_security_alerts"
  ON public.security_alerts
  FOR SELECT
  TO service_role
  USING (true);

-- ============================================================
-- 4. pg_cron 90-day retention
-- ============================================================

SELECT cron.schedule(
  'pin-login-attempts-90d-retention',
  '15 3 * * *',
  $cron$
    DELETE FROM public.pin_login_attempts
    WHERE attempted_at < now() - interval '90 days';
  $cron$
);

-- ============================================================
-- 5. pos_staff_login_v2 with rate limiting
-- ============================================================

CREATE OR REPLACE FUNCTION public.pos_staff_login_v2(
    p_location_id   uuid,
    p_pin_code      text,
    p_station_id    uuid,
    p_device_id     text,
    p_device_name   text,
    p_auto_clock_in  boolean DEFAULT false,
    p_force_takeover boolean DEFAULT false,
    p_ip_address     text    DEFAULT NULL::text,
    p_app_version    text    DEFAULT NULL::text,
    p_os_version     text    DEFAULT NULL::text,
    p_hardware_model text    DEFAULT NULL::text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'public', 'pg_temp'
AS $function$
DECLARE
  v_staff            RECORD;
  v_station          RECORD;
  v_existing_session RECORD;
  v_session_id       UUID;
  v_shift_result     JSON;
  v_was_kicked       BOOLEAN := FALSE;
  v_is_reconnect     BOOLEAN := FALSE;
  v_ip_address       INET;
  v_hard_fail_count  INT;
  v_soft_fail_count  INT;
BEGIN

  -- STEP 0: PARSE IP
  IF p_ip_address IS NOT NULL AND p_ip_address <> '' THEN
    v_ip_address := p_ip_address::INET;
  ELSE
    v_ip_address := NULL;
  END IF;

  -- STEP 1: RATE-LIMIT CHECKS (B4 / B5)

  -- B5: Hard lockout — 10 failures / device / 30-min window
  SELECT COUNT(*) INTO v_hard_fail_count
  FROM public.pin_login_attempts
  WHERE device_id   = p_device_id
    AND succeeded   = false
    AND attempted_at > now() - interval '30 minutes';

  IF v_hard_fail_count >= 10 THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.security_alerts
      WHERE device_id  = p_device_id
        AND alert_type = 'PIN_HARD_LOCKOUT'
        AND created_at > now() - interval '30 minutes'
    ) THEN
      INSERT INTO public.security_alerts (
        alert_type, location_id, device_id, ip_address, details
      ) VALUES (
        'PIN_HARD_LOCKOUT',
        p_location_id,
        p_device_id,
        v_ip_address,
        jsonb_build_object(
          'failed_count', v_hard_fail_count,
          'window',       '30 minutes',
          'device_name',  p_device_name
        )
      );
    END IF;

    RETURN json_build_object(
      'success',    false,
      'error',      'Too many failed attempts. Try again in 30 minutes.',
      'error_code', 'LOCKOUT_30MIN'
    );
  END IF;

  -- B4: Soft lockout — 5 failures / location+device / 5-min window
  SELECT COUNT(*) INTO v_soft_fail_count
  FROM public.pin_login_attempts
  WHERE location_id  = p_location_id
    AND device_id    = p_device_id
    AND succeeded    = false
    AND attempted_at > now() - interval '5 minutes';

  IF v_soft_fail_count >= 5 THEN
    RETURN json_build_object(
      'success',    false,
      'error',      'Too many failed attempts. Try again in 5 minutes.',
      'error_code', 'LOCKOUT_5MIN'
    );
  END IF;

  -- STEP 2: VERIFY PIN
  SELECT
    sp.id          AS staff_profile_id,
    sp.first_name,
    sp.last_name,
    lm.role_code,
    lm.hourly_rate,
    lm.merchant_id,
    lm.id          AS location_member_id,
    lm.pin_plain
  INTO v_staff
  FROM public.location_members lm
  JOIN public.staff_profiles   sp ON sp.id = lm.staff_profile_id
  WHERE lm.location_id = p_location_id
    AND lm.is_active   = true
    AND (
        (lm.pin_plain IS NOT NULL AND lm.pin_plain = p_pin_code)
        OR
        (lm.pin_plain IS NULL AND lm.pin_code IS NOT NULL
         AND replace(lm.pin_code, '$2b$', '$2a$')
             = extensions.crypt(p_pin_code, replace(lm.pin_code, '$2b$', '$2a$')))
    );

  IF NOT FOUND THEN
    INSERT INTO public.pin_login_attempts (
      location_id, device_id, ip_address, succeeded
    ) VALUES (
      p_location_id, p_device_id, v_ip_address, false
    );

    RETURN json_build_object(
      'success',    false,
      'error',      'Invalid PIN',
      'error_code', 'INVALID_PIN'
    );
  END IF;

  INSERT INTO public.pin_login_attempts (
    location_id, device_id, ip_address, succeeded, staff_profile_id
  ) VALUES (
    p_location_id, p_device_id, v_ip_address, true, v_staff.staff_profile_id
  );

  IF v_staff.pin_plain IS NULL THEN
    UPDATE public.location_members
    SET pin_plain = p_pin_code
    WHERE id = v_staff.location_member_id;
  END IF;

  -- STEP 3: CLAIM STATION
  SELECT s.*, l.merchant_id
  INTO v_station
  FROM public.stations  s
  JOIN public.locations l ON l.id = s.location_id
  WHERE s.id = p_station_id AND s.is_active = TRUE;

  IF NOT FOUND THEN
    RETURN json_build_object(
      'success',    false,
      'error',      'Station not found',
      'error_code', 'STATION_NOT_FOUND'
    );
  END IF;

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
      UPDATE public.station_sessions
      SET
        staff_profile_id = v_staff.staff_profile_id,
        staff_name       = v_staff.first_name || ' ' || LEFT(v_staff.last_name, 1) || '.',
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
          'staff', json_build_object(
            'staff_profile_id', v_staff.staff_profile_id,
            'display_name',     v_staff.first_name || ' ' || LEFT(v_staff.last_name, 1) || '.'
          ),
          'current_session', json_build_object(
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
        kicked_by_staff_name = v_staff.first_name || ' ' || LEFT(v_staff.last_name, 1) || '.',
        kick_reason          = 'Taken over'
      WHERE id = v_existing_session.id;

      INSERT INTO public.session_kick_notifications (
        session_id, device_id, kicked_by_staff_name, kick_reason
      ) VALUES (
        v_existing_session.id,
        v_existing_session.device_id,
        v_staff.first_name || ' ' || LEFT(v_staff.last_name, 1) || '.',
        'Taken over'
      );

      v_was_kicked := TRUE;
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
      v_staff.staff_profile_id,
      v_staff.first_name || ' ' || LEFT(v_staff.last_name, 1) || '.',
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
    'integrated', p_device_id,   v_staff.staff_profile_id,
    v_staff.first_name || ' ' || LEFT(v_staff.last_name, 1) || '.',
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
    v_staff.staff_profile_id,
    v_staff.first_name || ' ' || LEFT(v_staff.last_name, 1) || '.',
    NULLIF(p_app_version, ''), NULLIF(p_os_version, ''),
    v_ip_address,
    NOW()
  );

  -- STEP 4: AUTO CLOCK IN
  IF p_auto_clock_in THEN
    v_shift_result := public.handle_time_clock(
      p_pin_code,
      p_location_id,
      'sign_in'::TEXT,
      p_device_id
    );
  END IF;

  RETURN json_build_object(
    'success', true,
    'staff', json_build_object(
      'staff_profile_id', v_staff.staff_profile_id,
      'first_name',       v_staff.first_name,
      'last_name',        v_staff.last_name,
      'display_name',     v_staff.first_name || ' ' || LEFT(v_staff.last_name, 1) || '.',
      'role_code',        v_staff.role_code
    ),
    'session', json_build_object(
      'session_id',      v_session_id,
      'station_id',      p_station_id,
      'station_name',    v_station.station_name,
      'station_type',    v_station.station_type,
      'is_reconnect',    v_is_reconnect,
      'kicked_previous', v_was_kicked
    ),
    'shift', v_shift_result
  );
END;
$function$;
