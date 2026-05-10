-- Wave A.1 — provider-agnostic batch tracking on order_payments
--
-- Why: today the acquirer-assigned batch number (txnBatchNo from Castles,
-- batchNumber from Dejavoo SPIN) lands inside terminal_response JSONB and,
-- for Castles, gets misfiled into the dejavoo_batch_number column. We need a
-- generic indexed home for the host batch + a discriminator so future
-- processors plug into the same shape.
--
-- This migration only touches schema. RPC changes ship in wave_a2.
-- Backfill ships in wave_a3 and is run AFTER the RPC change so the moving
-- target stops moving.
--
-- Safe to run on staging first (project dfwqakoyittmrwbqvxgw). Reversible:
-- the column drops at the bottom of the file are commented out as an
-- intentional one-way door — keep them documented but don't auto-execute.

BEGIN;

-- 1. acquirer discriminator. Free-form TEXT (not enum) so we can adopt new
--    processors without DDL. Default 'TSYS' covers the current Castles fleet.
ALTER TABLE public.order_payments
    ADD COLUMN IF NOT EXISTS acquirer TEXT;

COMMENT ON COLUMN public.order_payments.acquirer IS
    'Card-network acquirer/processor that owns the host batch for this payment. '
    'Free-form (TSYS, FISERV, WORLDPAY, …). NULL for cash or pre-migration rows.';

-- 2. batch_number column already exists (database.types.ts:9326) but is unused.
--    Add a comment so its role is documented now that we are populating it.
COMMENT ON COLUMN public.order_payments.batch_number IS
    'Acquirer-assigned host batch number from the terminal response '
    '(txnBatchNo for Castles, BatchNumber for Dejavoo SPIN). Identifies the '
    'host batch this payment belongs to. Pair with acquirer + terminal_id for '
    'reconciliation against external processor reports (Luqra, etc).';

-- 3. Index for reconciliation joins and lazy-batch lookups in wave B.
CREATE INDEX IF NOT EXISTS idx_order_payments_acquirer_batch
    ON public.order_payments (terminal_id, acquirer, batch_number)
    WHERE batch_number IS NOT NULL;

COMMIT;

-- Future cleanup (do NOT run here — separate migration after one release of
-- read-shim coexistence):
--   ALTER TABLE public.order_payments DROP COLUMN dejavoo_batch_number;
--   ALTER TABLE public.settlement_batches DROP COLUMN castles_batch_num;
