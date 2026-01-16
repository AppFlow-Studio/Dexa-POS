-- =============================================
-- RPC Function: reopen_check
-- Description: Reopen a closed check to add more items
-- =============================================

CREATE OR REPLACE FUNCTION reopen_check(
  p_order_id UUID,
  p_staff_id UUID,
  p_reason TEXT DEFAULT NULL
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

  -- Validate check is closed (can't reopen an open check)
  IF v_order.check_status != 'Closed' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Check is not closed'
    );
  END IF;

  -- Reopen the check
  UPDATE orders
  SET check_status = 'Opened',
      payment_status = CASE WHEN amount_paid > 0 THEN 'partial'::payment_status ELSE 'pending'::payment_status END,
      updated_at = NOW(),
      sync_version = sync_version + 1
  WHERE id = p_order_id;

  -- Log the action with reason (audit_logs table expected to exist)
  INSERT INTO audit_logs (
    action,
    resource_type,
    resource_id,
    staff_profile_id,
    changes,
    created_at
  ) VALUES (
    'reopen_check',
    'orders',
    p_order_id,
    p_staff_id,
    jsonb_build_object(
      'check_status', 'Opened',
      'reason', COALESCE(p_reason, 'No reason provided')
    ),
    NOW()
  );

  -- Return success
  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'check_status', 'Opened'
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;
