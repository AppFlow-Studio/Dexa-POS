-- ============================================
-- UNIFIED PAYMENT FUNCTION
-- Handles: Full card, Full cash, Split, Per-item
-- ============================================
 
CREATE OR REPLACE FUNCTION process_payment_v2(
    p_order_id uuid,
    p_payment_method text,                    -- 'cash' | 'card'
    p_amount numeric,                         -- Amount to charge (before tip)
    p_tip_amount numeric DEFAULT 0,
    p_amount_tendered numeric DEFAULT NULL,   -- Cash only: what customer gave
    p_item_ids uuid[] DEFAULT NULL,           -- Per-item payment: which items
    p_terminal_response jsonb DEFAULT NULL,
    p_terminal_id text DEFAULT NULL,
    p_device_id text DEFAULT NULL,
    p_staff_id uuid DEFAULT NULL,
    p_transaction_details jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$

DECLARE
    v_order record;
    v_payment_id uuid;
    v_is_cash boolean;
    v_is_item_payment boolean;
    v_payment_total numeric;
    v_subtotal_portion numeric := 0;
    v_tax_portion numeric := 0;
    v_change_given numeric := 0;
    v_new_amount_paid numeric;
    v_new_amount_due numeric;
    v_effective_total numeric;
    v_current_pricing_mode text;
    v_new_pricing_mode text;
    v_items_subtotal numeric := 0;
    v_items_tax numeric := 0;
    v_covered_items uuid[] := '{}';
BEGIN
    v_is_cash := p_payment_method = 'cash';
    v_is_item_payment := p_item_ids IS NOT NULL AND array_length(p_item_ids, 1) > 0;
    
    -- ============================================
    -- 1. Get Order with Validation
    -- ============================================
    SELECT * INTO v_order 
    FROM public.orders 
    WHERE id = p_order_id
      AND merchant_id = user_merchant_id()
      AND location_id = ANY(user_location_ids());
      
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found or access denied';
    END IF;
    
    IF v_order.payment_status = 'paid' THEN
        RAISE EXCEPTION 'Order is already fully paid';
    END IF;
    
    v_current_pricing_mode := v_order.payment_pricing_mode::text;
    
    -- ==================================f==========
    -- 2. Determine Pricing Mode
    -- ============================================
    IF v_current_pricing_mode IS NULL THEN
        -- First payment sets the mode
        v_new_pricing_mode := CASE WHEN v_is_cash THEN 'cash' ELSE 'card' END;
    ELSIF v_current_pricing_mode = 'card' AND v_is_cash THEN
        -- Was card, now adding cash = mixed
        v_new_pricing_mode := 'mixed';
    ELSIF v_current_pricing_mode = 'cash' AND NOT v_is_cash THEN
        -- Was cash, now adding card = mixed
        v_new_pricing_mode := 'mixed';
    ELSE
        -- Same type, keep mode
        v_new_pricing_mode := v_current_pricing_mode;
    END IF;
    
    -- ============================================
    -- 3. Calculate Payment Amount Based on Scenario
    -- ============================================
    IF v_is_item_payment THEN
        -- ========== PER-ITEM PAYMENT ==========
        SELECT 
            COALESCE(SUM(CASE WHEN v_is_cash THEN cash_subtotal ELSE subtotal END), 0),
            COALESCE(SUM(CASE WHEN v_is_cash THEN cash_tax_amount ELSE tax_amount END), 0),
            array_agg(id)
        INTO v_items_subtotal, v_items_tax, v_covered_items
        FROM public.order_items
        WHERE id = ANY(p_item_ids)
          AND order_id = p_order_id
          AND is_voided = false
          AND paid_quantity < quantity;
        
        v_payment_total := v_items_subtotal + v_items_tax;
        v_subtotal_portion := v_items_subtotal;
        v_tax_portion := v_items_tax;
        
        -- Mark items as paid
        UPDATE public.order_items
        SET 
            paid_quantity = quantity,
            price_paid = CASE WHEN v_is_cash THEN cash_price ELSE unit_price END
        WHERE id = ANY(p_item_ids)
          AND order_id = p_order_id;
          
    ELSE
        -- ========== FULL/PARTIAL PAYMENT ==========
        -- Determine effective total based on pricing mode
        IF v_is_cash THEN
            v_effective_total := v_order.cash_total;
        ELSE
            v_effective_total := v_order.card_total;
        END IF;
        
        -- Calculate remaining due in the appropriate pricing
        IF v_new_pricing_mode = 'mixed' THEN
            -- Mixed: Just use the amount provided
            v_payment_total := LEAST(p_amount, v_order.amount_due);
        ELSIF v_is_cash THEN
            -- Cash: Remaining at cash price
            v_payment_total := LEAST(p_amount, GREATEST(v_effective_total - COALESCE(v_order.amount_paid, 0), 0));
        ELSE
            -- Card: Remaining at card price
            v_payment_total := LEAST(p_amount, v_order.amount_due);
        END IF;
        
        -- Pro-rate subtotal/tax
        IF v_effective_total > 0 THEN
            IF v_is_cash THEN
                v_subtotal_portion := ROUND(v_payment_total * (v_order.cash_subtotal / v_order.cash_total), 2);
            ELSE
                v_subtotal_portion := ROUND(v_payment_total * (v_order.card_subtotal / v_order.card_total), 2);
            END IF;
            v_tax_portion := v_payment_total - v_subtotal_portion;
        END IF;
    END IF;
    
    -- ============================================
    -- 4. Calculate Change (Cash Only)
    -- ============================================
    IF v_is_cash THEN
        v_change_given := GREATEST(
            COALESCE(p_amount_tendered, v_payment_total) - (v_payment_total + p_tip_amount), 
            0
        );
    END IF;
    
    -- ============================================
    -- 5. Create Payment Record
    -- ============================================
    INSERT INTO public.order_payments (
        order_id,
        payment_method,
        amount,
        tip_amount,
        total_amount,
        subtotal_portion,
        tax_portion,
        amount_tendered,
        change_given,
        is_cash_priced,
        cash_discount_applied,
        original_amount,
        covers_items,
        status,
        terminal_type,
        processed_by_staff_id,
        processor_response,
        transaction_id,
        authorization_code,
        card_type,
        card_last_four,
        captured_at,
        initiated_at
    ) VALUES (
        p_order_id,
        p_payment_method::payment_method,
        v_payment_total,
        COALESCE(p_tip_amount, 0),
        v_payment_total + COALESCE(p_tip_amount, 0),
        v_subtotal_portion,
        v_tax_portion,
        CASE WHEN v_is_cash THEN COALESCE(p_amount_tendered, v_payment_total) END,
        v_change_given,
        v_is_cash,
        v_is_cash,
        -- Original amount shows what it would have been at card price
        CASE WHEN v_is_cash 
            THEN ROUND(v_payment_total * v_order.card_total / NULLIF(v_order.cash_total, 0), 2)
            ELSE v_payment_total 
        END,
        v_covered_items,
        'captured',
        CASE WHEN v_is_cash THEN 'cash_drawer' ELSE 'dejavoo' END::terminal_type,
        p_staff_id,
        p_terminal_response,
        p_terminal_response->>'transaction_id',
        p_terminal_response->>'authorization_code',
        p_terminal_response->>'card_type',
        p_terminal_response->>'card_last_four',
        now(),
        now()
    )
    RETURNING id INTO v_payment_id;
    
      -- ============================================
    -- 6. Per-Item Payment: Create order_payment_items & Update Items
    -- ============================================
    IF v_is_item_payment THEN
        -- Insert into order_payment_items for each item
        INSERT INTO public.order_payment_items (
            order_payment_id,
            order_item_id,
            quantity_paid,
            unit_price_paid,
            subtotal_paid,
            tax_paid
        )
        SELECT
            v_payment_id,
            oi.id,
            oi.quantity - COALESCE(oi.paid_quantity, 0),  -- Unpaid quantity
            CASE WHEN v_is_cash THEN oi.cash_price ELSE oi.unit_price END,
            CASE WHEN v_is_cash 
                THEN (oi.quantity - COALESCE(oi.paid_quantity, 0)) * oi.cash_price
                ELSE (oi.quantity - COALESCE(oi.paid_quantity, 0)) * oi.unit_price
            END,
            CASE WHEN v_is_cash 
                THEN ROUND((oi.quantity - COALESCE(oi.paid_quantity, 0)) * oi.cash_price * oi.tax_rate / 100, 2)
                ELSE ROUND((oi.quantity - COALESCE(oi.paid_quantity, 0)) * oi.unit_price * oi.tax_rate / 100, 2)
            END
        FROM public.order_items oi
        WHERE oi.id = ANY(p_item_ids)
          AND oi.order_id = p_order_id
          AND oi.is_voided = false
          AND oi.quantity > COALESCE(oi.paid_quantity, 0);
        
        -- Update items: mark as paid
        UPDATE public.order_items
        SET 
            paid_quantity = quantity,  -- Fully paid
            price_paid = CASE WHEN v_is_cash THEN cash_price ELSE unit_price END,
            updated_at = now()
        WHERE id = ANY(p_item_ids)
          AND order_id = p_order_id
          AND is_voided = false;
    END IF;

    -- ============================================
    -- 7. Update Order Payment State
    -- ============================================
    v_new_amount_paid := COALESCE(v_order.amount_paid, 0) + v_payment_total + COALESCE(p_tip_amount, 0);
    
    -- Calculate new amount_due based on pricing mode
    IF v_new_pricing_mode = 'cash' THEN
        v_new_amount_due := GREATEST(v_order.cash_total - v_new_amount_paid, 0);
    ELSIF v_new_pricing_mode = 'card' THEN
        v_new_amount_due := GREATEST(v_order.card_total - v_new_amount_paid, 0);
    ELSE
        -- Mixed: Use remaining from current amount_due
        v_new_amount_due := GREATEST(v_order.amount_due - v_payment_total - COALESCE(p_tip_amount, 0), 0);
    END IF;
    
    UPDATE public.orders SET
        amount_paid = v_new_amount_paid,
        amount_due = v_new_amount_due,
        tip_amount = COALESCE(tip_amount, 0) + COALESCE(p_tip_amount, 0),
        payment_pricing_mode = v_new_pricing_mode::pricing_mode,
        cash_discount_applied = COALESCE(cash_discount_applied, false) OR v_is_cash,
        payment_status = CASE
            WHEN v_new_amount_due <= 0.01 THEN 'paid'::payment_status  -- 0.01 tolerance for rounding
            WHEN v_new_amount_paid > 0 THEN 'partial'::payment_status
            ELSE 'pending'::payment_status
        END,
        -- status = CASE
        --     WHEN v_new_amount_due <= 0.01 THEN 'completed'::order_status
        --     ELSE status
        -- END,
        -- completed_at = CASE
        --     WHEN v_new_amount_due <= 0.01 AND completed_at IS NULL THEN now()
        --     ELSE completed_at
        -- END,
        updated_at = now()
    WHERE id = p_order_id;
    
    -- ============================================
    -- 8. Return Result
    -- ============================================
    RETURN jsonb_build_object(
        'success', true,
        'payment_id', v_payment_id,
        'payment_method', p_payment_method,
        'amount_charged', v_payment_total,
        'tip_amount', COALESCE(p_tip_amount, 0),
        'total_collected', v_payment_total + COALESCE(p_tip_amount, 0),
        'change_given', v_change_given,
        'is_cash_priced', v_is_cash,
        'pricing_mode', v_new_pricing_mode,
        'items_covered', v_covered_items,
        'order_amount_paid', v_new_amount_paid,
        'order_amount_due', v_new_amount_due,
        'order_fully_paid', v_new_amount_due <= 0.01
    );
END;
$$;