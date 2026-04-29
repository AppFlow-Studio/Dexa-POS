-- =====================================================================
-- Migration: apply_refund_to_payment_v2 — Wave 2.2 station-ownership guard
-- =====================================================================
-- The existing SELECT pulls op.order_id (aliased o_order_id) into v_payment;
-- the helper call goes right after the FOUND check, using v_payment.o_order_id
-- as the order id to validate.
--
-- Rollback: apply_refund_to_payment_v2_station_guard_rollback.sql
-- =====================================================================

DROP FUNCTION IF EXISTS public.apply_refund_to_payment_v2(uuid, numeric, reversal_type, text, text, text, text, text, uuid, boolean, uuid);

CREATE OR REPLACE FUNCTION public.apply_refund_to_payment_v2(
  p_payment_id uuid,
  p_refund_amount numeric,
  p_reversal_type reversal_type,
  p_return_rrn text DEFAULT NULL,
  p_return_auth_code text DEFAULT NULL,
  p_return_reference_id text DEFAULT NULL,
  p_return_number text DEFAULT NULL,
  p_return_reason text DEFAULT NULL,
  p_initiated_by uuid DEFAULT NULL,
  p_restore_paid_quantity boolean DEFAULT false,
  p_idempotency_key UUID DEFAULT NULL,
  p_station_id uuid DEFAULT NULL  -- Wave 2.2
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cached JSONB;
  v_payment record;
  v_new_refunded numeric;
  v_new_status payment_status;
  v_ci record;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    v_cached := public._idempotency_claim(p_idempotency_key, 'apply_refund_to_payment_v2');
    IF v_cached IS NOT NULL THEN
      RETURN;
    END IF;
  END IF;

  -- BEGIN_VERBATIM
  SELECT op.*, o.id AS o_order_id INTO v_payment
  FROM order_payments op
  JOIN orders o ON o.id = op.order_id
  WHERE op.id = p_payment_id
    AND o.merchant_id = user_merchant_id()
    AND o.location_id = ANY(user_location_ids());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found or access denied';
  END IF;

  -- Wave 2.2: refuse to mutate orders owned by another station.
  PERFORM public._assert_order_station_match(v_payment.o_order_id, p_station_id);

  v_new_refunded := COALESCE(v_payment.refunded_amount, 0) + p_refund_amount;

  IF p_reversal_type = 'void' THEN
    v_new_status := 'void'::payment_status;
  ELSIF v_new_refunded + 0.0001 >= v_payment.amount THEN
    v_new_status := 'refunded'::payment_status;
  ELSE
    v_new_status := 'partially_refunded'::payment_status;
  END IF;

  UPDATE order_payments
  SET refunded_amount = v_new_refunded,
      refunded_at = now(),
      status = v_new_status,
      is_voided = (p_reversal_type = 'void'),
      is_returned = true,
      returned_at = now(),
      returned_by = COALESCE(p_initiated_by, returned_by),
      return_amount = v_new_refunded,
      return_rrn = COALESCE(p_return_rrn, return_rrn),
      return_auth_code = COALESCE(p_return_auth_code, return_auth_code),
      return_reference_id = COALESCE(p_return_reference_id, return_reference_id),
      return_number = COALESCE(p_return_number, return_number),
      return_reason = COALESCE(p_return_reason, return_reason)
  WHERE id = p_payment_id;

  IF p_restore_paid_quantity THEN
    UPDATE public.order_items oi
    SET paid_quantity = GREATEST(COALESCE(oi.paid_quantity, 0) - opi.quantity_paid, 0)
    FROM public.order_payment_items opi
    WHERE opi.order_payment_id = p_payment_id
      AND opi.order_item_id = oi.id;

    IF NOT EXISTS (
      SELECT 1 FROM public.order_payment_items WHERE order_payment_id = p_payment_id
    ) AND v_payment.covers_items IS NOT NULL THEN
      FOR v_ci IN SELECT unnest(v_payment.covers_items) AS item_id LOOP
        UPDATE public.order_items
        SET paid_quantity = GREATEST(COALESCE(paid_quantity, 0) - 1, 0)
        WHERE id = v_ci.item_id::uuid;
      END LOOP;
    END IF;
  END IF;
  -- END_VERBATIM

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM public._idempotency_complete(p_idempotency_key, 'apply_refund_to_payment_v2', '{}'::jsonb);
  END IF;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.apply_refund_to_payment_v2(uuid, numeric, reversal_type, text, text, text, text, text, uuid, boolean, uuid, uuid) TO authenticated;
