-- =====================================================================
-- BASELINE: remove_order_item_modifier
-- =====================================================================
-- Captures the current prod definition (verified against staging
-- dfwqakoyittmrwbqvxgw on 2026-04-27 via pg_get_functiondef).
--
-- This RPC was previously applied directly to Supabase (no migration in
-- repo). This baseline file makes the repo authoritative as a prerequisite
-- for the Phase 2 v2 fork (`remove_order_item_modifier_v2.sql`).
--
-- IDEMPOTENT: uses CREATE OR REPLACE.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.remove_order_item_modifier(
  p_modifier_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_order_item_id UUID;
  v_order_id UUID;
  v_item_quantity INTEGER;
  v_price_paid NUMERIC(10, 2);
  v_new_modifier_total NUMERIC(10, 2);
  v_new_subtotal NUMERIC(10, 2);
  v_result JSON;
BEGIN
  -- Get modifier and item details
  SELECT
    oim.order_item_id,
    oi.order_id,
    oi.quantity,
    oi.price_paid
  INTO v_order_item_id, v_order_id, v_item_quantity, v_price_paid
  FROM public.order_item_modifiers oim
  JOIN public.order_items oi ON oi.id = oim.order_item_id
  JOIN public.orders o ON o.id = oi.order_id
  WHERE oim.id = p_modifier_id
    AND oi.is_voided = FALSE
    AND o.merchant_id = user_merchant_id()
    AND o.location_id = ANY(user_location_ids())
    AND o.status NOT IN ('completed', 'cancelled', 'void');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Modifier not found or cannot be removed';
  END IF;

  -- Delete modifier
  DELETE FROM public.order_item_modifiers
  WHERE id = p_modifier_id;

  -- Calculate new totals
  SELECT COALESCE(SUM(total_price), 0)
  INTO v_new_modifier_total
  FROM public.order_item_modifiers
  WHERE order_item_id = v_order_item_id;

  v_new_subtotal := (v_item_quantity * v_price_paid) + (v_item_quantity * v_new_modifier_total);

  -- Update item subtotal
  UPDATE public.order_items
  SET
    subtotal = v_new_subtotal,
    updated_at = NOW()
  WHERE id = v_order_item_id;

  SELECT json_build_object(
    'success', true,
    'removed_modifier_id', p_modifier_id,
    'order_item_id', v_order_item_id,
    'modifier_total', v_new_modifier_total,
    'new_subtotal', v_new_subtotal
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.remove_order_item_modifier(uuid) TO authenticated;

COMMENT ON FUNCTION public.remove_order_item_modifier IS
  'Removes a modifier from an order item and recalculates subtotal. Baselined into repo 2026-04-27 from prod.';
