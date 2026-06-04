-- Adds the table-transfer RPC used by the floor plan session store.
-- Moves an active table session to a new set of available table IDs.
-- Keep only the 3-argument signature; PostgREST cannot disambiguate
-- overloaded functions when p_reason is omitted.

DROP FUNCTION IF EXISTS public.transfer_table_session(uuid, uuid[]);

CREATE OR REPLACE FUNCTION public.transfer_table_session(
  p_session_id uuid,
  p_new_table_ids uuid[],
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_session record;
  v_table_id uuid;
  v_is_first boolean := true;
  v_position integer := 0;
  v_primary_table_name text;
BEGIN
  IF p_session_id IS NULL THEN
    RAISE EXCEPTION 'Session ID is required';
  END IF;

  IF p_new_table_ids IS NULL OR array_length(p_new_table_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'At least one target table is required';
  END IF;

  SELECT id, merchant_id, location_id, order_id, is_active
  INTO v_session
  FROM public.table_sessions
  WHERE id = p_session_id
    AND merchant_id = public.user_merchant_id()
    AND location_id = ANY(public.user_location_ids())
    AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active table session not found or access denied';
  END IF;

  IF (
    SELECT COUNT(DISTINCT fpo.id)
    FROM public.floor_plan_objects fpo
    WHERE fpo.id = ANY(p_new_table_ids)
      AND fpo.merchant_id = v_session.merchant_id
      AND fpo.location_id = v_session.location_id
      AND fpo.is_active = true
  ) <> array_length(p_new_table_ids, 1) THEN
    RAISE EXCEPTION 'One or more target tables were not found or are inactive';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.table_session_tables tst
    JOIN public.table_sessions ts ON ts.id = tst.session_id
    WHERE tst.table_id = ANY(p_new_table_ids)
      AND tst.is_active = true
      AND ts.is_active = true
      AND ts.id <> p_session_id
  ) THEN
    RAISE EXCEPTION 'Target table already has an active session';
  END IF;

  UPDATE public.table_session_tables
  SET is_active = false
  WHERE session_id = p_session_id
    AND is_active = true;

  FOREACH v_table_id IN ARRAY p_new_table_ids
  LOOP
    INSERT INTO public.table_session_tables (
      session_id,
      table_id,
      is_primary,
      seated_position,
      is_active
    )
    VALUES (
      p_session_id,
      v_table_id,
      v_is_first,
      v_position,
      true
    );

    IF v_is_first THEN
      SELECT name
      INTO v_primary_table_name
      FROM public.floor_plan_objects
      WHERE id = v_table_id;
    END IF;

    v_is_first := false;
    v_position := v_position + 1;
  END LOOP;

  IF v_session.order_id IS NOT NULL THEN
    UPDATE public.orders
    SET table_number = v_primary_table_name,
        updated_at = now()
    WHERE id = v_session.order_id;
  END IF;

  INSERT INTO public.table_session_events (
    session_id,
    event_type,
    triggered_by_staff_id,
    triggered_by_user_id,
    event_data
  )
  VALUES (
    p_session_id,
    'transferred',
    public.user_staff_profile_id(),
    public.get_my_claim('sub'),
    jsonb_build_object(
      'target_table_ids', p_new_table_ids,
      'primary_table_name', v_primary_table_name,
      'reason', p_reason
    )
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.transfer_table_session(uuid, uuid[], text) TO authenticated;

COMMENT ON FUNCTION public.transfer_table_session(uuid, uuid[], text) IS
  'Moves an active table session to one or more available tables by replacing active table_session_tables links.';
