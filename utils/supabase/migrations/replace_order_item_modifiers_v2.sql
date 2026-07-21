-- =====================================================================
-- Migration: replace_order_item_modifiers_v2 — adds idempotency-key support
-- =====================================================================
-- Forks from replace_order_item_modifiers in replace_order_item_modifiers.sql.
-- This is the hot-path RPC for cart-side modifier adjustments — primary
-- mutation when cashiers tap modifier chips. Adding idempotency closes the
-- duplicate-execution gap on offline-queue retries (Category A RPCs CAN
-- queue via executeWithFallback when the deadline expires).
--
-- Rollback: replace_order_item_modifiers_v2_rollback.sql
-- =====================================================================

CREATE OR REPLACE FUNCTION public.replace_order_item_modifiers_v2(
  p_order_item_id uuid,
  p_modifiers jsonb,
  p_idempotency_key UUID DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_cached JSONB;
  v_order_id uuid;
  v_location_id uuid;
  v_base_unit_price numeric;
  v_base_cash_price numeric;
  v_quantity integer;
  v_size_modifier numeric;
  v_tax_rate numeric;
  v_is_tax_exempt boolean;
  v_old_modifier_total numeric := 0;
  v_new_modifier_total numeric := 0;
  v_new_unit_price numeric;
  v_new_cash_unit_price numeric;
  v_new_subtotal numeric;
  v_new_cash_subtotal numeric;
  v_new_tax_amount numeric;
  v_new_cash_tax_amount numeric;
  v_discount_amount numeric := 0;
  v_discount_cash_amount numeric := 0;
  v_has_active_discount boolean := false;
  v_cash_discount_rate numeric := 0.04;
  v_new_sync_version integer;
  v_result json;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    v_cached := public._idempotency_claim(p_idempotency_key, 'replace_order_item_modifiers_v2');
    IF v_cached IS NOT NULL THEN
      RETURN v_cached::json;
    END IF;
  END IF;

  -- BEGIN_VERBATIM
  SELECT
    oi.order_id, oi.unit_price, oi.cash_price, oi.quantity, oi.size_price_modifier,
    oi.tax_rate, COALESCE(oi.is_tax_exempt, false), o.location_id, o.sync_version + 1
  INTO
    v_order_id, v_base_unit_price, v_base_cash_price, v_quantity, v_size_modifier,
    v_tax_rate, v_is_tax_exempt, v_location_id, v_new_sync_version
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE oi.id = p_order_item_id
    AND o.merchant_id = user_merchant_id()
    AND o.location_id = ANY(user_location_ids())
  FOR UPDATE;

  IF v_order_id IS NULL THEN
    RAISE EXCEPTION 'Order item not found or access denied';
  END IF;

  SELECT COALESCE(SUM(total_price), 0)
  INTO v_old_modifier_total
  FROM public.order_item_modifiers
  WHERE order_item_id = p_order_item_id;

  DELETE FROM public.order_item_modifiers WHERE order_item_id = p_order_item_id;

  IF p_modifiers IS NOT NULL AND jsonb_array_length(p_modifiers) > 0 THEN
    INSERT INTO public.order_item_modifiers (
      order_item_id, modifier_group_id, modifier_item_id, modifier_group_name,
      modifier_name, price_modifier, quantity, total_price, is_no
    )
    SELECT p_order_item_id,
      (mod->>'modifier_group_id')::uuid,
      (mod->>'modifier_item_id')::uuid,
      mod->>'modifier_group_name',
      mod->>'modifier_name',
      COALESCE((mod->>'price_modifier')::numeric, 0),
      COALESCE((mod->>'quantity')::integer, 1),
      COALESCE((mod->>'price_modifier')::numeric, 0) * COALESCE((mod->>'quantity')::integer, 1),
      COALESCE((mod->>'is_no')::boolean, false)
    FROM jsonb_array_elements(p_modifiers) AS mod;

    SELECT COALESCE(SUM(total_price), 0)
    INTO v_new_modifier_total
    FROM public.order_item_modifiers
    WHERE order_item_id = p_order_item_id;
  END IF;

  DECLARE
    v_true_base_card_price numeric;
    v_true_base_cash_price numeric;
  BEGIN
    v_true_base_card_price := v_base_unit_price - v_size_modifier - v_old_modifier_total;
    v_true_base_cash_price := v_base_cash_price - v_size_modifier - v_old_modifier_total;
    v_new_unit_price := v_true_base_card_price + v_size_modifier + v_new_modifier_total;
    v_new_cash_unit_price := v_true_base_cash_price + v_size_modifier + v_new_modifier_total;
  END;

  v_new_subtotal := v_new_unit_price * v_quantity;
  v_new_cash_subtotal := v_new_cash_unit_price * v_quantity;

  IF v_is_tax_exempt THEN
    v_new_tax_amount := 0;
    v_new_cash_tax_amount := 0;
  ELSE
    v_new_tax_amount := ROUND(v_new_subtotal * v_tax_rate / 100, 2);
    v_new_cash_tax_amount := ROUND(v_new_cash_subtotal * v_tax_rate / 100, 2);
  END IF;

  UPDATE public.order_items SET
    unit_price = v_new_unit_price, cash_price = v_new_cash_unit_price,
    subtotal = v_new_subtotal, cash_subtotal = v_new_cash_subtotal,
    tax_amount = v_new_tax_amount, cash_tax_amount = v_new_cash_tax_amount,
    discount_amount = 0, discount_cash_amount = 0, updated_at = now()
  WHERE id = p_order_item_id;

  SELECT EXISTS(
    SELECT 1 FROM public.order_discounts
    WHERE order_id = v_order_id AND voided_at IS NULL AND calculated_amount > 0
  ) INTO v_has_active_discount;

  IF v_has_active_discount THEN
    PERFORM redistribute_order_discount(v_order_id);
    SELECT subtotal, cash_subtotal, tax_amount, cash_tax_amount,
           COALESCE(discount_amount, 0), COALESCE(discount_cash_amount, 0)
    INTO v_new_subtotal, v_new_cash_subtotal, v_new_tax_amount, v_new_cash_tax_amount,
         v_discount_amount, v_discount_cash_amount
    FROM public.order_items WHERE id = p_order_item_id;
  END IF;

  v_new_sync_version := increment_order_sync_version(v_order_id);
  PERFORM recalculate_order_discount(v_order_id);

  v_result := json_build_object(
    'success', true,
    'order_item_id', p_order_item_id,
    'old_modifier_total', v_old_modifier_total,
    'new_modifier_total', v_new_modifier_total,
    'new_unit_price', v_new_unit_price,
    'new_subtotal', v_new_subtotal,
    'tax_update', v_new_tax_amount,
    'quantity', v_quantity,
    'unit_price', v_new_unit_price,
    'card_subtotal', v_new_subtotal,
    'card_tax_amount', v_new_tax_amount,
    'cash_unit_price', v_new_cash_unit_price,
    'cash_subtotal', v_new_cash_subtotal,
    'cash_tax_amount', v_new_cash_tax_amount,
    'discount_amount', v_discount_amount,
    'discount_cash_amount', v_discount_cash_amount,
    'sync_version', v_new_sync_version,
    'modifiers', (
      SELECT json_agg(json_build_object(
        'modifier_item_id', modifier_item_id::text,
        'modifier_name', modifier_name,
        'modifier_group_id', modifier_group_id::text,
        'modifier_group_name', modifier_group_name,
        'price_modifier', price_modifier,
        'quantity', quantity,
        'is_no', is_no
      ))
      FROM public.order_item_modifiers
      WHERE order_item_id = p_order_item_id
    )
  );
  -- END_VERBATIM

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM public._idempotency_complete(p_idempotency_key, 'replace_order_item_modifiers_v2', to_jsonb(v_result));
  END IF;

  RETURN v_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.replace_order_item_modifiers_v2(uuid, jsonb, uuid) TO authenticated;

COMMENT ON FUNCTION public.replace_order_item_modifiers_v2 IS
  'Replaces all modifiers on an order item and recalculates pricing. v2 adds optional p_idempotency_key for at-most-once execution.';
