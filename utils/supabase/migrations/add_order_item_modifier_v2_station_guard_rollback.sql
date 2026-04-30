-- Rollback for add_order_item_modifier_v2_station_guard.sql
DROP FUNCTION IF EXISTS public.add_order_item_modifier_v2(uuid, uuid, uuid, text, text, numeric, integer, uuid, uuid);
