-- =============================================
-- RPC Function: close_check
-- Description: Explicitly close a check after full payment
-- =============================================

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
  v_result JSONB;
BEGIN
  -- Lock and fetch order
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

  -- Validate order is fully paid
  IF v_order.amount_due > 0.01 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Cannot close check with outstanding balance',
      'amount_due', v_order.amount_due
    );
  END IF;

  -- Validate check is not already closed
  IF v_order.check_status = 'Closed' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Check is already closed'
    );
  END IF;

  -- Close the check
  UPDATE orders
  SET check_status = 'Closed',
      updated_at = NOW(),
      sync_version = sync_version + 1
  WHERE id = p_order_id;

  -- Log the action (audit_logs table expected to exist)
  INSERT INTO audit_logs (
    action_type,
    table_name,
    record_id,
    staff_id,
    new_values,
    created_at
  ) VALUES (
    'close_check',
    'orders',
    p_order_id,
    p_staff_id,
    jsonb_build_object('check_status', 'Closed'),
    NOW()
  );

  -- Return success
  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'check_status', 'Closed'
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;
