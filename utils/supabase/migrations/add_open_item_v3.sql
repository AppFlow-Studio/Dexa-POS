-- =====================================================================
-- Migration: add_open_item_v3 — adds idempotency-key support
-- =====================================================================
-- Forks from add_open_item_v2 in open-item.sql.
-- Rollback: add_open_item_v3_rollback.sql
-- =====================================================================

CREATE OR REPLACE FUNCTION public.add_open_item_v3(
  p_order_id uuid,
  p_item_name text,
  p_unit_price numeric,
  p_quantity integer DEFAULT 1,
  p_special_instructions text DEFAULT NULL,
  p_is_tax_exempt boolean DEFAULT false,
  p_seat_number integer DEFAULT NULL,
  p_idempotency_key UUID DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_cached JSONB;
  v_location_id uuid;
  v_merchant_id uuid;
  v_tax_rate numeric := 8.0;
  v_item_id uuid;
  v_cash_price numeric;
  v_subtotal numeric;
  v_cash_subtotal numeric;
  v_tax_amount numeric;
  v_cash_tax_amount numeric;
  v_cash_discount_rate numeric;
  v_result jsonb;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    v_cached := public._idempotency_claim(p_idempotency_key, 'add_open_item_v3');
    IF v_cached IS NOT NULL THEN
      RETURN v_cached;
    END IF;
  END IF;

  -- BEGIN_VERBATIM
  SELECT o.location_id, o.merchant_id INTO v_location_id, v_merchant_id
  FROM public.orders o
  WHERE o.id = p_order_id
    AND o.status NOT IN ('completed', 'cancelled', 'void')
    AND o.merchant_id = user_merchant_id()
    AND o.location_id = ANY(user_location_ids())
  FOR UPDATE;

  IF v_location_id IS NULL THEN
    RAISE EXCEPTION 'Order not found or access denied: %', p_order_id;
  END IF;

  SELECT COALESCE(l.dual_pricing_percentage / 100.0, 0.04) INTO v_cash_discount_rate
  FROM public.locations l WHERE l.id = v_location_id;

  IF NOT p_is_tax_exempt THEN
    SELECT COALESCE(tr.percentage, 8.0) INTO v_tax_rate FROM public.tax_rates tr
    WHERE tr.location_id = v_location_id AND tr.tax_category = 'standard' AND tr.is_active = true LIMIT 1;
    v_tax_rate := COALESCE(v_tax_rate, 8.0);
  ELSE
    v_tax_rate := 0;
  END IF;

  v_cash_price := p_unit_price * (1 - v_cash_discount_rate);
  v_subtotal := p_unit_price * p_quantity;
  v_cash_subtotal := v_cash_price * p_quantity;
  v_tax_amount := ROUND(v_subtotal * v_tax_rate / 100, 2);
  v_cash_tax_amount := ROUND(v_cash_subtotal * v_tax_rate / 100, 2);

  INSERT INTO public.order_items (
    order_id, is_open_item, open_item_name, open_item_price, menu_item_id,
    item_name, category_name, quantity, unit_price, subtotal, tax_rate, tax_amount,
    cash_price, cash_subtotal, cash_tax_amount, special_instructions, seat_number,
    item_status, paid_quantity, created_at, updated_at
  ) VALUES (
    p_order_id, TRUE, p_item_name, p_unit_price, NULL,
    p_item_name, 'Open Items', p_quantity, p_unit_price, v_subtotal, v_tax_rate, v_tax_amount,
    v_cash_price, v_cash_subtotal, v_cash_tax_amount, p_special_instructions, p_seat_number,
    'pending', 0, now(), now()
  ) RETURNING id INTO v_item_id;

  PERFORM calculate_order_totals_fast(p_order_id);

  v_result := jsonb_build_object(
    'success', true, 'order_item_id', v_item_id, 'item_name', p_item_name,
    'quantity', p_quantity, 'unit_price', p_unit_price, 'cash_price', v_cash_price,
    'subtotal', v_subtotal, 'cash_subtotal', v_cash_subtotal,
    'tax_rate', v_tax_rate, 'tax_amount', v_tax_amount, 'cash_tax_amount', v_cash_tax_amount
  );
  -- END_VERBATIM

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM public._idempotency_complete(p_idempotency_key, 'add_open_item_v3', v_result);
  END IF;

  RETURN v_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.add_open_item_v3(uuid, text, numeric, integer, text, boolean, integer, uuid) TO authenticated;
