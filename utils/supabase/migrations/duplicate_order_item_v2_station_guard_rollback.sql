-- Rollback for duplicate_order_item_v2_station_guard.sql
DROP FUNCTION IF EXISTS public.duplicate_order_item_v2(uuid, integer, uuid, uuid);
