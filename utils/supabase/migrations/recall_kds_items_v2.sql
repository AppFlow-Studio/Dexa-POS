-- =====================================================================
-- Migration: recall_kds_items_v2 — adds idempotency-key support
-- =====================================================================
-- Forks from recall_kds_items in kds_recall_and_rush.sql / kds_workflow_mode.sql.
-- v1 returns void; v2 caches '{}'::jsonb on completion (replay = no-op success).
-- Rollback: recall_kds_items_v2_rollback.sql
-- =====================================================================

CREATE OR REPLACE FUNCTION public.recall_kds_items_v2(
  p_order_item_ids uuid[],
  p_target_status text DEFAULT 'sent'::text,
  p_idempotency_key UUID DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_cached JSONB;
  v_order_id UUID;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    v_cached := public._idempotency_claim(p_idempotency_key, 'recall_kds_items_v2');
    IF v_cached IS NOT NULL THEN
      -- void RPC: cached '{}' means already executed — silently return
      RETURN;
    END IF;
  END IF;

  -- BEGIN_VERBATIM
  UPDATE order_items
  SET
    kitchen_status = p_target_status,
    completed_at = NULL,
    started_preparing_at = CASE
      WHEN p_target_status = 'sent' THEN NULL
      ELSE COALESCE(started_preparing_at, NOW())
    END,
    updated_at = NOW()
  WHERE id = ANY(p_order_item_ids);

  UPDATE kds_item_status
  SET
    status = CASE WHEN p_target_status = 'preparing' THEN 'pending' ELSE 'pending' END,
    started_at = CASE WHEN p_target_status = 'preparing' THEN COALESCE(started_at, NOW()) ELSE NULL END,
    completed_at = NULL,
    bumped_at = NULL,
    bumped_by = NULL,
    updated_at = NOW()
  WHERE order_item_id = ANY(p_order_item_ids);

  FOR v_order_id IN
    SELECT DISTINCT order_id FROM order_items WHERE id = ANY(p_order_item_ids)
  LOOP
    UPDATE orders
    SET
      updated_at = NOW(),
      sync_version = COALESCE(sync_version, 0) + 1
    WHERE id = v_order_id;
  END LOOP;
  -- END_VERBATIM

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM public._idempotency_complete(p_idempotency_key, 'recall_kds_items_v2', '{}'::jsonb);
  END IF;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.recall_kds_items_v2(uuid[], text, uuid) TO authenticated;

COMMENT ON FUNCTION public.recall_kds_items_v2 IS
  'Recalls KDS items to target status. v2 adds optional p_idempotency_key for at-most-once execution.';
