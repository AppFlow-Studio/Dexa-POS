-- =====================================================================
-- Migration: void_order_and_cancel_reservation — Wave 2.3 station guard
-- =====================================================================
-- Body verbatim from staging via `pg_get_functiondef` (def_length=1625
-- on 2026-04-29, project dfwqakoyittmrwbqvxgw). The diffs are:
--   1. `p_station_id uuid DEFAULT NULL` appended to the parameter list.
--   2. `PERFORM public._assert_order_station_match(p_order_id, p_station_id)`
--      inserted at the top of the body — there's no merchant/location auth
--      check in this wrapper (the auth check lives inside `public.void_order`,
--      which this delegates to). Doing the station check first means we
--      reject cross-station voids before we even touch table_sessions.
--   3. Updated GRANT signature (3 params instead of 2).
--
-- The inner `public.void_order(p_order_id, p_void_reason)` is NOT modified
-- here — clients only call the wrapper, and `_assert_order_station_match`
-- is permissive on null station ids so background callers continue to work.
--
-- Rollback: void_order_and_cancel_reservation_station_guard_rollback.sql
-- =====================================================================

DROP FUNCTION IF EXISTS public.void_order_and_cancel_reservation(uuid, text);

CREATE OR REPLACE FUNCTION public.void_order_and_cancel_reservation(
  p_order_id uuid,
  p_void_reason text DEFAULT 'Order cancelled'::text,
  p_station_id uuid DEFAULT NULL  -- Wave 2.3
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'public', 'pg_temp'
AS $function$
DECLARE
  v_void_result JSONB;
  v_cancelled_count INTEGER := 0;
  v_session_ids UUID[];
BEGIN
  -- Wave 2.3: refuse to void orders owned by another station. Permissive on
  -- null station id (back-compat) and on null order_id (delegate's NOT FOUND
  -- handling stays in charge for that case).
  PERFORM public._assert_order_station_match(p_order_id, p_station_id);

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
$function$;

GRANT EXECUTE ON FUNCTION public.void_order_and_cancel_reservation(uuid, text, uuid) TO authenticated;
