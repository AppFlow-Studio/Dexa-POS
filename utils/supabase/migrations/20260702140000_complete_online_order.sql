-- Migration: complete_online_order — merchant-initiated "DONE" of a READY
-- online/OrderOut order (Uber Eats / DoorDash / Grubhub), from the POS Online
-- Orders "Mark done" button.
--
-- Context: mark_online_order_ready (20260702130000) moves an in-kitchen order to
-- 'ready'. Normally the KDS then bumps the order off (served → the order is
-- archived/completed). But when the kitchen never bumps it on the KDS, a ready
-- online order gets stuck in the Online Orders "Ready" lane. This RPC lets the
-- Online Orders operator push it to "Done" (status='completed') from the board.
--
-- Design (DB-only, mirrors mark_online_order_ready):
--   * Guard: only completable from 'ready'. Already 'completed' → benign success.
--     Other states report their current status so the client reconciles.
--   * Sets orders.status='completed' + completed_at.
--   * Bumps the (non-voided, not-yet-served) line items to kitchen_status='served'
--     + completed_at and finalizes kds_item_status — mirrors
--     bulk_update_order_item_status('served'), so the KDS ticket clears (served =
--     picked up / removed from KDS) and item-level reporting is correct. Setting
--     orders.status='completed' also excludes the ticket from get_kds_tickets_v2.
--   * Returns a JSON envelope at HTTP 200 even on the guard-fail branch
--     ('...(current: X)'), matching accept/decline/cancel/ready so the client's
--     resolveEnvelope/parseCurrentStatus can reconcile races.
--
-- Online/OrderOut orders are prepaid via the platform — no POS payment side
-- effects here.
--
-- Per project convention: apply to staging (dfwqakoyittmrwbqvxgw); user deploys
-- prod manually.

-- ============================================================================
-- complete_online_order
-- ============================================================================
CREATE OR REPLACE FUNCTION public.complete_online_order(
  p_order_id uuid
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order RECORD;
  v_now   TIMESTAMPTZ := NOW();
BEGIN
  -- Lock the row to serialize against ready/cancel/KDS races.
  SELECT id, status
    INTO v_order
    FROM public.orders
   WHERE id = p_order_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  -- Already completed → benign success (the KDS auto-complete or another station
  -- beat us).
  IF v_order.status = 'completed' THEN
    RETURN jsonb_build_object(
      'success',      true,
      'order_id',     p_order_id,
      'completed_at', v_now
    );
  END IF;

  -- Only completable from 'ready'. Terminal / other states report their current
  -- status so the client reconciles instead of rolling back.
  IF v_order.status <> 'ready' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'Order cannot be marked done (current: ' || v_order.status || ')'
    );
  END IF;

  UPDATE public.orders
     SET status       = 'completed',
         completed_at = COALESCE(completed_at, v_now),
         updated_at   = v_now
   WHERE id = p_order_id;

  -- Bump line items to 'served' so the KDS ticket clears (served = picked up /
  -- removed from KDS) and item-level reporting is correct. Skip voided items and
  -- any already 'served'. Mirrors bulk_update_order_item_status('served').
  UPDATE public.order_items
     SET kitchen_status = 'served',
         completed_at   = COALESCE(completed_at, v_now),
         updated_at     = v_now
   WHERE order_id = p_order_id
     AND COALESCE(is_voided, false) = false
     AND kitchen_status IS DISTINCT FROM 'served';

  UPDATE public.kds_item_status
     SET status       = 'completed',
         completed_at = COALESCE(completed_at, v_now),
         bumped_at    = v_now
   WHERE order_item_id IN (
           SELECT id FROM public.order_items WHERE order_id = p_order_id
         )
     AND status NOT IN ('cancelled', 'completed');

  -- Audit trail.
  INSERT INTO public.order_status_history
    (order_id, from_status, to_status, changed_at, notes)
  VALUES
    (p_order_id, v_order.status, 'completed', v_now,
     'Marked done by merchant (online order)');

  RETURN jsonb_build_object(
    'success',      true,
    'order_id',     p_order_id,
    'completed_at', v_now
  );
END;
$function$;
