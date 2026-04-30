-- =====================================================================
-- Backfill: refund payment_status drift
-- =====================================================================
-- Re-classifies orders that should be 'refunded' but are stuck on some
-- other status because the previous (buggy) version of
-- update_order_payment_status_after_refund misclassified them.
--
-- Catches three flavors:
--   * 'partial' — single-payment orders refunded via card refund path.
--   * 'paid'    — orders refunded via the void path (cash refunds, etc.)
--                 where amount_due was already 0, so the old logic
--                 short-circuited to 'paid'.
--   * 'pending' — same as above but with amount_paid=0.
--
-- Uses the same "net held by merchant" formulation as v2, so it agrees
-- with the function and won't bounce a row back on next refund event.
--
-- Idempotent: only flips rows where the dollars confirm a full refund.
-- Bounded: candidate set restricted to orders with refund activity.
-- Safe: leaves partial-refund rows untouched (we can't classify those
--       correctly until 'partially_refunded' is wired through the client).
-- =====================================================================

DO $$
DECLARE
  r record;
  v_total_paid_in numeric;
  v_total_returned numeric;
  v_net_held numeric;
  v_fixed_count integer := 0;
BEGIN
  FOR r IN
    SELECT DISTINCT o.id
    FROM orders o
    JOIN order_payments op ON op.order_id = o.id
    WHERE o.payment_status <> 'refunded'
      AND COALESCE(op.refunded_amount, 0) > 0
  LOOP
    -- See v2 function for the rationale on the (status='void' AND NOT is_returned)
    -- exclusion: it filters out true voids whose refunded_amount is noise,
    -- while keeping cash-refund-via-void rows (status='void' + is_returned=true)
    -- as real return activity.
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
    WHERE order_id = r.id;

    IF v_total_paid_in > 0
       AND v_total_returned > 0
       AND v_net_held <= 0.0001 THEN
      UPDATE orders
      SET payment_status = 'refunded'::payment_status
      WHERE id = r.id;
      v_fixed_count := v_fixed_count + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'backfill_refund_payment_status_v1: fixed % orders', v_fixed_count;
END $$;
