-- ============================================================================
-- Cash Drawer RLS Policies
-- ============================================================================
-- Enable RLS on all cash drawer tables.
-- Policies are merchant-scoped for authenticated users.
-- cash_drawer_operations is append-only (no UPDATE/DELETE for non-service-role).
-- ============================================================================

-- Enable RLS
ALTER TABLE cash_drawers ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_drawer_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_drawer_operations ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- cash_drawers: SELECT + UPDATE (status changes only)
-- ============================================================================

CREATE POLICY "cash_drawers_select"
  ON cash_drawers
  FOR SELECT
  TO authenticated
  USING (
    merchant_id IN (
      SELECT merchant_id FROM staff_profiles
      WHERE user_id = current_user_id()
    )
  );

CREATE POLICY "cash_drawers_update"
  ON cash_drawers
  FOR UPDATE
  TO authenticated
  USING (
    merchant_id IN (
      SELECT merchant_id FROM staff_profiles
      WHERE user_id = current_user_id()
    )
  )
  WITH CHECK (
    merchant_id IN (
      SELECT merchant_id FROM staff_profiles
      WHERE user_id = current_user_id()
    )
  );

-- ============================================================================
-- cash_drawer_sessions: SELECT + INSERT + UPDATE (for close flow)
-- ============================================================================

CREATE POLICY "cash_drawer_sessions_select"
  ON cash_drawer_sessions
  FOR SELECT
  TO authenticated
  USING (
    merchant_id IN (
      SELECT merchant_id FROM staff_profiles
      WHERE user_id = current_user_id()
    )
  );

CREATE POLICY "cash_drawer_sessions_insert"
  ON cash_drawer_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    merchant_id IN (
      SELECT merchant_id FROM staff_profiles
      WHERE user_id = current_user_id()
    )
  );

CREATE POLICY "cash_drawer_sessions_update"
  ON cash_drawer_sessions
  FOR UPDATE
  TO authenticated
  USING (
    merchant_id IN (
      SELECT merchant_id FROM staff_profiles
      WHERE user_id = current_user_id()
    )
  )
  WITH CHECK (
    merchant_id IN (
      SELECT merchant_id FROM staff_profiles
      WHERE user_id = current_user_id()
    )
  );

-- ============================================================================
-- cash_drawer_operations: append-only (SELECT + INSERT, no UPDATE/DELETE)
-- ============================================================================

CREATE POLICY "cash_drawer_operations_select"
  ON cash_drawer_operations
  FOR SELECT
  TO authenticated
  USING (
    cash_drawer_id IN (
      SELECT id FROM cash_drawers
      WHERE merchant_id IN (
        SELECT merchant_id FROM staff_profiles
        WHERE user_id = current_user_id()
      )
    )
  );

CREATE POLICY "cash_drawer_operations_insert"
  ON cash_drawer_operations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    cash_drawer_id IN (
      SELECT id FROM cash_drawers
      WHERE merchant_id IN (
        SELECT merchant_id FROM staff_profiles
        WHERE user_id = current_user_id()
      )
    )
  );
