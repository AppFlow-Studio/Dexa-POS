-- =====================================================================
-- Rollback: process_payment_v10 — platform-fee tracking
-- =====================================================================
-- Drops the v10 function. v9 stays alive (Cat-B clients keep working).
-- The fee columns added by 00_platform_fee_columns_columns_only.sql
-- remain (their default of 0 keeps old data + future v9 inserts valid);
-- to drop those, run 00_platform_fee_columns_columns_only_rollback.sql.
-- =====================================================================

DROP FUNCTION IF EXISTS public.process_payment_v10(
  uuid, text, numeric, numeric, numeric, jsonb, uuid, jsonb,
  integer, integer, boolean, uuid, uuid, uuid
);
