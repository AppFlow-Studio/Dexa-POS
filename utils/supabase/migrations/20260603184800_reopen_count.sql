-- =============================================
-- Migration: Add reopen_count to orders table
-- and update reopen_check RPC to increment it
-- =============================================

-- Add reopen_count column (default 0, not null)
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS reopen_count INTEGER NOT NULL DEFAULT 0;

-- =============================================
-- Updated RPC Function: reopen_check
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
  v_totals JSONB;
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

  -- Enforce max 1 reopen
  IF v_order.reopen_count >= 1 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Check has already been reopened once and cannot be reopened again'
    );
  END IF;

  -- Reopen the check and increment reopen_count
  UPDATE orders
  SET check_status = 'Opened',
      reopen_count = reopen_count + 1,
      payment_status = CASE
        WHEN payment_status = 'paid'::payment_status
          THEN 'partial'::payment_status
        ELSE payment_status
      END,
      updated_at = NOW(),
      sync_version = sync_version + 1
  WHERE id = p_order_id;

  -- Recalculate after leaving the terminal paid state
  SELECT calculate_order_totals_fast(p_order_id) INTO v_totals;

  -- Audit log
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
      'reopen_count', v_order.reopen_count + 1,
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
    'reopen_count', v_order.reopen_count + 1,
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
