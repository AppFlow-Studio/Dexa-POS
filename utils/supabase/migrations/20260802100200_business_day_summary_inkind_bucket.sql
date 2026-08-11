-- =====================================================================
-- Migration: closing/Z-report — in-kind gets its own bucket and is
--            excluded from net deposit and unsettled
-- =====================================================================
-- In-place CREATE OR REPLACE of get_business_day_activity_summary_v1
-- (SAME name + 3-arg signature). Read-only reporting function with no
-- idempotency or money-write semantics, so it is replaced rather than
-- forked: every existing client build picks up the corrected numbers
-- immediately, which is the desired behaviour for a reporting fix.
--
-- Context: 20260802100000_payment_method_add_inkind.sql adds the 'inkind'
-- payment method — a non-tender settlement that marks a check paid at
-- card pricing while collecting no money.
--
-- Why this function needs changing (it is the ONLY reporting RPC that
-- sees in-kind at all — get_batch_summary_v1 filters on
-- settlement_batch_id, which in-kind never receives, so it is correctly
-- blind to in-kind and needs no change):
--
--   1. methods bucket — 'inkind' fell into the ELSE 'other' arm. Safe,
--      but unlabelled, so the closing report could not show it.
--
--   2. net.net_deposit — THE ACTUAL BUG. net_deposit is a money-movement
--      figure (gross_sales - refunds), and gross_sales sums every
--      in_sales payment regardless of method. An in-kind settlement would
--      therefore inflate the deposit a merchant reconciles against the
--      bank by money that never existed. In-kind is now netted out of
--      both sides (its own gross, and any of it that was refunded).
--
--   3. unsettled — in-kind never settles (no acquirer/batch_number means
--      the lazy settlement-batch trigger skips it, and is_settled stays
--      false forever). Left alone it would accumulate in the "still needs
--      to batch out" figure permanently, sending cashiers hunting for a
--      batchout that can never clear it.
--
-- sales.gross deliberately STAYS inclusive of in-kind: it is gross
-- revenue posted, and the new explicit in-kind line plus the corrected
-- net_deposit make the deduction auditable on the printed report:
--
--     Gross        $465.00
--     Refunds       -$0.00
--     In-Kind      -$45.00      <- posted revenue, no funds collected
--     Net Deposit  $420.00
--
-- Apply AFTER: 20260802100000_payment_method_add_inkind.sql
-- Rollback: 20260802100200_business_day_summary_inkind_bucket_rollback.sql
--   (re-applies get_business_day_activity_summary_v1.sql verbatim).
--
-- Original v1 header follows.
-- ---------------------------------------------------------------------
-- Migration: get_business_day_activity_summary_v1 — closing/Z-report
-- =====================================================================
-- Aggregates order_payments by business-day window, NOT by
-- settlement_batch_id. This is the cashier's end-of-day closing report
-- that has to work *before* batchout has been executed.
--
-- Phase 1 (get_business_day_summary_v1) only counted settled batches —
-- if no batchout had run, every total returned $0.00 even when the
-- terminal had captured hundreds of dollars of sales. This RPC fixes
-- that by reading directly from order_payments.
--
-- Window resolved via existing get_business_day_bounds(location, date).
-- Optional terminal filter scopes to one register's till.
--
-- entry_mode is derived inline from processor_response/terminal_response
-- JSONB (matches pci_safe_order_payments view; LEFT JOINing the view
-- forces a full scan).
--
-- Refund/void discriminator (project_voided_payment_refunded_amount):
--   * status IN ('captured','partially_refunded','refunded'): real sale
--   * status='void' AND is_returned=true: refund-via-void
--   * status='void' AND is_returned=false: pure cancellation (voids)
--
-- Returns the same JSONB shape as get_batch_summary_v1 plus an
-- `unsettled` block and a `batches` array listing any settlement_batches
-- that overlap the window — `[]` while the batch is open.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_business_day_activity_summary_v1(
  p_location_id   uuid,
  p_business_date date  DEFAULT NULL,
  p_terminal_id   uuid  DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_bounds       RECORD;
  v_terminal_type text;
  v_terminal_name text;
  v_register_id   text;
  v_aggs          jsonb;
  v_card_brands   jsonb;
  v_entry_modes   jsonb;
  v_methods       jsonb;
  v_batches       jsonb;
BEGIN
  IF NOT (p_location_id = ANY(user_location_ids())) THEN
    RAISE EXCEPTION 'Access denied: location not in user scope';
  END IF;

  SELECT * INTO v_bounds
    FROM get_business_day_bounds(p_location_id, p_business_date);

  IF p_terminal_id IS NOT NULL THEN
    SELECT pt.terminal_type::text, pt.terminal_name, pt.register_id
      INTO v_terminal_type, v_terminal_name, v_register_id
      FROM payment_terminals pt
     WHERE pt.id = p_terminal_id;
  END IF;

  WITH src AS (
    SELECT
      p.payment_method,
      p.status,
      COALESCE(p.is_returned, false)  AS is_returned,
      COALESCE(p.is_settled, false)   AS is_settled,
      p.amount,
      p.refunded_amount,
      p.tip_amount,
      p.original_tip_amount,
      p.dual_pricing_fee,
      p.refunded_dual_pricing_fee,
      p.refunded_tip_fee,
      UPPER(COALESCE(NULLIF(p.card_type, ''), 'OTHER')) AS card_brand_raw,
      LOWER(COALESCE(
        -- Top-level (legacy / generic)
        NULLIF(p.processor_response ->> 'entry_type', ''),
        NULLIF(p.processor_response ->> 'entryType', ''),
        NULLIF(p.processor_response ->> 'entry_mode', ''),
        NULLIF(p.processor_response ->> 'entryMode', ''),
        -- Castles nested
        NULLIF(p.processor_response -> 'castles_transaction' ->> 'entryMode', ''),
        NULLIF(p.processor_response -> 'castles_transaction' ->> 'entry_mode', ''),
        NULLIF(p.processor_response -> 'raw_castles_response' -> 'data' ->> 'entryMode', ''),
        -- Dejavoo nested
        NULLIF(p.processor_response -> 'dejavoo_transaction' ->> 'entryMode', ''),
        NULLIF(p.processor_response -> 'dejavoo_transaction' ->> 'entryType', ''),
        -- terminal_response fallback (older code path)
        NULLIF(p.terminal_response  ->> 'entry_type', ''),
        NULLIF(p.terminal_response  ->> 'entryType', ''),
        NULLIF(p.terminal_response  ->> 'entry_mode', ''),
        NULLIF(p.terminal_response  ->> 'entryMode', ''),
        NULLIF(p.terminal_response  -> 'castles_transaction' ->> 'entryMode', ''),
        NULLIF(p.terminal_response  -> 'dejavoo_transaction' ->> 'entryMode', ''),
        'other'
      )) AS entry_mode_raw,
      (p.status IN ('captured','partially_refunded','refunded')
        OR (p.status = 'void' AND COALESCE(p.is_returned, false) = true)
      ) AS in_sales,
      (p.status = 'void' AND COALESCE(p.is_returned, false) = false) AS is_pure_void
    FROM order_payments p
    WHERE p.location_id = p_location_id
      AND p.captured_at >= v_bounds.start_ts
      AND p.captured_at <  v_bounds.end_ts
      AND (p_terminal_id IS NULL OR p.terminal_id = p_terminal_id::text)
  ),
  brands AS (
    SELECT
      CASE WHEN card_brand_raw IN ('VISA','MASTERCARD','AMEX','DISCOVER')
           THEN card_brand_raw ELSE 'OTHER' END AS brand,
      COUNT(*) FILTER (WHERE in_sales) AS cnt,
      COALESCE(SUM(amount) FILTER (WHERE in_sales), 0) AS amt
    FROM src
    WHERE payment_method IN ('card','card_spinapi','card_dvpaylite','card_manual','card_online')
    GROUP BY 1
  ),
  modes AS (
    SELECT
      CASE WHEN entry_mode_raw IN ('chip','contactless','swipe','manual','fallback')
           THEN entry_mode_raw ELSE 'other' END AS mode,
      COUNT(*) FILTER (WHERE in_sales) AS cnt,
      COALESCE(SUM(amount) FILTER (WHERE in_sales), 0) AS amt
    FROM src
    WHERE payment_method IN ('card','card_spinapi','card_dvpaylite','card_manual','card_online')
    GROUP BY 1
  ),
  methods AS (
    SELECT
      CASE
        WHEN payment_method IN ('card','card_spinapi','card_dvpaylite','card_manual','card_online') THEN 'card'
        WHEN payment_method::text = 'cash' THEN 'cash'
        WHEN payment_method::text = 'gift_card' THEN 'gift_card'
        WHEN payment_method::text = 'house_account' THEN 'house_account'
        -- Non-tender settlement: card-priced, zero funds collected. Its own
        -- bucket so it is never conflated with cash or card.
        WHEN payment_method::text = 'inkind' THEN 'inkind'
        ELSE 'other'
      END AS method,
      COUNT(*) FILTER (WHERE in_sales) AS cnt,
      COALESCE(SUM(amount) FILTER (WHERE in_sales), 0) AS amt
    FROM src
    GROUP BY 1
  )
  SELECT
    jsonb_build_object(
      'gross_sales',         COALESCE(SUM(amount) FILTER (WHERE in_sales AND NOT is_returned), 0),
      'refund_amount',       COALESCE(SUM(amount) FILTER (WHERE in_sales AND is_returned), 0)
                              + COALESCE(SUM(refunded_amount) FILTER (WHERE in_sales), 0),
      'tip_total',           COALESCE(SUM(tip_amount) FILTER (WHERE in_sales), 0),
      'refunded_tip_total',  COALESCE(SUM(refunded_tip_fee) FILTER (WHERE in_sales), 0),
      'dual_pricing_fee',    COALESCE(SUM(dual_pricing_fee) FILTER (WHERE in_sales), 0),
      'refunded_dual_pricing_fee',
                             COALESCE(SUM(refunded_dual_pricing_fee) FILTER (WHERE in_sales), 0),
      'approvals_count',     COUNT(*) FILTER (WHERE in_sales AND NOT is_returned),
      'refunds_count',       COUNT(*) FILTER (WHERE in_sales AND is_returned),
      'voids_count',         COUNT(*) FILTER (WHERE is_pure_void),
      'voids_amount',        COALESCE(SUM(amount) FILTER (WHERE is_pure_void), 0),
      'tip_adjustments_count',
                             COUNT(*) FILTER (WHERE in_sales AND original_tip_amount IS NOT NULL
                                              AND original_tip_amount IS DISTINCT FROM tip_amount),
      -- In-kind can never settle: with no acquirer/batch_number the lazy
      -- settlement-batch trigger skips it and is_settled stays false
      -- forever. Excluded here so it does not accumulate permanently in
      -- the "still needs to batch out" figure.
      'unsettled_count',     COUNT(*) FILTER (WHERE in_sales AND NOT is_settled
                                              AND payment_method::text <> 'inkind'),
      'unsettled_amount',    COALESCE(SUM(amount) FILTER (WHERE in_sales AND NOT is_settled
                                              AND payment_method::text <> 'inkind'), 0),
      -- In-kind netting for net_deposit (money-movement figure). Tracked on
      -- both sides so a refunded in-kind settlement does not double-subtract.
      'inkind_gross',        COALESCE(SUM(amount) FILTER (WHERE in_sales AND NOT is_returned
                                              AND payment_method::text = 'inkind'), 0),
      'inkind_refunds',      COALESCE(SUM(amount) FILTER (WHERE in_sales AND is_returned
                                              AND payment_method::text = 'inkind'), 0)
                              + COALESCE(SUM(refunded_amount) FILTER (WHERE in_sales
                                              AND payment_method::text = 'inkind'), 0),
      'transaction_count',   COUNT(*) FILTER (WHERE in_sales OR is_pure_void)
    ),
    (SELECT jsonb_object_agg(brand, jsonb_build_object('amount', amt, 'count', cnt)) FROM brands),
    (SELECT jsonb_object_agg(mode,  jsonb_build_object('amount', amt, 'count', cnt)) FROM modes),
    (SELECT jsonb_object_agg(method, jsonb_build_object('amount', amt, 'count', cnt)) FROM methods)
  INTO v_aggs, v_card_brands, v_entry_modes, v_methods
  FROM src;

  -- Settlement batches that opened in this window (zero or more).
  -- "OPEN BATCH" state is signalled by an empty array.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',                sb.id,
    'castles_batch_num', sb.castles_batch_num,
    'status',            sb.status,
    'opened_at',         sb.opened_at,
    'closed_at',         sb.closed_at,
    'settlement_date',   sb.settlement_date,
    'funded_date',       sb.funded_date,
    'net_deposit',       sb.net_deposit,
    'transaction_count', sb.transaction_count
  ) ORDER BY sb.created_at), '[]'::jsonb)
    INTO v_batches
    FROM settlement_batches sb
   WHERE sb.location_id = p_location_id
     AND sb.created_at >= v_bounds.start_ts
     AND sb.created_at <  v_bounds.end_ts
     AND (p_terminal_id IS NULL OR sb.payment_terminal_id = p_terminal_id);

  RETURN jsonb_build_object(
    'header', jsonb_build_object(
      'kind',                'closing_report',
      'business_date',       COALESCE(p_business_date, (v_bounds.start_ts AT TIME ZONE 'UTC')::date),
      'business_date_start', v_bounds.start_ts,
      'business_date_end',   v_bounds.end_ts,
      'terminal_id',         p_terminal_id,
      'terminal_name',       v_terminal_name,
      'register_id',         v_register_id,
      'processor',           v_terminal_type,
      'status',              CASE WHEN v_batches = '[]'::jsonb THEN 'OPEN' ELSE 'CLOSED' END,
      'transaction_count',   COALESCE((v_aggs->>'transaction_count')::int, 0)
    ),
    'sales', jsonb_build_object(
      'credit_total', COALESCE((v_methods->'card'->>'amount')::numeric, 0),
      'cash_total',   COALESCE((v_methods->'cash'->>'amount')::numeric, 0),
      'gift_total',   COALESCE((v_methods->'gift_card'->>'amount')::numeric, 0),
      'house_total',  COALESCE((v_methods->'house_account'->>'amount')::numeric, 0),
      -- Posted revenue with no funds collected. Included in `gross` below,
      -- deducted again in net.net_deposit so the deduction is auditable.
      'inkind_total', COALESCE((v_methods->'inkind'->>'amount')::numeric, 0),
      'gross',        COALESCE((v_aggs->>'gross_sales')::numeric, 0)
    ),
    'refunds', jsonb_build_object(
      'count',  COALESCE((v_aggs->>'refunds_count')::int, 0),
      'amount', COALESCE((v_aggs->>'refund_amount')::numeric, 0)
    ),
    'net', jsonb_build_object(
      'gross',       COALESCE((v_aggs->>'gross_sales')::numeric, 0),
      'refunds',     COALESCE((v_aggs->>'refund_amount')::numeric, 0),
      -- Surfaced so the printed report can show the deduction on its own
      -- line rather than silently shrinking net_deposit.
      'inkind',      COALESCE((v_aggs->>'inkind_gross')::numeric, 0)
                     - COALESCE((v_aggs->>'inkind_refunds')::numeric, 0),
      -- net_deposit is money that actually moved. In-kind is netted out of
      -- both sides: its gross never arrived, and anything reversed from it
      -- was never a real refund either.
      'net_deposit', COALESCE((v_aggs->>'gross_sales')::numeric, 0)
                     - COALESCE((v_aggs->>'refund_amount')::numeric, 0)
                     - COALESCE((v_aggs->>'inkind_gross')::numeric, 0)
                     + COALESCE((v_aggs->>'inkind_refunds')::numeric, 0)
    ),
    'card_brands',     COALESCE(v_card_brands, '{}'::jsonb),
    'entry_modes',     COALESCE(v_entry_modes, '{}'::jsonb),
    'payment_methods', COALESCE(v_methods, '{}'::jsonb),
    'counts', jsonb_build_object(
      'approvals', COALESCE((v_aggs->>'approvals_count')::int, 0),
      'refunds',   COALESCE((v_aggs->>'refunds_count')::int, 0),
      'voids',     COALESCE((v_aggs->>'voids_count')::int, 0)
    ),
    'adjustments', jsonb_build_object(
      'voids_count',           COALESCE((v_aggs->>'voids_count')::int, 0),
      'voids_amount',          COALESCE((v_aggs->>'voids_amount')::numeric, 0),
      'tip_total',             COALESCE((v_aggs->>'tip_total')::numeric, 0),
      'refunded_tip_total',    COALESCE((v_aggs->>'refunded_tip_total')::numeric, 0),
      'tip_adjustments_count', COALESCE((v_aggs->>'tip_adjustments_count')::int, 0)
    ),
    'fees', jsonb_build_object(
      'dual_pricing_fee',          COALESCE((v_aggs->>'dual_pricing_fee')::numeric, 0),
      'refunded_dual_pricing_fee', COALESCE((v_aggs->>'refunded_dual_pricing_fee')::numeric, 0),
      'processor_fees',            null,
      'interchange_fees',          null,
      'assessment_fees',           null
    ),
    'unsettled', jsonb_build_object(
      'count',  COALESCE((v_aggs->>'unsettled_count')::int, 0),
      'amount', COALESCE((v_aggs->>'unsettled_amount')::numeric, 0)
    ),
    'batches', v_batches
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_business_day_activity_summary_v1(uuid, date, uuid) TO authenticated;

COMMENT ON FUNCTION public.get_business_day_activity_summary_v1 IS
  'Closing/Z-report aggregator. Reads order_payments by captured_at in business-day window (independent of settlement_batch_id), so the cashier can print before batchout. Optional terminal_id scopes to a single register. 2026-08-02: ''inkind'' (non-tender, card-priced settlement) gets its own methods bucket and sales.inkind_total; it is netted out of net.net_deposit (money never moved) and excluded from unsettled (it can never batch out). sales.gross stays inclusive of in-kind, with net.inkind exposing the deduction.';
