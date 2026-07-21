-- Rollback for order_payments_add_idempotency_key.sql.
-- Drops only the Cat-B partial unique index. The column itself remains
-- (it belongs to the NMI migration, not this one). Safe while clients
-- have process_payment flag OFF.
DROP INDEX CONCURRENTLY IF EXISTS public.order_payments_idempotency_key_pos_uniq;
