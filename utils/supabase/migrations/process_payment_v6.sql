CREATE OR REPLACE FUNCTION process_payment_v6(
    p_order_id uuid,
    p_payment_method text,
    p_amount numeric,
    p_tip_amount numeric DEFAULT 0,
    p_amount_tendered numeric DEFAULT NULL,
    p_item_allocations jsonb DEFAULT NULL,
    p_staff_id uuid DEFAULT NULL,
    p_terminal_response jsonb DEFAULT NULL,
    p_split_count integer DEFAULT NULL,
    p_split_portion_index integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
DECLARE
    v_order record;
    v_payment_id uuid;
    v_is_cash boolean;
    v_is_item_payment boolean;
    v_is_split_payment boolean;
    v_payment_total numeric;
    v_new_sync_version integer;
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

    -- Pre-payment unpaid totals (for full remaining detection)
    v_pre_unpaid_card_total numeric := 0;
    v_pre_unpaid_cash_total numeric := 0;

    -- Refund balance tracking (for custom refunds not tied to items)
    v_effective_paid numeric := 0;
    v_payment_based_due numeric := 0;
    v_custom_refund_balance numeric := 0;

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

    -- Full remaining payment detection
    v_is_full_remaining boolean := false;
    v_target_unpaid numeric := 0;

    -- Dejavoo Transaction Tracking
    v_dejavoo_reference_id text;
    v_dejavoo_transaction_number text;
    v_dejavoo_auth_code text;
    v_dejavoo_batch_number text;
    v_dejavoo_invoice_number text;
    v_dejavoo_rrn text;
    v_dejavoo_entry_mode text;
    v_dejavoo_result_code text;
    v_dejavoo_status_code text;
    v_has_dejavoo_transaction boolean := false;
    v_dejavoo_last_four text;
BEGIN
    v_is_cash := p_payment_method = 'cash';
    v_is_item_payment := p_item_allocations IS NOT NULL AND jsonb_array_length(p_item_allocations) > 0;
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

    -- Allow payment if order has been refunded (amount_due > 0) even if payment_status is 'paid'
    IF v_order.payment_status = 'paid' AND COALESCE(v_order.amount_due, 0) <= 0 THEN
        RAISE EXCEPTION 'Order is already fully paid';
    END IF;
    
    v_current_pricing_mode := v_order.payment_pricing_mode::text;
    
     -- ============================================
    -- 2. Calculate CURRENT Unpaid Totals from Items
    --    (BEFORE this payment - source of truth)
    --    Includes prorated discounts for remaining quantities
    --    NOTE: Accounts for refunded_quantity - refunded items need to be paid again
    -- ============================================
    SELECT 
        COUNT(*),
        -- Card total: (remaining_qty * unit_price) - prorated_discount + tax_on_discounted
        -- remaining_qty = quantity - paid_quantity + refunded_quantity
        COALESCE(SUM(
            ((oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)) * oi.unit_price)
            - ROUND(
                COALESCE(oi.discount_amount, 0) * 
                (oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0))::numeric / NULLIF(oi.quantity, 0)
            , 2)
            + ROUND(
                (
                    ((oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)) * oi.unit_price)
                    - ROUND(
                        COALESCE(oi.discount_amount, 0) * 
                        (oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0))::numeric / NULLIF(oi.quantity, 0)
                    , 2)
                ) * COALESCE(oi.tax_rate, 0) / 100
            , 2)
        ), 0),
        -- Cash total: same formula with cash_price
        COALESCE(SUM(
            ((oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)) * oi.cash_price)
            - ROUND(
                COALESCE(oi.discount_amount, 0) * 
                (oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0))::numeric / NULLIF(oi.quantity, 0)
            , 2)
            + ROUND(
                (
                    ((oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)) * oi.cash_price)
                    - ROUND(
                        COALESCE(oi.discount_amount, 0) * 
                        (oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0))::numeric / NULLIF(oi.quantity, 0)
                    , 2)
                ) * COALESCE(oi.tax_rate, 0) / 100
            , 2)
        ), 0)
    INTO v_unpaid_items_count, v_pre_unpaid_card_total, v_pre_unpaid_cash_total
    FROM public.order_items oi
    WHERE oi.order_id = p_order_id
      AND oi.is_voided = false
      AND (oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)) > 0;

    -- Account for custom refund balance (refunds not tied to specific items)
    -- Same logic as calculate_order_totals_fast
    SELECT COALESCE(SUM(amount - COALESCE(refunded_amount, 0)), 0)
    INTO v_effective_paid
    FROM public.order_payments
    WHERE order_id = p_order_id
      AND status IN ('captured', 'partially_refunded', 'refunded')
      AND is_voided = false;

    v_payment_based_due := GREATEST(v_order.card_total - v_effective_paid, 0);
    v_custom_refund_balance := GREATEST(v_payment_based_due - v_pre_unpaid_card_total, 0);
    v_pre_unpaid_card_total := v_pre_unpaid_card_total + v_custom_refund_balance;
    v_pre_unpaid_cash_total := v_pre_unpaid_cash_total + v_custom_refund_balance;

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
        -- PER-ITEM PAYMENT (with per-item quantities)
        -- NOTE: Accounts for refunded_quantity - refunded items can be paid again
        -- effective_unpaid = quantity - paid_quantity + refunded_quantity
        -- ========================================
        WITH payment_calc AS (
            SELECT
                oi.id,
                oi.item_name,
                oi.quantity AS original_qty,
                oi.unit_price,
                oi.cash_price,
                oi.tax_rate,
                oi.discount_amount,
                COALESCE(oi.paid_quantity, 0) AS already_paid_qty,
                COALESCE(oi.refunded_quantity, 0) AS refunded_qty,
                -- Effective unpaid = quantity - paid + refunded
                (oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)) AS effective_unpaid,
                
                -- Quantity being paid (capped at effective unpaid)
                LEAST(
                    COALESCE((alloc.value->>'quantity')::integer, oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)),
                    oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)
                ) AS qty_paying,
                
                -- Prorated discount: total_discount * (qty_paying / original_qty)
                ROUND(
                    COALESCE(oi.discount_amount, 0) * 
                    LEAST(
                        COALESCE((alloc.value->>'quantity')::integer, oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)),
                        oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)
                    )::numeric / NULLIF(oi.quantity, 0)
                , 2) AS prorated_discount
                
            FROM jsonb_array_elements(p_item_allocations) AS alloc
            JOIN public.order_items oi ON oi.id = (alloc.value->>'order_item_id')::uuid
            WHERE oi.order_id = p_order_id
              AND oi.is_voided = false
              AND (oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)) > 0
        )
        SELECT
            -- Subtotal: (qty * price) - prorated_discount
            COALESCE(SUM(
                CASE WHEN v_is_cash
                    THEN (pc.qty_paying * pc.cash_price) - pc.prorated_discount
                    ELSE (pc.qty_paying * pc.unit_price) - pc.prorated_discount
                END
            ), 0),
            
            -- Tax: on discounted amount
            COALESCE(SUM(
                ROUND(
                    (
                        CASE WHEN v_is_cash
                            THEN (pc.qty_paying * pc.cash_price) - pc.prorated_discount
                            ELSE (pc.qty_paying * pc.unit_price) - pc.prorated_discount
                        END
                    ) * COALESCE(pc.tax_rate, 0) / 100
                , 2)
            ), 0),
            
            array_agg(pc.id)
        INTO v_items_subtotal, v_items_tax, v_covered_items
        FROM payment_calc pc;
        
        v_payment_total := v_items_subtotal + v_items_tax;
        v_subtotal_portion := v_items_subtotal;
        v_tax_portion := v_items_tax;
        
        -- Build detailed items JSON with allocated quantities
        WITH payment_calc AS (
            SELECT
                oi.id,
                oi.item_name,
                oi.quantity AS original_qty,
                oi.unit_price,
                oi.cash_price,
                LEAST(
                    COALESCE((alloc.value->>'quantity')::integer, oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)),
                    oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)
                ) AS qty_paying,
                ROUND(
                    COALESCE(oi.discount_amount, 0) * 
                    LEAST(
                        COALESCE((alloc.value->>'quantity')::integer, oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)),
                        oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)
                    )::numeric / NULLIF(oi.quantity, 0)
                , 2) AS prorated_discount
            FROM jsonb_array_elements(p_item_allocations) AS alloc
            JOIN public.order_items oi ON oi.id = (alloc.value->>'order_item_id')::uuid
            WHERE oi.order_id = p_order_id
              AND oi.is_voided = false
              AND (oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)) > 0
        )
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'order_item_id', pc.id,
            'item_name', pc.item_name,
            'quantity_paid', pc.qty_paying,
            'unit_price', CASE WHEN v_is_cash THEN pc.cash_price ELSE pc.unit_price END,
            'prorated_discount', pc.prorated_discount,
            'subtotal', CASE WHEN v_is_cash
                THEN (pc.qty_paying * pc.cash_price) - pc.prorated_discount
                ELSE (pc.qty_paying * pc.unit_price) - pc.prorated_discount
            END
        )), '[]'::jsonb)
        INTO v_covered_items_json
        FROM payment_calc pc;
        
        -- Update items with allocated quantities (INCREMENT paid_quantity)
        -- Cap at effective unpaid (quantity - paid + refunded)
        UPDATE public.order_items oi
        SET
            paid_quantity = COALESCE(oi.paid_quantity, 0) + LEAST(
                COALESCE((alloc.value->>'quantity')::integer, oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)),
                oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)
            ),
            price_paid = CASE WHEN v_is_cash THEN oi.cash_price ELSE oi.unit_price END,
            updated_at = now()
        FROM jsonb_array_elements(p_item_allocations) AS alloc
        WHERE oi.id = (alloc.value->>'order_item_id')::uuid
          AND oi.order_id = p_order_id
          AND oi.is_voided = false;
    
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
        -- FULL/REMAINING or PARTIAL PAYMENT
        -- Supports hybrid: pay items first, then pay remaining
        -- ========================================
        
        -- Determine target unpaid amount (from items, source of truth)
        v_target_unpaid := CASE WHEN v_is_cash 
            THEN v_pre_unpaid_cash_total 
            ELSE v_pre_unpaid_card_total 
        END;
        
        -- ============================================
        -- FIX V6: Added 0.05 tolerance for rounding differences
        -- between frontend and backend calculations
        -- ============================================
        v_is_full_remaining := (p_amount IS NULL) OR (p_amount >= (v_target_unpaid - 0.05));
        
        IF v_is_full_remaining THEN
            -- ========================================
            -- FULL REMAINING: Pay all unpaid items
            -- NOTE: Accounts for refunded_quantity - refunded items need to be paid again
            -- effective_unpaid = quantity - paid_quantity + refunded_quantity
            -- ========================================
            v_payment_total := v_target_unpaid;
            
            -- Pro-rate subtotal/tax based on order ratios
            IF v_is_cash AND v_order.cash_total > 0 THEN
                v_subtotal_portion := ROUND(v_payment_total * (v_order.cash_subtotal / v_order.cash_total), 2);
            ELSIF v_order.card_total > 0 THEN
                v_subtotal_portion := ROUND(v_payment_total * (v_order.card_subtotal / v_order.card_total), 2);
            END IF;
            v_tax_portion := v_payment_total - v_subtotal_portion;
            
            -- ============================================
            -- FIX V6: Get items BEFORE update for reliable tracking
            -- Include items with effective unpaid > 0 (accounts for refunds)
            -- ============================================
            SELECT array_agg(id)
            INTO v_covered_items
            FROM public.order_items
            WHERE order_id = p_order_id
              AND is_voided = false
              AND (quantity - COALESCE(paid_quantity, 0) + COALESCE(refunded_quantity, 0)) > 0;
            
            -- CRITICAL: Mark ALL remaining items as paid
            -- Set paid_quantity = quantity + refunded_quantity so effective_unpaid becomes 0
            UPDATE public.order_items
            SET 
                paid_quantity = quantity + COALESCE(refunded_quantity, 0),
                price_paid = CASE WHEN v_is_cash THEN cash_price ELSE unit_price END,
                updated_at = now()
            WHERE order_id = p_order_id
              AND is_voided = false
              AND (quantity - COALESCE(paid_quantity, 0) + COALESCE(refunded_quantity, 0)) > 0;
              
            -- Build items JSON for response
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'order_item_id', oi.id,
                'item_name', oi.item_name,
                'quantity_paid', oi.quantity,
                'unit_price', oi.price_paid,
                'subtotal', oi.quantity * oi.price_paid
            )), '[]'::jsonb)
            INTO v_covered_items_json
            FROM public.order_items oi
            WHERE oi.id = ANY(v_covered_items);
            
        ELSE
            -- ========================================
            -- PARTIAL: Pay specific amount (no item marking)
            -- ========================================
            -- This is a partial amount payment - items remain unpaid
            -- Used for scenarios like "I'll pay $50 toward the bill"
            v_payment_total := LEAST(p_amount, v_target_unpaid);
            v_payment_total := GREATEST(v_payment_total, 0);
            
            -- Pro-rate subtotal/tax
            IF v_is_cash AND v_order.cash_total > 0 THEN
                v_subtotal_portion := ROUND(v_payment_total * (v_order.cash_subtotal / v_order.cash_total), 2);
            ELSIF v_order.card_total > 0 THEN
                v_subtotal_portion := ROUND(v_payment_total * (v_order.card_subtotal / v_order.card_total), 2);
            END IF;
            v_tax_portion := v_payment_total - v_subtotal_portion;
            
            -- No items marked as paid - this is a partial amount against the order
            -- Items will be marked when a subsequent "pay remaining" call is made
        END IF;
    END IF;
    
    -- ============================================
    -- 6.5 Calculate Change (Cash Only)
    -- ============================================
    IF v_is_cash THEN
        v_change_given := GREATEST(
            COALESCE(p_amount_tendered, v_payment_total) - (v_payment_total + COALESCE(p_tip_amount, 0)), 
            0
        );
    END IF;


    -- ============================================
    -- 6.6 Dejavoo Terminal Response 
    -- ============================================
     IF p_terminal_response ? 'dejavoo_transaction' THEN
        v_has_dejavoo_transaction := true;
        v_dejavoo_reference_id := p_terminal_response->'dejavoo_transaction'->>'referenceId';
        v_dejavoo_transaction_number := p_terminal_response ->'dejavoo_transaction'->>'transactionNumber';
        v_dejavoo_auth_code := p_terminal_response->'dejavoo_transaction'->>'authCode';
        v_dejavoo_batch_number := p_terminal_response->'dejavoo_transaction'->>'batchNumber';
        v_dejavoo_invoice_number := p_terminal_response->'dejavoo_transaction'->>'invoiceNumber';
        v_dejavoo_rrn := p_terminal_response->'dejavoo_transaction'->>'rrn';
        v_dejavoo_entry_mode := p_terminal_response->'dejavoo_transaction'->>'entryMode';
        v_dejavoo_result_code := p_terminal_response->'dejavoo_transaction'->>'resultCode';
        v_dejavoo_status_code := p_terminal_response->'dejavoo_transaction'->>'statusCode';
        v_dejavoo_last_four := p_terminal_response->'dejavoo_transaction'->>'cardLast4';
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
        reference_number,
        transaction_id,
        authorization_code,
        dejavoo_response_code,
        dejavoo_batch_number,
        dejavoo_invoice_number,
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
        CASE WHEN array_length(v_covered_items, 1) > 0 THEN v_covered_items ELSE NULL END,
        p_split_portion_index,
        p_split_count,
        'captured',
        CASE WHEN v_is_cash THEN 'cash_drawer' ELSE 'dejavoo' END::terminal_type,
        p_staff_id,
        p_terminal_response,
        COALESCE(v_dejavoo_reference_id, p_terminal_response->>'transaction_id'),
        COALESCE(v_dejavoo_transaction_number, p_terminal_response->>'transaction_id'),
        COALESCE(v_dejavoo_auth_code, p_terminal_response->>'authorization_code'),
        v_dejavoo_status_code,
        v_dejavoo_batch_number,
        v_dejavoo_invoice_number,
        COALESCE(p_terminal_response->'dejavoo_transaction'->>'cardType', p_terminal_response->>'card_type'),
        v_dejavoo_last_four,
        now(),
        now()
    )
    RETURNING id INTO v_payment_id;

 PERFORM log_payment_event(
        p_payment_id := v_payment_id,
        p_order_id := p_order_id,
        p_location_id := v_order.location_id,
        p_event_type := 'captured',
        p_amount := v_payment_total,
        p_tip_amount := COALESCE(p_tip_amount, 0),
        p_previous_status := NULL,
        p_new_status := 'captured',
        p_psp_reference := COALESCE(
            v_dejavoo_reference_id,
            v_dejavoo_transaction_number,
            p_terminal_response->>'transaction_id'
        ),
        p_auth_code := v_dejavoo_auth_code,
        p_staff_id := p_staff_id,
        p_terminal_id := COALESCE(
            p_terminal_response->'dejavoo_transaction'->>'terminalId',
            p_terminal_response->>'terminal_id'
        ),
        p_result_code := COALESCE(v_dejavoo_result_code, '00'),
        p_response_message := CASE 
            WHEN v_is_cash THEN 'Cash payment captured'
            ELSE COALESCE(
                p_terminal_response->'dejavoo_transaction'->>'resultMessage',
                'Card payment captured successfully'
            )
        END,
        p_raw_response := p_terminal_response,
        p_reason := NULL
    );
    
    -- ============================================
    -- 8. Per-Item: Create order_payment_items
    --    NOTE: Accounts for refunded_quantity in effective unpaid calculation
    -- ============================================
    IF v_is_item_payment AND array_length(v_covered_items, 1) > 0 THEN
        WITH payment_calc AS (
            SELECT
                oi.id,
                oi.price_paid,
                oi.tax_rate,
                -- effective_unpaid = quantity - paid_quantity + refunded_quantity
                LEAST(
                    COALESCE((alloc.value->>'quantity')::integer, oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)),
                    oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)
                ) AS qty_paid,
                ROUND(
                    COALESCE(oi.discount_amount, 0) * 
                    LEAST(
                        COALESCE((alloc.value->>'quantity')::integer, oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)),
                        oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)
                    )::numeric / NULLIF(oi.quantity, 0)
                , 2) AS prorated_discount
            FROM jsonb_array_elements(p_item_allocations) AS alloc
            JOIN public.order_items oi ON oi.id = (alloc.value->>'order_item_id')::uuid
            WHERE oi.order_id = p_order_id
              AND oi.is_voided = false
        )
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
            pc.id,
            pc.qty_paid,
            pc.price_paid,
            (pc.qty_paid * pc.price_paid) - pc.prorated_discount,
            ROUND(((pc.qty_paid * pc.price_paid) - pc.prorated_discount) * COALESCE(pc.tax_rate, 0) / 100, 2)
        FROM payment_calc pc;
        
    ELSIF v_is_full_remaining AND array_length(v_covered_items, 1) > 0 THEN
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
            oi.quantity * oi.price_paid - ROUND(COALESCE(oi.discount_amount, 0), 2),
            ROUND((oi.quantity * oi.price_paid - ROUND(COALESCE(oi.discount_amount, 0), 2)) * COALESCE(oi.tax_rate, 0) / 100, 2)
        FROM public.order_items oi
        WHERE oi.id = ANY(v_covered_items)
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
    
    v_new_amount_paid := v_total_cash_paid + v_total_card_paid;

    -- ============================================
    -- 10. Calculate NEW Unpaid Totals from Items
    --     NOTE: Accounts for refunded_quantity
    --     effective_unpaid = quantity - paid_quantity + refunded_quantity
    -- ============================================
    SELECT 
        COUNT(*),
        COALESCE(SUM(
            ((oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)) * oi.unit_price)
            - ROUND(COALESCE(oi.discount_amount, 0) * (oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0))::numeric / NULLIF(oi.quantity, 0), 2)
            + ROUND((((oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)) * oi.unit_price) - ROUND(COALESCE(oi.discount_amount, 0) * (oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0))::numeric / NULLIF(oi.quantity, 0), 2)) * COALESCE(oi.tax_rate, 0) / 100, 2)
        ), 0),
        COALESCE(SUM(
            ((oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)) * oi.cash_price)
            - ROUND(COALESCE(oi.discount_amount, 0) * (oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0))::numeric / NULLIF(oi.quantity, 0), 2)
            + ROUND((((oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)) * oi.cash_price) - ROUND(COALESCE(oi.discount_amount, 0) * (oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0))::numeric / NULLIF(oi.quantity, 0), 2)) * COALESCE(oi.tax_rate, 0) / 100, 2)
        ), 0)
    INTO v_unpaid_items_count, v_unpaid_card_total, v_unpaid_cash_total
    FROM public.order_items oi
    WHERE oi.order_id = p_order_id
      AND oi.is_voided = false
      AND (oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)) > 0;

    -- Re-apply custom refund balance for post-payment state
    SELECT COALESCE(SUM(amount - COALESCE(refunded_amount, 0)), 0)
    INTO v_effective_paid
    FROM public.order_payments
    WHERE order_id = p_order_id
      AND status IN ('captured', 'partially_refunded', 'refunded')
      AND is_voided = false;

    v_payment_based_due := GREATEST(v_order.card_total - v_effective_paid, 0);
    v_custom_refund_balance := GREATEST(v_payment_based_due - v_unpaid_card_total, 0);
    v_unpaid_card_total := v_unpaid_card_total + v_custom_refund_balance;
    v_unpaid_cash_total := v_unpaid_cash_total + v_custom_refund_balance;

    -- ============================================
    -- 11. Determine if Order is Fully Paid
    -- ============================================
    IF v_is_item_payment THEN
        v_order_fully_paid := (v_unpaid_items_count = 0);
        
    ELSIF v_is_split_payment THEN
        SELECT COUNT(*) INTO v_portions_paid
        FROM public.order_payments
        WHERE order_id = p_order_id
          AND split_portion_index IS NOT NULL
          AND split_count = p_split_count
          AND status = 'captured';
        
        v_portions_remaining := p_split_count - v_portions_paid;
        v_order_fully_paid := (v_portions_remaining = 0);
        
    ELSE
        v_order_fully_paid := (
            (v_total_cash_paid >= v_order.cash_total AND v_total_card_paid = 0) OR
            (v_total_card_paid >= v_order.card_total AND v_total_cash_paid = 0) OR
            (v_unpaid_card_total <= 0.01 AND v_unpaid_cash_total <= 0.01) OR
            (v_new_amount_paid >= v_order.card_total)
        );
    END IF;

    -- ============================================
    -- 12. Handle Split Complete
    --     NOTE: Accounts for refunded_quantity when marking items as paid
    -- ============================================
    IF v_is_split_payment THEN
        SELECT COUNT(*) INTO v_portions_paid
        FROM public.order_payments
        WHERE order_id = p_order_id
          AND split_portion_index IS NOT NULL
          AND split_count = p_split_count
          AND status = 'captured';
        
        v_portions_remaining := p_split_count - v_portions_paid;
        v_order_fully_paid := (v_portions_remaining = 0);
        
        IF v_order_fully_paid AND v_unpaid_items_count > 0 THEN
            -- Set paid_quantity = quantity + refunded_quantity so effective_unpaid becomes 0
            UPDATE public.order_items
            SET 
                paid_quantity = quantity + COALESCE(refunded_quantity, 0),
                price_paid = COALESCE(price_paid, unit_price),
                updated_at = now()
            WHERE order_id = p_order_id
              AND is_voided = false
              AND (quantity - COALESCE(paid_quantity, 0) + COALESCE(refunded_quantity, 0)) > 0;
            
            v_unpaid_items_count := 0;
            v_unpaid_card_total := 0;
            v_unpaid_cash_total := 0;
        END IF;
    ELSE
        v_order_fully_paid := (v_unpaid_items_count = 0);
    END IF;

    -- ============================================
    -- 13. Set Final amount_due
    -- ============================================
    v_new_amount_due := v_unpaid_card_total;
    v_new_cash_amount_due := v_unpaid_cash_total;

    -- ============================================
    -- 14. Update Order
    -- ============================================
    UPDATE public.orders SET
        amount_paid = v_new_amount_paid,
        amount_due = v_new_amount_due,
        cash_amount_due = v_new_cash_amount_due,
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

    v_new_sync_version := increment_order_sync_version(p_order_id);

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
        
        'is_item_payment', v_is_item_payment,
        'is_split_payment', v_is_split_payment,
        'is_full_remaining', v_is_full_remaining,
        
        'split_count', p_split_count,
        'split_portion_index', p_split_portion_index,
        'portions_paid', v_portions_paid,
        'portions_remaining', v_portions_remaining,
        'split_card_portion', v_split_card_portion,
        'split_cash_portion', v_split_cash_portion,
        
        'items_paid', v_covered_items_json,
        'items_covered', v_covered_items,
        
        'total_cash_paid', v_total_cash_paid,
        'total_card_paid', v_total_card_paid,
        
        'order_amount_paid', v_new_amount_paid,
        'order_amount_due', v_new_amount_due,
        'order_cash_amount_due', v_new_cash_amount_due,
        'order_fully_paid', v_order_fully_paid,
        
        'unpaid_items_count', v_unpaid_items_count,
        'unpaid_card_total', v_unpaid_card_total,
        'unpaid_cash_total', v_unpaid_cash_total,
        
        'sync_version', v_new_sync_version
    );
END;






-- Original code for process_payment_v6
DECLARE
    v_order record;
    v_payment_id uuid;
    v_is_cash boolean;
    v_is_item_payment boolean;
    v_is_split_payment boolean;
    v_payment_total numeric;
    v_new_sync_version integer;
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

    -- Pre-payment unpaid totals (for full remaining detection)
    v_pre_unpaid_card_total numeric := 0;
    v_pre_unpaid_cash_total numeric := 0;
    
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

    -- Full remaining payment detection
    v_is_full_remaining boolean := false;
    v_target_unpaid numeric := 0;
     
    -- Dejavoo Transaction Tracking
    v_dejavoo_reference_id text;
    v_dejavoo_transaction_number text;
    v_dejavoo_auth_code text;
    v_dejavoo_batch_number text;
    v_dejavoo_invoice_number text;
    v_dejavoo_rrn text;
    v_dejavoo_entry_mode text;
    v_dejavoo_result_code text;
    v_dejavoo_status_code text;
    v_has_dejavoo_transaction boolean := false;
    v_dejavoo_last_four text;
BEGIN
    v_is_cash := p_payment_method = 'cash';
    v_is_item_payment := p_item_allocations IS NOT NULL AND jsonb_array_length(p_item_allocations) > 0;
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
    
    -- Allow payment if order has been refunded (amount_due > 0) even if payment_status is 'paid'
    IF v_order.payment_status = 'paid' AND COALESCE(v_order.amount_due, 0) <= 0 THEN
        RAISE EXCEPTION 'Order is already fully paid';
    END IF;
    
    v_current_pricing_mode := v_order.payment_pricing_mode::text;
    
     -- ============================================
    -- 2. Calculate CURRENT Unpaid Totals from Items
    --    (BEFORE this payment - source of truth)
    --    Includes prorated discounts for remaining quantities
    --    NOTE: Accounts for refunded_quantity - refunded items need to be paid again
    -- ============================================
    SELECT 
        COUNT(*),
        -- Card total: (remaining_qty * unit_price) - prorated_discount + tax_on_discounted
        -- remaining_qty = quantity - paid_quantity + refunded_quantity
        COALESCE(SUM(
            ((oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)) * oi.unit_price)
            - ROUND(
                COALESCE(oi.discount_amount, 0) * 
                (oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0))::numeric / NULLIF(oi.quantity, 0)
            , 2)
            + ROUND(
                (
                    ((oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)) * oi.unit_price)
                    - ROUND(
                        COALESCE(oi.discount_amount, 0) * 
                        (oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0))::numeric / NULLIF(oi.quantity, 0)
                    , 2)
                ) * COALESCE(oi.tax_rate, 0) / 100
            , 2)
        ), 0),
        -- Cash total: same formula with cash_price
        COALESCE(SUM(
            ((oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)) * oi.cash_price)
            - ROUND(
                COALESCE(oi.discount_amount, 0) * 
                (oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0))::numeric / NULLIF(oi.quantity, 0)
            , 2)
            + ROUND(
                (
                    ((oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)) * oi.cash_price)
                    - ROUND(
                        COALESCE(oi.discount_amount, 0) * 
                        (oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0))::numeric / NULLIF(oi.quantity, 0)
                    , 2)
                ) * COALESCE(oi.tax_rate, 0) / 100
            , 2)
        ), 0)
    INTO v_unpaid_items_count, v_pre_unpaid_card_total, v_pre_unpaid_cash_total
    FROM public.order_items oi
    WHERE oi.order_id = p_order_id
      AND oi.is_voided = false
      AND (oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)) > 0;
    
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
        -- PER-ITEM PAYMENT (with per-item quantities)
        -- NOTE: Accounts for refunded_quantity - refunded items can be paid again
        -- effective_unpaid = quantity - paid_quantity + refunded_quantity
        -- ========================================
        WITH payment_calc AS (
            SELECT
                oi.id,
                oi.item_name,
                oi.quantity AS original_qty,
                oi.unit_price,
                oi.cash_price,
                oi.tax_rate,
                oi.discount_amount,
                COALESCE(oi.paid_quantity, 0) AS already_paid_qty,
                COALESCE(oi.refunded_quantity, 0) AS refunded_qty,
                -- Effective unpaid = quantity - paid + refunded
                (oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)) AS effective_unpaid,
                
                -- Quantity being paid (capped at effective unpaid)
                LEAST(
                    COALESCE((alloc.value->>'quantity')::integer, oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)),
                    oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)
                ) AS qty_paying,
                
                -- Prorated discount: total_discount * (qty_paying / original_qty)
                ROUND(
                    COALESCE(oi.discount_amount, 0) * 
                    LEAST(
                        COALESCE((alloc.value->>'quantity')::integer, oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)),
                        oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)
                    )::numeric / NULLIF(oi.quantity, 0)
                , 2) AS prorated_discount
                
            FROM jsonb_array_elements(p_item_allocations) AS alloc
            JOIN public.order_items oi ON oi.id = (alloc.value->>'order_item_id')::uuid
            WHERE oi.order_id = p_order_id
              AND oi.is_voided = false
              AND (oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)) > 0
        )
        SELECT
            -- Subtotal: (qty * price) - prorated_discount
            COALESCE(SUM(
                CASE WHEN v_is_cash
                    THEN (pc.qty_paying * pc.cash_price) - pc.prorated_discount
                    ELSE (pc.qty_paying * pc.unit_price) - pc.prorated_discount
                END
            ), 0),
            
            -- Tax: on discounted amount
            COALESCE(SUM(
                ROUND(
                    (
                        CASE WHEN v_is_cash
                            THEN (pc.qty_paying * pc.cash_price) - pc.prorated_discount
                            ELSE (pc.qty_paying * pc.unit_price) - pc.prorated_discount
                        END
                    ) * COALESCE(pc.tax_rate, 0) / 100
                , 2)
            ), 0),
            
            array_agg(pc.id)
        INTO v_items_subtotal, v_items_tax, v_covered_items
        FROM payment_calc pc;
        
        v_payment_total := v_items_subtotal + v_items_tax;
        v_subtotal_portion := v_items_subtotal;
        v_tax_portion := v_items_tax;
        
        -- Build detailed items JSON with allocated quantities
        WITH payment_calc AS (
            SELECT
                oi.id,
                oi.item_name,
                oi.quantity AS original_qty,
                oi.unit_price,
                oi.cash_price,
                LEAST(
                    COALESCE((alloc.value->>'quantity')::integer, oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)),
                    oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)
                ) AS qty_paying,
                ROUND(
                    COALESCE(oi.discount_amount, 0) * 
                    LEAST(
                        COALESCE((alloc.value->>'quantity')::integer, oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)),
                        oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)
                    )::numeric / NULLIF(oi.quantity, 0)
                , 2) AS prorated_discount
            FROM jsonb_array_elements(p_item_allocations) AS alloc
            JOIN public.order_items oi ON oi.id = (alloc.value->>'order_item_id')::uuid
            WHERE oi.order_id = p_order_id
              AND oi.is_voided = false
              AND (oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)) > 0
        )
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'order_item_id', pc.id,
            'item_name', pc.item_name,
            'quantity_paid', pc.qty_paying,
            'unit_price', CASE WHEN v_is_cash THEN pc.cash_price ELSE pc.unit_price END,
            'prorated_discount', pc.prorated_discount,
            'subtotal', CASE WHEN v_is_cash
                THEN (pc.qty_paying * pc.cash_price) - pc.prorated_discount
                ELSE (pc.qty_paying * pc.unit_price) - pc.prorated_discount
            END
        )), '[]'::jsonb)
        INTO v_covered_items_json
        FROM payment_calc pc;
        
        -- Update items with allocated quantities (INCREMENT paid_quantity)
        -- Cap at effective unpaid (quantity - paid + refunded)
        UPDATE public.order_items oi
        SET
            paid_quantity = COALESCE(oi.paid_quantity, 0) + LEAST(
                COALESCE((alloc.value->>'quantity')::integer, oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)),
                oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)
            ),
            price_paid = CASE WHEN v_is_cash THEN oi.cash_price ELSE oi.unit_price END,
            updated_at = now()
        FROM jsonb_array_elements(p_item_allocations) AS alloc
        WHERE oi.id = (alloc.value->>'order_item_id')::uuid
          AND oi.order_id = p_order_id
          AND oi.is_voided = false;
    
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
        -- FULL/REMAINING or PARTIAL PAYMENT
        -- Supports hybrid: pay items first, then pay remaining
        -- ========================================
        
        -- Determine target unpaid amount (from items, source of truth)
        v_target_unpaid := CASE WHEN v_is_cash 
            THEN v_pre_unpaid_cash_total 
            ELSE v_pre_unpaid_card_total 
        END;
        
        -- ============================================
        -- FIX V6: Added 0.05 tolerance for rounding differences
        -- between frontend and backend calculations
        -- ============================================
        v_is_full_remaining := (p_amount IS NULL) OR (p_amount >= (v_target_unpaid - 0.05));
        
        IF v_is_full_remaining THEN
            -- ========================================
            -- FULL REMAINING: Pay all unpaid items
            -- NOTE: Accounts for refunded_quantity - refunded items need to be paid again
            -- effective_unpaid = quantity - paid_quantity + refunded_quantity
            -- ========================================
            v_payment_total := v_target_unpaid;
            
            -- Pro-rate subtotal/tax based on order ratios
            IF v_is_cash AND v_order.cash_total > 0 THEN
                v_subtotal_portion := ROUND(v_payment_total * (v_order.cash_subtotal / v_order.cash_total), 2);
            ELSIF v_order.card_total > 0 THEN
                v_subtotal_portion := ROUND(v_payment_total * (v_order.card_subtotal / v_order.card_total), 2);
            END IF;
            v_tax_portion := v_payment_total - v_subtotal_portion;
            
            -- ============================================
            -- FIX V6: Get items BEFORE update for reliable tracking
            -- Include items with effective unpaid > 0 (accounts for refunds)
            -- ============================================
            SELECT array_agg(id)
            INTO v_covered_items
            FROM public.order_items
            WHERE order_id = p_order_id
              AND is_voided = false
              AND (quantity - COALESCE(paid_quantity, 0) + COALESCE(refunded_quantity, 0)) > 0;
            
            -- CRITICAL: Mark ALL remaining items as paid
            -- Set paid_quantity = quantity + refunded_quantity so effective_unpaid becomes 0
            UPDATE public.order_items
            SET 
                paid_quantity = quantity + COALESCE(refunded_quantity, 0),
                price_paid = CASE WHEN v_is_cash THEN cash_price ELSE unit_price END,
                updated_at = now()
            WHERE order_id = p_order_id
              AND is_voided = false
              AND (quantity - COALESCE(paid_quantity, 0) + COALESCE(refunded_quantity, 0)) > 0;
              
            -- Build items JSON for response
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'order_item_id', oi.id,
                'item_name', oi.item_name,
                'quantity_paid', oi.quantity,
                'unit_price', oi.price_paid,
                'subtotal', oi.quantity * oi.price_paid
            )), '[]'::jsonb)
            INTO v_covered_items_json
            FROM public.order_items oi
            WHERE oi.id = ANY(v_covered_items);
            
        ELSE
            -- ========================================
            -- PARTIAL: Pay specific amount (no item marking)
            -- ========================================
            -- This is a partial amount payment - items remain unpaid
            -- Used for scenarios like "I'll pay $50 toward the bill"
            v_payment_total := LEAST(p_amount, v_target_unpaid);
            v_payment_total := GREATEST(v_payment_total, 0);
            
            -- Pro-rate subtotal/tax
            IF v_is_cash AND v_order.cash_total > 0 THEN
                v_subtotal_portion := ROUND(v_payment_total * (v_order.cash_subtotal / v_order.cash_total), 2);
            ELSIF v_order.card_total > 0 THEN
                v_subtotal_portion := ROUND(v_payment_total * (v_order.card_subtotal / v_order.card_total), 2);
            END IF;
            v_tax_portion := v_payment_total - v_subtotal_portion;
            
            -- No items marked as paid - this is a partial amount against the order
            -- Items will be marked when a subsequent "pay remaining" call is made
        END IF;
    END IF;
    
    -- ============================================
    -- 6.5 Calculate Change (Cash Only)
    -- ============================================
    IF v_is_cash THEN
        v_change_given := GREATEST(
            COALESCE(p_amount_tendered, v_payment_total) - (v_payment_total + COALESCE(p_tip_amount, 0)), 
            0
        );
    END IF;


    -- ============================================
    -- 6.6 Dejavoo Terminal Response 
    -- ============================================
     IF p_terminal_response ? 'dejavoo_transaction' THEN
        v_has_dejavoo_transaction := true;
        v_dejavoo_reference_id := p_terminal_response->'dejavoo_transaction'->>'referenceId';
        v_dejavoo_transaction_number := p_terminal_response ->'dejavoo_transaction'->>'transactionNumber';
        v_dejavoo_auth_code := p_terminal_response->'dejavoo_transaction'->>'authCode';
        v_dejavoo_batch_number := p_terminal_response->'dejavoo_transaction'->>'batchNumber';
        v_dejavoo_invoice_number := p_terminal_response->'dejavoo_transaction'->>'invoiceNumber';
        v_dejavoo_rrn := p_terminal_response->'dejavoo_transaction'->>'rrn';
        v_dejavoo_entry_mode := p_terminal_response->'dejavoo_transaction'->>'entryMode';
        v_dejavoo_result_code := p_terminal_response->'dejavoo_transaction'->>'resultCode';
        v_dejavoo_status_code := p_terminal_response->'dejavoo_transaction'->>'statusCode';
        v_dejavoo_last_four := p_terminal_response->'dejavoo_transaction'->>'cardLast4';
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
        reference_number,
        transaction_id,
        authorization_code,
        dejavoo_response_code,
        dejavoo_batch_number,
        dejavoo_invoice_number,
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
        CASE WHEN array_length(v_covered_items, 1) > 0 THEN v_covered_items ELSE NULL END,
        p_split_portion_index,
        p_split_count,
        'captured',
        CASE WHEN v_is_cash THEN 'cash_drawer' ELSE 'dejavoo' END::terminal_type,
        p_staff_id,
        p_terminal_response,
        COALESCE(v_dejavoo_reference_id, p_terminal_response->>'transaction_id'),
        COALESCE(v_dejavoo_transaction_number, p_terminal_response->>'transaction_id'),
        COALESCE(v_dejavoo_auth_code, p_terminal_response->>'authorization_code'),
        v_dejavoo_status_code,
        v_dejavoo_batch_number,
        v_dejavoo_invoice_number,
        COALESCE(p_terminal_response->'dejavoo_transaction'->>'cardType', p_terminal_response->>'card_type'),
        v_dejavoo_last_four,
        now(),
        now()
    )
    RETURNING id INTO v_payment_id;

 PERFORM log_payment_event(
        p_payment_id := v_payment_id,
        p_order_id := p_order_id,
        p_location_id := v_order.location_id,
        p_event_type := 'captured',
        p_amount := v_payment_total,
        p_tip_amount := COALESCE(p_tip_amount, 0),
        p_previous_status := NULL,
        p_new_status := 'captured',
        p_psp_reference := COALESCE(
            v_dejavoo_reference_id,
            v_dejavoo_transaction_number,
            p_terminal_response->>'transaction_id'
        ),
        p_auth_code := v_dejavoo_auth_code,
        p_staff_id := p_staff_id,
        p_terminal_id := COALESCE(
            p_terminal_response->'dejavoo_transaction'->>'terminalId',
            p_terminal_response->>'terminal_id'
        ),
        p_result_code := COALESCE(v_dejavoo_result_code, '00'),
        p_response_message := CASE 
            WHEN v_is_cash THEN 'Cash payment captured'
            ELSE COALESCE(
                p_terminal_response->'dejavoo_transaction'->>'resultMessage',
                'Card payment captured successfully'
            )
        END,
        p_raw_response := p_terminal_response,
        p_reason := NULL
    );
    
    -- ============================================
    -- 8. Per-Item: Create order_payment_items
    --    NOTE: Accounts for refunded_quantity in effective unpaid calculation
    -- ============================================
    IF v_is_item_payment AND array_length(v_covered_items, 1) > 0 THEN
        WITH payment_calc AS (
            SELECT
                oi.id,
                oi.price_paid,
                oi.tax_rate,
                -- effective_unpaid = quantity - paid_quantity + refunded_quantity
                LEAST(
                    COALESCE((alloc.value->>'quantity')::integer, oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)),
                    oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)
                ) AS qty_paid,
                ROUND(
                    COALESCE(oi.discount_amount, 0) * 
                    LEAST(
                        COALESCE((alloc.value->>'quantity')::integer, oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)),
                        oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)
                    )::numeric / NULLIF(oi.quantity, 0)
                , 2) AS prorated_discount
            FROM jsonb_array_elements(p_item_allocations) AS alloc
            JOIN public.order_items oi ON oi.id = (alloc.value->>'order_item_id')::uuid
            WHERE oi.order_id = p_order_id
              AND oi.is_voided = false
        )
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
            pc.id,
            pc.qty_paid,
            pc.price_paid,
            (pc.qty_paid * pc.price_paid) - pc.prorated_discount,
            ROUND(((pc.qty_paid * pc.price_paid) - pc.prorated_discount) * COALESCE(pc.tax_rate, 0) / 100, 2)
        FROM payment_calc pc;
        
    ELSIF v_is_full_remaining AND array_length(v_covered_items, 1) > 0 THEN
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
            oi.quantity * oi.price_paid - ROUND(COALESCE(oi.discount_amount, 0), 2),
            ROUND((oi.quantity * oi.price_paid - ROUND(COALESCE(oi.discount_amount, 0), 2)) * COALESCE(oi.tax_rate, 0) / 100, 2)
        FROM public.order_items oi
        WHERE oi.id = ANY(v_covered_items)
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
    
    v_new_amount_paid := v_total_cash_paid + v_total_card_paid;

    -- ============================================
    -- 10. Calculate NEW Unpaid Totals from Items
    --     NOTE: Accounts for refunded_quantity
    --     effective_unpaid = quantity - paid_quantity + refunded_quantity
    -- ============================================
    SELECT 
        COUNT(*),
        COALESCE(SUM(
            ((oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)) * oi.unit_price)
            - ROUND(COALESCE(oi.discount_amount, 0) * (oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0))::numeric / NULLIF(oi.quantity, 0), 2)
            + ROUND((((oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)) * oi.unit_price) - ROUND(COALESCE(oi.discount_amount, 0) * (oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0))::numeric / NULLIF(oi.quantity, 0), 2)) * COALESCE(oi.tax_rate, 0) / 100, 2)
        ), 0),
        COALESCE(SUM(
            ((oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)) * oi.cash_price)
            - ROUND(COALESCE(oi.discount_amount, 0) * (oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0))::numeric / NULLIF(oi.quantity, 0), 2)
            + ROUND((((oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)) * oi.cash_price) - ROUND(COALESCE(oi.discount_amount, 0) * (oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0))::numeric / NULLIF(oi.quantity, 0), 2)) * COALESCE(oi.tax_rate, 0) / 100, 2)
        ), 0)
    INTO v_unpaid_items_count, v_unpaid_card_total, v_unpaid_cash_total
    FROM public.order_items oi
    WHERE oi.order_id = p_order_id
      AND oi.is_voided = false
      AND (oi.quantity - COALESCE(oi.paid_quantity, 0) + COALESCE(oi.refunded_quantity, 0)) > 0;

    -- ============================================
    -- 11. Determine if Order is Fully Paid
    -- ============================================
    IF v_is_item_payment THEN
        v_order_fully_paid := (v_unpaid_items_count = 0);
        
    ELSIF v_is_split_payment THEN
        SELECT COUNT(*) INTO v_portions_paid
        FROM public.order_payments
        WHERE order_id = p_order_id
          AND split_portion_index IS NOT NULL
          AND split_count = p_split_count
          AND status = 'captured';
        
        v_portions_remaining := p_split_count - v_portions_paid;
        v_order_fully_paid := (v_portions_remaining = 0);
        
    ELSE
        v_order_fully_paid := (
            (v_total_cash_paid >= v_order.cash_total AND v_total_card_paid = 0) OR
            (v_total_card_paid >= v_order.card_total AND v_total_cash_paid = 0) OR
            (v_unpaid_card_total <= 0.01 AND v_unpaid_cash_total <= 0.01) OR
            (v_new_amount_paid >= v_order.card_total)
        );
    END IF;

    -- ============================================
    -- 12. Handle Split Complete
    --     NOTE: Accounts for refunded_quantity when marking items as paid
    -- ============================================
    IF v_is_split_payment THEN
        SELECT COUNT(*) INTO v_portions_paid
        FROM public.order_payments
        WHERE order_id = p_order_id
          AND split_portion_index IS NOT NULL
          AND split_count = p_split_count
          AND status = 'captured';
        
        v_portions_remaining := p_split_count - v_portions_paid;
        v_order_fully_paid := (v_portions_remaining = 0);
        
        IF v_order_fully_paid AND v_unpaid_items_count > 0 THEN
            -- Set paid_quantity = quantity + refunded_quantity so effective_unpaid becomes 0
            UPDATE public.order_items
            SET 
                paid_quantity = quantity + COALESCE(refunded_quantity, 0),
                price_paid = COALESCE(price_paid, unit_price),
                updated_at = now()
            WHERE order_id = p_order_id
              AND is_voided = false
              AND (quantity - COALESCE(paid_quantity, 0) + COALESCE(refunded_quantity, 0)) > 0;
            
            v_unpaid_items_count := 0;
            v_unpaid_card_total := 0;
            v_unpaid_cash_total := 0;
        END IF;
    ELSE
        v_order_fully_paid := (v_unpaid_items_count = 0);
    END IF;

    -- ============================================
    -- 13. Set Final amount_due
    -- ============================================
    v_new_amount_due := v_unpaid_card_total;
    v_new_cash_amount_due := v_unpaid_cash_total;

    -- ============================================
    -- 14. Update Order
    -- ============================================
    UPDATE public.orders SET
        amount_paid = v_new_amount_paid,
        amount_due = v_new_amount_due,
        cash_amount_due = v_new_cash_amount_due,
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

    v_new_sync_version := increment_order_sync_version(p_order_id);

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
        
        'is_item_payment', v_is_item_payment,
        'is_split_payment', v_is_split_payment,
        'is_full_remaining', v_is_full_remaining,
        
        'split_count', p_split_count,
        'split_portion_index', p_split_portion_index,
        'portions_paid', v_portions_paid,
        'portions_remaining', v_portions_remaining,
        'split_card_portion', v_split_card_portion,
        'split_cash_portion', v_split_cash_portion,
        
        'items_paid', v_covered_items_json,
        'items_covered', v_covered_items,
        
        'total_cash_paid', v_total_cash_paid,
        'total_card_paid', v_total_card_paid,
        
        'order_amount_paid', v_new_amount_paid,
        'order_amount_due', v_new_amount_due,
        'order_cash_amount_due', v_new_cash_amount_due,
        'order_fully_paid', v_order_fully_paid,
        
        'unpaid_items_count', v_unpaid_items_count,
        'unpaid_card_total', v_unpaid_card_total,
        'unpaid_cash_total', v_unpaid_cash_total,
        
        'sync_version', v_new_sync_version
    );
END;