-- Rollback for process_payment_v12_sc_residual_guard.sql
-- Re-applies the prior v12 body (the version shipped in
-- process_payment_v12_service_charge_authority.sql before this guard).
-- If you need the previous body, restore from that migration file or from
-- the staging snapshot taken before applying the guard.
--
-- This rollback is intentionally minimal — it just drops the current
-- function. Re-apply process_payment_v12_service_charge_authority.sql
-- after running this to restore the prior live behavior.
DROP FUNCTION IF EXISTS public.process_payment_v12(
    uuid, text, numeric, numeric, numeric, jsonb, uuid, jsonb,
    integer, integer, boolean, uuid, uuid, uuid
);
