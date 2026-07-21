-- =====================================================================
-- Rollback: void_payment — Wave 2.3 station guard
-- =====================================================================
-- Drops the 3-param signature and recreates the original 2-param version
-- captured from staging on 2026-04-29 (project dfwqakoyittmrwbqvxgw).
-- =====================================================================

DROP FUNCTION IF EXISTS public.void_payment(uuid, text, uuid);

CREATE OR REPLACE FUNCTION public.void_payment(
  p_payment_id uuid,
  p_void_reason text DEFAULT 'User voided'::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  UPDATE public.order_items oi
  SET    paid_quantity = GREATEST(
           COALESCE(oi.paid_quantity, 0) - opi.quantity_paid, 0)
  FROM   public.order_payment_items opi
  WHERE  opi.order_payment_id = p_payment_id
    AND  opi.order_item_id    = oi.id;

  -- ── 3b. Fallback: covers_items UUID array ────────────────────────────────
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

  -- ── 4. Update orders.amount_paid ──────────────────────────────────────────
  UPDATE public.orders
  SET    amount_paid = GREATEST(COALESCE(amount_paid, 0) - v_voided_amount, 0)
  WHERE  id = v_order_id;

  -- ── 5. Recalculate totals via the authoritative fast totals function ───────
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
$function$;

GRANT EXECUTE ON FUNCTION public.void_payment(uuid, text) TO authenticated;
