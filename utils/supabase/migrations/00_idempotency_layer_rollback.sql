-- =====================================================================
-- Rollback: 00_idempotency_layer
-- =====================================================================
-- Removes the idempotency table, helpers, and pg_cron purge job.
-- Safe to run if pg_cron is unavailable.
-- =====================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'idempotency_keys_purge') THEN
    PERFORM cron.unschedule('idempotency_keys_purge');
  END IF;
END $$;

DROP FUNCTION IF EXISTS public._idempotency_complete(UUID, TEXT, JSONB);
DROP FUNCTION IF EXISTS public._idempotency_claim(UUID, TEXT);
DROP TABLE IF EXISTS public.idempotency_keys;
