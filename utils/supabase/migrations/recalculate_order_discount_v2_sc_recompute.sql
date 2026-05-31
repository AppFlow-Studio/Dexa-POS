-- =====================================================================
-- Migration: recalculate_order_discount_v2 — SC-inclusive totals via
--            nested apply_service_charge_v1
-- =====================================================================
-- Forks public.recalculate_order_discount(p_order_id uuid). v1 ends with
-- PERFORM calculate_order_totals_fast(p_order_id), which refreshes
-- card_total/cash_total/total_amount/amount_due/cash_amount_due using
-- the orders.service_charge column AS-IS. Under applies_on='post_discount'
-- the SC base changes when items/discounts change, but v1 never invokes
-- apply_service_charge_v1 to re-resolve service_charge against the new
-- net subtotal — SC stays pinned at the prior base.
--
-- v2 keeps the discount distribution logic verbatim and swaps both
-- `PERFORM calculate_order_totals_fast` calls (no-discount early return
-- branch + terminal branch) with `PERFORM apply_service_charge_v1`.
-- apply_service_charge_v1 internally PERFORMs calculate_order_totals_fast,
-- so the totals refresh still happens — but SC is re-evaluated first.
--
-- Wave A note: v2 is the renamed function; existing callers
-- (manage_order_discount_v2/v3, add_order_item_v3, update_order_item_quantity_v3,
-- remove_order_item, etc.) still call the unversioned name
-- `recalculate_order_discount`. v2 is parked here for the Wave B follow-up
-- that switches those callers over. manage_order_discount_v3 (Wave A)
-- invokes apply_service_charge_v1 directly so it doesn't depend on v2.
--
-- Apply AFTER:
--   - discount_calculations.sql (defines calculate_item_totals)
--   - apply_service_charge_v1.sql
--   - manage_order_discount_v3_sc_recompute.sql
--
-- Rollback: recalculate_order_discount_v2_sc_recompute_rollback.sql
-- =====================================================================

CREATE OR REPLACE FUNCTION public.recalculate_order_discount_v2(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_discount RECORD;
    v_applicable_subtotal NUMERIC := 0;
    v_new_calculated_amount NUMERIC := 0;
    v_affected_item_ids UUID[] := '{}';

    v_item RECORD;
    v_item_proportion NUMERIC;
    v_item_discount_amount NUMERIC;
    v_distributed_total NUMERIC := 0;
    v_last_item_id UUID;
    v_item_calcs JSONB;
BEGIN
    -- 1. Get the active order-level discount.
    SELECT
        od.id,
        od.discount_id,
        od.discount_name,
        od.discount_type::text AS discount_type,
        od.discount_value,
        od.source::text AS source,
        od.applied_by_staff_profiles_id,
        od.approved_by_staff_profiles_id,
        d.max_discount_amount,
        d.exclude_alcohol,
        d.exclude_categories,
        d.applies_to_categories
    INTO v_discount
    FROM public.order_discounts od
    LEFT JOIN public.discounts d ON d.id = od.discount_id
    WHERE od.order_id = p_order_id
      AND od.voided_at IS NULL
    ORDER BY od.applied_at DESC
    LIMIT 1;

    -- No active discount → clear any stale per-item discount data, then
    -- hand off to apply_service_charge_v1 (which PERFORMs the canonical
    -- totals engine).
    IF v_discount.id IS NULL THEN
        UPDATE public.order_items
        SET discount_id = NULL,
            discount_type = NULL,
            discount_value = 0,
            discount_amount = 0,
            discount_source = NULL,
            discount_applied_by = NULL,
            discount_approved_by = NULL,
            pre_discount_subtotal = NULL,
            subtotal = quantity * unit_price,
            cash_subtotal = quantity * COALESCE(cash_price, unit_price),
            tax_amount = ROUND((quantity * unit_price) * COALESCE(tax_rate, 0) / 100, 2),
            cash_tax_amount = ROUND((quantity * COALESCE(cash_price, unit_price)) * COALESCE(tax_rate, 0) / 100, 2),
            updated_at = now()
        WHERE order_id = p_order_id
          AND is_voided = false
          AND discount_amount > 0;

        PERFORM public.apply_service_charge_v1(p_order_id, NULL, NULL, NULL);

        RETURN jsonb_build_object(
            'success', true,
            'has_discount', false,
            'message', 'No active discount'
        );
    END IF;

    -- 2. Resolve the set of applicable items, applying exclusions if any.
    SELECT
        COALESCE(SUM(oi.quantity * oi.unit_price), 0),
        COALESCE(array_agg(oi.id), '{}')
    INTO v_applicable_subtotal, v_affected_item_ids
    FROM public.order_items oi
    WHERE oi.order_id = p_order_id
      AND oi.is_voided = false
      AND oi.quantity > COALESCE(oi.paid_quantity, 0);

    IF v_discount.discount_id IS NOT NULL THEN
        IF COALESCE(v_discount.exclude_alcohol, false) THEN
            SELECT
                COALESCE(SUM(oi.quantity * oi.unit_price), 0),
                COALESCE(array_agg(oi.id), '{}')
            INTO v_applicable_subtotal, v_affected_item_ids
            FROM public.order_items oi
            LEFT JOIN public.menu_items mi ON mi.id = oi.menu_item_id
            WHERE oi.order_id = p_order_id
              AND oi.is_voided = false
              AND oi.quantity > COALESCE(oi.paid_quantity, 0)
              AND COALESCE(mi.is_alcohol, false) = false;
        END IF;

        IF v_discount.exclude_categories IS NOT NULL THEN
            SELECT
                COALESCE(SUM(oi.quantity * oi.unit_price), 0),
                COALESCE(array_agg(oi.id), '{}')
            INTO v_applicable_subtotal, v_affected_item_ids
            FROM public.order_items oi
            LEFT JOIN public.menu_items mi ON mi.id = oi.menu_item_id
            WHERE oi.order_id = p_order_id
              AND oi.is_voided = false
              AND oi.quantity > COALESCE(oi.paid_quantity, 0)
              AND (mi.category_id IS NULL OR NOT (mi.category_id = ANY(v_discount.exclude_categories)));
        END IF;

        IF v_discount.applies_to_categories IS NOT NULL THEN
            SELECT
                COALESCE(SUM(oi.quantity * oi.unit_price), 0),
                COALESCE(array_agg(oi.id), '{}')
            INTO v_applicable_subtotal, v_affected_item_ids
            FROM public.order_items oi
            LEFT JOIN public.menu_items mi ON mi.id = oi.menu_item_id
            WHERE oi.order_id = p_order_id
              AND oi.is_voided = false
              AND oi.quantity > COALESCE(oi.paid_quantity, 0)
              AND mi.category_id = ANY(v_discount.applies_to_categories);
        END IF;
    END IF;

    -- 3. Recompute the discount amount (percentage or fixed, capped).
    IF v_applicable_subtotal > 0 THEN
        IF v_discount.discount_type = 'percentage' THEN
            v_new_calculated_amount := ROUND(v_applicable_subtotal * (v_discount.discount_value / 100), 2);
            IF v_discount.max_discount_amount IS NOT NULL THEN
                v_new_calculated_amount := LEAST(v_new_calculated_amount, v_discount.max_discount_amount);
            END IF;
        ELSE
            v_new_calculated_amount := LEAST(v_discount.discount_value, v_applicable_subtotal);
        END IF;
    ELSE
        v_new_calculated_amount := 0;
    END IF;

    -- 4. Update the order_discounts row in place.
    UPDATE public.order_discounts
    SET calculated_amount = v_new_calculated_amount,
        pre_discount_subtotal = v_applicable_subtotal,
        applied_to_item_ids = v_affected_item_ids
    WHERE id = v_discount.id;

    -- 5. Clear discount columns from items that are no longer applicable.
    UPDATE public.order_items
    SET discount_id = NULL,
        discount_type = NULL,
        discount_value = 0,
        discount_amount = 0,
        discount_source = NULL,
        discount_applied_by = NULL,
        discount_approved_by = NULL,
        pre_discount_subtotal = NULL,
        subtotal = quantity * unit_price,
        cash_subtotal = quantity * COALESCE(cash_price, unit_price),
        tax_amount = ROUND((quantity * unit_price) * COALESCE(tax_rate, 0) / 100, 2),
        cash_tax_amount = ROUND((quantity * COALESCE(cash_price, unit_price)) * COALESCE(tax_rate, 0) / 100, 2),
        updated_at = now()
    WHERE order_id = p_order_id
      AND is_voided = false
      AND id <> ALL(v_affected_item_ids);

    -- 6. Distribute the discount proportionally across applicable items.
    v_distributed_total := 0;
    v_last_item_id := NULL;

    FOR v_item IN
        SELECT
            oi.id,
            oi.quantity,
            oi.paid_quantity,
            oi.unit_price,
            oi.cash_price,
            oi.tax_rate,
            (oi.quantity * oi.unit_price) AS item_gross_subtotal
        FROM public.order_items oi
        WHERE oi.id = ANY(v_affected_item_ids)
          AND oi.is_voided = false
        ORDER BY oi.created_at, oi.id
    LOOP
        IF v_applicable_subtotal > 0 THEN
            v_item_proportion := v_item.item_gross_subtotal / v_applicable_subtotal;
        ELSE
            v_item_proportion := 0;
        END IF;

        v_item_discount_amount := ROUND(v_new_calculated_amount * v_item_proportion, 2);
        v_distributed_total := v_distributed_total + v_item_discount_amount;
        v_last_item_id := v_item.id;

        v_item_calcs := public.calculate_item_totals(
            v_item.quantity,
            v_item.unit_price,
            v_item.cash_price,
            v_item.tax_rate,
            v_item_discount_amount
        );

        UPDATE public.order_items
        SET discount_id = v_discount.discount_id,
            discount_type = v_discount.discount_type::discount_type,
            discount_value = v_discount.discount_value,
            discount_amount = v_item_discount_amount,
            discount_cash_amount = (v_item_calcs->>'cash_discount_amount')::numeric,
            discount_source = v_discount.source::discount_source,
            discount_applied_by = v_discount.applied_by_staff_profiles_id,
            discount_approved_by = v_discount.approved_by_staff_profiles_id,
            pre_discount_subtotal = v_item.item_gross_subtotal,
            subtotal = (v_item_calcs->>'subtotal')::numeric,
            cash_subtotal = (v_item_calcs->>'cash_subtotal')::numeric,
            tax_amount = (v_item_calcs->>'tax_amount')::numeric,
            cash_tax_amount = (v_item_calcs->>'cash_tax_amount')::numeric,
            updated_at = now()
        WHERE id = v_item.id;
    END LOOP;

    -- 7. Absorb any rounding remainder into the last item.
    IF v_last_item_id IS NOT NULL AND v_distributed_total <> v_new_calculated_amount THEN
        DECLARE
            v_rounding_adj NUMERIC := v_new_calculated_amount - v_distributed_total;
            v_last_row RECORD;
        BEGIN
            SELECT * INTO v_last_row FROM public.order_items WHERE id = v_last_item_id;

            v_item_calcs := public.calculate_item_totals(
                v_last_row.quantity,
                v_last_row.unit_price,
                v_last_row.cash_price,
                v_last_row.tax_rate,
                v_last_row.discount_amount + v_rounding_adj
            );

            UPDATE public.order_items
            SET discount_amount = discount_amount + v_rounding_adj,
                subtotal = (v_item_calcs->>'subtotal')::numeric,
                cash_subtotal = (v_item_calcs->>'cash_subtotal')::numeric,
                tax_amount = (v_item_calcs->>'tax_amount')::numeric,
                cash_tax_amount = (v_item_calcs->>'cash_tax_amount')::numeric,
                updated_at = now()
            WHERE id = v_last_item_id;
        END;
    END IF;

    -- 8. Hand off totals refresh + SC re-resolution. apply_service_charge_v1
    --    internally PERFORMs calculate_order_totals_fast so card_total /
    --    cash_total / total_amount / amount_due / cash_amount_due /
    --    effective_total / sync_version are refreshed AND under
    --    applies_on='post_discount' service_charge itself drops against
    --    the new net subtotal.
    PERFORM public.apply_service_charge_v1(p_order_id, NULL, NULL, NULL);

    RETURN jsonb_build_object(
        'success', true,
        'has_discount', true,
        'order_discount_id', v_discount.id,
        'discount_name', v_discount.discount_name,
        'pre_discount_subtotal', v_applicable_subtotal,
        'calculated_amount', v_new_calculated_amount,
        'affected_items_count', array_length(v_affected_item_ids, 1)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalculate_order_discount_v2(UUID) TO authenticated;

COMMENT ON FUNCTION public.recalculate_order_discount_v2 IS
  'Wave A fork of recalculate_order_discount. Same per-item distribution + remainder handling. Both terminal branches (no-discount early return + post-distribution) call apply_service_charge_v1 instead of calculate_order_totals_fast, so SC re-resolves against the new net subtotal under applies_on=post_discount. Parked for Wave B item-mutation callers (add_order_item_v3, update_order_item_quantity_v3, remove_order_item); not used by Wave A manage_order_discount_v3 (which calls apply_service_charge_v1 directly).';

-- =====================================================================
-- How to test
-- =====================================================================
-- 1. Confirm fn exists:
--      SELECT proname FROM pg_proc WHERE proname = 'recalculate_order_discount_v2';
-- 2. Side-by-side compare with v1 on a dine-in order with an active
--    percentage discount and applies_on='post_discount' SC rule:
--      SELECT service_charge, card_total FROM orders WHERE id = '<oid>';
--      SELECT public.recalculate_order_discount_v2('<oid>');
--      SELECT service_charge, card_total FROM orders WHERE id = '<oid>';
--    Expect: v2 lowers service_charge (and card_total) to reflect the
--    post-discount base; v1 (the unversioned function) would have left
--    service_charge pinned.
-- 3. No-discount path: void all discounts then call v2; expect SC to
--    return to the gross baseline (no discount → net=gross).
-- =====================================================================
