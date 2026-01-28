CREATE OR REPLACE FUNCTION redistribute_order_discounts(p_order_id UUID)
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
