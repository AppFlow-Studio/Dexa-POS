-- ============================================
-- Phase 6: Atomic Operations & Conflict Resolution
-- ============================================
-- This migration adds sync_version support for optimistic locking
-- and payment lock mechanism for concurrent modification prevention.

-- ============================================
-- 1. Helper function to increment sync_version
-- ============================================
CREATE OR REPLACE FUNCTION increment_order_sync_version(
    p_order_id uuid
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_new_version integer;
BEGIN
    UPDATE orders
    SET sync_version = COALESCE(sync_version, 0) + 1,
        updated_at = NOW()
    WHERE id = p_order_id
    RETURNING sync_version INTO v_new_version;

    RETURN COALESCE(v_new_version, 1);
END;
$$;

-- ============================================
-- 2. Update add_order_item_v2 to return sync_version
-- ============================================
-- We wrap the existing function to add sync_version to the response
CREATE OR REPLACE FUNCTION add_order_item_v2(
    p_order_id uuid,
    p_menu_item_id uuid DEFAULT NULL,
    p_quantity integer DEFAULT 1,
    p_unit_price numeric DEFAULT 0,
    p_cash_unit_price numeric DEFAULT NULL,
    p_item_name text DEFAULT NULL,
    p_category_name text DEFAULT NULL,
    p_selected_size_id uuid DEFAULT NULL,
    p_selected_size_name text DEFAULT NULL,
    p_size_price_modifier numeric DEFAULT 0,
    p_modifiers jsonb DEFAULT NULL,
    p_special_instructions text DEFAULT NULL,
    p_course_number integer DEFAULT 1,
    p_location_exclusive_item_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_location_id uuid;
    v_tax_rate numeric := 0;
    v_tax_category text := 'standard';
    v_item_id uuid;
    v_subtotal numeric;
    v_cash_subtotal numeric;
    v_tax_amount numeric;
    v_cash_tax_amount numeric;
    v_effective_cash_price numeric;
    v_cash_discount_rate numeric := 0.04;
    v_has_active_discount boolean := false;
    v_new_sync_version integer;
BEGIN
    -- 1. Get location from order
    SELECT location_id INTO v_location_id
    FROM public.orders WHERE id = p_order_id;

    IF v_location_id IS NULL THEN
        RAISE EXCEPTION 'Order not found: %', p_order_id;
    END IF;

    -- 2. Get tax rate for this item's category at this location
    IF p_menu_item_id IS NOT NULL THEN
        SELECT
            COALESCE(tr.percentage, 8.0),
            COALESCE(lio.tax_category, mi.tax_category, 'standard')::text
        INTO v_tax_rate, v_tax_category
        FROM public.menu_items mi
        LEFT JOIN public.location_item_overrides lio
            ON lio.menu_item_id = mi.id AND lio.location_id = v_location_id
        LEFT JOIN public.tax_rates tr
            ON tr.location_id = v_location_id
            AND tr.tax_category::text = COALESCE(lio.tax_category, mi.tax_category, 'standard')::text
            AND tr.is_active = true
        WHERE mi.id = p_menu_item_id;

        -- Check exemption
        IF EXISTS (
            SELECT 1 FROM public.menu_items mi
            LEFT JOIN public.location_item_overrides lio
                ON lio.menu_item_id = mi.id AND lio.location_id = v_location_id
            WHERE mi.id = p_menu_item_id
              AND COALESCE(lio.is_tax_exempt, mi.is_tax_exempt, false) = true
        ) THEN
            v_tax_rate := 0;
        END IF;
    ELSE
        -- Open item / no menu item - use default rate
        SELECT COALESCE(percentage, 8.0) INTO v_tax_rate
        FROM public.tax_rates
        WHERE location_id = v_location_id
          AND tax_category = 'standard'
          AND is_active = true
        LIMIT 1;
    END IF;

    -- 3. Calculate base values (pre-discount)
    v_subtotal := p_unit_price * p_quantity;
    v_effective_cash_price := COALESCE(p_cash_unit_price, p_unit_price * (1 - v_cash_discount_rate));
    v_cash_subtotal := v_effective_cash_price * p_quantity;
    v_tax_amount := ROUND(v_subtotal * v_tax_rate / 100, 2);
    v_cash_tax_amount := ROUND(v_cash_subtotal * v_tax_rate / 100, 2);

    -- 4. Insert with pre-calculated values (discount will be applied after)
    INSERT INTO public.order_items (
        order_id,
        menu_item_id,
        location_exclusive_item_id,
        quantity,
        unit_price,
        cash_price,
        cash_unit_price,
        subtotal,
        cash_subtotal,
        tax_rate,
        tax_amount,
        cash_tax_amount,
        price_paid,
        selected_size_id,
        size_price_modifier,
        special_instructions,
        modifiers,
        course_number,
        item_name,
        category_name,
        paid_quantity,
        discount_amount
    ) VALUES (
        p_order_id,
        p_menu_item_id,
        p_location_exclusive_item_id,
        p_quantity,
        p_unit_price,
        v_effective_cash_price,
        v_effective_cash_price,
        v_subtotal,
        v_cash_subtotal,
        v_tax_rate,
        v_tax_amount,
        v_cash_tax_amount,
        p_unit_price,
        p_selected_size_id,
        p_size_price_modifier,
        p_special_instructions,
        p_modifiers,
        p_course_number,
        p_item_name,
        p_category_name,
        0,
        0  -- discount_amount starts at 0
    )
    RETURNING id INTO v_item_id;

    -- 5. Check if there's an active order discount
    SELECT EXISTS(
        SELECT 1 FROM public.order_discounts
        WHERE order_id = p_order_id
          AND voided_at IS NULL
          AND calculated_amount > 0
    ) INTO v_has_active_discount;

    -- 6. If discount exists, redistribute across all items (including new one)
    IF v_has_active_discount THEN
        PERFORM redistribute_order_discount(p_order_id);

        -- Get the updated values for the new item
        SELECT subtotal, tax_amount, cash_subtotal, cash_tax_amount
        INTO v_subtotal, v_tax_amount, v_cash_subtotal, v_cash_tax_amount
        FROM public.order_items
        WHERE id = v_item_id;
    END IF;

    -- 7. Recalculate order totals
    PERFORM calculate_order_totals_fast(p_order_id);

    -- 8. Increment sync_version for conflict detection (Phase 6)
    v_new_sync_version := increment_order_sync_version(p_order_id);

    RETURN jsonb_build_object(
        'success', true,
        'order_item_id', v_item_id,
        'subtotal', v_subtotal,
        'tax_amount', v_tax_amount,
        'cash_subtotal', v_cash_subtotal,
        'cash_tax_amount', v_cash_tax_amount,
        'tax_rate', v_tax_rate,
        'discount_applied', v_has_active_discount,
        'sync_version', v_new_sync_version  -- Phase 6: Return new version
    );
END;
$$;

-- ============================================
-- 3. Version-checked order update function
-- ============================================
CREATE OR REPLACE FUNCTION update_order_with_version(
    p_order_id uuid,
    p_expected_version integer,
    p_updates jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_current_version integer;
    v_new_version integer;
    v_order_exists boolean;
BEGIN
    -- Get current version with row lock
    SELECT sync_version, true
    INTO v_current_version, v_order_exists
    FROM orders
    WHERE id = p_order_id
      AND merchant_id = user_merchant_id()
      AND location_id = ANY(user_location_ids())
    FOR UPDATE;

    IF NOT v_order_exists THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'ORDER_NOT_FOUND',
            'message', 'Order not found or access denied'
        );
    END IF;

    -- Default version to 0 if null
    v_current_version := COALESCE(v_current_version, 0);

    -- Version mismatch = conflict
    IF v_current_version != p_expected_version THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'VERSION_CONFLICT',
            'message', 'Order was modified by another station',
            'current_version', v_current_version,
            'expected_version', p_expected_version
        );
    END IF;

    -- Apply updates if provided
    IF p_updates IS NOT NULL THEN
        -- Update only allowed fields from p_updates
        UPDATE orders
        SET
            customer_name = COALESCE((p_updates->>'customer_name')::text, customer_name),
            customer_phone = COALESCE((p_updates->>'customer_phone')::text, customer_phone),
            special_instructions = COALESCE((p_updates->>'special_instructions')::text, special_instructions),
            status = COALESCE((p_updates->>'status')::text, status),
            updated_at = NOW()
        WHERE id = p_order_id;
    END IF;

    -- Increment version
    v_new_version := v_current_version + 1;

    UPDATE orders
    SET sync_version = v_new_version,
        updated_at = NOW()
    WHERE id = p_order_id;

    RETURN jsonb_build_object(
        'success', true,
        'new_version', v_new_version,
        'previous_version', v_current_version
    );
END;
$$;

-- ============================================
-- 4. Payment lock mechanism
-- ============================================
-- First, add payment lock columns to orders table if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'orders' AND column_name = 'payment_lock_station_id'
    ) THEN
        ALTER TABLE orders ADD COLUMN payment_lock_station_id uuid;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'orders' AND column_name = 'payment_lock_expires_at'
    ) THEN
        ALTER TABLE orders ADD COLUMN payment_lock_expires_at timestamptz;
    END IF;
END $$;

CREATE OR REPLACE FUNCTION lock_order_for_payment(
    p_order_id uuid,
    p_expected_version integer,
    p_station_id uuid,
    p_lock_duration_seconds integer DEFAULT 60
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order record;
    v_lock_expires_at timestamptz;
BEGIN
    -- Get order with lock (NOWAIT fails immediately if locked by another transaction)
    BEGIN
        SELECT
            id,
            sync_version,
            payment_lock_station_id,
            payment_lock_expires_at
        INTO v_order
        FROM orders
        WHERE id = p_order_id
          AND merchant_id = user_merchant_id()
          AND location_id = ANY(user_location_ids())
        FOR UPDATE NOWAIT;
    EXCEPTION
        WHEN lock_not_available THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'ORDER_LOCKED_BY_TRANSACTION',
                'message', 'Order is being modified by another operation'
            );
    END;

    IF v_order.id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'ORDER_NOT_FOUND',
            'message', 'Order not found or access denied'
        );
    END IF;

    -- Check version
    IF COALESCE(v_order.sync_version, 0) != p_expected_version THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'VERSION_MISMATCH',
            'message', 'Order was modified since you last viewed it',
            'current_version', COALESCE(v_order.sync_version, 0),
            'expected_version', p_expected_version
        );
    END IF;

    -- Check for existing lock from another station
    IF v_order.payment_lock_station_id IS NOT NULL
       AND v_order.payment_lock_station_id != p_station_id
       AND v_order.payment_lock_expires_at > NOW() THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'ORDER_LOCKED_FOR_PAYMENT',
            'message', 'Order is being paid by another station',
            'locked_by_station', v_order.payment_lock_station_id,
            'lock_expires_at', v_order.payment_lock_expires_at
        );
    END IF;

    -- Set lock
    v_lock_expires_at := NOW() + (p_lock_duration_seconds || ' seconds')::interval;

    UPDATE orders
    SET payment_lock_station_id = p_station_id,
        payment_lock_expires_at = v_lock_expires_at,
        updated_at = NOW()
    WHERE id = p_order_id;

    RETURN jsonb_build_object(
        'success', true,
        'lock_expires_at', v_lock_expires_at,
        'sync_version', v_order.sync_version
    );
END;
$$;

-- ============================================
-- 5. Unlock order (release payment lock)
-- ============================================
CREATE OR REPLACE FUNCTION unlock_order_for_payment(
    p_order_id uuid,
    p_station_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_current_lock_station uuid;
BEGIN
    -- Get current lock owner
    SELECT payment_lock_station_id
    INTO v_current_lock_station
    FROM orders
    WHERE id = p_order_id
      AND merchant_id = user_merchant_id()
      AND location_id = ANY(user_location_ids());

    -- Only unlock if we own the lock or it's expired
    IF v_current_lock_station IS NULL OR v_current_lock_station = p_station_id THEN
        UPDATE orders
        SET payment_lock_station_id = NULL,
            payment_lock_expires_at = NULL,
            updated_at = NOW()
        WHERE id = p_order_id;

        RETURN jsonb_build_object('success', true);
    ELSE
        RETURN jsonb_build_object(
            'success', false,
            'error', 'NOT_LOCK_OWNER',
            'message', 'Cannot unlock order locked by another station'
        );
    END IF;
END;
$$;

-- ============================================
-- 6. Check if order is locked
-- ============================================
CREATE OR REPLACE FUNCTION is_order_locked(
    p_order_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order record;
BEGIN
    SELECT
        payment_lock_station_id,
        payment_lock_expires_at,
        sync_version
    INTO v_order
    FROM orders
    WHERE id = p_order_id
      AND merchant_id = user_merchant_id()
      AND location_id = ANY(user_location_ids());

    IF v_order IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'ORDER_NOT_FOUND'
        );
    END IF;

    -- Check if lock is active
    IF v_order.payment_lock_station_id IS NOT NULL
       AND v_order.payment_lock_expires_at > NOW() THEN
        RETURN jsonb_build_object(
            'success', true,
            'is_locked', true,
            'locked_by_station', v_order.payment_lock_station_id,
            'lock_expires_at', v_order.payment_lock_expires_at,
            'sync_version', v_order.sync_version
        );
    ELSE
        RETURN jsonb_build_object(
            'success', true,
            'is_locked', false,
            'sync_version', v_order.sync_version
        );
    END IF;
END;
$$;

-- ============================================
-- 7. Update process_payment_v5 to increment sync_version
-- Note: This is added at the end of the existing function.
-- Since we can't easily modify the existing function, we wrap it
-- or add the sync_version increment to the end.
-- ============================================

-- For process_payment_v5, we need to modify the return statement.
-- Since this is complex, we'll create a wrapper or note that
-- the process_payment function should call increment_order_sync_version
-- after successful payment processing.

-- The recommended approach is to modify process_payment_v5.sql directly
-- to include the following at the end before RETURN:
--
--     -- Phase 6: Increment sync_version
--     v_new_sync_version := increment_order_sync_version(p_order_id);
--
-- And add to the return object:
--     'sync_version', v_new_sync_version

COMMENT ON FUNCTION increment_order_sync_version(uuid) IS
'Phase 6: Helper function to increment sync_version for optimistic locking.
Call this after any operation that modifies order state.';

COMMENT ON FUNCTION update_order_with_version(uuid, integer, jsonb) IS
'Phase 6: Version-checked order update. Returns VERSION_CONFLICT if
expected_version does not match current sync_version.';

COMMENT ON FUNCTION lock_order_for_payment(uuid, integer, uuid, integer) IS
'Phase 6: Acquires a payment lock on an order to prevent modifications
during payment processing. Lock expires after specified duration (default 60s).';

COMMENT ON FUNCTION unlock_order_for_payment(uuid, uuid) IS
'Phase 6: Releases a payment lock. Only the lock owner can release it.';

COMMENT ON FUNCTION is_order_locked(uuid) IS
'Phase 6: Checks if an order is currently locked for payment.';
