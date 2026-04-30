-- Rollback for add_order_item_v3_station_guard.sql
-- Drops the station-aware overload. Re-apply add_order_item_v3.sql to restore
-- the original 19-parameter version.

DROP FUNCTION IF EXISTS public.add_order_item_v3(uuid, uuid, integer, numeric, numeric, text, text, uuid, uuid, text, numeric, jsonb, text, integer, integer, uuid, text, uuid, uuid, uuid);
