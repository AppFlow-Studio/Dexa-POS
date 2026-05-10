CREATE OR REPLACE FUNCTION close_check(
  p_order_id UUID,
  p_staff_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order RECORD;
BEGIN
  SELECT * INTO v_order
  FROM orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Order not found'
    );
  END IF;

  IF v_order.check_status = 'Closed' THEN
    RETURN jsonb_build_object(
      'success', true,
      'order_id', p_order_id,
      'check_status', 'Closed',
      'noop', true
    );
  END IF;

  UPDATE orders
  SET check_status = 'Closed',
      updated_at = NOW(),
      sync_version = sync_version + 1
  WHERE id = p_order_id;

  INSERT INTO audit_logs (
    action,
    resource_type,
    resource_id,
    staff_profile_id,
    changes,
    created_at
  ) VALUES (
    'close_check',
    'orders',
    p_order_id,
    p_staff_id,
    jsonb_build_object('check_status', 'Closed'),
    NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'check_status', 'Closed',
    'noop', false
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;
