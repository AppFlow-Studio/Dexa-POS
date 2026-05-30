-- =====================================================================
-- Rollback: process_payment_v14_sc_residual_snap
-- =====================================================================
-- Drops the v14 function. Client wrappers (services/orderService.ts)
-- fall back to process_payment_v13 when the
-- idempotent.process_payment feature flag is OFF.
--
-- Apply after the client config flag has been flipped to false so no
-- in-flight calls land on a missing v14 symbol.
-- =====================================================================

DROP FUNCTION IF EXISTS public.process_payment_v14(
    uuid, text, numeric, numeric, numeric, jsonb, uuid, jsonb,
    integer, integer, boolean, uuid, uuid, uuid
);
