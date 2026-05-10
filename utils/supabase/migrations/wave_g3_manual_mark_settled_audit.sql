-- =====================================================================
-- Wave G.3 — manual_mark_batch_settled hardening (audit + required inputs)
-- =====================================================================
-- Why (review item #2): the original D.4 RPC checked merchant_id only.
-- Without a required reason, a non-null staff_id, or an audit row, the
-- "Mark settled (terminal already closed)" UI is a chargeback liability.
--
-- Changes:
--   1. New required input p_staff_id (Clerk userId / staff_id).
--   2. Reason must be non-empty + at least 10 characters after trim.
--   3. Per-payment payment_events INSERT with event_type='manual_mark_settled',
--      previous_status, new_status='settled', staff_id, reason for full
--      audit trail. One row per affected order_payments row.
--   4. Old 3-arg signature dropped to force callers to provide staff_id.
--
-- Apply AFTER:
--   - wave_d4_manual_mark_batch_settled (initial 3-arg version, applied
--     to staging only — no on-disk file).
-- =====================================================================

DROP FUNCTION IF EXISTS public.manual_mark_batch_settled(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.manual_mark_batch_settled(uuid, uuid, text, uuid);

CREATE OR REPLACE FUNCTION public.manual_mark_batch_settled(
    p_batch_uuid uuid,
    p_merchant_id uuid,
    p_reason text,
    p_staff_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_batch record;
    v_payment record;
    v_payment_count integer := 0;
    v_clean_reason text;
BEGIN
    v_clean_reason := NULLIF(TRIM(COALESCE(p_reason, '')), '');
    IF v_clean_reason IS NULL OR length(v_clean_reason) < 10 THEN
        RAISE EXCEPTION 'A reason of at least 10 characters is required to mark a batch settled manually.';
    END IF;
    IF p_staff_id IS NULL THEN
        RAISE EXCEPTION 'Staff id is required to mark a batch settled manually.';
    END IF;

    SELECT * INTO v_batch FROM public.settlement_batches WHERE id = p_batch_uuid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Settlement batch not found: %', p_batch_uuid; END IF;
    IF v_batch.merchant_id != p_merchant_id THEN
        RAISE EXCEPTION 'Access denied: batch % does not belong to merchant %', p_batch_uuid, p_merchant_id;
    END IF;
    IF v_batch.status = 'settled' THEN
        RAISE EXCEPTION 'Batch % is already settled.', p_batch_uuid;
    END IF;

    UPDATE public.settlement_batches
    SET status = 'settled',
        closed_at = COALESCE(closed_at, NOW()),
        settlement_date = COALESCE(settlement_date, CURRENT_DATE),
        last_attempt_at = NOW(),
        failure_reason = v_clean_reason,
        updated_at = NOW()
    WHERE id = p_batch_uuid;

    FOR v_payment IN
        SELECT id, order_id, location_id, amount, tip_amount, status, terminal_id, authorization_code
        FROM public.order_payments
        WHERE settlement_batch_id = p_batch_uuid
          AND is_settled = false
        FOR UPDATE
    LOOP
        UPDATE public.order_payments
        SET is_settled = true, settled_at = NOW()
        WHERE id = v_payment.id;

        INSERT INTO public.payment_events (
            payment_id, event_type, previous_status, new_status, amount, tip_amount,
            staff_id, terminal_id, auth_code, reason, event_timestamp,
            order_id, location_id, response_message
        ) VALUES (
            v_payment.id, 'manual_mark_settled', v_payment.status, 'settled',
            v_payment.amount, v_payment.tip_amount,
            p_staff_id, v_payment.terminal_id, v_payment.authorization_code, v_clean_reason, NOW(),
            v_payment.order_id, v_payment.location_id,
            'Manually reconciled - terminal had already closed this host batch.'
        );

        v_payment_count := v_payment_count + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'batch_id', v_batch.batch_id,
        'payments_marked_settled', v_payment_count
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.manual_mark_batch_settled(uuid, uuid, text, uuid) TO authenticated;

COMMENT ON FUNCTION public.manual_mark_batch_settled IS
    'Manual reconcile RPC. Marks a non-settled settlement_batches row + every linked unsettled order_payments row as settled. Requires non-empty reason >= 10 chars + non-null staff_id. Writes one payment_events row per affected payment with event_type=manual_mark_settled for chargeback/audit. Does NOT contact the terminal; use only when the terminal already closed the host batch in a prior session.';
