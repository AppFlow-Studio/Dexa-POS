-- =====================================================================
-- Migration: check_recent_refund_v1 — server-side refund retry-safety
-- =====================================================================
-- Mirrors check_recent_payment_v1_add_idempotency_key.sql but for
-- refunds. Called by the client verifying view (useRefundVerification)
-- to determine whether a reversal row has already been written on the
-- server despite a DEADLINE_EXCEEDED or 40001 idempotency_in_flight
-- error on the client side.
--
-- Conservative semantics: callers must treat any error/timeout as
-- "cannot verify" (same as check_recent_payment). Read-only — not
-- wrapped in idempotency cache.
--
-- Parameters:
--   p_order_id          — the order being refunded
--   p_lookback_seconds  — how far back to look (default 600s / 10 min)
--   p_amount_cents      — optional: match by refund amount in cents
--   p_idempotency_key   — optional: match by the journal's idempotency
--                         key (allows cross-station write detection)
--
-- Returns jsonb:
--   { matched: false }
--   { matched: true, reversal_id, payment_id, amount, status,
--     idempotency_key, reversal_type, captured_at }
--
-- Rollback: check_recent_refund_v1_rollback.sql
-- =====================================================================

CREATE OR REPLACE FUNCTION public.check_recent_refund(
  p_order_id          UUID,
  p_lookback_seconds  INTEGER DEFAULT 600,
  p_amount_cents      BIGINT  DEFAULT NULL,
  p_idempotency_key   UUID    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reversal  RECORD;
  v_merchant_id UUID;
  v_location_ids UUID[];
BEGIN
  v_merchant_id  := user_merchant_id();
  v_location_ids := user_location_ids();
  IF v_merchant_id IS NULL OR v_location_ids IS NULL OR cardinality(v_location_ids) = 0 THEN
    RAISE EXCEPTION 'check_recent_refund: missing merchant/location context — cannot verify'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Primary match: by idempotency_key when caller supplies it.
  -- This is the most precise check — exact journal-key match means
  -- the same pipeline run (or a safe replay) already wrote the row.
  IF p_idempotency_key IS NOT NULL THEN
    SELECT
      r.id                  AS reversal_id,
      r.original_payment_id AS payment_id,
      r.amount,
      r.status,
      r.idempotency_key,
      r.reversal_type,
      r.requested_at        AS captured_at,
      op.id                 AS op_id
    INTO v_reversal
    FROM public.reversals r
    JOIN public.order_payments op ON op.id = r.original_payment_id
    JOIN public.orders o          ON o.id  = op.order_id
    WHERE op.order_id   = p_order_id
      AND o.merchant_id = v_merchant_id
      AND o.location_id = ANY(v_location_ids)
      AND r.idempotency_key = p_idempotency_key
      AND r.status::text NOT IN ('failed')
    ORDER BY r.requested_at DESC
    LIMIT 1;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'matched',          true,
        'reversal_id',      v_reversal.reversal_id,
        'payment_id',       v_reversal.payment_id,
        'amount',           v_reversal.amount,
        'status',           v_reversal.status,
        'idempotency_key',  v_reversal.idempotency_key,
        'reversal_type',    v_reversal.reversal_type,
        'captured_at',      v_reversal.captured_at
      );
    END IF;
  END IF;

  -- Fallback match: by order + recency window + optional amount.
  SELECT
    r.id                  AS reversal_id,
    r.original_payment_id AS payment_id,
    r.amount,
    r.status,
    r.idempotency_key,
    r.reversal_type,
    r.requested_at        AS captured_at
  INTO v_reversal
  FROM public.reversals r
  JOIN public.order_payments op ON op.id = r.original_payment_id
  JOIN public.orders o          ON o.id  = op.order_id
  WHERE op.order_id   = p_order_id
    AND o.merchant_id = v_merchant_id
    AND o.location_id = ANY(v_location_ids)
    AND r.requested_at > now() - (p_lookback_seconds || ' seconds')::INTERVAL
    AND (p_amount_cents IS NULL OR (r.amount * 100)::BIGINT = p_amount_cents)
    AND r.status::text NOT IN ('failed')
  ORDER BY r.requested_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('matched', false);
  END IF;

  RETURN jsonb_build_object(
    'matched',         true,
    'reversal_id',     v_reversal.reversal_id,
    'payment_id',      v_reversal.payment_id,
    'amount',          v_reversal.amount,
    'status',          v_reversal.status,
    'idempotency_key', v_reversal.idempotency_key,
    'reversal_type',   v_reversal.reversal_type,
    'captured_at',     v_reversal.captured_at
  );
END;
$$;

DROP FUNCTION IF EXISTS public.check_recent_refund(UUID, INTEGER, BIGINT);
GRANT EXECUTE ON FUNCTION public.check_recent_refund(UUID, INTEGER, BIGINT, UUID) TO authenticated;

COMMENT ON FUNCTION public.check_recent_refund IS
  'Wave R-2 retry-safety check: server-side lookup for a recent reversal matching order + optional amount/key. '
  'Mirrors check_recent_payment. Conservative: callers must treat any error/timeout as "cannot verify". '
  'Returns idempotency_key (NULL for legacy rows) so the recovery UI can distinguish own-pipeline '
  'replays from peer-station writes.';
