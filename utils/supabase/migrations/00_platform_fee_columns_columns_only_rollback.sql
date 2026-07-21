-- =====================================================================
-- Rollback: 00_platform_fee_columns_columns_only
-- =====================================================================
-- DROP order is reverse of forward migration. Constraints first (they
-- reference the columns), then columns. ALTER TABLE ... DROP COLUMN is
-- a metadata-only op for non-indexed columns.
--
-- WARNING: this drops captured fee data permanently. Only run during
-- rollback drills against staging or after a confirmed prod regression.
-- =====================================================================

-- 1. Drop the order_payments constraints first.
ALTER TABLE public.order_payments
  DROP CONSTRAINT IF EXISTS chk_dpf_le_amount,
  DROP CONSTRAINT IF EXISTS chk_tipf_le_tip,
  DROP CONSTRAINT IF EXISTS chk_ref_dpf_le_dpf,
  DROP CONSTRAINT IF EXISTS chk_ref_tipf_le_tipf;

-- 2. Drop the order_payments columns.
ALTER TABLE public.order_payments
  DROP COLUMN IF EXISTS dual_pricing_fee,
  DROP COLUMN IF EXISTS tip_fee,
  DROP COLUMN IF EXISTS refunded_dual_pricing_fee,
  DROP COLUMN IF EXISTS refunded_tip_fee,
  DROP COLUMN IF EXISTS original_tip_fee,
  DROP COLUMN IF EXISTS dual_pricing_percentage_snapshot,
  DROP COLUMN IF EXISTS tip_surcharge_percentage_snapshot;

-- 3. Drop the location constraint and column.
ALTER TABLE public.locations
  DROP CONSTRAINT IF EXISTS chk_tip_surcharge_percentage_range;

ALTER TABLE public.locations
  DROP COLUMN IF EXISTS tip_surcharge_percentage;
