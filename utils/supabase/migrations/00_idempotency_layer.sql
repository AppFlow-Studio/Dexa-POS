-- =====================================================================
-- Migration: 00_idempotency_layer — server-side idempotency for Category B RPCs
-- =====================================================================
-- Provides claim-then-record helpers for at-most-once execution of mutating
-- RPCs in the bad-WiFi Phase 2 work. Closes correctness gaps from senior
-- backend review:
--   Gap 1 — mid-execution failure: claim row visible to retries
--   Gap 2 — concurrent same-key race: atomic INSERT ... ON CONFLICT
--   Gap 3 (Wave 3.0c) — cross-op cache pollution: composite PK (key, op)
--
-- Per-RPC adoption is gated by client-side feature flags (lib/network/
-- featureFlags.ts). Server functions remain dormant until clients pass
-- p_idempotency_key.
--
-- Apply BEFORE shipping any v(n+1) RPC migration that references the
-- helpers below.
--
-- Rollback: 00_idempotency_layer_rollback.sql
--
-- NOTE: this is the POS-repo REFERENCE copy. Production migrations live
-- in dexapos-website/supabase/migrations/. Keep both in sync.
-- =====================================================================
--
-- INVARIANT FOR v(n+1) AUTHORS — claim row lifecycle binds to caller's tx
--
-- `_idempotency_claim` runs in the *caller's* transaction; it does NOT
-- open an autonomous transaction. This is load-bearing: if your RPC body
-- raises before `_idempotency_complete` runs, the claim row vanishes with
-- the rolled-back outer transaction, and the next retry starts fresh.
--
-- Do NOT wrap your RPC body in a sub-transaction (`BEGIN ... EXCEPTION
-- WHEN OTHERS THEN ... END`) that catches errors and continues — the
-- claim row would remain committed while the body has effectively
-- rolled back, leaving retries to hit the in-flight window or get a
-- cached return for an execution that never produced state.
--
-- Stale-claim takeover (60s window in `_idempotency_claim`) is only safe
-- for assignment-style mutations where two concurrent executions
-- converge to the same final state (e.g. `UPDATE ... SET qty = 5`).
-- For counter-increment or row-append RPCs, the takeover branch can
-- produce double-effects; those RPCs MUST add a precondition check
-- (e.g. `p_expected_sync_version`) before the cache layer.
--
-- Composite PK (key, op) since Wave 3.0c — v(n+1) RPCs may safely reuse
-- a UUID across distinct op names without runtime discipline; the schema
-- isolates each op's cache row.
--
-- =====================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not installed; daily purge job will NOT be scheduled. Use Edge Function fallback.';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.idempotency_keys (
  key UUID NOT NULL,
  op TEXT NOT NULL,
  result_json JSONB,
  status TEXT NOT NULL DEFAULT 'claimed' CHECK (status IN ('claimed', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  PRIMARY KEY (key, op)
);

CREATE INDEX IF NOT EXISTS idempotency_keys_created_at_idx
  ON public.idempotency_keys (created_at);

ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- _idempotency_claim: returns NULL if caller should execute the RPC body,
-- returns cached jsonb if a previous call already completed, raises
-- serialization_failure if another caller is mid-execution (<60s).
-- Stale claims (>60s, assume crashed) allow a takeover.
-- All operations scoped to (key, op) since Wave 3.0c.
-- =====================================================================
CREATE OR REPLACE FUNCTION public._idempotency_claim(p_key UUID, p_op TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing RECORD;
BEGIN
  INSERT INTO public.idempotency_keys (key, op, result_json, status)
  VALUES (p_key, p_op, NULL, 'claimed')
  ON CONFLICT (key, op) DO NOTHING;

  IF NOT FOUND THEN
    SELECT result_json, status, created_at INTO v_existing
    FROM public.idempotency_keys WHERE key = p_key AND op = p_op;

    -- Defensive guard: a concurrent oversize _idempotency_complete may
    -- delete the (key, op) row between the INSERT above and this SELECT.
    -- Treat empty record as "claim now" rather than falling through with
    -- NULL comparisons.
    IF v_existing IS NULL THEN
      RETURN NULL;
    END IF;

    IF v_existing.status = 'completed' THEN
      RETURN v_existing.result_json;
    ELSIF v_existing.status = 'claimed' AND v_existing.created_at > now() - INTERVAL '60 seconds' THEN
      RAISE EXCEPTION 'idempotency_in_flight: key %', p_key
        USING ERRCODE = 'serialization_failure';
    ELSIF v_existing.status = 'claimed' THEN
      -- Stale claim (>60s, assume crashed) — allow takeover by refreshing the timestamp
      UPDATE public.idempotency_keys
      SET created_at = now()
      WHERE key = p_key AND op = p_op;
      RETURN NULL;
    ELSE
      RETURN v_existing.result_json;
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

-- =====================================================================
-- _idempotency_complete: stores the result for a previously-claimed
-- (key, op) pair. Caps result at 32KB; oversize results delete the
-- (key, op) row to force re-execute on retry (better than caching a
-- truncated result). Op-scoped delete since Wave 3.0c.
-- =====================================================================
CREATE OR REPLACE FUNCTION public._idempotency_complete(p_key UUID, p_op TEXT, p_result JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF octet_length(p_result::text) > 32768 THEN
    DELETE FROM public.idempotency_keys WHERE key = p_key AND op = p_op;
    RETURN;
  END IF;

  UPDATE public.idempotency_keys
  SET result_json = p_result,
      status = 'completed',
      completed_at = now()
  WHERE key = p_key AND op = p_op;
END;
$$;

REVOKE ALL ON FUNCTION public._idempotency_claim(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._idempotency_complete(UUID, TEXT, JSONB) FROM PUBLIC;

COMMENT ON TABLE public.idempotency_keys IS
  'At-most-once execution ledger for Category B RPCs (bad-WiFi Phase 2). PRIMARY KEY (key, op) — distinct ops with the same UUID get distinct cache rows. Purged daily by pg_cron after 24h.';
COMMENT ON FUNCTION public._idempotency_claim IS
  'Atomic claim-then-record helper, scoped to (key, op). Returns cached result if completed, raises serialization_failure if in-flight (<60s) for the same (key, op), takes over stale claim (>60s).';
COMMENT ON FUNCTION public._idempotency_complete IS
  'Stores RPC result against a claimed (key, op) pair. Refuses to cache results >32KB (deletes that pair''s row instead).';

-- =====================================================================
-- Daily purge of rows older than 24h. Skipped if pg_cron is unavailable.
-- =====================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Drop any prior schedule of the same name to make this idempotent
    PERFORM cron.unschedule('idempotency_keys_purge')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'idempotency_keys_purge');

    PERFORM cron.schedule(
      'idempotency_keys_purge',
      '0 3 * * *',
      $cron$ DELETE FROM public.idempotency_keys WHERE created_at < now() - INTERVAL '24 hours' $cron$
    );
  END IF;
END $$;

-- =====================================================================
-- Verification (run on staging after apply):
--   SELECT public._idempotency_claim('00000000-0000-0000-0000-000000000001'::uuid, 'test');
--     -- Expect: NULL
--   SELECT public._idempotency_claim('00000000-0000-0000-0000-000000000001'::uuid, 'test');
--     -- Expect: ERROR idempotency_in_flight
--   SELECT public._idempotency_complete('00000000-0000-0000-0000-000000000001'::uuid, 'test', '{"ok":true}'::jsonb);
--   SELECT public._idempotency_claim('00000000-0000-0000-0000-000000000001'::uuid, 'test');
--     -- Expect: {"ok":true}
--   DELETE FROM public.idempotency_keys WHERE key = '00000000-0000-0000-0000-000000000001'::uuid;
-- =====================================================================
