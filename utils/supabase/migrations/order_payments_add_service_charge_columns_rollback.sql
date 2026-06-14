-- Rollback for order_payments_add_service_charge_columns.sql
ALTER TABLE public.order_payments
  DROP COLUMN IF EXISTS service_charge_refunded;

ALTER TABLE public.order_payments
  DROP COLUMN IF EXISTS service_charge;
