-- Rollback for idx_orders_history_bootstrap.sql
DROP INDEX CONCURRENTLY IF EXISTS public.idx_orders_history_bootstrap;
