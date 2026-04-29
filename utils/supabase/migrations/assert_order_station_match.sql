-- =====================================================================
-- Migration: assert_order_station_match — Lever 2 server-side helper
-- =====================================================================
-- Reusable guard for cart-mutation RPCs: raises a typed
-- ORDER_OWNED_BY_OTHER_STATION error when the caller's station id doesn't
-- match the order's owner. Pass NULL to bypass (backwards-compat for
-- clients that don't yet supply p_station_id).
--
-- Usage in an RPC body, immediately after the existing merchant/location
-- auth check (e.g. add_order_item_v3.sql:65-75):
--
--   PERFORM public._assert_order_station_match(p_order_id, p_station_id);
--
-- When the helper raises, PostgreSQL bubbles up an exception whose message
-- starts with 'ORDER_OWNED_BY_OTHER_STATION'. The client wrapper at
-- `services/orderService.ts` + `_isOwnershipError` in
-- `stores/useOrderStore.ts` recognizes that string and surfaces a
-- non-silent toast (see Lever 2 / PR C.7).
--
-- IMPORTANT — follow-up work:
-- This migration adds the helper but does NOT yet wire it into the
-- existing mutation RPCs. The next wave needs to add `p_station_id uuid
-- DEFAULT NULL` to each hot-path RPC and PERFORM this helper near the
-- top. Targets (with the AddOrderItemParams / AddOpenItemParams types
-- updated in lockstep on the client):
--   - add_order_item_v3
--   - add_open_item_v3
--   - add_order_item_modifier_v2
--   - manage_order_discount_v2
--   - apply_refund_to_payment_v2
--   - process_payment_v7_terminal_id  (or v8 if it exists)
--   - duplicate_order_item_v2
--   - remove_order_item_modifier_v2
--   - record_refund_items_v2
--
-- Until those are wired, the client-side _checkCartEditable gate in
-- useOrderStore.ts is the user-facing enforcement; this helper is the
-- foundation for the server-side defense-in-depth follow-up.
--
-- Rollback: assert_order_station_match_rollback.sql
-- =====================================================================

CREATE OR REPLACE FUNCTION public._assert_order_station_match(
  p_order_id uuid,
  p_station_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_owner_station_id uuid;
BEGIN
  -- Bypass: callers that don't yet pass p_station_id keep working.
  IF p_station_id IS NULL THEN
    RETURN;
  END IF;

  SELECT station_id
  INTO v_owner_station_id
  FROM public.orders
  WHERE id = p_order_id;

  -- Unowned order (station_id IS NULL) → editable by anyone.
  -- Same station → editable by us.
  -- Different station → reject with typed error.
  IF v_owner_station_id IS NOT NULL AND v_owner_station_id <> p_station_id THEN
    RAISE EXCEPTION 'ORDER_OWNED_BY_OTHER_STATION (owner=%, caller=%)',
      v_owner_station_id, p_station_id
      USING HINT = 'Call claim_order_v1 to transfer ownership before mutating.';
  END IF;
END;
$function$;

GRANT EXECUTE ON FUNCTION public._assert_order_station_match(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public._assert_order_station_match(uuid, uuid) IS
'Lever 2 — raises ORDER_OWNED_BY_OTHER_STATION when caller''s station doesn''t own the order. Pass NULL p_station_id to bypass (backwards-compat for legacy clients). Wire into hot-path mutation RPCs in a follow-up wave.';
