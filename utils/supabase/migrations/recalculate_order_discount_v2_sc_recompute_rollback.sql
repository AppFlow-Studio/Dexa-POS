-- Rollback for recalculate_order_discount_v2_sc_recompute.sql
-- v2 has no callers in Wave A (parked for Wave B). Dropping it is safe.

DROP FUNCTION IF EXISTS public.recalculate_order_discount_v2(UUID);
