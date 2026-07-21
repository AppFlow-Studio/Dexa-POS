-- =====================================================================
-- Rollback: update_order_payment_status_after_refund v2
-- =====================================================================
-- Restores the original (buggy) function body from refund_system_v1.sql.
-- Use ONLY if the v2 migration introduces a regression on staging/prod.
-- After rollback, full refunds will again be misclassified as 'partial' —
-- which is the pre-existing prod behavior, so this rolls back to the
-- known-bad state without making things worse.
-- =====================================================================

CREATE OR REPLACE FUNCTION update_order_payment_status_after_refund(
  p_order_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order record;
  v_payment_status payment_status;
BEGIN
  SELECT * INTO v_order
  FROM orders
  WHERE id = p_order_id
    AND merchant_id = user_merchant_id()
    AND location_id = ANY(user_location_ids());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found or access denied';
  END IF;

  PERFORM calculate_order_totals_fast(p_order_id);

  SELECT * INTO v_order FROM orders WHERE id = p_order_id;

  IF COALESCE(v_order.amount_due, 0) <= 0 THEN
    v_payment_status := 'paid'::payment_status;
  ELSIF COALESCE(v_order.amount_paid, 0) > 0 THEN
    v_payment_status := 'partial'::payment_status;
  ELSE
    v_payment_status := 'refunded'::payment_status;
  END IF;

  UPDATE orders
  SET payment_status = v_payment_status
  WHERE id = p_order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION update_order_payment_status_after_refund(uuid) TO authenticated;
