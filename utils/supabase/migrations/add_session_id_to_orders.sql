-- =====================================================================
-- Migration: Add Bidirectional Order-Session Relationship
-- =====================================================================
-- This migration adds a session_id column to the orders table, creating
-- a bidirectional relationship between orders and table sessions.
--
-- Benefits:
-- - O(1) lookup to find which table/session an order belongs to
-- - Atomic payment-to-table updates
-- - Better offline reconciliation with 2x redundancy
-- - Enables analytics queries joining orders and sessions
-- - Database-enforced referential integrity
-- =====================================================================

-- Add session_id column to orders table
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES table_sessions(id) ON DELETE SET NULL;

-- Add comment explaining the field
COMMENT ON COLUMN orders.session_id IS 'Bidirectional link to table session for dine-in orders. Allows O(1) lookup of which table/session an order belongs to. NULL for takeout/delivery orders.';

-- Create index for reverse lookup (order → session)
-- This enables fast queries like "which session does this order belong to?"
CREATE INDEX IF NOT EXISTS idx_orders_session_id ON orders(session_id);

-- Create index for forward lookup (session → order) if not exists
-- This should already exist but we ensure it's there
CREATE INDEX IF NOT EXISTS idx_table_sessions_order_id ON table_sessions(order_id);

-- =====================================================================
-- Verification Queries (run these after migration to verify)
-- =====================================================================
-- 1. Check column exists:
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'orders' AND column_name = 'session_id';
--
-- 2. Check indexes exist:
-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE tablename = 'orders' AND indexname = 'idx_orders_session_id';
--
-- 3. Check foreign key constraint:
-- SELECT constraint_name, constraint_type
-- FROM information_schema.table_constraints
-- WHERE table_name = 'orders' AND constraint_type = 'FOREIGN KEY';
-- =====================================================================
