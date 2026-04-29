-- Rollback for remove_order_item_modifier_v2_station_guard.sql
DROP FUNCTION IF EXISTS public.remove_order_item_modifier_v2(uuid, uuid, uuid);
