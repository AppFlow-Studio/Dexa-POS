-- Rollback for process_payment_v12_service_charge_authority.sql
-- v11 is intentionally untouched and continues to serve live traffic;
-- the rollback is just a function drop.
DROP FUNCTION IF EXISTS public.process_payment_v12(
  uuid, text, numeric, numeric, numeric, jsonb, uuid, jsonb,
  integer, integer, boolean, uuid, uuid, uuid
);
