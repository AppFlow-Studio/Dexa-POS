-- =====================================================================
-- Wave H.4 — get_batch_payments_v2 surfaces refunded_amount
-- =====================================================================
-- Why: BatchoutPanel drilldown showed payments with any partial refund as
-- "REFUNDED" without indicating how much, because v1 returned only
-- is_returned (boolean) and the status. A $33.75 partial refund on a
-- $114.31 sale rendered identically to a full refund.
--
-- v2 adds:
--   - refunded_amount (numeric, source: order_payments.refunded_amount)
--   - status now reliably surfaces 'partially_refunded' so the UI can
--     branch on it (already in v1, retained).
--
-- Caller switched to v2 in components/settings/batchout/BatchoutPanel.tsx.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_batch_payments_v2(
    p_settlement_batch_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_batch settlement_batches%ROWTYPE;
    v_result jsonb;
BEGIN
    SELECT * INTO v_batch FROM public.settlement_batches WHERE id = p_settlement_batch_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'settlement_batches row % not found', p_settlement_batch_id; END IF;
    IF v_batch.merchant_id IS DISTINCT FROM user_merchant_id() THEN
        RAISE EXCEPTION 'Access denied: merchant scope mismatch';
    END IF;
    IF NOT (v_batch.location_id = ANY(user_location_ids())) THEN
        RAISE EXCEPTION 'Access denied: location not in user scope';
    END IF;

    SELECT COALESCE(jsonb_agg(row ORDER BY captured_at_v DESC), '[]'::jsonb) INTO v_result
    FROM (
        SELECT
            jsonb_build_object(
                'id',                 op.id,
                'order_number',       o.order_number,
                'display_number',     o.display_number,
                'captured_at',        op.captured_at,
                'payment_method',     op.payment_method::text,
                'card_type',          op.card_type,
                'card_last_four',     op.card_last_four,
                'amount',             op.amount,
                'tip_amount',         op.tip_amount,
                'total_amount',       op.total_amount,
                'refunded_amount',    op.refunded_amount,
                'status',             op.status,
                'is_settled',         op.is_settled,
                'is_returned',        op.is_returned,
                'authorization_code', op.authorization_code,
                'transaction_id',     op.transaction_id,
                'rrn',                op.rrn,
                'batch_number',       op.batch_number,
                'acquirer',           op.acquirer
            ) AS row,
            op.captured_at AS captured_at_v
        FROM public.order_payments op
        LEFT JOIN public.orders o ON o.id = op.order_id
        WHERE op.settlement_batch_id = p_settlement_batch_id
    ) payments;

    RETURN v_result;
END;
$function$;
