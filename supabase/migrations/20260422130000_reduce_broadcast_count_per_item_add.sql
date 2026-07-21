-- ============================================================================
-- Migration: reduce_broadcast_count_per_item_add
--
-- Problem: add_order_item_v2 fires 2 UPDATEs to orders table per call:
--   1. recalculate_order_discount → UPDATE orders (totals)
--   2. increment_order_sync_version → UPDATE orders (sync_version)
-- Each UPDATE fires the deferred broadcast trigger = 2 broadcasts per item add.
-- Adding 5 items rapidly = 10 broadcasts, causing client-side flickering.
--
-- Fix: Fold sync_version bump into the totals UPDATE so only 1 UPDATE fires.
--   1. calculate_order_totals_fast: add sync_version bump to its UPDATE
--   2. recalculate_order_discount: add sync_version bump to step 7 UPDATE
--   3. add_order_item_v2: replace increment_order_sync_version with SELECT
--
-- Impact on other callers:
--   Functions that still call increment_order_sync_version will double-bump
--   sync_version (harmless — it's a monotonic counter for < comparisons).
--   Their broadcast count is unchanged until they're updated too.
-- ============================================================================

-- 1. Modify calculate_order_totals_fast to also bump sync_version
CREATE OR REPLACE FUNCTION calculate_order_totals_fast(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
v_card_subtotal numeric;
v_cash_subtotal numeric;
v_card_tax numeric;
v_cash_tax numeric;
v_discount numeric;
v_service_charge numeric;
v_amount_paid numeric;
v_original_card_subtotal numeric;
v_original_cash_subtotal numeric;
v_unpaid_card_total numeric;
v_unpaid_cash_total numeric;
v_effective_paid numeric;
v_payment_refunded numeric;
v_card_total_calc numeric;
v_payment_voided numeric;
v_payment_based_due numeric;
v_custom_refund_balance numeric;
v_order record;
v_new_sync_version integer;
BEGIN
SELECT
    COALESCE(SUM(quantity * unit_price), 0),
    COALESCE(SUM(quantity * COALESCE(cash_price, unit_price)), 0),
    COALESCE(SUM(discount_amount), 0)
INTO v_original_card_subtotal, v_original_cash_subtotal, v_discount
FROM public.order_items
WHERE order_id = p_order_id AND is_voided = false;

SELECT
    COALESCE(SUM(subtotal), 0),
    COALESCE(SUM(cash_subtotal), 0),
    COALESCE(SUM(tax_amount), 0),
    COALESCE(SUM(cash_tax_amount), 0)
INTO v_card_subtotal, v_cash_subtotal, v_card_tax, v_cash_tax
FROM public.order_items
WHERE order_id = p_order_id AND is_voided = false;

SELECT *
INTO v_order
FROM public.orders WHERE id = p_order_id;

v_service_charge := COALESCE(v_order.service_charge, 0);
v_amount_paid := COALESCE(v_order.amount_paid, 0);

SELECT
    COALESCE(SUM(
        ROUND(subtotal * (quantity - COALESCE(paid_quantity, 0) + COALESCE(refunded_quantity, 0))::NUMERIC / NULLIF(quantity, 0), 2) +
        ROUND(tax_amount * (quantity - COALESCE(paid_quantity, 0) + COALESCE(refunded_quantity, 0))::NUMERIC / NULLIF(quantity, 0), 2)
    ), 0),
    COALESCE(SUM(
        ROUND(cash_subtotal * (quantity - COALESCE(paid_quantity, 0) + COALESCE(refunded_quantity, 0))::NUMERIC / NULLIF(quantity, 0), 2) +
        ROUND(cash_tax_amount * (quantity - COALESCE(paid_quantity, 0) + COALESCE(refunded_quantity, 0))::NUMERIC / NULLIF(quantity, 0), 2)
    ), 0)
INTO v_unpaid_card_total, v_unpaid_cash_total
FROM public.order_items
WHERE order_id = p_order_id
    AND is_voided = false
    AND (quantity - COALESCE(paid_quantity, 0) + COALESCE(refunded_quantity, 0)) > 0;

SELECT
    COALESCE(SUM(
        COALESCE(original_amount, amount)
        - COALESCE(refunded_amount, 0) * COALESCE(original_amount, amount) / NULLIF(amount, 0)
    ), 0),
    COALESCE(SUM(COALESCE(refunded_amount, 0)), 0)
INTO v_effective_paid, v_payment_refunded
FROM public.order_payments
WHERE order_id = p_order_id
    AND status IN ('captured', 'partially_refunded', 'refunded')
    AND is_voided = false;

SELECT COALESCE(SUM(COALESCE(original_amount, amount)), 0)
INTO v_payment_voided
FROM public.order_payments
WHERE order_id = p_order_id
  AND (status = 'void' OR is_voided = true);


v_card_total_calc := v_card_subtotal + v_card_tax + v_service_charge;

v_payment_based_due := GREATEST(v_card_total_calc - v_effective_paid, 0);

v_custom_refund_balance := GREATEST(v_payment_based_due - v_unpaid_card_total, 0);

IF v_order.payment_status = 'paid' AND v_payment_refunded = 0 AND v_payment_voided = 0 THEN
    v_unpaid_card_total := 0;
    v_unpaid_cash_total := 0;
ELSE
    v_unpaid_card_total := v_unpaid_card_total + v_custom_refund_balance;
    v_unpaid_cash_total := v_unpaid_cash_total + v_custom_refund_balance;
END IF;

UPDATE public.orders SET
    -- Original subtotals (pre-discount) for reference
    card_subtotal = v_original_card_subtotal,
    cash_subtotal = v_original_cash_subtotal,

    -- Discount amount
    discount_amount = v_discount,

    -- Effective values (after discount)
    effective_subtotal = v_card_subtotal,
    effective_tax_amount = v_card_tax,
    effective_total = v_card_subtotal + v_card_tax + v_service_charge,

    -- Tax amounts (on discounted subtotals)
    card_tax_amount = v_card_tax,
    cash_tax_amount = v_cash_tax,

    -- Totals (discounted subtotal + tax + service)
    card_total = v_card_subtotal + v_card_tax + v_service_charge,
    cash_total = v_cash_subtotal + v_cash_tax + v_service_charge,

    -- Legacy fields
    subtotal = v_card_subtotal,
    tax_amount = v_card_tax,
    total_amount = v_card_subtotal + v_card_tax + v_service_charge,

    -- Amount due (calculated from UNPAID items, not total - paid)
    amount_due = v_unpaid_card_total,
    cash_amount_due = v_unpaid_cash_total,

    -- Bump sync_version to reduce broadcast count: callers no longer need
    -- a separate increment_order_sync_version UPDATE on the orders row
    sync_version = COALESCE(sync_version, 0) + 1,

    updated_at = now()
WHERE id = p_order_id
RETURNING sync_version INTO v_new_sync_version;

RETURN jsonb_build_object(
    'success', true,
    'card_subtotal', v_original_card_subtotal,
    'effective_subtotal', v_card_subtotal,
    'discount_amount', v_discount,
    'card_tax', v_card_tax,
    'card_total', v_card_subtotal + v_card_tax + v_service_charge,
    'cash_total', v_cash_subtotal + v_cash_tax + v_service_charge,
    'amount_due', v_unpaid_card_total,
    'cash_amount_due', v_unpaid_cash_total,
    'sync_version', v_new_sync_version
);
END;
$$;


-- 2. Modify recalculate_order_discount step 7 to also bump sync_version
CREATE OR REPLACE FUNCTION recalculate_order_discount(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_discount RECORD;
    v_preset_discount RECORD;
    v_applicable_subtotal NUMERIC := 0;
    v_new_calculated_amount NUMERIC := 0;
    v_affected_item_ids UUID[] := '{}';

    -- For item distribution
    v_item RECORD;
    v_item_proportion NUMERIC;
    v_item_discount_amount NUMERIC;
    v_distributed_total NUMERIC := 0;
    v_last_item_id UUID;
    v_item_calcs JSONB;

    -- Order totals
    v_gross_card_subtotal NUMERIC;
    v_gross_cash_subtotal NUMERIC;
    v_total_discount NUMERIC;
    v_net_card_subtotal NUMERIC;
    v_net_cash_subtotal NUMERIC;
    v_card_tax NUMERIC;
    v_cash_tax NUMERIC;
    v_card_total NUMERIC;
    v_cash_total NUMERIC;
    v_amount_paid NUMERIC;
    v_new_sync_version INTEGER;
BEGIN
    -- ============================================
    -- 1. Get Active Order-Level Discount
    -- ============================================
    SELECT
        od.id,
        od.discount_id,
        od.discount_name,
        od.discount_type::text as discount_type,
        od.discount_value,
        od.source::text as source,
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

    -- If no active discount, just recalculate totals and return
    IF v_discount.id IS NULL THEN
        -- Clear any stale discount data from items
        UPDATE public.order_items
        SET
            discount_id = NULL,
            discount_type = NULL,
            discount_value = 0,
            discount_amount = 0,
            discount_source = NULL,
            discount_applied_by = NULL,
            discount_approved_by = NULL,
            pre_discount_subtotal = NULL,
            -- Recalculate without discount
            subtotal = quantity * unit_price,
            cash_subtotal = quantity * COALESCE(cash_price, unit_price),
            tax_amount = ROUND((quantity * unit_price) * COALESCE(tax_rate, 0) / 100, 2),
            cash_tax_amount = ROUND((quantity * COALESCE(cash_price, unit_price)) * COALESCE(tax_rate, 0) / 100, 2),
            updated_at = now()
        WHERE order_id = p_order_id
          AND is_voided = false
          AND discount_amount > 0;

        -- calculate_order_totals_fast now also bumps sync_version
        PERFORM calculate_order_totals_fast(p_order_id);

        RETURN jsonb_build_object(
            'success', true,
            'has_discount', false,
            'message', 'No active discount'
        );
    END IF;

    -- ============================================
    -- 2. Get All Applicable Items
    -- ============================================
    SELECT
        COALESCE(SUM(oi.quantity * oi.unit_price), 0),
        COALESCE(array_agg(oi.id), '{}')
    INTO v_applicable_subtotal, v_affected_item_ids
    FROM public.order_items oi
    WHERE oi.order_id = p_order_id
      AND oi.is_voided = false
      AND oi.quantity > COALESCE(oi.paid_quantity, 0);

    -- Apply exclusions if preset discount
    IF v_discount.discount_id IS NOT NULL THEN
        -- Exclude alcohol
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

        -- Exclude categories
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

        -- Apply to specific categories only
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

    -- ============================================
    -- 3. Calculate New Discount Amount
    -- ============================================
    IF v_applicable_subtotal > 0 THEN
        IF v_discount.discount_type = 'percentage' THEN
            v_new_calculated_amount := ROUND(v_applicable_subtotal * (v_discount.discount_value / 100), 2);
            -- Apply cap if exists
            IF v_discount.max_discount_amount IS NOT NULL THEN
                v_new_calculated_amount := LEAST(v_new_calculated_amount, v_discount.max_discount_amount);
            END IF;
        ELSE
            -- Fixed amount
            v_new_calculated_amount := LEAST(v_discount.discount_value, v_applicable_subtotal);
        END IF;
    ELSE
        v_new_calculated_amount := 0;
    END IF;

    -- ============================================
    -- 4. Update order_discounts Record
    -- ============================================
    UPDATE public.order_discounts
    SET
        calculated_amount = v_new_calculated_amount,
        pre_discount_subtotal = v_applicable_subtotal,
        applied_to_item_ids = v_affected_item_ids
    WHERE id = v_discount.id;

    -- ============================================
    -- 5. Clear Discounts from Non-Applicable Items
    -- ============================================
    UPDATE public.order_items
    SET
        discount_id = NULL,
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

    -- ============================================
    -- 6. Distribute Discount to Applicable Items
    -- ============================================
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
            (oi.quantity * oi.unit_price) as item_gross_subtotal
        FROM public.order_items oi
        WHERE oi.id = ANY(v_affected_item_ids)
          AND oi.is_voided = false
        ORDER BY oi.created_at, oi.id
    LOOP
        -- Calculate proportion
        IF v_applicable_subtotal > 0 THEN
            v_item_proportion := v_item.item_gross_subtotal / v_applicable_subtotal;
        ELSE
            v_item_proportion := 0;
        END IF;

        -- This item's discount
        v_item_discount_amount := ROUND(v_new_calculated_amount * v_item_proportion, 2);
        v_distributed_total := v_distributed_total + v_item_discount_amount;
        v_last_item_id := v_item.id;

        -- Calculate item totals with discount
        v_item_calcs := calculate_item_totals(
            v_item.quantity,
            v_item.unit_price,
            v_item.cash_price,
            v_item.tax_rate,
            v_item_discount_amount
        );

        -- Update item
        UPDATE public.order_items
        SET
            discount_id = v_discount.discount_id,
            discount_type = v_discount.discount_type::discount_type,
            discount_value = v_discount.discount_value,
            discount_amount = v_item_discount_amount,
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

    -- Handle rounding remainder
    IF v_last_item_id IS NOT NULL AND v_distributed_total <> v_new_calculated_amount THEN
        DECLARE
            v_rounding_adj NUMERIC := v_new_calculated_amount - v_distributed_total;
            v_last_row RECORD;
        BEGIN
            SELECT * INTO v_last_row FROM public.order_items WHERE id = v_last_item_id;

            v_item_calcs := calculate_item_totals(
                v_last_row.quantity,
                v_last_row.unit_price,
                v_last_row.cash_price,
                v_last_row.tax_rate,
                v_last_row.discount_amount + v_rounding_adj
            );

            UPDATE public.order_items
            SET
                discount_amount = discount_amount + v_rounding_adj,
                subtotal = (v_item_calcs->>'subtotal')::numeric,
                cash_subtotal = (v_item_calcs->>'cash_subtotal')::numeric,
                tax_amount = (v_item_calcs->>'tax_amount')::numeric,
                cash_tax_amount = (v_item_calcs->>'cash_tax_amount')::numeric,
                updated_at = now()
            WHERE id = v_last_item_id;
        END;
    END IF;

    -- ============================================
    -- 7. Recalculate Order Totals
    -- ============================================
    SELECT COALESCE(amount_paid, 0) INTO v_amount_paid
    FROM public.orders WHERE id = p_order_id;

    SELECT
        COALESCE(SUM(quantity * unit_price), 0),
        COALESCE(SUM(quantity * COALESCE(cash_price, unit_price)), 0),
        COALESCE(SUM(discount_amount), 0),
        COALESCE(SUM(subtotal), 0),
        COALESCE(SUM(cash_subtotal), 0),
        COALESCE(SUM(tax_amount), 0),
        COALESCE(SUM(cash_tax_amount), 0)
    INTO
        v_gross_card_subtotal,
        v_gross_cash_subtotal,
        v_total_discount,
        v_net_card_subtotal,
        v_net_cash_subtotal,
        v_card_tax,
        v_cash_tax
    FROM public.order_items
    WHERE order_id = p_order_id AND is_voided = false;

    v_card_total := v_net_card_subtotal + v_card_tax;
    v_cash_total := v_net_cash_subtotal + v_cash_tax;

    UPDATE public.orders SET
        card_subtotal = v_gross_card_subtotal,
        cash_subtotal = v_gross_cash_subtotal,
        subtotal = v_gross_card_subtotal,
        discount_amount = v_total_discount,
        effective_subtotal = v_net_card_subtotal,
        card_tax_amount = v_card_tax,
        cash_tax_amount = v_cash_tax,
        tax_amount = v_card_tax,
        effective_tax_amount = v_card_tax,
        card_total = v_card_total,
        cash_total = v_cash_total,
        total_amount = v_card_total,
        effective_total = v_card_total,
        amount_due = GREATEST(v_card_total - v_amount_paid, 0),
        cash_amount_due = GREATEST(v_cash_total - v_amount_paid, 0),
        -- Bump sync_version in the same UPDATE to avoid a second trigger fire
        sync_version = COALESCE(sync_version, 0) + 1,
        updated_at = now()
    WHERE id = p_order_id
    RETURNING sync_version INTO v_new_sync_version;

    -- ============================================
    -- 8. Return Result
    -- ============================================
    RETURN jsonb_build_object(
        'success', true,
        'has_discount', true,
        'order_discount_id', v_discount.id,
        'discount_name', v_discount.discount_name,
        'pre_discount_subtotal', v_applicable_subtotal,
        'calculated_amount', v_new_calculated_amount,
        'affected_items_count', array_length(v_affected_item_ids, 1),
        'sync_version', v_new_sync_version,
        'order_totals', jsonb_build_object(
            'card_subtotal', v_gross_card_subtotal,
            'discount_amount', v_total_discount,
            'effective_subtotal', v_net_card_subtotal,
            'card_tax', v_card_tax,
            'card_total', v_card_total,
            'cash_total', v_cash_total
        )
    );
END;
$$;


-- 3. Modify add_order_item_v2: replace increment_order_sync_version with SELECT
CREATE OR REPLACE FUNCTION add_order_item_v2(
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
    p_category_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_location_id uuid;
    v_merchant_id uuid;
    v_tax_rate numeric := 0;
    v_is_tax_exempt boolean := false;
    v_item_id uuid;

    -- Pricing calculations
    v_modifier_total numeric := 0;
    v_size_mod numeric;
    v_effective_card_price numeric;
    v_effective_cash_price numeric;
    v_subtotal numeric;
    v_cash_subtotal numeric;
    v_tax_amount numeric;
    v_cash_tax_amount numeric;

    v_cash_discount_rate numeric := 0.04;
    v_has_active_discount boolean := false;
    v_new_sync_version integer;
BEGIN
    -- ============================================
    -- 1. Validate & Get Order Context (with RLS)
    -- ============================================
    SELECT o.location_id, o.merchant_id
    INTO v_location_id, v_merchant_id
    FROM public.orders o
    WHERE o.id = p_order_id
      AND o.status NOT IN ('completed', 'cancelled', 'void')
      AND o.merchant_id = user_merchant_id()
      AND o.location_id = ANY(user_location_ids())
    FOR UPDATE;

    IF v_location_id IS NULL THEN
        RAISE EXCEPTION 'Order not found or access denied: %', p_order_id;
    END IF;

    -- ============================================
    -- 2. Get Tax Rate
    -- ============================================
    IF p_menu_item_id IS NOT NULL THEN
        SELECT
            COALESCE(tr.percentage, 0),
            COALESCE(lio.is_tax_exempt, mi.is_tax_exempt, false)
        INTO v_tax_rate, v_is_tax_exempt
        FROM public.menu_items mi
        LEFT JOIN public.location_item_overrides lio
            ON lio.menu_item_id = mi.id
            AND lio.location_id = v_location_id
        LEFT JOIN public.tax_rates tr
            ON tr.location_id = v_location_id
            AND tr.tax_category::text = COALESCE(lio.tax_category, mi.tax_category, 'standard')::text
            AND tr.is_active = true
        WHERE mi.id = p_menu_item_id;

        IF v_is_tax_exempt THEN
            v_tax_rate := 0;
        END IF;
    ELSE
        SELECT COALESCE(tr.percentage, 0)
        INTO v_tax_rate
        FROM public.tax_rates tr
        WHERE tr.location_id = v_location_id
          AND tr.tax_category = 'standard'
          AND tr.is_active = true
        LIMIT 1;
    END IF;

    v_tax_rate := COALESCE(v_tax_rate, 0);

    -- ============================================
    -- 3. Calculate Modifier Total
    -- ============================================
    IF p_modifiers IS NOT NULL AND jsonb_array_length(p_modifiers) > 0 THEN
        SELECT COALESCE(SUM(
            COALESCE((mod->>'price_modifier')::numeric, 0) *
            COALESCE((mod->>'quantity')::integer, 1)
        ), 0)
        INTO v_modifier_total
        FROM jsonb_array_elements(p_modifiers) AS mod;
    END IF;

    -- ============================================
    -- 4. Calculate Pricing
    -- ============================================
    v_size_mod := COALESCE(p_size_price_modifier, 0);

    v_effective_card_price := p_unit_price + v_size_mod + v_modifier_total;
    v_effective_cash_price := COALESCE(p_cash_unit_price, p_unit_price * (1 - v_cash_discount_rate))
                              + v_size_mod + v_modifier_total;

    v_subtotal := v_effective_card_price * p_quantity;
    v_cash_subtotal := v_effective_cash_price * p_quantity;

    v_tax_amount := ROUND(v_subtotal * v_tax_rate / 100, 2);
    v_cash_tax_amount := ROUND(v_cash_subtotal * v_tax_rate / 100, 2);

    -- ============================================
    -- 5. Insert Order Item
    -- ============================================
    INSERT INTO public.order_items (
        order_id,
        menu_item_id,
        location_exclusive_item_id,
        item_name,
        category_name,
        quantity,
        unit_price,
        subtotal,
        tax_rate,
        tax_amount,
        cash_price,
        cash_subtotal,
        cash_tax_amount,
        selected_size_id,
        selected_size_name,
        size_price_modifier,
        special_instructions,
        item_status,
        course_number,
        seat_number,
        paid_quantity,
        created_at,
        updated_at,
        base_card_price,
        base_cash_price,
        menu_id,
        menu_name,
        category_id
    ) VALUES (
        p_order_id,
        p_menu_item_id,
        p_location_exclusive_item_id,
        p_item_name,
        COALESCE(p_category_name, 'Uncategorized'),
        p_quantity,
        v_effective_card_price,
        v_subtotal,
        v_tax_rate,
        v_tax_amount,
        v_effective_cash_price,
        v_cash_subtotal,
        v_cash_tax_amount,
        p_selected_size_id,
        p_selected_size_name,
        v_size_mod,
        p_special_instructions,
        'pending',
        COALESCE(p_course_number, 1),
        p_seat_number,
        0,
        now(),
        now(),
        p_unit_price,
        p_cash_unit_price,
        p_menu_id,
        p_menu_name,
        p_category_id
    )
    RETURNING id INTO v_item_id;

    -- ============================================
    -- 6. Insert Modifiers
    -- ============================================
    IF p_modifiers IS NOT NULL AND jsonb_array_length(p_modifiers) > 0 THEN
        INSERT INTO public.order_item_modifiers (
            order_item_id,
            modifier_group_id,
            modifier_item_id,
            modifier_group_name,
            modifier_name,
            price_modifier,
            quantity,
            total_price,
            is_no
        )
        SELECT
            v_item_id,
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

    -- 7. Check if there's an active order discount
    SELECT EXISTS(
        SELECT 1 FROM public.order_discounts
        WHERE order_id = p_order_id
          AND voided_at IS NULL
          AND calculated_amount > 0
    ) INTO v_has_active_discount;

    -- 8. If discount exists, redistribute across all items (including new one)
    IF v_has_active_discount THEN
        PERFORM redistribute_order_discount(p_order_id);

        SELECT subtotal, tax_amount, cash_subtotal, cash_tax_amount
        INTO v_subtotal, v_tax_amount, v_cash_subtotal, v_cash_tax_amount
        FROM public.order_items
        WHERE id = v_item_id;
    END IF;

    -- ============================================
    -- 9. RECALCULATE DISCOUNT + TOTALS + SYNC_VERSION
    -- recalculate_order_discount now bumps sync_version in its final UPDATE,
    -- so we no longer need a separate increment_order_sync_version call.
    -- This reduces broadcasts from 2 to 1 per item add.
    -- ============================================
    PERFORM recalculate_order_discount(p_order_id);

    -- Read the sync_version that was bumped by recalculate_order_discount
    SELECT sync_version INTO v_new_sync_version FROM orders WHERE id = p_order_id;

    -- ============================================
    -- 10. Return Result
    -- ============================================
    RETURN jsonb_build_object(
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
END
$$;
