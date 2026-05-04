-- Fix recall_kds_items_v2 so recalled KDS tickets restart as a clean
-- kitchen cycle and completed display rows are reopened predictably.

CREATE OR REPLACE FUNCTION public.recall_kds_items_v2(
  p_order_item_ids uuid[],
  p_target_status text DEFAULT 'sent'::text,
  p_idempotency_key uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_cached jsonb;
  v_affected_order_ids uuid[];
  v_target_order_status order_status;
BEGIN
  IF p_order_item_ids IS NULL OR array_length(p_order_item_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  IF p_target_status NOT IN ('sent', 'preparing') THEN
    RAISE EXCEPTION 'Invalid KDS recall target status: %. Expected sent or preparing.', p_target_status
      USING ERRCODE = '22023';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    v_cached := public._idempotency_claim(p_idempotency_key, 'recall_kds_items_v2');

    IF v_cached IS NOT NULL THEN
      RETURN;
    END IF;
  END IF;

  v_target_order_status :=
    CASE
      WHEN p_target_status = 'preparing' THEN 'preparing'::order_status
      ELSE 'sent_to_kitchen'::order_status
    END;

  UPDATE public.order_items oi
  SET
    kitchen_status = p_target_status,
    fire_time = NOW(),
    sent_to_kitchen_at = COALESCE(oi.sent_to_kitchen_at, NOW()),
    started_preparing_at = CASE
      WHEN p_target_status = 'preparing' THEN NOW()
      ELSE NULL
    END,
    completed_at = NULL,
    updated_at = NOW()
  WHERE oi.id = ANY(p_order_item_ids);

  UPDATE public.kds_item_status kis
  SET
    status = 'pending',
    started_at = CASE
      WHEN p_target_status = 'preparing' THEN NOW()
      ELSE NULL
    END,
    completed_at = NULL,
    bumped_at = NULL,
    bumped_by = NULL
  WHERE kis.order_item_id = ANY(p_order_item_ids);

  SELECT array_agg(DISTINCT oi.order_id)
  INTO v_affected_order_ids
  FROM public.order_items oi
  WHERE oi.id = ANY(p_order_item_ids);

  IF v_affected_order_ids IS NOT NULL THEN
    UPDATE public.orders o
    SET
      status = CASE
        WHEN o.status::text IN (
          'ready',
          'completed',
          'cancelled',
          'void',
          'refunded'
        )
        THEN v_target_order_status
        ELSE o.status
      END,
      sent_to_kitchen_at = COALESCE(o.sent_to_kitchen_at, NOW()),
      started_preparing_at = CASE
        WHEN p_target_status = 'preparing' THEN COALESCE(o.started_preparing_at, NOW())
        ELSE o.started_preparing_at
      END,
      ready_at = NULL,
      updated_at = NOW(),
      sync_version = COALESCE(o.sync_version, 0) + 1
    WHERE o.id = ANY(v_affected_order_ids);
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM public._idempotency_complete(
      p_idempotency_key,
      'recall_kds_items_v2',
      jsonb_build_object(
        'recalled_count', array_length(p_order_item_ids, 1),
        'target_status', p_target_status,
        'affected_order_ids', to_jsonb(v_affected_order_ids)
      )
    );
  END IF;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.recall_kds_items_v2(uuid[], text, uuid) TO authenticated;

COMMENT ON FUNCTION public.recall_kds_items_v2(uuid[], text, uuid) IS
  'Recalls KDS items to sent/preparing, reopens parent orders when needed, resets display KDS rows to pending, and uses optional idempotency for safe retry.';