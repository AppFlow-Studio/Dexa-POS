-- Rollback: restore accept_online_order to set status='accepted' (prior prod behavior).
-- decline_online_order is unchanged by the forward migration, so no rollback needed for it.

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

  UPDATE public.orders
     SET status              = 'accepted',
         accepted_at         = v_now,
         sent_to_kitchen_at  = v_now,
         updated_at          = v_now
   WHERE id = p_order_id;

  UPDATE public.order_items
     SET kitchen_status     = 'sent',
         sent_to_kitchen_at = v_now
   WHERE order_id = p_order_id
     AND (kitchen_status IS NULL OR kitchen_status = 'pending');

  INSERT INTO public.order_status_history
    (order_id, from_status, to_status, changed_at, notes)
  VALUES
    (p_order_id, 'pending', 'accepted', v_now, 'Accepted by merchant');

  RETURN jsonb_build_object(
    'success',    true,
    'order_id',   p_order_id,
    'accepted_at', v_now
  );
END;
$function$;
