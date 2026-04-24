-- ============================================================================
-- Fix: Refund→Re-Pay lifecycle (paid_quantity/refunded_quantity state corruption)
--
-- Issues fixed:
-- 1. apply_refund_to_payment: adds p_restore_paid_quantity flag for full voids
-- 2. record_refund_items: adds p_skip_quantity_update flag for full voids
-- 3. process_payment_v8: clears refunded_quantity on re-pay, caps paid_qty
-- 4. calculate_order_totals_fast: caps effective_unpaid at quantity (safety net)
-- ============================================================================

-- ============================================
-- 1. apply_refund_to_payment: restore paid_quantity for full payment voids
-- ============================================
CREATE OR REPLACE FUNCTION apply_refund_to_payment(
  p_payment_id uuid,
  p_refund_amount numeric,
  p_reversal_type reversal_type,
  p_return_rrn text DEFAULT NULL,
  p_return_auth_code text DEFAULT NULL,
  p_return_reference_id text DEFAULT NULL,
  p_return_number text DEFAULT NULL,
  p_return_reason text DEFAULT NULL,
  p_initiated_by uuid DEFAULT NULL,
  p_restore_paid_quantity boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_payment record;
  v_new_refunded numeric;
  v_new_status payment_status;
  v_ci record;
BEGIN
  SELECT op.*, o.id AS o_order_id
  INTO v_payment
  FROM order_payments op
  JOIN orders o ON o.id = op.order_id
  WHERE op.id = p_payment_id
    AND o.merchant_id = user_merchant_id()
    AND o.location_id = ANY(user_location_ids());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found or access denied';
  END IF;

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

  -- For full payment voids: restore paid_quantity on order_items
  -- (matches void_payment.sql behavior)
  IF p_restore_paid_quantity THEN
    -- Primary: precise decrement via order_payment_items junction
    UPDATE public.order_items oi
    SET paid_quantity = GREATEST(COALESCE(oi.paid_quantity, 0) - opi.quantity_paid, 0)
    FROM public.order_payment_items opi
    WHERE opi.order_payment_id = p_payment_id
      AND opi.order_item_id = oi.id;

    -- Fallback: covers_items array for legacy payments without junction records
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
END;
$$;

-- ============================================
-- 2. record_refund_items: skip refunded_quantity increment for full voids
-- ============================================
CREATE OR REPLACE FUNCTION record_refund_items(
  p_reversal_id uuid,
  p_items jsonb,
  p_skip_quantity_update boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item jsonb;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    -- Always insert the refund log record
    INSERT INTO order_refund_items (
      reversal_id,
      order_item_id,
      order_payment_item_id,
      quantity_refunded,
      unit_price_refunded,
      subtotal_refunded,
      tax_refunded,
      total_refunded,
      refund_reason,
      refund_reason_detail,
      return_to_inventory,
      inventory_updated
    )
    VALUES (
      p_reversal_id,
      (v_item->>'order_item_id')::uuid,
      NULLIF(v_item->>'order_payment_item_id', '')::uuid,
      COALESCE((v_item->>'quantity_refunded')::integer, 1),
      COALESCE((v_item->>'unit_price_refunded')::numeric, 0),
      COALESCE((v_item->>'subtotal_refunded')::numeric, 0),
      COALESCE((v_item->>'tax_refunded')::numeric, 0),
      COALESCE((v_item->>'total_refunded')::numeric, 0),
      (v_item->>'refund_reason')::refund_reason_type,
      v_item->>'refund_reason_detail',
      COALESCE((v_item->>'return_to_inventory')::boolean, false),
      COALESCE((v_item->>'inventory_updated')::boolean, false)
    );

    -- Only update order_items state for non-void refunds.
    -- For full payment voids, paid_quantity is restored instead (in apply_refund_to_payment).
    IF NOT p_skip_quantity_update THEN
      UPDATE order_items
      SET refunded_quantity = COALESCE(refunded_quantity, 0)
            + COALESCE((v_item->>'quantity_refunded')::integer, 0),
          refunded_amount = COALESCE(refunded_amount, 0)
            + COALESCE((v_item->>'total_refunded')::numeric, 0)
      WHERE id = (v_item->>'order_item_id')::uuid;
    END IF;
  END LOOP;
END;
$$;
