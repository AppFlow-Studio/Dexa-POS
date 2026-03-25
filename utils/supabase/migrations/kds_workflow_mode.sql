-- ============================================================================
-- Migration: kds_workflow_mode.sql
-- Adds configurable KDS workflow mode (2-step vs 3-step) per location.
-- 2-step: items skip Pending, arrive directly as Cooking on KDS.
-- 3-step (default): Pending → Cooking → Served (current behavior).
-- ============================================================================

-- A. Add column to locations
ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS kds_workflow_mode TEXT NOT NULL DEFAULT '3-step'
  CHECK (kds_workflow_mode IN ('2-step', '3-step'));

-- ============================================================================
-- B. Recreate bulk_update_order_item_status — expand timestamp handling
--    so fire_time and sent_to_kitchen_at are also set for "preparing" when null.
--    This enables the KDS routing trigger to fire in 2-step mode.
-- ============================================================================
CREATE OR REPLACE FUNCTION bulk_update_order_item_status(
  p_order_item_ids UUID[],
  p_status TEXT,
  p_staff_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_affected_order_ids UUID[];
  v_result JSONB;
BEGIN
  -- Update order items with appropriate timestamps
  UPDATE order_items
  SET
    kitchen_status = p_status,
    updated_at = NOW(),
    -- Set fire_time when status is 'sent', or when 'preparing' and not yet set (2-step mode)
    fire_time = CASE
      WHEN p_status = 'sent' THEN NOW()
      WHEN p_status = 'preparing' AND fire_time IS NULL THEN NOW()
      ELSE fire_time
    END,
    -- Set sent_to_kitchen_at for 'sent' or 'preparing' (COALESCE preserves existing)
    sent_to_kitchen_at = CASE
      WHEN p_status IN ('sent', 'preparing')
        THEN COALESCE(sent_to_kitchen_at, NOW())
      ELSE sent_to_kitchen_at
    END,
    -- Set started_preparing_at when status is 'preparing'
    started_preparing_at = CASE
      WHEN p_status = 'preparing'
        THEN COALESCE(started_preparing_at, NOW())
      ELSE started_preparing_at
    END,
    -- Set completed_at when status is 'ready' or 'served'
    completed_at = CASE
      WHEN p_status IN ('ready', 'served')
        THEN COALESCE(completed_at, NOW())
      ELSE completed_at
    END
  WHERE id = ANY(p_order_item_ids);

  -- Sync kds_item_status when items progress
  IF p_status = 'preparing' THEN
    UPDATE kds_item_status
    SET started_at = COALESCE(started_at, NOW())
    WHERE order_item_id = ANY(p_order_item_ids)
      AND status = 'pending';
  END IF;

  IF p_status IN ('ready', 'served') THEN
    UPDATE kds_item_status
    SET status = 'completed',
        completed_at = COALESCE(completed_at, NOW()),
        bumped_at = NOW(),
        bumped_by = p_staff_id
    WHERE order_item_id = ANY(p_order_item_ids)
      AND status NOT IN ('cancelled', 'completed');
  END IF;

  -- Get affected order IDs
  SELECT ARRAY_AGG(DISTINCT order_id) INTO v_affected_order_ids
  FROM order_items
  WHERE id = ANY(p_order_item_ids);

  -- Single atomic UPDATE: timestamps + status derivation + sync_version
  -- Only auto-transition orders in kitchen-related statuses (sent_to_kitchen, preparing).
  -- Never auto-set 'completed' (payment-gated).
  IF v_affected_order_ids IS NOT NULL THEN
    UPDATE orders o
    SET
      -- Timestamps: also set sent_to_kitchen_at for 'preparing' (2-step mode)
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
      -- Status derivation (only for kitchen-related statuses, skip when just sending items)
      status = CASE
        WHEN p_status = 'sent' THEN o.status
        WHEN o.status::text NOT IN ('sent_to_kitchen', 'preparing') THEN o.status
        WHEN agg.all_ready_or_served THEN 'ready'::order_status
        WHEN agg.any_beyond_sent THEN 'preparing'::order_status
        ELSE o.status
      END,
      -- Bump sync_version for optimistic locking
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

  RETURN v_result;
END;
$$;

-- ============================================================================
-- C. New RPC: migrate_pending_to_preparing
--    Auto-advance existing "sent" items when switching to 2-step mode.
-- ============================================================================
CREATE OR REPLACE FUNCTION migrate_pending_to_preparing(p_location_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_affected_count INT;
  v_affected_order_ids UUID[];
BEGIN
  -- Advance all "sent" items to "preparing" for active orders at this location
  UPDATE order_items oi
  SET
    kitchen_status = 'preparing',
    started_preparing_at = COALESCE(started_preparing_at, NOW()),
    updated_at = NOW()
  FROM orders o
  WHERE oi.order_id = o.id
    AND o.location_id = p_location_id
    AND o.status IN ('sent_to_kitchen', 'preparing')
    AND oi.kitchen_status = 'sent'
    AND COALESCE(oi.is_voided, false) = false;

  GET DIAGNOSTICS v_affected_count = ROW_COUNT;

  -- Update kds_item_status: set started_at for pending display items
  UPDATE kds_item_status kis
  SET started_at = COALESCE(started_at, NOW()), updated_at = NOW()
  FROM order_items oi, orders o
  WHERE kis.order_item_id = oi.id
    AND oi.order_id = o.id
    AND o.location_id = p_location_id
    AND kis.status = 'pending'
    AND oi.kitchen_status = 'preparing';

  -- Bump sync_version on affected orders to trigger broadcasts
  SELECT ARRAY_AGG(DISTINCT o.id) INTO v_affected_order_ids
  FROM orders o
  WHERE o.location_id = p_location_id
    AND o.status IN ('sent_to_kitchen', 'preparing');

  IF v_affected_order_ids IS NOT NULL THEN
    UPDATE orders
    SET sync_version = COALESCE(sync_version, 0) + 1, updated_at = NOW()
    WHERE id = ANY(v_affected_order_ids);
  END IF;

  RETURN jsonb_build_object('success', true, 'migrated_items', v_affected_count);
END;
$$;

-- ============================================================================
-- D. Modify recall_kds_items — add optional target status param
--    In 2-step mode, recall to "preparing" so ticket lands in Cooking.
-- ============================================================================
CREATE OR REPLACE FUNCTION recall_kds_items(
  p_order_item_ids UUID[],
  p_target_status TEXT DEFAULT 'sent'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order_id UUID;
BEGIN
  -- Reset order_items kitchen_status to target status
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

  -- Reset kds_item_status records
  UPDATE kds_item_status
  SET
    status = CASE WHEN p_target_status = 'preparing' THEN 'pending' ELSE 'pending' END,
    started_at = CASE WHEN p_target_status = 'preparing' THEN COALESCE(started_at, NOW()) ELSE NULL END,
    completed_at = NULL,
    bumped_at = NULL,
    bumped_by = NULL,
    updated_at = NOW()
  WHERE order_item_id = ANY(p_order_item_ids);

  -- Touch parent order(s) to trigger broadcast + reopen terminal orders
  -- so get_kds_tickets_v2 returns them and future broadcasts don't trigger terminal removal
  FOR v_order_id IN
    SELECT DISTINCT order_id FROM order_items WHERE id = ANY(p_order_item_ids)
  LOOP
    UPDATE orders
    SET
      status = CASE
        WHEN status IN ('completed', 'cancelled', 'void', 'refunded')
          THEN CASE
            WHEN p_target_status = 'preparing' THEN 'preparing'::order_status
            ELSE 'sent_to_kitchen'::order_status
          END
        ELSE status
      END,
      updated_at = NOW(),
      sync_version = COALESCE(sync_version, 0) + 1
    WHERE id = v_order_id;
  END LOOP;
END;
$$;
