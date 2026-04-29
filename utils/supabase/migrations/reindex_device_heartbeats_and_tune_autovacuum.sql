-- ============================================================
-- Reindex device_heartbeats + tune autovacuum
-- File: utils/supabase/migrations/reindex_device_heartbeats_and_tune_autovacuum.sql
-- Workstream C — task C3
-- ============================================================
-- Rationale:
--   device_heartbeats is a high-volume append-heavy table
--   (every station/device sends heartbeats every N seconds).
--   Index fragmentation accumulates over time, degrading
--   query performance on lookups like find_recent_heartbeats
--   or active device filtering.
--
--   REINDEX TABLE CONCURRENTLY rebuilds indexes without
--   blocking reads (safe for production).
--
--   scale_factor 0.05 (5%) increases autovacuum frequency
--   from the default 0.1 (10%), reducing bloat accumulation
--   on a high-velocity table. Targets: cleanup dead tuples
--   from expired/revoked device sessions more aggressively.
--
-- Scope:
--   Staging (dfwqakoyittmrwbqvxgw) and Production
--   (hifouuofcaytijrkbvcy). Idempotent.
-- ============================================================

-- Reindex all indexes on device_heartbeats concurrently
-- (non-blocking, safe during business hours)
REINDEX TABLE CONCURRENTLY public.device_heartbeats;

-- Tune autovacuum to trigger more frequently
-- on this high-velocity table (5% threshold instead of default 10%)
ALTER TABLE public.device_heartbeats SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.05
);

-- Verification (run after apply):
--   SELECT relname, reloptions
--   FROM pg_class
--   WHERE relname = 'device_heartbeats';
-- Expected: autovacuum_vacuum_scale_factor=0.05 and autovacuum_analyze_scale_factor=0.05
