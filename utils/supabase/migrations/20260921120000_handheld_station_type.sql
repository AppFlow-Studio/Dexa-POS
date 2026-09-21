-- ============================================================================
-- Handheld station type (Dexa Go)
-- ============================================================================
-- Adds 'handheld' to chk_station_type AND teaches set_station_capabilities()
-- about it in the same file. The trigger's CASE had no ELSE, so shipping the
-- CHECK change alone would reject every handheld insert with "case not found".
-- These two statements must never be split into separate migrations.
--
-- Also adds a defensive ELSE so the next unknown station_type fails with a
-- readable error instead of PL/pgSQL's generic one.
--
-- Handheld capabilities:
--   can_create_orders          TRUE
--   can_process_payments       TRUE
--   can_void_orders            FALSE       -- manager PIN path (artifact S6)
--   can_apply_discounts        TRUE
--   can_update_kitchen_status  FALSE
--   view_scope                 'location'  -- needed for the Mine / All tabs
--
-- Order source: resolve_create_order_source() and enforce_order_source_channel()
-- only special-case 'self_service'; a handheld station falls through to
-- order_source = 'pos'. Deliberately unchanged — handheld orders are
-- distinguishable from register orders only by joining on station_id.
--
-- get_pos_bootstrap_v2, get_station_menu_scope_watermark_v1,
-- set_station_menu_scope and station_menus_before_write only branch on 'kds',
-- so a handheld station boots with the register payload and menu scope.
--
-- Verification queries (run on staging, output goes in the PR):
--   docs/features/handheld/README.md  (POS repo)
-- ============================================================================

ALTER TABLE public.stations DROP CONSTRAINT IF EXISTS chk_station_type;
ALTER TABLE public.stations ADD CONSTRAINT chk_station_type
  CHECK (station_type = ANY (ARRAY['register', 'checkout', 'kds', 'self_service', 'handheld']));

CREATE OR REPLACE FUNCTION public.set_station_capabilities()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  CASE NEW.station_type
    WHEN 'register' THEN
      NEW.can_create_orders := TRUE;
      NEW.can_process_payments := TRUE;
      NEW.can_void_orders := FALSE;
      NEW.can_apply_discounts := TRUE;
      NEW.can_update_kitchen_status := FALSE;
      NEW.view_scope := 'location';
    WHEN 'checkout' THEN
      NEW.can_create_orders := TRUE;
      NEW.can_process_payments := TRUE;
      NEW.can_void_orders := TRUE;
      NEW.can_apply_discounts := TRUE;
      NEW.can_update_kitchen_status := FALSE;
      NEW.view_scope := 'location';
    WHEN 'kds' THEN
      NEW.can_create_orders := FALSE;
      NEW.can_process_payments := FALSE;
      NEW.can_void_orders := FALSE;
      NEW.can_apply_discounts := FALSE;
      NEW.can_update_kitchen_status := TRUE;
      NEW.view_scope := 'location';  -- KDS sees ALL orders
    WHEN 'self_service' THEN
      NEW.can_create_orders := TRUE;
      NEW.can_process_payments := TRUE;
      NEW.can_void_orders := FALSE;
      NEW.can_apply_discounts := FALSE;
      NEW.can_update_kitchen_status := FALSE;
      NEW.view_scope := 'own';
    WHEN 'handheld' THEN
      NEW.can_create_orders := TRUE;
      NEW.can_process_payments := TRUE;
      NEW.can_void_orders := FALSE;        -- manager PIN path, artifact S6
      NEW.can_apply_discounts := TRUE;
      NEW.can_update_kitchen_status := FALSE;
      NEW.view_scope := 'location';        -- needed for the Mine / All tabs
    ELSE
      RAISE EXCEPTION 'Unknown station_type: %', NEW.station_type;
  END CASE;
  RETURN NEW;
END;
$function$;
