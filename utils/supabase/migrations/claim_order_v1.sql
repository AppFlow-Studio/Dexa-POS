-- =====================================================================
-- Migration: claim_order_v1 — Lever 2: ownership transfer between stations
-- =====================================================================
-- Atomic, optimistic-concurrency claim of `orders.station_id`. Used by the
-- "Take Over" UX to transfer cart-edit ownership from one station to
-- another. The previous owner sees the order leave their orderline (or flip
-- to read-only) via the existing AFTER UPDATE trigger broadcast on `orders`
-- (see update_order_broadcast.sql) — no explicit realtime.send() needed
-- here.
--
-- Returns jsonb { success, error?, order_id?, new_station_id?, sync_version? }.
-- Error codes (typed for client handling, see services/orderService.ts:claimOrder):
--   - ORDER_NOT_FOUND            — order missing or not in caller's location
--   - ORDER_FINALIZED            — order already void/cancelled/completed
--   - CONCURRENT_CLAIM           — another station claimed first (lost the race)
--
-- ORDER_LOCKED_FOR_PAYMENT is intentionally not emitted yet — the
-- payment_lock_* columns it relied on don't exist on this DB. The client
-- still understands the code, so re-enabling is a one-block edit.
--
-- Rollback: claim_order_v1_rollback.sql
-- =====================================================================

CREATE OR REPLACE FUNCTION public.claim_order_v1(
  p_order_id uuid,
  p_station_id uuid,
  p_expected_station_id uuid DEFAULT NULL  -- NULL = "I expect the order to be unowned"
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.orders%ROWTYPE;
  v_updated_count int;
  v_new_version int;
  v_current_station_id uuid;
BEGIN
  -- Auth + lock the row for the duration of the claim. Mirrors the pattern
  -- in add_order_item_v3.
  SELECT *
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
    AND merchant_id = user_merchant_id()
    AND location_id = ANY(user_location_ids())
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'ORDER_NOT_FOUND');
  END IF;

  -- No claiming finalized orders.
  IF v_order.status IN ('void', 'cancelled', 'completed') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'ORDER_FINALIZED',
      'status', v_order.status
    );
  END IF;

  -- Payment-lock guard intentionally omitted: orders.payment_lock_station_id /
  -- payment_lock_expires_at are not present on the current DB
  -- (phase6_sync_version.sql never landed here). Re-introduce when those
  -- columns exist; the client (services/orderService.ts) already maps a
  -- typed ORDER_LOCKED_FOR_PAYMENT response, so the wiring is ready.

  -- No-op shortcut: already ours.
  IF v_order.station_id IS NOT DISTINCT FROM p_station_id THEN
    RETURN jsonb_build_object(
      'success', true,
      'order_id', p_order_id,
      'new_station_id', p_station_id,
      'sync_version', COALESCE(v_order.sync_version, 0)
    );
  END IF;

  -- Optimistic concurrency: the UPDATE only fires if station_id still matches
  -- the caller's expectation. Loser of a concurrent claim race gets ROW_COUNT=0
  -- and a CONCURRENT_CLAIM error.
  UPDATE public.orders
  SET station_id = p_station_id,
      sync_version = COALESCE(sync_version, 0) + 1,
      updated_at = now()
  WHERE id = p_order_id
    AND station_id IS NOT DISTINCT FROM p_expected_station_id;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  IF v_updated_count = 0 THEN
    -- Race-loss path: re-read so the client knows who owns it now.
    SELECT station_id INTO v_current_station_id
    FROM public.orders
    WHERE id = p_order_id;

    RETURN jsonb_build_object(
      'success', false,
      'error', 'CONCURRENT_CLAIM',
      'current_station_id', v_current_station_id
    );
  END IF;

  -- Re-read the bumped sync_version so the client can dedupe the broadcast
  -- echo against the optimistic local update.
  SELECT sync_version INTO v_new_version
  FROM public.orders
  WHERE id = p_order_id;

  -- The orders_broadcast_trigger on UPDATE handles realtime fan-out.
  -- We don't call realtime.send() ourselves.

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'new_station_id', p_station_id,
    'sync_version', v_new_version
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.claim_order_v1(uuid, uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.claim_order_v1(uuid, uuid, uuid) IS
'Lever 2 — atomic optimistic-concurrency transfer of orders.station_id. Returns typed errors (ORDER_NOT_FOUND, ORDER_FINALIZED, ORDER_LOCKED_FOR_PAYMENT, CONCURRENT_CLAIM). Used by the cross-station Take Over UX. The orders_broadcast_trigger handles realtime fan-out.';
