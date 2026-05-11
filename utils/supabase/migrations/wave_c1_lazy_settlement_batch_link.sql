-- =====================================================================
-- Wave C.1 — lazy settlement_batch link on order_payments insert
-- =====================================================================
-- Why: payments today only get a settlement_batch_id when the user runs
-- batchout. That means a host auto-cut (acquirer closes its batch on
-- its own schedule) leaves us with a captured payment whose host batch
-- has already been closed acquirer-side, but on our side it sits
-- unbatched until the operator initiates settle. We can't reconcile
-- against Luqra's per-batch totals in that window.
--
-- Fix: a BEFORE INSERT trigger on order_payments. When the incoming row
-- carries acquirer + batch_number (i.e. a card payment with a known
-- host batch) and no settlement_batch_id, look up or lazily create the
-- corresponding settlement_batches row keyed by (payment_terminal_id,
-- merchant_id, acquirer, batch_number) and stamp it onto the new payment.
--
-- The lazy row starts in status='open'. prepare_castles_settlement /
-- finalize_castles_settlement (Wave D) will transition it to settled.
-- The legacy `batch_id` column is filled with a 'LAZY-...' display
-- label that won't collide with the existing 'DEXA-...' format.
--
-- Concurrency: ON CONFLICT DO NOTHING against uq_settlement_batches_
-- host_key handles the rare race where two payments in the same host
-- batch get inserted simultaneously. The follow-up SELECT always
-- returns the canonical id.
--
-- Apply AFTER:
--   - wave_a1_order_payments_acquirer_and_batch_number.sql
--   - wave_b1_settlement_batches_host_keyed.sql
-- =====================================================================

CREATE OR REPLACE FUNCTION public._lazy_settlement_batch_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_existing_id uuid;
    v_business_date date;
    v_lazy_batch_id text;
    v_terminal_uuid uuid;
BEGIN
    -- Guards: only operate on rows we can lazily link.
    IF NEW.settlement_batch_id IS NOT NULL THEN
        RETURN NEW;
    END IF;
    IF NEW.acquirer IS NULL OR NEW.batch_number IS NULL THEN
        RETURN NEW;
    END IF;
    IF NEW.terminal_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Only Castles/Dejavoo terminal payments form settlement_batches rows.
    -- Online (NMI/card_online), manual entry, and external rails settle
    -- off-platform and must not be grouped here.
    IF NEW.terminal_type::text NOT IN ('castles','dejavoo') THEN
        RETURN NEW;
    END IF;

    -- terminal_id is TEXT and can legitimately hold non-UUID values such
    -- as 'draft_<uuid>' (offline-replay placeholders) or 'cash_drawer'.
    -- Skip silently if it isn't a well-formed UUID — better to leave the
    -- payment unlinked than to fail the whole INSERT.
    IF NEW.terminal_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RETURN NEW;
    END IF;

    v_terminal_uuid := NEW.terminal_id::uuid;

    -- Try to find an already-lazily-created row first (fast path).
    SELECT id INTO v_existing_id
    FROM public.settlement_batches
    WHERE payment_terminal_id = v_terminal_uuid
      AND merchant_id = NEW.merchant_id
      AND acquirer = NEW.acquirer
      AND batch_number = NEW.batch_number
    LIMIT 1;

    IF v_existing_id IS NULL THEN
        v_business_date := (COALESCE(NEW.captured_at, now()) AT TIME ZONE 'America/New_York')::date;
        v_lazy_batch_id := 'LAZY-' || NEW.acquirer || '-' || NEW.terminal_id || '-' || NEW.batch_number;

        INSERT INTO public.settlement_batches (
            batch_id,
            merchant_id,
            location_id,
            payment_terminal_id,
            acquirer,
            batch_number,
            business_date,
            business_date_start,
            business_date_end,
            opened_at,
            status,
            retry_count
        ) VALUES (
            v_lazy_batch_id,
            NEW.merchant_id,
            NEW.location_id,
            v_terminal_uuid,
            NEW.acquirer,
            NEW.batch_number,
            v_business_date,
            v_business_date,
            v_business_date,
            COALESCE(NEW.captured_at, now()),
            'open',
            0
        )
        ON CONFLICT (payment_terminal_id, merchant_id, acquirer, batch_number)
            WHERE batch_number IS NOT NULL
        DO NOTHING
        RETURNING id INTO v_existing_id;

        -- ON CONFLICT path didn't return — concurrent insert won the race.
        -- Re-select the now-canonical row.
        IF v_existing_id IS NULL THEN
            SELECT id INTO v_existing_id
            FROM public.settlement_batches
            WHERE payment_terminal_id = v_terminal_uuid
              AND merchant_id = NEW.merchant_id
              AND acquirer = NEW.acquirer
              AND batch_number = NEW.batch_number
            LIMIT 1;
        END IF;
    END IF;

    NEW.settlement_batch_id := v_existing_id;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lazy_settlement_batch_link ON public.order_payments;
CREATE TRIGGER trg_lazy_settlement_batch_link
    BEFORE INSERT ON public.order_payments
    FOR EACH ROW
    EXECUTE FUNCTION public._lazy_settlement_batch_link();

COMMENT ON FUNCTION public._lazy_settlement_batch_link IS
    'BEFORE INSERT trigger on order_payments. Lazily creates a settlement_batches row keyed by (payment_terminal_id, merchant_id, acquirer, batch_number) and stamps NEW.settlement_batch_id. Skips rows missing acquirer/batch_number/terminal_id (cash, manual, pre-Wave-A2 callers). Idempotent under concurrent inserts via ON CONFLICT.';
