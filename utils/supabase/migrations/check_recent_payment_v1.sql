-- =====================================================================
-- Migration: check_recent_payment_v1 — server-side retry-safety check
-- =====================================================================
-- Used by the bad-WiFi Phase 2 Wave 1 recovery UI to verify whether a
-- recent payment for the same order + amount already landed before
-- re-charging on "Try again."
--
-- All time comparisons use server `now()`, never client clock — this
-- closes the W0 clock-skew concern for stale tablets.
--
-- Result is conservative: returns matched=true ONLY when an `order_payments`
-- row exists for the order, within the lookback window, with status in
-- ('captured', 'partially_refunded', 'refunded'), AND (when p_amount_cents
-- is provided) the amount matches. Callers should treat any RPC error or
-- timeout as "cannot verify — do NOT auto-retry".
--
-- Rollback: check_recent_payment_v1_rollback.sql
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
  -- Defensive: if the caller has no merchant/location context, RAISE rather
  -- than silently returning matched:false. The recovery UI treats RPC errors
  -- as "cannot verify" (conservative). A silent false here would risk a
  -- double-charge when the caller's auth happens to be broken.
  v_merchant_id := user_merchant_id();
  v_location_ids := user_location_ids();
  IF v_merchant_id IS NULL OR v_location_ids IS NULL OR cardinality(v_location_ids) = 0 THEN
    RAISE EXCEPTION 'check_recent_payment: missing merchant/location context — cannot verify'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- captured_at = when payment was actually finalized (the right semantic for
  -- "recently completed"). initiated_at is when the row was first inserted and
  -- can be stale for multi-step flows.
  --
  -- p_split_portion_index disambiguates split payments where two portions
  -- happen to have the same amount. When provided, match exactly on portion.
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

-- Drop the old 3-arg signature explicitly (CREATE OR REPLACE doesn't replace
-- across different argument lists). Safe even if the old version was never
-- applied — DROP IF EXISTS is a no-op on missing functions.
DROP FUNCTION IF EXISTS public.check_recent_payment(UUID, INTEGER, BIGINT);

GRANT EXECUTE ON FUNCTION public.check_recent_payment(UUID, INTEGER, BIGINT, INTEGER) TO authenticated;

COMMENT ON FUNCTION public.check_recent_payment IS
  'Wave 1 retry-safety check: server-side lookup for a recent payment matching order + amount. Avoids client clock skew. Conservative: callers should treat any error/timeout as "cannot verify".';
