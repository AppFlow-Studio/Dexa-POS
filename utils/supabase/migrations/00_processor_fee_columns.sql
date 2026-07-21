-- =====================================================================
-- Migration: 00_processor_fee_columns — pivot from "platform markup" to
-- "processor/bank fee reporting"
-- =====================================================================
-- Tip surcharge as a platform-collected markup is non-compliant. We are
-- backing out of that capture model and switching to PURE REPORTING of
-- the processor (bank) fee that the merchant pays per captured payment.
--
-- New semantic for the existing dual_pricing_fee / tip_fee columns
-- (column names retained to avoid invasive plumbing):
--
--   dual_pricing_fee = processor fee on the subtotal portion
--                    = subtotal_portion × processor_fee_percentage / 100
--   tip_fee          = processor fee on the tip portion
--                    = tip_amount × processor_fee_percentage / 100
--
-- Cash payments still produce zero fees (no card processing on cash).
--
-- The platform does NOT add anything to the card charge. The customer
-- pays the displayed amount; the bank deducts its fee from the merchant
-- payout regardless of what we record. We track it for reconciliation
-- with the bank's batch report.
--
-- Apply AFTER:
--   - 00_platform_fee_columns_columns_only.sql
--
-- Rollback: 00_processor_fee_columns_rollback.sql
-- =====================================================================

-- 1. New location-level processor fee % (the bank's cut on captured cards).
ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS processor_fee_percentage numeric(5,2) NOT NULL DEFAULT 4.00;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_processor_fee_percentage_range'
  ) THEN
    ALTER TABLE public.locations
      ADD CONSTRAINT chk_processor_fee_percentage_range
      CHECK (processor_fee_percentage >= 0 AND processor_fee_percentage <= 50);
  END IF;
END $$;

-- 2. Snapshot column on order_payments so historical rows reflect the
-- rate at capture time, not whatever the location is currently set to.
ALTER TABLE public.order_payments
  ADD COLUMN IF NOT EXISTS processor_fee_percentage_snapshot numeric(5,2) NOT NULL DEFAULT 0;

-- 3. Disable tip surcharge collection across ALL locations. The column
-- stays for back-compat but defaults to 0 and no UI surface exposes it.
UPDATE public.locations SET tip_surcharge_percentage = 0
WHERE tip_surcharge_percentage <> 0;

COMMENT ON COLUMN public.locations.processor_fee_percentage IS
  'Bank/processor card fee % (default 4.00). Pure reporting — never modifies card charge or merchant payout. Recorded per-payment via processor_fee_percentage_snapshot for historical accuracy.';

COMMENT ON COLUMN public.order_payments.processor_fee_percentage_snapshot IS
  'Locked snapshot of locations.processor_fee_percentage at capture time. Pre-pivot rows = 0 → fee fields stay at their old computed values (which were 0 for cash and dual-pricing-delta for card under the v1 platform-fee semantic).';

COMMENT ON COLUMN public.order_payments.dual_pricing_fee IS
  'Processor (bank) fee on the subtotal portion of this payment, computed at capture time as subtotal_portion × processor_fee_percentage_snapshot / 100. 0 for cash payments (no card processing). Pure reporting — never deducted from card charge by us.';

COMMENT ON COLUMN public.order_payments.tip_fee IS
  'Processor (bank) fee on the tip portion of this payment, computed at capture time as tip_amount × processor_fee_percentage_snapshot / 100. 0 for cash payments. Pure reporting.';
