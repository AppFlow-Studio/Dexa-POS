-- =====================================================================
-- Migration: update_order_item_v3 — adds idempotency-key support
-- =====================================================================
-- Forks from update_order_item_v2 (deployed body dumped via
-- pg_get_functiondef on staging). Note: a separate `_dep` overload
-- (update_order_item_v2_dep) exists with a different name and is not
-- affected by this migration.
--
-- Wave 3.0a: idempotent UPDATE with allowlisted params consumed by
-- the deployed signature: p_quantity, p_unit_price (open items only),
-- p_special_instructions, p_seat_number. Client `toUpdateItemKey`
-- enforces the same allowlist before deriving the key.
--
-- Rollback: update_order_item_v3_rollback.sql
-- =====================================================================

CREATE OR REPLACE FUNCTION public.update_order_item_v3(
    p_order_item_id uuid,
    p_quantity integer DEFAULT NULL,
    p_unit_price numeric DEFAULT NULL,
    p_special_instructions text DEFAULT NULL,
    p_seat_number integer DEFAULT NULL,
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
    v_is_open_item boolean;
    v_location_id uuid;
    v_tax_rate numeric;

    v_new_quantity integer;
    v_new_price numeric;
    v_cash_price numeric;
    v_subtotal numeric;
    v_cash_subtotal numeric;
    v_tax_amount numeric;
    v_cash_tax_amount numeric;

    v_cash_discount_rate numeric := 0.04;

    v_result jsonb;
BEGIN
    IF p_idempotency_key IS NOT NULL THEN
        v_cached := public._idempotency_claim(p_idempotency_key, 'update_order_item_v3');
        IF v_cached IS NOT NULL THEN
            RAISE LOG 'idempotency_cache_hit op=% key=%', 'update_order_item_v3', p_idempotency_key;
            RETURN v_cached;
        END IF;
    END IF;

    -- BEGIN_VERBATIM (from pg_get_functiondef('update_order_item_v2'::regproc) on staging)
    -- Get current item details
    SELECT
        oi.order_id,
        oi.is_open_item,
        oi.quantity,
        oi.unit_price,
        oi.tax_rate,
        o.location_id
    INTO v_order_id, v_is_open_item, v_new_quantity, v_new_price, v_tax_rate, v_location_id
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE oi.id = p_order_item_id
      AND o.merchant_id = user_merchant_id()
      AND o.location_id = ANY(user_location_ids());

    IF v_order_id IS NULL THEN
        RAISE EXCEPTION 'Order item not found or access denied';
    END IF;

    -- Update quantity if provided
    IF p_quantity IS NOT NULL THEN
        v_new_quantity := p_quantity;
    END IF;

    -- Update price if provided AND it's an open item
    IF p_unit_price IS NOT NULL THEN
        IF NOT v_is_open_item THEN
            RAISE EXCEPTION 'Cannot change price of regular menu items';
        END IF;
        v_new_price := p_unit_price;
    END IF;

    -- Recalculate pricing
    v_cash_price := v_new_price * (1 - v_cash_discount_rate);
    v_subtotal := v_new_price * v_new_quantity;
    v_cash_subtotal := v_cash_price * v_new_quantity;
    v_tax_amount := ROUND(v_subtotal * v_tax_rate / 100, 2);
    v_cash_tax_amount := ROUND(v_cash_subtotal * v_tax_rate / 100, 2);

    -- Update the item
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

    -- Recalculate order totals
    PERFORM calculate_order_totals_fast(v_order_id);

    v_result := jsonb_build_object(
        'success', true,
        'order_item_id', p_order_item_id,
        'quantity', v_new_quantity,
        'unit_price', v_new_price,
        'subtotal', v_subtotal
    );
    -- END_VERBATIM

    IF p_idempotency_key IS NOT NULL THEN
        PERFORM public._idempotency_complete(p_idempotency_key, 'update_order_item_v3', v_result);
    END IF;

    RETURN v_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.update_order_item_v3(uuid, integer, numeric, text, integer, uuid) TO authenticated;

COMMENT ON FUNCTION public.update_order_item_v3 IS
  'Wave 3.0a: idempotent UPDATE with optional p_idempotency_key. Forks from v2 (5-param signature); accepts q/price/instructions/seat with same NULL-defaulting semantics. Same-intent retries dedupe via _idempotency_claim cache.';
