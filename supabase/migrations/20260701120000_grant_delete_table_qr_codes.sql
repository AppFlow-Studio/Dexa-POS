-- SECURITY DEFINER RPC to delete a floor plan with full cascade.
-- The client-side approach fails because multiple FK constraints
-- (table_qr_codes, online_order_sessions, qr_guest_alerts) reference
-- floor_plan_objects without CASCADE, and the POS client lacks
-- permission to modify online_order_sessions (RLS).
--
-- This runs with definer privileges so it bypasses RLS.
-- The client only needs EXECUTE permission on this function.

CREATE OR REPLACE FUNCTION delete_floor_plan_cascade(p_floor_plan_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_object_ids uuid[];
  v_qr_code_ids uuid[];
BEGIN
  -- Collect the floor plan object IDs
  SELECT array_agg(id) INTO v_object_ids
  FROM floor_plan_objects
  WHERE floor_plan_id = p_floor_plan_id;

  IF v_object_ids IS NOT NULL THEN
    -- Collect the QR code IDs referencing those objects
    SELECT array_agg(id) INTO v_qr_code_ids
    FROM table_qr_codes
    WHERE floor_plan_object_id = ANY(v_object_ids);

    -- Null out online_order_sessions FK references
    IF v_qr_code_ids IS NOT NULL THEN
      UPDATE online_order_sessions
      SET table_qr_code_id = NULL
      WHERE table_qr_code_id = ANY(v_qr_code_ids);
    END IF;

    UPDATE online_order_sessions
    SET floor_plan_object_id = NULL
    WHERE floor_plan_object_id = ANY(v_object_ids);

    -- Null out qr_guest_alerts FK references
    UPDATE qr_guest_alerts
    SET floor_plan_object_id = NULL
    WHERE floor_plan_object_id = ANY(v_object_ids);

    -- Delete QR codes (now safe — online_order_sessions references are nulled)
    DELETE FROM table_qr_codes WHERE floor_plan_object_id = ANY(v_object_ids);

    -- Delete floor plan objects (now safe — all dependent rows are cleaned up)
    DELETE FROM floor_plan_objects WHERE id = ANY(v_object_ids);
  END IF;

  -- Delete the floor plan itself
  DELETE FROM floor_plans WHERE id = p_floor_plan_id;
END;
$$;

REVOKE ALL ON FUNCTION delete_floor_plan_cascade(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION delete_floor_plan_cascade(uuid) TO anon, authenticated;
