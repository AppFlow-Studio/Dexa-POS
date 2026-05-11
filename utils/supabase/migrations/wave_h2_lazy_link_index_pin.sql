-- =====================================================================
-- Wave H.2 — Pin lazy-link unique-index identity
-- =====================================================================
-- Why (follow-up): _lazy_settlement_batch_link uses an ON CONFLICT clause
-- that infers the unique index by column list + partial predicate. If a
-- future migration drops the predicate, renames columns, or replaces the
-- index without preserving the exact (cols, WHERE) pair, the inference
-- silently falls back to "no matching index" → ON CONFLICT raises at
-- runtime on the first concurrent insert. By then it's a payment-path
-- outage.
--
-- Two defensive moves:
--   1. Header comment in _lazy_settlement_batch_link names the index
--      (uq_settlement_batches_host_key) and its predicate so anyone
--      editing it sees the contract.
--   2. Smoke-test DO block fails the migration if the expected index
--      shape isn't present right now.
--
-- Index contract:
--   uq_settlement_batches_host_key
--     UNIQUE INDEX ON settlement_batches
--     (payment_terminal_id, merchant_id, acquirer, batch_number)
--     WHERE batch_number IS NOT NULL
-- =====================================================================

-- 1) Smoke-test: assert the index exists with the expected definition.
DO $$
DECLARE
    v_def text;
BEGIN
    SELECT indexdef INTO v_def
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'settlement_batches'
      AND indexname = 'uq_settlement_batches_host_key';

    IF v_def IS NULL THEN
        RAISE EXCEPTION
          'wave_h2: missing unique index uq_settlement_batches_host_key on settlement_batches. _lazy_settlement_batch_link ON CONFLICT inference depends on it.';
    END IF;

    IF v_def !~* 'UNIQUE INDEX' THEN
        RAISE EXCEPTION
          'wave_h2: uq_settlement_batches_host_key is not UNIQUE. Definition: %', v_def;
    END IF;

    IF v_def !~* '\(payment_terminal_id, merchant_id, acquirer, batch_number\)' THEN
        RAISE EXCEPTION
          'wave_h2: uq_settlement_batches_host_key column list drift. Expected (payment_terminal_id, merchant_id, acquirer, batch_number). Definition: %', v_def;
    END IF;

    IF v_def !~* 'WHERE \(batch_number IS NOT NULL\)' THEN
        RAISE EXCEPTION
          'wave_h2: uq_settlement_batches_host_key predicate drift. Expected WHERE (batch_number IS NOT NULL). Definition: %', v_def;
    END IF;
END
$$;

-- 2) Recreate _lazy_settlement_batch_link with a header comment pinning
--    the index identity. Body is byte-for-byte identical to the staging
--    definition (Wave G.1) — only the leading comment changes.
CREATE OR REPLACE FUNCTION public._lazy_settlement_batch_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
-- =====================================================================
-- CONTRACT: ON CONFLICT below depends on the unique partial index
--   uq_settlement_batches_host_key
--   ON settlement_batches (payment_terminal_id, merchant_id, acquirer, batch_number)
--   WHERE batch_number IS NOT NULL
-- If you rename, drop, or reshape that index, the ON CONFLICT clause
-- silently stops inferring it and concurrent inserts will raise
-- "no unique or exclusion constraint matching the ON CONFLICT
-- specification" at runtime. wave_h2_lazy_link_index_pin enforces
-- the contract at migration time — re-run it after any change.
-- =====================================================================
DECLARE
    v_existing_id uuid;
    v_existing_status text;
    v_business_date date;
    v_lazy_batch_id text;
    v_terminal_uuid uuid;
BEGIN
    IF NEW.settlement_batch_id IS NOT NULL THEN RETURN NEW; END IF;
    IF NEW.acquirer IS NULL OR NEW.batch_number IS NULL THEN RETURN NEW; END IF;
    IF NEW.terminal_id IS NULL THEN RETURN NEW; END IF;
    IF NEW.terminal_type::text NOT IN ('castles','dejavoo') THEN RETURN NEW; END IF;
    IF NEW.terminal_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RETURN NEW; END IF;

    v_terminal_uuid := NEW.terminal_id::uuid;

    SELECT id, status INTO v_existing_id, v_existing_status
    FROM public.settlement_batches
    WHERE payment_terminal_id = v_terminal_uuid
      AND merchant_id = NEW.merchant_id
      AND acquirer = NEW.acquirer
      AND batch_number = NEW.batch_number
    LIMIT 1;

    IF v_existing_id IS NOT NULL AND v_existing_status IN ('pending','settling') THEN
        RETURN NEW;
    END IF;

    IF v_existing_id IS NULL THEN
        v_business_date := (COALESCE(NEW.captured_at, now()) AT TIME ZONE 'America/New_York')::date;
        v_lazy_batch_id := 'LAZY-' || NEW.acquirer || '-' || NEW.terminal_id || '-' || NEW.batch_number;

        INSERT INTO public.settlement_batches (
            batch_id, merchant_id, location_id, payment_terminal_id,
            acquirer, batch_number,
            business_date, business_date_start, business_date_end,
            opened_at, status, retry_count
        ) VALUES (
            v_lazy_batch_id, NEW.merchant_id, NEW.location_id, v_terminal_uuid,
            NEW.acquirer, NEW.batch_number,
            v_business_date, v_business_date, v_business_date,
            COALESCE(NEW.captured_at, now()), 'open', 0
        )
        ON CONFLICT (payment_terminal_id, merchant_id, acquirer, batch_number)
            WHERE batch_number IS NOT NULL
        DO NOTHING
        RETURNING id INTO v_existing_id;

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
$function$;
