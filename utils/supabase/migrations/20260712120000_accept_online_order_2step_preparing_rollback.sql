-- Rollback for 20260712120000_accept_online_order_2step_preparing.sql
-- Restores accept_online_order verbatim from
-- 20260625120000_normalize_accept_online_order_to_sent_to_kitchen.sql
-- (mode-unaware: always sent_to_kitchen / 'sent').
-- The kds_workflow_mode backfill is data-only and intentionally not reverted.

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
