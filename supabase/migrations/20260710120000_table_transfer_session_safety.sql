-- Harden POS table transfer / merge RPCs used by the tablet floor plan.
-- Fixes QA edge cases where transfer_table_session(uuid, uuid[], text) could
-- delete all table links before validating replacement targets.

CREATE OR REPLACE FUNCTION public.transfer_table_session(
  p_session_id uuid,
  p_new_table_ids uuid[],
  p_reason text DEFAULT NULL::text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_session record;
  v_old_table_ids uuid[];
  v_table_id uuid;
  v_position integer := 0;
  v_primary_table_name text;
  v_target_count integer;
  v_distinct_target_count integer;
  v_existing_link_id uuid;
BEGIN
  IF p_session_id IS NULL THEN
    RAISE EXCEPTION 'Session ID is required';
  END IF;

  IF p_new_table_ids IS NULL OR array_length(p_new_table_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'At least one target table is required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(p_new_table_ids) AS target(table_id)
    WHERE target.table_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Target table IDs cannot contain null values';
  END IF;

  SELECT COUNT(*), COUNT(DISTINCT target.table_id)
    INTO v_target_count, v_distinct_target_count
  FROM unnest(p_new_table_ids) AS target(table_id);

  IF v_target_count <> v_distinct_target_count THEN
    RAISE EXCEPTION 'Duplicate target tables are not allowed';
  END IF;

  SELECT id, merchant_id, location_id, order_id, is_active
    INTO v_session
  FROM public.table_sessions
  WHERE id = p_session_id
    AND merchant_id = public.user_merchant_id()
    AND location_id = ANY(public.user_location_ids())
    AND is_active = true
  FOR UPDATE;

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
  ) <> v_target_count THEN
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

  SELECT COALESCE(ARRAY_AGG(tst.table_id ORDER BY tst.seated_position), ARRAY[]::uuid[])
    INTO v_old_table_ids
  FROM public.table_session_tables tst
  WHERE tst.session_id = p_session_id
    AND tst.is_active = true;

  UPDATE public.table_session_tables
  SET is_active = false,
      is_primary = false
  WHERE session_id = p_session_id
    AND is_active = true;

  FOREACH v_table_id IN ARRAY p_new_table_ids
  LOOP
    SELECT id
      INTO v_existing_link_id
    FROM public.table_session_tables
    WHERE session_id = p_session_id
      AND table_id = v_table_id
    ORDER BY seated_position
    LIMIT 1;

    IF v_existing_link_id IS NOT NULL THEN
      UPDATE public.table_session_tables
      SET is_active = true,
          is_primary = (v_position = 0),
          seated_position = v_position
      WHERE id = v_existing_link_id;
    ELSE
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
        (v_position = 0),
        v_position,
        true
      )
      RETURNING id INTO v_existing_link_id;
    END IF;

    UPDATE public.table_session_tables
    SET is_active = false,
        is_primary = false
    WHERE session_id = p_session_id
      AND table_id = v_table_id
      AND id <> COALESCE(v_existing_link_id, '00000000-0000-0000-0000-000000000000'::uuid);

    IF v_position = 0 THEN
      SELECT name
        INTO v_primary_table_name
      FROM public.floor_plan_objects
      WHERE id = v_table_id;
    END IF;

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
    notes,
    event_data,
    triggered_by_staff_id,
    triggered_by_user_id
  )
  VALUES (
    p_session_id,
    'custom',
    p_reason,
    jsonb_build_object(
      'action', 'table_transfer',
      'from_tables', v_old_table_ids,
      'to_tables', p_new_table_ids
    ),
    public.user_staff_profile_id(),
    public.get_my_claim('sub')
  );

  RETURN json_build_object(
    'success', true,
    'session_id', p_session_id,
    'from_table_ids', v_old_table_ids,
    'to_table_ids', p_new_table_ids
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.transfer_table_session(
  p_session_id uuid,
  p_new_table_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM public.transfer_table_session(p_session_id, p_new_table_ids, NULL::text);
END;
$function$;

CREATE OR REPLACE FUNCTION public.merge_table_to_session(
  p_session_id uuid,
  p_table_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_session record;
  v_position integer;
  v_existing_link_id uuid;
BEGIN
  IF p_session_id IS NULL THEN
    RAISE EXCEPTION 'Session ID is required';
  END IF;

  IF p_table_id IS NULL THEN
    RAISE EXCEPTION 'Table ID is required';
  END IF;

  SELECT id, merchant_id, location_id
    INTO v_session
  FROM public.table_sessions
  WHERE id = p_session_id
    AND is_active = true
    AND merchant_id = public.user_merchant_id()
    AND location_id = ANY(public.user_location_ids())
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.floor_plan_objects fpo
    WHERE fpo.id = p_table_id
      AND fpo.merchant_id = v_session.merchant_id
      AND fpo.location_id = v_session.location_id
      AND fpo.is_active = true
  ) THEN
    RAISE EXCEPTION 'Target table was not found or is inactive';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.table_session_tables tst
    JOIN public.table_sessions ts ON ts.id = tst.session_id
    WHERE tst.table_id = p_table_id
      AND tst.is_active = true
      AND ts.is_active = true
  ) THEN
    RAISE EXCEPTION 'Table is already occupied';
  END IF;

  SELECT COALESCE(MAX(seated_position), -1) + 1
    INTO v_position
  FROM public.table_session_tables
  WHERE session_id = p_session_id
    AND is_active = true;

  SELECT id
    INTO v_existing_link_id
  FROM public.table_session_tables
  WHERE session_id = p_session_id
    AND table_id = p_table_id
  ORDER BY seated_position
  LIMIT 1;

  IF v_existing_link_id IS NOT NULL THEN
    UPDATE public.table_session_tables
    SET is_active = true,
        is_primary = false,
        seated_position = v_position
    WHERE id = v_existing_link_id;
  ELSE
    INSERT INTO public.table_session_tables (
      session_id,
      table_id,
      is_primary,
      seated_position,
      is_active
    )
      VALUES (
        p_session_id,
        p_table_id,
        false,
        v_position,
        true
    )
    RETURNING id INTO v_existing_link_id;
  END IF;

  UPDATE public.table_session_tables
  SET is_active = false,
      is_primary = false
  WHERE session_id = p_session_id
    AND table_id = p_table_id
    AND id <> COALESCE(v_existing_link_id, '00000000-0000-0000-0000-000000000000'::uuid);

  RETURN json_build_object(
    'success', true,
    'session_id', p_session_id,
    'merged_table_id', p_table_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.unmerge_table_from_session(
  p_session_id uuid,
  p_table_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_session record;
  v_active_count integer;
  v_removed_was_primary boolean;
  v_new_primary_table_id uuid;
  v_new_primary_table_name text;
BEGIN
  IF p_session_id IS NULL THEN
    RAISE EXCEPTION 'Session ID is required';
  END IF;

  IF p_table_id IS NULL THEN
    RAISE EXCEPTION 'Table ID is required';
  END IF;

  SELECT id, merchant_id, location_id, order_id
    INTO v_session
  FROM public.table_sessions
  WHERE id = p_session_id
    AND is_active = true
    AND merchant_id = public.user_merchant_id()
    AND location_id = ANY(public.user_location_ids())
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found';
  END IF;

  SELECT COUNT(*)
    INTO v_active_count
  FROM public.table_session_tables
  WHERE session_id = p_session_id
    AND is_active = true;

  IF v_active_count <= 1 THEN
    RAISE EXCEPTION 'Cannot unmerge the only table in a session';
  END IF;

  SELECT is_primary
    INTO v_removed_was_primary
  FROM public.table_session_tables
  WHERE session_id = p_session_id
    AND table_id = p_table_id
    AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Table is not part of this active session';
  END IF;

  UPDATE public.table_session_tables
  SET is_active = false,
      is_primary = false
  WHERE session_id = p_session_id
    AND table_id = p_table_id
    AND is_active = true;

  IF v_removed_was_primary OR NOT EXISTS (
    SELECT 1
    FROM public.table_session_tables
    WHERE session_id = p_session_id
      AND is_active = true
      AND is_primary = true
  ) THEN
    UPDATE public.table_session_tables
    SET is_primary = false
    WHERE session_id = p_session_id
      AND is_active = true;

    WITH new_primary AS (
      SELECT id, table_id
      FROM public.table_session_tables
      WHERE session_id = p_session_id
        AND is_active = true
      ORDER BY seated_position
      LIMIT 1
    ),
    updated AS (
      UPDATE public.table_session_tables t
      SET is_primary = true
      FROM new_primary np
      WHERE t.id = np.id
      RETURNING np.table_id
    )
    SELECT updated.table_id
      INTO v_new_primary_table_id
    FROM updated;
  END IF;

  IF v_new_primary_table_id IS NULL THEN
    SELECT table_id
      INTO v_new_primary_table_id
    FROM public.table_session_tables
    WHERE session_id = p_session_id
      AND is_active = true
      AND is_primary = true
    ORDER BY seated_position
    LIMIT 1;
  END IF;

  IF v_session.order_id IS NOT NULL AND v_new_primary_table_id IS NOT NULL THEN
    SELECT name
      INTO v_new_primary_table_name
    FROM public.floor_plan_objects
    WHERE id = v_new_primary_table_id;

    UPDATE public.orders
    SET table_number = v_new_primary_table_name,
        updated_at = now()
    WHERE id = v_session.order_id;
  END IF;

  RETURN json_build_object(
    'success', true,
    'session_id', p_session_id,
    'unmerged_table_id', p_table_id
  );
END;
$function$;
