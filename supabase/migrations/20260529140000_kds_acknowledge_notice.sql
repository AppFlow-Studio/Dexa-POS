-- Unified acknowledgement RPC for voided and refunded KDS item notices.
--
-- p_kds_display_id is optional:
--   - When provided: acknowledges only the row for that specific display (multi-display scoping)
--   - When NULL: acknowledges ALL unacknowledged rows for the item (single-display / no display config)

CREATE OR REPLACE FUNCTION public.acknowledge_kds_notice(
  p_order_item_id uuid,
  p_kds_display_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_staff_id uuid;
  v_updated_count integer := 0;
  v_inserted_count integer := 0;
BEGIN
  SELECT sp.id
  INTO v_staff_id
  FROM public.staff_profiles sp
  WHERE sp.user_id = public.get_my_claim('sub')
    AND sp.is_active = true
  ORDER BY sp.created_at DESC
  LIMIT 1;

  -- Update existing rows. When p_kds_display_id is NULL, update all rows for this item.
  UPDATE public.kds_item_status kis
  SET
    status = 'cancelled',
    acknowledged_at = NOW(),
    acknowledged_by = v_staff_id
  WHERE kis.order_item_id = p_order_item_id
    AND kis.acknowledged_at IS NULL
    AND (p_kds_display_id IS NULL OR kis.kds_display_id = p_kds_display_id);

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  -- No existing row was updated — insert one.
  -- kds_display_id may be NULL (no display configured); the NOT EXISTS check in
  -- get_kds_tickets_v2 finds this row regardless of display ID.
  IF v_updated_count = 0 THEN
    INSERT INTO public.kds_item_status (
      order_item_id,
      order_id,
      kds_display_id,
      status,
      acknowledged_at,
      acknowledged_by
    )
    SELECT
      oi.id,
      oi.order_id,
      p_kds_display_id,
      'cancelled',
      NOW(),
      v_staff_id
    FROM public.order_items oi
    WHERE oi.id = p_order_item_id
      AND (
        COALESCE(oi.is_voided, false) = true
        OR COALESCE(oi.refunded_quantity, 0) > 0
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.kds_item_status existing
        WHERE existing.order_item_id = p_order_item_id
          AND (
            (p_kds_display_id IS NULL AND existing.kds_display_id IS NULL)
            OR existing.kds_display_id = p_kds_display_id
          )
      );

    GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'order_item_id', p_order_item_id,
    'kds_display_id', p_kds_display_id,
    'acknowledged', true,
    'updated_count', v_updated_count,
    'inserted_count', v_inserted_count,
    'acknowledged_by', v_staff_id
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.acknowledge_kds_notice(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.acknowledge_kds_notice(uuid, uuid) IS
  'Idempotent acknowledgement for voided/refunded KDS notices. '
  'When p_kds_display_id is NULL, acknowledges all rows for the item. '
  'When provided, scopes to that display only.';
