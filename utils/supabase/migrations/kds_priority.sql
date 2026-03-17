-- ============================================================================
-- KDS Priority Persistence: Column + RPC
-- Mirrors the existing rush pattern (toggle_rush_order_items)
-- ============================================================================

-- 1. Add is_prioritized column to order_items
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS is_prioritized BOOLEAN DEFAULT false;

-- 2. Create RPC to toggle priority on order items
CREATE OR REPLACE FUNCTION toggle_priority_order_items(
  p_order_item_ids UUID[],
  p_is_prioritized BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order_id UUID;
BEGIN
  -- Update the priority flag on specified items
  UPDATE order_items
  SET is_prioritized = p_is_prioritized,
      updated_at = NOW()
  WHERE id = ANY(p_order_item_ids);

  -- Touch parent orders to trigger broadcast (bumps sync_version)
  FOR v_order_id IN
    SELECT DISTINCT order_id
    FROM order_items
    WHERE id = ANY(p_order_item_ids)
  LOOP
    UPDATE orders
    SET updated_at = NOW(),
        sync_version = COALESCE(sync_version, 0) + 1
    WHERE id = v_order_id;
  END LOOP;
END;
$$;
