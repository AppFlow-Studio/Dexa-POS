-- =====================================================================
-- Wave D.1 — refactor prepare/finalize_castles_settlement for host-keyed batches
-- =====================================================================
-- Why: today prepare_castles_settlement mints a new settlement_batches
-- row with our generated 'DEXA-...' batch_id and tags every unsettled
-- captured payment with that UUID. After Wave C the lazy trigger
-- already creates host-keyed (acquirer, batch_number) rows in
-- status='open' and links each payment as it's captured. Settlement
-- should now operate on those rows, not invent its own.
--
-- Two behaviors after this migration:
--   * Primary path  - find the oldest status='open' host-keyed batch
--     for the terminal, promote it to 'pending', stamp the
--     castles_pos_txn_id, return the same shape callers expect.
--   * Legacy fallback - if no host-keyed open batch exists (e.g. some
--     callers still go through process_payment_v10 which doesn't write
--     acquirer/batch_number), fall through to the old DEXA-... minting
--     logic so v10 traffic keeps settling. Drop the fallback in a
--     future wave once v11 is the only caller.
--
-- finalize_castles_settlement changes:
--   * REMOVE the destructive `batch_number = v_batch.batch_id` UPDATE
--     on order_payments. That was overwriting the real host batch
--     number with our DEXA-... display label. The host batch_number
--     was already populated at capture time by Wave A.2.
--   * On retry/failed for host-keyed rows: revert status to 'open',
--     keep payments linked. Host batch identity is permanent — failed
--     settle attempts don't dissolve the batch.
--   * Legacy DEXA rows (acquirer IS NULL) keep the old retry/failed
--     behavior of nulling settlement_batch_id on payments.
--
-- Apply AFTER:
--   - wave_b1_settlement_batches_host_keyed.sql
--   - wave_c1_lazy_settlement_batch_link.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- prepare_castles_settlement
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prepare_castles_settlement(
    p_terminal_id uuid,
    p_merchant_id uuid,
    p_initiated_by text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_terminal          record;
    v_batch             record;
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
    v_is_host_keyed     boolean := false;
BEGIN
    SELECT * INTO v_terminal
    FROM public.payment_terminals
    WHERE id = p_terminal_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Terminal not found: %', p_terminal_id;
    END IF;

    IF v_terminal.merchant_id != p_merchant_id THEN
        RAISE EXCEPTION 'Access denied: terminal % does not belong to merchant %',
            p_terminal_id, p_merchant_id;
    END IF;

    -- Auto-reset stale pending batches (Wave D keeps this guard, since a
    -- prepare crash mid-Castles-call still leaves a 'pending' row).
    UPDATE public.settlement_batches
    SET
        status         = 'failed',
        failure_reason = 'Auto-reset: prepare was called but the Castles device was never contacted (app crash or timeout). Safe to retry.',
        updated_at     = NOW()
    WHERE
        payment_terminal_id = p_terminal_id
        AND status = 'pending'
        AND opened_at < (NOW() - INTERVAL '10 minutes');

    -- For legacy DEXA rows that auto-failed: detach their payments so
    -- the legacy fallback can re-pick them. Host-keyed rows that
    -- auto-failed: just flip them back to 'open' so the new path
    -- re-picks them.
    UPDATE public.order_payments op
    SET settlement_batch_id = NULL
    FROM public.settlement_batches sb
    WHERE
        op.settlement_batch_id = sb.id
        AND sb.payment_terminal_id = p_terminal_id
        AND sb.status = 'failed'
        AND sb.acquirer IS NULL;

    UPDATE public.settlement_batches
    SET status = 'open', updated_at = NOW()
    WHERE payment_terminal_id = p_terminal_id
      AND status = 'failed'
      AND acquirer IS NOT NULL;

    IF EXISTS (
        SELECT 1
        FROM public.settlement_batches
        WHERE payment_terminal_id = p_terminal_id
          AND status IN ('pending', 'settling')
    ) THEN
        RAISE EXCEPTION 'A settlement is already in progress for terminal %. Wait or check for a stuck batch.', p_terminal_id;
    END IF;

    -- Primary path: pick the oldest open host-keyed batch.
    SELECT * INTO v_batch
    FROM public.settlement_batches
    WHERE payment_terminal_id = p_terminal_id
      AND status = 'open'
      AND acquirer IS NOT NULL
      AND batch_number IS NOT NULL
    ORDER BY opened_at ASC
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
        v_is_host_keyed := true;
        v_batch_uuid := v_batch.id;
        v_batch_id := v_batch.batch_id;

        -- Aggregate the linked payments for the response.
        SELECT
            COUNT(*),
            MIN(captured_at::date),
            MAX(captured_at::date),
            COALESCE(SUM(amount),     0),
            COALESCE(SUM(tip_amount), 0),
            COALESCE(SUM(total_amount),0)
        INTO
            v_payment_count, v_date_start, v_date_end,
            v_gross, v_tips, v_total
        FROM public.order_payments
        WHERE settlement_batch_id = v_batch_uuid
          AND status = 'captured'
          AND is_settled = false;

        IF v_payment_count = 0 THEN
            -- The batch row exists but has no eligible payments. Shouldn't
            -- happen via the trigger, but treat as a no-op rather than failing.
            RAISE EXCEPTION 'Host-keyed batch % has no eligible payments. Mark it closed manually.', v_batch_id;
        END IF;

        v_next_pos_txn_int := (
            (COALESCE(v_terminal.castles_last_pos_txn_id, '000000')::integer % 999999) + 1
        );
        v_pos_txn_id := LPAD(v_next_pos_txn_int::text, 6, '0');

        UPDATE public.payment_terminals
        SET castles_last_pos_txn_id = v_pos_txn_id, updated_at = NOW()
        WHERE id = p_terminal_id;

        UPDATE public.settlement_batches
        SET
            status              = 'pending',
            transaction_count   = v_payment_count,
            gross_amount        = v_gross,
            tip_amount          = v_tips,
            net_deposit         = v_total,
            business_date_start = v_date_start,
            business_date_end   = v_date_end,
            castles_pos_txn_id  = v_pos_txn_id,
            updated_at          = NOW()
        WHERE id = v_batch_uuid;

    ELSE
        -- Legacy fallback path (DEXA mint). Used while process_payment_v10
        -- is still the live caller, since v10 doesn't populate
        -- acquirer/batch_number and the lazy trigger doesn't fire.
        SELECT
            COUNT(*),
            MIN(op.captured_at::date),
            MAX(op.captured_at::date),
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

        v_next_pos_txn_int := (
            (COALESCE(v_terminal.castles_last_pos_txn_id, '000000')::integer % 999999) + 1
        );
        v_pos_txn_id := LPAD(v_next_pos_txn_int::text, 6, '0');

        UPDATE public.payment_terminals
        SET castles_last_pos_txn_id = v_pos_txn_id, updated_at = NOW()
        WHERE id = p_terminal_id;

        INSERT INTO public.settlement_batches (
            batch_id, merchant_id, location_id, payment_terminal_id, terminal_id,
            business_date, business_date_start, business_date_end,
            transaction_count, gross_amount, tip_amount, net_deposit,
            status, castles_pos_txn_id, opened_at, created_at, updated_at
        ) VALUES (
            v_batch_id, p_merchant_id, v_terminal.location_id, p_terminal_id, p_terminal_id::text,
            (NOW() AT TIME ZONE 'America/New_York')::date, v_date_start, v_date_end,
            v_payment_count, v_gross, v_tips, v_total,
            'pending', v_pos_txn_id, NOW(), NOW(), NOW()
        )
        RETURNING id INTO v_batch_uuid;

        UPDATE public.order_payments
        SET settlement_batch_id = v_batch_uuid
        WHERE
            terminal_id            = p_terminal_id::text
            AND terminal_type      = 'castles'
            AND is_settled         = false
            AND status             = 'captured'
            AND settlement_batch_id IS NULL;
    END IF;

    RETURN jsonb_build_object(
        'batch_uuid',         v_batch_uuid,
        'batch_id',           v_batch_id,
        'host_keyed',         v_is_host_keyed,
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
$$;

-- ---------------------------------------------------------------------
-- finalize_castles_settlement
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finalize_castles_settlement(
    p_batch_uuid uuid,
    p_merchant_id uuid,
    p_castles_response jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_batch             record;
    v_return_code       text;
    v_final_status      text;
    v_settle_entry      jsonb;
    v_all_acquirers_ok  boolean := true;
    v_any_acquirer_ok   boolean := false;
    v_failed_acquirers  jsonb   := '[]'::jsonb;
    v_settled_acquirers jsonb   := '[]'::jsonb;
    v_is_host_keyed     boolean;
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

    v_is_host_keyed := (v_batch.acquirer IS NOT NULL AND v_batch.batch_number IS NOT NULL);

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
        castles_batch_num    = COALESCE(p_castles_response->>'txnBatchNum', castles_batch_num),
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

    IF v_final_status IN ('settled', 'partial_failure') THEN
        -- Wave D delta: removed `batch_number = v_batch.batch_id` overwrite.
        -- The host batch_number was populated at capture time by Wave A.2
        -- and is the source of truth. Stamping it here would clobber it
        -- with our DEXA-... display label.
        UPDATE public.order_payments
        SET
            is_settled = true,
            settled_at = NOW()
        WHERE
            settlement_batch_id = p_batch_uuid;
    END IF;

    IF v_final_status IN ('retry', 'failed') THEN
        IF v_is_host_keyed THEN
            -- Host-keyed: the batch identity is the acquirer's, not ours.
            -- A failed settle attempt doesn't dissolve it. Flip status
            -- back to 'open' so the next prepare can re-pick it; keep
            -- payments linked.
            UPDATE public.settlement_batches
            SET status = 'open', updated_at = NOW()
            WHERE id = p_batch_uuid;
        ELSE
            -- Legacy DEXA path: the row was a transient bucket. Detach
            -- payments so they can be re-batched on the next prepare.
            UPDATE public.order_payments
            SET settlement_batch_id = NULL
            WHERE settlement_batch_id = p_batch_uuid;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success',             v_final_status IN ('settled', 'partial_failure'),
        'status',              v_final_status,
        'return_code',         v_return_code,
        'batch_id',            v_batch.batch_id,
        'host_keyed',          v_is_host_keyed,
        'settled_acquirers',   v_settled_acquirers,
        'failed_acquirers',    v_failed_acquirers,
        'should_retry',        (v_final_status = 'retry'),
        'requires_support',    (v_final_status = 'partial_failure')
    );
END;
$$;

-- =====================================================================
-- How to verify (Wave D)
-- =====================================================================
-- 1. Smoke: SELECT prepare_castles_settlement(<terminal_id>, <merchant_id>, 'test');
--    With a host-keyed open batch present, response.host_keyed = true,
--    response.batch_id starts with 'LAZY-' (no new row created).
--    With no host-keyed open batch but unlinked v10 payments,
--    response.host_keyed = false and a new DEXA-... row is created.
-- 2. Send a fake successful txnSettleInfo response to finalize:
--    SELECT finalize_castles_settlement(<batch_uuid>, <merchant_id>, '{"txnReturnCode":"00000000","txnSettleInfo":[{"txnReturnCode":"00000000","txnAcquirerName":"VISA"}]}');
--    Expect status='settled', linked order_payments rows have
--    is_settled=true and batch_number unchanged (still the real host
--    txnBatchNo, not 'LAZY-...').
-- 3. Simulate retry: pass txnReturnCode='E000002A'. Host-keyed row
--    flips back to status='open' with payments still linked. Next
--    prepare picks it up again.
-- 4. Idempotency: call finalize twice — second call raises 'already
--    settled'.
-- 5. Verify the destructive overwrite is gone: pre-Wave-D, finalize
--    set order_payments.batch_number = v_batch.batch_id. Confirm the
--    new code does NOT mention batch_number in the settled UPDATE.
-- =====================================================================
