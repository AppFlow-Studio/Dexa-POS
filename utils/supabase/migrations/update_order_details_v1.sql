-- =====================================================================
-- Migration: update_order_details_v1 — Wave 2.4 server station guard
-- =====================================================================
-- New function. Replaces four raw `.from('orders').update()` sites in
-- `useOrderStore.updateActiveOrderDetails` (customer block, order_type,
-- delivery_address, special_instructions/notes) with a single guarded
-- RPC. Closes the cross-station race where B's broadcast hadn't landed
-- on A yet but A was mid-`.update()` — RLS doesn't check station_id, so
-- the raw updates were the last unguarded mutation surface for orders.
--
-- Per-field "update or preserve" semantics via boolean flags rather than
-- COALESCE, so callers can explicitly CLEAR a field (e.g., set notes to
-- null) without a sentinel value.
--
-- Note: `table_sessions.party_size` is intentionally NOT covered here —
-- it's a different table with its own RLS and its own ownership model
-- (table session, not order station). The existing raw update for
-- party_size in `updateActiveOrderDetails` stays put.
--
-- `voidAllPayments`'s raw `.update({ split_payment_path: null })` is also
-- not covered — once Wave 2.3.2 (`void_payment_station_guard`) lands, the
-- per-payment loop fails first on cross-station voids, so the
-- split_payment_path cleanup is unreachable for unauthorized callers.
--
-- Rollback: update_order_details_v1_rollback.sql
-- =====================================================================

CREATE OR REPLACE FUNCTION public.update_order_details_v1(
  p_order_id uuid,
  p_station_id uuid DEFAULT NULL,
  -- Customer block: applied when p_update_customer = true.
  -- Mirrors the existing .update() that sets all four fields together.
  p_update_customer boolean DEFAULT false,
  p_customer_id uuid DEFAULT NULL,
  p_customer_name text DEFAULT NULL,
  p_customer_phone text DEFAULT NULL,
  p_customer_email text DEFAULT NULL,
  -- Singleton fields: each applied when its corresponding flag is true.
  p_update_order_type boolean DEFAULT false,
  p_order_type text DEFAULT NULL,
  p_update_delivery_address boolean DEFAULT false,
  p_delivery_address text DEFAULT NULL,
  p_update_notes boolean DEFAULT false,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_order RECORD;
BEGIN
  -- ── 1. Authorization guard (merchant + location) ─────────────────────────
  -- Same pattern as Wave 1 RPCs and process_payment_v8. SELECT INTO captures
  -- the row; NOT FOUND signals access denied (RLS would 403 anyway, but
  -- this gives a clean typed-result envelope instead of an empty UPDATE).
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
    AND merchant_id = user_merchant_id()
    AND location_id = ANY(user_location_ids());

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Order not found or access denied'
    );
  END IF;

  -- ── 2. Station ownership guard ────────────────────────────────────────────
  -- Permissive on null p_station_id (back-compat) — once all clients are
  -- wired in Wave 2.4, the station id is always present and any cross-
  -- station call raises ORDER_OWNED_BY_OTHER_STATION here.
  PERFORM public._assert_order_station_match(p_order_id, p_station_id);

  -- ── 3. Apply per-block updates ────────────────────────────────────────────
  -- One UPDATE statement keeps this atomic. Each CASE branch decides whether
  -- to write the new value or preserve the existing one. Boolean flags let
  -- callers explicitly CLEAR a field (set null) — COALESCE alone would treat
  -- null as "preserve" and break the existing clear-notes flow.
  UPDATE public.orders SET
    customer_id =
      CASE WHEN p_update_customer THEN p_customer_id ELSE customer_id END,
    customer_name =
      CASE WHEN p_update_customer THEN p_customer_name ELSE customer_name END,
    customer_phone =
      CASE WHEN p_update_customer THEN p_customer_phone ELSE customer_phone END,
    customer_email =
      CASE WHEN p_update_customer THEN p_customer_email ELSE customer_email END,
    order_type =
      CASE
        WHEN p_update_order_type
          THEN p_order_type::order_type
        ELSE order_type
      END,
    delivery_address =
      CASE
        WHEN p_update_delivery_address
          THEN p_delivery_address
        ELSE delivery_address
      END,
    special_instructions =
      CASE WHEN p_update_notes THEN p_notes ELSE special_instructions END,
    updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'fields_updated', jsonb_build_object(
      'customer', p_update_customer,
      'order_type', p_update_order_type,
      'delivery_address', p_update_delivery_address,
      'notes', p_update_notes
    )
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.update_order_details_v1(
  uuid, uuid,
  boolean, uuid, text, text, text,
  boolean, text,
  boolean, text,
  boolean, text
) TO authenticated;
