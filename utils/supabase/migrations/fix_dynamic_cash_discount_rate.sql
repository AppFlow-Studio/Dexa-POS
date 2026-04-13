-- ============================================================
-- Fix: Replace hardcoded v_cash_discount_rate := 0.04 with
--      dynamic lookup from locations.dual_pricing_percentage
-- File: utils/supabase/migrations/fix_dynamic_cash_discount_rate.sql
-- ============================================================
-- Problem:
--   Several RPC functions hardcode v_cash_discount_rate := 0.04
--   (4%). This rate is only used as a FALLBACK when the frontend
--   does not send an explicit p_cash_unit_price (i.e., the menu
--   item has no cash_price set). For "dual" pricing strategy
--   stores where the rate is auto-applied, using 4% regardless
--   of the location's configured dual_pricing_percentage is wrong.
--
-- Fix:
--   After v_location_id is resolved (step 1 of each function),
--   read dual_pricing_percentage from the location row and
--   convert to a rate (percentage / 100). Falls back to 0.04
--   if the column is NULL or not set.
--
-- Affected functions (this migration):
--   1. add_order_item_v3 — main item creation path
--   2. add_open_item_v2  — open item creation
--   3. calculate_order_dual_totals — order recalculation
--
-- Safety:
--   For manual pricing stores, the frontend always sends
--   p_cash_unit_price, so COALESCE picks it and the rate is
--   never used. This change only affects the fallback path.
--   The COALESCE(..., 0.04) preserves the existing default.
-- ============================================================


-- ------------------------------------------------------------
-- 1. add_order_item_v3
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_order_item_v3(
    p_order_id uuid,
    p_menu_item_id uuid,
    p_location_exclusive_item_id uuid,
    p_item_name text,
    p_category_name text,
    p_quantity integer,
    p_unit_price numeric,
    p_cash_unit_price numeric DEFAULT NULL::numeric,
    p_selected_size_id uuid DEFAULT NULL::uuid,
    p_selected_size_name text DEFAULT NULL::text,
    p_size_price_modifier numeric DEFAULT 0,
    p_modifiers jsonb DEFAULT NULL::jsonb,
    p_special_instructions text DEFAULT NULL::text,
    p_course_number integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'public', 'pg_temp'
AS $function$
DECLARE
    v_location_id uuid;
    v_merchant_id uuid;
    v_tax_rate numeric := 8.0;
    v_is_tax_exempt boolean := false;
    v_item_id uuid;

    -- Pricing
    v_modifier_total numeric := 0;
    v_size_mod numeric;
    v_effective_card_price numeric;
    v_effective_cash_price numeric;
    v_subtotal numeric;
    v_cash_subtotal numeric;
    v_tax_amount numeric;
    v_cash_tax_amount numeric;

    v_cash_discount_rate numeric;  -- dynamic, no longer hardcoded
    v_discount_result JSONB;
BEGIN
    -- ============================================
    -- 1. Validate & Get Order Context
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
    -- 1b. Get cash discount rate from location
    -- ============================================
    SELECT COALESCE(l.dual_pricing_percentage / 100.0, 0.04)
    INTO v_cash_discount_rate
    FROM public.locations l
    WHERE l.id = v_location_id;

    -- ============================================
    -- 2. Get Tax Rate
    -- ============================================
    IF p_menu_item_id IS NOT NULL THEN
        SELECT
            COALESCE(tr.percentage, 8.0),
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
        SELECT COALESCE(tr.percentage, 8.0) INTO v_tax_rate
        FROM public.tax_rates tr
        WHERE tr.location_id = v_location_id
          AND tr.tax_category = 'standard' AND tr.is_active = true
        LIMIT 1;
    END IF;

    v_tax_rate := COALESCE(v_tax_rate, 8.0);

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
    -- 4. Calculate Pricing (WITHOUT discount - will be applied by recalculate)
    -- ============================================
    v_size_mod := COALESCE(p_size_price_modifier, 0);
    v_effective_card_price := p_unit_price + v_size_mod + v_modifier_total;
    v_effective_cash_price := COALESCE(p_cash_unit_price, p_unit_price * (1 - v_cash_discount_rate))
                              + v_size_mod + v_modifier_total;

    -- Initial values (no discount yet)
    v_subtotal := v_effective_card_price * p_quantity;
    v_cash_subtotal := v_effective_cash_price * p_quantity;
    v_tax_amount := ROUND(v_subtotal * v_tax_rate / 100, 2);
    v_cash_tax_amount := ROUND(v_cash_subtotal * v_tax_rate / 100, 2);

    -- ============================================
    -- 5. Insert Order Item (without discount - will be set by recalculate)
    -- ============================================
    INSERT INTO public.order_items (
        order_id, menu_item_id, location_exclusive_item_id,
        item_name, category_name, quantity,
        unit_price, subtotal, tax_rate, tax_amount,
        cash_price, cash_subtotal, cash_tax_amount,
        selected_size_id, selected_size_name, size_price_modifier,
        special_instructions, item_status, course_number,
        paid_quantity, created_at, updated_at
    ) VALUES (
        p_order_id, p_menu_item_id, p_location_exclusive_item_id,
        p_item_name, COALESCE(p_category_name, 'Uncategorized'), p_quantity,
        v_effective_card_price, v_subtotal, v_tax_rate, v_tax_amount,
        v_effective_cash_price, v_cash_subtotal, v_cash_tax_amount,
        p_selected_size_id, p_selected_size_name, v_size_mod,
        p_special_instructions, 'pending', COALESCE(p_course_number, 1),
        0, now(), now()
    )
    RETURNING id INTO v_item_id;

    -- ============================================
    -- 6. Insert Modifiers
    -- ============================================
    IF p_modifiers IS NOT NULL AND jsonb_array_length(p_modifiers) > 0 THEN
        INSERT INTO public.order_item_modifiers (
            order_item_id, modifier_group_id, modifier_item_id,
            modifier_group_name, modifier_name, price_modifier, quantity, total_price
        )
        SELECT
            v_item_id,
            (mod->>'modifier_group_id')::uuid,
            (mod->>'modifier_item_id')::uuid,
            mod->>'modifier_group_name',
            mod->>'modifier_name',
            COALESCE((mod->>'price_modifier')::numeric, 0),
            COALESCE((mod->>'quantity')::integer, 1),
            COALESCE((mod->>'price_modifier')::numeric, 0) * COALESCE((mod->>'quantity')::integer, 1)
        FROM jsonb_array_elements(p_modifiers) AS mod;
    END IF;

    -- ============================================
    -- 7. RECALCULATE DISCOUNT (updates order_discounts + all items)
    -- ============================================
    v_discount_result := recalculate_order_discount(p_order_id);

    -- ============================================
    -- 8. Return Result
    -- ============================================
    RETURN jsonb_build_object(
        'success', true,
        'order_item_id', v_item_id,
        'item_name', p_item_name,
        'quantity', p_quantity,
        'unit_price', v_effective_card_price,
        'cash_price', v_effective_cash_price,
        'modifier_total', v_modifier_total,
        'tax_rate', v_tax_rate,
        'discount_applied', (v_discount_result->>'has_discount')::boolean,
        'discount_recalculated', v_discount_result
    );
END;
$function$;


-- ------------------------------------------------------------
-- 2. add_open_item_v2
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_open_item_v2(
    p_order_id uuid,
    p_item_name text,
    p_unit_price numeric,
    p_quantity integer DEFAULT 1,
    p_special_instructions text DEFAULT NULL::text,
    p_is_tax_exempt boolean DEFAULT false,
    p_seat_number integer DEFAULT NULL::integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'public', 'pg_temp'
AS $function$
DECLARE
    v_location_id uuid;
    v_merchant_id uuid;
    v_tax_rate numeric := 8.0;
    v_item_id uuid;

    -- Pricing calculations
    v_cash_price numeric;
    v_subtotal numeric;
    v_cash_subtotal numeric;
    v_tax_amount numeric;
    v_cash_tax_amount numeric;

    v_cash_discount_rate numeric;  -- dynamic, no longer hardcoded
BEGIN
    -- ============================================
    -- 1. Validate & Get Order Context
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
    -- 1b. Get cash discount rate from location
    -- ============================================
    SELECT COALESCE(l.dual_pricing_percentage / 100.0, 0.04)
    INTO v_cash_discount_rate
    FROM public.locations l
    WHERE l.id = v_location_id;

    -- ============================================
    -- 2. Get Tax Rate (unless exempt)
    -- ============================================
    IF NOT p_is_tax_exempt THEN
        SELECT COALESCE(tr.percentage, 8.0)
        INTO v_tax_rate
        FROM public.tax_rates tr
        WHERE tr.location_id = v_location_id
          AND tr.tax_category = 'standard'
          AND tr.is_active = true
        LIMIT 1;

        v_tax_rate := COALESCE(v_tax_rate, 8.0);
    ELSE
        v_tax_rate := 0;
    END IF;

    -- ============================================
    -- 3. Calculate Pricing (simplified - no modifiers/sizes)
    -- ============================================
    -- Cash price = card price * (1 - cash_discount_rate)
    v_cash_price := p_unit_price * (1 - v_cash_discount_rate);

    -- Subtotals
    v_subtotal := p_unit_price * p_quantity;
    v_cash_subtotal := v_cash_price * p_quantity;

    -- Tax
    v_tax_amount := ROUND(v_subtotal * v_tax_rate / 100, 2);
    v_cash_tax_amount := ROUND(v_cash_subtotal * v_tax_rate / 100, 2);

    -- ============================================
    -- 4. Insert Order Item
    -- ============================================
    INSERT INTO public.order_items (
        order_id,

        -- Open item flags
        is_open_item,
        open_item_name,
        open_item_price,

        -- Standard fields (for compatibility)
        menu_item_id,
        item_name,
        category_name,
        quantity,

        -- Card pricing
        unit_price,
        subtotal,
        tax_rate,
        tax_amount,

        -- Cash pricing
        cash_price,
        cash_subtotal,
        cash_tax_amount,

        -- Kitchen
        special_instructions,
        seat_number,
        item_status,

        -- Payment tracking
        paid_quantity,

        -- Timestamps
        created_at,
        updated_at
    ) VALUES (
        p_order_id,

        -- Open item
        TRUE,  -- is_open_item
        p_item_name,  -- open_item_name
        p_unit_price,  -- open_item_price

        -- Standard fields
        NULL,  -- menu_item_id
        p_item_name,  -- item_name (for reporting)
        'Open Items',  -- category_name
        p_quantity,

        -- Card pricing
        p_unit_price,  -- unit_price
        v_subtotal,
        v_tax_rate,
        v_tax_amount,

        -- Cash pricing
        v_cash_price,
        v_cash_subtotal,
        v_cash_tax_amount,

        -- Kitchen
        p_special_instructions,
        p_seat_number,
        'pending',

        -- Payment
        0,  -- paid_quantity

        -- Timestamps
        now(),
        now()
    )
    RETURNING id INTO v_item_id;

    -- ============================================
    -- 5. Recalculate Order Totals
    -- ============================================
    PERFORM calculate_order_totals_fast(p_order_id);

    -- ============================================
    -- 6. Return Result
    -- ============================================
    RETURN jsonb_build_object(
        'success', true,
        'order_item_id', v_item_id,
        'item_name', p_item_name,
        'quantity', p_quantity,
        'unit_price', p_unit_price,
        'cash_price', v_cash_price,
        'subtotal', v_subtotal,
        'cash_subtotal', v_cash_subtotal,
        'tax_rate', v_tax_rate,
        'tax_amount', v_tax_amount,
        'cash_tax_amount', v_cash_tax_amount
    );
END;
$function$;


-- ------------------------------------------------------------
-- 3. calculate_order_dual_totals
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calculate_order_dual_totals(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'public', 'pg_temp'
AS $function$
DECLARE
    v_location_id uuid;
    v_merchant_id uuid;
    v_card_subtotal numeric := 0;
    v_cash_subtotal numeric := 0;
    v_card_tax numeric := 0;
    v_cash_tax numeric := 0;
    v_item_discount_total numeric := 0;
    v_service_charge numeric := 0;
    v_tax_rate numeric := 0.08;  -- Default 8% tax rate
    v_cash_discount_rate numeric;  -- dynamic, no longer hardcoded
BEGIN
    -- Get order context
    SELECT location_id, merchant_id, COALESCE(service_charge, 0)
    INTO v_location_id, v_merchant_id, v_service_charge
    FROM public.orders
    WHERE id = p_order_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found: %', p_order_id;
    END IF;

    -- Get cash discount rate from location
    SELECT COALESCE(l.dual_pricing_percentage / 100.0, 0.04)
    INTO v_cash_discount_rate
    FROM public.locations l
    WHERE l.id = v_location_id;

    -- ============================================
    -- Calculate subtotals from order items
    -- ============================================
    SELECT
        -- Card subtotal: unit_price * quantity - discounts
        COALESCE(SUM(
            (oi.unit_price * oi.quantity) - COALESCE(oi.discount_amount, 0)
        ), 0),
        -- Cash subtotal: use cash_price if available, otherwise apply discount rate
        COALESCE(SUM(
            (COALESCE(oi.cash_price, oi.unit_price * (1 - v_cash_discount_rate)) * oi.quantity)
            - COALESCE(oi.discount_amount, 0)
        ), 0),
        -- Total item-level discounts
        COALESCE(SUM(oi.discount_amount), 0)
    INTO v_card_subtotal, v_cash_subtotal, v_item_discount_total
    FROM public.order_items oi
    WHERE oi.order_id = p_order_id
      AND oi.is_voided = false;

    -- ============================================
    -- Calculate taxes using default rate
    -- ============================================
    v_card_tax := ROUND(v_card_subtotal * v_tax_rate, 2);
    v_cash_tax := ROUND(v_cash_subtotal * v_tax_rate, 2);

    -- ============================================
    -- Update order with calculated values
    -- ============================================
    UPDATE public.orders SET
        -- Standard columns (already exist)
        subtotal = v_card_subtotal,
        tax_amount = v_card_tax,
        total_amount = v_card_subtotal + v_card_tax + v_service_charge,
        discount_amount = v_item_discount_total,
        amount_due = (v_card_subtotal + v_card_tax + v_service_charge) - COALESCE(amount_paid, 0),
        updated_at = now()
    WHERE id = p_order_id;

    -- Return result with dual pricing info
    RETURN jsonb_build_object(
        'success', true,
        'card', jsonb_build_object(
            'subtotal', v_card_subtotal,
            'tax', v_card_tax,
            'service_charge', v_service_charge,
            'total', v_card_subtotal + v_card_tax + v_service_charge
        ),
        'cash', jsonb_build_object(
            'subtotal', v_cash_subtotal,
            'tax', v_cash_tax,
            'service_charge', v_service_charge,
            'total', v_cash_subtotal + v_cash_tax + v_service_charge
        ),
        'discounts', jsonb_build_object(
            'item_level', v_item_discount_total,
            'order_level', 0,
            'total', v_item_discount_total
        ),
        'savings', (v_card_subtotal + v_card_tax) - (v_cash_subtotal + v_cash_tax)
    );
END;
$function$;
