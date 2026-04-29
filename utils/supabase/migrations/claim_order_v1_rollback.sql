-- Rollback for claim_order_v1.sql
DROP FUNCTION IF EXISTS public.claim_order_v1(uuid, uuid, uuid);
