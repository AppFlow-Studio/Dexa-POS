-- ============================================================================
-- DEXA POS - DYNAMIC COURSING SYSTEM
-- Flexible course management: unlimited courses, fire when ready, lock on send
-- ============================================================================

-- ============================================================================
-- SCHEMA UPDATES
-- ============================================================================

-- Remove fixed total_courses from table_sessions (if exists)
ALTER TABLE public.table_sessions 
  DROP COLUMN IF EXISTS total_courses;

-- Add working_course to track which course cashier is currently adding to
-- (This syncs with your Zustand currentCourse)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'table_sessions' AND column_name = 'working_course') 
  THEN
    ALTER TABLE public.table_sessions ADD COLUMN working_course INTEGER DEFAULT 1;
  END IF;
END $$;

-- ============================================================================
-- TABLE: order_courses (Track each course's status)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.order_courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  course_number INTEGER NOT NULL,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'fired', 'in_progress', 'served', 'completed')),
  -- open: accepting items
  -- fired: sent to kitchen, locked for edits
  -- in_progress: kitchen working on it
  -- served: delivered to table
  -- completed: cleared/done
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  fired_at TIMESTAMPTZ,           -- When sent to kitchen
  fired_by UUID REFERENCES public.staff_profiles(id),
  in_progress_at TIMESTAMPTZ,     -- When kitchen started
  served_at TIMESTAMPTZ,          -- When delivered
  completed_at TIMESTAMPTZ,
  
  -- Notes
  notes TEXT,
  
  CONSTRAINT unique_order_course UNIQUE (order_id, course_number)
);

CREATE INDEX idx_order_courses_order ON public.order_courses(order_id);
CREATE INDEX idx_order_courses_status ON public.order_courses(status) WHERE status IN ('open', 'fired', 'in_progress');

-- Enable RLS
ALTER TABLE public.order_courses ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "order_courses_select" ON public.order_courses
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id
        AND o.merchant_id = user_merchant_id()
        AND o.location_id = ANY(user_location_ids())
    )
  );

CREATE POLICY "order_courses_insert" ON public.order_courses
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id
        AND o.merchant_id = user_merchant_id()
        AND o.location_id = ANY(user_location_ids())
    )
  );

CREATE POLICY "order_courses_update" ON public.order_courses
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id
        AND o.merchant_id = user_merchant_id()
        AND o.location_id = ANY(user_location_ids())
    )
  );

-- ============================================================================
-- UPDATE: order_items needs course_number column
-- ============================================================================

DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'course_number') 
  THEN
    ALTER TABLE public.order_items ADD COLUMN course_number INTEGER DEFAULT 1;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_order_items_course ON public.order_items(order_id, course_number);

-- ============================================================================
-- FUNCTION: Ensure course exists (auto-create if needed)
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
  -- Try to get existing course
  SELECT id INTO v_course_id
  FROM public.order_courses
  WHERE order_id = p_order_id AND course_number = p_course_number;
  
  -- Create if not exists
  IF v_course_id IS NULL THEN
    INSERT INTO public.order_courses (order_id, course_number, status)
    VALUES (p_order_id, p_course_number, 'open')
    RETURNING id INTO v_course_id;
  END IF;
  
  RETURN v_course_id;
END;
$$;

-- ============================================================================
-- FUNCTION: Set item course number
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_item_course(
  p_order_item_id UUID,
  p_course_number INTEGER
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order_id UUID;
  v_current_course_status TEXT;
BEGIN
  -- Get order ID and verify access
  SELECT oi.order_id INTO v_order_id
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE oi.id = p_order_item_id
    AND o.merchant_id = user_merchant_id()
    AND o.location_id = ANY(user_location_ids());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order item not found';
  END IF;

  -- Check if target course is still open
  SELECT status INTO v_current_course_status
  FROM public.order_courses
  WHERE order_id = v_order_id AND course_number = p_course_number;

  -- If course exists and is fired, can't add to it
  IF v_current_course_status IS NOT NULL AND v_current_course_status != 'open' THEN
    RAISE EXCEPTION 'Course % is already fired and cannot be modified', p_course_number;
  END IF;

  -- Ensure course exists
  PERFORM public.ensure_course_exists(v_order_id, p_course_number);

  -- Update item
  UPDATE public.order_items
  SET course_number = p_course_number, updated_at = NOW()
  WHERE id = p_order_item_id;

  RETURN json_build_object(
    'success', true,
    'order_item_id', p_order_item_id,
    'course_number', p_course_number
  );
END;
$$;

-- ============================================================================
-- FUNCTION: Fire course (send to kitchen, lock it)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fire_course(
  p_order_id UUID,
  p_course_number INTEGER,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_course_id UUID;
  v_item_count INTEGER;
  v_session_id UUID;
BEGIN
  -- Verify order access
  IF NOT EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = p_order_id
      AND o.merchant_id = user_merchant_id()
      AND o.location_id = ANY(user_location_ids())
  ) THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  -- Ensure course exists
  v_course_id := public.ensure_course_exists(p_order_id, p_course_number);

  -- Check course is open
  IF EXISTS (
    SELECT 1 FROM public.order_courses
    WHERE id = v_course_id AND status != 'open'
  ) THEN
    RAISE EXCEPTION 'Course % is already fired', p_course_number;
  END IF;

  -- Count items in this course
  SELECT COUNT(*) INTO v_item_count
  FROM public.order_items
  WHERE order_id = p_order_id 
    AND course_number = p_course_number
    AND is_voided = FALSE;

  IF v_item_count = 0 THEN
    RAISE EXCEPTION 'Course % has no items to fire', p_course_number;
  END IF;

  -- Fire the course (lock it)
  UPDATE public.order_courses
  SET 
    status = 'fired',
    fired_at = NOW(),
    fired_by = user_staff_profile_id(),
    notes = COALESCE(p_notes, notes)
  WHERE id = v_course_id;

  -- Update table session's working course to next available
  SELECT ts.id INTO v_session_id
  FROM public.table_sessions ts
  WHERE ts.order_id = p_order_id AND ts.is_active = TRUE;

  IF v_session_id IS NOT NULL THEN
    -- Set working course to course + 1 if we just fired the current working course
    UPDATE public.table_sessions
    SET 
      working_course = GREATEST(working_course, p_course_number + 1),
      current_course = p_course_number,  -- Track highest fired course
      updated_at = NOW()
    WHERE id = v_session_id;

    -- Record event
    INSERT INTO public.table_session_events (
      session_id, event_type, event_data,
      triggered_by_staff_id, triggered_by_user_id
    ) VALUES (
      v_session_id,
      CASE p_course_number
        WHEN 1 THEN 'appetizers_fired'::session_event_type
        WHEN 2 THEN 'mains_fired'::session_event_type
        WHEN 3 THEN 'desserts_fired'::session_event_type
        ELSE 'custom'::session_event_type
      END,
      jsonb_build_object('course_number', p_course_number, 'item_count', v_item_count),
      user_staff_profile_id(),
      user_id()
    );
  END IF;

  RETURN json_build_object(
    'success', true,
    'order_id', p_order_id,
    'course_number', p_course_number,
    'status', 'fired',
    'item_count', v_item_count,
    'fired_at', NOW()
  );
END;
$$;

-- ============================================================================
-- FUNCTION: Mark course served
-- ============================================================================

CREATE OR REPLACE FUNCTION public.mark_course_served(
  p_order_id UUID,
  p_course_number INTEGER
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_course_id UUID;
  v_session_id UUID;
BEGIN
  -- Get course
  SELECT id INTO v_course_id
  FROM public.order_courses
  WHERE order_id = p_order_id AND course_number = p_course_number;

  IF v_course_id IS NULL THEN
    RAISE EXCEPTION 'Course not found';
  END IF;

  -- Update to served
  UPDATE public.order_courses
  SET status = 'served', served_at = NOW()
  WHERE id = v_course_id;

  -- Record event on session
  SELECT ts.id INTO v_session_id
  FROM public.table_sessions ts
  WHERE ts.order_id = p_order_id AND ts.is_active = TRUE;

  IF v_session_id IS NOT NULL THEN
    INSERT INTO public.table_session_events (
      session_id, event_type, event_data,
      triggered_by_staff_id, triggered_by_user_id
    ) VALUES (
      v_session_id,
      CASE p_course_number
        WHEN 1 THEN 'appetizers_served'::session_event_type
        WHEN 2 THEN 'mains_served'::session_event_type
        WHEN 3 THEN 'desserts_served'::session_event_type
        ELSE 'custom'::session_event_type
      END,
      jsonb_build_object('course_number', p_course_number),
      user_staff_profile_id(),
      user_id()
    );

    -- Update food_served_at if not set
    UPDATE public.table_sessions
    SET food_served_at = COALESCE(food_served_at, NOW())
    WHERE id = v_session_id;
  END IF;

  RETURN json_build_object(
    'success', true,
    'course_number', p_course_number,
    'status', 'served'
  );
END;
$$;

-- ============================================================================
-- FUNCTION: Get all courses for an order
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_order_courses(
  p_order_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN (
    SELECT json_build_object(
      'order_id', p_order_id,
      'courses', COALESCE(
        (
          SELECT json_agg(
            json_build_object(
              'course_number', oc.course_number,
              'status', oc.status,
              'created_at', oc.created_at,
              'fired_at', oc.fired_at,
              'served_at', oc.served_at,
              'item_count', (
                SELECT COUNT(*) FROM public.order_items oi
                WHERE oi.order_id = p_order_id 
                  AND oi.course_number = oc.course_number
                  AND oi.is_voided = FALSE
              ),
              'items', (
                SELECT json_agg(
                  json_build_object(
                    'id', oi.id,
                    'item_name', oi.item_name,
                    'quantity', oi.quantity,
                    'subtotal', oi.subtotal
                  )
                )
                FROM public.order_items oi
                WHERE oi.order_id = p_order_id 
                  AND oi.course_number = oc.course_number
                  AND oi.is_voided = FALSE
              )
            ) ORDER BY oc.course_number
          )
          FROM public.order_courses oc
          WHERE oc.order_id = p_order_id
        ),
        '[]'::json
      ),
      'working_course', (
        SELECT ts.working_course 
        FROM public.table_sessions ts 
        WHERE ts.order_id = p_order_id AND ts.is_active = TRUE
      ),
      'highest_course', (
        SELECT COALESCE(MAX(course_number), 0)
        FROM public.order_items
        WHERE order_id = p_order_id AND is_voided = FALSE
      )
    )
    FROM public.orders o
    WHERE o.id = p_order_id
      AND o.merchant_id = user_merchant_id()
      AND o.location_id = ANY(user_location_ids())
  );
END;
$$;

-- ============================================================================
-- FUNCTION: Get course status (single course)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_course_status(
  p_order_id UUID,
  p_course_number INTEGER
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_build_object(
    'course_number', oc.course_number,
    'status', oc.status,
    'is_locked', oc.status != 'open',
    'fired_at', oc.fired_at,
    'served_at', oc.served_at,
    'item_count', (
      SELECT COUNT(*) FROM public.order_items oi
      WHERE oi.order_id = p_order_id 
        AND oi.course_number = p_course_number
        AND oi.is_voided = FALSE
    )
  )
  INTO v_result
  FROM public.order_courses oc
  WHERE oc.order_id = p_order_id AND oc.course_number = p_course_number;

  -- If course doesn't exist yet, return open status
  IF v_result IS NULL THEN
    v_result := json_build_object(
      'course_number', p_course_number,
      'status', 'open',
      'is_locked', false,
      'fired_at', null,
      'served_at', null,
      'item_count', (
        SELECT COUNT(*) FROM public.order_items oi
        WHERE oi.order_id = p_order_id 
          AND oi.course_number = p_course_number
          AND oi.is_voided = FALSE
      )
    );
  END IF;

  RETURN v_result;
END;
$$;

-- ============================================================================
-- FUNCTION: Set working course (sync with Zustand currentCourse)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_working_course(
  p_order_id UUID,
  p_course_number INTEGER
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_course_status TEXT;
BEGIN
  -- Ensure course exists and is open
  SELECT status INTO v_course_status
  FROM public.order_courses
  WHERE order_id = p_order_id AND course_number = p_course_number;

  IF v_course_status IS NOT NULL AND v_course_status != 'open' THEN
    RAISE EXCEPTION 'Cannot set working course to fired course %', p_course_number;
  END IF;

  -- Ensure course exists
  PERFORM public.ensure_course_exists(p_order_id, p_course_number);

  -- Update session
  UPDATE public.table_sessions
  SET working_course = p_course_number, updated_at = NOW()
  WHERE order_id = p_order_id AND is_active = TRUE;

  RETURN json_build_object(
    'success', true,
    'working_course', p_course_number
  );
END;
$$;

-- ============================================================================
-- FUNCTION: Create next course (explicit course creation)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_next_course(
  p_order_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_next_course INTEGER;
  v_course_id UUID;
BEGIN
  -- Get next course number
  SELECT COALESCE(MAX(course_number), 0) + 1 INTO v_next_course
  FROM public.order_courses
  WHERE order_id = p_order_id;

  -- Also check items in case courses aren't in order_courses yet
  SELECT GREATEST(v_next_course, COALESCE(MAX(course_number), 0) + 1) INTO v_next_course
  FROM public.order_items
  WHERE order_id = p_order_id AND is_voided = FALSE;

  -- Create the course
  INSERT INTO public.order_courses (order_id, course_number, status)
  VALUES (p_order_id, v_next_course, 'open')
  RETURNING id INTO v_course_id;

  -- Update working course
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

-- ============================================================================
-- FUNCTION: Check if item can be modified (course not fired)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.can_modify_item(
  p_order_item_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order_id UUID;
  v_course_number INTEGER;
  v_course_status TEXT;
BEGIN
  -- Get item's order and course
  SELECT order_id, course_number INTO v_order_id, v_course_number
  FROM public.order_items
  WHERE id = p_order_item_id;

  IF v_order_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Check course status
  SELECT status INTO v_course_status
  FROM public.order_courses
  WHERE order_id = v_order_id AND course_number = v_course_number;

  -- Can modify if course doesn't exist yet or is still open
  RETURN v_course_status IS NULL OR v_course_status = 'open';
END;
$$;

-- ============================================================================
-- UPDATE: add_order_item to respect course locking
-- ============================================================================

-- Drop and recreate to add course validation
CREATE OR REPLACE FUNCTION public.add_order_item_with_course(
  p_order_id UUID,
  p_item_name TEXT,
  p_unit_price NUMERIC,
  p_quantity INTEGER DEFAULT 1,
  p_course_number INTEGER DEFAULT NULL,  -- NULL = use working course
  p_menu_item_id UUID DEFAULT NULL,
  p_location_exclusive_item_id UUID DEFAULT NULL,
  p_item_description TEXT DEFAULT NULL,
  p_category_name TEXT DEFAULT NULL,
  p_cash_price NUMERIC DEFAULT NULL,
  p_use_cash_price BOOLEAN DEFAULT FALSE,
  p_selected_size_id UUID DEFAULT NULL,
  p_selected_size_name TEXT DEFAULT NULL,
  p_size_price_modifier NUMERIC DEFAULT 0,
  p_special_instructions TEXT DEFAULT NULL,
  p_modifiers JSONB DEFAULT '[]',
  p_prep_station TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order RECORD;
  v_course INTEGER;
  v_course_status TEXT;
  v_order_item_id UUID;
  v_effective_price NUMERIC;
  v_modifier_total NUMERIC := 0;
  v_subtotal NUMERIC;
  v_mod JSONB;
BEGIN
  -- Get order and validate
  SELECT o.*, ts.working_course
  INTO v_order
  FROM public.orders o
  LEFT JOIN public.table_sessions ts ON ts.order_id = o.id AND ts.is_active = TRUE
  WHERE o.id = p_order_id
    AND o.merchant_id = user_merchant_id()
    AND o.location_id = ANY(user_location_ids());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  -- Determine course number
  v_course := COALESCE(p_course_number, v_order.working_course, 1);

  -- Check if course is still open
  SELECT status INTO v_course_status
  FROM public.order_courses
  WHERE order_id = p_order_id AND course_number = v_course;

  IF v_course_status IS NOT NULL AND v_course_status != 'open' THEN
    RAISE EXCEPTION 'Cannot add items to course % - it has already been fired', v_course;
  END IF;

  -- Ensure course exists
  PERFORM public.ensure_course_exists(p_order_id, v_course);

  -- Calculate effective price
  v_effective_price := CASE 
    WHEN p_use_cash_price AND p_cash_price IS NOT NULL THEN p_cash_price
    ELSE p_unit_price
  END + COALESCE(p_size_price_modifier, 0);

  -- Calculate modifier total
  FOR v_mod IN SELECT * FROM jsonb_array_elements(p_modifiers)
  LOOP
    v_modifier_total := v_modifier_total + 
      COALESCE((v_mod->>'price_modifier')::NUMERIC, 0) * 
      COALESCE((v_mod->>'quantity')::INTEGER, 1);
  END LOOP;

  -- Calculate subtotal
  v_subtotal := (v_effective_price + v_modifier_total) * p_quantity;

  -- Insert item
  INSERT INTO public.order_items (
    order_id, menu_item_id, location_exclusive_item_id,
    item_name, item_description, category_name,
    unit_price, cash_price,
    selected_size_id, selected_size_name, size_price_modifier,
    quantity, subtotal,
    special_instructions, prep_station,
    course_number
  ) VALUES (
    p_order_id, p_menu_item_id, p_location_exclusive_item_id,
    p_item_name, p_item_description, p_category_name,
    p_unit_price, p_cash_price,
    p_selected_size_id, p_selected_size_name, p_size_price_modifier,
    p_quantity, v_subtotal,
    p_special_instructions, p_prep_station,
    v_course
  )
  RETURNING id INTO v_order_item_id;

  -- Insert modifiers
  FOR v_mod IN SELECT * FROM jsonb_array_elements(p_modifiers)
  LOOP
    INSERT INTO public.order_item_modifiers (
      order_item_id,
      modifier_group_id,
      modifier_item_id,
      modifier_group_name,
      modifier_name,
      price_modifier,
      quantity
    ) VALUES (
      v_order_item_id,
      (v_mod->>'modifier_group_id')::UUID,
      (v_mod->>'modifier_item_id')::UUID,
      v_mod->>'modifier_group_name',
      v_mod->>'modifier_name',
      COALESCE((v_mod->>'price_modifier')::NUMERIC, 0),
      COALESCE((v_mod->>'quantity')::INTEGER, 1)
    );
  END LOOP;

  RETURN json_build_object(
    'success', true,
    'order_item_id', v_order_item_id,
    'course_number', v_course,
    'subtotal', v_subtotal
  );
END;
$$;

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.ensure_course_exists TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_item_course TO authenticated;
GRANT EXECUTE ON FUNCTION public.fire_course TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_course_served TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_order_courses TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_course_status TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_working_course TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_next_course TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_modify_item TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_order_item_with_course TO authenticated;

-- ============================================================================
-- ENABLE REALTIME for courses
-- ============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.order_courses;