-- ============================================================================
-- DEXA POS - ORDER ITEM REMOVE & ORDER VOID FUNCTIONS
-- Remove items during order-taking, void orders for cancellation
-- ============================================================================

-- ============================================================================
-- FUNCTION: Remove Order Item (Hard Delete - For Draft Orders Only)
-- ============================================================================
-- Use this when the cashier is still taking the order and wants to remove
-- an item. No audit trail needed since order isn't finalized yet.

CREATE OR REPLACE FUNCTION public.remove_order_item(
  p_order_item_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order_id UUID;
  v_order_status TEXT;
  v_item_subtotal NUMERIC(10, 2);
  v_result JSON;
BEGIN
  -- Get order info and verify access
  SELECT 
    o.id,
    o.status,
    oi.subtotal
  INTO v_order_id, v_order_status, v_item_subtotal
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE oi.id = p_order_item_id
    AND oi.is_voided = FALSE
    AND o.merchant_id = user_merchant_id()
    AND o.location_id = ANY(user_location_ids());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order item not found or access denied';
  END IF;

  -- Only allow hard delete on draft/pending orders
  -- Once order is confirmed/sent to kitchen, must use void_order_item
  IF v_order_status NOT IN ('draft', 'pending') THEN
    RAISE EXCEPTION 'Cannot remove items from % orders. Use void_order_item() instead.', v_order_status;
  END IF;

  -- Verify permission
  -- IF NOT has_permission('location.orders.manage') THEN
  --   RAISE EXCEPTION 'Permission denied: location.orders.manage required';
  -- END IF;

  -- Delete modifiers first (cascade would handle this, but being explicit)
  DELETE FROM public.order_item_modifiers
  WHERE order_item_id = p_order_item_id;

  -- Delete the item
  DELETE FROM public.order_items
  WHERE id = p_order_item_id;

  -- Return result
  SELECT json_build_object(
    'success', true,
    'removed_item_id', p_order_item_id,
    'order_id', v_order_id,
    'removed_subtotal', v_item_subtotal
  ) INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.remove_order_item 
  IS 'Hard deletes an order item (for draft/pending orders only). Use void_order_item for confirmed orders.';

-- ============================================================================
-- FUNCTION: Remove Multiple Order Items (Batch)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.remove_order_items_batch(
  p_order_item_ids UUID[]
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order_id UUID;
  v_order_status TEXT;
  v_removed_count INTEGER := 0;
  v_item_id UUID;
  v_result JSON;
BEGIN
  -- Verify all items belong to same order and order is draft/pending
  SELECT DISTINCT o.id, o.status
  INTO v_order_id, v_order_status
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE oi.id = ANY(p_order_item_ids)
    AND o.merchant_id = user_merchant_id()
    AND o.location_id = ANY(user_location_ids());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order items not found or access denied';
  END IF;

  IF v_order_status NOT IN ('draft', 'pending') THEN
    RAISE EXCEPTION 'Cannot remove items from % orders', v_order_status;
  END IF;

  -- Verify permission
  -- IF NOT has_permission('location.orders.manage') THEN
  --   RAISE EXCEPTION 'Permission denied';
  -- END IF;

  -- Delete modifiers for all items
  DELETE FROM public.order_item_modifiers
  WHERE order_item_id = ANY(p_order_item_ids);

  -- Delete items
  DELETE FROM public.order_items
  WHERE id = ANY(p_order_item_ids)
    AND is_voided = FALSE;

  GET DIAGNOSTICS v_removed_count = ROW_COUNT;

  SELECT json_build_object(
    'success', true,
    'order_id', v_order_id,
    'removed_count', v_removed_count,
    'removed_item_ids', p_order_item_ids
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- ============================================================================
-- FUNCTION: Clear All Order Items (Start Fresh)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.clear_order_items(
  p_order_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order_status TEXT;
  v_removed_count INTEGER;
  v_result JSON;
BEGIN
  -- Verify order and status
  SELECT status INTO v_order_status
  FROM public.orders
  WHERE id = p_order_id
    AND merchant_id = user_merchant_id()
    AND location_id = ANY(user_location_ids());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF v_order_status NOT IN ('draft', 'pending') THEN
    RAISE EXCEPTION 'Cannot clear items from % orders', v_order_status;
  END IF;

  -- Verify permission
  -- IF NOT has_permission('location.orders.manage') THEN
  --   RAISE EXCEPTION 'Permission denied';
  -- END IF;

  -- Delete all modifiers
  DELETE FROM public.order_item_modifiers oim
  USING public.order_items oi
  WHERE oim.order_item_id = oi.id AND oi.order_id = p_order_id;

  -- Delete all items
  DELETE FROM public.order_items WHERE order_id = p_order_id;
  
  GET DIAGNOSTICS v_removed_count = ROW_COUNT;

  -- Reset order totals
  UPDATE public.orders
  SET 
    subtotal = 0,
    tax_amount = 0,
    total_amount = 0,
    updated_at = NOW()
  WHERE id = p_order_id;

  SELECT json_build_object(
    'success', true,
    'order_id', p_order_id,
    'removed_count', v_removed_count
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- ============================================================================
-- FUNCTION: Void Entire Order
-- ============================================================================

CREATE OR REPLACE FUNCTION public.void_order(
  p_order_id UUID,
  p_void_reason TEXT DEFAULT 'Order cancelled'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order RECORD;
  v_voided_items_count INTEGER;
  v_voided_payments_count INTEGER;
  v_refund_amount NUMERIC(10, 2) := 0;
  v_result JSON;
BEGIN
  -- Get order details
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
    AND merchant_id = user_merchant_id()
    AND location_id = ANY(user_location_ids());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  -- Check if already voided
  IF v_order.status = 'void' THEN
    RAISE EXCEPTION 'Order is already voided';
  END IF;

  -- Verify permission (void requires higher permission)
  -- IF NOT has_any_permission(ARRAY[
  --   'location.orders.void', 
  --   'location.transactions.refund',
  --   'merchant.orders.manage'
  -- ]) THEN
  --   RAISE EXCEPTION 'Permission denied: void permission required';
  -- END IF;

  -- Void all items (soft delete with reason)
  UPDATE public.order_items
  SET 
    is_voided = TRUE,
    voided_at = NOW(),
    voided_by = user_staff_profile_id(),
    void_reason = p_void_reason,
    updated_at = NOW()
  WHERE order_id = p_order_id AND is_voided = FALSE;

  GET DIAGNOSTICS v_voided_items_count = ROW_COUNT;

  -- Handle payments - mark as voided and track refund amount
  SELECT COALESCE(SUM(amount), 0) INTO v_refund_amount
  FROM public.order_payments
  WHERE order_id = p_order_id 
    AND status = 'completed'
    AND is_voided = FALSE;

  UPDATE public.order_payments
  SET 
    is_voided = TRUE,
    voided_at = NOW(),
    voided_by = user_staff_profile_id(),
    void_reason = p_void_reason,
    updated_at = NOW()
  WHERE order_id = p_order_id AND is_voided = FALSE;

  GET DIAGNOSTICS v_voided_payments_count = ROW_COUNT;

  -- Update order status
  UPDATE public.orders
  SET 
    status = 'void',
    is_paid = FALSE,
    amount_paid = 0,
    voided_at = NOW(),
    voided_by = user_staff_profile_id(),
    void_reason = p_void_reason,
    updated_at = NOW()
  WHERE id = p_order_id;

  -- Close table session if linked
  UPDATE public.table_sessions
  SET 
    is_active = FALSE,
    status = 'available',
    closed_at = NOW(),
    closed_by = user_staff_profile_id()
  WHERE order_id = p_order_id AND is_active = TRUE;

  -- Record in order status history
  INSERT INTO public.order_status_history (
    order_id, 
    previous_status, 
    new_status, 
    changed_by_staff_id,
    notes
  ) VALUES (
    p_order_id,
    v_order.status,
    'void',
    user_staff_profile_id(),
    p_void_reason
  );

  -- Return result
  SELECT json_build_object(
    'success', true,
    'order_id', p_order_id,
    'order_number', v_order.order_number,
    'previous_status', v_order.status,
    'voided_items_count', v_voided_items_count,
    'voided_payments_count', v_voided_payments_count,
    'refund_amount', v_refund_amount,
    'void_reason', p_void_reason,
    'voided_at', NOW()
  ) INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.void_order 
  IS 'Voids an entire order, all items, all payments, and closes linked table session';

-- ============================================================================
-- FUNCTION: Cancel Order (Alias for void, but for draft orders)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cancel_order(
  p_order_id UUID,
  p_cancel_reason TEXT DEFAULT 'Customer cancelled'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order_status TEXT;
  v_result JSON;
BEGIN
  -- Get order status
  SELECT status INTO v_order_status
  FROM public.orders
  WHERE id = p_order_id
    AND merchant_id = user_merchant_id()
    AND location_id = ANY(user_location_ids());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  -- For draft/pending orders, we can cancel with lower permission
  IF v_order_status IN ('draft', 'pending') THEN
    -- Just need regular order manage permission
    -- IF NOT has_permission('location.orders.manage') THEN
    --   RAISE EXCEPTION 'Permission denied';
    -- END IF;

    -- Delete items (hard delete for draft)
    DELETE FROM public.order_item_modifiers oim
    USING public.order_items oi
    WHERE oim.order_item_id = oi.id AND oi.order_id = p_order_id;

    DELETE FROM public.order_items WHERE order_id = p_order_id;

    -- Update order to cancelled
    UPDATE public.orders
    SET 
      status = 'cancelled',
      void_reason = p_cancel_reason,
      updated_at = NOW()
    WHERE id = p_order_id;

    -- Close table session if linked
    UPDATE public.table_sessions
    SET 
      is_active = FALSE,
      status = 'available',
      closed_at = NOW()
    WHERE order_id = p_order_id AND is_active = TRUE;

    SELECT json_build_object(
      'success', true,
      'order_id', p_order_id,
      'action', 'cancelled',
      'reason', p_cancel_reason
    ) INTO v_result;

    RETURN v_result;
  ELSE
    -- For confirmed orders, use void_order
    RETURN public.void_order(p_order_id, p_cancel_reason);
  END IF;
END;
$$;

COMMENT ON FUNCTION public.cancel_order 
  IS 'Cancels an order - hard delete for draft/pending, void for confirmed orders';

-- ============================================================================
-- ADD COLUMNS FOR VOID TRACKING (if not exists)
-- ============================================================================

-- Orders table
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'voided_at') 
  THEN
    ALTER TABLE public.orders ADD COLUMN voided_at TIMESTAMPTZ;
    ALTER TABLE public.orders ADD COLUMN voided_by UUID REFERENCES public.staff_profiles(id);
    ALTER TABLE public.orders ADD COLUMN void_reason TEXT;
  END IF;
END $$;

-- Order payments table (if not already there)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'order_payments' AND column_name = 'is_voided') 
  THEN
    ALTER TABLE public.order_payments ADD COLUMN is_voided BOOLEAN DEFAULT FALSE;
    ALTER TABLE public.order_payments ADD COLUMN voided_by UUID REFERENCES public.staff_profiles(id);
    ALTER TABLE public.order_payments ADD COLUMN void_reason TEXT;
  END IF;
END $$;

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.remove_order_item TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_order_items_batch TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_order_items TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_order TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_order TO authenticated;