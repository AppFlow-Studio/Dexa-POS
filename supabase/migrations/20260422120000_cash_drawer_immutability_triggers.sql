-- ============================================================================
-- Cash Drawer & Audit Log Immutability Triggers
-- ============================================================================
-- Prevents UPDATE/DELETE on audit-critical tables for ALL roles (including
-- service_role and postgres superuser). Legitimate corrections require
-- explicit ALTER TABLE ... DISABLE TRIGGER, creating a governance event.
-- ============================================================================

-- 1. Generic immutability trigger function (for fully immutable tables)
CREATE OR REPLACE FUNCTION prevent_audit_record_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'Audit records are immutable. % operations are not permitted on %.',
    TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
  RETURN NULL;
END;
$$;

-- 2. Conditional immutability for closed sessions (open sessions must remain updatable)
CREATE OR REPLACE FUNCTION prevent_closed_session_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'closed' THEN
    RAISE EXCEPTION
      'Closed cash drawer sessions are immutable. % operations are not permitted on closed sessions (session_id: %).',
      TG_OP, OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;

  -- Allow UPDATE/DELETE on non-closed sessions (needed for close flow)
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- 3. Attach triggers

-- cash_drawer_operations: fully immutable (append-only)
DROP TRIGGER IF EXISTS trg_immutable_cash_drawer_ops ON cash_drawer_operations;
CREATE TRIGGER trg_immutable_cash_drawer_ops
  BEFORE UPDATE OR DELETE ON cash_drawer_operations
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_record_mutation();

-- audit_logs: fully immutable (append-only)
DROP TRIGGER IF EXISTS trg_immutable_audit_logs ON audit_logs;
CREATE TRIGGER trg_immutable_audit_logs
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_record_mutation();

-- cash_drawer_sessions: immutable once closed
DROP TRIGGER IF EXISTS trg_immutable_closed_sessions ON cash_drawer_sessions;
CREATE TRIGGER trg_immutable_closed_sessions
  BEFORE UPDATE OR DELETE ON cash_drawer_sessions
  FOR EACH ROW
  EXECUTE FUNCTION prevent_closed_session_mutation();

-- 4. Performance indexes for variance analysis queries
CREATE INDEX IF NOT EXISTS idx_cash_drawer_ops_session_type
  ON cash_drawer_operations (session_id, operation_type);

CREATE INDEX IF NOT EXISTS idx_cash_drawer_ops_session_time
  ON cash_drawer_operations (session_id, performed_at);
