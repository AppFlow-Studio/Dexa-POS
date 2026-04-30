-- Rollback for manage_order_discount_v2_station_guard.sql
DROP FUNCTION IF EXISTS public.manage_order_discount_v2(text, uuid, uuid, uuid, text, text, numeric, text, text, uuid[], uuid, uuid, text, uuid, uuid);
