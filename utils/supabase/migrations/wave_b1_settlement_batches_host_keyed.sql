-- =====================================================================
-- Wave B.1 — settlement_batches keyed by (terminal, acquirer, batch_number)
-- =====================================================================
-- Why: settlement_batches today is keyed by `batch_id` (our generated
-- 'DEXA-<terminal>-<date>-<seq>' string) which has no relationship to the
-- acquirer's batch identity. Reconciliation against Luqra is only
-- possible if rows are keyed by what the acquirer actually assigned. We
-- mirror the order_payments shape here: add `acquirer` + `batch_number`
-- and a partial unique index on (payment_terminal_id, acquirer,
-- batch_number) so Wave C's trigger can use ON CONFLICT to do lazy row
-- creation safely under concurrent inserts.
--
-- castles_batch_num stays put for one release as a read-shim; new code
-- should read batch_number. The legacy `batch_id` column stays as a
-- display label (already populated by prepare_castles_settlement).
--
-- No staging row currently has castles_batch_num set, so the backfill
-- step is effectively a no-op on staging — verified at draft time.
--
-- Apply AFTER:
--   - wave_a1_order_payments_acquirer_and_batch_number.sql
-- =====================================================================

BEGIN;

ALTER TABLE public.settlement_batches
    ADD COLUMN IF NOT EXISTS acquirer TEXT,
    ADD COLUMN IF NOT EXISTS batch_number TEXT;

COMMENT ON COLUMN public.settlement_batches.acquirer IS
    'Card-network acquirer that assigned this batch number. Mirrors '
    'order_payments.acquirer (TSYS, FISERV, ...). NULL for legacy rows '
    'created by prepare_castles_settlement before Wave B.';
COMMENT ON COLUMN public.settlement_batches.batch_number IS
    'Acquirer-assigned host batch number (mirrors order_payments.batch_number). '
    'Use this for reconciliation against external processor reports. '
    'castles_batch_num is retained for one release as a read-shim.';

-- Backfill from castles_batch_num where present. No-op on staging
-- today (0 rows have castles_batch_num set), but keeps the migration
-- correct for environments with historical settled batches.
UPDATE public.settlement_batches
SET acquirer = 'TSYS',
    batch_number = castles_batch_num
WHERE castles_batch_num IS NOT NULL
  AND batch_number IS NULL;

-- Partial unique index — only enforces uniqueness for rows that have
-- the new identity. Legacy rows (batch_number NULL) are unaffected, so
-- prepare_castles_settlement keeps working without modification.
-- Includes merchant_id to prevent cross-tenant collisions if a terminal_id
-- is ever reused across merchants. All callers (lazy-link trigger, Wave D
-- finalize RPC, website Luqra reconciliation) key on the same 4-tuple.
CREATE UNIQUE INDEX IF NOT EXISTS uq_settlement_batches_host_key
    ON public.settlement_batches (payment_terminal_id, merchant_id, acquirer, batch_number)
    WHERE batch_number IS NOT NULL;

COMMIT;
