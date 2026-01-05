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
    p_transaction_details jsonb DEFAULT NULL,
    p_split_count integer DEFAULT NULL,
    p_split_portion_index integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
 v_is_cash := p_payment_method = 'cash';
    v_is_item_payment := p_item_ids IS NOT NULL AND array_length(p_item_ids, 1) > 0;
    v_is_split_payment := p_split_count IS NOT NULL AND p_split_count > 1;
    
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
    
    -- ============================================
    -- 2. Calculate CURRENT Unpaid Totals from Items
    --    (BEFORE this payment - used for validation)
    -- ============================================
    SELECT 
        COUNT(*),
        -- COALESCE(SUM(
        --     (oi.quantity - COALESCE(oi.paid_quantity, 0)) * oi.unit_price +
        --     ROUND((oi.quantity - COALESCE(oi.paid_quantity, 0)) * oi.unit_price * COALESCE(oi.tax_rate, 0) / 100, 2)
        -- ), 0),
        -- COALESCE(SUM(
        --     (oi.quantity - COALESCE(oi.paid_quantity, 0)) * oi.cash_price +
        --     ROUND((oi.quantity - COALESCE(oi.paid_quantity, 0)) * oi.cash_price * COALESCE(oi.tax_rate, 0) / 100, 2)
        -- ), 0)
        COALESCE(SUM(
            -- Card Total: (Qty * Price) - Discount + Tax on discounted amount
            ((oi.quantity - COALESCE(oi.paid_quantity, 0)) * oi.unit_price) 
            - COALESCE(oi.discount_amount, 0) -- REPLACE 'discount_amount' WITH YOUR ACTUAL COLUMN
            + ROUND(
                (((oi.quantity - COALESCE(oi.paid_quantity, 0)) * oi.unit_price) - COALESCE(oi.discount_amount, 0)) 
                * COALESCE(oi.tax_rate, 0) / 100, 2
            )
        ), 0),
        COALESCE(SUM(
            -- Cash Total
            ((oi.quantity - COALESCE(oi.paid_quantity, 0)) * oi.cash_price) 
            - COALESCE(oi.discount_amount, 0) -- Assessing discount is same for cash
            + ROUND(
                (((oi.quantity - COALESCE(oi.paid_quantity, 0)) * oi.cash_price) - COALESCE(oi.discount_amount, 0)) 
                * COALESCE(oi.tax_rate, 0) / 100, 2
            )
        ), 0)
    INTO v_unpaid_items_count, v_pre_unpaid_card_total, v_pre_unpaid_cash_total
    FROM public.order_items oi
    WHERE oi.order_id = p_order_id
      AND oi.is_voided = false
      AND oi.quantity > COALESCE(oi.paid_quantity, 0);
    
    -- If nothing to pay, return early
    IF v_unpaid_items_count = 0 THEN
        RAISE EXCEPTION 'No unpaid items remaining on this order';
    END IF;
    
    -- ============================================
    -- 3. Get Existing Payment Totals by Type
    -- ============================================
    SELECT 
        COALESCE(SUM(CASE WHEN is_cash_priced THEN total_amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN NOT is_cash_priced THEN total_amount ELSE 0 END), 0)
    INTO v_total_cash_paid, v_total_card_paid
    FROM public.order_payments
    WHERE order_id = p_order_id 
      AND status = 'captured';
    
    -- ============================================
    -- 4. Split Payment Validation
    -- ============================================
    IF v_is_split_payment THEN
        IF p_split_portion_index IS NULL THEN
            RAISE EXCEPTION 'Split portion index is required for split payments';
        END IF;
        
        IF p_split_portion_index < 1 OR p_split_portion_index > p_split_count THEN
            RAISE EXCEPTION 'Invalid split portion index: % (must be 1-%)', p_split_portion_index, p_split_count;
        END IF;
        
        IF EXISTS (
            SELECT 1 FROM public.order_payments
            WHERE order_id = p_order_id
              AND split_portion_index = p_split_portion_index
              AND status = 'captured'
        ) THEN
            RAISE EXCEPTION 'Split portion % has already been paid', p_split_portion_index;
        END IF;
        
        SELECT 
            COUNT(*),
            COALESCE(array_agg(split_portion_index ORDER BY split_portion_index), ARRAY[]::integer[])
        INTO v_portions_paid, v_paid_portion_indexes
        FROM public.order_payments
        WHERE order_id = p_order_id
          AND split_portion_index IS NOT NULL
          AND status = 'captured';
        
        v_portions_remaining := p_split_count - v_portions_paid - 1;
        v_is_last_portion := (v_portions_remaining = 0);
    END IF;
    
    -- ============================================
    -- 5. Determine Pricing Mode (for tracking only)
    -- ============================================
    IF v_current_pricing_mode IS NULL THEN
        v_new_pricing_mode := CASE WHEN v_is_cash THEN 'cash' ELSE 'card' END;
    ELSIF v_current_pricing_mode = 'card' AND v_is_cash THEN
        v_new_pricing_mode := 'mixed';
    ELSIF v_current_pricing_mode = 'cash' AND NOT v_is_cash THEN
        v_new_pricing_mode := 'mixed';
    ELSE
        v_new_pricing_mode := v_current_pricing_mode;
    END IF;
    
    -- ============================================
    -- 6. Calculate Payment Amount Based on Scenario
    -- ============================================
    IF v_is_item_payment THEN
        -- ========================================
        -- PER-ITEM PAYMENT
        -- Pay for specific selected items
        -- ========================================
        -- DECLARE
        --     v_items_subtotal numeric := 0;
        --     v_items_tax numeric := 0;
        -- BEGIN
        --     SELECT 
        --         COALESCE(SUM(
        --             CASE WHEN v_is_cash 
        --                 THEN (oi.quantity - COALESCE(oi.paid_quantity, 0)) * oi.cash_price
        --                 ELSE (oi.quantity - COALESCE(oi.paid_quantity, 0)) * oi.unit_price
        --             END
        --         ), 0),
        --         COALESCE(SUM(
        --             CASE WHEN v_is_cash 
        --                 THEN ROUND((oi.quantity - COALESCE(oi.paid_quantity, 0)) * oi.cash_price * COALESCE(oi.tax_rate, 0) / 100, 2)
        --                 ELSE ROUND((oi.quantity - COALESCE(oi.paid_quantity, 0)) * oi.unit_price * COALESCE(oi.tax_rate, 0) / 100, 2)
        --             END
        --         ), 0),
        --         array_agg(oi.id)
        --     INTO v_items_subtotal, v_items_tax, v_covered_items
        --     FROM public.order_items oi
        --     WHERE oi.id = ANY(p_item_ids)
        DECLARE
            v_items_subtotal numeric := 0;
            v_items_tax numeric := 0;
        BEGIN
            SELECT 
                COALESCE(SUM(
                    CASE WHEN v_is_cash 
                        THEN ((oi.quantity - COALESCE(oi.paid_quantity, 0)) * oi.cash_price) - COALESCE(oi.discount_amount, 0)
                        ELSE ((oi.quantity - COALESCE(oi.paid_quantity, 0)) * oi.unit_price) - COALESCE(oi.discount_amount, 0)
                    END
                ), 0),
                COALESCE(SUM(
                    CASE WHEN v_is_cash 
                        THEN ROUND((((oi.quantity - COALESCE(oi.paid_quantity, 0)) * oi.cash_price) - COALESCE(oi.discount_amount, 0)) * COALESCE(oi.tax_rate, 0) / 100, 2)
                        ELSE ROUND((((oi.quantity - COALESCE(oi.paid_quantity, 0)) * oi.unit_price) - COALESCE(oi.discount_amount, 0)) * COALESCE(oi.tax_rate, 0) / 100, 2)
                    END
                ), 0),
                array_agg(oi.id)
            INTO v_items_subtotal, v_items_tax, v_covered_items
            FROM public.order_items oi
            WHERE oi.id = ANY(p_item_ids)
              AND oi.order_id = p_order_id
              AND oi.is_voided = false
              AND oi.quantity > COALESCE(oi.paid_quantity, 0);
            
            v_payment_total := v_items_subtotal + v_items_tax;
            v_subtotal_portion := v_items_subtotal;
            v_tax_portion := v_items_tax;
            
            -- Build detailed items JSON
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'order_item_id', oi.id,
                'item_name', oi.item_name,
                'quantity_paid', oi.quantity - COALESCE(oi.paid_quantity, 0),
                'unit_price', CASE WHEN v_is_cash THEN oi.cash_price ELSE oi.unit_price END,
                'subtotal', CASE WHEN v_is_cash 
                    THEN (oi.quantity - COALESCE(oi.paid_quantity, 0)) * oi.cash_price
                    ELSE (oi.quantity - COALESCE(oi.paid_quantity, 0)) * oi.unit_price
                END
            )), '[]'::jsonb)
            INTO v_covered_items_json
            FROM public.order_items oi
            WHERE oi.id = ANY(p_item_ids)
              AND oi.order_id = p_order_id
              AND oi.is_voided = false
              AND oi.quantity > COALESCE(oi.paid_quantity, 0);
            
            -- Mark selected items as paid
            UPDATE public.order_items
            SET 
                paid_quantity = quantity,
                price_paid = CASE WHEN v_is_cash THEN cash_price ELSE unit_price END,
                -- payment_method_used = p_payment_method,
                updated_at = now()
            WHERE id = ANY(p_item_ids)
              AND order_id = p_order_id
              AND is_voided = false;
        END;
    
    ELSIF v_is_split_payment THEN
        -- ========================================
        -- SPLIT EVENLY PAYMENT
        -- Divide total evenly among portions
        -- ========================================
        v_split_card_portion := ROUND(v_order.card_total / p_split_count, 2);
        v_split_cash_portion := ROUND(v_order.cash_total / p_split_count, 2);
        
        IF v_is_last_portion THEN
            -- Last portion: pay remainder to handle rounding
            IF v_is_cash THEN
                v_payment_total := v_order.cash_total - v_total_cash_paid;
            ELSE
                v_payment_total := v_order.card_total - v_total_card_paid;
            END IF;
            v_payment_total := GREATEST(v_payment_total, 0);
        ELSE
            IF v_is_cash THEN
                v_payment_total := v_split_cash_portion;
            ELSE
                v_payment_total := v_split_card_portion;
            END IF;
        END IF;
        
        -- Pro-rate subtotal/tax
        IF v_is_cash AND v_order.cash_total > 0 THEN
            v_subtotal_portion := ROUND(v_payment_total * (v_order.cash_subtotal / v_order.cash_total), 2);
        ELSIF v_order.card_total > 0 THEN
            v_subtotal_portion := ROUND(v_payment_total * (v_order.card_subtotal / v_order.card_total), 2);
        END IF;
        v_tax_portion := v_payment_total - v_subtotal_portion;
          
    ELSE
        -- ========================================
        -- FULL/REMAINING PAYMENT
        -- Pay all remaining unpaid items
        -- ========================================
        
        -- Use the ACTUAL unpaid total from items, not p_amount
        -- This handles the case where UI has stale amount_due
        IF v_is_cash THEN
            v_payment_total := v_pre_unpaid_cash_total;
        ELSE
            v_payment_total := v_pre_unpaid_card_total;
        END IF;
        
        -- Pro-rate subtotal/tax based on order ratios
        IF v_is_cash AND v_order.cash_total > 0 THEN
            v_subtotal_portion := ROUND(v_payment_total * (v_order.cash_subtotal / v_order.cash_total), 2);
        ELSIF v_order.card_total > 0 THEN
            v_subtotal_portion := ROUND(v_payment_total * (v_order.card_subtotal / v_order.card_total), 2);
        END IF;
        v_tax_portion := v_payment_total - v_subtotal_portion;
        
        -- Mark ALL remaining items as paid
        UPDATE public.order_items
        SET 
            paid_quantity = quantity,
            price_paid = CASE WHEN v_is_cash THEN cash_price ELSE unit_price END,
            -- payment_method_used = p_payment_method,
            updated_at = now()
        WHERE order_id = p_order_id
          AND is_voided = false
          AND quantity > COALESCE(paid_quantity, 0);
        
        -- Get the items we just paid for the response
        SELECT array_agg(id)
        INTO v_covered_items
        FROM public.order_items
        WHERE order_id = p_order_id
          AND is_voided = false
          AND paid_quantity = quantity
          AND updated_at >= now() - interval '1 second';
    END IF;
    
    -- ============================================
    -- 7. Calculate Change (Cash Only)
    -- ============================================
    IF v_is_cash THEN
        v_change_given := GREATEST(
            COALESCE(p_amount_tendered, v_payment_total) - (v_payment_total + COALESCE(p_tip_amount, 0)), 
            0
        );
    END IF;
    
    -- ============================================
    -- 8. Create Payment Record
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
        split_portion_index,
        split_count,
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
        -- original_amount: what this would cost at card price
        CASE WHEN v_is_cash 
            THEN ROUND(v_payment_total * v_order.card_total / NULLIF(v_order.cash_total, 0), 2)
            ELSE v_payment_total 
        END,
        CASE WHEN array_length(v_covered_items, 1) > 0 THEN v_covered_items ELSE NULL END,
        p_split_portion_index,
        p_split_count,
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
    -- 9. Per-Item: Create order_payment_items
    -- ============================================
    IF v_is_item_payment AND array_length(v_covered_items, 1) > 0 THEN
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
            oi.quantity,
            oi.price_paid,
            oi.quantity * oi.price_paid,
            ROUND(oi.quantity * oi.price_paid * COALESCE(oi.tax_rate, 0) / 100, 2)
        FROM public.order_items oi
        WHERE oi.id = ANY(v_covered_items)
          AND oi.order_id = p_order_id
          AND oi.is_voided = false;
    END IF;

    -- ============================================
    -- 10. Update Payment Totals (include this payment)
    -- ============================================
    IF v_is_cash THEN
        v_total_cash_paid := v_total_cash_paid + v_payment_total + COALESCE(p_tip_amount, 0);
    ELSE
        v_total_card_paid := v_total_card_paid + v_payment_total + COALESCE(p_tip_amount, 0);
    END IF;
    
    v_new_amount_paid := v_total_cash_paid + v_total_card_paid;

    -- ============================================
    -- 11. Calculate NEW Unpaid Totals from Items
    --     (AFTER this payment - the source of truth)
    -- ============================================
    SELECT 
        COUNT(*),
        COALESCE(SUM(
            (oi.quantity - COALESCE(oi.paid_quantity, 0)) * oi.unit_price +
            ROUND((oi.quantity - COALESCE(oi.paid_quantity, 0)) * oi.unit_price * COALESCE(oi.tax_rate, 0) / 100, 2)
        ), 0),
        COALESCE(SUM(
            (oi.quantity - COALESCE(oi.paid_quantity, 0)) * oi.cash_price +
            ROUND((oi.quantity - COALESCE(oi.paid_quantity, 0)) * oi.cash_price * COALESCE(oi.tax_rate, 0) / 100, 2)
        ), 0)
    INTO v_unpaid_items_count, v_unpaid_card_total, v_unpaid_cash_total
    FROM public.order_items oi
    WHERE oi.order_id = p_order_id
      AND oi.is_voided = false
      AND oi.quantity > COALESCE(oi.paid_quantity, 0);

    -- ============================================
    -- 12. Determine if Order is Fully Paid
    -- ============================================
    IF v_is_split_payment THEN
        -- Split: fully paid when all portions are paid
        SELECT COUNT(*) INTO v_portions_paid
        FROM public.order_payments
        WHERE order_id = p_order_id
          AND split_portion_index IS NOT NULL
          AND split_count = p_split_count
          AND status = 'captured';
        
        v_portions_remaining := p_split_count - v_portions_paid;
        v_order_fully_paid := (v_portions_remaining = 0);
        
        -- If split is complete, mark all items paid
        IF v_order_fully_paid AND v_unpaid_items_count > 0 THEN
            UPDATE public.order_items
            SET 
                paid_quantity = quantity,
                price_paid = COALESCE(price_paid, unit_price),
                updated_at = now()
            WHERE order_id = p_order_id
              AND is_voided = false
              AND quantity > COALESCE(paid_quantity, 0);
            
            v_unpaid_items_count := 0;
            v_unpaid_card_total := 0;
            v_unpaid_cash_total := 0;
        END IF;
    ELSE
        -- Item-based or Full payment: fully paid when no unpaid items remain
        v_order_fully_paid := (v_unpaid_items_count = 0);
    END IF;

    -- ============================================
    -- 13. Set Final amount_due (ALWAYS from items)
    -- ============================================
    v_new_amount_due := v_unpaid_card_total;
    v_new_cash_amount_due := v_unpaid_cash_total;
    
    -- ============================================
    -- 14. Update Order
    -- ============================================
    UPDATE public.orders SET
        amount_paid = v_new_amount_paid,
        amount_due = v_new_amount_due,              -- ALWAYS unpaid items at card price
        cash_amount_due = v_new_cash_amount_due,    -- ALWAYS unpaid items at cash price
        tip_amount = COALESCE(tip_amount, 0) + COALESCE(p_tip_amount, 0),
        payment_pricing_mode = v_new_pricing_mode::pricing_mode,
        cash_discount_applied = COALESCE(cash_discount_applied, false) OR v_is_cash,
        payment_status = CASE
            WHEN v_order_fully_paid THEN 'paid'::payment_status
            WHEN v_new_amount_paid > 0 THEN 'partial'::payment_status
            ELSE 'pending'::payment_status
        END,
        updated_at = now()
    WHERE id = p_order_id;
    
    -- ============================================
    -- 15. Return Result
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
        
        -- Payment type flags
        'is_item_payment', v_is_item_payment,
        'is_split_payment', v_is_split_payment,
        
        -- Split info
        'split_count', p_split_count,
        'split_portion_index', p_split_portion_index,
        'portions_paid', v_portions_paid,
        'portions_remaining', v_portions_remaining,
        'split_card_portion', v_split_card_portion,
        'split_cash_portion', v_split_cash_portion,
        
        -- Item info
        'items_paid', v_covered_items_json,
        'items_covered', v_covered_items,
        
        -- Payment totals by type
        'total_cash_paid', v_total_cash_paid,
        'total_card_paid', v_total_card_paid,
        
        -- Order state (ALWAYS calculated from unpaid items)
        'order_amount_paid', v_new_amount_paid,
        'order_amount_due', v_new_amount_due,           -- Unpaid at card price
        'order_cash_amount_due', v_new_cash_amount_due, -- Unpaid at cash price
        'order_fully_paid', v_order_fully_paid,
        
        -- Unpaid details
        'unpaid_items_count', v_unpaid_items_count,
        'unpaid_card_total', v_unpaid_card_total,
        'unpaid_cash_total', v_unpaid_cash_total
    );
END;
$$;

