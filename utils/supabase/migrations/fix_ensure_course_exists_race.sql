-- ============================================================================
-- Migration: Fix TOCTOU race in ensure_course_exists
-- ============================================================================
--
-- Problem
--   The original ensure_course_exists (types/order-coursing-migration.sql:112)
--   does a non-atomic "SELECT then INSERT":
--
--     SELECT id INTO v_course_id
--       FROM order_courses
--      WHERE order_id = p_order_id AND course_number = p_course_number;
--     IF v_course_id IS NULL THEN
--       INSERT INTO order_courses (...);
--     END IF;
--
--   When two concurrent transactions both SELECT NULL, they both attempt the
--   INSERT. The second one collides on the `unique_order_course` constraint
--   and fails with SQLSTATE 23505. This bubbles up as
--   "Failed to sync item course: duplicate key value violates unique
--   constraint \"unique_order_course\"" on the client.
--
--   Repro path from the app: coursing toggled OFF, items sent to kitchen,
--   coursing toggled back ON. useTableCoursing's hydration effect fires one
--   set_item_course RPC per item in parallel; each call invokes
--   ensure_course_exists and they race.
--
-- Fix
--   Use INSERT ... ON CONFLICT DO NOTHING, which is atomic under the unique
--   index. If another transaction has already inserted the row, our INSERT
--   is a no-op and the follow-up SELECT returns the existing id. No race.
--
-- Safety
--   - Signature and return type unchanged — no caller contract change.
--   - SECURITY DEFINER preserved (same privileges as original).
--   - No data migration needed; CREATE OR REPLACE replaces function body in
--     place. Existing order_courses rows are untouched.
--   - The unique_order_course constraint (from
--     types/order-coursing-migration.sql:53) is the conflict target.
--
-- Apply order
--   1. Staging project dfwqakoyittmrwbqvxgw → verify with the repro path.
--   2. Production project hifouuofcaytijrkbvcy.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.ensure_course_exists(
  p_order_id UUID,
  p_course_number INTEGER
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_course_id UUID;
BEGIN
  -- Atomic upsert. If a concurrent transaction already inserted the row,
  -- the unique_order_course constraint short-circuits this to a no-op.
  -- RETURNING only emits a row when INSERT actually wrote one, so we always
  -- follow up with a SELECT to cover both the "just inserted" and "already
  -- existed" paths.
  INSERT INTO public.order_courses (order_id, course_number, status)
  VALUES (p_order_id, p_course_number, 'open')
  ON CONFLICT (order_id, course_number) DO NOTHING;

  SELECT id INTO v_course_id
  FROM public.order_courses
  WHERE order_id = p_order_id
    AND course_number = p_course_number;

  RETURN v_course_id;
END;
$$;

-- Re-grant is not strictly required after CREATE OR REPLACE, but included
-- for parity with the original migration at types/order-coursing-migration.sql:757.
GRANT EXECUTE ON FUNCTION public.ensure_course_exists TO authenticated;
