-- =====================================================================
-- Migration: add_order_item_v3 — Wave 1.1 station-ownership guard
-- =====================================================================
-- Adds `p_station_id uuid DEFAULT NULL` to add_order_item_v3 and wires it
-- through `_assert_order_station_match` (see assert_order_station_match.sql)
-- so the server rejects writes against orders owned by another station with
-- a typed ORDER_OWNED_BY_OTHER_STATION error.
--
-- Backwards-compat: `p_station_id DEFAULT NULL` lets pre-update clients keep
-- working — the helper bypasses the check when station id is null. The
-- updated client (services/orderService.ts → AddOrderItemParams) starts
-- passing it from `useStoreSettingsStore.getState().selectedStation?.id`.
--
-- The body is otherwise verbatim from add_order_item_v3.sql; the only
-- additions are (1) the parameter, (2) the PERFORM call after the auth
-- lock, and (3) the new GRANT signature.
--
-- DROP-then-CREATE because PostgreSQL treats different parameter counts as
-- distinct overloads — leaving the old signature would let racy clients
-- bypass the check.
--
-- Rollback: add_order_item_v3_station_guard_rollback.sql
-- =====================================================================

DROP FUNCTION IF EXISTS public.add_order_item_v3(uuid, uuid, integer, numeric, numeric, text, text, uuid, uuid, text, numeric, jsonb, text, integer, integer, uuid, text, uuid, uuid);

CREATE OR REPLACE FUNCTION public.add_order_item_v3(
  p_order_id uuid,
  p_menu_item_id uuid DEFAULT NULL,
  p_quantity integer DEFAULT 1,
  p_unit_price numeric DEFAULT 0,
  p_cash_unit_price numeric DEFAULT NULL,
  p_item_name text DEFAULT NULL,
  p_category_name text DEFAULT NULL,
  p_location_exclusive_item_id uuid DEFAULT NULL,
  p_selected_size_id uuid DEFAULT NULL,
  p_selected_size_name text DEFAULT NULL,
  p_size_price_modifier numeric DEFAULT 0,
  p_modifiers jsonb DEFAULT NULL,
  p_special_instructions text DEFAULT NULL,
  p_course_number integer DEFAULT 1,
  p_seat_number integer DEFAULT NULL,
  p_menu_id uuid DEFAULT NULL,
  p_menu_name text DEFAULT NULL,
  p_category_id uuid DEFAULT NULL,
  p_idempotency_key UUID DEFAULT NULL,
  p_station_id uuid DEFAULT NULL  -- Wave 1.1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cached JSONB;
  v_location_id uuid;
  v_merchant_id uuid;
  v_tax_rate numeric := 0;
  v_is_tax_exempt boolean := false;
  v_item_id uuid;
  v_modifier_total numeric := 0;
  v_size_mod numeric;
  v_resolved_cash_unit_price numeric;
  v_effective_card_price numeric;
  v_effective_cash_price numeric;
  v_subtotal numeric;
  v_cash_subtotal numeric;
  v_tax_amount numeric;
  v_cash_tax_amount numeric;
  v_cash_discount_rate numeric := 0.04;
  v_has_active_discount boolean := false;
  v_new_sync_version integer;
  v_result jsonb;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    v_cached := public._idempotency_claim(p_idempotency_key, 'add_order_item_v3');
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

  -- Wave 1.1: refuse to mutate an order owned by another station.
  -- Pass-through when p_station_id is NULL (legacy clients).
  PERFORM public._assert_order_station_match(p_order_id, p_station_id);

  SELECT COALESCE(l.dual_pricing_percentage / 100.0, 0.04) INTO v_cash_discount_rate
  FROM public.locations l WHERE l.id = v_location_id;
  v_cash_discount_rate := COALESCE(v_cash_discount_rate, 0.04);

  IF p_menu_item_id IS NOT NULL THEN
    SELECT COALESCE(tr.percentage, 0),
           COALESCE(lio.is_tax_exempt, mi.is_tax_exempt, false)
    INTO v_tax_rate, v_is_tax_exempt
    FROM public.menu_items mi
    LEFT JOIN public.location_item_overrides lio
      ON lio.menu_item_id = mi.id AND lio.location_id = v_location_id
    LEFT JOIN public.tax_rates tr
      ON tr.location_id = v_location_id
      AND tr.tax_category::text = COALESCE(lio.tax_category, mi.tax_category, 'standard')::text
      AND tr.is_active = true
    WHERE mi.id = p_menu_item_id;

    IF v_is_tax_exempt THEN v_tax_rate := 0; END IF;
  ELSE
    SELECT COALESCE(tr.percentage, 0) INTO v_tax_rate
    FROM public.tax_rates tr
    WHERE tr.location_id = v_location_id AND tr.tax_category = 'standard' AND tr.is_active = true
    LIMIT 1;
  END IF;
  v_tax_rate := COALESCE(v_tax_rate, 0);

  IF p_modifiers IS NOT NULL AND jsonb_array_length(p_modifiers) > 0 THEN
    SELECT COALESCE(SUM(
      COALESCE((mod->>'price_modifier')::numeric, 0) *
      COALESCE((mod->>'quantity')::integer, 1)
    ), 0)
    INTO v_modifier_total
    FROM jsonb_array_elements(p_modifiers) AS mod;
  END IF;

  v_size_mod := COALESCE(p_size_price_modifier, 0);

  v_resolved_cash_unit_price := COALESCE(
    p_cash_unit_price,
    (SELECT mi.cash_price FROM public.menu_items mi WHERE mi.id = p_menu_item_id AND p_menu_item_id IS NOT NULL),
    p_unit_price * (1 - v_cash_discount_rate)
  );

  v_effective_card_price := p_unit_price + v_size_mod + v_modifier_total;
  v_effective_cash_price := v_resolved_cash_unit_price + v_size_mod + v_modifier_total;
  v_subtotal := v_effective_card_price * p_quantity;
  v_cash_subtotal := v_effective_cash_price * p_quantity;
  v_tax_amount := ROUND(v_subtotal * v_tax_rate / 100, 2);
  v_cash_tax_amount := ROUND(v_cash_subtotal * v_tax_rate / 100, 2);

  INSERT INTO public.order_items (
    order_id, menu_item_id, location_exclusive_item_id, item_name, category_name, quantity,
    unit_price, subtotal, tax_rate, tax_amount,
    cash_price, cash_subtotal, cash_tax_amount,
    selected_size_id, selected_size_name, size_price_modifier,
    special_instructions, item_status, course_number, seat_number, paid_quantity,
    created_at, updated_at,
    base_card_price, base_cash_price,
    menu_id, menu_name, category_id
  ) VALUES (
    p_order_id, p_menu_item_id, p_location_exclusive_item_id, p_item_name,
    COALESCE(p_category_name, 'Uncategorized'), p_quantity,
    v_effective_card_price, v_subtotal, v_tax_rate, v_tax_amount,
    v_effective_cash_price, v_cash_subtotal, v_cash_tax_amount,
    p_selected_size_id, p_selected_size_name, v_size_mod,
    p_special_instructions, 'pending', COALESCE(p_course_number, 1),
    p_seat_number, 0, now(), now(),
    p_unit_price, v_resolved_cash_unit_price,
    p_menu_id, p_menu_name, p_category_id
  ) RETURNING id INTO v_item_id;

  IF p_modifiers IS NOT NULL AND jsonb_array_length(p_modifiers) > 0 THEN
    INSERT INTO public.order_item_modifiers (
      order_item_id, modifier_group_id, modifier_item_id, modifier_group_name,
      modifier_name, price_modifier, quantity, total_price, is_no
    )
    SELECT v_item_id,
      (mod->>'modifier_group_id')::uuid,
      (mod->>'modifier_item_id')::uuid,
      mod->>'modifier_group_name',
      mod->>'modifier_name',
      COALESCE((mod->>'price_modifier')::numeric, 0),
      COALESCE((mod->>'quantity')::integer, 1),
      COALESCE((mod->>'price_modifier')::numeric, 0) * COALESCE((mod->>'quantity')::integer, 1),
      COALESCE((mod->>'is_no')::boolean, false)
    FROM jsonb_array_elements(p_modifiers) AS mod;
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.order_discounts
    WHERE order_id = p_order_id AND voided_at IS NULL AND calculated_amount > 0
  ) INTO v_has_active_discount;

  IF v_has_active_discount THEN
    PERFORM redistribute_order_discount(p_order_id);
    SELECT subtotal, tax_amount, cash_subtotal, cash_tax_amount
    INTO v_subtotal, v_tax_amount, v_cash_subtotal, v_cash_tax_amount
    FROM public.order_items WHERE id = v_item_id;
  END IF;

  PERFORM recalculate_order_discount(p_order_id);
  SELECT sync_version INTO v_new_sync_version FROM orders WHERE id = p_order_id;

  v_result := jsonb_build_object(
    'success', true,
    'order_item_id', v_item_id,
    'item_name', p_item_name,
    'quantity', p_quantity,
    'unit_price', v_effective_card_price,
    'cash_price', v_effective_cash_price,
    'modifier_total', v_modifier_total,
    'subtotal', v_subtotal,
    'cash_subtotal', v_cash_subtotal,
    'tax_rate', v_tax_rate,
    'tax_amount', v_tax_amount,
    'cash_tax_amount', v_cash_tax_amount,
    'sync_version', v_new_sync_version
  );
  -- END_VERBATIM

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM public._idempotency_complete(p_idempotency_key, 'add_order_item_v3', v_result);
  END IF;

  RETURN v_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.add_order_item_v3(uuid, uuid, integer, numeric, numeric, text, text, uuid, uuid, text, numeric, jsonb, text, integer, integer, uuid, text, uuid, uuid, uuid) TO authenticated;
