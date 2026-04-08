CREATE OR REPLACE FUNCTION handle_time_clock_v2(
    p_location_id uuid,
    p_pin_code text,
    p_action_type text,  -- 'sign_in', 'clock_in', 'clock_out', 'break_start', 'break_end'
    p_device_id uuid,
    p_station_id uuid DEFAULT NULL  -- NEW: Optional station tracking
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
           AND replace(sm.pin_code, '$2b$', '$2a$') = crypt(p_pin_code, replace(sm.pin_code, '$2b$', '$2a$')))
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
                station_id,              -- NEW
                station_session_id       -- NEW
            ) VALUES (
                v_merchant_id, 
                p_location_id, 
                v_staff_id, 
                'active', 
                COALESCE(v_rate, 0), 
                p_device_id,
                p_station_id,            -- NEW
                v_session_id             -- NEW
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
            station_id,              -- NEW
            station_session_id       -- NEW
        ) VALUES (
            v_merchant_id, 
            p_location_id, 
            v_staff_id, 
            'active', 
            COALESCE(v_rate, 0), 
            p_device_id,
            p_station_id,            -- NEW
            v_session_id             -- NEW
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
        'station_id', p_station_id      -- NEW
    ) INTO v_result;

    RETURN v_result;
END;
$$;