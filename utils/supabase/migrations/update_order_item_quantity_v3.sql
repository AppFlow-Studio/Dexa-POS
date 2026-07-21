-- =====================================================================
-- Migration: update_order_item_quantity_v3 — adds idempotency-key support
-- =====================================================================
-- Forks from update_order_item_quantity_v2 (deployed body dumped via
-- pg_get_functiondef on staging; no source migration in repo for v2).
--
-- Wave 3.0a: hot-path UPDATE retrofit. Per-intent keys derived as
-- uuidv5(itemId + quantity) on the client mean same-intent retries
-- dedupe; different intents (qty 3 → qty 5) execute distinctly.
--
-- Cache-hit observability via RAISE LOG; canary success criteria are
-- (a) cache-hit log volume scales with retry pressure, (b) no duplicate
-- mutations on the same key, (c) no new error categories in Sentry.
--
-- Rollback: update_order_item_quantity_v3_rollback.sql
-- =====================================================================

CREATE OR REPLACE FUNCTION public.update_order_item_quantity_v3(
    p_order_item_id uuid,
    p_quantity integer,
    p_idempotency_key uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'public', 'pg_temp'
AS $function$
DECLARE
    v_cached jsonb;
    v_order_id uuid;
    v_location_id uuid;
    v_unit_price numeric;
    v_cash_unit_price numeric;
    v_tax_rate numeric;
    v_is_tax_exempt boolean;

    v_modifier_total numeric;
    v_new_subtotal numeric;
    v_new_cash_subtotal numeric;
    v_new_tax_amount numeric;
    v_new_cash_tax_amount numeric;

    v_discount_amount numeric := 0;
    v_discount_cash_amount numeric := 0;
    v_has_active_discount boolean := false;

    v_new_sync_version integer;
    v_price_paid numeric;

    v_result jsonb;
BEGIN
    IF p_idempotency_key IS NOT NULL THEN
        v_cached := public._idempotency_claim(p_idempotency_key, 'update_order_item_quantity_v3');
        IF v_cached IS NOT NULL THEN
            RAISE LOG 'idempotency_cache_hit op=% key=%', 'update_order_item_quantity_v3', p_idempotency_key;
            RETURN v_cached;
        END IF;
    END IF;

    -- BEGIN_VERBATIM (from pg_get_functiondef('update_order_item_quantity_v2'::regproc) on staging)
    -- Validate quantity
    IF p_quantity IS NULL OR p_quantity < 1 THEN
        RAISE EXCEPTION 'Invalid quantity: must be at least 1';
    END IF;

    -- ============================================
    -- 1. Get current item details
    -- ============================================
    SELECT
        oi.order_id,
        oi.unit_price,
        oi.cash_price,
        oi.tax_rate,
        COALESCE(oi.is_tax_exempt, false),
        o.location_id,
        o.sync_version + 1
    INTO
        v_order_id,
        v_unit_price,
        v_cash_unit_price,
        v_tax_rate,
        v_is_tax_exempt,
        v_location_id,
        v_new_sync_version
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE oi.id = p_order_item_id
      AND o.merchant_id = user_merchant_id()
      AND o.location_id = ANY(user_location_ids())
    FOR UPDATE;

    IF v_order_id IS NULL THEN
        RAISE EXCEPTION 'Order item not found or access denied';
    END IF;

    -- ============================================
    -- 2. Calculate modifier total (for reference)
    -- ============================================
    SELECT COALESCE(SUM(total_price), 0)
    INTO v_modifier_total
    FROM public.order_item_modifiers
    WHERE order_item_id = p_order_item_id;

    -- ============================================
    -- 3. Calculate new pricing based on quantity
    -- ============================================
    v_new_subtotal := v_unit_price * p_quantity;
    v_new_cash_subtotal := v_cash_unit_price * p_quantity;

    IF v_is_tax_exempt THEN
        v_new_tax_amount := 0;
        v_new_cash_tax_amount := 0;
    ELSE
        v_new_tax_amount := ROUND(v_new_subtotal * v_tax_rate / 100, 2);
        v_new_cash_tax_amount := ROUND(v_new_cash_subtotal * v_tax_rate / 100, 2);
    END IF;

    v_price_paid := v_unit_price * p_quantity;

    -- ============================================
    -- 4. Update order item with new pricing
    -- ============================================
    UPDATE public.order_items SET
        quantity = p_quantity,
        subtotal = v_new_subtotal,
        cash_subtotal = v_new_cash_subtotal,
        tax_amount = v_new_tax_amount,
        cash_tax_amount = v_new_cash_tax_amount,
        discount_amount = 0,
        discount_cash_amount = 0,
        updated_at = now()
    WHERE id = p_order_item_id;

    -- ============================================
    -- 5. Handle active order discounts
    -- ============================================
    SELECT EXISTS(
        SELECT 1 FROM public.order_discounts
        WHERE order_id = v_order_id
          AND voided_at IS NULL
          AND calculated_amount > 0
    ) INTO v_has_active_discount;

    IF v_has_active_discount THEN
        PERFORM redistribute_order_discount(v_order_id);

        SELECT
            subtotal,
            cash_subtotal,
            tax_amount,
            cash_tax_amount,
            COALESCE(discount_amount, 0),
            COALESCE(discount_cash_amount, 0)
        INTO
            v_new_subtotal,
            v_new_cash_subtotal,
            v_new_tax_amount,
            v_new_cash_tax_amount,
            v_discount_amount,
            v_discount_cash_amount
        FROM public.order_items
        WHERE id = p_order_item_id;

        v_price_paid := v_new_subtotal;
    END IF;

    -- ============================================
    -- 6. Update order sync version
    -- ============================================
    v_new_sync_version := increment_order_sync_version(v_order_id);

    -- ============================================
    -- 7. Recalculate order totals
    -- ============================================
    PERFORM recalculate_order_discount(v_order_id);

    -- ============================================
    -- 8. Return enhanced result with complete item data
    -- ============================================
    -- Wave 3.0a change: jsonb_build_object (not json_build_object) so
    -- v_result is jsonb directly; passes to _idempotency_complete without
    -- a re-cast that could re-parse numerics.
    v_result := jsonb_build_object(
        'success', true,
        'order_item_id', p_order_item_id,

        'quantity', p_quantity,
        'price_paid', v_price_paid,
        'modifier_total', v_modifier_total,
        'new_subtotal', v_new_subtotal,

        'unit_price', v_unit_price,
        'card_subtotal', v_new_subtotal,
        'card_tax_amount', v_new_tax_amount,

        'cash_unit_price', v_cash_unit_price,
        'cash_subtotal', v_new_cash_subtotal,
        'cash_tax_amount', v_new_cash_tax_amount,

        'discount_amount', v_discount_amount,
        'discount_cash_amount', v_discount_cash_amount,

        'sync_version', v_new_sync_version
    );
    -- END_VERBATIM

    IF p_idempotency_key IS NOT NULL THEN
        PERFORM public._idempotency_complete(p_idempotency_key, 'update_order_item_quantity_v3', v_result);
    END IF;

    RETURN v_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.update_order_item_quantity_v3(uuid, integer, uuid) TO authenticated;

COMMENT ON FUNCTION public.update_order_item_quantity_v3 IS
  'Wave 3.0a: hot-path quantity update with optional p_idempotency_key for at-most-once execution. Forks from v2; same-intent retries dedupe via _idempotency_claim cache. Different qty values produce distinct keys and execute independently.';
