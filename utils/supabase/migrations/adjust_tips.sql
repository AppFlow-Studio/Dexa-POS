CREATE OR REPLACE FUNCTION adjust_tips(
    p_order_id UUID,
    p_adjustments JSONB,  -- [{"payment_id":"uuid","new_tip_amount":5.00}, ...]
    p_staff_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
DECLARE
    v_order RECORD;
    v_payment RECORD;
    v_adj RECORD;
    v_payment_id UUID;
    v_new_tip NUMERIC;
    v_old_tip NUMERIC;
    v_adjusted_count INTEGER := 0;
    v_new_order_tip_total NUMERIC;
    v_new_sync_version INTEGER;
BEGIN
    -- ============================================
    -- 1. Validate Order Exists with RLS
    -- ============================================
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
      AND merchant_id = user_merchant_id()
      AND location_id = ANY(user_location_ids())
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found or access denied';
    END IF;

    -- ============================================
    -- 2. Loop Over Adjustments
    -- ============================================
    FOR v_adj IN SELECT * FROM jsonb_array_elements(p_adjustments)
    LOOP
        v_payment_id := (v_adj.value->>'payment_id')::UUID;
        v_new_tip := (v_adj.value->>'new_tip_amount')::NUMERIC;

        -- Fetch payment row with lock
        SELECT * INTO v_payment
        FROM public.order_payments
        WHERE id = v_payment_id
          AND order_id = p_order_id
          AND status = 'captured'
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Payment % not found or not in captured status', v_payment_id;
        END IF;

        -- Capture old tip before update
        v_old_tip := COALESCE(v_payment.tip_amount, 0);

        -- Update payment with new tip
        UPDATE public.order_payments
        SET
            tip_amount = v_new_tip,
            total_amount = amount + v_new_tip,
            original_tip_amount = COALESCE(original_tip_amount, v_old_tip),
            tip_adjusted_at = NOW(),
            tip_adjusted_by = p_staff_id
        WHERE id = v_payment_id;

        -- Log the tip adjustment event
        PERFORM log_payment_event(
            p_payment_id := v_payment_id,
            p_order_id := p_order_id,
            p_location_id := v_order.location_id,
            p_event_type := 'tip_adjusted',
            p_amount := v_payment.amount,
            p_tip_amount := v_new_tip,
            p_previous_status := 'captured',
            p_new_status := 'captured',
            p_psp_reference := v_payment.reference_number,
            p_auth_code := v_payment.authorization_code,
            p_staff_id := p_staff_id,
            p_terminal_id := NULL,
            p_result_code := '00',
            p_response_message := 'Tip adjusted from ' || v_old_tip::TEXT || ' to ' || v_new_tip::TEXT,
            p_raw_response := jsonb_build_object(
                'old_tip_amount', v_old_tip,
                'new_tip_amount', v_new_tip,
                'adjustment_delta', v_new_tip - v_old_tip
            ),
            p_reason := NULL
        );

        v_adjusted_count := v_adjusted_count + 1;
    END LOOP;

    -- ============================================
    -- 3. Recalculate Order Tip Total
    -- ============================================
    SELECT COALESCE(SUM(tip_amount), 0)
    INTO v_new_order_tip_total
    FROM public.order_payments
    WHERE order_id = p_order_id
      AND status != 'voided';

    -- ============================================
    -- 4. Update Order
    -- ============================================
    UPDATE public.orders
    SET
        tip_amount = v_new_order_tip_total,
        updated_at = NOW()
    WHERE id = p_order_id;

    -- ============================================
    -- 5. Increment Sync Version
    -- ============================================
    v_new_sync_version := increment_order_sync_version(p_order_id);

    -- ============================================
    -- 6. Return Result
    -- ============================================
    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'adjusted_count', v_adjusted_count,
        'new_order_tip_total', v_new_order_tip_total,
        'sync_version', v_new_sync_version
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
