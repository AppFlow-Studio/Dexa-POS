-- =====================================================================
-- Migration: remove_order_item_modifier_v2 — Wave 1.4 station-ownership guard
-- =====================================================================
-- Same pattern as Wave 1.3 (modifier-add): the existing SELECT walks
-- modifier → item → order, so v_order_id is in scope for the helper call
-- right after the FOUND check.
--
-- Rollback: remove_order_item_modifier_v2_station_guard_rollback.sql
-- =====================================================================

DROP FUNCTION IF EXISTS public.remove_order_item_modifier_v2(uuid, uuid);

CREATE OR REPLACE FUNCTION public.remove_order_item_modifier_v2(
  p_modifier_id uuid,
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
  v_order_item_id UUID;
  v_order_id UUID;
  v_item_quantity INTEGER;
  v_price_paid NUMERIC(10, 2);
  v_new_modifier_total NUMERIC(10, 2);
  v_new_subtotal NUMERIC(10, 2);
  v_result JSON;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    v_cached := public._idempotency_claim(p_idempotency_key, 'remove_order_item_modifier_v2');
    IF v_cached IS NOT NULL THEN
      RETURN v_cached::json;
    END IF;
  END IF;

  -- BEGIN_VERBATIM
  SELECT oim.order_item_id, oi.order_id, oi.quantity, oi.price_paid
  INTO v_order_item_id, v_order_id, v_item_quantity, v_price_paid
  FROM public.order_item_modifiers oim
  JOIN public.order_items oi ON oi.id = oim.order_item_id
  JOIN public.orders o ON o.id = oi.order_id
  WHERE oim.id = p_modifier_id
    AND oi.is_voided = FALSE
    AND o.merchant_id = user_merchant_id()
    AND o.location_id = ANY(user_location_ids())
    AND o.status NOT IN ('completed', 'cancelled', 'void');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Modifier not found or cannot be removed';
  END IF;

  -- Wave 1.4: refuse to mutate orders owned by another station.
  PERFORM public._assert_order_station_match(v_order_id, p_station_id);

  DELETE FROM public.order_item_modifiers WHERE id = p_modifier_id;

  SELECT COALESCE(SUM(total_price), 0)
  INTO v_new_modifier_total
  FROM public.order_item_modifiers
  WHERE order_item_id = v_order_item_id;

  v_new_subtotal := (v_item_quantity * v_price_paid) + (v_item_quantity * v_new_modifier_total);

  UPDATE public.order_items
  SET subtotal = v_new_subtotal, updated_at = NOW()
  WHERE id = v_order_item_id;

  SELECT json_build_object(
    'success', true,
    'removed_modifier_id', p_modifier_id,
    'order_item_id', v_order_item_id,
    'modifier_total', v_new_modifier_total,
    'new_subtotal', v_new_subtotal
  ) INTO v_result;
  -- END_VERBATIM

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM public._idempotency_complete(p_idempotency_key, 'remove_order_item_modifier_v2', to_jsonb(v_result));
  END IF;

  RETURN v_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.remove_order_item_modifier_v2(uuid, uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.remove_order_item_modifier_v2 IS
  'Removes a modifier from an order item. v2 adds optional p_idempotency_key. Wave 1.4 adds optional p_station_id (NULL = bypass) for cross-station ownership enforcement.';
