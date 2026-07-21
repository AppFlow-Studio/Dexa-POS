-- =====================================================================
-- Rollback: apply_refund_to_payment_v3 — platform-fee refund tracking
-- =====================================================================
-- Drops v3. v2 stays alive for callers that haven't been flipped yet.
-- =====================================================================

DROP FUNCTION IF EXISTS public.apply_refund_to_payment_v3(
  uuid, numeric, reversal_type, numeric, text, text, text, text, text, uuid, boolean, uuid, uuid
);
