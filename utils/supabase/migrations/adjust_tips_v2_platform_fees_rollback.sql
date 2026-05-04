-- =====================================================================
-- Rollback: adjust_tips_v2 — platform tip-fee recompute
-- =====================================================================
-- Drops v2. v1 stays alive for callers that haven't been flipped.
-- =====================================================================

DROP FUNCTION IF EXISTS public.adjust_tips_v2(uuid, jsonb, uuid);
