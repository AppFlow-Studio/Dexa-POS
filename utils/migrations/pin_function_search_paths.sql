-- migration: YYYYMMDDHHMMSS_pin_function_search_paths.sql
DO $$
DECLARE
  r record;
  stmt text;
BEGIN
  FOR r IN
    SELECT
      n.nspname AS schema_name,
      p.proname AS func_name,
      pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true  -- SECURITY DEFINER only
  LOOP
    stmt := format(
      'ALTER FUNCTION %I.%I(%s) SET search_path = public, extensions, pg_temp',
      r.schema_name, r.func_name, r.args
    );
    RAISE NOTICE 'Applying: %', stmt;
    EXECUTE stmt;
  END LOOP;
END $$;

ALTER FUNCTION public.current_user_id() STABLE;
ALTER FUNCTION public.check_merchant_access(uuid, text) STABLE;
