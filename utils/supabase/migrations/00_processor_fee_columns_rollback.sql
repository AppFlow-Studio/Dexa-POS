-- =====================================================================
-- Rollback: 00_processor_fee_columns
-- =====================================================================

ALTER TABLE public.locations DROP CONSTRAINT IF EXISTS chk_processor_fee_percentage_range;
ALTER TABLE public.locations DROP COLUMN IF EXISTS processor_fee_percentage;
ALTER TABLE public.order_payments DROP COLUMN IF EXISTS processor_fee_percentage_snapshot;
