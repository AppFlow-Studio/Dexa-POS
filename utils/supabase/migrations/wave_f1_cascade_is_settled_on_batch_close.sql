-- =====================================================================
-- Wave F.1 — cascade order_payments.is_settled when batch closes
-- =====================================================================
-- Why: today only finalize_castles_settlement (the POS-initiated batch-out
-- path) flips order_payments.is_settled = true. When a batch closes
-- OUTSIDE the POS — terminal-initiated batch-out, acquirer auto-cut, or
-- the website's Luqra reconciliation upserting a 'settled' status — the
-- linked payments stay is_settled=false forever and the BatchoutPanel's
-- unsettled stats overcount.
--
-- Fix: a single trigger on settlement_batches that fans the close out to
-- every linked payment. Convergence point for all three writers.
--
-- Status conventions (from staging observation, no enum/CHECK exists):
--   'open' / 'opening' / 'pending' / 'settling'  -> not terminal
--   'closed' / 'settled' / 'funded'              -> terminal (cascade)
--   'failed' / 'error' / 'reversed'              -> NOT cascaded
--
-- The cascade is idempotent (is_settled=false guard) and triggers on
-- INSERT (Luqra sync may upsert a row already in 'settled') or UPDATE OF
-- status (POS settle or website reconciliation flips an existing row).
--
-- finalize_castles_settlement's explicit is_settled flip becomes
-- redundant once this is in place, but harmless — the guard no-ops it.
--
-- Apply AFTER:
--   - wave_b1_settlement_batches_host_keyed.sql
--   - wave_d1_settle_rpcs_host_keyed.sql
-- =====================================================================

CREATE OR REPLACE FUNCTION public._cascade_is_settled_on_batch_close()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
    IF NEW.status IN ('settled','closed','funded')
       AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
        UPDATE public.order_payments
           SET is_settled = true,
               settled_at = COALESCE(settled_at, NEW.closed_at, now())
         WHERE settlement_batch_id = NEW.id
           AND is_settled = false;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cascade_is_settled_on_batch_close ON public.settlement_batches;
CREATE TRIGGER trg_cascade_is_settled_on_batch_close
    AFTER INSERT OR UPDATE OF status ON public.settlement_batches
    FOR EACH ROW
    EXECUTE FUNCTION public._cascade_is_settled_on_batch_close();

COMMENT ON FUNCTION public._cascade_is_settled_on_batch_close IS
    'AFTER INSERT/UPDATE-OF-status trigger on settlement_batches. When a batch enters a terminal status (settled/closed/funded), flips is_settled=true and stamps settled_at on every linked order_payments row. Idempotent. Bridges all three batch-close writers (POS settle, terminal-direct close + lazy link, website Luqra reconciliation) so external batch-outs propagate to payment rows automatically.';
