-- Rollback for seat_guests_v4.sql
--
-- Safe at any time: seat_guests_v3 is untouched and the client falls back to
-- it whenever EXPO_PUBLIC_CLIENT_IDS is unset. Sessions and orders already
-- written with client-minted ids keep them — identity never changes.
--
-- NOTE: v4 is the only caller of create_order_v4 on the server side. Dropping
-- v4 here does NOT require dropping create_order_v4, which the client also
-- calls directly.

DROP FUNCTION IF EXISTS public.seat_guests_v4(uuid[], integer, text, text, text, uuid, uuid, boolean, uuid, text, uuid, uuid, uuid, uuid, text);
