-- Rollback for manage_order_discount_v3_sc_recompute.sql
-- Drops the v3 function. Client wrapper falls back to v2 automatically
-- via rpcWithIdempotency(client, "manage_order_discount", "manage_order_discount_v2", ...).

DROP FUNCTION IF EXISTS public.manage_order_discount_v3(
  text, uuid, uuid, uuid, text, text, numeric, text, text, uuid[], uuid, uuid, text, uuid
);
