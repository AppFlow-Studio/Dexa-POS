-- ============================================================
-- Fix: prepare_castles_settlement column / date-boundary issues
-- File: utils/supabase/migrations/fix_prepare_castles_settlement_column_refs.sql
-- ============================================================
-- Bug A (fatal):
--   "column 'updated_at' of relation 'order_payments' does not exist"
--
--   Step 9 of prepare_castles_settlement did:
--     UPDATE order_payments
--     SET settlement_batch_id = v_batch_uuid,
--         updated_at = NOW()   -- <-- column does not exist
--   The original author even left a TODO comment acknowledging
--   the assumption. order_payments has no generic updated_at
--   column; it uses event timestamps (initiated_at, authorized_at,
--   captured_at, voided_at, refunded_at, settled_at, approved_at,
--   etc.) instead. The correct fix is to drop the updated_at
--   assignment entirely — the audit trail for this change lives
--   on settlement_batches.updated_at and on settled_at (set
--   later by finalize_castles_settlement).
--
-- Bug B (latent, non-fatal):
--   Step 8 inserted:
--     business_date := CURRENT_DATE AT TIME ZONE 'America/New_York'
--
--   CURRENT_DATE returns the date in the SESSION time zone (UTC
--   on Supabase). Applying AT TIME ZONE to that implicitly casts
--   it through timestamp without time zone and back, producing a
--   timestamptz that, when cast to the date column, can land on
--   the wrong NY calendar day between ~8pm and midnight NY time.
--   The correct idiom is (NOW() AT TIME ZONE 'America/New_York')::date,
--   which gives "today in New York" regardless of session TZ.
--
-- Scope: staging only (project dfwqakoyittmrwbqvxgw). Prod does
-- not yet have prepare_castles_settlement; when the settlement
-- feature ships to prod, this corrected definition is what ships.
--
-- Audit status of the other Castles settlement RPCs:
--   finalize_castles_settlement → clean (no missing columns,
--     statuses match chk_settlement_status)
--   settle_castles_batch        → clean (status='closed', no
--     updated_at reference on order_payments, enum values valid)
-- ============================================================

CREATE OR REPLACE FUNCTION public.prepare_castles_settlement(
  p_terminal_id uuid,
  p_merchant_id uuid,
  p_initiated_by text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'public', 'pg_temp'
AS $function$
DECLARE
  v_terminal          record;
  v_payment_count     integer;
  v_date_start        date;
  v_date_end          date;
  v_gross             numeric(10,2);
  v_tips              numeric(10,2);
  v_total             numeric(10,2);
  v_batch_seq         integer;
  v_batch_id          text;
  v_batch_uuid        uuid;
  v_pos_txn_id        text;
  v_next_pos_txn_int  integer;
BEGIN

  -- ----------------------------------------------------------
  -- STEP 1: Lock the terminal row with FOR UPDATE.
  -- WHY: Prevents two simultaneous EOD attempts on the same
  --      terminal (e.g., manager + owner both clicking settle).
  --      The second caller waits here until the first commits.
  -- ----------------------------------------------------------
  SELECT * INTO v_terminal
  FROM public.payment_terminals
  WHERE id = p_terminal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Terminal not found: %', p_terminal_id;
  END IF;

  -- ----------------------------------------------------------
  -- STEP 2: Tenant isolation check.
  -- WHY: This RPC runs as SECURITY DEFINER (bypasses RLS).
  --      We must manually verify the terminal belongs to the
  --      calling merchant. Prevents cross-merchant data access.
  -- ----------------------------------------------------------
  IF v_terminal.merchant_id != p_merchant_id THEN
    RAISE EXCEPTION 'Access denied: terminal % does not belong to merchant %',
      p_terminal_id, p_merchant_id;
  END IF;

  -- ----------------------------------------------------------
  -- STEP 3: Auto-reset stale 'pending' batches for this terminal.
  -- WHY: If the POS app crashed after calling prepare but BEFORE
  --      sending the TCP request to Castles, the batch is stuck
  --      in 'pending' forever — blocking all future settlements.
  --      We auto-reset anything stuck for >10 minutes.
  -- ----------------------------------------------------------
  UPDATE public.settlement_batches
  SET
    status         = 'failed',
    failure_reason = 'Auto-reset: prepare was called but the Castles device was never contacted (app crash or timeout). Safe to retry.',
    updated_at     = NOW()
  WHERE
    payment_terminal_id = p_terminal_id
    AND status = 'pending'
    AND opened_at < (NOW() - INTERVAL '10 minutes');

  -- ----------------------------------------------------------
  -- STEP 4: Block if a settlement is ACTIVELY in progress.
  -- ----------------------------------------------------------
  IF EXISTS (
    SELECT 1
    FROM public.settlement_batches
    WHERE payment_terminal_id = p_terminal_id
      AND status IN ('pending', 'settling')
  ) THEN
    RAISE EXCEPTION 'A settlement is already in progress for terminal %. Wait or check for a stuck batch.', p_terminal_id;
  END IF;

  -- ----------------------------------------------------------
  -- STEP 5: Find all unsettled, captured payments for this terminal.
  -- ----------------------------------------------------------
  SELECT
    COUNT(*)                          AS pmt_count,
    MIN(op.approved_at::date)         AS earliest_date,
    MAX(op.approved_at::date)         AS latest_date,
    COALESCE(SUM(op.amount),     0)   AS gross_total,
    COALESCE(SUM(op.tip_amount), 0)   AS tip_total,
    COALESCE(SUM(op.total_amount),0)  AS grand_total
  INTO
    v_payment_count, v_date_start, v_date_end,
    v_gross, v_tips, v_total
  FROM public.order_payments op
  WHERE
    op.terminal_id         = p_terminal_id::text
    AND op.terminal_type   = 'castles'
    AND op.is_settled      = false
    AND op.status          = 'captured'
    AND op.settlement_batch_id IS NULL;

  IF v_payment_count = 0 THEN
    RAISE EXCEPTION 'No unsettled captured payments found for terminal %. All transactions may already be settled or none have been captured yet.', p_terminal_id;
  END IF;

  -- ----------------------------------------------------------
  -- STEP 6: Generate deterministic, human-readable batch_id.
  -- ----------------------------------------------------------
  SELECT COUNT(*) + 1
  INTO v_batch_seq
  FROM public.settlement_batches
  WHERE payment_terminal_id = p_terminal_id;

  v_batch_id := 'DEXA-'
    || UPPER(LEFT(REPLACE(p_terminal_id::text, '-', ''), 8))
    || '-'
    || TO_CHAR(NOW() AT TIME ZONE 'America/New_York', 'YYYYMMDD')
    || '-'
    || LPAD(v_batch_seq::text, 3, '0');

  -- ----------------------------------------------------------
  -- STEP 7: Generate next txnPosTxnId (rolling 000001–999999).
  -- ----------------------------------------------------------
  v_next_pos_txn_int := (
    (COALESCE(v_terminal.castles_last_pos_txn_id, '000000')::integer % 999999) + 1
  );
  v_pos_txn_id := LPAD(v_next_pos_txn_int::text, 6, '0');

  UPDATE public.payment_terminals
  SET
    castles_last_pos_txn_id = v_pos_txn_id,
    updated_at              = NOW()
  WHERE id = p_terminal_id;

  -- ----------------------------------------------------------
  -- STEP 8: Create the settlement batch record.
  --
  -- business_date uses (NOW() AT TIME ZONE 'America/New_York')::date
  -- so we always get "today in New York" regardless of the session
  -- time zone. The previous form `CURRENT_DATE AT TIME ZONE ...`
  -- round-tripped UTC's CURRENT_DATE through a naive timestamp and
  -- could land on the wrong NY calendar day near midnight.
  -- ----------------------------------------------------------
  INSERT INTO public.settlement_batches (
    batch_id,
    merchant_id,
    location_id,
    payment_terminal_id,
    terminal_id,              -- varchar legacy column — store UUID as text
    business_date,            -- NOT NULL: NY calendar date
    business_date_start,      -- earliest payment date in this batch
    business_date_end,        -- latest payment date in this batch
    transaction_count,
    gross_amount,
    tip_amount,
    net_deposit,
    status,
    castles_pos_txn_id,
    opened_at,
    created_at,
    updated_at
  )
  VALUES (
    v_batch_id,
    p_merchant_id,
    v_terminal.location_id,
    p_terminal_id,
    p_terminal_id::text,
    (NOW() AT TIME ZONE 'America/New_York')::date,
    v_date_start,
    v_date_end,
    v_payment_count,
    v_gross,
    v_tips,
    v_total,
    'pending',
    v_pos_txn_id,
    NOW(),
    NOW(),
    NOW()
  )
  RETURNING id INTO v_batch_uuid;

  -- ----------------------------------------------------------
  -- STEP 9: Tag all qualifying payments with this batch UUID.
  --
  -- NOTE: order_payments has no updated_at column — it tracks
  -- lifecycle via event timestamps (initiated_at, authorized_at,
  -- captured_at, voided_at, refunded_at, settled_at, approved_at).
  -- The old version of this function assigned updated_at here and
  -- failed at runtime. Do not re-add it.
  -- ----------------------------------------------------------
  UPDATE public.order_payments
  SET
    settlement_batch_id = v_batch_uuid
  WHERE
    terminal_id            = p_terminal_id::text
    AND terminal_type      = 'castles'
    AND is_settled         = false
    AND status             = 'captured'
    AND settlement_batch_id IS NULL;

  -- ----------------------------------------------------------
  -- STEP 10: Return everything the POS app needs.
  -- ----------------------------------------------------------
  RETURN jsonb_build_object(
    'batch_uuid',         v_batch_uuid,
    'batch_id',           v_batch_id,
    'payment_count',      v_payment_count,
    'gross_amount',       v_gross,
    'tip_amount',         v_tips,
    'total_amount',       v_total,
    'date_range', jsonb_build_object(
      'start', v_date_start,
      'end',   v_date_end
    ),
    'castles_request', jsonb_build_object(
      'txnPosTxnId', v_pos_txn_id,
      'txnType',     'settlement'
    )
  );

END;
$function$;
