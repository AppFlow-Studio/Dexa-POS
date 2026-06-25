-- =====================================================================
-- ROLLBACK for 20260620120000_process_payment_v16_tiny_total_tolerance
-- =====================================================================
-- v16 is a NEW function (a renamed fork of the 2026-06-16 v15 body), so the
-- rollback simply drops it. The prior process_payment_v15 is left intact and
-- the client wrapper (services/orderService.ts) must be reverted to call
-- "process_payment_v15" as its primary again.
--
-- NOTE: after this rollback, tiny-total even splits (e.g. a $0.02 custom item
-- split 2 ways) will again fail with enforce_order_math P0005, because v15's
-- split branch keeps the `balance <= 0.02` dust fallback that flips the order
-- to `paid` after the first sub-cent portion.
-- =====================================================================

DROP FUNCTION IF EXISTS public.process_payment_v16(
    uuid, text, numeric, numeric, numeric, jsonb, uuid, jsonb, integer, integer, boolean, uuid, uuid, uuid
);
