-- Rollback for orders_add_service_charge_applies_on.sql
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_service_charge_applies_on_check;

ALTER TABLE public.orders
  DROP COLUMN IF EXISTS service_charge_applies_on;
