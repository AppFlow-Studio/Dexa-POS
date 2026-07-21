-- ============================================
-- MANAGE ORDER DISCOUNT (with Item Distribution)
-- Actions: 'apply', 'void'
-- Distributes discounts to order_items
-- Recalculates order totals atomically

-- ============================================
CREATE OR REPLACE FUNCTION public.manage_order_discount(
    p_action TEXT,                              -- 'apply' or 'void'
    p_order_id UUID,
    p_staff_id UUID,
    -- For 'apply':
    p_discount_id UUID DEFAULT NULL,            -- NULL for custom discounts
    p_discount_name TEXT DEFAULT NULL,          -- Required - display name
    p_discount_type TEXT DEFAULT NULL,          -- 'percentage' or 'fixed'
    p_discount_value NUMERIC DEFAULT NULL,      -- The value (10 for 10% or $10)
    p_source TEXT DEFAULT 'preset',             -- 'preset', 'custom', 'promo_code'
    p_reason TEXT DEFAULT NULL,                 -- Why discount was applied
    p_applied_to_item_ids UUID[] DEFAULT NULL,  -- NULL = order-level, array = item-level
    p_approved_by_staff_id UUID DEFAULT NULL,   -- Manager who approved
    -- For 'void':
    p_order_discount_id UUID DEFAULT NULL,      -- Which discount to void
    p_void_reason TEXT DEFAULT NULL             -- Why voided
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$

DECLARE
    v_order RECORD;
    v_discount RECORD;
    v_is_preset_discount BOOLEAN := false;
    v_order_discount_id UUID;
    v_calculated_amount NUMERIC := 0;
    v_pre_discount_subtotal NUMERIC;
    v_applicable_subtotal NUMERIC;
    v_calculated_cash_amount NUMERIC := 0;
    v_pre_discount_cash_subtotal NUMERIC;
    v_applicable_cash_subtotal NUMERIC;
    v_discount_type TEXT;
    v_discount_value NUMERIC;
    v_discount_name TEXT;
    v_requires_approval BOOLEAN := false;
    v_max_discount_amount NUMERIC;
    v_is_stackable BOOLEAN := true;
    v_has_non_stackable BOOLEAN := false;
    
    v_item RECORD;
    v_item_discount_amount NUMERIC;
    v_item_proportion NUMERIC;
    v_distributed_total NUMERIC := 0;
    v_last_item_id UUID;
    v_affected_item_ids UUID[] := '{}';
    
    v_total_discount_amount NUMERIC := 0;
    v_new_card_subtotal NUMERIC;
    v_new_cash_subtotal NUMERIC;
    v_new_card_tax NUMERIC;
    v_new_cash_tax NUMERIC;
    v_new_card_total NUMERIC;
    v_new_cash_total NUMERIC;
    v_new_amount_due NUMERIC;
    v_new_cash_amount_due NUMERIC;
    v_tax_rate NUMERIC;
    
    v_original_card_subtotal NUMERIC;
    v_original_cash_subtotal NUMERIC;
    
    v_voided_discount RECORD;
    v_voided_calculated_amount NUMERIC := 0;
BEGIN
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
      AND merchant_id = user_merchant_id()
      AND location_id = ANY(user_location_ids());
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found or access denied');
    END IF;
    
    IF v_order.payment_status = 'paid' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot modify discounts on a paid order');
    END IF;
    
    IF v_order.voided_at IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot modify discounts on a voided order');
    END IF;
    
    SELECT 
        COALESCE(SUM(oi.quantity * oi.unit_price), 0),
        COALESCE(SUM(oi.quantity * COALESCE(oi.cash_price, oi.unit_price)), 0)
    INTO v_original_card_subtotal, v_original_cash_subtotal
    FROM public.order_items oi
    WHERE oi.order_id = p_order_id AND oi.is_voided = false;
    
    IF v_order.card_subtotal > 0 AND v_order.card_tax_amount > 0 THEN
        v_tax_rate := ROUND((v_order.card_tax_amount / v_order.card_subtotal) * 100, 4);
    ELSE
        SELECT COALESCE(tax_rate, 0) INTO v_tax_rate
        FROM public.order_items
        WHERE order_id = p_order_id AND is_voided = false
        LIMIT 1;
    END IF;
    
    CASE p_action
    
    WHEN 'apply' THEN
        
        IF p_discount_name IS NULL OR p_discount_name = '' THEN
            RETURN jsonb_build_object('success', false, 'error', 'discount_name is required');
        END IF;
        
        IF p_discount_type IS NULL AND p_discount_id IS NULL THEN
            RETURN jsonb_build_object('success', false, 'error', 'Either discount_id or discount_type must be provided');
        END IF;
        
        IF p_discount_id IS NOT NULL THEN
            SELECT * INTO v_discount
            FROM public.discounts
            WHERE id = p_discount_id
              AND merchant_id = v_order.merchant_id
              AND is_active = true;
            
            IF NOT FOUND THEN
                RETURN jsonb_build_object('success', false, 'error', 'Discount not found or inactive');
            END IF;
            
            v_is_preset_discount := true;
            
            v_discount_type := v_discount.discount_type;
            v_discount_value := v_discount.discount_value;
            v_discount_name := COALESCE(p_discount_name, v_discount.name);
            v_requires_approval := COALESCE(v_discount.requires_manager_approval, false);
            v_max_discount_amount := v_discount.max_discount_amount;
            v_is_stackable := COALESCE(v_discount.stackable, false);
            
            IF v_discount.start_date IS NOT NULL AND v_discount.start_date > CURRENT_DATE THEN
                RETURN jsonb_build_object('success', false, 'error', 'Discount has not started yet');
            END IF;
            
            IF v_discount.end_date IS NOT NULL AND v_discount.end_date < CURRENT_DATE THEN
                RETURN jsonb_build_object('success', false, 'error', 'Discount has expired');
            END IF;
            
            IF v_discount.applicable_days IS NOT NULL AND
               NOT (EXTRACT(DOW FROM CURRENT_TIMESTAMP)::integer = ANY(
                   SELECT unnest(v_discount.applicable_days)::integer
               )) THEN
                RETURN jsonb_build_object('success', false, 'error', 'Discount not valid today');
            END IF;
            
            IF v_discount.applicable_hours_start IS NOT NULL AND v_discount.applicable_hours_end IS NOT NULL THEN
                DECLARE
                    v_current_time TIME := CURRENT_TIME;
                    v_in_window BOOLEAN;
                BEGIN
                    IF v_discount.applicable_hours_start > v_discount.applicable_hours_end THEN
                        v_in_window := v_current_time >= v_discount.applicable_hours_start 
                                    OR v_current_time <= v_discount.applicable_hours_end;
                    ELSE
                        v_in_window := v_current_time >= v_discount.applicable_hours_start 
                                   AND v_current_time <= v_discount.applicable_hours_end;
                    END IF;
                    
                    IF NOT v_in_window THEN
                        RETURN jsonb_build_object(
                            'success', false,
                            'error', format('Discount only valid between %s and %s', 
                                v_discount.applicable_hours_start::text, 
                                v_discount.applicable_hours_end::text)
                        );
                    END IF;
                END;
            END IF;
            
            IF v_discount.scope IS NOT NULL AND v_discount.scope::text <> 'both' THEN
                IF v_discount.scope::text = 'dine_in' AND v_order.order_type::text NOT IN ('dine_in') THEN
                    RETURN jsonb_build_object('success', false, 'error', 'Discount only valid for dine-in orders');
                END IF;
                IF v_discount.scope::text = 'takeout' AND v_order.order_type::text NOT IN ('takeout', 'delivery') THEN
                    RETURN jsonb_build_object('success', false, 'error', 'Discount only valid for takeout orders');
                END IF;
            END IF;
            
            IF v_requires_approval AND p_approved_by_staff_id IS NULL THEN
                RETURN jsonb_build_object('success', false, 'error', 'This discount requires manager approval', 'requires_approval', true);
            END IF;
            
            SELECT EXISTS(
                SELECT 1 FROM public.order_discounts od
                LEFT JOIN public.discounts d ON d.id = od.discount_id
                WHERE od.order_id = p_order_id AND od.voided_at IS NULL AND COALESCE(d.stackable, false) = false
            ) INTO v_has_non_stackable;
            
            IF v_has_non_stackable AND NOT v_is_stackable THEN
                RETURN jsonb_build_object('success', false, 'error', 'Cannot combine with existing non-stackable discount');
            END IF;
            
            IF NOT v_is_stackable THEN
                IF EXISTS (SELECT 1 FROM public.order_discounts WHERE order_id = p_order_id AND voided_at IS NULL) THEN
                    RETURN jsonb_build_object('success', false, 'error', 'This discount cannot be combined with other discounts');
                END IF;
            END IF;
            
            IF v_discount.max_uses_per_order IS NOT NULL THEN
                DECLARE v_current_uses INTEGER;
                BEGIN
                    SELECT COUNT(*) INTO v_current_uses
                    FROM public.order_discounts
                    WHERE order_id = p_order_id AND discount_id = p_discount_id AND voided_at IS NULL;
                    
                    IF v_current_uses >= v_discount.max_uses_per_order THEN
                        RETURN jsonb_build_object('success', false, 'error', format('Discount can only be used %s time(s) per order', v_discount.max_uses_per_order));
                    END IF;
                END;
            END IF;
            
        ELSE
            v_discount_type := p_discount_type;
            v_discount_value := p_discount_value;
            v_discount_name := p_discount_name;
            
            IF p_approved_by_staff_id IS NULL THEN
                RETURN jsonb_build_object('success', false, 'error', 'Custom discounts require manager approval', 'requires_approval', true);
            END IF;
        END IF;
        
        IF v_discount_value IS NULL OR v_discount_value <= 0 THEN
            RETURN jsonb_build_object('success', false, 'error', 'Discount value must be greater than 0');
        END IF;
        
        IF v_discount_type = 'percentage' AND v_discount_value > 100 THEN
            RETURN jsonb_build_object('success', false, 'error', 'Percentage discount cannot exceed 100%');
        END IF;
        
        IF p_applied_to_item_ids IS NOT NULL AND array_length(p_applied_to_item_ids, 1) > 0 THEN
            SELECT COALESCE(SUM((oi.quantity - COALESCE(oi.paid_quantity, 0)) * oi.unit_price), 0),
                   COALESCE(SUM((oi.quantity - COALESCE(oi.paid_quantity, 0)) * COALESCE(oi.cash_price, oi.unit_price)), 0)
            INTO v_applicable_subtotal, v_applicable_cash_subtotal
            FROM public.order_items oi
            WHERE oi.id = ANY(p_applied_to_item_ids)
              AND oi.order_id = p_order_id AND oi.is_voided = false
              AND oi.quantity > COALESCE(oi.paid_quantity, 0);
            
            SELECT array_agg(id) INTO v_affected_item_ids
            FROM public.order_items
            WHERE id = ANY(p_applied_to_item_ids) AND order_id = p_order_id
              AND is_voided = false AND quantity > COALESCE(paid_quantity, 0);
        ELSE
            SELECT COALESCE(SUM((oi.quantity - COALESCE(oi.paid_quantity, 0)) * oi.unit_price), 0),
                   COALESCE(SUM((oi.quantity - COALESCE(oi.paid_quantity, 0)) * COALESCE(oi.cash_price, oi.unit_price)), 0),
                   array_agg(oi.id)
            INTO v_applicable_subtotal, v_applicable_cash_subtotal, v_affected_item_ids
            FROM public.order_items oi
            WHERE oi.order_id = p_order_id AND oi.is_voided = false
              AND oi.quantity > COALESCE(oi.paid_quantity, 0);
        END IF;
        
        -- Apply exclusions for preset discounts only
        IF v_is_preset_discount THEN
            IF COALESCE(v_discount.exclude_alcohol, false) THEN
                SELECT COALESCE(SUM((oi.quantity - COALESCE(oi.paid_quantity, 0)) * oi.unit_price), 0),
                       COALESCE(SUM((oi.quantity - COALESCE(oi.paid_quantity, 0)) * COALESCE(oi.cash_price, oi.unit_price)), 0),
                       array_agg(oi.id)
                INTO v_applicable_subtotal, v_applicable_cash_subtotal, v_affected_item_ids
                FROM public.order_items oi
                LEFT JOIN public.menu_items mi ON mi.id = oi.menu_item_id
                WHERE oi.order_id = p_order_id AND oi.is_voided = false
                  AND oi.quantity > COALESCE(oi.paid_quantity, 0)
                  AND (p_applied_to_item_ids IS NULL OR oi.id = ANY(p_applied_to_item_ids))
                  AND COALESCE(mi.is_alcohol, false) = false;
            END IF;
            
            IF v_discount.exclude_categories IS NOT NULL THEN
                SELECT COALESCE(SUM((oi.quantity - COALESCE(oi.paid_quantity, 0)) * oi.unit_price), 0),
                       COALESCE(SUM((oi.quantity - COALESCE(oi.paid_quantity, 0)) * COALESCE(oi.cash_price, oi.unit_price)), 0),
                       array_agg(oi.id)
                INTO v_applicable_subtotal, v_applicable_cash_subtotal, v_affected_item_ids
                FROM public.order_items oi
                WHERE oi.order_id = p_order_id AND oi.is_voided = false
                  AND oi.quantity > COALESCE(oi.paid_quantity, 0)
                  AND (p_applied_to_item_ids IS NULL OR oi.id = ANY(p_applied_to_item_ids))
                  AND NOT EXISTS (
                      SELECT 1 FROM public.menu_items mi
                      WHERE mi.id = oi.menu_item_id
                        AND mi.category_id = ANY(v_discount.exclude_categories)
                  );
            END IF;
            
            IF v_discount.applies_to_categories IS NOT NULL THEN
                SELECT COALESCE(SUM((oi.quantity - COALESCE(oi.paid_quantity, 0)) * oi.unit_price), 0),
                       COALESCE(SUM((oi.quantity - COALESCE(oi.paid_quantity, 0)) * COALESCE(oi.cash_price, oi.unit_price)), 0),
                       array_agg(oi.id)
                INTO v_applicable_subtotal, v_applicable_cash_subtotal, v_affected_item_ids
                FROM public.order_items oi
                LEFT JOIN public.menu_items mi ON mi.id = oi.menu_item_id
                WHERE oi.order_id = p_order_id AND oi.is_voided = false
                  AND oi.quantity > COALESCE(oi.paid_quantity, 0)
                  AND (p_applied_to_item_ids IS NULL OR oi.id = ANY(p_applied_to_item_ids))
                  AND mi.category_id = ANY(v_discount.applies_to_categories);
            END IF;
        END IF;
        
        IF v_applicable_subtotal <= 0 THEN
            RETURN jsonb_build_object('success', false, 'error', 'No applicable items for this discount');
        END IF;
        
        -- FIX: Use nested IF instead of AND to avoid accessing unassigned record
        IF v_is_preset_discount THEN
            IF v_discount.min_purchase_amount IS NOT NULL THEN
                IF v_applicable_subtotal < v_discount.min_purchase_amount THEN
                    RETURN jsonb_build_object('success', false, 'error', format('Minimum purchase of $%s required', ROUND(v_discount.min_purchase_amount, 2)));
                END IF;
            END IF;
        END IF;
        
        v_pre_discount_subtotal := v_applicable_subtotal;
        v_pre_discount_cash_subtotal := v_applicable_cash_subtotal;

        IF v_discount_type = 'percentage' THEN
            v_calculated_amount := ROUND(v_applicable_subtotal * (v_discount_value / 100), 2);
            v_calculated_cash_amount := ROUND(v_applicable_cash_subtotal * (v_discount_value / 100), 2);
            IF v_max_discount_amount IS NOT NULL THEN
                v_calculated_amount := LEAST(v_calculated_amount, v_max_discount_amount);
                v_calculated_cash_amount := LEAST(v_calculated_cash_amount, v_max_discount_amount);
            END IF;
        ELSE
            v_calculated_amount := LEAST(v_discount_value, v_applicable_subtotal);
            v_calculated_cash_amount := LEAST(v_discount_value, v_applicable_cash_subtotal);
        END IF;
        
        INSERT INTO public.order_discounts (
            order_id, discount_id, discount_name, discount_type, discount_value, source,
            calculated_amount, pre_discount_subtotal, calculated_cash_amount, pre_discount_cash_subtotal,
            applied_by_staff_profiles_id, approved_by_staff_profiles_id, applied_at, applied_to_item_ids, reason
        ) VALUES (
            p_order_id, p_discount_id, v_discount_name, v_discount_type::discount_type,
            v_discount_value, p_source::discount_source, v_calculated_amount, v_pre_discount_subtotal,
            v_calculated_cash_amount, v_pre_discount_cash_subtotal,
            p_staff_id, p_approved_by_staff_id, now(), v_affected_item_ids, p_reason
        ) RETURNING id INTO v_order_discount_id;
        
        v_distributed_total := 0;
        v_last_item_id := NULL;
        
        FOR v_item IN
            SELECT oi.id, oi.quantity, oi.paid_quantity, oi.unit_price, oi.cash_price, oi.tax_rate,
                   ((oi.quantity - COALESCE(oi.paid_quantity, 0)) * oi.unit_price) as item_subtotal
            FROM public.order_items oi
            WHERE oi.id = ANY(v_affected_item_ids) AND oi.is_voided = false
            ORDER BY oi.created_at, oi.id
        LOOP
            IF v_applicable_subtotal > 0 THEN
                v_item_proportion := v_item.item_subtotal / v_applicable_subtotal;
            ELSE
                v_item_proportion := 0;
            END IF;
            
            v_item_discount_amount := ROUND(v_calculated_amount * v_item_proportion, 2);
            v_distributed_total := v_distributed_total + v_item_discount_amount;
            v_last_item_id := v_item.id;
            
            UPDATE public.order_items
            SET
                discount_id = p_discount_id,
                discount_type = v_discount_type::discount_type,
                discount_value = v_discount_value,
                discount_amount = COALESCE(discount_amount, 0) + v_item_discount_amount,
                discount_source = p_source::discount_source,
                discount_applied_by = p_staff_id,
                discount_approved_by = p_approved_by_staff_id,
                pre_discount_subtotal = CASE WHEN pre_discount_subtotal IS NULL THEN v_item.item_subtotal ELSE pre_discount_subtotal END,
                subtotal = (quantity * unit_price) - (COALESCE(discount_amount, 0) + v_item_discount_amount),
                cash_subtotal = (quantity * COALESCE(cash_price, unit_price)) - 
                    ROUND((COALESCE(discount_amount, 0) + v_item_discount_amount) * COALESCE(cash_price, unit_price) / NULLIF(unit_price, 0), 2),
                tax_amount = ROUND(((quantity * unit_price) - (COALESCE(discount_amount, 0) + v_item_discount_amount)) * COALESCE(tax_rate, 0) / 100, 2),
                cash_tax_amount = ROUND(((quantity * COALESCE(cash_price, unit_price)) - 
                    ROUND((COALESCE(discount_amount, 0) + v_item_discount_amount) * COALESCE(cash_price, unit_price) / NULLIF(unit_price, 0), 2)) * COALESCE(tax_rate, 0) / 100, 2),
                updated_at = now()
            WHERE id = v_item.id;
        END LOOP;
        
        IF v_last_item_id IS NOT NULL AND v_distributed_total <> v_calculated_amount THEN
            UPDATE public.order_items
            SET
                discount_amount = discount_amount + (v_calculated_amount - v_distributed_total),
                subtotal = subtotal - (v_calculated_amount - v_distributed_total),
                tax_amount = ROUND(subtotal * COALESCE(tax_rate, 0) / 100, 2),
                updated_at = now()
            WHERE id = v_last_item_id;
        END IF;
    
    WHEN 'void' THEN
        
        IF p_order_discount_id IS NULL THEN
            RETURN jsonb_build_object('success', false, 'error', 'order_discount_id is required for void action');
        END IF;
        
        SELECT * INTO v_voided_discount
        FROM public.order_discounts
        WHERE id = p_order_discount_id AND order_id = p_order_id AND voided_at IS NULL;
        
        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'error', 'Discount not found or already voided');
        END IF;
        
        v_order_discount_id := p_order_discount_id;
        v_affected_item_ids := v_voided_discount.applied_to_item_ids;
        v_calculated_amount := v_voided_discount.calculated_amount;

        UPDATE public.order_discounts
        SET voided_at = now(), voided_by = p_staff_id, void_reason = p_void_reason
        WHERE id = p_order_discount_id;
        
        IF v_affected_item_ids IS NOT NULL AND array_length(v_affected_item_ids, 1) > 0 THEN
            UPDATE public.order_items
            SET
                discount_id = NULL, discount_type = NULL, discount_value = 0, discount_amount = 0,
                discount_source = NULL, discount_applied_by = NULL, discount_approved_by = NULL,
                subtotal = quantity * unit_price,
                cash_subtotal = quantity * COALESCE(cash_price, unit_price),
                tax_amount = ROUND((quantity * unit_price) * COALESCE(tax_rate, 0) / 100, 2),
                cash_tax_amount = ROUND((quantity * COALESCE(cash_price, unit_price)) * COALESCE(tax_rate, 0) / 100, 2),
                updated_at = now()
            WHERE id = ANY(v_affected_item_ids) AND order_id = p_order_id AND is_voided = false;
        END IF;
    
    ELSE
        RETURN jsonb_build_object('success', false, 'error', format('Unknown action: %s', p_action));
    END CASE;
    
    SELECT 
        COALESCE(SUM(oi.subtotal), 0), COALESCE(SUM(oi.cash_subtotal), 0),
        COALESCE(SUM(oi.tax_amount), 0), COALESCE(SUM(oi.cash_tax_amount), 0),
        COALESCE(SUM(oi.discount_amount), 0)
    INTO v_new_card_subtotal, v_new_cash_subtotal, v_new_card_tax, v_new_cash_tax, v_total_discount_amount
    FROM public.order_items oi WHERE oi.order_id = p_order_id AND oi.is_voided = false;
    
    v_new_card_total := v_new_card_subtotal + v_new_card_tax;
    v_new_cash_total := v_new_cash_subtotal + v_new_cash_tax;
    
    SELECT
        COALESCE(SUM(
            ROUND(oi.subtotal * (oi.quantity - COALESCE(oi.paid_quantity, 0))::NUMERIC / NULLIF(oi.quantity, 0), 2) +
            ROUND(oi.tax_amount * (oi.quantity - COALESCE(oi.paid_quantity, 0))::NUMERIC / NULLIF(oi.quantity, 0), 2)
        ), 0),
        COALESCE(SUM(
            ROUND(oi.cash_subtotal * (oi.quantity - COALESCE(oi.paid_quantity, 0))::NUMERIC / NULLIF(oi.quantity, 0), 2) +
            ROUND(oi.cash_tax_amount * (oi.quantity - COALESCE(oi.paid_quantity, 0))::NUMERIC / NULLIF(oi.quantity, 0), 2)
        ), 0)
    INTO v_new_amount_due, v_new_cash_amount_due
    FROM public.order_items oi
    WHERE oi.order_id = p_order_id AND oi.is_voided = false
      AND oi.quantity > COALESCE(oi.paid_quantity, 0);
    
    UPDATE public.orders SET
        card_subtotal = v_original_card_subtotal, cash_subtotal = v_original_cash_subtotal,
        discount_amount = v_total_discount_amount, effective_subtotal = v_new_card_subtotal,
        effective_tax_amount = v_new_card_tax, effective_total = v_new_card_total,
        card_tax_amount = v_new_card_tax, cash_tax_amount = v_new_cash_tax,
        card_total = v_new_card_total, cash_total = v_new_cash_total, total_amount = v_new_card_total,
        amount_due = v_new_amount_due, cash_amount_due = v_new_cash_amount_due, updated_at = now()
    WHERE id = p_order_id;
    
    RETURN jsonb_build_object(
        'success', true, 'action', p_action, 'order_discount_id', v_order_discount_id, 'calculated_amount', v_calculated_amount,
        'discount', CASE WHEN p_action = 'apply' THEN jsonb_build_object(
            'id', v_order_discount_id, 'discount_id', p_discount_id, 'discount_name', v_discount_name,
            'discount_type', v_discount_type, 'discount_value', v_discount_value, 'source', p_source,
            'calculated_amount', v_calculated_amount, 'calculated_cash_amount', v_calculated_cash_amount, 'applied_to_item_ids', v_affected_item_ids
        ) ELSE NULL END,
        'order', jsonb_build_object(
            'id', p_order_id, 'card_subtotal', v_original_card_subtotal, 'cash_subtotal', v_original_cash_subtotal,
            'discount_amount', v_total_discount_amount, 'effective_subtotal', v_new_card_subtotal,
            'effective_tax_amount', v_new_card_tax, 'effective_total', v_new_card_total,
            'card_tax_amount', v_new_card_tax, 'cash_tax_amount', v_new_cash_tax,
            'card_total', v_new_card_total, 'cash_total', v_new_cash_total,
            'amount_due', v_new_amount_due, 'cash_amount_due', v_new_cash_amount_due, 'amount_paid', v_order.amount_paid
        ),
        'affected_items', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'id', oi.id, 'item_name', oi.item_name, 'quantity', oi.quantity, 'unit_price', oi.unit_price,
                'cash_price', oi.cash_price, 'discount_amount', oi.discount_amount, 'subtotal', oi.subtotal,
                'cash_subtotal', oi.cash_subtotal, 'tax_amount', oi.tax_amount, 'cash_tax_amount', oi.cash_tax_amount
            ) ORDER BY oi.display_order, oi.created_at), '[]'::jsonb)
            FROM public.order_items oi WHERE oi.id = ANY(v_affected_item_ids) AND oi.is_voided = false
        ),
        'active_discounts', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'id', od.id, 'discount_id', od.discount_id, 'discount_name', od.discount_name,
                'discount_type', od.discount_type, 'discount_value', od.discount_value, 'source', od.source,
                'calculated_amount', od.calculated_amount, 'applied_to_item_ids', od.applied_to_item_ids,
                'applied_at', od.applied_at, 'applied_by', od.applied_by_staff_profiles_id,
                'approved_by', od.approved_by_staff_profiles_id, 'reason', od.reason
            ) ORDER BY od.applied_at), '[]'::jsonb)
            FROM public.order_discounts od WHERE od.order_id = p_order_id AND od.voided_at IS NULL
        )
    );
END;

$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.manage_order_discount TO authenticated;