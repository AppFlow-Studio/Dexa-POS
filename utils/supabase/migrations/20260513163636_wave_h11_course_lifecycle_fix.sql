-- wave_h11_course_lifecycle_fix
--
-- Fixes escalating course numbers caused by orphaned `order_courses` rows.
--
-- 1. New RPC `public.remove_course` so the client can actually delete an empty
--    course server-side (previously the client only mutated local state and
--    the RPC call returned PGRST202).
-- 2. Rewrites `public.create_next_course` to reuse the lowest empty open
--    course and to compute "next" off (fired/in_progress courses) ∪ (courses
--    with non-voided items) instead of raw MAX over all `order_courses` rows.

-- ============================================================================
-- FUNCTION: remove_course
-- ============================================================================

CREATE OR REPLACE FUNCTION public.remove_course(
  p_order_id UUID,
  p_course_number INTEGER
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_course_id UUID;
  v_status TEXT;
  v_item_count INTEGER;
  v_max_fired INTEGER;
  v_next_working INTEGER;
BEGIN
  -- Course 1 is the implicit default; never deletable.
  IF p_course_number <= 1 THEN
    RETURN json_build_object(
      'success', false,
      'reason', 'cannot_remove_default_course'
    );
  END IF;

  SELECT id, status
  INTO v_course_id, v_status
  FROM public.order_courses
  WHERE order_id = p_order_id AND course_number = p_course_number;

  IF v_course_id IS NULL THEN
    -- Idempotent: already gone.
    RETURN json_build_object('success', true, 'reason', 'already_removed');
  END IF;

  IF v_status <> 'open' THEN
    RETURN json_build_object(
      'success', false,
      'reason', 'course_already_fired',
      'status', v_status
    );
  END IF;

  -- Authoritative emptiness check.
  SELECT COUNT(*) INTO v_item_count
  FROM public.order_items
  WHERE order_id = p_order_id
    AND course_number = p_course_number
    AND is_voided = FALSE;

  IF v_item_count > 0 THEN
    RETURN json_build_object(
      'success', false,
      'reason', 'course_has_items',
      'item_count', v_item_count
    );
  END IF;

  DELETE FROM public.order_courses WHERE id = v_course_id;

  -- If a session was pointed at this course, recompute working_course.
  -- Prefer the highest open course strictly above the highest fired course;
  -- otherwise one above the highest fired course; otherwise 1.
  SELECT COALESCE(MAX(course_number), 0) INTO v_max_fired
  FROM public.order_courses
  WHERE order_id = p_order_id AND status <> 'open';

  SELECT MAX(course_number) INTO v_next_working
  FROM public.order_courses
  WHERE order_id = p_order_id
    AND status = 'open'
    AND course_number > v_max_fired;

  IF v_next_working IS NULL THEN
    v_next_working := GREATEST(v_max_fired + 1, 1);
  END IF;

  UPDATE public.table_sessions
  SET working_course = v_next_working, updated_at = NOW()
  WHERE order_id = p_order_id
    AND is_active = TRUE
    AND working_course = p_course_number;

  RETURN json_build_object(
    'success', true,
    'removed_course_number', p_course_number,
    'next_working_course', v_next_working
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_course(UUID, INTEGER) TO authenticated;

-- ============================================================================
-- FUNCTION: create_next_course  (rewrite)
-- ============================================================================
--
-- Old behaviour took `MAX(course_number)` over every row in `order_courses`,
-- so empty open rows from previous "add → remove" cycles inflated the counter
-- indefinitely. New behaviour:
--   (a) If an empty open course already exists, reuse the lowest-numbered one.
--   (b) Otherwise compute next from (fired/in_progress courses) ∪ (courses
--       referenced by non-voided items), ignoring empty open rows entirely.

CREATE OR REPLACE FUNCTION public.create_next_course(
  p_order_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_next_course INTEGER;
  v_course_id UUID;
BEGIN
  -- (a) Prefer reusing the lowest empty open course.
  SELECT oc.id, oc.course_number
  INTO v_course_id, v_next_course
  FROM public.order_courses oc
  WHERE oc.order_id = p_order_id
    AND oc.status = 'open'
    AND NOT EXISTS (
      SELECT 1 FROM public.order_items oi
      WHERE oi.order_id = p_order_id
        AND oi.course_number = oc.course_number
        AND oi.is_voided = FALSE
    )
  ORDER BY oc.course_number ASC
  LIMIT 1;

  IF v_course_id IS NULL THEN
    -- (b) Compute next from non-empty/non-open courses + items.
    SELECT COALESCE(MAX(c), 0) + 1 INTO v_next_course
    FROM (
      SELECT course_number AS c
      FROM public.order_courses
      WHERE order_id = p_order_id AND status <> 'open'
      UNION ALL
      SELECT course_number
      FROM public.order_items
      WHERE order_id = p_order_id AND is_voided = FALSE
    ) s;

    INSERT INTO public.order_courses (order_id, course_number, status)
    VALUES (p_order_id, v_next_course, 'open')
    RETURNING id INTO v_course_id;
  END IF;

  UPDATE public.table_sessions
  SET working_course = v_next_course, updated_at = NOW()
  WHERE order_id = p_order_id AND is_active = TRUE;

  RETURN json_build_object(
    'success', true,
    'course_number', v_next_course,
    'course_id', v_course_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_next_course(UUID) TO authenticated;
