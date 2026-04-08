-- Migration: fix_duplicate_broadcasts.sql
-- Phase 2: Fix duplicate broadcast issue (CORRECTED VERSION)
--
-- Problem: Multiple broadcasts occur because:
-- 1. order_items_broadcast_trigger → UPDATE orders → broadcast
-- 2. order_item_modifiers_broadcast_trigger → UPDATE orders → broadcast
-- 3. increment_order_sync_version() → UPDATE orders → broadcast
-- Result: 2-3 broadcasts per operation!
--
-- Solution: Remove cascade triggers entirely
-- - All updates go through RPC functions (user confirmed)
-- - RPC functions call increment_order_sync_version() at the end
-- - That triggers ONE deferred broadcast with complete data

-- ============================================================================
-- STEP 1: Drop cascade triggers (they cause multiple broadcasts)
-- ============================================================================

DROP TRIGGER IF EXISTS order_items_broadcast_trigger ON order_items;
DROP TRIGGER IF EXISTS order_item_modifiers_broadcast_trigger ON order_item_modifiers;

-- ============================================================================
-- STEP 2: Drop existing immediate orders trigger
-- ============================================================================

DROP TRIGGER IF EXISTS orders_broadcast_trigger ON orders;

-- ============================================================================
-- STEP 3: Create deferred orders trigger
-- ============================================================================

CREATE CONSTRAINT TRIGGER orders_broadcast_trigger_deferred
  AFTER INSERT OR UPDATE OR DELETE ON orders
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION broadcast_order_changes();

-- ============================================================================
-- NOTES
-- ============================================================================
-- The cascade functions can remain but are unused:
-- - broadcast_order_item_changes()
-- - broadcast_order_item_modifier_changes()
-- You can optionally DROP FUNCTION them if you want to clean up.

-- Why this works:
-- 1. RPC functions (add_order_item_v2, etc.) insert items/modifiers directly
-- 2. No triggers fire during INSERT (cascade triggers removed)
-- 3. At end of RPC, increment_order_sync_version() updates orders table
-- 4. That triggers ONE deferred broadcast (queued for COMMIT)
-- 5. At COMMIT, broadcast_order_changes() fetches complete order from DB
-- 6. Broadcast includes ALL items and modifiers that were just inserted
-- 7. Result: ONE broadcast with complete, consistent data!

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- After migration, test by adding item with 2 modifiers, then run:
-- SELECT COUNT(*) FROM realtime.messages
-- WHERE topic = 'location:your-location-id:orders'
--   AND inserted_at > NOW() - INTERVAL '10 seconds';
-- Expected: ONLY 1 entry

-- To see the broadcast payload:
-- SELECT
--   id,
--   topic,
--   event,
--   inserted_at,
--   payload->>'operation' as operation,
--   payload->'data'->'order'->>'sync_version' as sync_version,
--   jsonb_array_length(payload->'data'->'order'->'order_items') as item_count
-- FROM realtime.messages
-- WHERE topic LIKE 'location:%:orders'
--   AND inserted_at > NOW() - INTERVAL '1 minute'
-- ORDER BY inserted_at DESC
-- LIMIT 5;

-- ============================================================================
-- ROLLBACK (if needed)
-- ============================================================================

-- DROP TRIGGER IF EXISTS orders_broadcast_trigger_deferred ON orders;
--
-- CREATE TRIGGER orders_broadcast_trigger
--   AFTER INSERT OR UPDATE OR DELETE ON orders
--   FOR EACH ROW
--   EXECUTE FUNCTION broadcast_order_changes();
--
-- CREATE TRIGGER order_items_broadcast_trigger
--   AFTER INSERT OR UPDATE OR DELETE ON order_items
--   FOR EACH ROW
--   EXECUTE FUNCTION broadcast_order_item_changes();
--
-- CREATE TRIGGER order_item_modifiers_broadcast_trigger
--   AFTER INSERT OR UPDATE OR DELETE ON order_item_modifiers
--   FOR EACH ROW
--   EXECUTE FUNCTION broadcast_order_item_modifier_changes();
