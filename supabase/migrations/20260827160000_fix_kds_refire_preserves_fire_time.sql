-- KDS re-fire safety: a re-fired item must keep its original ticket and timer.
--
-- S2 from the kitchen-send & order-sync audit: bulk_update_order_item_status_v2
-- set `fire_time = v_now` unconditionally for p_status = 'sent'. KDS ticket
-- identity is `order_id + '_c' + course + '_f' + floor(fire_time_ms)`, so any
-- retroactive re-fire (K3/K4/K5) silently moved an already-fired item onto a
-- fresh ticket and reset its progress.
--
-- Fix: mirror the 'preparing' branch — `COALESCE(fire_time, v_now)` — so a
-- re-fire keeps the original fire_time (and therefore the original ticket).
-- Deliberate resends still work via recall_kds_items_v2.

-- Keep the four-argument overload dropped (matches the traceability migration).
DROP FUNCTION IF EXISTS public.bulk_update_order_item_status_v2(
  uuid[], text, uuid, uuid
);

CREATE OR REPLACE FUNCTION public.bulk_update_order_item_status_v2(
  p_order_item_ids uuid[],
  p_status text,
  p_staff_id uuid DEFAULT NULL,
  p_idempotency_key uuid DEFAULT NULL,
  p_expected_sync_version integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_cached jsonb;
  v_affected_order_ids uuid[];
  v_target_order_ids uuid[];
  v_mismatch_count integer;
  v_requested_count integer := COALESCE(array_length(p_order_item_ids, 1), 0);
  v_updated_count integer := 0;
  v_kds_updated_count integer := 0;
  v_now timestamptz := now();
  v_result jsonb;
BEGIN
  IF p_order_item_ids IS NULL OR array_length(p_order_item_ids, 1) IS NULL THEN
    RETURN jsonb_build_object(
      'updated_count', 0,
      'requested_count', 0,
      'kds_updated_count', 0,
      'affected_order_ids', '[]'::jsonb,
      'status', p_status
    );
  END IF;

  IF p_status NOT IN ('sent', 'preparing', 'ready', 'served') THEN
    RAISE EXCEPTION
      'Invalid kitchen status: %. Expected sent, preparing, ready, or served.',
      p_status
      USING ERRCODE = '22023';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    v_cached := public._idempotency_claim(
      p_idempotency_key,
      'bulk_update_order_item_status_v2'
    );
    IF v_cached IS NOT NULL THEN
      RETURN v_cached || jsonb_build_object('requested_count', v_requested_count);
    END IF;
  END IF;

  IF p_expected_sync_version IS NOT NULL THEN
    SELECT array_agg(DISTINCT order_id)
      INTO v_target_order_ids
      FROM public.order_items
     WHERE id = ANY(p_order_item_ids);

    IF v_target_order_ids IS NOT NULL THEN
      PERFORM 1
        FROM public.orders
       WHERE id = ANY(v_target_order_ids)
       FOR UPDATE;

      SELECT count(*)
        INTO v_mismatch_count
        FROM public.orders
       WHERE id = ANY(v_target_order_ids)
         AND COALESCE(sync_version, 0) <> p_expected_sync_version;

      IF v_mismatch_count > 0 THEN
        RAISE EXCEPTION
          'sync_version mismatch - expected %, refusing to update % order(s)',
          p_expected_sync_version,
          v_mismatch_count
          USING ERRCODE = 'P0004',
                HINT = 'Re-fetch the order, then retry with the current sync_version.';
      END IF;
    END IF;
  END IF;

  UPDATE public.order_items
     SET kitchen_status = p_status,
         updated_at = v_now,
         fire_time = CASE
           WHEN p_status = 'sent' THEN COALESCE(fire_time, v_now)
           WHEN p_status = 'preparing' THEN COALESCE(fire_time, v_now)
           ELSE fire_time
         END,
         sent_to_kitchen_at = CASE
           WHEN p_status IN ('sent', 'preparing')
             THEN COALESCE(sent_to_kitchen_at, v_now)
           ELSE sent_to_kitchen_at
         END,
         started_preparing_at = CASE
           WHEN p_status = 'sent' THEN NULL
           WHEN p_status = 'preparing'
             THEN COALESCE(started_preparing_at, v_now)
           ELSE started_preparing_at
         END,
         completed_at = CASE
           WHEN p_status = 'sent' THEN NULL
           WHEN p_status IN ('ready', 'served')
             THEN COALESCE(completed_at, v_now)
           ELSE completed_at
         END
   WHERE id = ANY(p_order_item_ids);

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  IF p_status = 'sent' THEN
    UPDATE public.kds_item_status
       SET status = 'pending',
           started_at = NULL,
           completed_at = NULL,
           bumped_at = NULL,
           bumped_by = NULL
     WHERE order_item_id = ANY(p_order_item_ids)
       AND status <> 'cancelled';
    GET DIAGNOSTICS v_kds_updated_count = ROW_COUNT;

  ELSIF p_status = 'preparing' THEN
    UPDATE public.kds_item_status
       SET status = 'pending',
           started_at = COALESCE(started_at, v_now),
           completed_at = NULL,
           bumped_at = NULL,
           bumped_by = NULL
     WHERE order_item_id = ANY(p_order_item_ids)
       AND status <> 'cancelled';
    GET DIAGNOSTICS v_kds_updated_count = ROW_COUNT;

  ELSIF p_status = 'ready' THEN
    UPDATE public.kds_item_status
       SET status = 'pending',
           completed_at = COALESCE(completed_at, v_now),
           bumped_at = NULL,
           bumped_by = NULL
     WHERE order_item_id = ANY(p_order_item_ids)
       AND status <> 'cancelled';
    GET DIAGNOSTICS v_kds_updated_count = ROW_COUNT;

  ELSIF p_status = 'served' THEN
    UPDATE public.kds_item_status
       SET status = 'completed',
           completed_at = COALESCE(completed_at, v_now),
           bumped_at = v_now,
           bumped_by = p_staff_id
     WHERE order_item_id = ANY(p_order_item_ids)
       AND status NOT IN ('cancelled', 'completed');
    GET DIAGNOSTICS v_kds_updated_count = ROW_COUNT;
  END IF;

  SELECT array_agg(DISTINCT order_id)
    INTO v_affected_order_ids
    FROM public.order_items
   WHERE id = ANY(p_order_item_ids);

  IF v_affected_order_ids IS NOT NULL THEN
    UPDATE public.orders o
       SET sent_to_kitchen_at = CASE
             WHEN p_status IN ('sent', 'preparing')
               THEN COALESCE(o.sent_to_kitchen_at, now())
             ELSE o.sent_to_kitchen_at
           END,
           started_preparing_at = CASE
             WHEN p_status = 'preparing'
               THEN COALESCE(o.started_preparing_at, now())
             ELSE o.started_preparing_at
           END,
           ready_at = CASE
             WHEN agg.all_ready_or_served
                  AND o.status::text IN ('sent_to_kitchen', 'preparing')
               THEN COALESCE(o.ready_at, v_now)
             WHEN NOT agg.all_ready_or_served
                  AND p_status IN ('sent', 'preparing')
               THEN NULL
             ELSE o.ready_at
           END,
           status = CASE
             WHEN p_status = 'sent'
                  AND o.status::text IN ('ready', 'preparing')
               THEN 'sent_to_kitchen'::public.order_status
             WHEN o.status::text NOT IN ('sent_to_kitchen', 'preparing', 'ready')
               THEN o.status
             WHEN agg.all_ready_or_served THEN 'ready'::public.order_status
             WHEN agg.any_beyond_sent THEN 'preparing'::public.order_status
             ELSE 'sent_to_kitchen'::public.order_status
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
    'requested_count', v_requested_count,
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

REVOKE ALL ON FUNCTION public.bulk_update_order_item_status_v2(
  uuid[], text, uuid, uuid, integer
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bulk_update_order_item_status_v2(
  uuid[], text, uuid, uuid, integer
) TO authenticated, service_role;

COMMENT ON FUNCTION public.bulk_update_order_item_status_v2(
  uuid[], text, uuid, uuid, integer
) IS
  'Bulk-updates order item/KDS status with idempotency and optimistic concurrency. Re-firing a sent item preserves fire_time (original KDS ticket) via COALESCE.';
