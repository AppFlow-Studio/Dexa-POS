-- Migration: order_item_broadcast_trigger.sql
-- Phase 2.5: Order Item Sync with Modifiers
--
-- Strategy: When an order_item or order_item_modifier changes, touch the parent order
-- to trigger its broadcast. This implements "order-level refresh" where all devices
-- receive the complete order with all items and modifiers when any item changes.

-- ============================================================================
-- FUNCTION: broadcast_order_item_changes
-- ============================================================================
-- Trigger function for order item changes.
-- Instead of broadcasting item changes directly, we "touch" the parent order
-- to trigger the orders broadcast trigger with fresh data including all items.

CREATE OR REPLACE FUNCTION broadcast_order_item_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $
DECLARE
  v_order_id UUID;
BEGIN
  -- Get the order ID from the changed item
  v_order_id := COALESCE(NEW.order_id, OLD.order_id);

  IF v_order_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Touch the parent order to trigger its broadcast
  -- This causes broadcast_order_changes() to fire with fresh item data
  UPDATE orders
  SET updated_at = NOW()
  WHERE id = v_order_id;

  RETURN COALESCE(NEW, OLD);

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'broadcast_order_item_changes failed: %', SQLERRM;
  RETURN COALESCE(NEW, OLD);
END;
$;

-- ============================================================================
-- TRIGGER: order_items_broadcast_trigger
-- ============================================================================
-- Fires on INSERT, UPDATE, or DELETE on order_items table.
-- Cascades the change to the parent order for broadcast.

DROP TRIGGER IF EXISTS order_items_broadcast_trigger ON order_items;

CREATE TRIGGER order_items_broadcast_trigger
  AFTER INSERT OR UPDATE OR DELETE ON order_items
  FOR EACH ROW
  EXECUTE FUNCTION broadcast_order_item_changes();

-- ============================================================================
-- FUNCTION: broadcast_order_item_modifier_changes
-- ============================================================================
-- Trigger function for order item modifier changes.
-- Looks up the parent order via the order_item and touches it.

CREATE OR REPLACE FUNCTION broadcast_order_item_modifier_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $
DECLARE
  v_order_id UUID;
BEGIN
  -- Get order_id via the parent order_item
  SELECT oi.order_id INTO v_order_id
  FROM order_items oi
  WHERE oi.id = COALESCE(NEW.order_item_id, OLD.order_item_id);

  -- Touch the parent order to trigger its broadcast
  IF v_order_id IS NOT NULL THEN
    UPDATE orders
    SET updated_at = NOW()
    WHERE id = v_order_id;
  END IF;

  RETURN COALESCE(NEW, OLD);

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'broadcast_order_item_modifier_changes failed: %', SQLERRM;
  RETURN COALESCE(NEW, OLD);
END;
$;

-- ============================================================================
-- TRIGGER: order_item_modifiers_broadcast_trigger
-- ============================================================================
-- Fires on INSERT, UPDATE, or DELETE on order_item_modifiers table.
-- Cascades the change to the parent order for broadcast.

DROP TRIGGER IF EXISTS order_item_modifiers_broadcast_trigger ON order_item_modifiers;

CREATE TRIGGER order_item_modifiers_broadcast_trigger
  AFTER INSERT OR UPDATE OR DELETE ON order_item_modifiers
  FOR EACH ROW
  EXECUTE FUNCTION broadcast_order_item_modifier_changes();

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON FUNCTION broadcast_order_item_changes() IS
'Cascades order_item changes to parent order for broadcast. Implements order-level refresh strategy.';

COMMENT ON FUNCTION broadcast_order_item_modifier_changes() IS
'Cascades order_item_modifier changes to parent order for broadcast. Ensures modifiers sync to all devices.';
