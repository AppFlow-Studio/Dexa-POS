-- =====================================================================
-- Migration: 00_idempotency_layer — server-side idempotency for Category B RPCs
-- =====================================================================
-- Provides claim-then-record helpers for at-most-once execution of mutating
-- RPCs in the bad-WiFi Phase 2 work. Closes correctness gaps from senior
-- backend review:
--   Gap 1 — mid-execution failure: claim row visible to retries
--   Gap 2 — concurrent same-key race: atomic INSERT ... ON CONFLICT
--
-- Per-RPC adoption is gated by client-side feature flags (lib/network/
-- featureFlags.ts). Server functions remain dormant until clients pass
-- p_idempotency_key.
--
-- Apply BEFORE shipping any v(n+1) RPC migration that references the
-- helpers below.
--
-- Rollback: 00_idempotency_layer_rollback.sql
-- =====================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not installed; daily purge job will NOT be scheduled. Use Edge Function fallback.';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.idempotency_keys (
  key UUID PRIMARY KEY,
  op TEXT NOT NULL,
  result_json JSONB,
  status TEXT NOT NULL DEFAULT 'claimed' CHECK (status IN ('claimed', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idempotency_keys_created_at_idx
  ON public.idempotency_keys (created_at);

ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- _idempotency_claim: returns NULL if caller should execute the RPC body,
-- returns cached jsonb if a previous call already completed, raises
-- serialization_failure if another caller is mid-execution (<60s).
-- Stale claims (>60s, assume crashed) allow a takeover.
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
  ON CONFLICT (key) DO NOTHING;

  IF NOT FOUND THEN
    SELECT result_json, status, created_at INTO v_existing
    FROM public.idempotency_keys WHERE key = p_key;

    IF v_existing.status = 'completed' THEN
      RETURN v_existing.result_json;
    ELSIF v_existing.status = 'claimed' AND v_existing.created_at > now() - INTERVAL '60 seconds' THEN
      RAISE EXCEPTION 'idempotency_in_flight: key %', p_key
        USING ERRCODE = 'serialization_failure';
    ELSIF v_existing.status = 'claimed' THEN
      -- Stale claim (>60s, assume crashed) — allow takeover by refreshing the timestamp
      UPDATE public.idempotency_keys
      SET created_at = now()
      WHERE key = p_key;
      RETURN NULL;
    ELSE
      RETURN v_existing.result_json;
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

-- =====================================================================
-- _idempotency_complete: stores the result for a previously-claimed key.
-- Caps result at 32KB; oversize results delete the row to force re-execute
-- on retry (better than caching a truncated result).
-- =====================================================================
CREATE OR REPLACE FUNCTION public._idempotency_complete(p_key UUID, p_op TEXT, p_result JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF octet_length(p_result::text) > 32768 THEN
    DELETE FROM public.idempotency_keys WHERE key = p_key;
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
  'At-most-once execution ledger for Category B RPCs (bad-WiFi Phase 2). Purged daily by pg_cron after 24h.';
COMMENT ON FUNCTION public._idempotency_claim IS
  'Atomic claim-then-record helper. Returns cached result if completed, raises serialization_failure if in-flight (<60s), takes over stale claim (>60s).';
COMMENT ON FUNCTION public._idempotency_complete IS
  'Stores RPC result against a claimed key. Refuses to cache results >32KB (deletes the row instead).';

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
