-- ============================================================
-- MIGRATION: Plain-first PIN auth with bcrypt safety fallback
--
-- Context: Staging DB has pgcrypto installed in the `extensions`
-- schema (Supabase default). The PIN-touching RPCs below are all
-- SECURITY DEFINER with `SET search_path TO 'public','public','pg_temp'`,
-- which does NOT include `extensions`. Unqualified calls to
-- `crypt(...)` fail name lookup at plan time with:
--
--   42883: function crypt(text, text) does not exist
--
-- The parse failure happens before any row is evaluated, so even
-- users with a populated `pin_plain` were breaking on login.
--
-- Fix strategy:
--   1. Qualify every `crypt()` call as `extensions.crypt(...)`.
--      Keeps the hardened search_path intact (no search_path hijack
--      risk) while letting SECURITY DEFINER functions resolve pgcrypto.
--   2. Rewrite `handle_time_clock` (v1) body to the plain-first +
--      qualified-bcrypt pattern used by `pos_staff_login_v2` and
--      `handle_time_clock_v2`. Signature preserved.
--   3. Auto-migrate: on successful bcrypt match, populate
--      `pin_plain` so the next login hits the fast path.
--   4. Fix latent 5-arg bug in `pos_staff_logout -> handle_time_clock`.
--      v1 takes 4 args. The extra station_id was a live footgun for
--      any logout with `p_clock_out=true`.
--
-- All signatures are preserved -> no client / database.types.ts churn.
-- ============================================================

-- ============================================================
-- 1. handle_time_clock (v1)
--    Body rewrite: plain-first PIN compare + extensions.crypt fallback
--    + auto-migrate. Signature, return shape, and every error
--    sentinel ('INVALID_PIN', 'ALREADY_CLOCKED_IN', 'NO_ACTIVE_SHIFT',
--    'END_BREAK_FIRST', 'MUST_BE_ACTIVE_TO_BREAK', 'NOT_ON_BREAK')
--    are preserved — `useTimeclock.ts` keys off those strings.
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_time_clock(
    p_pin_code text,
    p_location_id uuid,
    p_action_type text,
    p_device_id text DEFAULT NULL::text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'public', 'pg_temp'
AS $function$
DECLARE
    v_staff_id uuid;
    v_rate numeric;
    v_merchant_id uuid;
    v_current_shift_id uuid;
    v_current_status text;
    v_result json;
    v_member_id uuid;
    v_pin_plain text;
BEGIN
    -- 1. Validate PIN & Get Staff Context (plain-first, bcrypt fallback)
    SELECT
        sm.staff_profile_id,
        sm.hourly_rate,
        sm.merchant_id,
        sm.id,
        sm.pin_plain
    INTO
        v_staff_id,
        v_rate,
        v_merchant_id,
        v_member_id,
        v_pin_plain
    FROM location_members sm
    WHERE sm.location_id = p_location_id
      AND sm.is_active = true
      AND (
          -- Fast path: plain-text PIN match
          (sm.pin_plain IS NOT NULL AND sm.pin_plain = p_pin_code)
          OR
          -- Bcrypt fallback: un-migrated employees only
          (sm.pin_plain IS NULL AND sm.pin_code IS NOT NULL
           AND replace(sm.pin_code, '$2b$', '$2a$')
               = extensions.crypt(p_pin_code, replace(sm.pin_code, '$2b$', '$2a$')))
      );

    IF NOT FOUND THEN
        -- Standardized error for UI to catch
        RAISE EXCEPTION 'INVALID_PIN';
    END IF;

    -- Auto-migrate: populate pin_plain on first successful bcrypt login
    IF v_pin_plain IS NULL THEN
        UPDATE location_members SET pin_plain = p_pin_code WHERE id = v_member_id;
    END IF;

    -- 2. Find Active Shift (if any)
    SELECT id, status INTO v_current_shift_id, v_current_status
    FROM staff_shifts
    WHERE staff_profile_id = v_staff_id
      AND status != 'completed'
    ORDER BY created_at DESC
    LIMIT 1;

    -- 3. Handle Actions

    ----------------------------------------------------------------
    -- ACTION: SIGN IN (Unlock + Auto Clock In)
    ----------------------------------------------------------------
    IF p_action_type = 'sign_in' THEN
        IF v_current_shift_id IS NULL THEN
            INSERT INTO staff_shifts (
                merchant_id,
                location_id,
                staff_profile_id,
                status,
                hourly_rate_snapshot,
                device_id
            ) VALUES (
                v_merchant_id,
                p_location_id,
                v_staff_id,
                'active',
                COALESCE(v_rate, 0),
                p_device_id
            ) RETURNING id INTO v_current_shift_id;

            v_current_status := 'active';
        END IF;
        -- If shift exists, fall through and return current status

    ----------------------------------------------------------------
    -- ACTION: CLOCK IN (Explicit)
    ----------------------------------------------------------------
    ELSIF p_action_type = 'clock_in' THEN
        IF v_current_shift_id IS NOT NULL THEN
            RAISE EXCEPTION 'ALREADY_CLOCKED_IN';
        END IF;

        INSERT INTO staff_shifts (
            merchant_id,
            location_id,
            staff_profile_id,
            status,
            hourly_rate_snapshot,
            device_id
        ) VALUES (
            v_merchant_id,
            p_location_id,
            v_staff_id,
            'active',
            COALESCE(v_rate, 0),
            p_device_id
        ) RETURNING id INTO v_current_shift_id;

        v_current_status := 'active';

    ----------------------------------------------------------------
    -- ACTION: CLOCK OUT
    ----------------------------------------------------------------
    ELSIF p_action_type = 'clock_out' THEN
        IF v_current_shift_id IS NULL THEN
            RAISE EXCEPTION 'NO_ACTIVE_SHIFT';
        END IF;

        IF v_current_status = 'on_break' THEN
             RAISE EXCEPTION 'END_BREAK_FIRST';
        END IF;

        UPDATE staff_shifts
        SET status = 'completed',
            clock_out_time = now(),
            updated_at = now()
        WHERE id = v_current_shift_id;

        v_current_status := 'completed';

    ----------------------------------------------------------------
    -- ACTION: START BREAK
    ----------------------------------------------------------------
    ELSIF p_action_type = 'break_start' THEN
        IF v_current_status != 'active' THEN
             RAISE EXCEPTION 'MUST_BE_ACTIVE_TO_BREAK';
        END IF;

        UPDATE staff_shifts
        SET status = 'on_break',
            break_logs = COALESCE(break_logs, '[]'::jsonb) || jsonb_build_array(
                jsonb_build_object(
                    'start', now(),
                    'end', null,
                    'type', 'unpaid'
                )
            ),
            updated_at = now()
        WHERE id = v_current_shift_id;

        v_current_status := 'on_break';

    ----------------------------------------------------------------
    -- ACTION: END BREAK
    ----------------------------------------------------------------
    ELSIF p_action_type = 'break_end' THEN
        IF v_current_status != 'on_break' THEN
             RAISE EXCEPTION 'NOT_ON_BREAK';
        END IF;

        UPDATE staff_shifts
        SET status = 'active',
            break_logs = jsonb_set(
                break_logs,
                ARRAY[(jsonb_array_length(break_logs) - 1)::text, 'end'],
                to_jsonb(now())
            ),
            updated_at = now()
        WHERE id = v_current_shift_id;

        v_current_status := 'active';
    END IF;

    -- 4. Return Status for UI
    SELECT json_build_object(
        'success', true,
        'action', p_action_type,
        'status', v_current_status,
        'staff_id', v_staff_id,
        'shift_id', v_current_shift_id
    ) INTO v_result;

    RETURN v_result;
END;
$function$;


-- ============================================================
-- 2. pos_staff_login_v2
--    One-token fix: crypt(...) -> extensions.crypt(...) in the
--    bcrypt fallback branch. Everything else byte-identical.
-- ============================================================
CREATE OR REPLACE FUNCTION public.pos_staff_login_v2(
    p_location_id uuid,
    p_pin_code text,
    p_station_id uuid,
    p_device_id text,
    p_device_name text,
    p_auto_clock_in boolean DEFAULT false,
    p_force_takeover boolean DEFAULT false,
    p_ip_address text DEFAULT NULL::text,
    p_app_version text DEFAULT NULL::text,
    p_os_version text DEFAULT NULL::text,
    p_hardware_model text DEFAULT NULL::text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'public', 'pg_temp'
AS $function$
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
         AND replace(lm.pin_code, '$2b$', '$2a$')
             = extensions.crypt(p_pin_code, replace(lm.pin_code, '$2b$', '$2a$')))
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
      p_pin_code,           -- 1st: pin_code
      p_location_id,        -- 2nd: location_id
      'sign_in'::TEXT,      -- 3rd: action_type
      p_device_id           -- 4th: device_id
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
      'kicked_previous', v_was_kicked
    ),
    'shift', v_shift_result
  );
END;
$function$;


-- ============================================================
-- 3. handle_time_clock_v2
--    Hygiene: qualify crypt() so the function stays resolvable
--    even though it has zero call sites today. One-token change.
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_time_clock_v2(
    p_location_id uuid,
    p_pin_code text,
    p_action_type text,
    p_device_id text,
    p_station_id uuid DEFAULT NULL::uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'public', 'pg_temp'
AS $function$
DECLARE
    v_staff_id uuid;
    v_rate numeric;
    v_merchant_id uuid;
    v_current_shift_id uuid;
    v_current_status text;
    v_result json;
    v_session_id uuid;
    v_member_id uuid;
    v_pin_plain text;
BEGIN
    -- 1. Validate PIN & Get Staff Context
    SELECT
        sm.staff_profile_id,
        sm.hourly_rate,
        sm.merchant_id,
        sm.id,
        sm.pin_plain
    INTO
        v_staff_id,
        v_rate,
        v_merchant_id,
        v_member_id,
        v_pin_plain
    FROM location_members sm
    WHERE sm.location_id = p_location_id
      AND sm.is_active = true
      AND (
          -- Fast path: plain-text PIN match
          (sm.pin_plain IS NOT NULL AND sm.pin_plain = p_pin_code)
          OR
          -- Bcrypt fallback: un-migrated employees only
          (sm.pin_plain IS NULL AND sm.pin_code IS NOT NULL
           AND replace(sm.pin_code, '$2b$', '$2a$')
               = extensions.crypt(p_pin_code, replace(sm.pin_code, '$2b$', '$2a$')))
      );

    IF NOT FOUND THEN
        RAISE EXCEPTION 'INVALID_PIN';
    END IF;

    -- Auto-migrate: populate pin_plain on first successful bcrypt login
    IF v_pin_plain IS NULL THEN
        UPDATE location_members SET pin_plain = p_pin_code WHERE id = v_member_id;
    END IF;

    -- Get active station session for this device (if any)
    SELECT id INTO v_session_id
    FROM station_sessions
    WHERE device_id = p_device_id AND session_status = 'active';

    -- 2. Find Active Shift (if any)
    SELECT id, status INTO v_current_shift_id, v_current_status
    FROM staff_shifts
    WHERE staff_profile_id = v_staff_id
      AND status != 'completed'
    ORDER BY created_at DESC
    LIMIT 1;

    -- 3. Handle Actions

    ----------------------------------------------------------------
    -- ACTION: SIGN IN (Unlock + Auto Clock In)
    ----------------------------------------------------------------
    IF p_action_type = 'sign_in' THEN
        IF v_current_shift_id IS NULL THEN
            INSERT INTO staff_shifts (
                merchant_id,
                location_id,
                staff_profile_id,
                status,
                hourly_rate_snapshot,
                device_id,
                station_id,
                station_session_id
            ) VALUES (
                v_merchant_id,
                p_location_id,
                v_staff_id,
                'active',
                COALESCE(v_rate, 0),
                p_device_id,
                p_station_id,
                v_session_id
            ) RETURNING id INTO v_current_shift_id;

            v_current_status := 'active';
        END IF;

    ----------------------------------------------------------------
    -- ACTION: CLOCK IN (Explicit)
    ----------------------------------------------------------------
    ELSIF p_action_type = 'clock_in' THEN
        IF v_current_shift_id IS NOT NULL THEN
            RAISE EXCEPTION 'ALREADY_CLOCKED_IN';
        END IF;

        INSERT INTO staff_shifts (
            merchant_id,
            location_id,
            staff_profile_id,
            status,
            hourly_rate_snapshot,
            device_id,
            station_id,
            station_session_id
        ) VALUES (
            v_merchant_id,
            p_location_id,
            v_staff_id,
            'active',
            COALESCE(v_rate, 0),
            p_device_id,
            p_station_id,
            v_session_id
        ) RETURNING id INTO v_current_shift_id;

        v_current_status := 'active';

    ----------------------------------------------------------------
    -- ACTION: CLOCK OUT
    ----------------------------------------------------------------
    ELSIF p_action_type = 'clock_out' THEN
        IF v_current_shift_id IS NULL THEN
            RAISE EXCEPTION 'NO_ACTIVE_SHIFT';
        END IF;

        IF v_current_status = 'on_break' THEN
             RAISE EXCEPTION 'END_BREAK_FIRST';
        END IF;

        UPDATE staff_shifts
        SET status = 'completed',
            clock_out_time = now(),
            updated_at = now()
        WHERE id = v_current_shift_id;

        v_current_status := 'completed';

    ----------------------------------------------------------------
    -- ACTION: START BREAK
    ----------------------------------------------------------------
    ELSIF p_action_type = 'break_start' THEN
        IF v_current_status != 'active' THEN
             RAISE EXCEPTION 'MUST_BE_ACTIVE_TO_BREAK';
        END IF;

        UPDATE staff_shifts
        SET status = 'on_break',
            break_logs = COALESCE(break_logs, '[]'::jsonb) || jsonb_build_array(
                jsonb_build_object(
                    'start', now(),
                    'end', null,
                    'type', 'unpaid'
                )
            ),
            updated_at = now()
        WHERE id = v_current_shift_id;

        v_current_status := 'on_break';

    ----------------------------------------------------------------
    -- ACTION: END BREAK
    ----------------------------------------------------------------
    ELSIF p_action_type = 'break_end' THEN
        IF v_current_status != 'on_break' THEN
             RAISE EXCEPTION 'NOT_ON_BREAK';
        END IF;

        UPDATE staff_shifts
        SET status = 'active',
            break_logs = jsonb_set(
                break_logs,
                ARRAY[(jsonb_array_length(break_logs) - 1)::text, 'end'],
                to_jsonb(now())
            ),
            updated_at = now()
        WHERE id = v_current_shift_id;

        v_current_status := 'active';
    END IF;

    -- 4. Return Status for UI
    SELECT json_build_object(
        'success', true,
        'action', p_action_type,
        'status', v_current_status,
        'staff_id', v_staff_id,
        'shift_id', v_current_shift_id,
        'station_id', p_station_id
    ) INTO v_result;

    RETURN v_result;
END;
$function$;


-- ============================================================
-- 4. pos_staff_logout
--    Fix the latent 5-arg call to handle_time_clock. v1 takes
--    4 args (pin, loc, action, device). The previous body passed
--    a 5th station_id that doesn't exist on v1, which blew up any
--    logout with p_clock_out=true ("function handle_time_clock(
--    uuid,text,text,text,uuid) does not exist").
-- ============================================================
CREATE OR REPLACE FUNCTION public.pos_staff_logout(
    p_session_id uuid,
    p_location_id uuid,
    p_pin_code text,
    p_device_id text,
    p_clock_out boolean DEFAULT false
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'public', 'pg_temp'
AS $function$
DECLARE
  v_session RECORD;
  v_clock_result JSON;
BEGIN
  -- End session
  UPDATE station_sessions
  SET session_status = 'ended', ended_at = NOW(), last_activity_at = NOW()
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
      p_pin_code,           -- 1st: pin_code
      p_location_id,        -- 2nd: location_id
      'clock_out'::TEXT,    -- 3rd: action_type
      p_device_id           -- 4th: device_id
    );
  END IF;

  RETURN json_build_object(
    'success', true,
    'clocked_out', p_clock_out,
    'clock_result', v_clock_result
  );
END;
$function$;


-- ============================================================
-- 5. debug_pin_test
--    Hygiene: qualify crypt() on the diagnostic helper so anyone
--    running it against a hardened search_path gets a useful
--    answer instead of 42883.
-- ============================================================
CREATE OR REPLACE FUNCTION public.debug_pin_test(
    p_pin_code text,
    p_location_id uuid
)
RETURNS TABLE(staff_name text, stored_hash text, generated_hash text, is_match boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'public', 'pg_temp'
AS $function$
BEGIN
    RETURN QUERY
    SELECT
        (sp.first_name || ' ' || sp.last_name) as staff_name,
        sm.pin_code as stored_hash,
        extensions.crypt(p_pin_code, replace(sm.pin_code, '$2b$', '$2a$')) as generated_hash,
        (replace(sm.pin_code, '$2b$', '$2a$')
         = extensions.crypt(p_pin_code, replace(sm.pin_code, '$2b$', '$2a$'))) as is_match
    FROM location_members sm
    JOIN staff_profiles sp ON sp.id = sm.staff_profile_id
    WHERE sm.location_id = p_location_id
      AND sm.is_active = true;
END;
$function$;
