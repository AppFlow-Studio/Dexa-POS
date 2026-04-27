-- Device heartbeats index cleanup.
--
-- The table is a one-row-per-station upsert target written every 60s. Two
-- composite indexes on (..., heartbeat_at DESC) accumulated ~10 MB of bloat
-- against 7 live rows because heartbeat_at changes on every tick and HOT
-- updates are blocked while it is indexed.
--
-- - idx_device_heartbeats_location: 0 scans since creation (Supabase advisor
--   0005_unused_index). Drop.
-- - idx_device_heartbeats_station_time: redundant — station_id is already
--   unique, so the composite adds no selectivity (at most one row per
--   station). Drop.
--
-- After dropping, the only indexed columns on the hot path are id (pkey) and
-- station_id (unique). Neither changes per tick, so subsequent upserts can
-- HOT-update and bloat will not return.
--
-- REINDEX of pkey is run separately via execute_sql (REINDEX CONCURRENTLY
-- cannot run inside a transaction block, which apply_migration uses).

DROP INDEX IF EXISTS public.idx_device_heartbeats_location;
DROP INDEX IF EXISTS public.idx_device_heartbeats_station_time;
