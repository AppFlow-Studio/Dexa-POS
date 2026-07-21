-- =====================================================================
-- Wave A.3 — backfill order_payments.acquirer + order_payments.batch_number
-- =====================================================================
-- Why: rows captured before wave_a2 went live still have NULL acquirer /
-- batch_number, but for terminal-priced rows the host batch number is
-- recoverable from `processor_response` JSONB. This script extracts and
-- writes it so reconciliation queries (GROUP BY acquirer, batch_number)
-- have complete history, not just post-migration coverage.
--
-- Idempotent: uses `WHERE <target> IS NULL` guards. Safe to re-run. Does
-- not touch:
--   - Cash rows (no processor_response.castles_transaction or
--     dejavoo_transaction sub-object).
--   - Rows where the JSONB sub-object exists but lacks `batchNumber`.
--   - Rows already populated by post-wave_a2 traffic.
--
-- Acquirer policy:
--   - Castles terminal -> 'TSYS' (current acquirer for our fleet).
--   - Dejavoo gateway  -> NULL (gateway can sit on multiple acquirers;
--     wired up in a future wave). batch_number is still backfilled.
--
-- Apply AFTER:
--   - wave_a1_order_payments_acquirer_and_batch_number.sql
--   - wave_a2_process_payment_v11_acquirer_and_batch_number.sql
--   (Order vs A.2 doesn't matter functionally, but A.2-first means new
--   captures already write the columns, so this backfill only touches
--   pre-migration history.)
--
-- Rollback:
--   UPDATE public.order_payments SET acquirer = NULL WHERE acquirer = 'TSYS' AND ...;
--   -- Generally not advised — backfilled values are recoverable from
--   -- processor_response JSONB anyway, so rollback is the inverse SELECT.
-- =====================================================================

BEGIN;

-- 1. Castles rows: acquirer = 'TSYS', batch_number from JSONB.
WITH castles_backfill AS (
    SELECT
        id,
        processor_response->'castles_transaction'->>'batchNumber' AS jsonb_batch_no
    FROM public.order_payments
    WHERE terminal_type = 'castles'
      AND processor_response ? 'castles_transaction'
      AND (
          acquirer IS NULL
          OR (batch_number IS NULL
              AND (processor_response->'castles_transaction'->>'batchNumber') IS NOT NULL)
      )
)
UPDATE public.order_payments op
SET
    acquirer = COALESCE(op.acquirer, 'TSYS'),
    batch_number = COALESCE(op.batch_number, cb.jsonb_batch_no)
FROM castles_backfill cb
WHERE op.id = cb.id;

-- 2. Dejavoo rows: batch_number from JSONB, acquirer left NULL.
WITH dejavoo_backfill AS (
    SELECT
        id,
        processor_response->'dejavoo_transaction'->>'batchNumber' AS jsonb_batch_no
    FROM public.order_payments
    WHERE terminal_type = 'dejavoo'
      AND processor_response ? 'dejavoo_transaction'
      AND batch_number IS NULL
      AND (processor_response->'dejavoo_transaction'->>'batchNumber') IS NOT NULL
)
UPDATE public.order_payments op
SET batch_number = db.jsonb_batch_no
FROM dejavoo_backfill db
WHERE op.id = db.id;

COMMIT;

-- =====================================================================
-- How to verify (Wave A.3)
-- =====================================================================
-- 1. Coverage check:
--      SELECT terminal_type,
--             COUNT(*) FILTER (WHERE acquirer IS NOT NULL) AS with_acquirer,
--             COUNT(*) FILTER (WHERE batch_number IS NOT NULL) AS with_batch,
--             COUNT(*) AS total
--      FROM public.order_payments
--      GROUP BY terminal_type;
--    Expect: castles rows where processor_response->'castles_transaction'
--    has a non-null batchNumber are now both acquirer='TSYS' and
--    batch_number populated. Dejavoo rows have batch_number where
--    available; acquirer stays NULL by design.
--
-- 2. Spot-check a known live transaction. Pull a Castles payment, look up
--    the same txn on Luqra, confirm batch_number matches the "Batch"
--    column in the Luqra reconciliation UI.
--
-- 3. Aggregation sanity:
--      SELECT acquirer, batch_number, COUNT(*), SUM(amount)
--      FROM public.order_payments
--      WHERE acquirer = 'TSYS'
--        AND captured_at > now() - interval '7 days'
--      GROUP BY acquirer, batch_number
--      ORDER BY MAX(captured_at) DESC;
--    Expect each batch_number's count + sum(amount) to match Luqra's
--    per-batch totals for the same window.
--
-- 4. Idempotency: re-run this migration. The COALESCE + IS NULL guards
--    mean both UPDATEs should affect 0 rows on the second run.
-- =====================================================================
