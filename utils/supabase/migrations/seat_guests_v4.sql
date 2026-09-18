-- =====================================================================
-- Migration: seat_guests_v4 — client-minted session id and order id
-- =====================================================================
-- Forks from seat_guests_v3 in seat_guests_v3.sql.
-- Rollback: seat_guests_v4_rollback.sql
-- Requires: create_order_v4.sql (uses create_order_v4 and the display-number helper)
--
-- WHY — docs/engineering/architecture/local-first-orders-seating.md §6, §9.
--
-- Seating is where the identity problem hurts most, because ONE tap creates
-- TWO rows (a session and an order) that a dozen client-side structures then
-- reference. Under v3 both ids are minted server-side, so the device holds
-- placeholders until the RPC returns — which is the sole reason the POS shows
-- "Seating in progress — please wait until the table is seated before adding
-- items" (useOrderStore.ts:8373) and why hydrateOrderFromSeat exists at all.
--
-- v4 accepts both ids from the device, so the table is seated and the order is
-- open on the next frame, online or off.
--
-- THREE BEHAVIOURS ADDED OVER v3
--   1. Idempotent on p_session_id — a retried seat returns the same session
--      rather than raising 'already occupied' against its own first attempt.
--      Without this, every lost response turns into a stuck table.
--   2. Delegates order creation to create_order_v4 (v3 called create_order_v2)
--      so the order id and number are the device's too.
--   3. Returns a STRUCTURED 'table_occupied' result instead of RAISE. See the
--      block at the occupancy check — this is what lets an offline
--      double-seat be resolved without losing a guest's order (§9.5).
--
-- BACKWARD COMPATIBLE: new params default to NULL, in which case v4 behaves
-- like v3 (server mints). seat_guests_v3 is left in place as the rollback.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.seat_guests_v4(
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
  p_idempotency_key UUID DEFAULT NULL,
  p_session_id uuid DEFAULT NULL,
  p_order_id uuid DEFAULT NULL,
  p_order_number text DEFAULT NULL
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
  v_existing RECORD;
  v_blocking RECORD;
  v_create_result JSONB;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    v_cached := public._idempotency_claim(p_idempotency_key, 'seat_guests_v4');
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

  -- -------------------------------------------------------------------
  -- (1) ROW-LEVEL IDEMPOTENCY, before the occupancy check.
  --
  -- Order matters here. If the occupancy check ran first, a retry of a seat
  -- that DID land would see its own session holding the table and report
  -- 'occupied' — turning a lost response into a permanently stuck table.
  -- -------------------------------------------------------------------
  IF p_session_id IS NOT NULL THEN
    SELECT id, order_id, party_size, guest_name
      INTO v_existing
      FROM public.table_sessions
     WHERE id = p_session_id
       AND merchant_id = v_merchant_id;

    IF FOUND THEN
      v_result := json_build_object(
        'success', true,
        'session_id', v_existing.id,
        'order_id', v_existing.order_id,
        'table_ids', p_table_ids,
        'party_size', v_existing.party_size,
        'guest_name', v_existing.guest_name,
        'already_existed', true
      );

      IF p_idempotency_key IS NOT NULL THEN
        PERFORM public._idempotency_complete(p_idempotency_key, 'seat_guests_v4', to_jsonb(v_result));
      END IF;

      RETURN v_result;
    END IF;
  END IF;

  -- -------------------------------------------------------------------
  -- (2) OCCUPANCY — reported, not raised.
  --
  -- v3 did: RAISE EXCEPTION 'One or more tables are already occupied'.
  --
  -- That is correct online, where the device can see the table is taken
  -- before it offers to seat it. It is WRONG for an offline-first client:
  -- two stations that both seat table 12 while partitioned each created a
  -- real session and a real order with real items on them, and whichever
  -- syncs second would have its write rejected with an exception — dropping
  -- a guest's order on the floor.
  --
  -- So v4 reports the conflict as data. The client's rule (§9.5): the lower
  -- (lamport, device_id) keeps the table, the loser's ORDER IS PRESERVED and
  -- detached, and a manager is shown "Table 12 was seated on two stations —
  -- merge these checks or move one."
  --
  -- Losing a table assignment is recoverable. Losing an order is not.
  -- -------------------------------------------------------------------
  SELECT ts.id AS session_id, ts.order_id, tst.table_id, ts.seated_at
    INTO v_blocking
    FROM public.table_session_tables tst
    JOIN public.table_sessions ts ON ts.id = tst.session_id
   WHERE tst.table_id = ANY(p_table_ids)
     AND ts.is_active = TRUE
   ORDER BY ts.seated_at ASC
   LIMIT 1;

  IF FOUND THEN
    v_result := json_build_object(
      'success', false,
      'error', 'table_occupied',
      'occupied_by_session_id', v_blocking.session_id,
      'occupied_by_order_id', v_blocking.order_id,
      'occupied_table_id', v_blocking.table_id,
      'occupied_since', v_blocking.seated_at,
      'requested_session_id', p_session_id,
      'requested_order_id', p_order_id
    );

    -- Deliberately NOT written to the idempotency cache: the conflict is a
    -- property of the world at this instant, not a completed result. Caching
    -- it would make a later legitimate retry (after the table is freed)
    -- replay a stale failure.
    RETURN v_result;
  END IF;

  v_server_staff_id := COALESCE(p_staff_id, user_staff_profile_id());
  v_session_id := COALESCE(p_session_id, gen_random_uuid());

  INSERT INTO public.table_sessions (
    id, merchant_id, location_id,
    party_size, guest_name, guest_phone, guest_notes,
    reservation_id, waitlist_id,
    server_staff_id, server_user_id,
    status, seated_at
  ) VALUES (
    v_session_id, v_merchant_id, v_location_id,
    p_party_size, p_guest_name, p_guest_phone, p_guest_notes,
    p_reservation_id, p_waitlist_id,
    v_server_staff_id, get_my_claim('sub'),
    'seated', NOW()
  );

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

  -- -------------------------------------------------------------------
  -- (3) ORDER CREATION — now via create_order_v4, carrying the device's id.
  --
  -- v3 called create_order_v2, which mints server-side. Passing p_order_id
  -- and p_order_number through is what removes hydrateOrderFromSeat and the
  -- rekey fan-out on the client.
  --
  -- No idempotency key is forwarded: create_order_v4 is idempotent on the
  -- order id itself, which is the stronger guarantee, and reusing THIS
  -- function's key for a nested call would collide in idempotency_keys.
  -- -------------------------------------------------------------------
  IF p_create_order THEN
    v_create_result := public.create_order_v4(
      p_merchant_id := v_merchant_id,
      p_location_id := v_location_id,
      p_order_type := 'dine_in',
      p_table_number := (SELECT name FROM public.floor_plan_objects WHERE id = p_table_ids[1]),
      p_customer_name := p_guest_name,
      p_customer_phone := p_guest_phone,
      p_special_instructions := p_guest_notes,
      p_created_by_staff_id := v_server_staff_id,
      p_station_id := p_station_id,
      p_device_id := p_device_id,
      p_order_id := p_order_id,
      p_order_number := p_order_number
    );

    v_order_id := (v_create_result->>'order_id')::UUID;

    IF v_order_id IS NOT NULL THEN
      UPDATE public.orders
      SET session_id = v_session_id,
          updated_at = NOW()
      WHERE id = v_order_id;

      UPDATE public.table_sessions
      SET order_id = v_order_id,
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
    'guest_name', p_guest_name,
    'already_existed', false,
    -- Surfaced so the device can correct its display if its locally minted
    -- number collided and create_order_v4 reassigned it (§6.3).
    'order_number', v_create_result->>'order_number',
    'display_number', v_create_result->>'display_number',
    'order_number_reassigned', COALESCE((v_create_result->>'order_number_reassigned')::boolean, false)
  );
  -- END_VERBATIM

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM public._idempotency_complete(p_idempotency_key, 'seat_guests_v4', to_jsonb(v_result));
  END IF;

  RETURN v_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.seat_guests_v4(uuid[], integer, text, text, text, uuid, uuid, boolean, uuid, text, uuid, uuid, uuid, uuid, text) TO authenticated;

COMMENT ON FUNCTION public.seat_guests_v4 IS
  'Seats guests at tables, optionally creating an order. v4 accepts client-minted p_session_id / '
  'p_order_id / p_order_number (the Identity Gate), is idempotent on the session id, and reports '
  'an occupied table as a structured result instead of raising so an offline double-seat can be '
  'resolved without losing an order.';
