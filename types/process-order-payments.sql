-- ============================================
-- MASTER PAYMENT FUNCTION
-- Handles: Full payment, Split by amount, Split by items
-- Supports: Dual pricing, Tips, Audit logging
-- ============================================

CREATE OR REPLACE FUNCTION process_order_payment(
    p_order_id uuid,
    p_payment_method text,                    -- 'cash' | 'card' | 'gift_card'
    p_amount numeric,                         -- Amount to apply (before tip)
    p_tip_amount numeric DEFAULT 0,
    p_amount_tendered numeric DEFAULT NULL,   -- Cash: what customer handed over
    p_terminal_type text DEFAULT 'dejavoo',
    p_terminal_id text DEFAULT NULL,
    p_device_id text DEFAULT NULL,
    p_transaction_details jsonb DEFAULT NULL,
    p_item_allocations jsonb DEFAULT NULL,    -- For per-item splits: [{"order_item_id": "uuid", "quantity": 1, "amount": 10.00}]
    p_reason text DEFAULT NULL                -- For comps/adjustments
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id text;
    v_staff_id uuid;
    v_order record;
    v_payment_id uuid;
    v_is_cash boolean;
    v_is_full_payment boolean;
    v_has_item_allocations boolean;
    
    -- Calculated amounts
    v_payment_total numeric;
    v_subtotal_portion numeric;
    v_tax_portion numeric;
    v_change_given numeric := 0;
    v_actual_tendered numeric;
    v_original_card_amount numeric;
    
    -- Order state after payment
    v_new_amount_paid numeric;
    v_remaining_due numeric;
    v_new_payment_status text;
    
    v_result jsonb;
BEGIN
    -- ============================================
    -- 1. AUTHENTICATION & AUTHORIZATION
    -- ============================================
    v_user_id := get_my_claim('sub');
    
    SELECT id INTO v_staff_id
    FROM public.staff_profiles
    WHERE user_id = v_user_id
    LIMIT 1;
    
    -- ============================================
    -- 2. GET ORDER WITH ACCESS CHECK
    -- ============================================
    SELECT *
    INTO v_order
    FROM public.orders
    WHERE id = p_order_id
      AND merchant_id = user_merchant_id()
      AND location_id = ANY(user_location_ids());
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found or access denied';
    END IF;
    
    -- ============================================
    -- 3. VALIDATION
    -- ============================================
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Payment amount must be positive';
    END IF;
    
    IF v_order.payment_status = 'paid' THEN
        RAISE EXCEPTION 'Order is already fully paid';
    END IF;
    
    -- Determine payment characteristics
    v_is_cash := p_payment_method = 'cash';
    v_has_item_allocations := p_item_allocations IS NOT NULL AND jsonb_array_length(p_item_allocations) > 0;
    
    -- ============================================
    -- 4. CALCULATE AMOUNTS BASED ON PAYMENT TYPE
    -- ============================================
    
    IF v_is_cash THEN
        -- CASH PAYMENT: Use cash pricing
        
        -- Check if this is full payment (paying remaining balance)
        v_is_full_payment := p_amount >= v_order.amount_due 
                            OR p_amount >= v_order.cash_total - COALESCE(v_order.amount_paid, 0);
        
        IF v_is_full_payment AND NOT v_has_item_allocations THEN
            -- Full cash payment - use cash total
            v_payment_total := v_order.cash_total - COALESCE(v_order.amount_paid, 0);
            v_subtotal_portion := v_order.cash_subtotal * (v_payment_total / NULLIF(v_order.cash_total, 0));
            v_tax_portion := v_payment_total - v_subtotal_portion;
            v_original_card_amount := v_order.card_total - COALESCE(v_order.amount_paid, 0);
        ELSE
            -- Partial cash payment - prorate using cash pricing ratios
            v_payment_total := LEAST(p_amount, v_order.amount_due);
            IF v_order.cash_total > 0 THEN
                v_subtotal_portion := ROUND(v_payment_total * (v_order.cash_subtotal / v_order.cash_total), 2);
                v_tax_portion := v_payment_total - v_subtotal_portion;
            ELSE
                v_subtotal_portion := v_payment_total;
                v_tax_portion := 0;
            END IF;
            -- Calculate what this would have been at card price
            v_original_card_amount := ROUND(v_payment_total * (v_order.card_total / NULLIF(v_order.cash_total, 0)), 2);
        END IF;
        
        -- Calculate change
        v_actual_tendered := COALESCE(p_amount_tendered, p_amount + p_tip_amount);
        v_change_given := GREATEST(v_actual_tendered - (v_payment_total + p_tip_amount), 0);
        
    ELSE
        -- CARD PAYMENT: Use card pricing
        v_payment_total := p_amount;
        v_actual_tendered := p_amount + p_tip_amount;
        v_change_given := 0;
        v_original_card_amount := p_amount;
        
        IF v_order.card_total > 0 THEN
            v_subtotal_portion := ROUND(v_payment_total * (v_order.card_subtotal / v_order.card_total), 2);
            v_tax_portion := v_payment_total - v_subtotal_portion;
        ELSE
            v_subtotal_portion := v_payment_total;
            v_tax_portion := 0;
        END IF;
    END IF;
    
    -- ============================================
    -- 5. CREATE PAYMENT RECORD
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
        status,
        terminal_type,
        processed_by_staff_id,
        processor_response,
        transaction_id,
        authorization_code,
        card_type,
        card_last_four,
        captured_at,
        metadata
    ) VALUES (
        p_order_id,
        p_payment_method::payment_method,
        v_payment_total,
        p_tip_amount,
        v_payment_total + p_tip_amount,
        v_subtotal_portion,
        v_tax_portion,
        v_actual_tendered,
        v_change_given,
        v_is_cash,
        v_is_cash AND v_original_card_amount > v_payment_total,
        v_original_card_amount,
        'captured',
        p_terminal_type::terminal_type,
        v_staff_id,
        p_transaction_details,
        p_transaction_details->>'transaction_id',
        p_transaction_details->>'authorization_code',
        p_transaction_details->>'card_type',
        p_transaction_details->>'card_last_four',
        now(),
        jsonb_build_object(
            'device_id', p_device_id,
            'terminal_id', p_terminal_id,
            'reason', p_reason
        )
    )
    RETURNING id INTO v_payment_id;
    
    -- ============================================
    -- 6. HANDLE PER-ITEM ALLOCATIONS (if provided)
    -- ============================================
    IF v_has_item_allocations THEN
        INSERT INTO public.order_payment_items (
            order_payment_id,
            order_item_id,
            quantity_paid,
            unit_price_paid,
            subtotal_paid
        )
        SELECT 
            v_payment_id,
            (item->>'order_item_id')::uuid,
            COALESCE((item->>'quantity')::integer, 1),
            COALESCE((item->>'unit_price')::numeric, (item->>'amount')::numeric),
            (item->>'amount')::numeric
        FROM jsonb_array_elements(p_item_allocations) AS item;
    END IF;
    
    -- ============================================
    -- 7. UPDATE ORDER STATE
    -- ============================================
    v_new_amount_paid := COALESCE(v_order.amount_paid, 0) + v_payment_total + p_tip_amount;
    v_remaining_due := GREATEST(v_order.total_amount - v_new_amount_paid, 0);
    
    -- For cash full payment, recalculate based on cash total
    IF v_is_cash AND v_is_full_payment AND NOT v_has_item_allocations THEN
        v_remaining_due := 0;
    END IF;
    
    v_new_payment_status := CASE
        WHEN v_remaining_due <= 0 THEN 'paid'
        WHEN v_new_amount_paid > 0 THEN 'partial'
        ELSE 'pending'
    END;
    
    UPDATE public.orders SET
        amount_paid = v_new_amount_paid,
        amount_due = v_remaining_due,
        tip_amount = COALESCE(tip_amount, 0) + p_tip_amount,
        payment_status = v_new_payment_status::payment_status,
        
        -- Update effective totals from all payments
        effective_subtotal = (
            SELECT COALESCE(SUM(subtotal_portion), 0)
            FROM public.order_payments
            WHERE order_id = p_order_id AND status = 'captured' AND is_voided = false
        ),
        effective_tax_amount = (
            SELECT COALESCE(SUM(tax_portion), 0)
            FROM public.order_payments
            WHERE order_id = p_order_id AND status = 'captured' AND is_voided = false
        ),
        effective_total = (
            SELECT COALESCE(SUM(total_amount), 0)
            FROM public.order_payments
            WHERE order_id = p_order_id AND status = 'captured' AND is_voided = false
        ),
        
        -- Track if any cash discount was applied
        cash_discount_applied = EXISTS(
            SELECT 1 FROM public.order_payments
            WHERE order_id = p_order_id 
              AND is_cash_priced = true 
              AND is_voided = false
        ),
        cash_discount_amount = (
            SELECT COALESCE(SUM(original_amount - amount), 0)
            FROM public.order_payments
            WHERE order_id = p_order_id 
              AND is_cash_priced = true 
              AND is_voided = false
        ),
        
        -- Update order status if fully paid
        status = CASE
            WHEN v_remaining_due <= 0 AND status = 'ready' THEN 'completed'::order_status
            ELSE status
        END,
        
        completed_at = CASE
            WHEN v_remaining_due <= 0 AND completed_at IS NULL THEN now()
            ELSE completed_at
        END,
        
        updated_at = now()
    WHERE id = p_order_id;
    
    -- ============================================
    -- 8. AUDIT LOG
    -- ============================================
    INSERT INTO public.audit_logs (
        actor_user_id,
        action,
        action_category,
        resource_type,
        resource_name,
        metadata,
        status
    ) VALUES (
        v_user_id,
        'payment_processed',
        'order_management',
        'payment',
        v_payment_id::text,
        jsonb_build_object(
            'order_id', p_order_id,
            'payment_method', p_payment_method,
            'amount', v_payment_total,
            'tip_amount', p_tip_amount,
            'amount_tendered', v_actual_tendered,
            'change_given', v_change_given,
            'is_cash_priced', v_is_cash,
            'original_card_amount', v_original_card_amount,
            'cash_savings', CASE WHEN v_is_cash THEN v_original_card_amount - v_payment_total ELSE 0 END,
            'has_item_allocations', v_has_item_allocations
        ),
        'success'
    );
    
    -- ============================================
    -- 9. RETURN RESULT
    -- ============================================
    v_result := jsonb_build_object(
        'success', true,
        'payment_id', v_payment_id,
        'order_id', p_order_id,
        'payment_method', p_payment_method,
        'amount_applied', v_payment_total,
        'tip_amount', p_tip_amount,
        'total_charged', v_payment_total + p_tip_amount,
        'amount_tendered', v_actual_tendered,
        'change_given', v_change_given,
        'is_cash_priced', v_is_cash,
        'original_card_amount', v_original_card_amount,
        'cash_savings', CASE WHEN v_is_cash THEN v_original_card_amount - v_payment_total ELSE 0 END,
        'order_amount_paid', v_new_amount_paid,
        'order_amount_due', v_remaining_due,
        'order_fully_paid', v_remaining_due <= 0,
        'order_payment_status', v_new_payment_status
    );
    
    RETURN v_result;
END;
$$;