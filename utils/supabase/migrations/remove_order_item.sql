
DECLARE
  v_order_id UUID;
  v_order_status TEXT;
  v_item_kitchen_status TEXT;
  v_item_subtotal NUMERIC(10, 2);
  v_result JSON;
BEGIN
  -- Get order and item info and verify access
  SELECT 
    o.id,
    o.status,
    oi.subtotal,
    oi.kitchen_status
  INTO v_order_id, v_order_status, v_item_subtotal, v_item_kitchen_status
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE oi.id = p_order_item_id
    AND oi.is_voided = FALSE
    AND o.merchant_id = user_merchant_id()
    AND o.location_id = ANY(user_location_ids());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order item not found or access denied';
  END IF;

  -- Check item's kitchen_status instead of order status
  -- Items that have been sent to kitchen must be voided, not removed
  -- Allow hard delete for items with kitchen_status = 'new', NULL, or empty
  IF v_item_kitchen_status IS NOT NULL 
     AND v_item_kitchen_status NOT IN ('new', '') THEN
    RAISE EXCEPTION 'Cannot remove item with kitchen_status=%. Use void_order_item() instead.', v_item_kitchen_status;
  END IF;

  -- Delete modifiers first (cascade would handle this, but being explicit)
  DELETE FROM public.order_item_modifiers
  WHERE order_item_id = p_order_item_id;

  -- Delete the item
  DELETE FROM public.order_items
  WHERE id = p_order_item_id;

  -- Recalculate totals (handles discount redistribution + amount_due)
  PERFORM recalculate_order_discount(v_order_id);

  -- Return result
  SELECT json_build_object(
    'success', true,
    'removed_item_id', p_order_item_id,
    'order_id', v_order_id,
    'removed_subtotal', v_item_subtotal
  ) INTO v_result;

  RETURN v_result;
END;
