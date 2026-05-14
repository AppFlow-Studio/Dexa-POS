-- wave_h12_create_next_course_always_new
--
-- Refines wave_h11. The previous version reused the lowest empty open course,
-- so repeated taps of "New Course" were silently idempotent — the user got a
-- toast but no new header. Behaviour now: always allocate a fresh header at
-- max(course_number) + 1. The remove_course RPC (from wave_h11) actually
-- deletes rows server-side, so the max can't escalate indefinitely.

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
  SELECT COALESCE(MAX(course_number), 0) + 1 INTO v_next_course
  FROM public.order_courses
  WHERE order_id = p_order_id;

  SELECT GREATEST(v_next_course, COALESCE(MAX(course_number), 0) + 1)
  INTO v_next_course
  FROM public.order_items
  WHERE order_id = p_order_id AND is_voided = FALSE;

  INSERT INTO public.order_courses (order_id, course_number, status)
  VALUES (p_order_id, v_next_course, 'open')
  RETURNING id INTO v_course_id;

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
