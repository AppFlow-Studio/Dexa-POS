-- =====================================================================
-- Migration: bulk_update_order_item_status_v2 — adds idempotency-key support
-- =====================================================================
-- Forks from bulk_update_order_item_status (used by Send to Kitchen,
-- Mark Ready/Served/Preparing, Course fire-completion).
--
-- Why v2 (Wave 3.0d-4):
--   v1 is non-idempotent at the row level for several columns:
--     - fire_time   = NOW()           (re-stamps forward on every retry)
--     - updated_at  = NOW()           (re-stamps forward on every retry)
--     - sync_version = COALESCE(.., 0) + 1
--                                     (bumps once per call → optimistic-lock
--                                      false-positives if retry hits twice)
--   The COALESCE-guarded timestamps (sent_to_kitchen_at,
--   started_preparing_at, completed_at) are already retry-safe.
--
-- v2 wraps the v1 body with `_idempotency_claim` / `_idempotency_complete`
-- (Wave 3.0c infrastructure). On a key-replay the UPDATE doesn't run at
-- all, so fire_time / updated_at / sync_version are stamped exactly once
-- per (idempotency_key, op) pair, regardless of how many retries occur.
--
-- Cache value: the same jsonb the function returns on the first call
-- (`{updated_count, affected_order_ids}`) — replays return it verbatim.
--
-- Backwards compat: v1 stays untouched. v2 with NULL p_idempotency_key
-- behaves exactly like v1 (no caching, runs through). Client routes to
-- v2 only when EXPO_PUBLIC_IDEMPOTENT_BULK_UPDATE_ORDER_ITEM_STATUS=1
-- (default OFF — flag-flip rollback).
--
-- Rollback: bulk_update_order_item_status_v2_rollback.sql
-- =====================================================================

CREATE OR REPLACE FUNCTION public.bulk_update_order_item_status_v2(
  p_order_item_ids uuid[],
  p_status text,
  p_staff_id uuid DEFAULT NULL,
  p_idempotency_key uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_cached JSONB;
  v_affected_order_ids UUID[];
  v_result JSONB;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    v_cached := public._idempotency_claim(p_idempotency_key, 'bulk_update_order_item_status_v2');
    IF v_cached IS NOT NULL THEN
      RETURN v_cached;
    END IF;
  END IF;

  -- BEGIN_VERBATIM (mirrors bulk_update_order_item_status v1 body exactly)
  UPDATE order_items
  SET
    kitchen_status = p_status,
    updated_at = NOW(),
    fire_time = CASE
      WHEN p_status = 'sent' THEN NOW()
      WHEN p_status = 'preparing' AND fire_time IS NULL THEN NOW()
      ELSE fire_time
    END,
    sent_to_kitchen_at = CASE
      WHEN p_status IN ('sent', 'preparing')
        THEN COALESCE(sent_to_kitchen_at, NOW())
      ELSE sent_to_kitchen_at
    END,
    started_preparing_at = CASE
      WHEN p_status = 'preparing'
        THEN COALESCE(started_preparing_at, NOW())
      ELSE started_preparing_at
    END,
    completed_at = CASE
      WHEN p_status IN ('ready', 'served')
        THEN COALESCE(completed_at, NOW())
      ELSE completed_at
    END
  WHERE id = ANY(p_order_item_ids);

  IF p_status = 'preparing' THEN
    UPDATE kds_item_status
    SET started_at = COALESCE(started_at, NOW())
    WHERE order_item_id = ANY(p_order_item_ids)
      AND status = 'pending';
  END IF;

  IF p_status = 'ready' THEN
    UPDATE kds_item_status
    SET completed_at = COALESCE(completed_at, NOW())
    WHERE order_item_id = ANY(p_order_item_ids)
      AND status NOT IN ('cancelled', 'completed');
  END IF;

  IF p_status = 'served' THEN
    UPDATE kds_item_status
    SET status = 'completed',
        completed_at = COALESCE(completed_at, NOW()),
        bumped_at = NOW(),
        bumped_by = p_staff_id
    WHERE order_item_id = ANY(p_order_item_ids)
      AND status NOT IN ('cancelled', 'completed');
  END IF;

  SELECT ARRAY_AGG(DISTINCT order_id) INTO v_affected_order_ids
  FROM order_items
  WHERE id = ANY(p_order_item_ids);

  IF v_affected_order_ids IS NOT NULL THEN
    UPDATE orders o
    SET
      sent_to_kitchen_at = CASE
        WHEN p_status IN ('sent', 'preparing') THEN COALESCE(o.sent_to_kitchen_at, NOW())
        ELSE o.sent_to_kitchen_at
      END,
      started_preparing_at = CASE
        WHEN p_status = 'preparing' THEN COALESCE(o.started_preparing_at, NOW())
        ELSE o.started_preparing_at
      END,
      ready_at = CASE
        WHEN agg.all_ready_or_served AND o.status::text IN ('sent_to_kitchen', 'preparing')
          THEN COALESCE(o.ready_at, NOW())
        ELSE o.ready_at
      END,
      status = CASE
        WHEN p_status = 'sent' THEN o.status
        WHEN o.status::text NOT IN ('sent_to_kitchen', 'preparing') THEN o.status
        WHEN agg.all_ready_or_served THEN 'ready'::order_status
        WHEN agg.any_beyond_sent THEN 'preparing'::order_status
        ELSE o.status
      END,
      sync_version = COALESCE(o.sync_version, 0) + 1,
      updated_at = NOW()
    FROM (
      SELECT
        oi.order_id,
        bool_and(oi.kitchen_status IN ('ready', 'served')) AS all_ready_or_served,
        bool_or(oi.kitchen_status IN ('preparing', 'ready', 'served')) AS any_beyond_sent
      FROM order_items oi
      WHERE oi.order_id = ANY(v_affected_order_ids)
        AND COALESCE(oi.is_voided, false) = false
        AND oi.kitchen_status IS NOT NULL
      GROUP BY oi.order_id
    ) agg
    WHERE o.id = agg.order_id;
  END IF;

  v_result := jsonb_build_object(
    'updated_count', array_length(p_order_item_ids, 1),
    'affected_order_ids', to_jsonb(v_affected_order_ids)
  );
  -- END_VERBATIM

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM public._idempotency_complete(p_idempotency_key, 'bulk_update_order_item_status_v2', v_result);
  END IF;

  RETURN v_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.bulk_update_order_item_status_v2(uuid[], text, uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.bulk_update_order_item_status_v2 IS
  'Bulk-update kitchen_status on order_items + cascade to kds_item_status / orders. '
  'v2 adds optional p_idempotency_key for at-most-once execution. '
  'On replay returns the cached {updated_count, affected_order_ids} jsonb '
  'and SKIPS the UPDATE entirely — fire_time / sync_version stamped once.';
