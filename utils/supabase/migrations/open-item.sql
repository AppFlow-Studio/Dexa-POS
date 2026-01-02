-- Migration: 20260101_add_open_item_function.sql

CREATE OR REPLACE FUNCTION add_open_item_v2(
    p_order_id uuid,
    p_item_name text,
    p_unit_price numeric,
    p_quantity integer DEFAULT 1,
    p_special_instructions text DEFAULT NULL,
    p_is_tax_exempt boolean DEFAULT FALSE  -- Optional: allow tax-exempt open items
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
    
    v_cash_discount_rate numeric := 0.04;
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
    -- Your existing function works perfectly!
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
$$;


-- Migration: 20260101_update_open_item_function.sql

CREATE OR REPLACE FUNCTION update_order_item_v2(
    p_order_item_id uuid,
    p_quantity integer DEFAULT NULL,
    p_unit_price numeric DEFAULT NULL,  -- For open items only
    p_special_instructions text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
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
    
    v_cash_discount_rate numeric := 0.04;
BEGIN
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
        updated_at = now()
    WHERE id = p_order_item_id;
    
    -- Recalculate order totals
    PERFORM calculate_order_totals_fast(v_order_id);
    
    RETURN jsonb_build_object(
        'success', true,
        'order_item_id', p_order_item_id,
        'quantity', v_new_quantity,
        'unit_price', v_new_price,
        'subtotal', v_subtotal
    );
END;
$$;