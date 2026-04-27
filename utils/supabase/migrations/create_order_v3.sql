-- =====================================================================
-- Migration: create_order_v3 — adds idempotency-key support
-- =====================================================================
-- Forks from create_order_v2 in create_order_v2.sql.
-- Rollback: create_order_v3_rollback.sql
-- =====================================================================

CREATE OR REPLACE FUNCTION public.create_order_v3(
  p_merchant_id uuid,
  p_location_id uuid,
  p_order_type order_type,
  p_table_number text,
  p_customer_name text,
  p_customer_phone text,
  p_special_instructions text,
  p_device_id text,
  p_created_by_staff_id uuid,
  p_station_id uuid DEFAULT NULL,
  p_idempotency_key UUID DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_cached JSONB;
  v_order_id UUID;
  v_order_number TEXT;
  v_display_number TEXT;
  v_user_id TEXT;
  v_result jsonb;
  v_verified_staff_id UUID;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    v_cached := public._idempotency_claim(p_idempotency_key, 'create_order_v3');
    IF v_cached IS NOT NULL THEN
      RETURN v_cached;
    END IF;
  END IF;

  -- BEGIN_VERBATIM
  v_user_id := get_my_claim('sub');

  IF NOT (p_location_id = ANY(user_location_ids())) THEN
    RAISE EXCEPTION 'Access denied: User does not have access to location';
  END IF;

  IF p_merchant_id != user_merchant_id() THEN
    RAISE EXCEPTION 'Access denied: Invalid merchant_id';
  END IF;

  v_verified_staff_id := p_created_by_staff_id;
  IF v_verified_staff_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.staff_profiles WHERE id = v_verified_staff_id) THEN
      v_verified_staff_id := NULL;
    END IF;
  END IF;

  v_order_number := public.generate_order_number(p_location_id, p_station_id);

  v_display_number := CASE
    WHEN SPLIT_PART(v_order_number, '-', 4) <> ''
    THEN '#' || SPLIT_PART(v_order_number, '-', 3) || '-' || SPLIT_PART(v_order_number, '-', 4)
    ELSE '#' || SPLIT_PART(v_order_number, '-', 3)
  END;

  INSERT INTO public.orders (
    merchant_id, location_id, order_number, display_number, order_type, status,
    table_number, customer_name, customer_phone, special_instructions, device_id,
    created_by_staff_id, created_by_user_id, station_id, created_at, updated_at
  ) VALUES (
    p_merchant_id, p_location_id, v_order_number, v_display_number, p_order_type, 'draft',
    p_table_number, p_customer_name, p_customer_phone, p_special_instructions, p_device_id,
    v_verified_staff_id, v_user_id, p_station_id, NOW(), NOW()
  )
  RETURNING id INTO v_order_id;

  INSERT INTO public.audit_logs (
    actor_user_id, organization_id, action, action_category, resource_type, resource_name, metadata, status
  ) VALUES (
    v_user_id,
    (SELECT clerk_org_id FROM public.merchants WHERE id = p_merchant_id),
    'order_created', 'order_management', 'order', v_order_number,
    jsonb_build_object(
      'order_id', v_order_id, 'order_type', p_order_type, 'table_number', p_table_number,
      'location_id', p_location_id, 'station_id', p_station_id
    ),
    'success'
  );

  v_result := jsonb_build_object(
    'success', true, 'order_id', v_order_id,
    'order_number', v_order_number, 'display_number', v_display_number, 'status', 'draft'
  );
  -- END_VERBATIM

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM public._idempotency_complete(p_idempotency_key, 'create_order_v3', v_result);
  END IF;

  RETURN v_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.create_order_v3(uuid, uuid, order_type, text, text, text, text, text, uuid, uuid, uuid) TO authenticated;
