-- ============================================================================
-- Cash Drawer RLS Performance Indexes
-- ============================================================================
-- The RLS INSERT policy on cash_drawer_operations does a cascading subquery:
--   cash_drawer_id IN (SELECT id FROM cash_drawers WHERE merchant_id IN
--     (SELECT merchant_id FROM staff_profiles WHERE user_id = current_user_id()))
-- Without indexes, this causes sequential scans on every INSERT (~2.9s observed).
-- ============================================================================

-- Index for cash_drawer_operations RLS subquery (cash_drawer_id lookup)
CREATE INDEX IF NOT EXISTS idx_cash_drawer_ops_drawer_id
  ON cash_drawer_operations (cash_drawer_id);

-- Index for cash_drawers RLS subquery (merchant_id lookup)
CREATE INDEX IF NOT EXISTS idx_cash_drawers_merchant_id
  ON cash_drawers (merchant_id);

-- Index for staff_profiles RLS subquery (user_id lookup)
-- May already exist — IF NOT EXISTS makes this safe
CREATE INDEX IF NOT EXISTS idx_staff_profiles_user_id
  ON staff_profiles (user_id);
