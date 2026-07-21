-- =====================================================================
-- Wave H.9 — Unsettled summary includes partially-refunded payments
-- =====================================================================
-- Why: get_unsettled_summary_by_terminal filtered op.status = 'captured'.
-- A partial refund flips status to 'partially_refunded', so the payment
-- disappeared from the Unsettled Payments header in BatchoutPanel. Same
-- root cause as H.6 (live batch totals) — different RPC.
--
-- Fix: include partially_refunded; sale + tip count fully; refunded_amount
-- nets against total_amount only. Fully voided / failed / pending stay
-- excluded (they aren't unsettled obligations).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_unsettled_summary_by_terminal(
    p_merchant_id uuid,
    p_location_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
    terminal_uuid uuid, terminal_name text, terminal_type text,
    castles_ip_address text, castles_port integer,
    is_active boolean, is_connected boolean,
    payment_count bigint, gross_amount numeric, tip_amount numeric, total_amount numeric,
    oldest_payment_date date, newest_payment_date date, day_span integer,
    has_stuck_batch boolean, stuck_batch_status text, stuck_batch_uuid uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    RETURN QUERY
    SELECT
        pt.id                       AS terminal_uuid,
        pt.terminal_name            AS terminal_name,
        pt.terminal_type            AS terminal_type,
        pt.castles_ip_address       AS castles_ip_address,
        pt.castles_port             AS castles_port,
        pt.is_active                AS is_active,
        pt.is_connected             AS is_connected,

        COUNT(op.id)                AS payment_count,
        -- gross/tip count the full sale and tip; refund nets against
        -- total_amount only (consistent with H.6 live-totals semantics).
        COALESCE(SUM(op.amount), 0)       AS gross_amount,
        COALESCE(SUM(op.tip_amount), 0)   AS tip_amount,
        COALESCE(SUM(op.total_amount - COALESCE(op.refunded_amount, 0)), 0) AS total_amount,
        MIN(op.approved_at::date)   AS oldest_payment_date,
        MAX(op.approved_at::date)   AS newest_payment_date,

        COALESCE(
            (MAX(op.approved_at::date) - MIN(op.approved_at::date)) + 1,
            0
        )::integer AS day_span,

        (EXISTS (
            SELECT 1 FROM public.settlement_batches sb
            WHERE sb.payment_terminal_id = pt.id
              AND sb.status IN ('failed', 'retry', 'terminal_unavailable')
        )) AS has_stuck_batch,

        (SELECT sb.status::text FROM public.settlement_batches sb
         WHERE sb.payment_terminal_id = pt.id
           AND sb.status IN ('failed', 'retry', 'terminal_unavailable')
         ORDER BY sb.opened_at DESC LIMIT 1) AS stuck_batch_status,

        (SELECT sb.id FROM public.settlement_batches sb
         WHERE sb.payment_terminal_id = pt.id
           AND sb.status IN ('failed', 'retry', 'terminal_unavailable')
         ORDER BY sb.opened_at DESC LIMIT 1) AS stuck_batch_uuid

    FROM public.payment_terminals pt
    LEFT JOIN public.order_payments op ON
        op.terminal_id       = pt.id::text
        AND op.terminal_type = 'castles'
        AND op.is_settled    = false
        AND op.status IN ('captured', 'partially_refunded')
        AND NOT COALESCE(op.is_voided, false)

    WHERE
        pt.merchant_id = p_merchant_id
        AND pt.terminal_type = 'castles'
        AND pt.is_active = true
        AND (p_location_id IS NULL OR pt.location_id = p_location_id)

    GROUP BY
        pt.id, pt.terminal_name, pt.terminal_type,
        pt.castles_ip_address, pt.castles_port,
        pt.is_active, pt.is_connected;
END;
$function$;
