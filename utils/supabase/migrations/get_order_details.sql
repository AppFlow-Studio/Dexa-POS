-- ============================================================================
-- get_order_details RPC - Comprehensive order data fetch
-- Used by syncOrderFromBackendComplete() for local state reconciliation
-- ============================================================================
-- UPDATED: Added reversals, order_refund_items, station_name to match broadcast payload

CREATE OR REPLACE FUNCTION get_order_details(p_order_id uuid)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSON;
  v_station_name TEXT;
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
  
  -- Get station name for this order
  SELECT s.station_name INTO v_station_name
  FROM public.orders o
  LEFT JOIN public.stations s ON s.id = o.station_id
  WHERE o.id = p_order_id;

  SELECT json_build_object(
    'order', row_to_json(o.*),
    'station_name', v_station_name,
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
        ORDER BY oi.display_order ASC NULLS LAST, oi.created_at ASC
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
    'reversals', (
      SELECT COALESCE(json_agg(row_to_json(r.*)), '[]'::json)
      FROM public.reversals r
      JOIN public.order_payments op ON op.id = r.original_payment_id
      WHERE op.order_id = o.id
    ),
    'order_refund_items', (
      SELECT COALESCE(json_agg(row_to_json(ori.*)), '[]'::json)
      FROM public.order_refund_items ori
      JOIN public.order_items oi ON oi.id = ori.order_item_id
      WHERE oi.order_id = o.id
    ),
    'status_history', (
      SELECT COALESCE(json_agg(row_to_json(osh.*) ORDER BY osh.changed_at), '[]'::json)
      FROM public.order_status_history osh
      WHERE osh.order_id = o.id
    ),
    'order_discounts', (
      SELECT COALESCE(json_agg(row_to_json(od.*) ORDER BY od.applied_at), '[]'::json)
      FROM public.order_discounts od
      WHERE od.order_id = o.id
        AND od.voided_at IS NULL
    )
  )
  INTO v_result
  FROM public.orders o
  WHERE o.id = p_order_id;
  
  RETURN v_result;
END;
$$;
