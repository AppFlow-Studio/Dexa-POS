-- =====================================================================
-- RPC: link_order_to_session
-- =====================================================================
-- Creates or updates a bidirectional relationship between an order and
-- a table session. Updates both orders.session_id and
-- table_sessions.order_id in a single atomic transaction.
--
-- Use Cases:
-- - Linking an existing order to a table session
-- - Moving an order from one table to another
-- - Reconnecting orders after offline sync
-- - Fixing orphaned order-session relationships
-- =====================================================================

CREATE OR REPLACE FUNCTION link_order_to_session(
  p_order_id UUID,
  p_session_id UUID,
  p_staff_id UUID DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result json;
  v_order_exists boolean;
  v_session_exists boolean;
BEGIN
  -- =========================================
  -- Validation
  -- =========================================
  IF p_order_id IS NULL OR p_session_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Both order_id and session_id are required'
    );
  END IF;

  -- Check if order exists
  SELECT EXISTS(SELECT 1 FROM orders WHERE id = p_order_id)
  INTO v_order_exists;

  IF NOT v_order_exists THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Order not found'
    );
  END IF;

  -- Check if session exists
  SELECT EXISTS(SELECT 1 FROM table_sessions WHERE id = p_session_id)
  INTO v_session_exists;

  IF NOT v_session_exists THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Session not found'
    );
  END IF;

  -- =========================================
  -- Bidirectional Update (Atomic)
  -- =========================================

  -- Update order to point to session
  UPDATE orders
  SET
    session_id = p_session_id,
    updated_at = NOW()
  WHERE id = p_order_id;

  -- Update session to point to order
  UPDATE table_sessions
  SET
    order_id = p_order_id,
    updated_at = NOW()
  WHERE id = p_session_id;

  -- =========================================
  -- Success Response
  -- =========================================
  v_result := json_build_object(
    'success', true,
    'order_id', p_order_id,
    'session_id', p_session_id,
    'linked_at', NOW(),
    'message', 'Order and session linked successfully'
  );

  RETURN v_result;

EXCEPTION WHEN OTHERS THEN
  -- Handle any unexpected errors
  RETURN json_build_object(
    'success', false,
    'error', SQLERRM,
    'error_code', SQLSTATE
  );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION link_order_to_session TO authenticated;

-- Add function comment
COMMENT ON FUNCTION link_order_to_session IS 'Links an order to a table session bidirectionally. Updates both orders.session_id and table_sessions.order_id atomically.';

-- =====================================================================
-- Usage Examples:
-- =====================================================================
-- Link order to session:
-- SELECT link_order_to_session(
--   '550e8400-e29b-41d4-a716-446655440000'::uuid,
--   '6ba7b810-9dad-11d1-80b4-00c04fd430c8'::uuid
-- );
--
-- Expected response:
-- {
--   "success": true,
--   "order_id": "550e8400-e29b-41d4-a716-446655440000",
--   "session_id": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
--   "linked_at": "2025-01-19T12:34:56.789Z",
--   "message": "Order and session linked successfully"
-- }
-- =====================================================================
