-- Migration: cancel_online_order — merchant-initiated cancel of an ALREADY-accepted
-- online/OrderOut order (Uber Eats / DoorDash / Grubhub).
--
-- Context: accept_online_order / decline_online_order handle the pending-order
-- accept/reject path. This RPC adds the post-acceptance CANCEL path used by the
-- Online Orders Kanban "Cancel order" action, with a required reason drawn from
-- the OrderOut cancel API enum (ITEM_UNAVAILABLE, STORE_CLOSED, TOO_BUSY,
-- CUSTOMER_REQUEST, CANNOT_FULFILL) plus optional free-text details.
--
-- Design (DB-only, mirrors decline_online_order):
--   * The POS never calls the aggregator directly. This RPC writes the cancel
--     state to `orders` and stamps the `orderout_orders` bridge row
--     (cancel_source='pos', cancelled_at, reject_reason). The EXTERNAL OrderOut
--     integration backend (which owns the platform credentials + webhook bridge)
--     observes that row / the orders.status='cancelled' transition and forwards
--     the cancellation to the marketplace — exactly as it does for accept/decline.
--   * Setting orders.status='cancelled' removes the ticket from the KDS
--     (get_kds_tickets_v2 filters `o.status NOT IN ('completed','cancelled',
--     'void','refunded')`) and from the active-order fetches; items are also
--     voided for item-level correctness.
--   * Returns a JSON envelope at HTTP 200 even on the guard-fail branch
--     ('...(current: X)'), matching accept/decline so the client's
--     resolveEnvelope/parseCurrentStatus can reconcile races.
--
-- Online orders are prepaid via the platform — no POS refund is triggered here.
--
-- Per project convention: apply to staging (dfwqakoyittmrwbqvxgw); user deploys
-- prod manually.

-- ============================================================================
-- cancel_online_order
-- ============================================================================
CREATE OR REPLACE FUNCTION public.cancel_online_order(
  p_order_id uuid,
  p_reason   text,
  p_details  text DEFAULT NULL::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_order        RECORD;
  v_now          TIMESTAMPTZ := NOW();
  v_reason_full  TEXT;
BEGIN
  -- Lock the row to serialize against accept/decline/realtime races.
  SELECT id, status
    INTO v_order
    FROM public.orders
   WHERE id = p_order_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  -- Only cancellable while active. Terminal / completed states report their
  -- current status so the client reconciles instead of rolling back to active.
  IF v_order.status NOT IN ('pending', 'sent_to_kitchen', 'preparing', 'ready') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'Order cannot be cancelled (current: ' || v_order.status || ')'
    );
  END IF;

  -- Combine the OrderOut reason enum with optional free-text details for the
  -- audit trail / bridge row (the enum itself is what the external relay forwards).
  v_reason_full := COALESCE(NULLIF(p_details, ''), NULL);
  v_reason_full := CASE
    WHEN v_reason_full IS NULL THEN p_reason
    ELSE p_reason || ' — ' || v_reason_full
  END;

  UPDATE public.orders
     SET status              = 'cancelled',
         cancelled_at        = v_now,
         cancelled_by        = 'merchant',
         cancellation_reason = v_reason_full,
         updated_at          = v_now
   WHERE id = p_order_id;

  -- Void line items so the KDS ticket clears and item-level reporting is correct.
  UPDATE public.order_items
     SET is_voided  = true,
         updated_at = v_now
   WHERE order_id = p_order_id
     AND COALESCE(is_voided, false) = false;

  -- Signal the OrderOut relay. reject_reason carries the enum (+details);
  -- cancel_source='merchant' marks a merchant-initiated cancel from the POS.
  -- (chk_oo_orders_cancel_source only allows 'platform'/'merchant'/'customer'.)
  -- No-op for website/QR online orders that have no orderout_orders bridge row.
  UPDATE public.orderout_orders
     SET cancel_source = 'merchant',
         cancelled_at  = v_now,
         reject_reason = v_reason_full
   WHERE order_id = p_order_id;

  -- Audit trail (from_status = whatever it was when cancelled).
  INSERT INTO public.order_status_history
    (order_id, from_status, to_status, changed_at, notes)
  VALUES
    (p_order_id, v_order.status, 'cancelled', v_now,
     'Cancelled by merchant (online order): ' || v_reason_full);

  RETURN jsonb_build_object(
    'success',      true,
    'order_id',     p_order_id,
    'cancelled_at', v_now
  );
END;
$function$;
