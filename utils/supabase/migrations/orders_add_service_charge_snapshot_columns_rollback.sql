-- Rollback for orders_add_service_charge_snapshot_columns.sql
ALTER TABLE public.orders
  DROP COLUMN IF EXISTS service_charge_is_manual;

ALTER TABLE public.orders
  DROP COLUMN IF EXISTS service_charge_rule_id;

ALTER TABLE public.orders
  DROP COLUMN IF EXISTS service_charge_rate;

ALTER TABLE public.orders
  DROP COLUMN IF EXISTS service_charge_name;
