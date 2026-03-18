-- ============================================================================
-- Cash Drawer RPCs
-- Atomic operations for cash drawer session lifecycle management.
-- ============================================================================

-- ============================================================================
-- 1. open_cash_drawer_session
-- Opens a new session with an opening count operation. Atomic.
-- ============================================================================
CREATE OR REPLACE FUNCTION open_cash_drawer_session(
  p_cash_drawer_id UUID,
  p_merchant_id UUID,
  p_location_id UUID,
  p_opened_by UUID,
  p_opening_amount NUMERIC,
  p_opening_count_details JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session_id UUID;
  v_business_date DATE := CURRENT_DATE;
  v_existing_session UUID;
BEGIN
  -- Verify no open session exists for this drawer
  SELECT id INTO v_existing_session
  FROM cash_drawer_sessions
  WHERE cash_drawer_id = p_cash_drawer_id
    AND status = 'open'
  LIMIT 1;

  IF v_existing_session IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Drawer already has an open session',
      'existing_session_id', v_existing_session
    );
  END IF;

  -- Create session
  INSERT INTO cash_drawer_sessions (
    cash_drawer_id, merchant_id, location_id,
    opened_by, opened_at, opening_amount,
    opening_count_details, opening_count_verified,
    expected_cash, status, business_date
  ) VALUES (
    p_cash_drawer_id, p_merchant_id, p_location_id,
    p_opened_by, NOW(), p_opening_amount,
    p_opening_count_details, (p_opening_count_details IS NOT NULL),
    p_opening_amount, 'open', v_business_date
  )
  RETURNING id INTO v_session_id;

  -- Record opening_count operation
  INSERT INTO cash_drawer_operations (
    cash_drawer_id, session_id, operation_type,
    amount, performed_by, performed_at,
    balance_after
  ) VALUES (
    p_cash_drawer_id, v_session_id, 'opening_count',
    p_opening_amount, p_opened_by, NOW(),
    p_opening_amount
  );

  -- Update drawer status
  UPDATE cash_drawers
  SET is_open = true, current_session_id = v_session_id
  WHERE id = p_cash_drawer_id;

  RETURN jsonb_build_object(
    'success', true,
    'session_id', v_session_id,
    'business_date', v_business_date
  );
END;
$$;

-- ============================================================================
-- 2. close_cash_drawer_session
-- Closes session, calculates expected_cash from SUM of operations. Atomic.
-- Backend-calculated expected_cash is source of truth.
-- ============================================================================
CREATE OR REPLACE FUNCTION close_cash_drawer_session(
  p_session_id UUID,
  p_cash_drawer_id UUID,
  p_closed_by UUID,
  p_closing_amount NUMERIC,
  p_closing_count_details JSONB DEFAULT NULL,
  p_variance_notes TEXT DEFAULT NULL,
  p_is_blind_count BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session RECORD;
  v_expected_cash NUMERIC;
  v_variance NUMERIC;
BEGIN
  -- Get session and verify it's open
  SELECT * INTO v_session
  FROM cash_drawer_sessions
  WHERE id = p_session_id AND status = 'open';

  IF v_session IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Session not found or not open'
    );
  END IF;

  -- Calculate expected_cash from operations (source of truth)
  -- Formula: opening + cash_sales + pay_ins - cash_refunds - pay_outs - cash_drops - tip_outs
  SELECT v_session.opening_amount + COALESCE(SUM(
    CASE
      WHEN operation_type IN ('cash_sale', 'pay_in') THEN amount
      WHEN operation_type IN ('cash_refund', 'pay_out', 'cash_drop', 'tip_out') THEN -amount
      ELSE 0
    END
  ), 0)
  INTO v_expected_cash
  FROM cash_drawer_operations
  WHERE session_id = p_session_id;

  v_variance := p_closing_amount - v_expected_cash;

  -- Record closing_count operation
  INSERT INTO cash_drawer_operations (
    cash_drawer_id, session_id, operation_type,
    amount, performed_by, performed_at,
    balance_after
  ) VALUES (
    p_cash_drawer_id, p_session_id, 'closing_count',
    p_closing_amount, p_closed_by, NOW(),
    v_expected_cash
  );

  -- Update session
  UPDATE cash_drawer_sessions
  SET
    closed_by = p_closed_by,
    closed_at = NOW(),
    closing_amount = p_closing_amount,
    closing_count_details = p_closing_count_details,
    closing_count_verified = (p_closing_count_details IS NOT NULL),
    expected_cash = v_expected_cash,
    variance = v_variance,
    variance_notes = p_variance_notes,
    status = 'closed'
  WHERE id = p_session_id;

  -- Update drawer status
  UPDATE cash_drawers
  SET is_open = false, current_session_id = NULL
  WHERE id = p_cash_drawer_id;

  RETURN jsonb_build_object(
    'success', true,
    'expected_cash', v_expected_cash,
    'closing_amount', p_closing_amount,
    'variance', v_variance
  );
END;
$$;

-- ============================================================================
-- 3. record_cash_operation
-- Validates session is open, calculates balance_after, inserts operation.
-- Returns should_kick_drawer flag for physical drawer open.
-- ============================================================================
CREATE OR REPLACE FUNCTION record_cash_operation(
  p_cash_drawer_id UUID,
  p_session_id UUID,
  p_operation_type TEXT,
  p_amount NUMERIC,
  p_performed_by UUID,
  p_order_id UUID DEFAULT NULL,
  p_payment_id UUID DEFAULT NULL,
  p_reason TEXT DEFAULT NULL,
  p_approved_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session RECORD;
  v_current_balance NUMERIC;
  v_balance_after NUMERIC;
  v_should_kick_drawer BOOLEAN := false;
  v_op_id UUID;
BEGIN
  -- Verify session is open
  SELECT * INTO v_session
  FROM cash_drawer_sessions
  WHERE id = p_session_id AND status = 'open';

  IF v_session IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'No open session found'
    );
  END IF;

  -- Calculate current balance from operations
  SELECT v_session.opening_amount + COALESCE(SUM(
    CASE
      WHEN operation_type IN ('cash_sale', 'pay_in') THEN amount
      WHEN operation_type IN ('cash_refund', 'pay_out', 'cash_drop', 'tip_out') THEN -amount
      ELSE 0
    END
  ), 0)
  INTO v_current_balance
  FROM cash_drawer_operations
  WHERE session_id = p_session_id;

  -- Calculate new balance
  v_balance_after := CASE
    WHEN p_operation_type IN ('cash_sale', 'pay_in') THEN v_current_balance + p_amount
    WHEN p_operation_type IN ('cash_refund', 'pay_out', 'cash_drop', 'tip_out') THEN v_current_balance - p_amount
    ELSE v_current_balance -- no_sale, opening_count, closing_count
  END;

  -- Determine if drawer should be kicked open
  v_should_kick_drawer := p_operation_type IN ('no_sale', 'pay_in', 'pay_out', 'cash_drop');

  -- Insert operation
  INSERT INTO cash_drawer_operations (
    cash_drawer_id, session_id, operation_type,
    amount, performed_by, performed_at,
    order_id, payment_id, balance_after,
    reason, approved_by
  ) VALUES (
    p_cash_drawer_id, p_session_id, p_operation_type,
    p_amount, p_performed_by, NOW(),
    p_order_id, p_payment_id, v_balance_after,
    p_reason, p_approved_by
  )
  RETURNING id INTO v_op_id;

  -- Update session expected_cash for balance-affecting operations
  IF p_operation_type NOT IN ('no_sale', 'opening_count', 'closing_count') THEN
    UPDATE cash_drawer_sessions
    SET expected_cash = v_balance_after
    WHERE id = p_session_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'operation_id', v_op_id,
    'balance_after', v_balance_after,
    'should_kick_drawer', v_should_kick_drawer
  );
END;
$$;

-- ============================================================================
-- 4. get_eod_cash_summary
-- Per-drawer breakdown + grand totals for a location on a given date.
-- ============================================================================
CREATE OR REPLACE FUNCTION get_eod_cash_summary(
  p_location_id UUID,
  p_business_date DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_drawers JSONB := '[]'::JSONB;
  v_grand_totals JSONB;
  v_drawer RECORD;
  v_ops RECORD;
  v_no_sale_audit JSONB;
BEGIN
  -- Per-drawer breakdown
  FOR v_drawer IN
    SELECT
      s.id AS session_id,
      d.id AS drawer_id,
      d.name AS drawer_name,
      s.opened_by,
      s.closed_by,
      s.opened_at,
      s.closed_at,
      s.opening_amount,
      s.closing_amount,
      s.expected_cash,
      s.variance,
      s.status
    FROM cash_drawer_sessions s
    JOIN cash_drawers d ON d.id = s.cash_drawer_id
    WHERE s.location_id = p_location_id
      AND s.business_date = p_business_date
    ORDER BY s.opened_at
  LOOP
    -- Get operation breakdown for this session
    SELECT
      COALESCE(SUM(CASE WHEN operation_type = 'cash_sale' THEN amount ELSE 0 END), 0) AS cash_sales,
      COALESCE(SUM(CASE WHEN operation_type = 'cash_refund' THEN amount ELSE 0 END), 0) AS cash_refunds,
      COALESCE(SUM(CASE WHEN operation_type = 'pay_in' THEN amount ELSE 0 END), 0) AS pay_ins,
      COALESCE(SUM(CASE WHEN operation_type = 'pay_out' THEN amount ELSE 0 END), 0) AS pay_outs,
      COALESCE(SUM(CASE WHEN operation_type = 'cash_drop' THEN amount ELSE 0 END), 0) AS cash_drops,
      COALESCE(SUM(CASE WHEN operation_type = 'tip_out' THEN amount ELSE 0 END), 0) AS tip_outs,
      COUNT(CASE WHEN operation_type = 'no_sale' THEN 1 END) AS no_sale_count
    INTO v_ops
    FROM cash_drawer_operations
    WHERE session_id = v_drawer.session_id;

    v_drawers := v_drawers || jsonb_build_object(
      'session_id', v_drawer.session_id,
      'drawer_id', v_drawer.drawer_id,
      'drawer_name', v_drawer.drawer_name,
      'opened_at', v_drawer.opened_at,
      'closed_at', v_drawer.closed_at,
      'opening_amount', v_drawer.opening_amount,
      'closing_amount', v_drawer.closing_amount,
      'expected_cash', v_drawer.expected_cash,
      'variance', v_drawer.variance,
      'status', v_drawer.status,
      'cash_sales', v_ops.cash_sales,
      'cash_refunds', v_ops.cash_refunds,
      'pay_ins', v_ops.pay_ins,
      'pay_outs', v_ops.pay_outs,
      'cash_drops', v_ops.cash_drops,
      'tip_outs', v_ops.tip_outs,
      'no_sale_count', v_ops.no_sale_count
    );
  END LOOP;

  -- Grand totals across all drawers
  SELECT jsonb_build_object(
    'total_opening', COALESCE(SUM(s.opening_amount), 0),
    'total_closing', COALESCE(SUM(s.closing_amount), 0),
    'total_expected', COALESCE(SUM(s.expected_cash), 0),
    'total_variance', COALESCE(SUM(s.variance), 0),
    'sessions_count', COUNT(*),
    'sessions_still_open', COUNT(CASE WHEN s.status = 'open' THEN 1 END)
  )
  INTO v_grand_totals
  FROM cash_drawer_sessions s
  WHERE s.location_id = p_location_id
    AND s.business_date = p_business_date;

  -- No Sale audit by employee
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::JSONB)
  INTO v_no_sale_audit
  FROM (
    SELECT
      o.performed_by,
      COUNT(*) AS no_sale_count
    FROM cash_drawer_operations o
    JOIN cash_drawer_sessions s ON s.id = o.session_id
    WHERE s.location_id = p_location_id
      AND s.business_date = p_business_date
      AND o.operation_type = 'no_sale'
    GROUP BY o.performed_by
    ORDER BY no_sale_count DESC
  ) t;

  RETURN jsonb_build_object(
    'drawers', v_drawers,
    'grand_totals', v_grand_totals,
    'no_sale_audit', v_no_sale_audit,
    'business_date', p_business_date
  );
END;
$$;
