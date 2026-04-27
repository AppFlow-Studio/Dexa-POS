-- Rollback: check_recent_payment_v1
DROP FUNCTION IF EXISTS public.check_recent_payment(UUID, INTEGER, BIGINT, INTEGER);
DROP FUNCTION IF EXISTS public.check_recent_payment(UUID, INTEGER, BIGINT);
