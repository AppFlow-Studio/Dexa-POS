-- Migration: normalize accept_online_order to set status='sent_to_kitchen'
--
-- Context: incoming online/QR orders are created as status='pending'
-- (online_store_config.auto_accept_orders=false). The POS Kanban now wires a
-- real Accept button to accept_online_order. Previously this RPC set
-- status='accepted', but 'accepted' is an orphan status on the POS client:
--   * get_active_orders_v1 / useOrdersQuery filter status IN
--     ('draft','pending','sent_to_kitchen','preparing','ready') -> an accepted
--     order vanishes from the POS on any refetch/reconnect/restart.
--   * STATUS_RANK and bulk_update_order_item_status do not model 'accepted', so
--     a stale 'pending' broadcast could revert it and the KDS bump never
--     auto-advances it.
--
-- Fix: accept_online_order now sets status='sent_to_kitchen' (keeping
-- accepted_at for audit). This makes the whole existing pipeline "just work" and
-- converges manual-accept with the website auto-accept path (process_online_order
-- with p_auto_accept=true already writes 'sent_to_kitchen'). The customer
-- storefront (get_qr_order_status) maps sent_to_kitchen -> "Preparing", which is
-- honest -- the order is in the kitchen.
--
-- These RPCs were prod-only; this file also captures decline_online_order
-- verbatim so the pair lives in version control.
--
-- Per project convention: apply to staging (dfwqakoyittmrwbqvxgw); user deploys
-- prod manually.

-- ============================================================================
-- accept_online_order (NORMALIZED: status='sent_to_kitchen')
-- ============================================================================
CREATE OR REPLACE FUNCTION public.accept_online_order(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order       RECORD;
  v_now         TIMESTAMPTZ := NOW();
BEGIN
  -- Lock the row to prevent race conditions
  SELECT id, status, location_id, merchant_id
    INTO v_order
    FROM public.orders
   WHERE id = p_order_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF v_order.status <> 'pending' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'Order is not in pending status (current: ' || v_order.status || ')'
    );
  END IF;

  -- Transition: pending -> sent_to_kitchen (keep accepted_at for audit).
  -- Setting status directly to sent_to_kitchen keeps the order visible to the
  -- POS active-order fetches and lets the KDS bump auto-advance it.
  UPDATE public.orders
     SET status              = 'sent_to_kitchen',
         accepted_at         = v_now,
         sent_to_kitchen_at  = v_now,
         updated_at          = v_now
   WHERE id = p_order_id;

  -- Fire all items to kitchen
  UPDATE public.order_items
     SET kitchen_status     = 'sent',
         sent_to_kitchen_at = v_now
   WHERE order_id = p_order_id
     AND (kitchen_status IS NULL OR kitchen_status = 'pending');

  -- Audit trail
  INSERT INTO public.order_status_history
    (order_id, from_status, to_status, changed_at, notes)
  VALUES
    (p_order_id, 'pending', 'sent_to_kitchen', v_now, 'Accepted by merchant (online order)');

  RETURN jsonb_build_object(
    'success',     true,
    'order_id',    p_order_id,
    'accepted_at', v_now
  );
END;
$function$;

-- ============================================================================
-- decline_online_order (captured verbatim from prod -- unchanged)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.decline_online_order(p_order_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order RECORD;
  v_now   TIMESTAMPTZ := NOW();
BEGIN
  SELECT id, status
    INTO v_order
    FROM public.orders
   WHERE id = p_order_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF v_order.status <> 'pending' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   'Order is not in pending status (current: ' || v_order.status || ')'
    );
  END IF;

  UPDATE public.orders
     SET status           = 'declined',
         declined_at      = v_now,
         declined_reason  = p_reason,
         cancelled_at     = v_now,
         cancelled_by     = 'merchant',
         updated_at       = v_now
   WHERE id = p_order_id;

  INSERT INTO public.order_status_history
    (order_id, from_status, to_status, changed_at, notes)
  VALUES
    (p_order_id, 'pending', 'declined', v_now,
     COALESCE('Declined by merchant: ' || p_reason, 'Declined by merchant'));

  RETURN jsonb_build_object(
    'success',     true,
    'order_id',    p_order_id,
    'declined_at', v_now
  );
END;
$function$;
