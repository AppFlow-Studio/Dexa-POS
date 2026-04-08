-- ============================================================
-- KDS Recall & Rush Toggle RPCs
-- ============================================================

-- recall_kds_items: Resets order items back to "sent" status
-- and clears KDS item status records, effectively recalling
-- a completed ticket back to the pending queue.
CREATE OR REPLACE FUNCTION recall_kds_items(
  p_order_item_ids UUID[]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order_id UUID;
BEGIN
  -- Reset order_items kitchen_status back to 'sent'
  UPDATE order_items
  SET
    kitchen_status = 'sent',
    completed_at = NULL,
    started_preparing_at = NULL,
    updated_at = NOW()
  WHERE id = ANY(p_order_item_ids);

  -- Reset kds_item_status records back to 'pending'
  UPDATE kds_item_status
  SET
    status = 'pending',
    started_at = NULL,
    completed_at = NULL,
    bumped_at = NULL,
    bumped_by = NULL,
    updated_at = NOW()
  WHERE order_item_id = ANY(p_order_item_ids);

  -- Touch parent order(s) to trigger broadcast
  FOR v_order_id IN
    SELECT DISTINCT order_id FROM order_items WHERE id = ANY(p_order_item_ids)
  LOOP
    UPDATE orders
    SET
      updated_at = NOW(),
      sync_version = COALESCE(sync_version, 0) + 1
    WHERE id = v_order_id;
  END LOOP;
END;
$$;

-- toggle_rush_order_items: Sets rush flag on given order items
-- and touches the parent order to trigger broadcast.
CREATE OR REPLACE FUNCTION toggle_rush_order_items(
  p_order_item_ids UUID[],
  p_rush BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order_id UUID;
BEGIN
  -- Set rush flag on all specified items
  UPDATE order_items
  SET
    rush = p_rush,
    updated_at = NOW()
  WHERE id = ANY(p_order_item_ids);

  -- Touch parent order(s) to trigger broadcast
  FOR v_order_id IN
    SELECT DISTINCT order_id FROM order_items WHERE id = ANY(p_order_item_ids)
  LOOP
    UPDATE orders
    SET
      updated_at = NOW(),
      sync_version = COALESCE(sync_version, 0) + 1
    WHERE id = v_order_id;
  END LOOP;
END;
$$;
