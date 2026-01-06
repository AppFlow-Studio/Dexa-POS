CREATE OR REPLACE FUNCTION recalculate_order_totals(
    p_order_id uuid,
)
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
    -- Start with all unpaid, non-voided items
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
        updated_at = now()
    WHERE id = p_order_id;
    
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
