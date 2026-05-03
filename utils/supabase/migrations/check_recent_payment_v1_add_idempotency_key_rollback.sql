-- Rollback for check_recent_payment_v1_add_idempotency_key.sql
-- Re-applies the original v1 body (without idempotency_key in SELECT or
-- returned jsonb). Safe to run while clients use the old shape.

CREATE OR REPLACE FUNCTION public.check_recent_payment(
  p_order_id UUID,
  p_lookback_seconds INTEGER DEFAULT 120,
  p_amount_cents BIGINT DEFAULT NULL,
  p_split_portion_index INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment RECORD;
  v_merchant_id UUID;
  v_location_ids UUID[];
BEGIN
  v_merchant_id := user_merchant_id();
  v_location_ids := user_location_ids();
  IF v_merchant_id IS NULL OR v_location_ids IS NULL OR cardinality(v_location_ids) = 0 THEN
    RAISE EXCEPTION 'check_recent_payment: missing merchant/location context — cannot verify'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT
    op.id,
    op.captured_at,
    op.amount,
    op.tip_amount,
    op.payment_method,
    op.reference_number,
    op.card_last_four,
    op.status,
    op.split_portion_index,
    op.split_count
  INTO v_payment
  FROM public.order_payments op
  JOIN public.orders o ON o.id = op.order_id
  WHERE op.order_id = p_order_id
    AND o.merchant_id = v_merchant_id
    AND o.location_id = ANY(v_location_ids)
    AND op.captured_at > now() - (p_lookback_seconds || ' seconds')::INTERVAL
    AND (p_amount_cents IS NULL OR (op.amount * 100)::BIGINT = p_amount_cents)
    AND (p_split_portion_index IS NULL OR op.split_portion_index = p_split_portion_index)
    AND op.status::text IN ('captured', 'partially_refunded', 'refunded')
    AND COALESCE(op.is_voided, false) = false
  ORDER BY op.captured_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('matched', false);
  END IF;

  RETURN jsonb_build_object(
    'matched', true,
    'payment_id', v_payment.id,
    'captured_at', v_payment.captured_at,
    'amount', v_payment.amount,
    'tip_amount', v_payment.tip_amount,
    'payment_method', v_payment.payment_method,
    'reference_number', v_payment.reference_number,
    'card_last_four', v_payment.card_last_four,
    'status', v_payment.status,
    'split_portion_index', v_payment.split_portion_index,
    'split_count', v_payment.split_count
  );
END;
$$;
