-- =====================================================================
-- Rollback: 00_ping_rpc
-- =====================================================================
-- Drops the ping() probe RPC. Client falls back to no-probe (stays in
-- `slow` mode longer until NetInfo re-evaluates, but no crash).
-- =====================================================================

DROP FUNCTION IF EXISTS ping();
