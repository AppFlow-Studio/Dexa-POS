-- =====================================================================
-- Migration: 00_ping_rpc — adds connection-quality probe RPC
-- =====================================================================
-- Used by client connectionQuality state machine to recover from `slow`.
-- Apply BEFORE deploying client build that imports `lib/network/connectionQuality.ts`.
-- Additive only; no existing object modified.
-- Rollback: 00_ping_rpc_rollback.sql
-- =====================================================================

CREATE FUNCTION ping()
RETURNS bigint
LANGUAGE sql
STABLE
AS $$
  SELECT (extract(epoch FROM now()) * 1000)::bigint
$$;

GRANT EXECUTE ON FUNCTION ping() TO authenticated;

COMMENT ON FUNCTION ping IS 'Connection-quality probe. Returns server epoch ms. Added by bad-WiFi optimization Option C.';

-- =====================================================================
-- Verification:
--   SELECT ping();  -- should return current epoch ms within ~1ms
-- =====================================================================
