-- Fixed version: Split into two queries to avoid CTE scope issues
DECLARE
    v_location_id uuid;
    v_merchant_id uuid;
    v_card_subtotal numeric := 0;
    v_cash_subtotal numeric := 0;
    v_card_tax numeric := 0;
    v_cash_tax numeric := 0;
    v_item_discount_total numeric := 0;
    v_order_discount_total numeric := 0;
    v_service_charge numeric := 0;
    v_tax_breakdown jsonb := '[]'::jsonb;
BEGIN
    -- Get order context
    SELECT location_id, merchant_id, COALESCE(service_charge, 0)
    INTO v_location_id, v_merchant_id, v_service_charge
    FROM public.orders 
    WHERE id = p_order_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found: %', p_order_id;
    END IF;

    -- ============================================
    -- Calculate subtotals and taxes per item
    -- ============================================
    WITH item_calculations AS (
        SELECT 
            oi.id AS order_item_id,
            
            -- Determine effective prices
            -- Card price: unit_price (after any item discount)
            (oi.unit_price * oi.quantity) - COALESCE(oi.discount_amount, 0) AS card_item_subtotal,
            
            -- Cash price: use cash_price if available, else unit_price
            (COALESCE(oi.cash_price, oi.unit_price) * oi.quantity) - COALESCE(oi.discount_amount, 0) AS cash_item_subtotal,
            
            -- Determine tax category (Location Override -> Menu Item -> Default)
            COALESCE(
                lio.tax_category,
                mi.tax_category,
                'standard'
            ) AS effective_tax_category,
            
            -- Check tax exemption (Location Override -> Menu Item)
            COALESCE(
                lio.is_tax_exempt,
                mi.is_tax_exempt,
                false
            ) AS is_exempt,
            
            -- Item discount for tracking
            COALESCE(oi.discount_amount, 0) AS item_discount
            
        FROM public.order_items oi
        LEFT JOIN public.menu_items mi ON mi.id = oi.menu_item_id
        LEFT JOIN public.location_item_overrides lio 
            ON lio.menu_item_id = oi.menu_item_id 
            AND lio.location_id = v_location_id
        WHERE oi.order_id = p_order_id 
          AND oi.is_voided = false
    ),
    
    -- Join with tax rates to get applicable percentages
    items_with_tax AS (
        SELECT 
            ic.*,
            -- Get tax rate (0 if exempt or no rate found)
            CASE 
                WHEN ic.is_exempt THEN 0
                ELSE COALESCE(tr.percentage, 0)
            END AS tax_percentage,
            tr.name AS tax_name
        FROM item_calculations ic
        LEFT JOIN public.tax_rates tr 
            ON tr.location_id = v_location_id
            AND tr.tax_category = ic.effective_tax_category
            AND tr.is_active = true
    ),
    
    -- Calculate taxes per item
    items_taxed AS (
        SELECT 
            *,
            ROUND(card_item_subtotal * (tax_percentage / 100), 2) AS card_item_tax,
            ROUND(cash_item_subtotal * (tax_percentage / 100), 2) AS cash_item_tax
        FROM items_with_tax
    )
    
    -- Get totals from items_taxed
    SELECT 
        COALESCE(SUM(card_item_subtotal), 0),
        COALESCE(SUM(cash_item_subtotal), 0),
        COALESCE(SUM(card_item_tax), 0),
        COALESCE(SUM(cash_item_tax), 0),
        COALESCE(SUM(item_discount), 0)
    INTO v_card_subtotal, v_cash_subtotal, v_card_tax, v_cash_tax, v_item_discount_total
    FROM items_taxed;
    
    -- ============================================
    -- Calculate tax breakdown separately
    -- ============================================
    WITH item_calculations AS (
        SELECT 
            oi.id AS order_item_id,
            (oi.unit_price * oi.quantity) - COALESCE(oi.discount_amount, 0) AS card_item_subtotal,
            (COALESCE(oi.cash_price, oi.unit_price) * oi.quantity) - COALESCE(oi.discount_amount, 0) AS cash_item_subtotal,
            COALESCE(lio.tax_category, mi.tax_category, 'standard') AS effective_tax_category,
            COALESCE(lio.is_tax_exempt, mi.is_tax_exempt, false) AS is_exempt
        FROM public.order_items oi
        LEFT JOIN public.menu_items mi ON mi.id = oi.menu_item_id
        LEFT JOIN public.location_item_overrides lio 
            ON lio.menu_item_id = oi.menu_item_id 
            AND lio.location_id = v_location_id
        WHERE oi.order_id = p_order_id 
          AND oi.is_voided = false
    ),
    items_with_tax AS (
        SELECT 
            ic.*,
            CASE 
                WHEN ic.is_exempt THEN 0
                ELSE COALESCE(tr.percentage, 0)
            END AS tax_percentage,
            tr.name AS tax_name
        FROM item_calculations ic
        LEFT JOIN public.tax_rates tr 
            ON tr.location_id = v_location_id
            AND tr.tax_category = ic.effective_tax_category
            AND tr.is_active = true
    ),
    items_taxed AS (
        SELECT 
            *,
            ROUND(card_item_subtotal * (tax_percentage / 100), 2) AS card_item_tax,
            ROUND(cash_item_subtotal * (tax_percentage / 100), 2) AS cash_item_tax
        FROM items_with_tax
    ),
    tax_by_category AS (
        SELECT 
            effective_tax_category,
            tax_percentage,
            tax_name,
            SUM(card_item_subtotal) AS category_card_subtotal,
            SUM(card_item_tax) AS category_card_tax,
            SUM(cash_item_subtotal) AS category_cash_subtotal,
            SUM(cash_item_tax) AS category_cash_tax
        FROM items_taxed
        WHERE tax_percentage > 0
        GROUP BY effective_tax_category, tax_percentage, tax_name
    )
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'category', effective_tax_category,
            'name', COALESCE(tax_name, effective_tax_category::text),
            'rate', tax_percentage,
            'card_taxable', category_card_subtotal,
            'card_tax', category_card_tax,
            'cash_taxable', category_cash_subtotal,
            'cash_tax', category_cash_tax
        )
    ), '[]'::jsonb)
    INTO v_tax_breakdown
    FROM tax_by_category;

    -- ============================================
    -- Get order-level discounts
    -- ============================================
    SELECT COALESCE(SUM(calculated_amount), 0)
    INTO v_order_discount_total
    FROM public.order_discounts
    WHERE order_id = p_order_id AND voided_at IS NULL;
    
    -- Apply order-level discounts (proportionally reduce subtotals)
    -- Note: Order discounts are applied PRE-TAX
    IF v_order_discount_total > 0 AND v_card_subtotal > 0 THEN
        DECLARE
            v_card_discount_ratio numeric;
            v_cash_discount_ratio numeric;
        BEGIN
            -- Calculate discount as ratio of original subtotal
            v_card_discount_ratio := v_order_discount_total / v_card_subtotal;
            v_cash_discount_ratio := v_order_discount_total / v_cash_subtotal;
            
            -- Adjust subtotals
            v_card_subtotal := GREATEST(v_card_subtotal - v_order_discount_total, 0);
            v_cash_subtotal := GREATEST(v_cash_subtotal - v_order_discount_total, 0);
            
            -- Recalculate taxes on discounted amounts
            v_card_tax := ROUND(v_card_tax * (1 - v_card_discount_ratio), 2);
            v_cash_tax := ROUND(v_cash_tax * (1 - v_cash_discount_ratio), 2);
        END;
    END IF;

    -- ============================================
    -- Update order with all calculated values
    -- ============================================
    UPDATE public.orders SET
        -- Dual pricing columns
        card_subtotal = v_card_subtotal,
        card_tax_amount = v_card_tax,
        card_total = v_card_subtotal + v_card_tax + v_service_charge,
        cash_subtotal = v_cash_subtotal,
        cash_tax_amount = v_cash_tax,
        cash_total = v_cash_subtotal + v_cash_tax + v_service_charge,
        
        -- Display columns (default to card pricing until payment)
        subtotal = v_card_subtotal,
        tax_amount = v_card_tax,
        total_amount = v_card_subtotal + v_card_tax + v_service_charge,
        
        -- Discount tracking
        discount_amount = v_item_discount_total + v_order_discount_total,
        
        -- Amount due (accounting for any payments already made)
        amount_due = (v_card_subtotal + v_card_tax + v_service_charge) - COALESCE(amount_paid, 0),
        
        -- Tax breakdown for receipts
        tax_breakdown = v_tax_breakdown,
        
        updated_at = now()
    WHERE id = p_order_id;
    
    -- Return comprehensive result
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
            'order_level', v_order_discount_total,
            'total', v_item_discount_total + v_order_discount_total
        ),
        'tax_breakdown', v_tax_breakdown,
        'savings', (v_card_subtotal + v_card_tax) - (v_cash_subtotal + v_cash_tax)
    );
END;

