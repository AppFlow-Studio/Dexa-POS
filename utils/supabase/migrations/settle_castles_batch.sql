-- ============================================================
-- settle_castles_batch: Atomic settlement RPC
-- ============================================================
-- Inserts a settlement_batches record and marks all unsettled
-- order_payments for the terminal as settled in a single transaction.
--
-- Column types in live DB:
--   order_payments.terminal_id      = TEXT  (not UUID!)
--   payment_terminals.id            = UUID
--   settlement_batches.batch_id     = VARCHAR
--   settlement_batches.terminal_id  = VARCHAR
--   settlement_batches.location_id  = UUID
--   settlement_batches.merchant_id  = UUID
-- ============================================================

CREATE OR REPLACE FUNCTION settle_castles_batch(
  p_location_id    TEXT,
  p_terminal_id    TEXT,
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
  v_location_id      UUID    := p_location_id::uuid;
  v_terminal_id      UUID    := p_terminal_id::uuid;
  v_batch_id         TEXT;   -- returned from settlement_batches (varchar col)
  v_payments_updated INT;
  v_merchant_id      UUID;
  v_batch_number     TEXT;   -- final batch number: p_batch_id OR generated id
BEGIN
  -- 0) Resolve merchant_id from location
  SELECT merchant_id INTO v_merchant_id
  FROM locations
  WHERE id = v_location_id;

  IF v_merchant_id IS NULL THEN
    RAISE EXCEPTION 'settle_castles_batch: could not resolve merchant_id for location %', v_location_id;
  END IF;

  -- 1) Insert settlement_batches record
  --    batch_id (varchar) gets gen_random_uuid() auto-cast to text
  --    terminal_id (varchar) gets v_terminal_id::text
  INSERT INTO settlement_batches (
    batch_id,
    location_id,
    merchant_id,
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
    gen_random_uuid()::TEXT,
    v_location_id,
    v_merchant_id,
    v_terminal_id::TEXT,
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
  RETURNING batch_id INTO v_batch_id;

  -- Standardized batch number: terminal's batch number if provided, else our generated id
  v_batch_number := COALESCE(p_batch_id, v_batch_id);

  -- 2) Mark all unsettled payments for this terminal as settled
  --    order_payments.terminal_id is TEXT, so compare as text
  UPDATE order_payments
  SET
    is_settled   = TRUE,
    settled_at   = NOW(),
    batch_number = v_batch_number
  WHERE
    terminal_id = v_terminal_id::TEXT
    AND (is_settled IS NULL OR is_settled = FALSE)
    AND status IN ('captured', 'refunded', 'partially_refunded');

  GET DIAGNOSTICS v_payments_updated = ROW_COUNT;

  -- 3) Update terminal's batch number
  --    payment_terminals.id is UUID, castles_batch_number is TEXT
  UPDATE payment_terminals
  SET
    castles_batch_number = v_batch_number,
    updated_at = NOW()
  WHERE id = v_terminal_id;

  RETURN jsonb_build_object(
    'batch_uuid', v_batch_id,
    'payments_updated', v_payments_updated
  );
END;
$$;
