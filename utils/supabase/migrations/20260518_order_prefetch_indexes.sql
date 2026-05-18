-- Indexes to fix statement timeouts on previous-orders fetch and
-- syncOrderFromDatabase / tableOrderPrefetch hot paths.
--
-- Symptoms before this migration (staging, 2026-05-18):
--   ERROR: canceling statement due to statement timeout (57014)
--   - usePreviousOrdersStore -> OrderService.getHistoryOrders (orders by location_id + created_at)
--   - useOrderStore.syncOrderFromDatabase items fetch (order_items by order_id, is_voided=false)
--
-- CREATE INDEX CONCURRENTLY cannot run inside a transaction block. If
-- apply_migration wraps statements, run these individually instead.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_location_created_at
  ON public.orders (location_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_items_order_active
  ON public.order_items (order_id)
  WHERE is_voided = false;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_payments_order_id
  ON public.order_payments (order_id);

-- Note: a stale query against a non-existent "order_item_payments"
-- table was removed from useOrderStore.syncOrderFromDatabase in the
-- same change; its result was destructured into an unused variable
-- and silently 404'd on every prefetch. No index needed.
