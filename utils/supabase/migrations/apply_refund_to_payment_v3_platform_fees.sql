-- =====================================================================
-- Migration: apply_refund_to_payment_v3 — proportional platform-fee refund
-- =====================================================================
-- Forks v2 with two additions:
--
--   1. New parameter `p_tip_refund_amount numeric DEFAULT 0` (after
--      p_refund_amount). Tip refunds are now an explicit input — not
--      derived from p_refund_amount — so subtotal-only and tip-only
--      partial refunds decompose cleanly.
--
--   2. Proportional refunded_dual_pricing_fee / refunded_tip_fee delta,
--      with a final-refund clamp branch (`v_is_full_refund`) that snaps
--      cumulative refunded fees to gross. The LEAST(...) clamp on the
--      partial branch absorbs single-row drift; the snap branch absorbs
--      multi-row drift across many partial refunds (drift-stress test 7
--      in the source plan).
--
-- The refund-via-void path (p_reversal_type='void' → row becomes
-- status='void' AND is_returned=true) hits the same proportional logic.
-- For a void on a fully captured payment, the snap branch fires and
-- refunded_*_fee = gross *_fee. Reporting RPC includes those rows
-- (per project_voided_payment_refunded_amount discriminator).
--
-- Idempotency op string is 'apply_refund_to_payment_v3' (separate
-- namespace from v2 — same rationale as process_payment_v9 → v10).
--
-- Apply AFTER:
--   - 00_idempotency_layer.sql
--   - 00_platform_fee_columns_columns_only.sql
--   - apply_refund_to_payment_v2_station_guard.sql (kept alive)
--
-- Rollback: apply_refund_to_payment_v3_platform_fees_rollback.sql
-- =====================================================================

CREATE OR REPLACE FUNCTION public.apply_refund_to_payment_v3(
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

  -- v3 additions: proportional fee refund.
  v_amount_ratio numeric;
  v_tip_ratio numeric;
  v_delta_dpf numeric;
  v_delta_tipf numeric;
  v_is_full_refund boolean;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    v_cached := public._idempotency_claim(p_idempotency_key, 'apply_refund_to_payment_v3');
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

  PERFORM public._assert_order_station_match(v_payment.o_order_id, p_station_id);

  v_new_refunded := COALESCE(v_payment.refunded_amount, 0) + p_refund_amount;

  IF p_reversal_type = 'void' THEN
    v_new_status := 'void'::payment_status;
  ELSIF v_new_refunded + 0.0001 >= v_payment.amount THEN
    v_new_status := 'refunded'::payment_status;
  ELSE
    v_new_status := 'partially_refunded'::payment_status;
  END IF;

  -- v3 delta: proportional platform-fee refund.
  -- Detect "this is the final refund" — either a void (always full) or
  -- a refund that brings cumulative refunded_amount up to gross.
  v_is_full_refund := (p_reversal_type = 'void')
    OR (v_new_refunded + 0.0001 >= v_payment.amount);

  v_amount_ratio := CASE WHEN COALESCE(v_payment.amount, 0) > 0
    THEN p_refund_amount / v_payment.amount ELSE 0 END;
  v_tip_ratio := CASE WHEN COALESCE(v_payment.tip_amount, 0) > 0
    THEN p_tip_refund_amount / v_payment.tip_amount ELSE 0 END;

  v_delta_dpf  := ROUND(COALESCE(v_payment.dual_pricing_fee, 0) * v_amount_ratio, 2);
  v_delta_tipf := ROUND(COALESCE(v_payment.tip_fee, 0) * v_tip_ratio, 2);

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
      -- v3 delta: snap to gross on full refund/void; otherwise clamp
      -- the partial increment with LEAST() to keep drift below 0.01.
      refunded_dual_pricing_fee = CASE WHEN v_is_full_refund
        THEN dual_pricing_fee
        ELSE LEAST(dual_pricing_fee, COALESCE(refunded_dual_pricing_fee, 0) + v_delta_dpf)
      END,
      refunded_tip_fee = CASE WHEN v_is_full_refund
        THEN tip_fee
        ELSE LEAST(tip_fee, COALESCE(refunded_tip_fee, 0) + v_delta_tipf)
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
  -- END_VERBATIM

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM public._idempotency_complete(p_idempotency_key, 'apply_refund_to_payment_v3', '{}'::jsonb);
  END IF;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.apply_refund_to_payment_v3(
  uuid, numeric, reversal_type, numeric, text, text, text, text, text, uuid, boolean, uuid, uuid
) TO authenticated;

COMMENT ON FUNCTION public.apply_refund_to_payment_v3 IS
  'Refund / void RPC with platform-fee tracking. Forks v2 with p_tip_refund_amount param and proportional refunded_dual_pricing_fee / refunded_tip_fee writes (LEAST clamp + final-refund snap to gross). Idempotency op namespace: apply_refund_to_payment_v3.';
