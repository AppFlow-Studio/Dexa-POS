-- Rollback for assert_order_station_match.sql
DROP FUNCTION IF EXISTS public._assert_order_station_match(uuid, uuid);
