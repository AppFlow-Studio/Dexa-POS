-- Rollback for apply_service_charge_v1.sql
DROP FUNCTION IF EXISTS public.apply_service_charge_v1(uuid, integer, uuid, uuid);
