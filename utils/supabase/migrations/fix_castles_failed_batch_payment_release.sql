-- ============================================================
-- Fix: release order_payments from 'failed' settlement batches
-- File: utils/supabase/migrations/fix_castles_failed_batch_payment_release.sql
-- ============================================================
-- Bug (user-reported):
--   After a failed Castles settlement (e.g., Castles returned
--   E000000E "repeated transaction ID"), the next Settle tap
--   threw "No unsettled captured payments found for terminal ..."
--   even though 10 captured payments were clearly unsettled on
--   both the terminal and in order_payments.
--
-- Root cause:
--   prepare_castles_settlement Step 5 filters on
--     op.settlement_batch_id IS NULL
--   to avoid double-tagging payments to a new batch.
--
--   finalize_castles_settlement Step 9 only cleared
--   settlement_batch_id when the final status was 'retry'. For
--   'failed' status, it left the payments tagged to the failed
--   batch (original intent: "keep for audit, manually clear"),
--   but the app UI has no manual-clear action — its Settlement
--   screen actually promises "the previous batch will be
--   resolved automatically."
--
--   Additionally: prepare_castles_settlement Step 3 marks stale
--   'pending' batches as 'failed' but also leaves their payments
--   orphaned to the now-failed batch — same bug class.
--
-- Why releasing on 'failed' is safe:
--   finalize_castles_settlement only reaches 'failed' when no
--   acquirer in txnSettleInfo returned success '00000000'. If
--   any acquirer settled, it routes to 'partial_failure' which
--   marks the payments as settled in Step 8. So 'failed' means
--   nothing was batched out on the device — the payments are
--   still live and eligible for a fresh settlement attempt. The
--   failed settlement_batches row stays intact as an audit
--   record (raw_response, failure_reason, counts, etc.).
--
-- Fix:
--   1. finalize_castles_settlement Step 9: clear
--      settlement_batch_id when final status is IN ('retry',
--      'failed'). Previously only 'retry'.
--   2. prepare_castles_settlement Step 3: after the stale-pending
--      auto-reset, defensively release order_payments tied to
--      ANY 'failed' settlement batch on this terminal. Idempotent.
--      Handles:
--        a) new failures after fix 1
--        b) pre-fix orphaned payments already stuck in the DB
--        c) stale-pending → failed transitions from Step 3 itself
--
-- Scope: staging only (dfwqakoyittmrwbqvxgw). Prod doesn't yet
-- have either function.
-- ============================================================


-- ------------------------------------------------------------
-- prepare_castles_settlement  (adds Step 3b defensive release)
-- ------------------------------------------------------------
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
  -- ----------------------------------------------------------
  IF v_terminal.merchant_id != p_merchant_id THEN
    RAISE EXCEPTION 'Access denied: terminal % does not belong to merchant %',
      p_terminal_id, p_merchant_id;
  END IF;

  -- ----------------------------------------------------------
  -- STEP 3a: Auto-reset stale 'pending' batches for this terminal.
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
  -- STEP 3b: Release order_payments tagged to ANY failed batch
  -- on this terminal. Idempotent defensive cleanup.
  --
  -- A 'failed' batch means nothing was successfully batched out
  -- on the Castles device (partial_failure handles "some acquirers
  -- settled" — those payments are already marked is_settled=true).
  -- So the payments are still eligible for a fresh attempt. The
  -- failed settlement_batches row is preserved as an audit record.
  --
  -- This also catches the stale-pending-just-flipped-to-failed
  -- rows from Step 3a above, and any pre-fix orphans stuck in
  -- the DB from a time when finalize didn't clear failed batches.
  -- ----------------------------------------------------------
  UPDATE public.order_payments op
  SET settlement_batch_id = NULL
  FROM public.settlement_batches sb
  WHERE
    op.settlement_batch_id = sb.id
    AND sb.payment_terminal_id = p_terminal_id
    AND sb.status = 'failed';

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
    COUNT(*),
    MIN(op.approved_at::date),
    MAX(op.approved_at::date),
    COALESCE(SUM(op.amount),     0),
    COALESCE(SUM(op.tip_amount), 0),
    COALESCE(SUM(op.total_amount),0)
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
  -- ----------------------------------------------------------
  INSERT INTO public.settlement_batches (
    batch_id,
    merchant_id,
    location_id,
    payment_terminal_id,
    terminal_id,
    business_date,
    business_date_start,
    business_date_end,
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
  -- (No updated_at — order_payments has no such column.)
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


-- ------------------------------------------------------------
-- finalize_castles_settlement  (Step 9 clears retry OR failed)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finalize_castles_settlement(
  p_batch_uuid uuid,
  p_merchant_id uuid,
  p_castles_response jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'public', 'pg_temp'
AS $function$
DECLARE
  v_batch             record;
  v_return_code       text;
  v_final_status      text;
  v_settle_entry      jsonb;
  v_all_acquirers_ok  boolean := true;
  v_any_acquirer_ok   boolean := false;
  v_failed_acquirers  jsonb   := '[]'::jsonb;
  v_settled_acquirers jsonb   := '[]'::jsonb;
BEGIN

  SELECT * INTO v_batch
  FROM public.settlement_batches
  WHERE id = p_batch_uuid
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Settlement batch not found: %', p_batch_uuid;
  END IF;

  IF v_batch.merchant_id != p_merchant_id THEN
    RAISE EXCEPTION 'Access denied: batch % does not belong to merchant %',
      p_batch_uuid, p_merchant_id;
  END IF;

  IF v_batch.status = 'settled' THEN
    RAISE EXCEPTION 'Batch % is already settled. Cannot finalize again.', p_batch_uuid;
  END IF;

  IF v_batch.status NOT IN ('pending', 'settling', 'retry', 'failed') THEN
    RAISE EXCEPTION 'Batch % is in status %. Expected pending/settling/retry/failed.',
      p_batch_uuid, v_batch.status;
  END IF;

  v_return_code := p_castles_response->>'txnReturnCode';

  IF p_castles_response ? 'txnSettleInfo' THEN
    FOR v_settle_entry IN
      SELECT value FROM jsonb_array_elements(p_castles_response->'txnSettleInfo')
    LOOP
      IF (v_settle_entry->>'txnReturnCode') = '00000000' THEN
        v_any_acquirer_ok   := true;
        v_settled_acquirers := v_settled_acquirers || jsonb_build_array(
          v_settle_entry->>'txnAcquirerName'
        );
      ELSE
        v_all_acquirers_ok := false;
        v_failed_acquirers := v_failed_acquirers || jsonb_build_array(
          jsonb_build_object(
            'acquirer',    v_settle_entry->>'txnAcquirerName',
            'return_code', v_settle_entry->>'txnReturnCode',
            'message',     v_settle_entry->>'txnHostMsg'
          )
        );
      END IF;
    END LOOP;
  ELSE
    v_all_acquirers_ok := (v_return_code = '00000000');
    v_any_acquirer_ok  := v_all_acquirers_ok;
  END IF;

  v_final_status := CASE
    WHEN v_all_acquirers_ok                       THEN 'settled'
    WHEN v_any_acquirer_ok AND NOT v_all_acquirers_ok THEN 'partial_failure'
    WHEN v_return_code = 'E000002A'               THEN 'retry'
    ELSE                                               'failed'
  END;

  UPDATE public.settlement_batches
  SET
    status               = v_final_status,
    closed_at            = CASE WHEN v_final_status IN ('settled', 'partial_failure') THEN NOW() ELSE closed_at END,
    settlement_date      = CASE WHEN v_final_status IN ('settled', 'partial_failure') THEN CURRENT_DATE ELSE settlement_date END,
    retry_count          = retry_count + 1,
    last_attempt_at      = NOW(),
    castles_return_code  = v_return_code,
    castles_batch_num    = p_castles_response->>'txnBatchNum',
    castles_settle_info  = p_castles_response->'txnSettleInfo',
    raw_response         = p_castles_response,
    failure_reason       = CASE
      WHEN v_final_status IN ('settled')     THEN NULL
      WHEN v_final_status = 'partial_failure'
        THEN 'Partial settlement: '
          || array_to_string(ARRAY(SELECT jsonb_array_elements_text(v_failed_acquirers)), ', ')
          || ' failed. Contact processor support.'
      WHEN v_return_code = 'E000002A'        THEN 'Castles requested a retry (E000002A). Call prepare again with a new txnPosTxnId.'
      ELSE p_castles_response->>'txnHostMsg'
    END,
    updated_at           = NOW()
  WHERE id = p_batch_uuid;

  -- STEP 8: For full/partial success, mark ALL tagged payments as settled.
  IF v_final_status IN ('settled', 'partial_failure') THEN
    UPDATE public.order_payments
    SET
      is_settled          = true,
      settled_at          = NOW(),
      batch_number        = v_batch.batch_id
    WHERE
      settlement_batch_id = p_batch_uuid;
  END IF;

  -- STEP 9: For 'retry' OR 'failed' — release payments so the next
  -- prepare() can re-tag them to a new batch.
  --
  -- Both statuses mean "nothing was batched out on the device" (the
  -- partial_failure path in step 6 already handled any successful
  -- acquirers, and step 8 marked those payments as settled).
  --
  -- The failed / retry settlement_batches row stays as an audit
  -- record — it retains raw_response, retry_count, failure_reason,
  -- castles_return_code, and the aggregates. Only the link from
  -- order_payments is cleared.
  IF v_final_status IN ('retry', 'failed') THEN
    UPDATE public.order_payments
    SET settlement_batch_id = NULL
    WHERE settlement_batch_id = p_batch_uuid;
  END IF;

  RETURN jsonb_build_object(
    'success',             v_final_status IN ('settled', 'partial_failure'),
    'status',              v_final_status,
    'return_code',         v_return_code,
    'batch_id',            v_batch.batch_id,
    'settled_acquirers',   v_settled_acquirers,
    'failed_acquirers',    v_failed_acquirers,
    'should_retry',        (v_final_status = 'retry'),
    'requires_support',    (v_final_status = 'partial_failure')
  );

END;
$function$;
