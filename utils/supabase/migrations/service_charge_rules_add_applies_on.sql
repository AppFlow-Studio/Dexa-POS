-- =====================================================================
-- Migration: service_charge_rules_add_applies_on
-- =====================================================================
-- Wave C / Wave A retrofill. The client store + the SC sync query promise
-- service_charge_rules.applies_on, and apply_service_charge_v1 reads it,
-- but no migration was ever shipped to add the column. Add it now so:
--   1. The PostgREST select(... applies_on ...) in
--      hooks/pos/useServiceChargeRulesSync.ts stops returning 400.
--   2. apply_service_charge_v1 can resolve rules without erroring on
--      v_rule.applies_on field-not-found.
--   3. The website admin gains a real column to edit (UI work tracked
--      separately; existing rules backfill to pre_discount).
--
-- Default 'pre_discount' matches the calculator's fallback so behavior
-- doesn't shift for currently-active rules.
--
-- Apply BEFORE re-running apply_service_charge_v1 against any order.
-- Rollback: service_charge_rules_add_applies_on_rollback.sql
-- =====================================================================

ALTER TABLE public.service_charge_rules
  ADD COLUMN IF NOT EXISTS applies_on text NOT NULL DEFAULT 'pre_discount';

ALTER TABLE public.service_charge_rules
  DROP CONSTRAINT IF EXISTS service_charge_rules_applies_on_check;

ALTER TABLE public.service_charge_rules
  ADD CONSTRAINT service_charge_rules_applies_on_check
  CHECK (applies_on IN ('pre_discount', 'post_discount'));

COMMENT ON COLUMN public.service_charge_rules.applies_on IS
  'Base for the SC calculation: pre_discount (% of gross subtotal) or post_discount (% of net subtotal-after-discount). Default pre_discount matches the calculator fallback for legacy rules.';
