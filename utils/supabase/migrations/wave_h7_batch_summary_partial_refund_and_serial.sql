-- =====================================================================
-- Wave H.7 — Batch summary correctness + acquirer/serial on header
-- =====================================================================
-- Why: get_batch_summary_v1 lumped partially_refunded rows together with
-- fully refunded ones via the is_returned predicate. For our $114.31 sale
-- with a $33.75 partial refund this produced:
--   gross_sales = $11.16   (the partial-refund row dropped from gross)
--   refund     = $129.01  (full sale $95.26 + refunded_amount $33.75
--                          double-counted)
--   approvals  = 1         (only the captured row)
-- The receipt printed nonsensical totals (Net = $11.16 − $129.01).
--
-- Fix:
--   * gross_sales = SUM(amount) over every in_sales row. Sales count
--     fully, refunds reduce net via the refund column only.
--   * refund_amount = SUM(refunded_amount) over in_sales — refunded_amount
--     is authoritative for both partial and full refunds (full refund
--     rows have refunded_amount = total_amount).
--   * approvals_count = COUNT(in_sales) (every sale was approved at the
--     terminal). refunds_count counts rows with refunded_amount > 0.
--
-- Also adds:
--   * header.terminal_serial — payment_terminals.serial_number, surfaced
--     on the printed receipt.
--   * header.net_deposit — computed gross + tips − refunds so the print
--     template can fall back to it when the batch is still open and
--     settlement_batches.net_deposit is zero.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_batch_summary_v1(p_settlement_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_batch settlement_batches%ROWTYPE;
    v_terminal_type text;
    v_register_id text;
    v_terminal_name text;
    v_terminal_serial text;
    v_aggs jsonb;
    v_card_brands jsonb;
    v_entry_modes jsonb;
    v_methods jsonb;
    v_gross numeric;
    v_refunds numeric;
    v_tip numeric;
    v_net numeric;
BEGIN
    SELECT * INTO v_batch FROM settlement_batches WHERE id = p_settlement_batch_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'settlement_batches row % not found', p_settlement_batch_id; END IF;
    IF v_batch.merchant_id IS DISTINCT FROM user_merchant_id() THEN RAISE EXCEPTION 'Access denied: merchant scope mismatch'; END IF;
    IF NOT (v_batch.location_id = ANY(user_location_ids())) THEN RAISE EXCEPTION 'Access denied: location not in user scope'; END IF;

    SELECT pt.terminal_type::text, pt.register_id, pt.terminal_name, pt.serial_number
        INTO v_terminal_type, v_register_id, v_terminal_name, v_terminal_serial
        FROM payment_terminals pt WHERE pt.id = v_batch.payment_terminal_id;

    WITH src AS (
        SELECT p.payment_method, p.status, COALESCE(p.is_returned, false) AS is_returned,
            p.amount, COALESCE(p.refunded_amount, 0) AS refunded_amount,
            p.tip_amount, p.original_tip_amount,
            p.dual_pricing_fee, p.refunded_dual_pricing_fee, p.refunded_tip_fee,
            UPPER(COALESCE(NULLIF(p.card_type, ''), 'OTHER')) AS card_brand_raw,
            LOWER(COALESCE(
                NULLIF(p.processor_response ->> 'entry_type', ''),
                NULLIF(p.processor_response ->> 'entryType', ''),
                NULLIF(p.processor_response ->> 'entry_mode', ''),
                NULLIF(p.processor_response ->> 'entryMode', ''),
                NULLIF(p.terminal_response  ->> 'entry_type', ''),
                NULLIF(p.terminal_response  ->> 'entryType', ''),
                NULLIF(p.terminal_response  ->> 'entry_mode', ''),
                NULLIF(p.terminal_response  ->> 'entryMode', ''),
                'other'
            )) AS entry_mode_raw,
            (p.status IN ('captured','partially_refunded','refunded')
                OR (p.status = 'void' AND COALESCE(p.is_returned, false) = true)
            ) AS in_sales,
            (p.status = 'void' AND COALESCE(p.is_returned, false) = false) AS is_pure_void
        FROM order_payments p
        WHERE p.settlement_batch_id = p_settlement_batch_id
    ),
    brands AS (
        SELECT CASE WHEN card_brand_raw IN ('VISA','MASTERCARD','AMEX','DISCOVER') THEN card_brand_raw ELSE 'OTHER' END AS brand,
            COUNT(*) FILTER (WHERE in_sales) AS cnt,
            COALESCE(SUM(amount) FILTER (WHERE in_sales), 0) AS amt
        FROM src WHERE payment_method IN ('card','card_spinapi','card_dvpaylite','card_manual','card_online') GROUP BY 1
    ),
    modes AS (
        SELECT CASE WHEN entry_mode_raw IN ('chip','contactless','swipe','manual','fallback') THEN entry_mode_raw ELSE 'other' END AS mode,
            COUNT(*) FILTER (WHERE in_sales) AS cnt,
            COALESCE(SUM(amount) FILTER (WHERE in_sales), 0) AS amt
        FROM src WHERE payment_method IN ('card','card_spinapi','card_dvpaylite','card_manual','card_online') GROUP BY 1
    ),
    methods AS (
        SELECT CASE
            WHEN payment_method IN ('card','card_spinapi','card_dvpaylite','card_manual','card_online') THEN 'card'
            WHEN payment_method::text = 'cash' THEN 'cash'
            WHEN payment_method::text = 'gift_card' THEN 'gift_card'
            WHEN payment_method::text = 'house_account' THEN 'house_account'
            ELSE 'other'
        END AS method,
            COUNT(*) FILTER (WHERE in_sales) AS cnt,
            COALESCE(SUM(amount) FILTER (WHERE in_sales), 0) AS amt
        FROM src GROUP BY 1
    )
    SELECT
        jsonb_build_object(
            'gross_sales',         COALESCE(SUM(amount) FILTER (WHERE in_sales), 0),
            'refund_amount',       COALESCE(SUM(refunded_amount) FILTER (WHERE in_sales), 0),
            'tip_total',           COALESCE(SUM(tip_amount) FILTER (WHERE in_sales), 0),
            'refunded_tip_total',  COALESCE(SUM(refunded_tip_fee) FILTER (WHERE in_sales), 0),
            'dual_pricing_fee',    COALESCE(SUM(dual_pricing_fee) FILTER (WHERE in_sales), 0),
            'refunded_dual_pricing_fee', COALESCE(SUM(refunded_dual_pricing_fee) FILTER (WHERE in_sales), 0),
            'approvals_count',     COUNT(*) FILTER (WHERE in_sales),
            'refunds_count',       COUNT(*) FILTER (WHERE in_sales AND refunded_amount > 0),
            'voids_count',         COUNT(*) FILTER (WHERE is_pure_void),
            'voids_amount',        COALESCE(SUM(amount) FILTER (WHERE is_pure_void), 0),
            'tip_adjustments_count', COUNT(*) FILTER (WHERE in_sales AND original_tip_amount IS NOT NULL AND original_tip_amount IS DISTINCT FROM tip_amount)
        ),
        (SELECT jsonb_object_agg(brand, jsonb_build_object('amount', amt, 'count', cnt)) FROM brands),
        (SELECT jsonb_object_agg(mode,  jsonb_build_object('amount', amt, 'count', cnt)) FROM modes),
        (SELECT jsonb_object_agg(method, jsonb_build_object('amount', amt, 'count', cnt)) FROM methods)
    INTO v_aggs, v_card_brands, v_entry_modes, v_methods FROM src;

    v_gross   := COALESCE((v_aggs->>'gross_sales')::numeric, 0);
    v_refunds := COALESCE((v_aggs->>'refund_amount')::numeric, 0);
    v_tip     := COALESCE((v_aggs->>'tip_total')::numeric, 0);
    v_net     := ROUND(v_gross + v_tip - v_refunds, 2);

    RETURN jsonb_build_object(
        'header', jsonb_build_object(
            'settlement_batch_id', v_batch.id,
            'batch_id', v_batch.batch_id,
            'castles_batch_num', v_batch.castles_batch_num,
            'acquirer', v_batch.acquirer,
            'batch_number', v_batch.batch_number,
            'host_keyed', (v_batch.acquirer IS NOT NULL AND v_batch.batch_number IS NOT NULL),
            'business_date', v_batch.business_date,
            'business_date_start', v_batch.business_date_start,
            'business_date_end', v_batch.business_date_end,
            'opened_at', v_batch.opened_at,
            'closed_at', v_batch.closed_at,
            'settlement_date', v_batch.settlement_date,
            'funded_date', v_batch.funded_date,
            'status', v_batch.status,
            'processor', v_terminal_type,
            'terminal_id', v_batch.terminal_id,
            'terminal_name', v_terminal_name,
            'terminal_serial', v_terminal_serial,
            'register_id', v_register_id,
            'transaction_count', v_batch.transaction_count
        ),
        'sales', jsonb_build_object(
            'credit_total', COALESCE((v_methods->'card'->>'amount')::numeric, 0),
            'cash_total',   COALESCE((v_methods->'cash'->>'amount')::numeric, 0),
            'gift_total',   COALESCE((v_methods->'gift_card'->>'amount')::numeric, 0),
            'house_total',  COALESCE((v_methods->'house_account'->>'amount')::numeric, 0),
            'gross',        v_gross
        ),
        'refunds', jsonb_build_object(
            'count',  COALESCE((v_aggs->>'refunds_count')::int, 0),
            'amount', v_refunds
        ),
        'net', jsonb_build_object(
            'gross',       v_gross,
            'tips',        v_tip,
            'refunds',     v_refunds,
            'net_deposit', COALESCE(v_batch.net_deposit, v_net)
        ),
        'card_brands',  COALESCE(v_card_brands, '{}'::jsonb),
        'entry_modes',  COALESCE(v_entry_modes, '{}'::jsonb),
        'payment_methods', COALESCE(v_methods, '{}'::jsonb),
        'counts', jsonb_build_object(
            'approvals', COALESCE((v_aggs->>'approvals_count')::int, 0),
            'refunds',   COALESCE((v_aggs->>'refunds_count')::int, 0),
            'voids',     COALESCE((v_aggs->>'voids_count')::int, 0)
        ),
        'adjustments', jsonb_build_object(
            'voids_count',           COALESCE((v_aggs->>'voids_count')::int, 0),
            'voids_amount',          COALESCE((v_aggs->>'voids_amount')::numeric, 0),
            'tip_total',             v_tip,
            'refunded_tip_total',    COALESCE((v_aggs->>'refunded_tip_total')::numeric, 0),
            'tip_adjustments_count', COALESCE((v_aggs->>'tip_adjustments_count')::int, 0)
        ),
        'fees', jsonb_build_object(
            'dual_pricing_fee',          COALESCE((v_aggs->>'dual_pricing_fee')::numeric, 0),
            'refunded_dual_pricing_fee', COALESCE((v_aggs->>'refunded_dual_pricing_fee')::numeric, 0),
            'processor_fees',            v_batch.processor_fees,
            'interchange_fees',          v_batch.interchange_fees,
            'assessment_fees',           v_batch.assessment_fees
        )
    );
END;
$function$;
