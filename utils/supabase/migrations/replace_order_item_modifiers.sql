-- ============================================
-- Replace Order Item Modifiers RPC
-- Atomically replaces all modifiers on an order item
-- and recalculates pricing with full dual pricing support
-- ============================================

CREATE OR REPLACE FUNCTION replace_order_item_modifiers(
    p_order_item_id uuid,
    p_modifiers jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order_id uuid;
    v_location_id uuid;
    v_base_unit_price numeric;
    v_base_cash_price numeric;
    v_quantity integer;
    v_size_modifier numeric;
    v_tax_rate numeric;
    v_is_tax_exempt boolean;

    v_old_modifier_total numeric := 0;
    v_new_modifier_total numeric := 0;

    v_new_unit_price numeric;
    v_new_cash_unit_price numeric;
    v_new_subtotal numeric;
    v_new_cash_subtotal numeric;
    v_new_tax_amount numeric;
    v_new_cash_tax_amount numeric;

    v_discount_amount numeric := 0;
    v_discount_cash_amount numeric := 0;
    v_has_active_discount boolean := false;

    v_cash_discount_rate numeric := 0.04;
    v_new_sync_version integer;

    v_result jsonb;
BEGIN
    -- ============================================
    -- 1. Get current item details
    -- ============================================
    SELECT
        oi.order_id,
        oi.unit_price,
        oi.cash_price,
        oi.quantity,
        oi.size_price_modifier,
        oi.tax_rate,
        COALESCE(oi.is_tax_exempt, false),
        o.location_id,
        o.sync_version + 1  -- Increment sync version
    INTO
        v_order_id,
        v_base_unit_price,
        v_base_cash_price,
        v_quantity,
        v_size_modifier,
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
    -- 2. Calculate old modifier total (for comparison)
    -- ============================================
    SELECT COALESCE(SUM(total_price), 0)
    INTO v_old_modifier_total
    FROM public.order_item_modifiers
    WHERE order_item_id = p_order_item_id;

    -- ============================================
    -- 3. Delete existing modifiers
    -- ============================================
    DELETE FROM public.order_item_modifiers
    WHERE order_item_id = p_order_item_id;

    -- ============================================
    -- 4. Insert new modifiers and calculate total
    -- ============================================
    IF p_modifiers IS NOT NULL AND jsonb_array_length(p_modifiers) > 0 THEN
        INSERT INTO public.order_item_modifiers (
            order_item_id,
            modifier_group_id,
            modifier_item_id,
            modifier_group_name,
            modifier_name,
            price_modifier,
            quantity,
            total_price
        )
        SELECT
            p_order_item_id,
            (mod->>'modifier_group_id')::uuid,
            (mod->>'modifier_item_id')::uuid,
            mod->>'modifier_group_name',
            mod->>'modifier_name',
            COALESCE((mod->>'price_modifier')::numeric, 0),
            COALESCE((mod->>'quantity')::integer, 1),
            COALESCE((mod->>'price_modifier')::numeric, 0) * COALESCE((mod->>'quantity')::integer, 1)
        FROM jsonb_array_elements(p_modifiers) AS mod;

        -- Calculate new modifier total
        SELECT COALESCE(SUM(total_price), 0)
        INTO v_new_modifier_total
        FROM public.order_item_modifiers
        WHERE order_item_id = p_order_item_id;
    END IF;

    -- ============================================
    -- 5. Recalculate item pricing
    -- ============================================
    -- The base prices are stored WITHOUT modifiers/size
    -- We need to get the original base prices (before modifiers)
    -- and recalculate with new modifiers

    -- Calculate base prices (without modifiers, but this already includes size modifier from DB)
    -- So we need to subtract size_modifier and old_modifier_total to get true base
    DECLARE
        v_true_base_card_price numeric;
        v_true_base_cash_price numeric;
    BEGIN
        -- Current unit_price = base + size + old_modifiers
        -- We want: base + size + new_modifiers
        v_true_base_card_price := v_base_unit_price - v_size_modifier - v_old_modifier_total;
        v_true_base_cash_price := v_base_cash_price - v_size_modifier - v_old_modifier_total;

        -- New prices with modifiers
        v_new_unit_price := v_true_base_card_price + v_size_modifier + v_new_modifier_total;
        v_new_cash_unit_price := v_true_base_cash_price + v_size_modifier + v_new_modifier_total;
    END;

    -- Calculate subtotals (pre-discount)
    v_new_subtotal := v_new_unit_price * v_quantity;
    v_new_cash_subtotal := v_new_cash_unit_price * v_quantity;

    -- Calculate tax (pre-discount)
    IF v_is_tax_exempt THEN
        v_new_tax_amount := 0;
        v_new_cash_tax_amount := 0;
    ELSE
        v_new_tax_amount := ROUND(v_new_subtotal * v_tax_rate / 100, 2);
        v_new_cash_tax_amount := ROUND(v_new_cash_subtotal * v_tax_rate / 100, 2);
    END IF;

    -- ============================================
    -- 6. Update order item with new pricing
    -- ============================================
    UPDATE public.order_items SET
        unit_price = v_new_unit_price,
        cash_price = v_new_cash_unit_price,
        subtotal = v_new_subtotal,
        cash_subtotal = v_new_cash_subtotal,
        tax_amount = v_new_tax_amount,
        cash_tax_amount = v_new_cash_tax_amount,
        discount_amount = 0,  -- Reset, will be recalculated if discount exists
        discount_cash_amount = 0,
        updated_at = now()
    WHERE id = p_order_item_id;

    -- ============================================
    -- 7. Handle active order discounts
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
    END IF;

    -- ============================================
    -- 8. Update order sync version
    -- ============================================
    UPDATE public.orders
    SET sync_version = v_new_sync_version,
        updated_at = now()
    WHERE id = v_order_id;

    -- ============================================
    -- 9. Recalculate order totals
    -- ============================================
    PERFORM calculate_order_totals_fast(v_order_id);

    -- ============================================
    -- 10. Return enhanced result with complete item data
    -- ============================================
    SELECT json_build_object(
        'success', true,
        'order_item_id', p_order_item_id,

        -- Backward compatibility (existing fields)
        'old_modifier_total', v_old_modifier_total,
        'new_modifier_total', v_new_modifier_total,
        'new_unit_price', v_new_unit_price,
        'new_subtotal', v_new_subtotal,  -- For backward compatibility
        'tax_update', v_new_tax_amount,  -- For backward compatibility

        -- NEW: Complete item data with explicit naming
        'quantity', v_quantity,

        -- Card pricing (explicit)
        'unit_price', v_new_unit_price,
        'card_subtotal', v_new_subtotal,
        'card_tax_amount', v_new_tax_amount,

        -- Cash pricing
        'cash_unit_price', v_new_cash_unit_price,
        'cash_subtotal', v_new_cash_subtotal,
        'cash_tax_amount', v_new_cash_tax_amount,

        -- Discounts
        'discount_amount', v_discount_amount,
        'discount_cash_amount', v_discount_cash_amount,

        -- Sync version for conflict detection
        'sync_version', v_new_sync_version,

        -- NEW: Return updated modifiers array
        'modifiers', (
            SELECT json_agg(json_build_object(
                'modifier_item_id', modifier_item_id::text,
                'modifier_name', modifier_name,
                'modifier_group_id', modifier_group_id::text,
                'modifier_group_name', modifier_group_name,
                'price_modifier', price_modifier,
                'quantity', quantity
            ))
            FROM public.order_item_modifiers
            WHERE order_item_id = p_order_item_id
        )
    ) INTO v_result;

    RETURN v_result;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION replace_order_item_modifiers TO authenticated;

-- Add comment
COMMENT ON FUNCTION replace_order_item_modifiers IS
'Atomically replaces all modifiers on an order item and recalculates pricing. Returns complete item data including card/cash pricing, tax amounts, discounts, and the updated modifiers array.';
