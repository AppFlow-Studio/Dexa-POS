-- History-tuned partial index for the Previous Orders grid.
-- Mirrors idx_orders_active_bootstrap (which only covers active statuses).
-- Without this, history fetches (getHistoryOrders / getHistoryOrdersByCursor)
-- fall back to idx_orders_location_created_at — which covers the sort but
-- has to filter status during the heap fetch.
--
-- Partial predicate keeps the index narrow and skips the active orders that
-- are already served by idx_orders_active_bootstrap.
--
-- CREATE INDEX CONCURRENTLY cannot run inside a transaction block. If
-- apply_migration wraps statements, run this individually instead.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_history_bootstrap
  ON public.orders (location_id, created_at DESC)
  WHERE status IN ('completed', 'closed', 'void');
