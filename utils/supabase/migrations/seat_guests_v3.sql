-- =====================================================================
-- Migration: seat_guests_v3 — adds idempotency-key support
-- =====================================================================
-- Forks from seat_guests_v2 (update_seat_guests_with_session_linking.sql).
-- Rollback: seat_guests_v3_rollback.sql
-- =====================================================================

CREATE OR REPLACE FUNCTION public.seat_guests_v3(
  p_table_ids uuid[],
  p_party_size integer,
  p_guest_name text DEFAULT NULL,
  p_guest_phone text DEFAULT NULL,
  p_guest_notes text DEFAULT NULL,
  p_reservation_id uuid DEFAULT NULL,
  p_waitlist_id uuid DEFAULT NULL,
  p_create_order boolean DEFAULT false,
  p_station_id uuid DEFAULT NULL,
  p_device_id text DEFAULT NULL,
  p_staff_id uuid DEFAULT NULL,
  p_idempotency_key UUID DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_cached JSONB;
  v_merchant_id UUID;
  v_location_id UUID;
  v_session_id UUID;
  v_order_id UUID;
  v_table_id UUID;
  v_is_first BOOLEAN := TRUE;
  v_server_staff_id UUID;
  v_result JSON;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    v_cached := public._idempotency_claim(p_idempotency_key, 'seat_guests_v3');
    IF v_cached IS NOT NULL THEN
      RETURN v_cached::json;
    END IF;
  END IF;

  -- BEGIN_VERBATIM
  SELECT fpo.merchant_id, fpo.location_id
  INTO v_merchant_id, v_location_id
  FROM public.floor_plan_objects fpo
  WHERE fpo.id = p_table_ids[1]
    AND fpo.merchant_id = user_merchant_id()
    AND fpo.location_id = ANY(user_location_ids());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Table not found or access denied';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.table_session_tables tst
    JOIN public.table_sessions ts ON ts.id = tst.session_id
    WHERE tst.table_id = ANY(p_table_ids) AND ts.is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'One or more tables are already occupied';
  END IF;

  v_server_staff_id := COALESCE(p_staff_id, user_staff_profile_id());

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

  FOREACH v_table_id IN ARRAY p_table_ids
  LOOP
    INSERT INTO public.table_session_tables (session_id, table_id, is_primary, seated_position)
    VALUES (v_session_id, v_table_id, v_is_first,
            ARRAY_POSITION(p_table_ids, v_table_id) - 1);
    v_is_first := FALSE;
  END LOOP;

  INSERT INTO public.table_session_events (session_id, event_type, triggered_by_staff_id, triggered_by_user_id)
  VALUES (v_session_id, 'seated', v_server_staff_id, get_my_claim('sub'));

  IF p_reservation_id IS NOT NULL THEN
    UPDATE public.reservations
    SET status = 'seated', seated_at = NOW(), seated_session_id = v_session_id
    WHERE id = p_reservation_id;
  END IF;

  IF p_waitlist_id IS NOT NULL THEN
    UPDATE public.waitlist
    SET status = 'seated', seated_at = NOW(), seated_session_id = v_session_id,
        actual_wait_minutes = EXTRACT(EPOCH FROM (NOW() - created_at)) / 60
    WHERE id = p_waitlist_id;
  END IF;

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

    IF v_order_id IS NOT NULL THEN
      UPDATE public.orders
      SET session_id = v_session_id,
          updated_at = NOW()
      WHERE id = v_order_id::UUID;

      UPDATE public.table_sessions
      SET order_id = v_order_id::UUID,
          updated_at = NOW()
      WHERE id = v_session_id;
    END IF;
  END IF;

  v_result := json_build_object(
    'success', true,
    'session_id', v_session_id,
    'order_id', v_order_id,
    'table_ids', p_table_ids,
    'party_size', p_party_size,
    'guest_name', p_guest_name
  );
  -- END_VERBATIM

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM public._idempotency_complete(p_idempotency_key, 'seat_guests_v3', to_jsonb(v_result));
  END IF;

  RETURN v_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.seat_guests_v3(uuid[], integer, text, text, text, uuid, uuid, boolean, uuid, text, uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.seat_guests_v3 IS
  'Seats guests at tables, optionally creating an order. v3 adds optional p_idempotency_key for at-most-once execution.';
