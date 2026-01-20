CREATE OR REPLACE FUNCTION get_order_details(
p_order_id uuid;
);
DECLARE
  v_result JSON;
BEGIN
  -- Verify user has access
  IF NOT EXISTS (
    SELECT 1 FROM public.orders
    WHERE id = p_order_id
      AND merchant_id = user_merchant_id()
      AND location_id = ANY(user_location_ids())
  ) THEN
    RAISE EXCEPTION 'Order not found or access denied';
  END IF;
  
  -- Verify user has permission
  -- IF NOT auth.has_any_permission(ARRAY['location.orders.view', 'merchant.orders.view']) THEN
  --   RAISE EXCEPTION 'Permission denied: location.orders.view or merchant.orders.view required';
  -- END IF;
  
  SELECT json_build_object(
    'order', row_to_json(o.*),
    'items', (
      SELECT COALESCE(json_agg(
        json_build_object(
          'item', row_to_json(oi.*),
          'modifiers', (
            SELECT COALESCE(json_agg(row_to_json(oim.*)), '[]'::json)
            FROM public.order_item_modifiers oim
            WHERE oim.order_item_id = oi.id
          )
        )
      ), '[]'::json)
      FROM public.order_items oi
      WHERE oi.order_id = o.id
        AND oi.is_voided = FALSE
    ),
    'payments', (
      SELECT COALESCE(json_agg(row_to_json(op.*)), '[]'::json)
      FROM public.order_payments op
      WHERE op.order_id = o.id
    ),
    'status_history', (
      SELECT COALESCE(json_agg(row_to_json(osh.*) ORDER BY osh.changed_at), '[]'::json)
      FROM public.order_status_history osh
      WHERE osh.order_id = o.id
    )
  )
  INTO v_result
  FROM public.orders o
  WHERE o.id = p_order_id;
  
  RETURN v_result;
END;
