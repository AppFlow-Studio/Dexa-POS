-- ============================================================
-- settle_castles_batch: Atomic settlement RPC
-- ============================================================
-- Inserts a settlement_batches record and marks all unsettled
-- order_payments for the terminal as settled in a single transaction.
-- ============================================================

CREATE OR REPLACE FUNCTION settle_castles_batch(
  p_location_id    UUID,
  p_terminal_id    UUID,
  p_business_date  DATE,
  p_batch_id       TEXT DEFAULT NULL,  -- batch number from terminal (may be null)
  p_raw_response   JSONB DEFAULT NULL, -- full terminal response for audit
  p_sales_count    INT DEFAULT 0,
  p_refund_count   INT DEFAULT 0,
  p_gross_amount   NUMERIC DEFAULT 0,
  p_refund_amount  NUMERIC DEFAULT 0,
  p_tip_amount     NUMERIC DEFAULT 0,
  p_net_deposit    NUMERIC DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_batch_uuid  UUID;
  v_payments_updated INT;
BEGIN
  -- 1) Insert settlement_batches record
  INSERT INTO settlement_batches (
    location_id,
    terminal_id,
    business_date,
    opened_at,
    closed_at,
    status,
    sales_count,
    refund_count,
    transaction_count,
    gross_amount,
    refund_amount,
    tip_amount,
    net_deposit,
    raw_response
  ) VALUES (
    p_location_id,
    p_terminal_id,
    p_business_date,
    NOW(),
    NOW(),
    'closed',
    p_sales_count,
    p_refund_count,
    p_sales_count + p_refund_count,
    p_gross_amount,
    p_refund_amount,
    p_tip_amount,
    p_net_deposit,
    p_raw_response
  )
  RETURNING batch_id INTO v_batch_uuid;

  -- 2) Mark all unsettled payments for this terminal as settled
  UPDATE order_payments
  SET
    is_settled   = TRUE,
    settled_at   = NOW(),
    batch_number = COALESCE(p_batch_id, v_batch_uuid::TEXT)
  WHERE
    terminal_id = p_terminal_id
    AND (is_settled IS NULL OR is_settled = FALSE)
    AND status IN ('captured', 'refunded', 'partially_refunded');

  GET DIAGNOSTICS v_payments_updated = ROW_COUNT;

  -- 3) Update terminal's batch number
  UPDATE payment_terminals
  SET
    castles_batch_number = COALESCE(p_batch_id, v_batch_uuid::TEXT),
    updated_at = NOW()
  WHERE id = p_terminal_id;

  RETURN jsonb_build_object(
    'batch_uuid', v_batch_uuid,
    'payments_updated', v_payments_updated
  );
END;
$$;
