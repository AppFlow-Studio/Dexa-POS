-- =====================================================================
-- Rollback: update_order_details_v1 — Wave 2.4
-- =====================================================================
-- Drops the function. Clients that were wired to use it must revert to
-- the four raw `.from('orders').update()` sites in
-- `useOrderStore.updateActiveOrderDetails` BEFORE this rollback runs in
-- prod, otherwise they'll error on the missing RPC.
-- =====================================================================

DROP FUNCTION IF EXISTS public.update_order_details_v1(
  uuid, uuid,
  boolean, uuid, text, text, text,
  boolean, text,
  boolean, text,
  boolean, text
);
