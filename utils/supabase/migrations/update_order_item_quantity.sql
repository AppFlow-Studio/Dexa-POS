-- ============================================
-- Update Order Item Quantity RPC
-- Updates the quantity of an order item and recalculates pricing
-- with full dual pricing support
-- ============================================

CREATE OR REPLACE FUNCTION update_order_item_quantity(
    p_order_item_id uuid,
    p_quantity integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order_id uuid;
    v_location_id uuid;
    v_unit_price numeric;
    v_cash_unit_price numeric;
    v_tax_rate numeric;
    v_is_tax_exempt boolean;

    v_modifier_total numeric;
    v_new_subtotal numeric;
    v_new_cash_subtotal numeric;
    v_new_tax_amount numeric;
    v_new_cash_tax_amount numeric;

    v_discount_amount numeric := 0;
    v_discount_cash_amount numeric := 0;
    v_has_active_discount boolean := false;

    v_new_sync_version integer;
    v_price_paid numeric;

    v_result jsonb;
BEGIN
    -- Validate quantity
    IF p_quantity IS NULL OR p_quantity < 1 THEN
        RAISE EXCEPTION 'Invalid quantity: must be at least 1';
    END IF;

    -- ============================================
    -- 1. Get current item details
    -- ============================================
    SELECT
        oi.order_id,
        oi.unit_price,
        oi.cash_price,
        oi.tax_rate,
        COALESCE(oi.is_tax_exempt, false),
        o.location_id,
        o.sync_version + 1  -- Increment sync version
    INTO
        v_order_id,
        v_unit_price,
        v_cash_unit_price,
        v_tax_rate,
        v_is_tax_exempt,
        v_location_id,
        v_new_sync_version
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE oi.id = p_order_item_id
      AND o.merchant_id = user_merchant_id()
      AND o.location_id = ANY(user_location_ids())
    FOR UPDATE;  -- Lock row to prevent race conditions

    IF v_order_id IS NULL THEN
        RAISE EXCEPTION 'Order item not found or access denied';
    END IF;

    -- ============================================
    -- 2. Calculate modifier total (for reference)
    -- ============================================
    SELECT COALESCE(SUM(total_price), 0)
    INTO v_modifier_total
    FROM public.order_item_modifiers
    WHERE order_item_id = p_order_item_id;

    -- ============================================
    -- 3. Calculate new pricing based on quantity
    -- ============================================
    -- Subtotals = unit price × new quantity
    v_new_subtotal := v_unit_price * p_quantity;
    v_new_cash_subtotal := v_cash_unit_price * p_quantity;

    -- Calculate tax
    IF v_is_tax_exempt THEN
        v_new_tax_amount := 0;
        v_new_cash_tax_amount := 0;
    ELSE
        v_new_tax_amount := ROUND(v_new_subtotal * v_tax_rate / 100, 2);
        v_new_cash_tax_amount := ROUND(v_new_cash_subtotal * v_tax_rate / 100, 2);
    END IF;

    -- Calculate price paid (for backward compatibility)
    v_price_paid := v_unit_price * p_quantity;

    -- ============================================
    -- 4. Update order item with new pricing
    -- ============================================
    UPDATE public.order_items SET
        quantity = p_quantity,
        subtotal = v_new_subtotal,
        cash_subtotal = v_new_cash_subtotal,
        tax_amount = v_new_tax_amount,
        cash_tax_amount = v_new_cash_tax_amount,
        discount_amount = 0,  -- Reset, will be recalculated if discount exists
        discount_cash_amount = 0,
        updated_at = now()
    WHERE id = p_order_item_id;

    -- ============================================
    -- 5. Handle active order discounts
    -- ============================================
    SELECT EXISTS(
        SELECT 1 FROM public.order_discounts
        WHERE order_id = v_order_id
          AND voided_at IS NULL
          AND calculated_amount > 0
    ) INTO v_has_active_discount;

    IF v_has_active_discount THEN
        -- Redistribute discount across all items (including this updated one)
        PERFORM redistribute_order_discount(v_order_id);

        -- Get updated values after discount redistribution
        SELECT
            subtotal,
            cash_subtotal,
            tax_amount,
            cash_tax_amount,
            COALESCE(discount_amount, 0),
            COALESCE(discount_cash_amount, 0)
        INTO
            v_new_subtotal,
            v_new_cash_subtotal,
            v_new_tax_amount,
            v_new_cash_tax_amount,
            v_discount_amount,
            v_discount_cash_amount
        FROM public.order_items
        WHERE id = p_order_item_id;

        -- Recalculate price_paid after discount
        v_price_paid := v_new_subtotal;
    END IF;

    -- ============================================
    -- 6. Update order sync version
    -- ============================================
    UPDATE public.orders
    SET sync_version = v_new_sync_version,
        updated_at = now()
    WHERE id = v_order_id;

    -- ============================================
    -- 7. Recalculate order totals
    -- ============================================
    PERFORM calculate_order_totals_fast(v_order_id);

    -- ============================================
    -- 8. Return enhanced result with complete item data
    -- ============================================
    SELECT json_build_object(
        'success', true,
        'order_item_id', p_order_item_id,

        -- Backward compatibility (existing fields that might be expected)
        'quantity', p_quantity,
        'price_paid', v_price_paid,
        'modifier_total', v_modifier_total,
        'new_subtotal', v_new_subtotal,  -- For backward compatibility

        -- NEW: Complete item data with explicit naming
        -- Card pricing (explicit)
        'unit_price', v_unit_price,
        'card_subtotal', v_new_subtotal,
        'card_tax_amount', v_new_tax_amount,

        -- Cash pricing
        'cash_unit_price', v_cash_unit_price,
        'cash_subtotal', v_new_cash_subtotal,
        'cash_tax_amount', v_new_cash_tax_amount,

        -- Discounts
        'discount_amount', v_discount_amount,
        'discount_cash_amount', v_discount_cash_amount,

        -- Sync version for conflict detection
        'sync_version', v_new_sync_version
    ) INTO v_result;

    RETURN v_result;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION update_order_item_quantity TO authenticated;

-- Add comment
COMMENT ON FUNCTION update_order_item_quantity IS
'Updates the quantity of an order item and recalculates pricing. Returns complete item data including card/cash pricing, tax amounts, and discounts.';
