-- SECURITY DEFINER RPC to delete a floor plan with full cascade.
-- The client-side approach fails because multiple FK constraints
-- (table_qr_codes, online_order_sessions, qr_guest_alerts,
--  table_session_tables) reference floor_plan_objects without CASCADE,
-- and the POS client lacks permission to modify online_order_sessions (RLS).
--
-- Active table sessions at the affected tables are closed gracefully so
-- existing orders are not orphaned — their session links are nulled.
--
-- This runs with definer privileges so it bypasses RLS.
-- The client only needs EXECUTE permission on this function.

CREATE OR REPLACE FUNCTION delete_floor_plan_cascade(p_floor_plan_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_object_ids   uuid[];
  v_session_ids  uuid[];
  v_qr_code_ids  uuid[];
BEGIN
  -- Collect the floor plan object IDs
  SELECT array_agg(id) INTO v_object_ids
  FROM floor_plan_objects
  WHERE floor_plan_id = p_floor_plan_id;

  IF v_object_ids IS NOT NULL THEN
    -- ── Step 1: Handle active table sessions ────────────────────────────
    -- Collect active session IDs linked to the objects being deleted
    SELECT array_agg(DISTINCT tst.session_id) INTO v_session_ids
    FROM table_session_tables tst
    WHERE tst.table_id = ANY(v_object_ids)
      AND tst.is_active = true;

    IF v_session_ids IS NOT NULL THEN
      -- Disconnect orders from sessions (orders.session_id → table_sessions.id
      -- with ON DELETE SET NULL, but we close sessions instead of deleting them)
      UPDATE orders
      SET session_id = NULL
      WHERE session_id = ANY(v_session_ids);

      -- Close the sessions: mark inactive, clear order link, stamp closed_at
      UPDATE table_sessions
      SET is_active  = false,
          status     = 'closed',
          order_id   = NULL,
          closed_at  = now()
      WHERE id = ANY(v_session_ids)
        AND is_active = true;

      -- Remove the junction rows so they don't block FPO deletion
      DELETE FROM table_session_tables
      WHERE table_id = ANY(v_object_ids);
    END IF;

    -- ── Step 2: QR / online-order cleanup ───────────────────────────────
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

    -- ── Step 3: Delete floor plan objects ───────────────────────────────
    -- All dependent rows are cleaned up — safe to delete
    DELETE FROM floor_plan_objects WHERE id = ANY(v_object_ids);
  END IF;

  -- Delete the floor plan itself
  DELETE FROM floor_plans WHERE id = p_floor_plan_id;
END;
$$;

REVOKE ALL ON FUNCTION delete_floor_plan_cascade(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION delete_floor_plan_cascade(uuid) TO anon, authenticated;
