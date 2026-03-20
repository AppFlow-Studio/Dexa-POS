-- ============================================================
-- Pre-Auth Payment Functions v1
-- ============================================================
-- Supports pre-authorization, capture, increment, and void flows
-- for bar-tab / dine-in workflows.
-- ============================================================

-- ============================================================
-- 1. process_preauth_v1
-- ============================================================
-- Creates an authorized (held) payment on an order.
-- Does NOT modify orders.amount_paid or amount_due (hold ≠ payment).
-- Enforces one active pre-auth per order.
-- ============================================================

CREATE OR REPLACE FUNCTION process_preauth_v1(
  p_order_id UUID,
  p_amount NUMERIC,
  p_terminal_response JSONB DEFAULT NULL,
  p_staff_id UUID DEFAULT NULL,
  p_terminal_type TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order RECORD;
  v_existing_auth_count INT;
  v_payment_id UUID;
  v_rrn TEXT;
  v_auth_code TEXT;
  v_ref_id TEXT;
  v_card_type TEXT;
  v_card_last_four TEXT;
BEGIN
  -- Validate order exists and is active
  SELECT id, status, location_id
  INTO v_order
  FROM orders
  WHERE id = p_order_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  IF v_order.status IN ('completed', 'cancelled', 'refunded', 'void') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order is not active');
  END IF;

  -- Guard: reject if order already has an active pre-auth
  SELECT COUNT(*)
  INTO v_existing_auth_count
  FROM order_payments
  WHERE order_id = p_order_id
    AND status = 'authorized'
    AND (is_voided IS NULL OR is_voided = false);

  IF v_existing_auth_count > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order already has an active pre-authorization');
  END IF;

  -- Extract terminal reference fields
  v_rrn := COALESCE(
    p_terminal_response->'castles_transaction'->>'rrn',
    p_terminal_response->>'rrn',
    ''
  );
  v_auth_code := COALESCE(
    p_terminal_response->'castles_transaction'->>'approvalCode',
    p_terminal_response->>'AuthCode',
    ''
  );
  v_ref_id := COALESCE(
    p_terminal_response->'castles_transaction'->>'referenceId',
    p_terminal_response->>'ReferenceId',
    ''
  );

  -- Extract card details from terminal response
  v_card_type := COALESCE(
    p_terminal_response->'castles_transaction'->>'cardType',
    p_terminal_response->'raw_castles_response'->>'txnCardBrand',
    p_terminal_response->'dejavoo_transaction'->>'CardType',
    NULL
  );
  v_card_last_four := COALESCE(
    p_terminal_response->'castles_transaction'->>'cardLast4',
    p_terminal_response->'dejavoo_transaction'->>'Last4',
    NULL
  );

  -- Insert authorized payment
  INSERT INTO order_payments (
    order_id,
    payment_method,
    amount,
    tip_amount,
    total_amount,
    status,
    authorized_at,
    captured_at,
    rrn,
    authorization_code,
    reference_number,
    terminal_response,
    processed_by_staff_id,
    terminal_type,
    card_type,
    card_last_four
  ) VALUES (
    p_order_id,
    'card',
    p_amount,
    0,
    p_amount,
    'authorized',
    NOW(),
    NULL,
    v_rrn,
    v_auth_code,
    v_ref_id,
    p_terminal_response,
    p_staff_id,
    COALESCE(p_terminal_type, CASE
      WHEN p_terminal_response ? 'castles_transaction' THEN 'castles'
      ELSE 'dejavoo'
    END)::terminal_type,
    v_card_type,
    v_card_last_four
  )
  RETURNING id INTO v_payment_id;

  RETURN jsonb_build_object(
    'success', true,
    'payment_id', v_payment_id,
    'authorized_amount', p_amount,
    'rrn', v_rrn,
    'auth_code', v_auth_code
  );
END;
$$;

-- ============================================================
-- 2. capture_preauth_v1
-- ============================================================
-- Captures a previously authorized payment. NOW updates
-- orders.amount_paid, amount_due, and marks items paid.
-- ============================================================

CREATE OR REPLACE FUNCTION capture_preauth_v1(
  p_payment_id UUID,
  p_capture_amount NUMERIC,
  p_tip_amount NUMERIC DEFAULT 0,
  p_terminal_response JSONB DEFAULT NULL,
  p_staff_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_payment RECORD;
  v_order RECORD;
  v_total_collected NUMERIC;
  v_new_amount_paid NUMERIC;
  v_new_amount_due NUMERIC;
  v_order_fully_paid BOOLEAN;
  v_new_paid_status TEXT;
BEGIN
  -- Validate payment exists and is authorized
  SELECT id, order_id, amount, status
  INTO v_payment
  FROM order_payments
  WHERE id = p_payment_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment not found');
  END IF;

  IF v_payment.status <> 'authorized' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment is not in authorized status');
  END IF;

  -- Get order for totals update
  SELECT id, total_amount, amount_paid, amount_due
  INTO v_order
  FROM orders
  WHERE id = v_payment.order_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  v_total_collected := p_capture_amount + COALESCE(p_tip_amount, 0);

  -- Update payment to captured
  UPDATE order_payments
  SET
    status = 'captured',
    amount = p_capture_amount,
    tip_amount = COALESCE(p_tip_amount, 0),
    total_amount = v_total_collected,
    captured_at = NOW(),
    terminal_response = COALESCE(p_terminal_response, terminal_response)
  WHERE id = p_payment_id;

  -- NOW update order totals (capture = real payment)
  v_new_amount_paid := COALESCE(v_order.amount_paid, 0) + p_capture_amount;
  v_new_amount_due := GREATEST(COALESCE(v_order.total_amount, 0) - v_new_amount_paid, 0);
  v_order_fully_paid := v_new_amount_due <= 0;

  -- Determine paid_status
  IF v_order_fully_paid THEN
    v_new_paid_status := 'paid';
  ELSIF v_new_amount_paid > 0 THEN
    v_new_paid_status := 'partial';
  ELSE
    v_new_paid_status := 'pending';
  END IF;

  UPDATE orders
  SET
    amount_paid = v_new_amount_paid,
    amount_due = v_new_amount_due,
    payment_status = v_new_paid_status::payment_status,
    check_status = CASE WHEN v_order_fully_paid THEN 'Closed' ELSE check_status END,
    sync_version = sync_version + 1
  WHERE id = v_payment.order_id;

  -- Mark all items as paid if order is fully covered
  IF v_order_fully_paid THEN
    UPDATE order_items
    SET paid_quantity = quantity,
        payment_id = p_payment_id
    WHERE order_id = v_payment.order_id
      AND (paid_quantity IS NULL OR paid_quantity < quantity)
      AND (is_voided IS NULL OR is_voided = false);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'payment_id', p_payment_id,
    'captured_amount', p_capture_amount,
    'tip_amount', COALESCE(p_tip_amount, 0),
    'order_fully_paid', v_order_fully_paid,
    'order_amount_due', v_new_amount_due
  );
END;
$$;

-- ============================================================
-- 3. update_preauth_amount_v1
-- ============================================================
-- Updates the authorized hold amount (for incremental auth).
-- ============================================================

CREATE OR REPLACE FUNCTION update_preauth_amount_v1(
  p_payment_id UUID,
  p_new_amount NUMERIC,
  p_terminal_response JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_payment RECORD;
BEGIN
  -- Validate payment exists and is authorized
  SELECT id, status, amount
  INTO v_payment
  FROM order_payments
  WHERE id = p_payment_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment not found');
  END IF;

  IF v_payment.status <> 'authorized' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment is not in authorized status');
  END IF;

  -- Update authorized amount
  UPDATE order_payments
  SET
    amount = p_new_amount,
    total_amount = p_new_amount,
    terminal_response = CASE
      WHEN p_terminal_response IS NOT NULL THEN p_terminal_response
      ELSE terminal_response
    END
  WHERE id = p_payment_id;

  RETURN jsonb_build_object(
    'success', true,
    'payment_id', p_payment_id,
    'new_authorized_amount', p_new_amount
  );
END;
$$;

-- ============================================================
-- 4. void_preauth_v1
-- ============================================================
-- Voids a pre-authorized payment (releases the hold).
-- ============================================================

CREATE OR REPLACE FUNCTION void_preauth_v1(
  p_payment_id UUID,
  p_staff_id UUID DEFAULT NULL,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_payment RECORD;
BEGIN
  -- Validate payment exists and is authorized
  SELECT id, status, order_id
  INTO v_payment
  FROM order_payments
  WHERE id = p_payment_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment not found');
  END IF;

  IF v_payment.status <> 'authorized' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment is not in authorized status');
  END IF;

  -- Void the payment
  UPDATE order_payments
  SET
    status = 'void',
    is_voided = true,
    voided_at = NOW(),
    void_reason = p_reason,
    voided_by = p_staff_id
  WHERE id = p_payment_id;

  RETURN jsonb_build_object(
    'success', true,
    'payment_id', p_payment_id
  );
END;
$$;
