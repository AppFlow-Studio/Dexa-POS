-- =====================================================================
-- Wave H.10 — Manual resolution for dead-lettered payment sync ops
-- =====================================================================
-- Why: the Failed Sync Operations card in Settings shows payment ops that
-- exhausted 10 retries with the footer "Payment operations cannot be
-- discarded. They must be retried or resolved manually." Today there is
-- no in-app affordance for that manual resolution. The realistic failure
-- mode is: terminal succeeded, process_payment_v11 succeeded on the
-- server, but the response never reached the device → the device retries
-- forever. The operator needs to compare local vs remote and pick a
-- resolution.
--
-- This migration adds:
--   1. probe_payment_idempotency — looks up order_payments by
--      idempotency_key + order_id so the modal can show "Already applied
--      on server" with the actual remote payment row.
--   2. sync_resolution_events table — dedicated audit log. Not piggy-
--      backing on payment_events because that table requires payment_id
--      NOT NULL and our resolution may fire when no remote payment exists.
--   3. record_manual_sync_resolution RPC — writes the audit row with the
--      Wave G.3 envelope (reason ≥10 chars, staff_id required, controlled
--      vocabulary for resolution).
-- =====================================================================

-- 1) Audit table -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sync_resolution_events (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id      uuid NOT NULL,
    location_id      uuid NULL,
    order_id         uuid NULL,
    payment_id       uuid NULL,
    op_type          text NOT NULL,
    resolution       text NOT NULL
                       CHECK (resolution IN ('discarded','retried','force_resynced')),
    reason           text NOT NULL
                       CHECK (length(btrim(reason)) >= 10),
    -- staff_id is text, not uuid: Clerk user IDs like `user_38Op...` are
    -- the canonical identifier across our staff audit surfaces and they
    -- are not UUIDs. Wave G.3's payment_events.staff_id has the same
    -- latent type mismatch but isn't exercised by the same surface here.
    staff_id         text NOT NULL,
    idempotency_key  text NULL,
    metadata         jsonb NULL,
    created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sync_resolution_events_merchant_created_idx
    ON public.sync_resolution_events (merchant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS sync_resolution_events_order_idx
    ON public.sync_resolution_events (order_id)
    WHERE order_id IS NOT NULL;

ALTER TABLE public.sync_resolution_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sync_resolution_events_select_merchant
    ON public.sync_resolution_events;
CREATE POLICY sync_resolution_events_select_merchant
    ON public.sync_resolution_events
    FOR SELECT
    USING (merchant_id = user_merchant_id());

DROP POLICY IF EXISTS sync_resolution_events_insert_merchant
    ON public.sync_resolution_events;
CREATE POLICY sync_resolution_events_insert_merchant
    ON public.sync_resolution_events
    FOR INSERT
    WITH CHECK (merchant_id = user_merchant_id());

COMMENT ON TABLE public.sync_resolution_events IS
    'Audit log for operator-initiated manual resolutions of dead-lettered '
    'sync operations from the Failed Sync Operations card. One row per '
    'resolution. Distinct from payment_events because resolutions can '
    'fire when no remote payment exists (i.e. the queued op was a no-op).';


-- 2) Idempotency probe ------------------------------------------------
CREATE OR REPLACE FUNCTION public.probe_payment_idempotency(
    p_idempotency_key text,
    p_order_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_payment record;
    v_batch record;
BEGIN
    IF p_idempotency_key IS NULL OR length(btrim(p_idempotency_key)) = 0 THEN
        RETURN jsonb_build_object('found', false);
    END IF;

    SELECT op.id, op.order_id, op.status, op.amount, op.tip_amount,
           op.total_amount, op.refunded_amount,
           op.captured_at, op.settlement_batch_id, op.acquirer,
           op.batch_number, op.authorization_code, op.merchant_id,
           op.location_id
    INTO v_payment
    FROM public.order_payments op
    WHERE op.idempotency_key = p_idempotency_key
      AND op.merchant_id = user_merchant_id()
      AND (p_order_id IS NULL OR op.order_id = p_order_id)
    ORDER BY op.captured_at DESC NULLS LAST
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('found', false);
    END IF;

    IF v_payment.settlement_batch_id IS NOT NULL THEN
        SELECT sb.batch_id, sb.status AS batch_status, sb.acquirer, sb.batch_number
        INTO v_batch
        FROM public.settlement_batches sb
        WHERE sb.id = v_payment.settlement_batch_id;
    END IF;

    RETURN jsonb_build_object(
        'found', true,
        'payment_id', v_payment.id,
        'order_id', v_payment.order_id,
        'status', v_payment.status,
        'amount', v_payment.amount,
        'tip_amount', v_payment.tip_amount,
        'total_amount', v_payment.total_amount,
        'refunded_amount', v_payment.refunded_amount,
        'captured_at', v_payment.captured_at,
        'settlement_batch_id', v_payment.settlement_batch_id,
        'batch_id', COALESCE(v_batch.batch_id, NULL),
        'acquirer', v_payment.acquirer,
        'batch_number', v_payment.batch_number,
        'authorization_code', v_payment.authorization_code
    );
END;
$function$;


-- 3) Audit-write RPC ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_manual_sync_resolution(
    p_op_type text,
    p_resolution text,
    p_reason text,
    p_staff_id text,
    p_order_id uuid DEFAULT NULL::uuid,
    p_payment_id uuid DEFAULT NULL::uuid,
    p_idempotency_key text DEFAULT NULL::text,
    p_metadata jsonb DEFAULT NULL::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_audit_id uuid;
    v_merchant uuid := user_merchant_id();
    v_location uuid;
BEGIN
    IF v_merchant IS NULL THEN
        RAISE EXCEPTION 'merchant scope required';
    END IF;
    IF p_staff_id IS NULL OR length(btrim(p_staff_id)) = 0 THEN
        RAISE EXCEPTION 'staff_id required for audit';
    END IF;
    IF p_resolution NOT IN ('discarded','retried','force_resynced') THEN
        RAISE EXCEPTION 'invalid resolution: %', p_resolution;
    END IF;
    IF p_reason IS NULL OR length(btrim(p_reason)) < 10 THEN
        RAISE EXCEPTION 'reason must be at least 10 characters (audit trail)';
    END IF;
    IF p_op_type IS NULL OR length(btrim(p_op_type)) = 0 THEN
        RAISE EXCEPTION 'op_type required';
    END IF;

    -- Best-effort location lookup from the linked payment or order.
    IF p_payment_id IS NOT NULL THEN
        SELECT location_id INTO v_location FROM public.order_payments
        WHERE id = p_payment_id AND merchant_id = v_merchant;
    END IF;
    IF v_location IS NULL AND p_order_id IS NOT NULL THEN
        SELECT location_id INTO v_location FROM public.orders
        WHERE id = p_order_id AND merchant_id = v_merchant;
    END IF;

    INSERT INTO public.sync_resolution_events (
        merchant_id, location_id, order_id, payment_id,
        op_type, resolution, reason, staff_id,
        idempotency_key, metadata
    ) VALUES (
        v_merchant, v_location, p_order_id, p_payment_id,
        p_op_type, p_resolution, p_reason, p_staff_id,
        p_idempotency_key, p_metadata
    )
    RETURNING id INTO v_audit_id;

    RETURN jsonb_build_object('ok', true, 'audit_id', v_audit_id);
END;
$function$;
