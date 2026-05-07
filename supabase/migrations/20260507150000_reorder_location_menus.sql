-- Reorder menu display order for a specific location.
-- This runs as SECURITY DEFINER so the app can persist per-location menu order
-- without writing directly to location_menus under RLS.

CREATE OR REPLACE FUNCTION public.reorder_location_menus(
  p_location_id UUID,
  p_menu_orders JSON
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_order JSONB;
  v_menu_id UUID;
  v_display_order INTEGER;
BEGIN
  IF p_location_id IS NULL THEN
    RAISE EXCEPTION 'location_id is required';
  END IF;

  IF p_menu_orders IS NULL THEN
    RAISE EXCEPTION 'menu_orders is required';
  END IF;

  FOR v_order IN SELECT * FROM jsonb_array_elements(p_menu_orders::jsonb)
  LOOP
    v_menu_id := (v_order ->> 'menu_id')::UUID;
    v_display_order := COALESCE((v_order ->> 'display_order')::INTEGER, 0);

    IF v_menu_id IS NULL THEN
      RAISE EXCEPTION 'menu_id is required for every menu order row';
    END IF;

    INSERT INTO public.location_menus (
      location_id,
      menu_id,
      display_order
    )
    VALUES (
      p_location_id,
      v_menu_id,
      v_display_order
    )
    ON CONFLICT (location_id, menu_id)
    DO UPDATE SET
      display_order = EXCLUDED.display_order,
      updated_at = NOW();
  END LOOP;

  RETURN json_build_object('success', true);
END;
$$;
