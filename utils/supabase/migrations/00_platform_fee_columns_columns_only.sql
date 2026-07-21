-- =====================================================================
-- Migration: 00_platform_fee_columns_columns_only — track dual-pricing
-- and tip surcharge as platform fees on order_payments
-- =====================================================================
-- Adds columns + CHECK constraints only. No data rewrite (PG 11+ stores
-- the DEFAULT as a metadata-only "missing value" until a row is updated),
-- so this is safe to run via Supabase MCP inside a single transaction.
--
-- The accompanying CONCURRENTLY index is in 00_platform_fee_index.sql,
-- which MUST be applied via direct psql (cannot run inside a tx).
--
-- Apply ORDER:
--   1. This file
--   2. 00_platform_fee_index.sql            (psql, CONCURRENTLY)
--   3. process_payment_v10_platform_fees.sql
--   4. apply_refund_to_payment_v3_platform_fees.sql
--   5. adjust_tips_v2_platform_fees.sql
--   6. get_platform_fees_summary.sql
--
-- Rollback: 00_platform_fee_columns_columns_only_rollback.sql
--
-- Invariant: existing amount/tip_amount/total_amount semantics unchanged.
-- The new fee columns are an INFORMATIONAL DECOMPOSITION of values
-- already stored. Pre-migration rows default to 0 (correct: the fee was
-- never tracked).
-- =====================================================================

-- 1. New location-level snapshot percentage for tip surcharge.
--    dual_pricing_percentage already exists on locations.
ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS tip_surcharge_percentage numeric(5,2) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_tip_surcharge_percentage_range'
  ) THEN
    ALTER TABLE public.locations
      ADD CONSTRAINT chk_tip_surcharge_percentage_range
      CHECK (tip_surcharge_percentage >= 0 AND tip_surcharge_percentage <= 50);
  END IF;
END $$;

-- 2. Per-payment fee decomposition columns on order_payments.
ALTER TABLE public.order_payments
  ADD COLUMN IF NOT EXISTS dual_pricing_fee numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tip_fee numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refunded_dual_pricing_fee numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refunded_tip_fee numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS original_tip_fee numeric(12,2),
  ADD COLUMN IF NOT EXISTS dual_pricing_percentage_snapshot numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tip_surcharge_percentage_snapshot numeric(5,2) NOT NULL DEFAULT 0;

-- 3. Constraint guards (idempotent via DO blocks since IF NOT EXISTS is
--    not supported on ADD CONSTRAINT). The +0.01 tolerance absorbs
--    single-row rounding drift; multi-row drift is handled by the
--    LEAST(...) clamp + final-refund snap inside apply_refund_to_payment_v3.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_dpf_le_amount') THEN
    ALTER TABLE public.order_payments
      ADD CONSTRAINT chk_dpf_le_amount
      CHECK (dual_pricing_fee <= COALESCE(amount, 0) + 0.01);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_tipf_le_tip') THEN
    ALTER TABLE public.order_payments
      ADD CONSTRAINT chk_tipf_le_tip
      CHECK (tip_fee <= COALESCE(tip_amount, 0) + 0.01);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_ref_dpf_le_dpf') THEN
    ALTER TABLE public.order_payments
      ADD CONSTRAINT chk_ref_dpf_le_dpf
      CHECK (refunded_dual_pricing_fee <= dual_pricing_fee + 0.01);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_ref_tipf_le_tipf') THEN
    ALTER TABLE public.order_payments
      ADD CONSTRAINT chk_ref_tipf_le_tipf
      CHECK (refunded_tip_fee <= tip_fee + 0.01);
  END IF;
END $$;

COMMENT ON COLUMN public.locations.tip_surcharge_percentage IS
  'Optional surcharge % added on top of card tips. 0 = disabled. Customer-invisible: tip_amount on receipts is already marked-up.';

COMMENT ON COLUMN public.order_payments.dual_pricing_fee IS
  'Surcharge portion of `amount` (NEW; merchant take-home subtotal = amount - this). 0 for cash payments.';
COMMENT ON COLUMN public.order_payments.tip_fee IS
  'Surcharge portion of `tip_amount` (NEW; merchant take-home tip = tip_amount - this). 0 for cash payments.';
COMMENT ON COLUMN public.order_payments.refunded_dual_pricing_fee IS
  'Cumulative refunded portion of dual_pricing_fee. Maintained by apply_refund_to_payment_v3 (proportional + clamped).';
COMMENT ON COLUMN public.order_payments.refunded_tip_fee IS
  'Cumulative refunded portion of tip_fee. Maintained by apply_refund_to_payment_v3.';
COMMENT ON COLUMN public.order_payments.original_tip_fee IS
  'Pre-adjustment tip_fee (audit trail). NULL until adjust_tips_v2 mutates the row.';
COMMENT ON COLUMN public.order_payments.dual_pricing_percentage_snapshot IS
  'Locked snapshot of locations.dual_pricing_percentage at capture time. Pre-migration rows = 0.';
COMMENT ON COLUMN public.order_payments.tip_surcharge_percentage_snapshot IS
  'Locked snapshot of locations.tip_surcharge_percentage at capture time. Pre-migration rows = 0.';
