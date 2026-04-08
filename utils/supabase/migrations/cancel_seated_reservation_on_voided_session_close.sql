-- Direct RPC approach (no trigger): explicitly cancel seated reservation(s)
-- linked to a voided order's table session.

DROP TRIGGER IF EXISTS trg_cancel_reservation_on_session_close ON public.table_sessions;
DROP FUNCTION IF EXISTS public.cancel_seated_reservation_on_voided_session_close();

CREATE OR REPLACE FUNCTION public.cancel_reservation_for_voided_order(
  p_order_id UUID,
  p_reason TEXT DEFAULT 'Order voided'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order_status TEXT;
  v_cancelled_count INTEGER := 0;
BEGIN
  SELECT o.status
  INTO v_order_status
  FROM public.orders o
  WHERE o.id = p_order_id
    AND o.merchant_id = user_merchant_id()
    AND o.location_id = ANY(user_location_ids());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF v_order_status <> 'void' THEN
    RETURN json_build_object(
      'success', false,
      'order_id', p_order_id,
      'message', 'Order is not void'
    );
  END IF;

  UPDATE public.reservations r
  SET
    status = 'cancelled',
    cancelled_at = COALESCE(r.cancelled_at, NOW()),
    cancellation_reason = COALESCE(r.cancellation_reason, p_reason)
  WHERE r.seated_session_id IN (
    SELECT ts.id
    FROM public.table_sessions ts
    WHERE ts.order_id = p_order_id
  )
    AND r.status = 'seated';

  GET DIAGNOSTICS v_cancelled_count = ROW_COUNT;

  RETURN json_build_object(
    'success', true,
    'order_id', p_order_id,
    'cancelled_count', v_cancelled_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_reservation_for_voided_order(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.cancel_reservation_for_voided_order(UUID, TEXT)
IS 'Explicit RPC: cancels seated reservations linked by seated_session_id to sessions of a voided order.';

CREATE OR REPLACE FUNCTION public.void_order_and_cancel_reservation(
  p_order_id UUID,
  p_void_reason TEXT DEFAULT 'Order cancelled'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_void_result JSONB;
  v_cancelled_count INTEGER := 0;
  v_session_ids UUID[];
BEGIN
  -- Snapshot linked session IDs before void_order in case underlying logic
  -- clears/relinks table_sessions.order_id during close.
  SELECT COALESCE(array_agg(ts.id), ARRAY[]::UUID[])
  INTO v_session_ids
  FROM public.table_sessions ts
  WHERE ts.order_id = p_order_id;

  -- Reuse existing void logic unchanged.
  v_void_result := COALESCE(
    public.void_order(p_order_id, p_void_reason)::JSONB,
    '{}'::JSONB
  );

  -- Fallback: if nothing was linked pre-void, try post-void linkage.
  IF array_length(v_session_ids, 1) IS NULL THEN
    SELECT COALESCE(array_agg(ts.id), ARRAY[]::UUID[])
    INTO v_session_ids
    FROM public.table_sessions ts
    WHERE ts.order_id = p_order_id;
  END IF;

  -- Cancel seated reservation(s) linked to this order's table session(s).
  UPDATE public.reservations r
  SET
    status = 'cancelled',
    cancelled_at = COALESCE(r.cancelled_at, NOW()),
    cancellation_reason = COALESCE(r.cancellation_reason, p_void_reason)
  WHERE r.seated_session_id = ANY(v_session_ids)
    AND r.status = 'seated';

  GET DIAGNOSTICS v_cancelled_count = ROW_COUNT;

  RETURN (
    v_void_result || jsonb_build_object(
      'reservation_cancelled_count', v_cancelled_count
    )
  )::JSON;
END;
$$;

GRANT EXECUTE ON FUNCTION public.void_order_and_cancel_reservation(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.void_order_and_cancel_reservation(UUID, TEXT)
IS 'Atomic wrapper: voids an order via void_order and cancels seated reservations linked by seated_session_id in one RPC call.';
