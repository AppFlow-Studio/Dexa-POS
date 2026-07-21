-- =====================================================================
-- Migration: update_order_payment_status_after_refund v2
-- =====================================================================
-- Replaces the function from refund_system_v1.sql:353-397.
--
-- Bug it fixes: full refunds (cash and card) wrote orders.payment_status
-- = 'partial' instead of 'refunded'. Root cause was the status decision
-- relied on amount_paid (never decremented on refund) and amount_due
-- (rises after paid_quantity restoration), so any full refund hit the
-- ELSIF amount_paid > 0 branch and was misclassified as 'partial'.
--
-- This v2 inserts a refund-aware branch BEFORE the existing logic. It
-- detects a full refund by comparing total refunded dollars against
-- total active-paid dollars on order_payments — independent of
-- amount_paid / amount_due. Existing partial-refund and no-refund
-- branches are preserved verbatim to keep blast radius minimal.
--
-- Also adds SELECT ... FOR UPDATE on the order row to prevent two
-- concurrent refunds on the same order from racing on the final write.
--
-- Rollback: update_order_payment_status_after_refund_v2_rollback.sql
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
  v_total_paid_in numeric;
  v_total_returned numeric;
  v_net_held numeric;
BEGIN
  -- Verify order access AND lock the row for the duration of this txn.
  -- The row lock prevents two parallel refunds on the same order from
  -- both reading pre-update state and racing on the final UPDATE.
  SELECT * INTO v_order
  FROM orders
  WHERE id = p_order_id
    AND merchant_id = user_merchant_id()
    AND location_id = ANY(user_location_ids())
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found or access denied';
  END IF;

  -- Recalculate amount_due / amount_paid / totals from item & payment state.
  PERFORM calculate_order_totals_fast(p_order_id);

  -- Refresh order data after recalculation.
  SELECT * INTO v_order FROM orders WHERE id = p_order_id;

  -- Aggregate "net held by merchant" across all real payment activity.
  --
  -- Cash refunds and voidable card refunds run through
  -- apply_refund_to_payment_v2 with reversal_type='void', which sets the
  -- row to status='void', is_voided=true, AND is_returned=true.
  -- A "true" payment void (cancel before settlement) goes through
  -- void_payment.sql, which sets is_voided=true but leaves is_returned=false.
  -- We discriminate using is_returned: a row is "real money flow" when it
  -- isn't a true void.
  --
  --   v_total_paid_in = total amount that ever moved from customer to merchant
  --   v_total_returned = total amount returned to customer (via either path)
  --   v_net_held     = amount the merchant currently holds = paid_in - returned
  --
  -- Order is fully refunded iff there's real return activity AND nothing is
  -- held. Splits like "void cash + take card again" naturally net to held > 0
  -- and stay paid.
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

  -- Decide payment_status.
  --
  -- (1) Full-refund branch (NEW): customer paid, customer got everything
  --     back, merchant holds nothing. Epsilon 0.0001 matches the per-payment
  --     check in apply_refund_to_payment_v2.sql:58 to avoid drift.
  --
  -- (2) Existing branches preserved — partial-refund and no-refund cases
  --     keep their current classification. A follow-up plan can introduce
  --     'partially_refunded' for case (3) once the client mapping
  --     (stores/useOrderStore.ts:14182-14189, hooks/realtime/useOrdersRealtime.ts:219)
  --     is extended to recognize it.
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
END;
$$;

GRANT EXECUTE ON FUNCTION update_order_payment_status_after_refund(uuid) TO authenticated;
