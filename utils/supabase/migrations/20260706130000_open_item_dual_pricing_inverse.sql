-- =====================================================================
-- Migration: open-item dual pricing — correct inverse + gating + source
-- =====================================================================
-- In-place CREATE OR REPLACE of the three live open-item RPCs. No signature
-- changes. Fixes three inconsistencies vs the client's canonical model
-- (cashier enters the CASH/base price; card = cash * (1 + rate)):
--
--   1. FORMULA. The server computed cash = card * (1 - rate) (e.g. * 0.96),
--      which is NOT the inverse of the client's card = cash * (1 + rate).
--      The exact inverse is cash = card / (1 + rate). On a $7.49 card price at
--      4% the old math gave cash 7.1904 (→7.19); the correct inverse gives
--      7.2019 (→7.20), matching the cash base the cashier actually entered.
--      Cash is now ROUND(..,2) so no sub-cent dust is stored.
--
--   2. GATING. The server applied a discount whenever a percentage was present
--      (and even DEFAULTED to 4% when NULL), ignoring pricing_strategy — while
--      the client only dual-prices when pricing_strategy = 'dual'. Now the
--      server applies the surcharge inverse ONLY when strategy = 'dual' AND
--      pct > 0; otherwise cash = card (rate 0).
--
--   3. SOURCE. add_open_item read the raw location percentage (default 0.04);
--      the update paths hardcoded 0.04. All three now resolve strategy AND
--      percentage the SAME way the client's settings store does: when the
--      location's use_merchant_pricing_defaults flag is set, use the merchant's
--      values, otherwise the location's own — so client and server never diverge.
--
-- Everything else in each function is verbatim from the deployed body.
--
-- Rollback: 20260706130000_open_item_dual_pricing_inverse_rollback.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- add_open_item_v3
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_open_item_v3(
  p_order_id uuid, p_item_name text, p_unit_price numeric, p_quantity integer DEFAULT 1,
  p_special_instructions text DEFAULT NULL::text, p_is_tax_exempt boolean DEFAULT false,
  p_seat_number integer DEFAULT NULL::integer, p_idempotency_key uuid DEFAULT NULL::uuid,
  p_station_id uuid DEFAULT NULL::uuid, p_is_to_go boolean DEFAULT false)
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
  v_strategy text;
  v_pct numeric;
  v_result jsonb;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    v_cached := public._idempotency_claim(p_idempotency_key, 'add_open_item_v3');
    IF v_cached IS NOT NULL THEN
      RETURN v_cached;
    END IF;
  END IF;

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

  PERFORM public._assert_order_station_match(p_order_id, p_station_id);

  -- Dual-pricing rate: resolve the SAME way the client does (settings store) —
  -- when the location opts into merchant defaults use the merchant's values,
  -- otherwise the location's own. Surcharge applies ONLY when the resolved
  -- strategy is 'dual' and pct > 0; else 0 (cash = card).
  -- card = cash * (1 + rate) => cash = card / (1 + rate).
  SELECT
    CASE WHEN COALESCE(l.use_merchant_pricing_defaults, false) THEN m.pricing_strategy ELSE l.pricing_strategy END,
    CASE WHEN COALESCE(l.use_merchant_pricing_defaults, false) THEN m.dual_pricing_percentage ELSE l.dual_pricing_percentage END
  INTO v_strategy, v_pct
  FROM public.locations l
  LEFT JOIN public.merchants m ON m.id = v_merchant_id
  WHERE l.id = v_location_id;

  v_cash_discount_rate := CASE
    WHEN v_strategy = 'dual' AND COALESCE(v_pct, 0) > 0 THEN v_pct / 100.0
    ELSE 0
  END;

  IF NOT p_is_tax_exempt THEN
    SELECT COALESCE(tr.percentage, 8.0) INTO v_tax_rate FROM public.tax_rates tr
    WHERE tr.location_id = v_location_id AND tr.tax_category = 'standard' AND tr.is_active = true LIMIT 1;
    v_tax_rate := COALESCE(v_tax_rate, 8.0);
  ELSE
    v_tax_rate := 0;
  END IF;

  v_cash_price := ROUND(p_unit_price / (1 + v_cash_discount_rate), 2);
  v_subtotal := p_unit_price * p_quantity;
  v_cash_subtotal := v_cash_price * p_quantity;
  v_tax_amount := ROUND(v_subtotal * v_tax_rate / 100, 2);
  v_cash_tax_amount := ROUND(v_cash_subtotal * v_tax_rate / 100, 2);

  INSERT INTO public.order_items (
    order_id, is_open_item, open_item_name, open_item_price, menu_item_id,
    item_name, category_name, quantity, unit_price, subtotal, tax_rate, tax_amount,
    cash_price, cash_subtotal, cash_tax_amount, special_instructions, seat_number,
    item_status, paid_quantity, is_to_go, created_at, updated_at
  ) VALUES (
    p_order_id, TRUE, p_item_name, p_unit_price, NULL,
    p_item_name, 'Open Items', p_quantity, p_unit_price, v_subtotal, v_tax_rate, v_tax_amount,
    v_cash_price, v_cash_subtotal, v_cash_tax_amount, p_special_instructions, p_seat_number,
    'pending', 0, COALESCE(p_is_to_go, false), now(), now()
  ) RETURNING id INTO v_item_id;

  PERFORM calculate_order_totals_fast(p_order_id);

  v_result := jsonb_build_object(
    'success', true, 'order_item_id', v_item_id, 'item_name', p_item_name,
    'quantity', p_quantity, 'unit_price', p_unit_price, 'cash_price', v_cash_price,
    'subtotal', v_subtotal, 'cash_subtotal', v_cash_subtotal,
    'tax_rate', v_tax_rate, 'tax_amount', v_tax_amount, 'cash_tax_amount', v_cash_tax_amount,
    'is_to_go', COALESCE(p_is_to_go, false)
  );

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM public._idempotency_complete(p_idempotency_key, 'add_open_item_v3', v_result);
  END IF;

  RETURN v_result;
END;
$function$;

-- ---------------------------------------------------------------------
-- update_order_item_v2 (open-item price/qty edit)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_order_item_v2(
  p_order_item_id uuid, p_quantity integer DEFAULT NULL::integer, p_unit_price numeric DEFAULT NULL::numeric,
  p_special_instructions text DEFAULT NULL::text, p_seat_number integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_order_id uuid;
    v_is_open_item boolean;
    v_location_id uuid;
    v_merchant_id uuid;
    v_tax_rate numeric;

    v_new_quantity integer;
    v_new_price numeric;
    v_cash_price numeric;
    v_subtotal numeric;
    v_cash_subtotal numeric;
    v_tax_amount numeric;
    v_cash_tax_amount numeric;

    v_cash_discount_rate numeric := 0;
    v_strategy text;
    v_pct numeric;
BEGIN
    SELECT
        oi.order_id, oi.is_open_item, oi.quantity, oi.unit_price, oi.tax_rate,
        o.location_id, o.merchant_id
    INTO v_order_id, v_is_open_item, v_new_quantity, v_new_price, v_tax_rate, v_location_id, v_merchant_id
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE oi.id = p_order_item_id
      AND o.merchant_id = user_merchant_id()
      AND o.location_id = ANY(user_location_ids());

    IF v_order_id IS NULL THEN
        RAISE EXCEPTION 'Order item not found or access denied';
    END IF;

    IF p_quantity IS NOT NULL THEN
        v_new_quantity := p_quantity;
    END IF;

    IF p_unit_price IS NOT NULL THEN
        IF NOT v_is_open_item THEN
            RAISE EXCEPTION 'Cannot change price of regular menu items';
        END IF;
        v_new_price := p_unit_price;
    END IF;

    -- Resolve dual-pricing rate the same way the client does: merchant defaults
    -- when the location opts in, else the location's own; only when 'dual'.
    SELECT
      CASE WHEN COALESCE(l.use_merchant_pricing_defaults, false) THEN m.pricing_strategy ELSE l.pricing_strategy END,
      CASE WHEN COALESCE(l.use_merchant_pricing_defaults, false) THEN m.dual_pricing_percentage ELSE l.dual_pricing_percentage END
    INTO v_strategy, v_pct
    FROM public.locations l
    LEFT JOIN public.merchants m ON m.id = v_merchant_id
    WHERE l.id = v_location_id;

    v_cash_discount_rate := CASE
      WHEN v_strategy = 'dual' AND COALESCE(v_pct, 0) > 0 THEN v_pct / 100.0
      ELSE 0
    END;

    v_cash_price := ROUND(v_new_price / (1 + v_cash_discount_rate), 2);
    v_subtotal := v_new_price * v_new_quantity;
    v_cash_subtotal := v_cash_price * v_new_quantity;
    v_tax_amount := ROUND(v_subtotal * v_tax_rate / 100, 2);
    v_cash_tax_amount := ROUND(v_cash_subtotal * v_tax_rate / 100, 2);

    UPDATE public.order_items SET
        quantity = v_new_quantity,
        unit_price = v_new_price,
        cash_price = v_cash_price,
        subtotal = v_subtotal,
        cash_subtotal = v_cash_subtotal,
        tax_amount = v_tax_amount,
        cash_tax_amount = v_cash_tax_amount,
        open_item_price = CASE WHEN v_is_open_item THEN v_new_price ELSE open_item_price END,
        special_instructions = COALESCE(p_special_instructions, special_instructions),
        seat_number = COALESCE(p_seat_number, seat_number),
        updated_at = now()
    WHERE id = p_order_item_id;

    PERFORM calculate_order_totals_fast(v_order_id);

    RETURN jsonb_build_object(
        'success', true,
        'order_item_id', p_order_item_id,
        'quantity', v_new_quantity,
        'unit_price', v_new_price,
        'subtotal', v_subtotal
    );
END;
$function$;

-- ---------------------------------------------------------------------
-- update_order_item_v3 (idempotent open-item edit)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_order_item_v3(
  p_order_item_id uuid, p_quantity integer DEFAULT NULL::integer, p_unit_price numeric DEFAULT NULL::numeric,
  p_special_instructions text DEFAULT NULL::text, p_seat_number integer DEFAULT NULL::integer,
  p_idempotency_key uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'public', 'pg_temp'
AS $function$
DECLARE
    v_cached jsonb;
    v_order_id uuid;
    v_is_open_item boolean;
    v_location_id uuid;
    v_merchant_id uuid;
    v_tax_rate numeric;

    v_new_quantity integer;
    v_new_price numeric;
    v_cash_price numeric;
    v_subtotal numeric;
    v_cash_subtotal numeric;
    v_tax_amount numeric;
    v_cash_tax_amount numeric;

    v_cash_discount_rate numeric := 0;
    v_strategy text;
    v_pct numeric;

    v_result jsonb;
BEGIN
    IF p_idempotency_key IS NOT NULL THEN
        v_cached := public._idempotency_claim(p_idempotency_key, 'update_order_item_v3');
        IF v_cached IS NOT NULL THEN
            RAISE LOG 'idempotency_cache_hit op=% key=%', 'update_order_item_v3', p_idempotency_key;
            RETURN v_cached;
        END IF;
    END IF;

    SELECT
        oi.order_id, oi.is_open_item, oi.quantity, oi.unit_price, oi.tax_rate,
        o.location_id, o.merchant_id
    INTO v_order_id, v_is_open_item, v_new_quantity, v_new_price, v_tax_rate, v_location_id, v_merchant_id
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE oi.id = p_order_item_id
      AND o.merchant_id = user_merchant_id()
      AND o.location_id = ANY(user_location_ids());

    IF v_order_id IS NULL THEN
        RAISE EXCEPTION 'Order item not found or access denied';
    END IF;

    IF p_quantity IS NOT NULL THEN
        v_new_quantity := p_quantity;
    END IF;

    IF p_unit_price IS NOT NULL THEN
        IF NOT v_is_open_item THEN
            RAISE EXCEPTION 'Cannot change price of regular menu items';
        END IF;
        v_new_price := p_unit_price;
    END IF;

    SELECT COALESCE(l.pricing_strategy, m.pricing_strategy),
           COALESCE(l.dual_pricing_percentage, m.dual_pricing_percentage)
    INTO v_strategy, v_pct
    FROM public.locations l
    LEFT JOIN public.merchants m ON m.id = v_merchant_id
    WHERE l.id = v_location_id;

    v_cash_discount_rate := CASE
      WHEN v_strategy = 'dual' AND COALESCE(v_pct, 0) > 0 THEN v_pct / 100.0
      ELSE 0
    END;

    v_cash_price := ROUND(v_new_price / (1 + v_cash_discount_rate), 2);
    v_subtotal := v_new_price * v_new_quantity;
    v_cash_subtotal := v_cash_price * v_new_quantity;
    v_tax_amount := ROUND(v_subtotal * v_tax_rate / 100, 2);
    v_cash_tax_amount := ROUND(v_cash_subtotal * v_tax_rate / 100, 2);

    UPDATE public.order_items SET
        quantity = v_new_quantity,
        unit_price = v_new_price,
        cash_price = v_cash_price,
        subtotal = v_subtotal,
        cash_subtotal = v_cash_subtotal,
        tax_amount = v_tax_amount,
        cash_tax_amount = v_cash_tax_amount,
        open_item_price = CASE WHEN v_is_open_item THEN v_new_price ELSE open_item_price END,
        special_instructions = COALESCE(p_special_instructions, special_instructions),
        seat_number = COALESCE(p_seat_number, seat_number),
        updated_at = now()
    WHERE id = p_order_item_id;

    PERFORM calculate_order_totals_fast(v_order_id);

    v_result := jsonb_build_object(
        'success', true,
        'order_item_id', p_order_item_id,
        'quantity', v_new_quantity,
        'unit_price', v_new_price,
        'subtotal', v_subtotal
    );

    IF p_idempotency_key IS NOT NULL THEN
        PERFORM public._idempotency_complete(p_idempotency_key, 'update_order_item_v3', v_result);
    END IF;

    RETURN v_result;
END;
$function$;
