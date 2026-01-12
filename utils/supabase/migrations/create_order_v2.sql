-- Migration: 20260112_add_create_order_function.sql

CREATE OR REPLACE FUNCTION create_order_v2(
  p_merchant_id UUID,
  p_location_id UUID,
  p_order_type::order_type,
  p_table_number TEXT,
  p_customer_name TEXT,
  p_customer_phone TEXT,
  p_special_instructions TEXT,
  p_device_id TEXT,
  p_created_by_staff_id UUID,
  p_station_id UUID DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_order_id UUID;
  v_order_number TEXT;
  v_display_number TEXT;
  v_user_id TEXT;
  v_result JSON;
  v_verified_staff_id UUID; -- Variable to hold the safe staff ID
BEGIN
  -- Get current user ID from Clerk JWT
  v_user_id := get_my_claim('sub');
  
  -- Verify user has access to this location
  IF NOT (p_location_id = ANY(user_location_ids())) THEN
    RAISE EXCEPTION 'Access denied: User does not have access to location';
  END IF;
  
  -- Verify user has permission to manage orders
  -- IF NOT has_permission('location.orders.manage') THEN
  --   RAISE EXCEPTION 'Permission denied: location.orders.manage required';
  -- END IF;
  
  -- Verify merchant_id matches user's merchant
  IF p_merchant_id != user_merchant_id() THEN
    RAISE EXCEPTION 'Access denied: Invalid merchant_id';
  END IF;

  -- Safe Staff ID Validation
  -- ---------------------------------------------------------
  -- Initialize with the passed value
  v_verified_staff_id := p_created_by_staff_id;

  -- If a staff ID was provided, verify it exists in the database
  IF v_verified_staff_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.staff_profiles WHERE id = v_verified_staff_id) THEN
      -- If not found, set to NULL to prevent FK violation error
      v_verified_staff_id := NULL;
    END IF;
  END IF;


  
  -- Generate order number
  v_order_number := public.generate_order_number(p_location_id);
  
  -- Generate display number (just the sequence part)
  v_display_number := '#' || SPLIT_PART(v_order_number, '-', 3);
  
  -- Create the order
  INSERT INTO public.orders (
    merchant_id,
    location_id,
    order_number,
    display_number,
    order_type,
    status,
    table_number,
    customer_name,
    customer_phone,
    special_instructions,
    device_id,
    created_by_staff_id,
    created_by_user_id,
    station_id,
    created_at,
    updated_at
  ) VALUES (
    p_merchant_id,
    p_location_id,
    v_order_number,
    v_display_number,
    p_order_type::order_type,
    'draft',
    p_table_number,
    p_customer_name,
    p_customer_phone,
    p_special_instructions,
    p_device_id,
    v_verified_staff_id,
    v_user_id,
    p_station_id,
    NOW(),
    NOW()
  )
  RETURNING id INTO v_order_id;
  
  -- Log to audit
  INSERT INTO public.audit_logs (
    actor_user_id,
    organization_id,
    action,
    action_category,
    resource_type,
    resource_name,
    metadata,
    status
  ) VALUES (
    v_user_id,
    (SELECT clerk_org_id FROM public.merchants WHERE id = p_merchant_id),
    'order_created',
    'order_management',
    'order',
    v_order_number,
    jsonb_build_object(
      'order_id', v_order_id,
      'order_type', p_order_type,
      'table_number', p_table_number,
      'location_id', p_location_id,
      'station_id', p_station_id
    ),
    'success'
  );
  
  -- Return order details
  SELECT json_build_object(
    'success', true,
    'order_id', v_order_id,
    'order_number', v_order_number,
    'display_number', v_display_number,
    'status', 'draft'
  ) INTO v_result;
  
  RETURN v_result;
END;