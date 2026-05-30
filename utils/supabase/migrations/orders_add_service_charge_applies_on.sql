-- =====================================================================
-- Migration: orders_add_service_charge_applies_on
-- =====================================================================
-- Wave C prerequisite. Wave B added the other service_charge snapshot
-- columns (rate, rule_id, name, is_manual) but missed applies_on; the TS
-- calculator (lib/order-calculator.ts) and the OrderProfile type already
-- read/write it, so a missing column would surface as a silent NULL and
-- break the snapshot freeze contract.
--
-- Adds the column as nullable text with a CHECK constraint matching the
-- application enum. Backfill on existing rows is intentionally skipped:
-- existing open orders that already have a non-zero service_charge will
-- pick up the live rule's applies_on on the next mutation (the snapshot
-- only freezes from the first apply_service_charge call onward — see
-- apply_service_charge_v1.sql).
--
-- Apply BEFORE apply_service_charge_v1.sql.
-- Rollback: orders_add_service_charge_applies_on_rollback.sql
-- =====================================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS service_charge_applies_on text;

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_service_charge_applies_on_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_service_charge_applies_on_check
  CHECK (service_charge_applies_on IS NULL
         OR service_charge_applies_on IN ('pre_discount', 'post_discount'));

COMMENT ON COLUMN public.orders.service_charge_applies_on IS
  'Snapshotted applies_on basis for the order''s service charge (pre_discount | post_discount). NULL means no SC has been applied to this order yet. Pinned by apply_service_charge on first apply, re-pinned only when service_charge_rule_id changes.';
