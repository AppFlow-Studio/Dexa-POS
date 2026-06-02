-- Reopening a settled check must leave the terminal paid state before totals
-- are recalculated. calculate_order_totals_fast intentionally clamps paid
-- orders to zero; keeping payment_status='paid' made later item additions
-- non-payable and process_payment rejected them as already fully paid.

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
  v_totals JSONB;
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

  IF v_order.check_status != 'Closed' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Check is not closed'
    );
  END IF;

  UPDATE orders
  SET check_status = 'Opened',
      payment_status = CASE
        WHEN payment_status = 'paid'::payment_status
          THEN 'partial'::payment_status
        ELSE payment_status
      END,
      updated_at = NOW(),
      sync_version = sync_version + 1
  WHERE id = p_order_id;

  SELECT calculate_order_totals_fast(p_order_id) INTO v_totals;

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
      'payment_status', CASE
        WHEN v_order.payment_status = 'paid'::payment_status
          THEN 'partial'
        ELSE v_order.payment_status::TEXT
      END,
      'reason', COALESCE(p_reason, 'No reason provided')
    ),
    NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'check_status', 'Opened',
    'payment_status', CASE
      WHEN v_order.payment_status = 'paid'::payment_status
        THEN 'partial'
      ELSE v_order.payment_status::TEXT
    END,
    'amount_due', COALESCE((v_totals->>'amount_due')::NUMERIC, 0),
    'cash_amount_due', COALESCE((v_totals->>'cash_amount_due')::NUMERIC, 0)
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;
