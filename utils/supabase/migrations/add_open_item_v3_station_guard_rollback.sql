-- Rollback for add_open_item_v3_station_guard.sql
DROP FUNCTION IF EXISTS public.add_open_item_v3(uuid, text, numeric, integer, text, boolean, integer, uuid, uuid);
