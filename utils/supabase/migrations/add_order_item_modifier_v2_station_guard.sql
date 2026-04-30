-- =====================================================================
-- Migration: add_order_item_modifier_v2 — Wave 1.3 station-ownership guard
-- =====================================================================
-- This RPC takes `p_order_item_id` rather than `p_order_id`, so the helper
-- call comes AFTER the existing SELECT that resolves v_order_id from the
-- item. Otherwise identical pattern to Wave 1.1/1.2.
--
-- Rollback: add_order_item_modifier_v2_station_guard_rollback.sql
-- =====================================================================

DROP FUNCTION IF EXISTS public.add_order_item_modifier_v2(uuid, uuid, uuid, text, text, numeric, integer, uuid);

CREATE OR REPLACE FUNCTION public.add_order_item_modifier_v2(
  p_order_item_id uuid,
  p_modifier_group_id uuid,
  p_modifier_item_id uuid,
  p_modifier_group_name text,
  p_modifier_name text,
  p_price_modifier numeric,
  p_quantity integer DEFAULT 1,
  p_idempotency_key UUID DEFAULT NULL,
  p_station_id uuid DEFAULT NULL  -- Wave 1.3
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_cached JSONB;
  v_order_id UUID;
  v_item_quantity INTEGER;
  v_price_paid NUMERIC(10, 2);
  v_modifier_id UUID;
  v_new_modifier_total NUMERIC(10, 2);
  v_new_subtotal NUMERIC(10, 2);
  v_result JSON;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    v_cached := public._idempotency_claim(p_idempotency_key, 'add_order_item_modifier_v2');
    IF v_cached IS NOT NULL THEN
      RETURN v_cached::json;
    END IF;
  END IF;

  -- BEGIN_VERBATIM (body from baseline_add_order_item_modifier.sql)
  SELECT oi.order_id, oi.quantity, oi.price_paid
  INTO v_order_id, v_item_quantity, v_price_paid
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE oi.id = p_order_item_id
    AND oi.is_voided = FALSE
    AND o.merchant_id = user_merchant_id()
    AND o.location_id = ANY(user_location_ids())
    AND o.status NOT IN ('completed', 'cancelled', 'void');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order item not found or cannot be modified';
  END IF;

  -- Wave 1.3: refuse to mutate orders owned by another station.
  -- v_order_id is resolved from the item row above.
  PERFORM public._assert_order_station_match(v_order_id, p_station_id);

  INSERT INTO public.order_item_modifiers (
    order_item_id, modifier_group_id, modifier_item_id,
    modifier_group_name, modifier_name, price_modifier, quantity, total_price
  ) VALUES (
    p_order_item_id, p_modifier_group_id, p_modifier_item_id,
    p_modifier_group_name, p_modifier_name, p_price_modifier, p_quantity,
    p_price_modifier * p_quantity
  )
  RETURNING id INTO v_modifier_id;

  SELECT COALESCE(SUM(total_price), 0)
  INTO v_new_modifier_total
  FROM public.order_item_modifiers
  WHERE order_item_id = p_order_item_id;

  v_new_subtotal := (v_item_quantity * v_price_paid) + (v_item_quantity * v_new_modifier_total);

  UPDATE public.order_items
  SET subtotal = v_new_subtotal, updated_at = NOW()
  WHERE id = p_order_item_id;

  SELECT json_build_object(
    'success', true,
    'modifier_id', v_modifier_id,
    'order_item_id', p_order_item_id,
    'modifier_name', p_modifier_name,
    'modifier_total', v_new_modifier_total,
    'new_subtotal', v_new_subtotal
  ) INTO v_result;
  -- END_VERBATIM

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM public._idempotency_complete(p_idempotency_key, 'add_order_item_modifier_v2', to_jsonb(v_result));
  END IF;

  RETURN v_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.add_order_item_modifier_v2(uuid, uuid, uuid, text, text, numeric, integer, uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.add_order_item_modifier_v2 IS
  'Adds a modifier to an order item. v2 adds optional p_idempotency_key for at-most-once execution. Wave 1.3 adds optional p_station_id for cross-station ownership enforcement (NULL = bypass).';
