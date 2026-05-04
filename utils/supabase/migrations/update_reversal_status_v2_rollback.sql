-- Rollback: update_reversal_status_v2.sql
DROP FUNCTION IF EXISTS public.update_reversal_status_v2(
  uuid, reversal_status_type, jsonb, jsonb, text, text, text, uuid
);
