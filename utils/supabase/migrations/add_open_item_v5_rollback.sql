-- Rollback for add_open_item_v5.sql
--
-- Safe at any time: add_open_item_v4 (+ v3/v2) is untouched and the client falls
-- back to it whenever EXPO_PUBLIC_CLIENT_IDS is unset. Open items already written
-- with client-minted ids keep those ids — identity never changes.

DROP FUNCTION IF EXISTS public.add_open_item_v5(uuid, text, numeric, integer, text, boolean, integer, uuid, uuid, boolean, uuid, uuid);
