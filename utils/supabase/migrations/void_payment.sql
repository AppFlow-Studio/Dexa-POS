-- ============================================================================
-- void_payment RPC
-- Used by: useOrderStore.voidPayment() for NON-TERMINAL (cash) payment voids.
-- Terminal voids go through RefundService.processRefund() → apply_refund_to_payment.
--
-- Steps:
--   1. Authorize via merchant/location guard (same as apply_refund_to_payment)
--   2. Mark payment voided
--   3. Restore paid_quantity on order_items:
--        primary  — precise quantities from order_payment_items junction table
--        fallback — covers_items UUID array (qty 1 per entry, legacy payments)
--   4. Subtract voided amount from orders.amount_paid
--   5. Delegate amount_due recalculation to calculate_order_totals_fast()
--      DO NOT inline the formula — this function is the single source of truth
--      and handles cash/card dual pricing, refunded_quantity, and the paid-guard.
--   6. Update payment_status on orders
-- ============================================================================

CREATE OR REPLACE FUNCTION void_payment(
  p_payment_id  uuid,
  p_void_reason text DEFAULT 'User voided'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_payment       record;
  v_order_id      uuid;
  v_voided_amount numeric;
  v_item          record;
BEGIN
  -- ── 1. Authorization guard ────────────────────────────────────────────────
  SELECT op.*, o.id AS o_order_id
  INTO   v_payment
  FROM   public.order_payments op
  JOIN   public.orders         o ON o.id = op.order_id
  WHERE  op.id         = p_payment_id
    AND  o.merchant_id = user_merchant_id()
    AND  o.location_id = ANY(user_location_ids());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found or access denied';
  END IF;

  -- Idempotent: already voided — return cleanly
  IF v_payment.is_voided IS TRUE THEN RETURN; END IF;

  v_order_id      := v_payment.order_id;
  -- Include tip in voided amount to match how voidPayment() store code
  -- sums amount + tip_amount into amount_paid
  v_voided_amount := COALESCE(v_payment.amount, 0)
                   + COALESCE(v_payment.tip_amount, 0);

  -- ── 2. Mark payment voided ────────────────────────────────────────────────
  UPDATE public.order_payments
  SET    is_voided   = true,
         status      = 'void'::payment_status,
         voided_at   = now(),
         void_reason = p_void_reason
  WHERE  id = p_payment_id;

  -- ── 3a. Restore paid_quantity — precise path via order_payment_items ──────
  -- Decrement by the exact quantity_paid recorded at payment time.
  -- GREATEST(..., 0) prevents negative quantities from data anomalies.
  -- UPDATE ... FROM JOIN: zero rows updated = no-op when no junction records exist.
  UPDATE public.order_items oi
  SET    paid_quantity = GREATEST(
           COALESCE(oi.paid_quantity, 0) - opi.quantity_paid, 0)
  FROM   public.order_payment_items opi
  WHERE  opi.order_payment_id = p_payment_id
    AND  opi.order_item_id    = oi.id;

  -- ── 3b. Fallback: covers_items UUID array ────────────────────────────────
  -- Only activates for payments with no order_payment_items rows
  -- (legacy split-even payments inserted before the junction table existed).
  IF NOT EXISTS (
    SELECT 1 FROM public.order_payment_items
    WHERE  order_payment_id = p_payment_id
  ) AND v_payment.covers_items IS NOT NULL THEN
    FOR v_item IN SELECT unnest(v_payment.covers_items) AS item_id LOOP
      UPDATE public.order_items
      SET    paid_quantity = GREATEST(COALESCE(paid_quantity, 0) - 1, 0)
      WHERE  id = v_item.item_id::uuid;
    END LOOP;
  END IF;

  -- ── 4. Update orders.amount_paid and tip_amount ──────────────────────────
  -- Both columns are accumulated by process_payment_v8 and must be decremented
  -- symmetrically on void. v_voided_amount already includes tip so amount_paid
  -- is correct; tip_amount is a separate column that needs its own decrement.
  UPDATE public.orders
  SET    amount_paid = GREATEST(COALESCE(amount_paid, 0) - v_voided_amount, 0),
         tip_amount  = GREATEST(COALESCE(tip_amount,  0) - COALESCE(v_payment.tip_amount, 0), 0)
  WHERE  id = v_order_id;

  -- ── 5. Recalculate totals via the authoritative fast totals function ───────
  -- After setting is_voided=true the payment appears in v_payment_voided inside
  -- calculate_order_totals_fast, which disables the fully-paid guard and allows
  -- amount_due to correctly reflect the restored unpaid balance.
  PERFORM calculate_order_totals_fast(v_order_id);

  -- ── 6. Update payment_status ──────────────────────────────────────────────
  UPDATE public.orders
  SET    payment_status =
           CASE
             WHEN (SELECT COALESCE(amount_due,  0) FROM public.orders WHERE id = v_order_id) <= 0
               THEN 'paid'::payment_status
             WHEN (SELECT COALESCE(amount_paid, 0) FROM public.orders WHERE id = v_order_id) > 0
               THEN 'partial'::payment_status
             ELSE 'pending'::payment_status
           END
  WHERE  id = v_order_id;

END;
$$;
