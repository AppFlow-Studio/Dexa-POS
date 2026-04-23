-- ============================================================================
-- Cash Drawer RPCs v2
-- Enhanced EOD summary with per-event no-sale timeline.
-- New variance analysis RPC with suspicious pattern detection.
-- Server-side dual-logging of no-sale events to audit_logs.
-- ============================================================================

-- ============================================================================
-- 1. Enhanced record_cash_operation — adds atomic audit_logs insert for no-sale
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

  -- Dual-log no-sale events to audit_logs (atomic, server-side)
  IF p_operation_type = 'no_sale' THEN
    INSERT INTO audit_logs (
      action,
      action_category,
      severity,
      resource_type,
      resource_id,
      resource_name,
      staff_profile_id,
      location_id,
      merchant_id,
      metadata,
      status
    ) VALUES (
      'cash_drawer_no_sale',
      'cash_management',
      'warning',
      'cash_drawer_operation',
      v_op_id,
      'No Sale - Drawer Pop',
      p_performed_by,
      v_session.location_id,
      v_session.merchant_id,
      jsonb_build_object(
        'session_id', p_session_id,
        'cash_drawer_id', p_cash_drawer_id,
        'reason', COALESCE(p_reason, 'none'),
        'approved_by', p_approved_by,
        'balance_at_time', v_balance_after
      ),
      'success'
    );
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
-- 2. Enhanced get_eod_cash_summary — detailed no-sale timeline with timestamps
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

  -- Grand totals
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

  -- Enhanced: No-sale audit with per-event timestamps + reasons
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::JSONB)
  INTO v_no_sale_audit
  FROM (
    SELECT
      o.performed_by,
      sp.display_name AS performed_by_name,
      COUNT(*) AS no_sale_count,
      jsonb_agg(
        jsonb_build_object(
          'id', o.id,
          'performed_at', o.performed_at,
          'reason', o.reason,
          'approved_by', o.approved_by,
          'session_id', o.session_id
        )
        ORDER BY o.performed_at
      ) AS events
    FROM cash_drawer_operations o
    JOIN cash_drawer_sessions s ON s.id = o.session_id
    LEFT JOIN staff_profiles sp ON sp.id = o.performed_by
    WHERE s.location_id = p_location_id
      AND s.business_date = p_business_date
      AND o.operation_type = 'no_sale'
    GROUP BY o.performed_by, sp.display_name
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

-- ============================================================================
-- 3. NEW: get_session_variance_analysis
-- Deep-dive per-session analysis with operation timeline, running balance,
-- and suspicious pattern detection for timestamp narrowing.
-- ============================================================================
CREATE OR REPLACE FUNCTION get_session_variance_analysis(
  p_session_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session RECORD;
  v_timeline JSONB;
  v_no_sale_events JSONB;
  v_suspicious JSONB := '[]'::JSONB;
  v_nosale RECORD;
  v_related RECORD;
BEGIN
  -- Get session summary
  SELECT
    s.id,
    s.opening_amount,
    s.closing_amount,
    s.expected_cash,
    s.variance,
    s.opened_at,
    s.closed_at,
    s.opened_by,
    s.closed_by,
    s.status,
    s.is_blind_count,
    d.name AS drawer_name
  INTO v_session
  FROM cash_drawer_sessions s
  JOIN cash_drawers d ON d.id = s.cash_drawer_id
  WHERE s.id = p_session_id;

  IF v_session IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Session not found');
  END IF;

  -- Full operations timeline with running balance (window function)
  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.performed_at), '[]'::JSONB)
  INTO v_timeline
  FROM (
    SELECT
      o.id,
      o.operation_type,
      o.amount,
      o.balance_after,
      o.performed_by,
      sp.display_name AS performed_by_name,
      o.performed_at,
      o.reason,
      o.approved_by,
      o.order_id,
      o.payment_id,
      -- Running balance via window function
      v_session.opening_amount + SUM(
        CASE
          WHEN o.operation_type IN ('cash_sale', 'pay_in') THEN o.amount
          WHEN o.operation_type IN ('cash_refund', 'pay_out', 'cash_drop', 'tip_out') THEN -o.amount
          ELSE 0
        END
      ) OVER (ORDER BY o.performed_at ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
        AS running_balance
    FROM cash_drawer_operations o
    LEFT JOIN staff_profiles sp ON sp.id = o.performed_by
    WHERE o.session_id = p_session_id
    ORDER BY o.performed_at
  ) t;

  -- Filtered no-sale events
  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.performed_at), '[]'::JSONB)
  INTO v_no_sale_events
  FROM (
    SELECT
      o.id,
      o.performed_by,
      sp.display_name AS performed_by_name,
      o.performed_at,
      o.reason,
      o.approved_by
    FROM cash_drawer_operations o
    LEFT JOIN staff_profiles sp ON sp.id = o.performed_by
    WHERE o.session_id = p_session_id
      AND o.operation_type = 'no_sale'
    ORDER BY o.performed_at
  ) t;

  -- Suspicious pattern detection:
  -- For each no-sale, look for unexplained pay_outs/cash_drops within +/- 30 min
  FOR v_nosale IN
    SELECT id, performed_at, performed_by, reason
    FROM cash_drawer_operations
    WHERE session_id = p_session_id
      AND operation_type = 'no_sale'
  LOOP
    FOR v_related IN
      SELECT id, operation_type, amount, performed_at, reason, performed_by
      FROM cash_drawer_operations
      WHERE session_id = p_session_id
        AND operation_type IN ('pay_out', 'cash_drop')
        AND ABS(EXTRACT(EPOCH FROM (performed_at - v_nosale.performed_at))) <= 1800
        AND (reason IS NULL OR TRIM(reason) = '')
    LOOP
      v_suspicious := v_suspicious || jsonb_build_object(
        'flag_type', 'nosale_near_unexplained_payout',
        'no_sale_op_id', v_nosale.id,
        'related_op_id', v_related.id,
        'time_gap_seconds', EXTRACT(EPOCH FROM (v_related.performed_at - v_nosale.performed_at)),
        'description', format(
          'No-sale at %s near unexplained %s of $%s at %s',
          to_char(v_nosale.performed_at, 'HH12:MIpm'),
          v_related.operation_type,
          v_related.amount,
          to_char(v_related.performed_at, 'HH12:MIpm')
        )
      );
    END LOOP;
  END LOOP;

  -- Flag: session has negative variance + no-sale events with no corresponding logged expense
  IF v_session.variance IS NOT NULL AND v_session.variance < 0 THEN
    FOR v_nosale IN
      SELECT o.id, o.performed_at, o.performed_by, sp.display_name
      FROM cash_drawer_operations o
      LEFT JOIN staff_profiles sp ON sp.id = o.performed_by
      WHERE o.session_id = p_session_id
        AND o.operation_type = 'no_sale'
    LOOP
      -- Check if there's ANY documented pay_out/cash_drop near this no-sale
      IF NOT EXISTS (
        SELECT 1 FROM cash_drawer_operations
        WHERE session_id = p_session_id
          AND operation_type IN ('pay_out', 'cash_drop')
          AND ABS(EXTRACT(EPOCH FROM (performed_at - v_nosale.performed_at))) <= 1800
      ) THEN
        v_suspicious := v_suspicious || jsonb_build_object(
          'flag_type', 'nosale_during_negative_variance',
          'no_sale_op_id', v_nosale.id,
          'related_op_id', NULL,
          'time_gap_seconds', 0,
          'description', format(
            'No-sale by %s at %s during session with $%s variance — no logged expense nearby',
            COALESCE(v_nosale.display_name, 'Unknown'),
            to_char(v_nosale.performed_at, 'HH12:MIpm'),
            ABS(v_session.variance)
          )
        );
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'session_summary', jsonb_build_object(
      'session_id', v_session.id,
      'drawer_name', v_session.drawer_name,
      'opening_amount', v_session.opening_amount,
      'closing_amount', v_session.closing_amount,
      'expected_cash', v_session.expected_cash,
      'variance', v_session.variance,
      'opened_at', v_session.opened_at,
      'closed_at', v_session.closed_at,
      'opened_by', v_session.opened_by,
      'closed_by', v_session.closed_by,
      'status', v_session.status,
      'is_blind_count', v_session.is_blind_count
    ),
    'operations_timeline', v_timeline,
    'no_sale_events', v_no_sale_events,
    'suspicious_patterns', v_suspicious
  );
END;
$$;
