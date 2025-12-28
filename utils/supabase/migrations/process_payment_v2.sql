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
    v_is_split_payment boolean;
    v_payment_total numeric;
    v_subtotal_portion numeric := 0;
    v_tax_portion numeric := 0;
    v_change_given numeric := 0;
    v_new_amount_paid numeric;
    v_new_amount_due numeric;         -- ALWAYS card price
    v_new_cash_amount_due numeric;    -- For reference
    v_current_pricing_mode text;
    v_new_pricing_mode text;
    v_items_subtotal numeric := 0;
    v_items_tax numeric := 0;
    v_covered_items uuid[] := '{}';
    v_covered_items_json jsonb := '[]'::jsonb;
    
    -- Unpaid tracking (ALWAYS both prices)
    v_unpaid_items_count integer := 0;
    v_unpaid_card_total numeric := 0;
    v_unpaid_cash_total numeric := 0;
    
    -- Payment totals by type
    v_total_cash_paid numeric := 0;
    v_total_card_paid numeric := 0;
    
    -- Fully paid detection
    v_order_fully_paid boolean := false;
    
    -- Split evenly tracking
    v_split_card_portion numeric;
    v_split_cash_portion numeric;
    v_portions_paid integer := 0;
    v_portions_remaining integer := 0;
    v_paid_portion_indexes integer[];
    v_is_last_portion boolean := false;
BEGIN
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
    -- 2. Get Existing Payment Totals by Type
    -- ============================================
    SELECT 
        COALESCE(SUM(CASE WHEN is_cash_priced THEN total_amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN NOT is_cash_priced THEN total_amount ELSE 0 END), 0)
    INTO v_total_cash_paid, v_total_card_paid
    FROM public.order_payments
    WHERE order_id = p_order_id 
      AND status = 'captured';
    
    -- ============================================
    -- 3. Split Payment Validation
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
    -- 4. Determine Pricing Mode (for tracking only)
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
    -- 5. Calculate Payment Amount Based on Scenario
    -- ============================================
    IF v_is_item_payment THEN
        -- ========================================
        -- PER-ITEM PAYMENT
        -- ========================================
        SELECT 
            COALESCE(SUM(
                CASE WHEN v_is_cash 
                    THEN (oi.quantity - COALESCE(oi.paid_quantity, 0)) * oi.cash_price
                    ELSE (oi.quantity - COALESCE(oi.paid_quantity, 0)) * oi.unit_price
                END
            ), 0),
            COALESCE(SUM(
                CASE WHEN v_is_cash 
                    THEN ROUND((oi.quantity - COALESCE(oi.paid_quantity, 0)) * oi.cash_price * COALESCE(oi.tax_rate, 0) / 100, 2)
                    ELSE ROUND((oi.quantity - COALESCE(oi.paid_quantity, 0)) * oi.unit_price * COALESCE(oi.tax_rate, 0) / 100, 2)
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
    
    ELSIF v_is_split_payment THEN
        -- ========================================
        -- SPLIT EVENLY PAYMENT
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
            -- Ensure non-negative
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
        -- FULL/PARTIAL PAYMENT (Amount-based)
        -- ========================================
        IF v_is_cash THEN
            -- Charge at cash price, but cap at what's actually owed at cash price
            v_payment_total := LEAST(p_amount, v_order.cash_total - v_total_cash_paid);
        ELSE
            -- Charge at card price, cap at what's owed at card price
            v_payment_total := LEAST(p_amount, v_order.card_total - v_total_card_paid);
        END IF;
        
        -- Ensure non-negative
        v_payment_total := GREATEST(v_payment_total, 0);
        
        -- Pro-rate subtotal/tax
        IF v_is_cash AND v_order.cash_total > 0 THEN
            v_subtotal_portion := ROUND(v_payment_total * (v_order.cash_subtotal / v_order.cash_total), 2);
        ELSIF v_order.card_total > 0 THEN
            v_subtotal_portion := ROUND(v_payment_total * (v_order.card_subtotal / v_order.card_total), 2);
        END IF;
        v_tax_portion := v_payment_total - v_subtotal_portion;
    END IF;
    
    -- ============================================
    -- 6. Calculate Change (Cash Only)
    -- ============================================
    IF v_is_cash THEN
        v_change_given := GREATEST(
            COALESCE(p_amount_tendered, v_payment_total) - (v_payment_total + COALESCE(p_tip_amount, 0)), 
            0
        );
    END IF;
    
    -- ============================================
    -- 7. Create Payment Record
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
        CASE WHEN v_is_cash 
            THEN ROUND(v_payment_total * v_order.card_total / NULLIF(v_order.cash_total, 0), 2)
            ELSE v_payment_total 
        END,
        CASE WHEN v_is_item_payment THEN v_covered_items ELSE NULL END,
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
    -- 8. Per-Item: Create order_payment_items
    -- ============================================
    IF v_is_item_payment THEN
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
        WHERE oi.id = ANY(p_item_ids)
          AND oi.order_id = p_order_id
          AND oi.is_voided = false;
    END IF;

    -- ============================================
    -- 9. Update Payment Totals (include this payment)
    -- ============================================
    IF v_is_cash THEN
        v_total_cash_paid := v_total_cash_paid + v_payment_total + COALESCE(p_tip_amount, 0);
    ELSE
        v_total_card_paid := v_total_card_paid + v_payment_total + COALESCE(p_tip_amount, 0);
    END IF;
    
    -- Total amount_paid for the order (sum of all payments)
    v_new_amount_paid := v_total_cash_paid + v_total_card_paid;

    -- ============================================
    -- 10. Calculate Unpaid Totals (ALWAYS both prices)
    -- ============================================
    IF v_is_item_payment THEN
        -- For item-based: calculate from remaining unpaid items
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
          
    ELSE
        -- For amount-based: calculate from order totals minus payments
        v_unpaid_card_total := GREATEST(v_order.card_total - v_total_card_paid, 0);
        v_unpaid_cash_total := GREATEST(v_order.cash_total - v_total_cash_paid, 0);
        
        -- Count unpaid items for reference
        SELECT COUNT(*)
        INTO v_unpaid_items_count
        FROM public.order_items oi
        WHERE oi.order_id = p_order_id
          AND oi.is_voided = false
          AND oi.quantity > COALESCE(oi.paid_quantity, 0);
    END IF;

    -- ============================================
    -- 11. Determine if Order is Fully Paid
    -- ============================================
    IF v_is_item_payment THEN
        -- Item-based: fully paid when no unpaid items remain
        v_order_fully_paid := (v_unpaid_items_count = 0);
        
    ELSIF v_is_split_payment THEN
        -- Split: fully paid when all portions are paid
        SELECT COUNT(*) INTO v_portions_paid
        FROM public.order_payments
        WHERE order_id = p_order_id
          AND split_portion_index IS NOT NULL
          AND split_count = p_split_count
          AND status = 'captured';
        
        v_portions_remaining := p_split_count - v_portions_paid;
        v_order_fully_paid := (v_portions_remaining = 0);
        
    ELSE
        -- Amount-based: Check if payments cover the respective totals
        -- Cash payments must cover cash_total OR card payments must cover card_total
        -- OR combined coverage (for mixed scenarios)
        v_order_fully_paid := (
            -- All cash scenario
            (v_total_cash_paid >= v_order.cash_total AND v_total_card_paid = 0) OR
            -- All card scenario  
            (v_total_card_paid >= v_order.card_total AND v_total_cash_paid = 0) OR
            -- Mixed: each payment type covers its respective portion
            (v_unpaid_card_total <= 0.01 AND v_unpaid_cash_total <= 0.01) OR
            -- Fallback: total payments cover the order
            (v_new_amount_paid >= v_order.card_total)
        );
    END IF;

    -- ============================================
    -- 12. Set Final amount_due (ALWAYS card price)
    -- ============================================
    IF v_order_fully_paid THEN
        v_new_amount_due := 0;
        v_new_cash_amount_due := 0;
        
        -- Mark all remaining items as paid
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
    ELSE
        -- ALWAYS show card price as amount_due
        v_new_amount_due := v_unpaid_card_total;
        v_new_cash_amount_due := v_unpaid_cash_total;
    END IF;
    
    -- ============================================
    -- 13. Update Order
    -- ============================================
    UPDATE public.orders SET
        amount_paid = v_new_amount_paid,
        amount_due = v_new_amount_due,              -- ALWAYS card price
        cash_amount_due = v_new_cash_amount_due,    -- For reference (if column exists)
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
    -- 14. Return Result
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
        
        -- Order state (amount_due is ALWAYS card price)
        'order_amount_paid', v_new_amount_paid,
        'order_amount_due', v_new_amount_due,           -- Card price
        'order_cash_amount_due', v_new_cash_amount_due, -- Cash price (for UI)
        'order_fully_paid', v_order_fully_paid,
        
        -- Unpaid details
        'unpaid_items_count', v_unpaid_items_count,
        'unpaid_card_total', v_unpaid_card_total,
        'unpaid_cash_total', v_unpaid_cash_total
    );
END;
$$;

