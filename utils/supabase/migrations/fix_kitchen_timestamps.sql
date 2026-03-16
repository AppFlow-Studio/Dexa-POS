-- ============================================================================
-- Migration: fix_kitchen_timestamps.sql
-- Fixes update_order_status and bulk_update_order_item_status RPCs to properly
-- set kitchen-related timestamps (sent_to_kitchen_at, started_preparing_at, etc.)
-- ============================================================================

-- ============================================================================
-- 1a. Fix update_order_status RPC
-- Sets appropriate timestamps when transitioning to kitchen-related statuses
-- ============================================================================
CREATE OR REPLACE FUNCTION update_order_status(
  p_order_id UUID,
  p_new_status TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_status TEXT;
  v_result JSONB;
BEGIN
  -- Get current status
  SELECT status::text INTO v_current_status
  FROM orders
  WHERE id = p_order_id;

  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'Order not found: %', p_order_id;
  END IF;

  -- Prevent redundant status updates
  IF v_current_status = p_new_status THEN
    RAISE EXCEPTION 'Order is already in % status', p_new_status
      USING ERRCODE = 'P0001';
  END IF;

  -- Update the order with appropriate timestamps based on new status
  UPDATE orders
  SET
    status = p_new_status::order_status,
    updated_at = NOW(),
    -- Set sent_to_kitchen_at when transitioning to sent_to_kitchen or preparing
    sent_to_kitchen_at = CASE
      WHEN p_new_status IN ('sent_to_kitchen', 'preparing')
        THEN COALESCE(sent_to_kitchen_at, NOW())
      ELSE sent_to_kitchen_at
    END,
    -- Set started_preparing_at when transitioning to preparing
    started_preparing_at = CASE
      WHEN p_new_status = 'preparing'
        THEN COALESCE(started_preparing_at, NOW())
      ELSE started_preparing_at
    END,
    -- Set ready_at when transitioning to ready
    ready_at = CASE
      WHEN p_new_status = 'ready'
        THEN COALESCE(ready_at, NOW())
      ELSE ready_at
    END,
    -- Set completed_at when transitioning to completed
    completed_at = CASE
      WHEN p_new_status = 'completed'
        THEN COALESCE(completed_at, NOW())
      ELSE completed_at
    END,
    -- Set cancelled_at when transitioning to cancelled
    cancelled_at = CASE
      WHEN p_new_status = 'cancelled'
        THEN COALESCE(cancelled_at, NOW())
      ELSE cancelled_at
    END,
    cancellation_reason = CASE
      WHEN p_new_status = 'cancelled' AND p_reason IS NOT NULL
        THEN p_reason
      ELSE cancellation_reason
    END
  WHERE id = p_order_id;

  -- Return the updated order
  SELECT jsonb_build_object(
    'id', id,
    'status', status,
    'sent_to_kitchen_at', sent_to_kitchen_at,
    'started_preparing_at', started_preparing_at,
    'ready_at', ready_at,
    'completed_at', completed_at
  ) INTO v_result
  FROM orders
  WHERE id = p_order_id;

  RETURN v_result;
END;
$$;

-- ============================================================================
-- 1b. Fix bulk_update_order_item_status RPC
-- Sets sent_to_kitchen_at on items when status = 'sent', and propagates
-- sent_to_kitchen_at to the parent order
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
    -- Set fire_time when status is 'sent' (for KDS round grouping)
    fire_time = CASE
      WHEN p_status = 'sent' THEN NOW()
      ELSE fire_time
    END,
    -- Set sent_to_kitchen_at when status is 'sent'
    sent_to_kitchen_at = CASE
      WHEN p_status = 'sent'
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
      -- Timestamps
      sent_to_kitchen_at = CASE
        WHEN p_status = 'sent' THEN COALESCE(o.sent_to_kitchen_at, NOW())
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
