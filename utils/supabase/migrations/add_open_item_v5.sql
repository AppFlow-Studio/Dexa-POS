-- =====================================================================
-- Migration: add_open_item_v5 — client-minted open-item id (the Identity Gate)
-- =====================================================================
-- docs/engineering/architecture/local-first-orders-seating.md §6, §7.
-- Rollback: add_open_item_v5_rollback.sql
--
-- WHY: the local-first item path (opHandlers.add_item → add_order_item_v5) had
-- NO open-item branch, so an open/custom item was sent to add_order_item_v5
-- with a client cart id as p_menu_item_id and Postgres rejected it with
-- `invalid input syntax for type uuid: "open_item_..."` (22P02). add_order_item_v5
-- also has no open-item columns, so it could never insert one correctly. This is
-- the open-item sibling of add_order_item_v5: it lets the DEVICE mint the row id.
--
-- ── PROVENANCE — forked from the LIVE add_open_item (dumped from staging
--    dfwqakoyittmrwbqvxgw on 2026-09-10). ─────────────────────────────────────
-- The live add_open_item_v4 is a thin origin wrapper that delegates to the
-- 10-parameter add_open_item_v3 (station guard). v5 INLINES the v3 body + the
-- origin stamp (it cannot delegate — it must place a client-minted id in the
-- INSERT). Everything else — the dual-pricing rate resolution (merchant/location
-- strategy, cash = ROUND(unit/(1+rate),2)), tax lookup, the station guard,
-- calculate_order_totals_fast — is VERBATIM from the live v3. add_open_item
-- already carries p_is_to_go, so an open item can persist its TO GO flag here
-- directly (no separate toggle round-trip on this path).
--
-- set_broadcast_origin(NULL) early-returns, so the NULL-guard is equivalent to
-- v4's unconditional call.
--
-- DROP-then-CREATE because PostgreSQL treats different parameter counts as
-- distinct overloads — leaving a partial signature behind would let a racy
-- client bypass the id path.
-- =====================================================================

DROP FUNCTION IF EXISTS public.add_open_item_v5(uuid, text, numeric, integer, text, boolean, integer, uuid, uuid, boolean, uuid, uuid);

CREATE OR REPLACE FUNCTION public.add_open_item_v5(
  p_order_id uuid,
  p_item_name text,
  p_unit_price numeric,
  p_quantity integer DEFAULT 1,
  p_special_instructions text DEFAULT NULL,
  p_is_tax_exempt boolean DEFAULT false,
  p_seat_number integer DEFAULT NULL,
  p_idempotency_key uuid DEFAULT NULL,
  p_station_id uuid DEFAULT NULL,   -- Wave 1.1 station guard
  p_is_to_go boolean DEFAULT false,
  p_origin_id uuid DEFAULT NULL,    -- AUD-10 echo suppression (carried from v4)
  p_item_id uuid DEFAULT NULL       -- v5: the Identity Gate
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
  v_strategy text;
  v_pct numeric;
  v_result jsonb;
  v_existing RECORD;
  v_constraint text;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    v_cached := public._idempotency_claim(p_idempotency_key, 'add_open_item_v5');
    IF v_cached IS NOT NULL THEN
      RETURN v_cached;
    END IF;
  END IF;

  -- BEGIN_VERBATIM (from live add_open_item_v3)
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

  -- AUD-10 (carried from v4): stamp this transaction's broadcast so the
  -- originating station can suppress its own echo.
  IF p_origin_id IS NOT NULL THEN
    PERFORM public.set_broadcast_origin(p_origin_id);
  END IF;

  -- -------------------------------------------------------------------
  -- v5: ROW-LEVEL IDEMPOTENCY on the client-minted item id. After the order
  -- lock so it inherits the same auth + serialization, scoped by order_id so a
  -- client cannot probe another order's item ids. Makes an outbox retry safe
  -- independently of p_idempotency_key.
  -- -------------------------------------------------------------------
  IF p_item_id IS NOT NULL THEN
    SELECT oi.id, oi.item_name, oi.quantity, oi.unit_price, oi.cash_price,
           oi.subtotal, oi.cash_subtotal, oi.tax_rate, oi.tax_amount,
           oi.cash_tax_amount, oi.is_to_go
      INTO v_existing
      FROM public.order_items oi
     WHERE oi.id = p_item_id
       AND oi.order_id = p_order_id;

    IF FOUND THEN
      v_result := jsonb_build_object(
        'success', true, 'order_item_id', v_existing.id, 'item_name', v_existing.item_name,
        'quantity', v_existing.quantity, 'unit_price', v_existing.unit_price,
        'cash_price', v_existing.cash_price, 'subtotal', v_existing.subtotal,
        'cash_subtotal', v_existing.cash_subtotal, 'tax_rate', v_existing.tax_rate,
        'tax_amount', v_existing.tax_amount, 'cash_tax_amount', v_existing.cash_tax_amount,
        'is_to_go', COALESCE(v_existing.is_to_go, false), 'already_existed', true
      );

      IF p_idempotency_key IS NOT NULL THEN
        PERFORM public._idempotency_complete(p_idempotency_key, 'add_open_item_v5', v_result);
      END IF;

      RETURN v_result;
    END IF;
  END IF;

  -- Dual-pricing rate: resolve the SAME way the client does (settings store) —
  -- when the location opts into merchant defaults use the merchant's values,
  -- otherwise the location's own. card = cash * (1 + rate) => cash = card / (1 + rate).
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

  -- v5: the id is the DEVICE's when supplied. COALESCE preserves v4 behaviour
  -- for legacy callers, so this migration is a no-op until a client opts in.
  v_item_id := COALESCE(p_item_id, gen_random_uuid());

  BEGIN
    INSERT INTO public.order_items (
      id, order_id, is_open_item, open_item_name, open_item_price, menu_item_id,
      item_name, category_name, quantity, unit_price, subtotal, tax_rate, tax_amount,
      cash_price, cash_subtotal, cash_tax_amount, special_instructions, seat_number,
      item_status, paid_quantity, is_to_go, created_at, updated_at
    ) VALUES (
      v_item_id, p_order_id, TRUE, p_item_name, p_unit_price, NULL,
      p_item_name, 'Open Items', p_quantity, p_unit_price, v_subtotal, v_tax_rate, v_tax_amount,
      v_cash_price, v_cash_subtotal, v_cash_tax_amount, p_special_instructions, p_seat_number,
      'pending', 0, COALESCE(p_is_to_go, false), now(), now()
    );

  EXCEPTION WHEN unique_violation THEN
    -- A concurrent call inserted this exact id (two drains racing the same
    -- outbox row). Return the existing row rather than minting a new id — an
    -- item's identity must never change.
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint <> 'order_items_pkey' THEN
      RAISE;
    END IF;

    SELECT oi.id, oi.item_name, oi.quantity, oi.unit_price, oi.cash_price,
           oi.subtotal, oi.cash_subtotal, oi.tax_rate, oi.tax_amount,
           oi.cash_tax_amount, oi.is_to_go
      INTO v_existing
      FROM public.order_items oi
     WHERE oi.id = v_item_id
       AND oi.order_id = p_order_id;

    IF NOT FOUND THEN
      RAISE;
    END IF;

    v_result := jsonb_build_object(
      'success', true, 'order_item_id', v_existing.id, 'item_name', v_existing.item_name,
      'quantity', v_existing.quantity, 'unit_price', v_existing.unit_price,
      'cash_price', v_existing.cash_price, 'subtotal', v_existing.subtotal,
      'cash_subtotal', v_existing.cash_subtotal, 'tax_rate', v_existing.tax_rate,
      'tax_amount', v_existing.tax_amount, 'cash_tax_amount', v_existing.cash_tax_amount,
      'is_to_go', COALESCE(v_existing.is_to_go, false), 'already_existed', true
    );

    IF p_idempotency_key IS NOT NULL THEN
      PERFORM public._idempotency_complete(p_idempotency_key, 'add_open_item_v5', v_result);
    END IF;

    RETURN v_result;
  END;

  PERFORM calculate_order_totals_fast(p_order_id);

  v_result := jsonb_build_object(
    'success', true, 'order_item_id', v_item_id, 'item_name', p_item_name,
    'quantity', p_quantity, 'unit_price', p_unit_price, 'cash_price', v_cash_price,
    'subtotal', v_subtotal, 'cash_subtotal', v_cash_subtotal,
    'tax_rate', v_tax_rate, 'tax_amount', v_tax_amount, 'cash_tax_amount', v_cash_tax_amount,
    'is_to_go', COALESCE(p_is_to_go, false)
  );
  -- END_VERBATIM

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM public._idempotency_complete(p_idempotency_key, 'add_open_item_v5', v_result);
  END IF;

  RETURN v_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.add_open_item_v5(uuid, text, numeric, integer, text, boolean, integer, uuid, uuid, boolean, uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.add_open_item_v5 IS
  'Adds an open/custom item. v5 accepts a client-minted p_item_id (the Identity Gate) and is '
  'idempotent on it, so an outbox retry can never double-add. Carries v4''s p_station_id guard, '
  'p_origin_id echo suppression, and p_is_to_go. Falls back to gen_random_uuid() when p_item_id is NULL.';
