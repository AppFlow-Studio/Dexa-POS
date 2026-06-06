-- =====================================================================
-- get_open_batches_v2 — Active + today's-closed settlement batches
-- =====================================================================
-- Replaces get_open_batches_v1's "anything not settled" scope, which let
-- failed / partial_failure / error / reversed / settled rows from prior
-- business days clutter the BatchoutPanel "Open Batches" list forever.
--
-- v2 scope:
--   * ACTIVE statuses always shown: 'open', 'pending', 'settling', 'retry'
--   * CLOSED statuses shown only if their business_date = p_today_business_date
--   * Adds is_closed_today boolean to the payload so the client can split
--     the list into "Closed Today" + "Open Batches" sub-sections without
--     re-deriving the status bucket on the client.
--
-- If p_today_business_date is NULL the closed-today branch is fully off
-- (returns only ACTIVE rows). Safe for legacy callers that don't pass it.
--
-- Same shape as v1 otherwise: payment_terminal_id + terminal_name +
-- terminal_serial so the client can split "this station" vs "other
-- terminals", and live aggregations from order_payments.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_open_batches_v2(
    p_location_id uuid,
    p_today_business_date date DEFAULT NULL
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
                'net_deposit',         COALESCE(agg.net_deposit, sb.net_deposit, 0),
                'is_closed_today',     (sb.status NOT IN ('open','pending','settling','retry'))
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
          AND (
              sb.status IN ('open', 'pending', 'settling', 'retry')
              OR (p_today_business_date IS NOT NULL AND sb.business_date = p_today_business_date)
          )
    ) batches;

    RETURN v_result;
END;
$function$;

COMMENT ON FUNCTION public.get_open_batches_v2(uuid, date)
IS 'Returns settlement_batches for a location scoped to (a) any active status (open/pending/settling/retry) or (b) any status whose business_date matches p_today_business_date. Each row includes is_closed_today so the client can split the list. Successor to get_open_batches_v1. Powers BatchoutPanel "Open Batches" + "Closed Today".';
