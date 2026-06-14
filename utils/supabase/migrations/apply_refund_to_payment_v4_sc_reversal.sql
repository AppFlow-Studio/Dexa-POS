-- =====================================================================
-- Migration: apply_refund_to_payment_v4 — proportional SC reversal
-- =====================================================================
-- Wave D fork of v3. One addition: proportional refunded_service_charge
-- delta, matching the v3 dual_pricing_fee / tip_fee pattern verbatim:
--
--   v_delta_sc := ROUND(COALESCE(v_payment.service_charge, 0)
--                       * v_amount_ratio, 2);
--
-- LEAST-clamps cumulative refunded_service_charge against the snapshot
-- on partial refunds so single-step drift stays under a cent. Snaps to
-- gross on void / final-refund branch (v_is_full_refund) so multi-step
-- partial drift always closes to exactly service_charge by the time the
-- payment is fully reversed.
--
-- Legacy payments (pre-v13) have service_charge = 0 from the column
-- DEFAULT; the multiplication yields 0 and the branch is a no-op for
-- those rows.
--
-- Idempotency op string: 'apply_refund_to_payment_v4' (separate namespace
-- from v3, per the v9 → v10 / v12 → v13 precedent).
--
-- Apply AFTER:
--   - order_payments_add_service_charge_columns.sql
--   - apply_refund_to_payment_v3_platform_fees.sql
--
-- Rollback: apply_refund_to_payment_v4_sc_reversal_rollback.sql
-- =====================================================================

CREATE OR REPLACE FUNCTION public.apply_refund_to_payment_v4(
  p_payment_id uuid,
  p_refund_amount numeric,
  p_reversal_type reversal_type,
  p_tip_refund_amount numeric DEFAULT 0,
  p_return_rrn text DEFAULT NULL,
  p_return_auth_code text DEFAULT NULL,
  p_return_reference_id text DEFAULT NULL,
  p_return_number text DEFAULT NULL,
  p_return_reason text DEFAULT NULL,
  p_initiated_by uuid DEFAULT NULL,
  p_restore_paid_quantity boolean DEFAULT false,
  p_idempotency_key UUID DEFAULT NULL,
  p_station_id uuid DEFAULT NULL
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

  -- v3 carryovers: proportional fee refund.
  v_amount_ratio numeric;
  v_tip_ratio numeric;
  v_delta_dpf numeric;
  v_delta_tipf numeric;
  v_is_full_refund boolean;

  -- v4 addition: proportional SC reversal.
  v_delta_sc numeric;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    v_cached := public._idempotency_claim(p_idempotency_key, 'apply_refund_to_payment_v4');
    IF v_cached IS NOT NULL THEN
      RETURN;
    END IF;
  END IF;

  SELECT op.*, o.id AS o_order_id INTO v_payment
  FROM order_payments op
  JOIN orders o ON o.id = op.order_id
  WHERE op.id = p_payment_id
    AND o.merchant_id = user_merchant_id()
    AND o.location_id = ANY(user_location_ids());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found or access denied';
  END IF;

  PERFORM public._assert_order_station_match(v_payment.o_order_id, p_station_id);

  v_new_refunded := COALESCE(v_payment.refunded_amount, 0) + p_refund_amount;

  IF p_reversal_type = 'void' THEN
    v_new_status := 'void'::payment_status;
  ELSIF v_new_refunded + 0.0001 >= v_payment.amount THEN
    v_new_status := 'refunded'::payment_status;
  ELSE
    v_new_status := 'partially_refunded'::payment_status;
  END IF;

  v_is_full_refund := (p_reversal_type = 'void')
    OR (v_new_refunded + 0.0001 >= v_payment.amount);

  v_amount_ratio := CASE WHEN COALESCE(v_payment.amount, 0) > 0
    THEN p_refund_amount / v_payment.amount ELSE 0 END;
  v_tip_ratio := CASE WHEN COALESCE(v_payment.tip_amount, 0) > 0
    THEN p_tip_refund_amount / v_payment.tip_amount ELSE 0 END;

  v_delta_dpf  := ROUND(COALESCE(v_payment.dual_pricing_fee, 0) * v_amount_ratio, 2);
  v_delta_tipf := ROUND(COALESCE(v_payment.tip_fee, 0) * v_tip_ratio, 2);
  v_delta_sc   := ROUND(COALESCE(v_payment.service_charge, 0) * v_amount_ratio, 2);

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
      return_reason = COALESCE(p_return_reason, return_reason),
      refunded_dual_pricing_fee = CASE WHEN v_is_full_refund
        THEN dual_pricing_fee
        ELSE LEAST(dual_pricing_fee, COALESCE(refunded_dual_pricing_fee, 0) + v_delta_dpf)
      END,
      refunded_tip_fee = CASE WHEN v_is_full_refund
        THEN tip_fee
        ELSE LEAST(tip_fee, COALESCE(refunded_tip_fee, 0) + v_delta_tipf)
      END,
      -- v4 delta: same shape as v3's fee branches — snap to gross on full
      -- refund/void; LEAST-clamp on partial. Drift invariant:
      -- refunded_service_charge ≤ service_charge.
      service_charge_refunded = CASE WHEN v_is_full_refund
        THEN service_charge
        ELSE LEAST(service_charge, COALESCE(service_charge_refunded, 0) + v_delta_sc)
      END
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

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM public._idempotency_complete(p_idempotency_key, 'apply_refund_to_payment_v4', '{}'::jsonb);
  END IF;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.apply_refund_to_payment_v4(
  uuid, numeric, reversal_type, numeric, text, text, text, text, text, uuid, boolean, uuid, uuid
) TO authenticated;

COMMENT ON FUNCTION public.apply_refund_to_payment_v4 IS
  'Wave D fork of apply_refund_to_payment_v3. Adds proportional refunded_service_charge delta (same LEAST clamp + full-refund snap pattern as refunded_dual_pricing_fee / refunded_tip_fee). Reverses the per-payment service_charge snapshot written by process_payment_v13. Drift invariant: refunded_service_charge ≤ service_charge. Idempotency op: ''apply_refund_to_payment_v4''.';
