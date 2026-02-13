-- ============================================================
-- Lightweight session status check for kick detection polling.
-- Called every ~30s by the client to verify session is still active.
-- Also called on app foreground and before critical operations.
-- ============================================================

CREATE OR REPLACE FUNCTION check_device_session_status(
  p_device_id TEXT,
  p_session_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session RECORD;
BEGIN
  SELECT 
    ss.id,
    ss.session_status,
    ss.kicked_by_staff_name,
    ss.kick_reason,
    ss.ended_at
  INTO v_session
  FROM station_sessions ss
  WHERE ss.id = p_session_id
    AND ss.device_id = p_device_id;

  IF NOT FOUND THEN
    RETURN json_build_object(
      'is_valid', false,
      'status', 'not_found',
      'error', 'Session not found'
    );
  END IF;

  IF v_session.session_status = 'active' THEN
    RETURN json_build_object(
      'is_valid', true,
      'status', v_session.session_status
    );
  END IF;

  -- Session is no longer active (kicked, ended, or expired)
  RETURN json_build_object(
    'is_valid', false,
    'status', v_session.session_status,
    'kicked_by', v_session.kicked_by_staff_name,
    'kick_reason', v_session.kick_reason,
    'ended_at', v_session.ended_at
  );
END;
$$;
