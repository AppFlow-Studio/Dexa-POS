ALTER FUNCTION public.debug_pin_test(text, uuid) 
  SET search_path = public, extensions, pg_temp;

ALTER FUNCTION public.handle_time_clock(text, uuid, text, text) 
  SET search_path = public, extensions, pg_temp;

ALTER FUNCTION public.handle_time_clock_v2(uuid, text, text, text, uuid) 
  SET search_path = public, extensions, pg_temp;

ALTER FUNCTION public.pos_staff_login(uuid, text) 
  SET search_path = public, extensions, pg_temp;

ALTER FUNCTION public.pos_staff_login(uuid, text, uuid, text, text, boolean, boolean) 
  SET search_path = public, extensions, pg_temp;

ALTER FUNCTION public.pos_staff_login_v2(uuid, text, uuid, text, text, boolean, boolean, text, text, text, text) 
  SET search_path = public, extensions, pg_temp;
