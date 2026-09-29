-- Rollback for pos_bootstrap_snapshot_cache.proposal.sql.
-- A client that calls the cached RPC falls back to the direct bootstrap for the
-- rest of its session when the function is gone (PGRST202 / 42883).
-- catalog_versions predates the proposal and is NOT dropped here.
DROP FUNCTION IF EXISTS public.get_pos_bootstrap_cached_v1(uuid, text, boolean);
DROP FUNCTION IF EXISTS public.pos_bootstrap_cache_key_v1(uuid, text);
DROP TABLE    IF EXISTS public.pos_bootstrap_snapshots;
