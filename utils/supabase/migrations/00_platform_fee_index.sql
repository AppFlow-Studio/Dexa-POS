-- =====================================================================
-- Migration: 00_platform_fee_index — partial index for platform-fee
-- reporting (get_platform_fees_summary)
-- =====================================================================
-- IMPORTANT: must run via direct `psql`, NOT Supabase MCP.
-- CREATE INDEX CONCURRENTLY cannot run inside a transaction; MCP wraps
-- DDL in a tx. Per Wave Cat-B precedent (project_wave_cat_b_payment_idempotency).
--
-- Run on staging:
--   psql "$STAGING_DB_URL" -f utils/supabase/migrations/00_platform_fee_index.sql
-- Run on prod (manual, by user):
--   psql "$PROD_DB_URL" -f utils/supabase/migrations/00_platform_fee_index.sql
--
-- The partial WHERE matches the reporting RPC's status predicate exactly,
-- so the planner uses this index for merchant fee summary queries.
--
-- Predicate rationale:
--   - 'captured', 'partially_refunded', 'refunded': real money flowed
--   - 'void' AND is_returned=true: refund-via-void (real cash returned)
--   - 'void' AND is_returned=false: pure cancellation (excluded — no money)
--   See project_voided_payment_refunded_amount.md for the discriminator.
-- =====================================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_payments_fees_location_period
  ON public.order_payments (location_id, captured_at)
  WHERE status IN ('captured', 'partially_refunded', 'refunded')
     OR (status = 'void' AND is_returned = true);
