-- =====================================================================
-- get_open_batches_v1 — Open (non-settled) settlement batches for a location
-- =====================================================================
-- Drop-in shape match for get_batches_with_live_totals_v1, with:
--   * scope is "anything not settled" instead of "this business day"
--   * payload includes business_date so the client can label rows that
--     span days
--   * payload includes payment_terminal_id + terminal_name +
--     terminal_serial so the client can split "this station's terminal"
--     vs "other terminals" in the UI
--
-- Used by BatchoutPanel's "Open Batches" list. Replaces the prior
-- business-day-scoped batch log so stuck batches from a prior session
-- (status in pending / settling / retry / failed / partial_failure) are
-- visible alongside the currently-accumulating open batch.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_open_batches_v1(
    p_location_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_result jsonb;
BEGIN
    IF NOT (p_location_id = ANY(user_location_ids())) THEN
        RAISE EXCEPTION 'Access denied: location not in user scope';
    END IF;

    SELECT COALESCE(jsonb_agg(row ORDER BY opened_at_v DESC), '[]'::jsonb) INTO v_result
    FROM (
        SELECT
            jsonb_build_object(
                'id',                  sb.id,
                'batch_id',            sb.batch_id,
                'status',              sb.status,
                'closed_at',           sb.closed_at,
                'opened_at',           sb.opened_at,
                'business_date',       sb.business_date,
                'acquirer',            sb.acquirer,
                'batch_number',        sb.batch_number,
                'payment_terminal_id', sb.payment_terminal_id,
                'terminal_name',       pt.terminal_name,
                'terminal_serial',     pt.serial_number,
                'transaction_count',   COALESCE(agg.txn_count, sb.transaction_count, 0),
                'gross_amount',        COALESCE(agg.gross_amount, sb.gross_amount, 0),
                'tip_amount',          COALESCE(agg.tip_amount, sb.tip_amount, 0),
                'net_deposit',         COALESCE(agg.net_deposit, sb.net_deposit, 0)
            ) AS row,
            sb.opened_at AS opened_at_v
        FROM public.settlement_batches sb
        LEFT JOIN public.payment_terminals pt
               ON pt.id = sb.payment_terminal_id
        LEFT JOIN LATERAL (
            SELECT
                COUNT(*) FILTER (
                    WHERE op.status IN ('captured','partially_refunded')
                      AND NOT COALESCE(op.is_voided, false)
                ) AS txn_count,
                COALESCE(SUM(op.amount) FILTER (
                    WHERE op.status IN ('captured','partially_refunded')
                      AND NOT COALESCE(op.is_voided, false)
                ), 0) AS gross_amount,
                COALESCE(SUM(op.tip_amount) FILTER (
                    WHERE op.status IN ('captured','partially_refunded')
                      AND NOT COALESCE(op.is_voided, false)
                ), 0) AS tip_amount,
                COALESCE(SUM(op.total_amount - COALESCE(op.refunded_amount, 0)) FILTER (
                    WHERE op.status IN ('captured','partially_refunded')
                      AND NOT COALESCE(op.is_voided, false)
                ), 0) AS net_deposit
            FROM public.order_payments op
            WHERE op.settlement_batch_id = sb.id
        ) agg ON TRUE
        WHERE sb.location_id = p_location_id
          AND sb.merchant_id = user_merchant_id()
          AND sb.status <> 'settled'
    ) batches;

    RETURN v_result;
END;
$function$;

COMMENT ON FUNCTION public.get_open_batches_v1(uuid)
IS 'Returns all non-settled settlement_batches for a location with live aggregations from order_payments, including payment_terminal_id + terminal_name + terminal_serial so the client can split "this station''s terminal" from other terminals. Powers BatchoutPanel "Open Batches" list.';
