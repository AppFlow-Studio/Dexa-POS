-- =====================================================================
-- Rollback: 00_platform_fee_index
-- =====================================================================
-- DROP INDEX CONCURRENTLY also cannot run inside a transaction. Use
-- direct psql, not MCP.
-- =====================================================================

DROP INDEX CONCURRENTLY IF EXISTS public.idx_order_payments_fees_location_period;
