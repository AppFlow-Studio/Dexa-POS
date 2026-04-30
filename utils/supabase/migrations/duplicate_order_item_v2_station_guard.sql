-- =====================================================================
-- Migration: duplicate_order_item_v2 — Wave 1.4 station-ownership guard
-- =====================================================================
-- Body resolves order via v_original_item.order_id; helper call goes there.
--
-- Rollback: duplicate_order_item_v2_station_guard_rollback.sql
-- =====================================================================

DROP FUNCTION IF EXISTS public.duplicate_order_item_v2(uuid, integer, uuid);

CREATE OR REPLACE FUNCTION public.duplicate_order_item_v2(
  p_order_item_id uuid,
  p_quantity integer DEFAULT NULL,
  p_idempotency_key UUID DEFAULT NULL,
  p_station_id uuid DEFAULT NULL  -- Wave 1.4
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_cached JSONB;
  v_order_id UUID;
  v_new_item_id UUID;
  v_original_item RECORD;
  v_result JSON;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    v_cached := public._idempotency_claim(p_idempotency_key, 'duplicate_order_item_v2');
    IF v_cached IS NOT NULL THEN
      RETURN v_cached::json;
    END IF;
  END IF;

  -- BEGIN_VERBATIM
  SELECT oi.*, o.merchant_id
  INTO v_original_item
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE oi.id = p_order_item_id
    AND oi.is_voided = FALSE
    AND o.merchant_id = user_merchant_id()
    AND o.location_id = ANY(user_location_ids())
    AND o.status NOT IN ('completed', 'cancelled', 'void');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order item not found or cannot be duplicated';
  END IF;

  -- Wave 1.4: refuse to mutate orders owned by another station.
  PERFORM public._assert_order_station_match(v_original_item.order_id, p_station_id);

  INSERT INTO public.order_items (
    order_id, menu_item_id, location_exclusive_item_id, item_name, item_description,
    category_name, quantity, unit_price, cash_price, price_paid, subtotal,
    selected_size_id, selected_size_name, size_price_modifier, special_instructions,
    item_status, prep_station, course_number, created_at, updated_at
  ) VALUES (
    v_original_item.order_id, v_original_item.menu_item_id,
    v_original_item.location_exclusive_item_id, v_original_item.item_name,
    v_original_item.item_description, v_original_item.category_name,
    COALESCE(p_quantity, v_original_item.quantity),
    v_original_item.unit_price, v_original_item.cash_price, v_original_item.price_paid,
    v_original_item.subtotal,
    v_original_item.selected_size_id, v_original_item.selected_size_name,
    v_original_item.size_price_modifier, v_original_item.special_instructions,
    'pending', v_original_item.prep_station, v_original_item.course_number, NOW(), NOW()
  )
  RETURNING id INTO v_new_item_id;

  INSERT INTO public.order_item_modifiers (
    order_item_id, modifier_group_id, modifier_item_id, modifier_group_name,
    modifier_name, price_modifier, quantity, total_price
  )
  SELECT v_new_item_id, modifier_group_id, modifier_item_id, modifier_group_name,
         modifier_name, price_modifier, quantity, total_price
  FROM public.order_item_modifiers
  WHERE order_item_id = p_order_item_id;

  IF p_quantity IS NOT NULL AND p_quantity != v_original_item.quantity THEN
    UPDATE public.order_items
    SET subtotal = (p_quantity * price_paid) + (p_quantity * (
      SELECT COALESCE(SUM(total_price), 0) / v_original_item.quantity
      FROM public.order_item_modifiers
      WHERE order_item_id = v_new_item_id
    ))
    WHERE id = v_new_item_id;
  END IF;

  SELECT json_build_object(
    'success', true,
    'original_item_id', p_order_item_id,
    'new_item_id', v_new_item_id,
    'order_id', v_original_item.order_id,
    'item_name', v_original_item.item_name,
    'quantity', COALESCE(p_quantity, v_original_item.quantity)
  ) INTO v_result;
  -- END_VERBATIM

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM public._idempotency_complete(p_idempotency_key, 'duplicate_order_item_v2', to_jsonb(v_result));
  END IF;

  RETURN v_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.duplicate_order_item_v2(uuid, integer, uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.duplicate_order_item_v2 IS
  'Duplicates an order item. v2 adds optional p_idempotency_key. Wave 1.4 adds optional p_station_id (NULL = bypass) for cross-station ownership enforcement.';
