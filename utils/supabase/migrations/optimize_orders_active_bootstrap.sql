-- Composite partial index for the active orders bootstrap query.
-- Covers: WHERE location_id = ? AND status IN (...) ORDER BY created_at DESC
-- The existing idx_orders_location_status covers (location_id, status) but lacks
-- created_at DESC, forcing Postgres to do a sort step on every fetch.
-- The partial predicate keeps the index small (only active orders, <1% of total rows).

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_active_bootstrap
  ON public.orders (location_id, status, created_at DESC)
  WHERE status IN ('draft', 'pending', 'sent_to_kitchen', 'preparing', 'ready');
