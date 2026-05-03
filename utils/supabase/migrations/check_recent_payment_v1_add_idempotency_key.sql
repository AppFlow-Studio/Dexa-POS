-- =====================================================================
-- Migration: check_recent_payment_v1_add_idempotency_key
-- =====================================================================
-- In-place additive update to public.check_recent_payment. Same
-- signature, same conservative semantics — adds the new
-- order_payments.idempotency_key column to the SELECT and the returned
-- jsonb so the recovery UI can disambiguate "we wrote this payment
-- ourselves but the response was lost" (matching key) from "another
-- station/journal entry wrote it" (mismatching key) before adopting.
--
-- Non-breaking: older clients ignore the unknown jsonb key. Read-only
-- function — not wrapped in idempotency cache.
--
-- Apply AFTER: order_payments_add_idempotency_key.sql (the column must
-- exist or this CREATE OR REPLACE references a missing column).
-- Rollback: check_recent_payment_v1_add_idempotency_key_rollback.sql
--   (restores the 10-field jsonb shape from check_recent_payment_v1.sql)
-- =====================================================================

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
    op.split_count,
    op.idempotency_key
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
    'split_count', v_payment.split_count,
    'idempotency_key', v_payment.idempotency_key
  );
END;
$$;

COMMENT ON FUNCTION public.check_recent_payment IS
  'Wave 1 retry-safety check: server-side lookup for a recent payment matching order + amount. Avoids client clock skew. Conservative: callers should treat any error/timeout as "cannot verify". Returns idempotency_key (NULL for v8/legacy rows) so the recovery UI can distinguish own-write replays from peer-station writes.';
