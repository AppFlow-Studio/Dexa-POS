-- Rollback for override_service_charge_v1.sql
DROP FUNCTION IF EXISTS public.override_service_charge_v1(
    uuid, numeric, uuid, text, uuid, uuid
);
