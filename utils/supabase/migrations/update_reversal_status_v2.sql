-- =====================================================================
-- Migration: update_reversal_status_v2 — adds idempotency-key support
-- =====================================================================
-- Forks from update_reversal_status in refund_system_v1.sql.
-- v1 is a raw UPDATE with no idempotency. v2 wraps in
-- _idempotency_claim / _idempotency_complete so retry-storms from
-- bad-WiFi do not write stale terminal_response over an already-
-- completed row.
--
-- Apply AFTER:
--   - 00_idempotency_layer.sql
--   - refund_system_v1.sql  (update_reversal_status must exist)
--
-- Rollback: update_reversal_status_v2_rollback.sql
-- =====================================================================

CREATE OR REPLACE FUNCTION public.update_reversal_status_v2(
  p_reversal_id             uuid,
  p_status                  reversal_status_type,
  p_terminal_response       jsonb    DEFAULT NULL,
  p_emv_data                jsonb    DEFAULT NULL,
  p_result_code             text     DEFAULT NULL,
  p_response_message        text     DEFAULT NULL,
  p_reversal_psp_reference  text     DEFAULT NULL,
  p_idempotency_key         uuid     DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cached JSONB;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    v_cached := public._idempotency_claim(p_idempotency_key, 'update_reversal_status_v2');
    IF v_cached IS NOT NULL THEN
      -- Idempotent replay: skip the UPDATE entirely.
      RETURN;
    END IF;
  END IF;

  UPDATE reversals
  SET
    status                   = p_status,
    terminal_response        = COALESCE(p_terminal_response, terminal_response),
    emv_data                 = COALESCE(p_emv_data, emv_data),
    result_code              = COALESCE(p_result_code, result_code),
    response_message         = COALESCE(p_response_message, response_message),
    reversal_psp_reference   = COALESCE(p_reversal_psp_reference, reversal_psp_reference),
    processed_at             = CASE WHEN p_status = 'completed' THEN now() ELSE processed_at END,
    completed_at             = CASE WHEN p_status = 'completed' THEN now() ELSE completed_at END,
    failed_at                = CASE WHEN p_status = 'failed'    THEN now() ELSE failed_at    END
  WHERE id = p_reversal_id;

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM public._idempotency_complete(p_idempotency_key, 'update_reversal_status_v2', '{}'::jsonb);
  END IF;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.update_reversal_status_v2(
  uuid, reversal_status_type, jsonb, jsonb, text, text, text, uuid
) TO authenticated;

COMMENT ON FUNCTION public.update_reversal_status_v2 IS
  'Sets reversal terminal response + status. v2 adds optional p_idempotency_key — '
  'on cache hit returns immediately so retry-storms do not overwrite terminal_response. '
  'Idempotency op: update_reversal_status_v2.';
