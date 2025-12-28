-- ============================================
-- add_order_item: Captures tax rate at insert time
-- Called by your addItemToBackend
-- ============================================

CREATE OR REPLACE FUNCTION add_order_item_v2(
    p_order_id uuid,
    p_menu_item_id uuid DEFAULT NULL,
    p_quantity integer DEFAULT 1,
    p_unit_price numeric DEFAULT 0,
    p_cash_unit_price numeric DEFAULT NULL,
    p_item_name text DEFAULT NULL,
    p_category_name text DEFAULT NULL,
    p_selected_size_id uuid DEFAULT NULL,
    p_selected_size_name text DEFAULT NULL,
    p_size_price_modifier numeric DEFAULT 0,
    p_modifiers jsonb DEFAULT NULL,
    p_special_instructions text DEFAULT NULL,
    p_course_number integer DEFAULT 1,
    p_location_exclusive_item_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_location_id uuid;
    v_tax_rate numeric := 0;
    v_tax_category text := 'standard';
    v_item_id uuid;
    v_subtotal numeric;
    v_cash_subtotal numeric;
    v_tax_amount numeric;
    v_cash_tax_amount numeric;
    v_effective_cash_price numeric;
    v_cash_discount_rate numeric := 0.04;
BEGIN
    -- 1. Get location from order
    SELECT location_id INTO v_location_id 
    FROM public.orders WHERE id = p_order_id;
    
    IF v_location_id IS NULL THEN
        RAISE EXCEPTION 'Order not found: %', p_order_id;
    END IF;
    
    -- 2. Get tax rate for this item's category at this location
    IF p_menu_item_id IS NOT NULL THEN
        SELECT 
            COALESCE(tr.percentage, 8.0),
            COALESCE(lio.tax_category, mi.tax_category, 'standard')::text
        INTO v_tax_rate, v_tax_category
        FROM public.menu_items mi
        LEFT JOIN public.location_item_overrides lio 
            ON lio.menu_item_id = mi.id AND lio.location_id = v_location_id
        LEFT JOIN public.tax_rates tr 
            ON tr.location_id = v_location_id 
            AND tr.tax_category::text = COALESCE(lio.tax_category, mi.tax_category, 'standard')::text
            AND tr.is_active = true
        WHERE mi.id = p_menu_item_id;
        
        -- Check exemption
        IF EXISTS (
            SELECT 1 FROM public.menu_items mi
            LEFT JOIN public.location_item_overrides lio 
                ON lio.menu_item_id = mi.id AND lio.location_id = v_location_id
            WHERE mi.id = p_menu_item_id
              AND COALESCE(lio.is_tax_exempt, mi.is_tax_exempt, false) = true
        ) THEN
            v_tax_rate := 0;
        END IF;
    ELSE
        -- Open item / no menu item - use default rate
        SELECT COALESCE(percentage, 8.0) INTO v_tax_rate
        FROM public.tax_rates
        WHERE location_id = v_location_id 
          AND tax_category = 'standard' 
          AND is_active = true
        LIMIT 1;
    END IF;
    
    -- 3. Calculate all values upfront
    v_subtotal := p_unit_price * p_quantity;
    v_effective_cash_price := COALESCE(p_cash_unit_price, p_unit_price * (1 - v_cash_discount_rate));
    v_cash_subtotal := v_effective_cash_price * p_quantity;
    v_tax_amount := ROUND(v_subtotal * v_tax_rate / 100, 2);
    v_cash_tax_amount := ROUND(v_cash_subtotal * v_tax_rate / 100, 2);
    
    -- 4. Insert with pre-calculated values
    INSERT INTO public.order_items (
        order_id,
        menu_item_id,
        location_exclusive_item_id,
        quantity,
        unit_price,
        cash_price,
        cash_unit_price,
        subtotal,
        cash_subtotal,
        tax_rate,
        tax_amount,
        cash_tax_amount,
        price_paid,
        selected_size_id,
        size_price_modifier,
        special_instructions,
        modifiers,
        course_number,
        item_name,
        category_name,
        paid_quantity
    ) VALUES (
        p_order_id,
        p_menu_item_id,
        p_location_exclusive_item_id,
        p_quantity,
        p_unit_price,
        v_effective_cash_price,
        v_effective_cash_price,
        v_subtotal,
        v_cash_subtotal,
        v_tax_rate,
        v_tax_amount,
        v_cash_tax_amount,
        p_unit_price,  -- Default to card price
        p_selected_size_id,
        p_size_price_modifier,
        p_special_instructions,
        p_modifiers,
        p_course_number,
        p_item_name,
        p_category_name,
        0  -- Nothing paid yet
    )
    RETURNING id INTO v_item_id;
    
    -- 5. Recalculate order totals (simple SUMs now!)
    PERFORM calculate_order_totals_fast(p_order_id);
    
    RETURN jsonb_build_object(
        'success', true,
        'order_item_id', v_item_id,
        'subtotal', v_subtotal,
        'tax_amount', v_tax_amount,
        'cash_subtotal', v_cash_subtotal,
        'cash_tax_amount', v_cash_tax_amount,
        'tax_rate', v_tax_rate
    );
END;
$$;

-- ============================================
-- FAST: Order totals using pre-calculated item values
-- No joins needed - just aggregate order_items
-- ============================================

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
BEGIN
    -- Single aggregate query - no joins!
    SELECT 
        COALESCE(SUM(subtotal), 0) - COALESCE(SUM(discount_amount), 0),
        COALESCE(SUM(cash_subtotal), 0) - COALESCE(SUM(discount_amount), 0),
        COALESCE(SUM(tax_amount), 0),
        COALESCE(SUM(cash_tax_amount), 0),
        COALESCE(SUM(discount_amount), 0)
    INTO v_card_subtotal, v_cash_subtotal, v_card_tax, v_cash_tax, v_discount
    FROM public.order_items
    WHERE order_id = p_order_id AND is_voided = false;
    
    -- Get service charge and amount paid
    SELECT 
        COALESCE(service_charge, 0),
        COALESCE(amount_paid, 0)
    INTO v_service_charge, v_amount_paid
    FROM public.orders WHERE id = p_order_id;

    -- Update order with totals
    UPDATE public.orders SET
        card_subtotal = v_card_subtotal,
        card_tax_amount = v_card_tax,
        card_total = v_card_subtotal + v_card_tax + v_service_charge,
        cash_subtotal = v_cash_subtotal,
        cash_tax_amount = v_cash_tax,
        cash_total = v_cash_subtotal + v_cash_tax + v_service_charge,
        subtotal = v_card_subtotal,
        tax_amount = v_card_tax,
        total_amount = v_card_subtotal + v_card_tax + v_service_charge,
        discount_amount = v_discount,
        amount_due = (v_card_subtotal + v_card_tax + v_service_charge) - v_amount_paid,
        updated_at = now()
    WHERE id = p_order_id;
    
    RETURN jsonb_build_object(
        'success', true,
        'card_total', v_card_subtotal + v_card_tax + v_service_charge,
        'cash_total', v_cash_subtotal + v_cash_tax + v_service_charge,
        'amount_due', (v_card_subtotal + v_card_tax + v_service_charge) - v_amount_paid
    );
END;
$$;