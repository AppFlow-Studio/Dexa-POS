 -- =====================================================================
-- Migration: Update seat_guests RPC to Set Bidirectional Link
-- =====================================================================
-- This migration modifies the existing seat_guests RPC to automatically
-- set the session_id on orders when they are created via p_create_order=true.
--
-- This ensures that every order created through table seating has an
-- immediate bidirectional relationship with its session.
--
-- IMPORTANT: This replaces your existing seat_guests function, preserving
-- all existing logic while adding the bidirectional link.
-- =====================================================================

CREATE OR REPLACE FUNCTION seat_guests_v2(
  p_table_ids UUID[],
  p_party_size INTEGER,
  p_guest_name TEXT DEFAULT NULL,
  p_guest_phone TEXT DEFAULT NULL,
  p_guest_notes TEXT DEFAULT NULL,
  p_reservation_id UUID DEFAULT NULL,
  p_waitlist_id UUID DEFAULT NULL,
  p_create_order BOOLEAN DEFAULT FALSE,
  p_station_id UUID DEFAULT NULL,
  p_device_id TEXT DEFAULT NULL,
  p_staff_id UUID DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_merchant_id UUID;
  v_location_id UUID;
  v_session_id UUID;
  v_order_id UUID;
  v_table_id UUID;
  v_is_first BOOLEAN := TRUE;
  v_server_staff_id UUID;
BEGIN
  -- Get merchant and location from first table
  SELECT fpo.merchant_id, fpo.location_id
  INTO v_merchant_id, v_location_id
  FROM public.floor_plan_objects fpo
  WHERE fpo.id = p_table_ids[1]
    AND fpo.merchant_id = user_merchant_id()
    AND fpo.location_id = ANY(user_location_ids());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Table not found or access denied';
  END IF;

  -- Check if any table is already occupied
  IF EXISTS (
    SELECT 1 FROM public.table_session_tables tst
    JOIN public.table_sessions ts ON ts.id = tst.session_id
    WHERE tst.table_id = ANY(p_table_ids) AND ts.is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'One or more tables are already occupied';
  END IF;

  -- Use provided staff_id OR fall back to JWT-based lookup
  v_server_staff_id := COALESCE(p_staff_id, user_staff_profile_id());

  -- Create session
  INSERT INTO public.table_sessions (
    merchant_id, location_id,
    party_size, guest_name, guest_phone, guest_notes,
    reservation_id, waitlist_id,
    server_staff_id, server_user_id,
    status, seated_at
  ) VALUES (
    v_merchant_id, v_location_id,
    p_party_size, p_guest_name, p_guest_phone, p_guest_notes,
    p_reservation_id, p_waitlist_id,
    v_server_staff_id, get_my_claim('sub'),
    'seated', NOW()
  )
  RETURNING id INTO v_session_id;

  -- Link tables to session
  FOREACH v_table_id IN ARRAY p_table_ids
  LOOP
    INSERT INTO public.table_session_tables (session_id, table_id, is_primary, seated_position)
    VALUES (v_session_id, v_table_id, v_is_first,
            ARRAY_POSITION(p_table_ids, v_table_id) - 1);
    v_is_first := FALSE;
  END LOOP;

  -- Create initial event
  INSERT INTO public.table_session_events (session_id, event_type, triggered_by_staff_id, triggered_by_user_id)
  VALUES (v_session_id, 'seated', v_server_staff_id, get_my_claim('sub'));

  -- Update reservation if provided
  IF p_reservation_id IS NOT NULL THEN
    UPDATE public.reservations
    SET status = 'seated', seated_at = NOW(), seated_session_id = v_session_id
    WHERE id = p_reservation_id;
  END IF;

  -- Update waitlist if provided
  IF p_waitlist_id IS NOT NULL THEN
    UPDATE public.waitlist
    SET status = 'seated', seated_at = NOW(), seated_session_id = v_session_id,
        actual_wait_minutes = EXTRACT(EPOCH FROM (NOW() - created_at)) / 60
    WHERE id = p_waitlist_id;
  END IF;

  -- Create order if requested
  IF p_create_order THEN
    SELECT (public.create_order_v2(
      p_merchant_id := v_merchant_id,
      p_location_id := v_location_id,
      p_order_type := 'dine_in',
      p_table_number := (SELECT name FROM public.floor_plan_objects WHERE id = p_table_ids[1]),
      p_customer_name := p_guest_name,
      p_customer_phone := p_guest_phone,
      p_special_instructions := p_guest_notes,
      p_created_by_staff_id := v_server_staff_id,
      p_station_id := p_station_id,
      p_device_id := p_device_id
    ))->>'order_id' INTO v_order_id;

    -- ===================================================================
    -- NEW: Set bidirectional link between order and session (ATOMIC)
    -- ===================================================================
    IF v_order_id IS NOT NULL THEN
      -- Update order to point to session
      UPDATE public.orders
      SET session_id = v_session_id,
          updated_at = NOW()
      WHERE id = v_order_id::UUID;

      -- Update session to point to order (existing logic kept)
      UPDATE public.table_sessions
      SET order_id = v_order_id::UUID,
          updated_at = NOW()
      WHERE id = v_session_id;
    END IF;
  END IF;

  -- Return response (matching original format)
  RETURN json_build_object(
    'success', true,
    'session_id', v_session_id,
    'order_id', v_order_id,
    'table_ids', p_table_ids,
    'party_size', p_party_size,
    'guest_name', p_guest_name
  );
END;
$$;

-- Grant permissions (should already exist, but ensure it's set)
GRANT EXECUTE ON FUNCTION seat_guests(UUID[], INTEGER, TEXT, TEXT, TEXT, UUID, UUID, BOOLEAN, UUID) TO authenticated;

-- Update comment to reflect bidirectional linking
COMMENT ON FUNCTION seat_guests IS 'Seats guests at specified tables, creates session with event logging, and optionally creates an order with bidirectional session_id link. Includes security checks and supports reservations/waitlist.';

-- =====================================================================
-- Verification Queries:
-- =====================================================================
-- After running this migration, test it with:
--
-- 1. Create a session with order:
-- SELECT seat_guests(
--   p_table_ids := ARRAY['your-table-uuid']::UUID[],
--   p_party_size := 4,
--   p_guest_name := 'Test Guest',
--   p_create_order := true
-- );
--
-- 2. Verify bidirectional link was created:
-- SELECT
--   o.id as order_id,
--   o.session_id as order_session_link,
--   ts.id as session_id,
--   ts.order_id as session_order_link,
--   CASE
--     WHEN o.session_id = ts.id AND ts.order_id = o.id
--     THEN '✓ Bidirectional link correct'
--     ELSE '✗ Link broken'
--   END as link_status
-- FROM public.orders o
-- JOIN public.table_sessions ts ON ts.id = o.session_id
-- WHERE o.id = 'returned-order-id'::UUID;
--
-- 3. Verify table_session_tables junction is populated:
-- SELECT
--   ts.id as session_id,
--   tst.table_id,
--   fpo.name as table_name,
--   tst.is_primary,
--   tst.seated_position
-- FROM public.table_sessions ts
-- JOIN public.table_session_tables tst ON tst.session_id = ts.id
-- JOIN public.floor_plan_objects fpo ON fpo.id = tst.table_id
-- WHERE ts.id = 'returned-session-id'::UUID
-- ORDER BY tst.seated_position;
-- =====================================================================
