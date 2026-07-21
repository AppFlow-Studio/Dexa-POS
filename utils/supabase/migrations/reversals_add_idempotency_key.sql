-- =====================================================================
-- Migration: reversals_add_idempotency_key
-- =====================================================================
-- Adds an idempotency_key column to the reversals table and a partial
-- unique index to prevent double-write of reversal rows under any
-- retry/crash scenario.
--
-- Partial unique index: WHERE idempotency_key IS NOT NULL
--   - NULL values (legacy rows, cash refunds without journal) are
--     excluded — no unique constraint on NULL per SQL standard.
--   - Non-NULL values (new wave R-1+ refunds) are deduplicated at
--     the DB level, complementing the _idempotency_claim RPC guard.
--
-- Also updates create_reversal_v2 to write p_idempotency_key into
-- the new column so the partial unique index fires on retries.
--
-- NOTE: CREATE UNIQUE INDEX below uses CONCURRENTLY to avoid a full
-- table lock on a live production table. This statement CANNOT be run
-- inside a transaction block — execute this migration outside any
-- BEGIN/COMMIT wrapper (e.g. Supabase Dashboard SQL editor, or
-- psql with \set AUTOCOMMIT on).
--
-- Apply AFTER:
--   - refund_system_v1.sql
--   - create_reversal_v2.sql
--
-- Rollback: reversals_add_idempotency_key_rollback.sql
-- =====================================================================

-- 1. Add column (no-op on re-run because of IF NOT EXISTS)
ALTER TABLE public.reversals
  ADD COLUMN IF NOT EXISTS idempotency_key uuid DEFAULT NULL;

-- 2. Partial unique index — prevents double-insert on RPC retry
--    Cannot be wrapped in a transaction; see header note above.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS
  reversals_idempotency_key_pos_uniq
  ON public.reversals (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- 3. Update create_reversal_v2 to persist the key into the new column.
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
    approved_by,
    idempotency_key           -- NEW: persisted for partial unique index
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
    p_approved_by,
    p_idempotency_key          -- NEW
  )
  RETURNING * INTO v_reversal;

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM public._idempotency_complete(p_idempotency_key, 'create_reversal_v2', to_jsonb(v_reversal));
  END IF;

  RETURN v_reversal;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.create_reversal_v2(uuid, text, text, reversal_type, numeric, refund_reason_type, text, uuid, uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.create_reversal_v2 IS
  'Creates a reversal row for refunds/voids. v2 adds optional p_idempotency_key. '
  'Updated by reversals_add_idempotency_key.sql to also write idempotency_key into '
  'the reversals table column, activating the partial unique index guard.';
