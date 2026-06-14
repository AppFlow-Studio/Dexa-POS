-- =====================================================================
-- Rollback: override_service_charge_v2_auth_and_audit
-- =====================================================================
-- Drops the v2 function. Client wrappers (services/orderService.ts)
-- fall back to override_service_charge_v1 when the
-- idempotent.override_service_charge feature flag is OFF.
--
-- Apply only after flipping the client flag so no in-flight calls land
-- on a missing v2 symbol.
-- =====================================================================

DROP FUNCTION IF EXISTS public.override_service_charge_v2(
    uuid, numeric, uuid, text, uuid, uuid
);
