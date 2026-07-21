-- Rollback: reversals_add_idempotency_key.sql
-- NOTE: dropping the index CONCURRENTLY also cannot run in a transaction.

DROP INDEX CONCURRENTLY IF EXISTS public.reversals_idempotency_key_pos_uniq;

ALTER TABLE public.reversals
  DROP COLUMN IF EXISTS idempotency_key;

-- Restore create_reversal_v2 without the idempotency_key column insert.
-- (Restores the version from create_reversal_v2.sql.)
CREATE OR REPLACE FUNCTION public.create_reversal_v2(
  p_original_payment_id   uuid,
  p_original_psp_reference text,
  p_reversal_reference_id text,
  p_reversal_type         reversal_type,
  p_amount                numeric,
  p_reason_code           refund_reason_type,
  p_reason_description    text,
  p_initiated_by          uuid,
  p_approved_by           uuid,
  p_idempotency_key       UUID DEFAULT NULL
)
RETURNS reversals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_cached  JSONB;
  v_payment record;
  v_reversal reversals;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    v_cached := public._idempotency_claim(p_idempotency_key, 'create_reversal_v2');
    IF v_cached IS NOT NULL THEN
      RETURN jsonb_populate_record(NULL::reversals, v_cached);
    END IF;
  END IF;

  SELECT op.*, o.merchant_id, o.location_id
  INTO v_payment
  FROM order_payments op
  JOIN orders o ON o.id = op.order_id
  WHERE op.id = p_original_payment_id
    AND o.merchant_id = user_merchant_id()
    AND o.location_id = ANY(user_location_ids());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found or access denied';
  END IF;

  INSERT INTO reversals (
    original_payment_id,
    original_psp_reference,
    reversal_reference_id,
    merchant_id,
    location_id,
    reversal_type,
    amount,
    reason_code,
    reason_description,
    status,
    initiated_by,
    approved_by
  )
  VALUES (
    p_original_payment_id,
    p_original_psp_reference,
    p_reversal_reference_id,
    v_payment.merchant_id,
    v_payment.location_id,
    p_reversal_type,
    p_amount,
    p_reason_code,
    p_reason_description,
    'pending',
    p_initiated_by,
    p_approved_by
  )
  RETURNING * INTO v_reversal;

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM public._idempotency_complete(p_idempotency_key, 'create_reversal_v2', to_jsonb(v_reversal));
  END IF;

  RETURN v_reversal;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.create_reversal_v2(uuid, text, text, reversal_type, numeric, refund_reason_type, text, uuid, uuid, uuid) TO authenticated;
