-- =====================================================================
-- Migration: update_order_payment_status_after_refund_v3
--            — adds idempotency-key support
-- =====================================================================
-- Forks from v2 (update_order_payment_status_after_refund_v2.sql).
-- v2 has no idempotency wrapping. v3 adds _idempotency_claim /
-- _idempotency_complete so parallel or retry calls from multiple
-- refund-pipeline steps do not race on the final order status UPDATE.
--
-- The function is a RETURNS void (no result to cache), so on cache hit
-- we simply RETURN. This is safe because:
--   - The function is idempotent by design (reads current state,
--     re-derives and writes the same status on re-run).
--   - The 60s in-flight window is ample for the refund pipeline.
--
-- Apply AFTER:
--   - 00_idempotency_layer.sql
--   - update_order_payment_status_after_refund_v2.sql
--
-- Rollback: update_order_payment_status_after_refund_v3_rollback.sql
-- =====================================================================

CREATE OR REPLACE FUNCTION public.update_order_payment_status_after_refund_v3(
  p_order_id        uuid,
  p_idempotency_key uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cached            JSONB;
  v_order             record;
  v_payment_status    payment_status;
  v_total_paid_in     numeric;
  v_total_returned    numeric;
  v_net_held          numeric;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    v_cached := public._idempotency_claim(
      p_idempotency_key,
      'update_order_payment_status_after_refund_v3'
    );
    IF v_cached IS NOT NULL THEN
      RETURN;
    END IF;
  END IF;

  -- Verbatim body from update_order_payment_status_after_refund v2
  -- (update_order_payment_status_after_refund_v2.sql).
  SELECT * INTO v_order
  FROM orders
  WHERE id = p_order_id
    AND merchant_id = user_merchant_id()
    AND location_id = ANY(user_location_ids())
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found or access denied';
  END IF;

  -- Temporarily set payment_status to 'partial' before recalculating
  -- totals. The enforce_order_math trigger rejects the intermediate state
  -- where payment_status='paid' but amount_due>0 (which calculate_order_totals_fast
  -- can produce during a partial refund). Setting 'partial' first makes the
  -- intermediate row consistent so the trigger does not fire.
  UPDATE orders
  SET payment_status = 'partial'::payment_status
  WHERE id = p_order_id
    AND payment_status = 'paid'::payment_status;

  PERFORM calculate_order_totals_fast(p_order_id);

  SELECT * INTO v_order FROM orders WHERE id = p_order_id;

  SELECT
    COALESCE(SUM(amount) FILTER (
      WHERE NOT (status = 'void' AND COALESCE(is_returned, false) = false)
    ), 0),
    COALESCE(SUM(COALESCE(refunded_amount, 0)) FILTER (
      WHERE NOT (status = 'void' AND COALESCE(is_returned, false) = false)
    ), 0),
    COALESCE(SUM(amount - COALESCE(refunded_amount, 0)) FILTER (
      WHERE NOT (status = 'void' AND COALESCE(is_returned, false) = false)
    ), 0)
  INTO v_total_paid_in, v_total_returned, v_net_held
  FROM order_payments
  WHERE order_id = p_order_id;

  IF v_total_paid_in > 0
     AND v_total_returned > 0
     AND v_net_held <= 0.0001 THEN
    v_payment_status := 'refunded'::payment_status;
  ELSIF COALESCE(v_order.amount_due, 0) <= 0 THEN
    v_payment_status := 'paid'::payment_status;
  ELSIF COALESCE(v_order.amount_paid, 0) > 0 THEN
    v_payment_status := 'partial'::payment_status;
  ELSE
    v_payment_status := 'refunded'::payment_status;
  END IF;

  UPDATE orders
  SET payment_status = v_payment_status
  WHERE id = p_order_id;

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM public._idempotency_complete(
      p_idempotency_key,
      'update_order_payment_status_after_refund_v3',
      '{}'::jsonb
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_order_payment_status_after_refund_v3(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.update_order_payment_status_after_refund_v3 IS
  'Recalculates order payment_status after a refund. v3 adds optional '
  'p_idempotency_key so parallel/retry calls from the refund pipeline '
  'do not race on the final status write. On cache hit, returns immediately. '
  'Idempotency op: update_order_payment_status_after_refund_v3.';
