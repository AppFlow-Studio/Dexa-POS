-- Rollback for add_order_item_v5.sql
--
-- Safe at any time: add_order_item_v4 is untouched and the client falls back to
-- it whenever EXPO_PUBLIC_CLIENT_IDS is unset. Items already written with
-- client-minted ids keep those ids — identity never changes.

DROP FUNCTION IF EXISTS public.add_order_item_v5(uuid, uuid, integer, numeric, numeric, text, text, uuid, uuid, text, numeric, jsonb, text, integer, integer, uuid, text, uuid, uuid, uuid, uuid, uuid);
