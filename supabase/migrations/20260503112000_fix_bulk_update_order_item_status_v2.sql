-- Fix bulk_update_order_item_status_v2 so KDS bump state is persisted
-- accurately and order readiness ignores voided/fully-refunded rows.

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
  v_cached jsonb;
  v_affected_order_ids uuid[];
  v_result jsonb;
  v_now timestamptz := NOW();
  v_updated_count integer := 0;
  v_kds_updated_count integer := 0;
BEGIN
  IF p_order_item_ids IS NULL OR array_length(p_order_item_ids, 1) IS NULL THEN
    v_result := jsonb_build_object(
      'updated_count', 0,
      'kds_updated_count', 0,
      'affected_order_ids', '[]'::jsonb
    );
    RETURN v_result;
  END IF;

  IF p_status NOT IN ('sent', 'preparing', 'ready', 'served') THEN
    RAISE EXCEPTION 'Invalid kitchen status: %. Expected sent, preparing, ready, or served.', p_status
      USING ERRCODE = '22023';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    v_cached := public._idempotency_claim(p_idempotency_key, 'bulk_update_order_item_status_v2');
    IF v_cached IS NOT NULL THEN
      RETURN v_cached;
    END IF;
  END IF;

  UPDATE public.order_items oi
  SET
    kitchen_status = p_status,
    updated_at = v_now,
    fire_time = CASE
      WHEN p_status = 'sent' THEN v_now
      WHEN p_status = 'preparing' THEN COALESCE(oi.fire_time, v_now)
      ELSE oi.fire_time
    END,
    sent_to_kitchen_at = CASE
      WHEN p_status IN ('sent', 'preparing') THEN COALESCE(oi.sent_to_kitchen_at, v_now)
      ELSE oi.sent_to_kitchen_at
    END,
    started_preparing_at = CASE
      WHEN p_status = 'sent' THEN NULL
      WHEN p_status = 'preparing' THEN COALESCE(oi.started_preparing_at, v_now)
      ELSE oi.started_preparing_at
    END,
    completed_at = CASE
      WHEN p_status = 'sent' THEN NULL
      WHEN p_status IN ('ready', 'served') THEN COALESCE(oi.completed_at, v_now)
      ELSE oi.completed_at
    END
  WHERE oi.id = ANY(p_order_item_ids);

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  IF p_status = 'sent' THEN
    UPDATE public.kds_item_status kis
    SET
      status = 'pending',
      started_at = NULL,
      completed_at = NULL,
      bumped_at = NULL,
      bumped_by = NULL
    WHERE kis.order_item_id = ANY(p_order_item_ids)
      AND kis.status <> 'cancelled';

    GET DIAGNOSTICS v_kds_updated_count = ROW_COUNT;
  ELSIF p_status = 'preparing' THEN
    UPDATE public.kds_item_status kis
    SET
      status = 'pending',
      started_at = COALESCE(kis.started_at, v_now),
      completed_at = NULL,
      bumped_at = NULL,
      bumped_by = NULL
    WHERE kis.order_item_id = ANY(p_order_item_ids)
      AND kis.status <> 'cancelled';

    GET DIAGNOSTICS v_kds_updated_count = ROW_COUNT;
  ELSIF p_status = 'ready' THEN
    UPDATE public.kds_item_status kis
    SET
      status = 'pending',
      completed_at = COALESCE(kis.completed_at, v_now),
      bumped_at = NULL,
      bumped_by = NULL
    WHERE kis.order_item_id = ANY(p_order_item_ids)
      AND kis.status <> 'cancelled';

    GET DIAGNOSTICS v_kds_updated_count = ROW_COUNT;
  ELSIF p_status = 'served' THEN
    UPDATE public.kds_item_status kis
    SET
      status = 'completed',
      completed_at = COALESCE(kis.completed_at, v_now),
      bumped_at = v_now,
      bumped_by = p_staff_id
    WHERE kis.order_item_id = ANY(p_order_item_ids)
      AND kis.status NOT IN ('cancelled', 'completed');

    GET DIAGNOSTICS v_kds_updated_count = ROW_COUNT;
  END IF;

  SELECT array_agg(DISTINCT oi.order_id)
  INTO v_affected_order_ids
  FROM public.order_items oi
  WHERE oi.id = ANY(p_order_item_ids);

  IF v_affected_order_ids IS NOT NULL THEN
    UPDATE public.orders o
    SET
      sent_to_kitchen_at = CASE
        WHEN p_status IN ('sent', 'preparing') THEN COALESCE(o.sent_to_kitchen_at, v_now)
        ELSE o.sent_to_kitchen_at
      END,
      started_preparing_at = CASE
        WHEN p_status = 'preparing' THEN COALESCE(o.started_preparing_at, v_now)
        ELSE o.started_preparing_at
      END,
      ready_at = CASE
        WHEN agg.all_ready_or_served AND o.status::text IN ('sent_to_kitchen', 'preparing')
          THEN COALESCE(o.ready_at, v_now)
        WHEN NOT agg.all_ready_or_served AND p_status IN ('sent', 'preparing')
          THEN NULL
        ELSE o.ready_at
      END,
      status = CASE
        WHEN p_status = 'sent' AND o.status::text IN ('ready', 'preparing') THEN 'sent_to_kitchen'::order_status
        WHEN o.status::text NOT IN ('sent_to_kitchen', 'preparing', 'ready') THEN o.status
        WHEN agg.all_ready_or_served THEN 'ready'::order_status
        WHEN agg.any_beyond_sent THEN 'preparing'::order_status
        ELSE 'sent_to_kitchen'::order_status
      END,
      sync_version = COALESCE(o.sync_version, 0) + 1,
      updated_at = v_now
    FROM (
      SELECT
        oi.order_id,
        bool_and(oi.kitchen_status IN ('ready', 'served')) AS all_ready_or_served,
        bool_or(oi.kitchen_status IN ('preparing', 'ready', 'served')) AS any_beyond_sent
      FROM public.order_items oi
      WHERE oi.order_id = ANY(v_affected_order_ids)
        AND COALESCE(oi.is_voided, false) = false
        AND COALESCE(oi.refunded_quantity, 0) < oi.quantity
        AND oi.kitchen_status IS NOT NULL
      GROUP BY oi.order_id
    ) agg
    WHERE o.id = agg.order_id;
  END IF;

  v_result := jsonb_build_object(
    'updated_count', v_updated_count,
    'kds_updated_count', v_kds_updated_count,
    'affected_order_ids', COALESCE(to_jsonb(v_affected_order_ids), '[]'::jsonb),
    'status', p_status
  );

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM public._idempotency_complete(
      p_idempotency_key,
      'bulk_update_order_item_status_v2',
      v_result
    );
  END IF;

  RETURN v_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.bulk_update_order_item_status_v2(uuid[], text, uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.bulk_update_order_item_status_v2(uuid[], text, uuid, uuid) IS
  'Bulk-updates order item kitchen_status, cascades display KDS status/timestamps, updates parent order readiness from active non-voided/non-refunded items, and returns actual update counts with optional idempotency.';