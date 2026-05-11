-- =====================================================================
-- Wave H.1 — Server-side mirror of MMKV pendingFinalize journal
-- =====================================================================
-- Why (review item #9): the local MMKV journal is device-local. If the
-- device that captured the Castles response is wiped/lost before the
-- finalize retry succeeds, the batch is stuck in 'pending' on POS
-- forever while Luqra has it as settled — a permanent reconciliation
-- divergence with no recovery path.
--
-- This adds an additive server mirror. The client writes both MMKV and
-- this table; on list, the server is authoritative (any device for the
-- same merchant can drive the retry). MMKV-only entries (server upsert
-- failed) still appear locally as a fallback.
--
-- Retention: pg_cron TTL deferred to a follow-up. For now rows are
-- kept until the client deletes them on successful finalize.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.pending_finalize_journal (
    batch_uuid       uuid PRIMARY KEY,
    merchant_id      uuid NOT NULL,
    terminal_id      text NOT NULL,
    castles_response jsonb NOT NULL,
    saved_at         timestamptz NOT NULL DEFAULT now(),
    retried_at       timestamptz NULL
);

CREATE INDEX IF NOT EXISTS pending_finalize_journal_merchant_saved_idx
    ON public.pending_finalize_journal (merchant_id, saved_at DESC);

ALTER TABLE public.pending_finalize_journal ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pending_finalize_journal_select_merchant
    ON public.pending_finalize_journal;
CREATE POLICY pending_finalize_journal_select_merchant
    ON public.pending_finalize_journal
    FOR SELECT
    USING (merchant_id = user_merchant_id());

DROP POLICY IF EXISTS pending_finalize_journal_insert_merchant
    ON public.pending_finalize_journal;
CREATE POLICY pending_finalize_journal_insert_merchant
    ON public.pending_finalize_journal
    FOR INSERT
    WITH CHECK (merchant_id = user_merchant_id());

DROP POLICY IF EXISTS pending_finalize_journal_update_merchant
    ON public.pending_finalize_journal;
CREATE POLICY pending_finalize_journal_update_merchant
    ON public.pending_finalize_journal
    FOR UPDATE
    USING (merchant_id = user_merchant_id())
    WITH CHECK (merchant_id = user_merchant_id());

DROP POLICY IF EXISTS pending_finalize_journal_delete_merchant
    ON public.pending_finalize_journal;
CREATE POLICY pending_finalize_journal_delete_merchant
    ON public.pending_finalize_journal
    FOR DELETE
    USING (merchant_id = user_merchant_id());

COMMENT ON TABLE public.pending_finalize_journal IS
    'Server mirror of the device-local MMKV pending_finalize journal. '
    'Persists Castles terminal close responses when finalize_castles_settlement '
    'fails so any device for the merchant can replay the finalize from BatchoutPanel.';
