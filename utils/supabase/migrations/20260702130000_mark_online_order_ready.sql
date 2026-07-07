-- Migration: mark_online_order_ready — merchant-initiated "READY FOR PICKUP" of an
-- ALREADY-accepted online/OrderOut order (Uber Eats / DoorDash / Grubhub).
--
-- Context: accept/decline_online_order cover the pending accept/reject path and
-- cancel_online_order (20260702120000) the post-acceptance cancel path. This RPC
-- adds the READY path used by:
--   1. the Online Orders "Mark ready" button (manual, via this RPC), and
--   2. the KDS auto-transition — when the kitchen bumps the last item to served,
--      useKDSStore calls update_order_status(..., 'ready') (unchanged).
--
-- Design (DB-only, mirrors cancel_online_order):
--   * The POS never calls the OrderOut API directly. This RPC sets
--     orders.status='ready' (+ ready_at). The EXTERNAL OrderOut integration layer
--     relays mark-ready to the marketplace off the orders.status='ready'
--     transition — the same status-transition signal it uses for 'cancelled'.
--   * NOTE on the bridge: orderout_orders has NO "readied" marker column, and
--     orderout_orders.ready_by is the platform's PROMISED ready-by timestamp
--     (set at order creation from process_online_order.p_ready_by) — it must NOT
--     be repurposed. The ready signal is the orders.status transition, not a
--     bridge stamp. The automatic KDS path therefore needs no client change.
--   * Returns a JSON envelope at HTTP 200 even on the guard-fail branch
--     ('...(current: X)'), matching accept/decline/cancel so the client's
--     resolveEnvelope/parseCurrentStatus can reconcile races.
--
-- KDS consistency: get_kds_tickets_v2 builds tickets from order_items.kitchen_status
-- (NOT orders.status), so flipping only the order-level status would leave the KDS
-- ticket stuck in sent/preparing. We therefore also advance the (non-voided,
-- not-yet-served) line items to kitchen_status='ready' + stamp completed_at, and
-- sync kds_item_status — mirroring bulk_update_order_item_status('ready'). 'ready'
-- (done cooking, still visible on the KDS ready column), NOT 'served'
-- (picked up / bumped away), matches "ready for pickup". The automatic KDS path is
-- already consistent (items are bumped to 'served' before the order flips to ready).
--
-- Online orders are prepaid via the platform — no POS payment side effects here.
--
-- Per project convention: apply to staging (dfwqakoyittmrwbqvxgw); user deploys
-- prod manually.

-- ============================================================================
-- mark_online_order_ready
-- ============================================================================
CREATE OR REPLACE FUNCTION public.mark_online_order_ready(
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
  -- Lock the row to serialize against accept/decline/cancel/KDS races.
  SELECT id, status
    INTO v_order
    FROM public.orders
   WHERE id = p_order_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  -- Already ready → benign success (the KDS or another station beat us).
  IF v_order.status = 'ready' THEN
    RETURN jsonb_build_object(
      'success',  true,
      'order_id', p_order_id,
      'ready_at', v_now
    );
  END IF;

  -- Only markable ready from an in-kitchen state. Terminal / other states report
  -- their current status so the client reconciles instead of rolling back.
  IF v_order.status NOT IN ('accepted', 'sent_to_kitchen', 'preparing') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'Order cannot be marked ready (current: ' || v_order.status || ')'
    );
  END IF;

  -- Flip to ready. The OrderOut integration layer observes this transition and
  -- relays mark-ready to the marketplace.
  UPDATE public.orders
     SET status     = 'ready',
         ready_at   = COALESCE(ready_at, v_now),
         updated_at = v_now
   WHERE id = p_order_id;

  -- Advance kitchen status so the KDS reflects "ready" (done cooking, still
  -- visible on the KDS ready column). Mirrors bulk_update_order_item_status('ready').
  -- Skip voided items and any already 'served' (don't downgrade bumped items).
  UPDATE public.order_items
     SET kitchen_status = 'ready',
         completed_at   = COALESCE(completed_at, v_now),
         updated_at     = v_now
   WHERE order_id = p_order_id
     AND COALESCE(is_voided, false) = false
     AND kitchen_status IS DISTINCT FROM 'served';

  UPDATE public.kds_item_status
     SET completed_at = COALESCE(completed_at, v_now)
   WHERE order_item_id IN (
           SELECT id FROM public.order_items WHERE order_id = p_order_id
         )
     AND status NOT IN ('cancelled', 'completed');

  -- Audit trail (from_status = whatever it was when marked ready).
  INSERT INTO public.order_status_history
    (order_id, from_status, to_status, changed_at, notes)
  VALUES
    (p_order_id, v_order.status, 'ready', v_now,
     'Marked ready by merchant (online order)');

  RETURN jsonb_build_object(
    'success',  true,
    'order_id', p_order_id,
    'ready_at', v_now
  );
END;
$function$;
