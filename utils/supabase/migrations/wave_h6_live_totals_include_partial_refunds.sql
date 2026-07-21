-- =====================================================================
-- Wave H.6 — Live batch totals include partially-refunded payments
-- =====================================================================
-- Why: get_batches_with_live_totals_v1 aggregated only rows with
-- status='captured'. A partial refund flips order_payments.status to
-- 'partially_refunded', which made the payment disappear from the
-- BatchoutPanel header entirely (txn count -1, gross and tip dropped to
-- zero). The drilldown still showed it because that uses a different
-- RPC. Operator-visible recap drifted from reality.
--
-- Fix: include partially_refunded alongside captured. Sale (amount) and
-- tip continue to count fully; the refunded portion is netted against
-- net_deposit only. Fully voided rows and failed/pending stay excluded.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_batches_with_live_totals_v1(
    p_location_id uuid,
    p_business_day date
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
                'id',                sb.id,
                'batch_id',          sb.batch_id,
                'status',            sb.status,
                'closed_at',         sb.closed_at,
                'opened_at',         sb.opened_at,
                'acquirer',          sb.acquirer,
                'batch_number',      sb.batch_number,
                'transaction_count', COALESCE(agg.txn_count, sb.transaction_count, 0),
                'gross_amount',      COALESCE(agg.gross_amount, sb.gross_amount, 0),
                'tip_amount',        COALESCE(agg.tip_amount, sb.tip_amount, 0),
                'net_deposit',       COALESCE(agg.net_deposit, sb.net_deposit, 0)
            ) AS row,
            sb.opened_at AS opened_at_v
        FROM public.settlement_batches sb
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
          AND sb.business_date = p_business_day
    ) batches;

    RETURN v_result;
END;
$function$;
