-- ============================================================================
-- Per-Item "TO GO" Flag: Column + Toggle RPC
-- Mirrors the existing per-item priority pattern (kds_priority.sql /
-- toggle_priority_order_items). Lets a single line item in any order be marked
-- to-go (e.g. one drink to-go inside a dine-in check).
-- ============================================================================

-- 1. Add is_to_go column to order_items
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS is_to_go BOOLEAN DEFAULT false;

-- 2. Create RPC to toggle the to-go flag on order items
CREATE OR REPLACE FUNCTION toggle_to_go_order_items(
  p_order_item_ids UUID[],
  p_is_to_go BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_order_id UUID;
BEGIN
  -- Update the to-go flag on specified items
  UPDATE order_items
  SET is_to_go = p_is_to_go,
      updated_at = NOW()
  WHERE id = ANY(p_order_item_ids);

  -- Touch parent orders to trigger broadcast (bumps sync_version so other
  -- stations re-fetch the order and pick up the new flag)
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
