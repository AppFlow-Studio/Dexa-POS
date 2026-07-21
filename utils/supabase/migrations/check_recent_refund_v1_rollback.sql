-- Rollback: check_recent_refund_v1.sql
DROP FUNCTION IF EXISTS public.check_recent_refund(UUID, INTEGER, BIGINT, UUID);
DROP FUNCTION IF EXISTS public.check_recent_refund(UUID, INTEGER, BIGINT);
