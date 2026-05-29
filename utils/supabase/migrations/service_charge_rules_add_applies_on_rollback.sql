-- Rollback for service_charge_rules_add_applies_on.sql
ALTER TABLE public.service_charge_rules
  DROP CONSTRAINT IF EXISTS service_charge_rules_applies_on_check;

ALTER TABLE public.service_charge_rules
  DROP COLUMN IF EXISTS applies_on;
