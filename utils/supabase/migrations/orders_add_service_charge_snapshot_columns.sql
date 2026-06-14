-- =====================================================================
-- Migration: orders_add_service_charge_snapshot_columns
-- =====================================================================
-- Prod-parity backfill for the four service-charge snapshot columns that
-- were added directly to staging during Wave A/B but never landed as a
-- checked-in migration. Staging is a no-op (all four already exist);
-- prod gets them when this is applied there.
--
-- These columns let apply_service_charge_v1 (Wave C) snapshot the rule
-- state per-order so mid-shift website edits don't retroactively re-rate
-- open orders. service_charge_is_manual is the kill-switch Wave D will
-- flip via the manager-PIN EDIT_SERVICE_CHARGE / REMOVE_SERVICE_CHARGE
-- actions; until then it defaults to false on every row.
--
-- Sibling migration orders_add_service_charge_applies_on.sql already
-- added service_charge_applies_on with its CHECK constraint — that
-- column is intentionally not duplicated here.
--
-- Apply BEFORE apply_service_charge_v1.sql (idempotent — safe to re-run).
-- Rollback: orders_add_service_charge_snapshot_columns_rollback.sql
-- =====================================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS service_charge_name text;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS service_charge_rate numeric(5,2);

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS service_charge_rule_id uuid
    REFERENCES public.service_charge_rules(id);

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS service_charge_is_manual boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.orders.service_charge_name IS
  'Snapshotted display name of the service charge rule active when this order first qualified. Pinned by apply_service_charge_v1 on first apply.';

COMMENT ON COLUMN public.orders.service_charge_rate IS
  'Snapshotted rate_percent (e.g. 18.00 for 18%) of the rule active when this order first qualified. Pinned by apply_service_charge_v1 on first apply; re-pinned only when service_charge_rule_id changes.';

COMMENT ON COLUMN public.orders.service_charge_rule_id IS
  'FK to the service_charge_rules row that was active when this order first qualified. NULL means no SC has been applied to this order.';

COMMENT ON COLUMN public.orders.service_charge_is_manual IS
  'TRUE when a manager has overridden the auto-applied service charge. apply_service_charge_v1 short-circuits when this is true so the override is preserved across recalculates. Wave D introduces the manager-PIN flow that flips this; until then it stays false.';
