-- ============================================================================
-- get_location_table_status_v2
-- ============================================================================
-- Single query to hydrate ALL table sessions for a location.
-- Returns one row per table with the active session (if any) flattened in.
--
-- REPLACES: loadFloorPlanStatus() which did:
--   1. SELECT from floor_plan_objects
--   2. SELECT from table_sessions
--   3. SELECT from table_session_tables
--   4. Individual order fetches per session
--
-- Now: ONE RPC → all data needed to render the floor plan.
-- ============================================================================

CREATE OR REPLACE FUNCTION get_location_table_status_v2(
  p_location_id UUID
)
RETURNS TABLE (
  table_id        UUID,
  table_name      TEXT,
  table_capacity  INT,
  table_category  TEXT,
  section_id      UUID,
  session_id      UUID,
  session_status  TEXT,
  order_id        UUID,
  party_size      INT,
  server_staff_id UUID,
  guest_name      TEXT,
  guest_phone     TEXT,
  reservation_id  UUID,
  waitlist_id     UUID,
  session_number  TEXT,
  seated_at       TIMESTAMPTZ,
  is_vip          BOOLEAN,
  needs_attention BOOLEAN,
  current_course  INT,
  first_order_at  TIMESTAMPTZ,
  food_served_at  TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER
STABLE  -- Safe for read replicas
AS $$
BEGIN
  RETURN QUERY
  SELECT
    fpo.id                      AS table_id,
    fpo.name                    AS table_name,
    fpo.capacity                AS table_capacity,
    fpo.category::TEXT          AS table_category,
    fpo.section_id              AS section_id,
    ts.id                       AS session_id,
    COALESCE(ts.status::TEXT, 'available') AS session_status,
    ts.order_id                 AS order_id,
    COALESCE(ts.party_size, 0)  AS party_size,
    ts.server_staff_id          AS server_staff_id,
    ts.guest_name               AS guest_name,
    ts.guest_phone              AS guest_phone,
    ts.reservation_id           AS reservation_id,
    ts.waitlist_id              AS waitlist_id,
    ts.session_number           AS session_number,
    ts.seated_at                AS seated_at,
    COALESCE(ts.is_vip, false)  AS is_vip,
    COALESCE(ts.needs_attention, false) AS needs_attention,
    COALESCE(ts.current_course, 1) AS current_course,
    ts.first_order_at           AS first_order_at,
    ts.food_served_at           AS food_served_at
  FROM floor_plan_objects fpo
  LEFT JOIN table_session_tables tst
    ON tst.table_id = fpo.id
    AND tst.is_active = true
  LEFT JOIN table_sessions ts
    ON ts.id = tst.session_id
    AND ts.is_active = true
    AND ts.status NOT IN ('cleaning')  -- cleaning sessions are "almost done"
  WHERE fpo.location_id = p_location_id
    AND fpo.is_active = true
    AND fpo.category IN ('table', 'booth')
  ORDER BY fpo.name;
END;
$$;


-- ============================================================================
-- seat_guests_v3
-- ============================================================================
-- Single RPC: Creates session + order + links table + logs event.
--
-- REPLACES the multi-step flow:
--   1. loadFloorPlanStatus()     → check if table is free
--   2. seatGuests()              → create session
--   3. startNewOrder()           → create order (local)
--   4. syncOrderFromDatabase()   → sync order back
--
-- Now: ONE call → session + order + ready to go.
-- Returns: { success, session_id, order_id, session_number }
-- ============================================================================

CREATE OR REPLACE FUNCTION seat_guests_v3(
  p_table_id          UUID,
  p_merchant_id       UUID,
  p_staff_id          UUID          DEFAULT NULL,   -- Who is logged into the POS (created_by)
  p_server_staff_id   UUID          DEFAULT NULL,   -- Server assigned to the table
  p_party_size        INT           DEFAULT 1,
  p_create_order      BOOLEAN       DEFAULT TRUE,
  p_guest_name        TEXT          DEFAULT NULL,
  p_guest_phone       TEXT          DEFAULT NULL,
  p_reservation_id    UUID          DEFAULT NULL,
  p_waitlist_id       UUID          DEFAULT NULL,
  p_device_id         TEXT          DEFAULT NULL,
  p_station_id        UUID          DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_table              RECORD;
  v_session_id         UUID;
  v_order_id           UUID;
  v_order_number       TEXT;
  v_display_number     TEXT;
  v_session_number     TEXT;
  v_location_id        UUID;
  v_merchant_id        UUID;
  v_daily_count        INT;
  v_user_id            TEXT;
  v_verified_staff_id  UUID;   -- Validated POS staff (created_by)
  v_verified_server_id UUID;   -- Validated assigned server
BEGIN
  -- ──────────────────────────────────────────────────────────────
  -- 1. AUTH
  -- ──────────────────────────────────────────────────────────────

  v_user_id := get_my_claim('sub');

  IF p_merchant_id != user_merchant_id() THEN
    RAISE EXCEPTION 'Access denied: Invalid merchant_id';
  END IF;

  -- ──────────────────────────────────────────────────────────────
  -- 2. Lock table + extract location
  -- ──────────────────────────────────────────────────────────────

  SELECT fpo.id, fpo.name, fpo.location_id, fpo.merchant_id, fpo.capacity
  INTO v_table
  FROM floor_plan_objects fpo
  WHERE fpo.id = p_table_id
    AND fpo.is_active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Table not found or inactive'
    );
  END IF;

  v_location_id := v_table.location_id;
  v_merchant_id := v_table.merchant_id;

  IF NOT (v_location_id = ANY(user_location_ids())) THEN
    RAISE EXCEPTION 'Access denied: User does not have access to location';
  END IF;

  -- ──────────────────────────────────────────────────────────────
  -- 3. Check no active session exists
  -- ──────────────────────────────────────────────────────────────

  IF EXISTS (
    SELECT 1
    FROM table_session_tables tst
    JOIN table_sessions ts ON ts.id = tst.session_id
    WHERE tst.table_id = p_table_id
      AND tst.is_active = true
      AND ts.is_active = true
      AND ts.status NOT IN ('cleaning')
  ) THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Table already has an active session'
    );
  END IF;

  -- ──────────────────────────────────────────────────────────────
  -- 4. Validate BOTH staff IDs independently
  -- ──────────────────────────────────────────────────────────────

  -- POS logged-in staff (who performed the action)
  v_verified_staff_id := p_staff_id;
  IF v_verified_staff_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.staff_profiles WHERE id = v_verified_staff_id) THEN
      v_verified_staff_id := NULL;
    END IF;
  END IF;

  -- Assigned server (who is responsible for the table)
  v_verified_server_id := p_server_staff_id;
  IF v_verified_server_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.staff_profiles WHERE id = v_verified_server_id) THEN
      v_verified_server_id := NULL;
    END IF;
  END IF;

  -- ──────────────────────────────────────────────────────────────
  -- 5. Generate session number
  -- ──────────────────────────────────────────────────────────────

  SELECT COUNT(*) + 1
  INTO v_daily_count
  FROM table_sessions
  WHERE location_id = v_location_id
    AND created_at::date = CURRENT_DATE;

  v_session_number := v_table.name || '-' || LPAD(v_daily_count::TEXT, 3, '0');

  -- ──────────────────────────────────────────────────────────────
  -- 6. Create session
  --    server_staff_id = the assigned server (responsible for table)
  -- ──────────────────────────────────────────────────────────────

  INSERT INTO table_sessions (
    location_id,
    merchant_id,
    party_size,
    status,
    server_staff_id,
    guest_name,
    guest_phone,
    reservation_id,
    waitlist_id,
    session_number,
    seated_at,
    is_active,
    current_course,
    working_course,
    course_pacing
  ) VALUES (
    v_location_id,
    v_merchant_id,
    p_party_size,
    'seated',
    v_verified_server_id,       -- Assigned server owns the table
    p_guest_name,
    p_guest_phone,
    p_reservation_id,
    p_waitlist_id,
    v_session_number,
    NOW(),
    true,
    0,
    1,
    'normal'
  )
  RETURNING id INTO v_session_id;

  -- ──────────────────────────────────────────────────────────────
  -- 7. Link table to session
  -- ──────────────────────────────────────────────────────────────

  INSERT INTO table_session_tables (session_id, table_id, is_primary, is_active)
  VALUES (v_session_id, p_table_id, true, true);

  -- ──────────────────────────────────────────────────────────────
  -- 8. Create order
  --    created_by_staff_id  = POS staff who tapped "seat" (the actor)
  --    assigned_server_id   = server responsible for the table
  -- ──────────────────────────────────────────────────────────────

  IF p_create_order THEN
    v_order_number := public.generate_order_number(v_location_id);
    v_display_number := '#' || SPLIT_PART(v_order_number, '-', 3);

    INSERT INTO public.orders (
      merchant_id,
      location_id,
      order_number,
      display_number,
      order_type,
      status,
      table_number,
      session_id,
      device_id,
      created_by_staff_id,
      created_by_user_id,
      assigned_server_id,
      station_id,
      created_at,
      updated_at
    ) VALUES (
      v_merchant_id,
      v_location_id,
      v_order_number,
      v_display_number,
      'dine_in',
      'draft',
      v_table.name,
      v_session_id,
      p_device_id,
      v_verified_staff_id,        -- POS staff who performed the action
      v_user_id,                  -- Clerk user from JWT
      v_verified_server_id,       -- Server assigned to the table
      p_station_id,
      NOW(),
      NOW()
    )
    RETURNING id INTO v_order_id;

    UPDATE table_sessions
    SET order_id = v_order_id
    WHERE id = v_session_id;

    -- Audit log
    INSERT INTO public.audit_logs (
      actor_user_id,
      organization_id,
      action,
      action_category,
      resource_type,
      resource_name,
      metadata,
      status
    ) VALUES (
      v_user_id,
      (SELECT clerk_org_id FROM public.merchants WHERE id = v_merchant_id),
      'order_created',
      'order_management',
      'order',
      v_order_number,
      jsonb_build_object(
        'order_id', v_order_id,
        'order_type', 'dine_in',
        'table_number', v_table.name,
        'location_id', v_location_id,
        'station_id', p_station_id,
        'session_id', v_session_id,
        'created_by_staff_id', v_verified_staff_id,
        'assigned_server_id', v_verified_server_id,
        'source', 'seat_guests_v5'
      ),
      'success'
    );
  END IF;

  -- ──────────────────────────────────────────────────────────────
  -- 9. Log seated event
  --    triggered_by = POS staff who performed the action
  -- ──────────────────────────────────────────────────────────────

  INSERT INTO table_session_events (
    session_id,
    event_type,
    triggered_by_staff_id,
    triggered_by_user_id,
    event_data
  ) VALUES (
    v_session_id,
    'seated',
    v_verified_staff_id,          -- Who actually did it
    v_user_id,
    jsonb_build_object(
      'party_size', p_party_size,
      'table_name', v_table.name,
      'guest_name', p_guest_name,
      'order_number', v_order_number,
      'assigned_server_id', v_verified_server_id
    )
  );

  -- ──────────────────────────────────────────────────────────────
  -- 10. Update waitlist if linked
  -- ──────────────────────────────────────────────────────────────

  IF p_waitlist_id IS NOT NULL THEN
    UPDATE waitlist
    SET status = 'seated',
        seated_at = NOW(),
        seated_session_id = v_session_id,
        actual_wait_minutes = EXTRACT(EPOCH FROM (NOW() - created_at))::INT / 60
    WHERE id = p_waitlist_id
      AND status IN ('waiting', 'notified', 'arrived');
  END IF;

  -- ──────────────────────────────────────────────────────────────
  -- 11. Update reservation if linked
  -- ──────────────────────────────────────────────────────────────

  IF p_reservation_id IS NOT NULL THEN
    UPDATE reservations
    SET status = 'seated',
        seated_at = NOW(),
        seated_session_id = v_session_id
    WHERE id = p_reservation_id
      AND status IN ('confirmed', 'reminded', 'arrived');
  END IF;

  -- ──────────────────────────────────────────────────────────────
  -- 12. Return
  -- ──────────────────────────────────────────────────────────────

  RETURN json_build_object(
    'success',        true,
    'session_id',     v_session_id,
    'order_id',       v_order_id,
    'order_number',   v_order_number,
    'display_number', v_display_number,
    'session_number', v_session_number,
    'table_name',     v_table.name,
    'status',         'draft'
  );
END;
$$;