--TODOOO: 
-- ============================================
-- FIX: Discount-Before-Tax Calculation
-- 
-- Problem: add_order_item_v2 and update_order_item_v2 calculate tax on
-- pre-discount amounts, ignoring any existing order-level discounts.
-- 
-- Solution:
-- 1. Create helper function to apply order discount to an item
-- 2. Update add_order_item_v2 to check for and apply existing discounts
-- 3. Update update_order_item_v2 similarly
-- 4. calculate_order_totals_fast already sums item-level values correctly
-- ============================================

-- ============================================
-- 1. Helper Function: Apply order discount to a single item
-- Called after inserting/updating an item to apply any active order discount
-- ============================================
CREATE OR REPLACE FUNCTION apply_order_discount_to_item(
    p_order_id UUID,
    p_order_item_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_item RECORD;
    v_total_discount NUMERIC := 0;
    v_total_discount_type TEXT;
    v_total_discount_value NUMERIC;
    v_order_subtotal NUMERIC;
    v_item_proportion NUMERIC;
    v_item_discount_amount NUMERIC;
    v_discounted_subtotal NUMERIC;
    v_discounted_cash_subtotal NUMERIC;
    v_new_tax_amount NUMERIC;
    v_new_cash_tax_amount NUMERIC;
BEGIN
    -- Get all active (non-voided) order discounts
    SELECT 
        SUM(od.calculated_amount)
    INTO v_total_discount
    FROM public.order_discounts od
    WHERE od.order_id = p_order_id
      AND od.voided_at IS NULL;
    
    -- If no discount, nothing to do
    IF v_total_discount IS NULL OR v_total_discount <= 0 THEN
        RETURN;
    END IF;
    
    -- Get the item details
    SELECT 
        oi.id,
        oi.quantity,
        oi.unit_price,
        oi.cash_price,
        oi.tax_rate,
        (oi.quantity * oi.unit_price) as item_subtotal,
        (oi.quantity * COALESCE(oi.cash_price, oi.unit_price)) as item_cash_subtotal
    INTO v_item
    FROM public.order_items oi
    WHERE oi.id = p_order_item_id
      AND oi.is_voided = false;
    
    IF v_item IS NULL THEN
        RETURN;
    END IF;
    
    -- Get total order subtotal (sum of all non-voided items, pre-discount)
    SELECT COALESCE(SUM(quantity * unit_price), 0)
    INTO v_order_subtotal
    FROM public.order_items
    WHERE order_id = p_order_id
      AND is_voided = false;
    
    IF v_order_subtotal <= 0 THEN
        RETURN;
    END IF;
    
    -- Calculate this item's proportion of the order
    v_item_proportion := v_item.item_subtotal / v_order_subtotal;
    
    -- Calculate this item's share of the discount
    v_item_discount_amount := ROUND(v_total_discount * v_item_proportion, 2);
    
    -- Calculate discounted subtotals
    v_discounted_subtotal := v_item.item_subtotal - v_item_discount_amount;
    v_discounted_cash_subtotal := v_item.item_cash_subtotal - 
        ROUND(v_item_discount_amount * v_item.item_cash_subtotal / NULLIF(v_item.item_subtotal, 0), 2);
    
    -- Recalculate tax on discounted amounts
    v_new_tax_amount := ROUND(v_discounted_subtotal * COALESCE(v_item.tax_rate, 0) / 100, 2);
    v_new_cash_tax_amount := ROUND(v_discounted_cash_subtotal * COALESCE(v_item.tax_rate, 0) / 100, 2);
    
    -- Update the item with discount-adjusted values
    UPDATE public.order_items
    SET
        discount_amount = v_item_discount_amount,
        subtotal = v_discounted_subtotal,
        cash_subtotal = v_discounted_cash_subtotal,
        tax_amount = v_new_tax_amount,
        cash_tax_amount = v_new_cash_tax_amount,
        updated_at = now()
    WHERE id = p_order_item_id;
    
END;
$$;

-- ============================================
-- 2. Helper Function: Redistribute discount across ALL items
-- Called when an item is added/updated to ensure proportional distribution
-- ============================================
CREATE OR REPLACE FUNCTION redistribute_order_discount(p_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_total_discount NUMERIC := 0;
    v_order_subtotal NUMERIC := 0;
    v_order_cash_subtotal NUMERIC := 0;
    v_item RECORD;
    v_item_proportion NUMERIC;
    v_item_discount_amount NUMERIC;
    v_discounted_subtotal NUMERIC;
    v_discounted_cash_subtotal NUMERIC;
    v_new_tax_amount NUMERIC;
    v_new_cash_tax_amount NUMERIC;
    v_distributed_total NUMERIC := 0;
    v_last_item_id UUID;
BEGIN
    -- Get total active discount amount
    SELECT COALESCE(SUM(calculated_amount), 0)
    INTO v_total_discount
    FROM public.order_discounts
    WHERE order_id = p_order_id
      AND voided_at IS NULL;
    
    -- If no discount, reset all items to original values
    IF v_total_discount <= 0 THEN
        UPDATE public.order_items
        SET
            discount_amount = 0,
            subtotal = quantity * unit_price,
            cash_subtotal = quantity * COALESCE(cash_price, unit_price),
            tax_amount = ROUND((quantity * unit_price) * COALESCE(tax_rate, 0) / 100, 2),
            cash_tax_amount = ROUND((quantity * COALESCE(cash_price, unit_price)) * COALESCE(tax_rate, 0) / 100, 2),
            updated_at = now()
        WHERE order_id = p_order_id
          AND is_voided = false;
        RETURN;
    END IF;
    
    -- Get order totals (pre-discount)
    SELECT 
        COALESCE(SUM(quantity * unit_price), 0),
        COALESCE(SUM(quantity * COALESCE(cash_price, unit_price)), 0)
    INTO v_order_subtotal, v_order_cash_subtotal
    FROM public.order_items
    WHERE order_id = p_order_id
      AND is_voided = false;
    
    IF v_order_subtotal <= 0 THEN
        RETURN;
    END IF;
    
    -- Distribute discount proportionally to each item
    FOR v_item IN
        SELECT 
            id,
            quantity,
            unit_price,
            cash_price,
            tax_rate,
            (quantity * unit_price) as item_subtotal,
            (quantity * COALESCE(cash_price, unit_price)) as item_cash_subtotal
        FROM public.order_items
        WHERE order_id = p_order_id
          AND is_voided = false
        ORDER BY created_at, id
    LOOP
        -- Calculate proportion
        v_item_proportion := v_item.item_subtotal / v_order_subtotal;
        
        -- Calculate discount amount for this item
        v_item_discount_amount := ROUND(v_total_discount * v_item_proportion, 2);
        v_distributed_total := v_distributed_total + v_item_discount_amount;
        v_last_item_id := v_item.id;
        
        -- Calculate discounted subtotals
        v_discounted_subtotal := v_item.item_subtotal - v_item_discount_amount;
        v_discounted_cash_subtotal := v_item.item_cash_subtotal - 
            ROUND(v_item_discount_amount * v_item.item_cash_subtotal / NULLIF(v_item.item_subtotal, 0), 2);
        
        -- Calculate tax on DISCOUNTED amounts
        v_new_tax_amount := ROUND(v_discounted_subtotal * COALESCE(v_item.tax_rate, 0) / 100, 2);
        v_new_cash_tax_amount := ROUND(v_discounted_cash_subtotal * COALESCE(v_item.tax_rate, 0) / 100, 2);
        
        -- Update item
        UPDATE public.order_items
        SET
            discount_amount = v_item_discount_amount,
            subtotal = v_discounted_subtotal,
            cash_subtotal = v_discounted_cash_subtotal,
            tax_amount = v_new_tax_amount,
            cash_tax_amount = v_new_cash_tax_amount,
            updated_at = now()
        WHERE id = v_item.id;
    END LOOP;
    
    -- Handle rounding difference - assign to last item
    IF v_last_item_id IS NOT NULL AND v_distributed_total <> v_total_discount THEN
        DECLARE
            v_rounding_adjustment NUMERIC := v_total_discount - v_distributed_total;
            v_current_discount NUMERIC;
            v_current_subtotal NUMERIC;
            v_current_tax_rate NUMERIC;
        BEGIN
            SELECT discount_amount, subtotal, tax_rate
            INTO v_current_discount, v_current_subtotal, v_current_tax_rate
            FROM public.order_items
            WHERE id = v_last_item_id;
            
            UPDATE public.order_items
            SET
                discount_amount = v_current_discount + v_rounding_adjustment,
                subtotal = v_current_subtotal - v_rounding_adjustment,
                tax_amount = ROUND((v_current_subtotal - v_rounding_adjustment) * COALESCE(v_current_tax_rate, 0) / 100, 2),
                updated_at = now()
            WHERE id = v_last_item_id;
        END;
    END IF;
END;
$$;

-- ============================================
-- 3. Updated add_order_item_v2 with discount awareness
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
SET search_path = public
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
    v_has_active_discount boolean := false;
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
    
    -- 3. Calculate base values (pre-discount)
    v_subtotal := p_unit_price * p_quantity;
    v_effective_cash_price := COALESCE(p_cash_unit_price, p_unit_price * (1 - v_cash_discount_rate));
    v_cash_subtotal := v_effective_cash_price * p_quantity;
    v_tax_amount := ROUND(v_subtotal * v_tax_rate / 100, 2);
    v_cash_tax_amount := ROUND(v_cash_subtotal * v_tax_rate / 100, 2);
    
    -- 4. Insert with pre-calculated values (discount will be applied after)
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
        paid_quantity,
        discount_amount
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
        p_unit_price,
        p_selected_size_id,
        p_size_price_modifier,
        p_special_instructions,
        p_modifiers,
        p_course_number,
        p_item_name,
        p_category_name,
        0,
        0  -- discount_amount starts at 0
    )
    RETURNING id INTO v_item_id;
    
    -- 5. Check if there's an active order discount
    SELECT EXISTS(
        SELECT 1 FROM public.order_discounts
        WHERE order_id = p_order_id
          AND voided_at IS NULL
          AND calculated_amount > 0
    ) INTO v_has_active_discount;
    
    -- 6. If discount exists, redistribute across all items (including new one)
    IF v_has_active_discount THEN
        PERFORM redistribute_order_discount(p_order_id);
        
        -- Get the updated values for the new item
        SELECT subtotal, tax_amount, cash_subtotal, cash_tax_amount
        INTO v_subtotal, v_tax_amount, v_cash_subtotal, v_cash_tax_amount
        FROM public.order_items
        WHERE id = v_item_id;
    END IF;
    
    -- 7. Recalculate order totals
    PERFORM calculate_order_totals_fast(p_order_id);
    
    RETURN jsonb_build_object(
        'success', true,
        'order_item_id', v_item_id,
        'subtotal', v_subtotal,
        'tax_amount', v_tax_amount,
        'cash_subtotal', v_cash_subtotal,
        'cash_tax_amount', v_cash_tax_amount,
        'tax_rate', v_tax_rate,
        'discount_applied', v_has_active_discount
    );
END;
$$;

-- ============================================
-- 4. Updated update_order_item_v2 with discount awareness
-- ============================================
CREATE OR REPLACE FUNCTION update_order_item_v2(
    p_order_item_id uuid,
    p_quantity integer DEFAULT NULL,
    p_unit_price numeric DEFAULT NULL,
    p_special_instructions text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
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
    v_discount_amount numeric := 0;
    v_discount_cash_amount numeric := 0;

    v_cash_discount_rate numeric := 0.04;
    v_has_active_discount boolean := false;
    v_new_sync_version integer;
BEGIN
    -- Get current item details
    SELECT
        oi.order_id,
        oi.is_open_item,
        oi.quantity,
        oi.unit_price,
        oi.tax_rate,
        o.location_id,
        o.sync_version + 1  -- Increment sync version
    INTO v_order_id, v_is_open_item, v_new_quantity, v_new_price, v_tax_rate, v_location_id, v_new_sync_version
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE oi.id = p_order_item_id
      AND o.merchant_id = user_merchant_id()
      AND o.location_id = ANY(user_location_ids())
    FOR UPDATE;  -- Lock row to prevent race conditions
    
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
    
    -- Recalculate base pricing (pre-discount)
    v_cash_price := v_new_price * (1 - v_cash_discount_rate);
    v_subtotal := v_new_price * v_new_quantity;
    v_cash_subtotal := v_cash_price * v_new_quantity;
    v_tax_amount := ROUND(v_subtotal * v_tax_rate / 100, 2);
    v_cash_tax_amount := ROUND(v_cash_subtotal * v_tax_rate / 100, 2);
    
    -- Update the item with base values (discount will be applied after)
    UPDATE public.order_items SET
        quantity = v_new_quantity,
        unit_price = v_new_price,
        cash_price = v_cash_price,
        subtotal = v_subtotal,
        cash_subtotal = v_cash_subtotal,
        tax_amount = v_tax_amount,
        cash_tax_amount = v_cash_tax_amount,
        discount_amount = 0,  -- Reset, will be recalculated
        open_item_price = CASE WHEN v_is_open_item THEN v_new_price ELSE open_item_price END,
        special_instructions = COALESCE(p_special_instructions, special_instructions),
        updated_at = now()
    WHERE id = p_order_item_id;
    
    -- Check if there's an active order discount
    SELECT EXISTS(
        SELECT 1 FROM public.order_discounts
        WHERE order_id = v_order_id
          AND voided_at IS NULL
          AND calculated_amount > 0
    ) INTO v_has_active_discount;
    
    -- If discount exists, redistribute across all items
    IF v_has_active_discount THEN
        PERFORM redistribute_order_discount(v_order_id);

        -- Get updated values including discount amounts
        SELECT
            subtotal,
            tax_amount,
            cash_subtotal,
            cash_tax_amount,
            COALESCE(discount_amount, 0),
            COALESCE(discount_cash_amount, 0)
        INTO
            v_subtotal,
            v_tax_amount,
            v_cash_subtotal,
            v_cash_tax_amount,
            v_discount_amount,
            v_discount_cash_amount
        FROM public.order_items
        WHERE id = p_order_item_id;
    END IF;

    -- Update order sync version
    UPDATE public.orders
    SET sync_version = v_new_sync_version,
        updated_at = now()
    WHERE id = v_order_id;

    -- Recalculate order totals
    PERFORM calculate_order_totals_fast(v_order_id);
    
    RETURN jsonb_build_object(
        'success', true,
        'order_item_id', p_order_item_id,

        -- Backward compatibility (existing fields)
        'quantity', v_new_quantity,
        'unit_price', v_new_price,
        'subtotal', v_subtotal,
        'discount_applied', v_has_active_discount,

        -- NEW: Complete item data with explicit naming
        -- Card pricing (explicit)
        'card_subtotal', v_subtotal,
        'card_tax_amount', v_tax_amount,

        -- Cash pricing
        'cash_unit_price', v_cash_price,
        'cash_subtotal', v_cash_subtotal,
        'cash_tax_amount', v_cash_tax_amount,

        -- Discounts
        'discount_amount', v_discount_amount,
        'discount_cash_amount', v_discount_cash_amount,

        -- Sync version for conflict detection
        'sync_version', v_new_sync_version
    );
END;
$$;

-- ============================================
-- 5. Updated add_open_item_v2 with discount awareness
-- ============================================
CREATE OR REPLACE FUNCTION add_open_item_v2(
    p_order_id uuid,
    p_item_name text,
    p_unit_price numeric,
    p_quantity integer DEFAULT 1,
    p_special_instructions text DEFAULT NULL,
    p_is_tax_exempt boolean DEFAULT FALSE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_location_id uuid;
    v_merchant_id uuid;
    v_tax_rate numeric := 8.0;
    v_item_id uuid;
    
    v_cash_price numeric;
    v_subtotal numeric;
    v_cash_subtotal numeric;
    v_tax_amount numeric;
    v_cash_tax_amount numeric;
    
    v_cash_discount_rate numeric := 0.04;
    v_has_active_discount boolean := false;
BEGIN
    -- 1. Validate & Get Order Context
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
    
    -- 2. Get Tax Rate
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
    
    -- 3. Calculate base pricing (pre-discount)
    v_cash_price := p_unit_price * (1 - v_cash_discount_rate);
    v_subtotal := p_unit_price * p_quantity;
    v_cash_subtotal := v_cash_price * p_quantity;
    v_tax_amount := ROUND(v_subtotal * v_tax_rate / 100, 2);
    v_cash_tax_amount := ROUND(v_cash_subtotal * v_tax_rate / 100, 2);
    
    -- 4. Insert Order Item
    INSERT INTO public.order_items (
        order_id,
        is_open_item,
        open_item_name,
        open_item_price,
        menu_item_id,
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
        special_instructions,
        item_status,
        paid_quantity,
        discount_amount,
        created_at,
        updated_at
    ) VALUES (
        p_order_id,
        TRUE,
        p_item_name,
        p_unit_price,
        NULL,
        p_item_name,
        'Open Items',
        p_quantity,
        p_unit_price,
        v_subtotal,
        v_tax_rate,
        v_tax_amount,
        v_cash_price,
        v_cash_subtotal,
        v_cash_tax_amount,
        p_special_instructions,
        'pending',
        0,
        0,
        now(),
        now()
    )
    RETURNING id INTO v_item_id;
    
    -- 5. Check for active discount and redistribute
    SELECT EXISTS(
        SELECT 1 FROM public.order_discounts
        WHERE order_id = p_order_id
          AND voided_at IS NULL
          AND calculated_amount > 0
    ) INTO v_has_active_discount;
    
    IF v_has_active_discount THEN
        PERFORM redistribute_order_discount(p_order_id);
        
        SELECT subtotal, tax_amount, cash_subtotal, cash_tax_amount
        INTO v_subtotal, v_tax_amount, v_cash_subtotal, v_cash_tax_amount
        FROM public.order_items
        WHERE id = v_item_id;
    END IF;
    
    -- 6. Recalculate Order Totals
    PERFORM calculate_order_totals_fast(p_order_id);
    
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
        'cash_tax_amount', v_cash_tax_amount,
        'discount_applied', v_has_active_discount
    );
END;
$$;

-- ============================================
-- 6. Update calculate_order_totals_fast to ensure correct aggregation
-- Now sums post-discount values from order_items
-- ============================================
CREATE OR REPLACE FUNCTION calculate_order_totals_fast(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
BEGIN
    -- Get original (pre-discount) subtotals and discount amount
    SELECT 
        COALESCE(SUM(quantity * unit_price), 0),
        COALESCE(SUM(quantity * COALESCE(cash_price, unit_price)), 0),
        COALESCE(SUM(discount_amount), 0)
    INTO v_original_card_subtotal, v_original_cash_subtotal, v_discount
    FROM public.order_items
    WHERE order_id = p_order_id AND is_voided = false;
    
    -- Get post-discount values (subtotal and tax_amount are already discounted per item)
    SELECT 
        COALESCE(SUM(subtotal), 0),
        COALESCE(SUM(cash_subtotal), 0),
        COALESCE(SUM(tax_amount), 0),
        COALESCE(SUM(cash_tax_amount), 0)
    INTO v_card_subtotal, v_cash_subtotal, v_card_tax, v_cash_tax
    FROM public.order_items
    WHERE order_id = p_order_id AND is_voided = false;
    
    -- Get service charge and amount paid
    SELECT 
        COALESCE(service_charge, 0),
        COALESCE(amount_paid, 0)
    INTO v_service_charge, v_amount_paid
    FROM public.orders WHERE id = p_order_id;

    -- Calculate amount_due from UNPAID items (items where quantity > paid_quantity)
    -- This is the correct formula for mixed payments (cash + card)
    SELECT 
        COALESCE(SUM(
            ((quantity - COALESCE(paid_quantity, 0)) * unit_price) +
            ROUND(((quantity - COALESCE(paid_quantity, 0)) * unit_price) * COALESCE(tax_rate, 0) / 100, 2)
        ), 0),
        COALESCE(SUM(
            ((quantity - COALESCE(paid_quantity, 0)) * COALESCE(cash_price, unit_price)) +
            ROUND(((quantity - COALESCE(paid_quantity, 0)) * COALESCE(cash_price, unit_price)) * COALESCE(tax_rate, 0) / 100, 2)
        ), 0)
    INTO v_unpaid_card_total, v_unpaid_cash_total
    FROM public.order_items
    WHERE order_id = p_order_id AND is_voided = false AND quantity > COALESCE(paid_quantity, 0);

    -- Update order with totals
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
        
        updated_at = now()
    WHERE id = p_order_id;
    
    RETURN jsonb_build_object(
        'success', true,
        'card_subtotal', v_original_card_subtotal,
        'effective_subtotal', v_card_subtotal,
        'discount_amount', v_discount,
        'card_tax', v_card_tax,
        'card_total', v_card_subtotal + v_card_tax + v_service_charge,
        'cash_total', v_cash_subtotal + v_cash_tax + v_service_charge,
        'amount_due', v_unpaid_card_total,
        'cash_amount_due', v_unpaid_cash_total
    );
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION apply_order_discount_to_item TO authenticated;
GRANT EXECUTE ON FUNCTION redistribute_order_discount TO authenticated;
GRANT EXECUTE ON FUNCTION add_order_item_v2 TO authenticated;
GRANT EXECUTE ON FUNCTION update_order_item_v2 TO authenticated;
GRANT EXECUTE ON FUNCTION add_open_item_v2 TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_order_totals_fast TO authenticated;

