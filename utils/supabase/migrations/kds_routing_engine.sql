-- ============================================================================
-- Migration: kds_routing_engine.sql
-- KDS item-level routing engine via database triggers
-- Routes order items to appropriate KDS displays based on routing rules
-- ============================================================================

-- ============================================================================
-- 2e. Indexes (create first so triggers can use them)
-- ============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS uq_kds_item_status_display_item
  ON kds_item_status (kds_display_id, order_item_id);

CREATE INDEX IF NOT EXISTS idx_kds_routing_rules_display
  ON kds_routing_rules (kds_display_id, rule_type);

-- ============================================================================
-- 2a. route_items_to_kds() trigger function
-- Fires AFTER INSERT OR UPDATE OF sent_to_kitchen_at ON order_items
-- Routes items to appropriate KDS displays based on routing rules
-- ============================================================================
CREATE OR REPLACE FUNCTION route_items_to_kds()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_location_id UUID;
  v_order_type TEXT;
  v_display RECORD;
  v_matched BOOLEAN;
  v_any_routed BOOLEAN := false;
  v_rule RECORD;
  v_resolved_prep_station TEXT;
BEGIN
  -- Only process when sent_to_kitchen_at transitions from NULL to a value
  IF NEW.sent_to_kitchen_at IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.sent_to_kitchen_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Get the location_id and order_type from the parent order
  SELECT o.location_id, o.order_type
  INTO v_location_id, v_order_type
  FROM orders o
  WHERE o.id = NEW.order_id;

  IF v_location_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Resolve effective prep station via location overrides cascade
  v_resolved_prep_station := resolve_item_prep_station(NEW.menu_item_id, v_location_id, NEW.category_id);
  IF v_resolved_prep_station IS NULL THEN
    v_resolved_prep_station := NEW.prep_station;
  END IF;

  -- Iterate over all active KDS displays for this location
  FOR v_display IN
    SELECT d.id, d.routing_mode, d.show_all_items
    FROM kds_displays d
    WHERE d.location_id = v_location_id
      AND d.is_active = true
  LOOP
    v_matched := false;

    -- routing_mode = 'all' (expo/catch-all): always route
    IF v_display.routing_mode = 'all' THEN
      v_matched := true;
    ELSE
      -- Check routing rules for this display
      FOR v_rule IN
        SELECT r.rule_type, r.rule_value
        FROM kds_routing_rules r
        WHERE r.kds_display_id = v_display.id
      LOOP
        -- Match by prep_station (resolved from location overrides)
        IF v_rule.rule_type = 'prep_station' AND v_resolved_prep_station = v_rule.rule_value THEN
          v_matched := true;
          EXIT; -- One match is enough
        END IF;

        -- Match by category (name or ID)
        IF v_rule.rule_type = 'category' AND (
          NEW.category_name = v_rule.rule_value
          OR (NEW.category_id IS NOT NULL AND NEW.category_id::text = v_rule.rule_value)
        ) THEN
          v_matched := true;
          EXIT;
        END IF;

        -- Match by order_type
        IF v_rule.rule_type = 'order_type' AND v_order_type = v_rule.rule_value THEN
          v_matched := true;
          EXIT;
        END IF;
      END LOOP;
    END IF;

    -- Also match if display has show_all_items = true (expo display that gets copies of everything)
    IF NOT v_matched AND COALESCE(v_display.show_all_items, false) THEN
      v_matched := true;
    END IF;

    -- Insert into kds_item_status if matched (idempotent via ON CONFLICT)
    IF v_matched THEN
      INSERT INTO kds_item_status (kds_display_id, order_id, order_item_id, status)
      VALUES (v_display.id, NEW.order_id, NEW.id, 'pending')
      ON CONFLICT (kds_display_id, order_item_id) DO NOTHING;

      v_any_routed := true;
    END IF;
  END LOOP;

  -- Fallback: route unmatched items so nothing is lost
  -- Prefer show_all_items displays first; only blast to ALL if none exist
  IF NOT v_any_routed THEN
    FOR v_display IN
      SELECT d.id FROM kds_displays d
      WHERE d.location_id = v_location_id
        AND d.is_active = true
        AND COALESCE(d.show_all_items, false) = true
    LOOP
      INSERT INTO kds_item_status (kds_display_id, order_id, order_item_id, status)
      VALUES (v_display.id, NEW.order_id, NEW.id, 'pending')
      ON CONFLICT (kds_display_id, order_item_id) DO NOTHING;
      v_any_routed := true;
    END LOOP;

    -- Last resort: no show_all_items displays, send to every active display
    IF NOT v_any_routed THEN
      FOR v_display IN
        SELECT d.id FROM kds_displays d
        WHERE d.location_id = v_location_id AND d.is_active = true
      LOOP
        INSERT INTO kds_item_status (kds_display_id, order_id, order_item_id, status)
        VALUES (v_display.id, NEW.order_id, NEW.id, 'pending')
        ON CONFLICT (kds_display_id, order_item_id) DO NOTHING;
      END LOOP;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Create the trigger
DROP TRIGGER IF EXISTS trg_route_items_to_kds ON order_items;
CREATE TRIGGER trg_route_items_to_kds
  AFTER INSERT OR UPDATE OF sent_to_kitchen_at ON order_items
  FOR EACH ROW
  EXECUTE FUNCTION route_items_to_kds();

-- ============================================================================
-- 2b. handle_kds_item_void() trigger function
-- Fires when an order item is voided - cancels it across all KDS displays
-- ============================================================================
CREATE OR REPLACE FUNCTION handle_kds_item_void()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE kds_item_status
  SET
    status = 'cancelled',
    completed_at = NOW()
  WHERE order_item_id = NEW.id
    AND status NOT IN ('cancelled', 'completed');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_kds_item_void ON order_items;
CREATE TRIGGER trg_kds_item_void
  AFTER UPDATE OF is_voided ON order_items
  FOR EACH ROW
  WHEN (NEW.is_voided = true AND (OLD.is_voided IS DISTINCT FROM true))
  EXECUTE FUNCTION handle_kds_item_void();

-- ============================================================================
-- 2c. handle_kds_order_cancel() trigger function
-- Fires when an order is cancelled/voided - cancels all KDS items for that order
-- ============================================================================
CREATE OR REPLACE FUNCTION handle_kds_order_cancel()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE kds_item_status
  SET
    status = 'cancelled',
    completed_at = NOW()
  WHERE order_id = NEW.id
    AND status NOT IN ('cancelled', 'completed');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_kds_order_cancel ON orders;
CREATE TRIGGER trg_kds_order_cancel
  AFTER UPDATE OF status ON orders
  FOR EACH ROW
  WHEN (NEW.status IN ('cancelled', 'void'))
  EXECUTE FUNCTION handle_kds_order_cancel();

-- ============================================================================
-- 2d. propagate_rush_to_kds() trigger function
-- When an item is marked rush, touch the parent order's updated_at to trigger broadcast
-- ============================================================================
CREATE OR REPLACE FUNCTION propagate_rush_to_kds()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Touch the parent order to trigger a broadcast
  UPDATE orders
  SET updated_at = NOW()
  WHERE id = NEW.order_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_propagate_rush_to_kds ON order_items;
CREATE TRIGGER trg_propagate_rush_to_kds
  AFTER UPDATE OF rush ON order_items
  FOR EACH ROW
  WHEN (NEW.rush = true AND (OLD.rush IS DISTINCT FROM true))
  EXECUTE FUNCTION propagate_rush_to_kds();

-- ============================================================================
-- Comments
-- ============================================================================
COMMENT ON FUNCTION route_items_to_kds() IS
'Routes order items to KDS displays based on routing rules when sent_to_kitchen_at is set. Supports prep_station, category, and order_type matching.';

COMMENT ON FUNCTION handle_kds_item_void() IS
'Cancels KDS item status rows when an order item is voided.';

COMMENT ON FUNCTION handle_kds_order_cancel() IS
'Cancels all KDS item status rows when an order is cancelled or voided.';

COMMENT ON FUNCTION propagate_rush_to_kds() IS
'Touches parent order updated_at when an item is marked rush, triggering broadcast to KDS.';
