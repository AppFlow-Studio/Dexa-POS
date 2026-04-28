-- =====================================================================
-- BASELINE: duplicate_order_item
-- =====================================================================
-- Captures the current prod definition (verified against staging
-- dfwqakoyittmrwbqvxgw on 2026-04-27 via pg_get_functiondef).
--
-- This RPC was previously applied directly to Supabase (no migration in
-- repo). This baseline file makes the repo authoritative as a prerequisite
-- for the Phase 2 v2 fork (`duplicate_order_item_v2.sql`).
--
-- IDEMPOTENT: uses CREATE OR REPLACE.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.duplicate_order_item(
  p_order_item_id uuid,
  p_quantity integer DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_order_id UUID;
  v_new_item_id UUID;
  v_original_item RECORD;
  v_result JSON;
BEGIN
  -- Get original item and verify access
  SELECT
    oi.*,
    o.merchant_id
  INTO v_original_item
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE oi.id = p_order_item_id
    AND oi.is_voided = FALSE
    AND o.merchant_id = user_merchant_id()
    AND o.location_id = ANY(user_location_ids())
    AND o.status NOT IN ('completed', 'cancelled', 'void');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order item not found or cannot be duplicated';
  END IF;

  -- Create duplicate item
  INSERT INTO public.order_items (
    order_id,
    menu_item_id,
    location_exclusive_item_id,
    item_name,
    item_description,
    category_name,
    quantity,
    unit_price,
    cash_price,
    price_paid,
    subtotal,
    selected_size_id,
    selected_size_name,
    size_price_modifier,
    special_instructions,
    item_status,
    prep_station,
    course_number,
    created_at,
    updated_at
  ) VALUES (
    v_original_item.order_id,
    v_original_item.menu_item_id,
    v_original_item.location_exclusive_item_id,
    v_original_item.item_name,
    v_original_item.item_description,
    v_original_item.category_name,
    COALESCE(p_quantity, v_original_item.quantity),
    v_original_item.unit_price,
    v_original_item.cash_price,
    v_original_item.price_paid,
    v_original_item.subtotal,  -- Will recalculate after modifiers
    v_original_item.selected_size_id,
    v_original_item.selected_size_name,
    v_original_item.size_price_modifier,
    v_original_item.special_instructions,
    'pending',
    v_original_item.prep_station,
    v_original_item.course_number,
    NOW(),
    NOW()
  )
  RETURNING id INTO v_new_item_id;

  -- Copy modifiers
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
    v_new_item_id,
    modifier_group_id,
    modifier_item_id,
    modifier_group_name,
    modifier_name,
    price_modifier,
    quantity,
    total_price
  FROM public.order_item_modifiers
  WHERE order_item_id = p_order_item_id;

  -- Recalculate subtotal with new quantity if different
  IF p_quantity IS NOT NULL AND p_quantity != v_original_item.quantity THEN
    UPDATE public.order_items
    SET subtotal = (p_quantity * price_paid) + (p_quantity * (
      SELECT COALESCE(SUM(total_price), 0) / v_original_item.quantity
      FROM public.order_item_modifiers
      WHERE order_item_id = v_new_item_id
    ))
    WHERE id = v_new_item_id;
  END IF;

  SELECT json_build_object(
    'success', true,
    'original_item_id', p_order_item_id,
    'new_item_id', v_new_item_id,
    'order_id', v_original_item.order_id,
    'item_name', v_original_item.item_name,
    'quantity', COALESCE(p_quantity, v_original_item.quantity)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.duplicate_order_item(uuid, integer) TO authenticated;

COMMENT ON FUNCTION public.duplicate_order_item IS
  'Duplicates an order item (with modifiers) and optionally overrides quantity. Baselined into repo 2026-04-27 from prod.';
