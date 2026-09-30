-- ============================================================================
-- KDS Quick Done + website-order completion from the KDS
-- ----------------------------------------------------------------------------
-- Problem (Bread & Butter, prod Sep 28/29): a website order the kitchen had
-- finished sat in the Online Orders "Ready" lane for ~1h40m until someone
-- pressed Mark Done. bulk_update_order_item_status_v2 only ever moves an order
-- to 'ready'; nothing moved a finished website order to 'completed'.
--
-- 1. kds_displays gets two per-display settings (defaults = today's behavior):
--      show_online_orders_button  keep the online-orders edge tab on this KDS.
--                                 The client still forces it on while the
--                                 location needs manual accepts or has pending
--                                 online orders.
--      kds_flow_mode              'standard'   Cooking → Served → Done
--                                 'quick_done' Cooking → Done (item taps)
--    kds_displays.show_online_orders already exists but nothing reads it, and
--    the dashboard labels it "Show Online Orders" under the ticket-content
--    settings, so the button gets its own column rather than a reused meaning.
--
-- 2. kds_complete_items_v1: the KDS "Done" write. Wraps
--    bulk_update_order_item_status_v2(..., 'served') and then completes any
--    WEBSITE order (order_source = 'online_store') that the bump left 'ready'
--    with every kitchen line served. OrderOut orders are deliberately left at
--    'ready' (their completion is relayed to the marketplace; deferred).
--    Replay-safe: the inner idempotency key returns the cached bump, and an
--    already-completed order no longer matches status = 'ready'.
--
-- 3. get_kds_online_accept_config_v1: the two auto-accept flags the KDS needs to
--    decide whether the online-orders button may be hidden. SECURITY DEFINER
--    because orderout_restaurants is only readable by merchant admins
--    (oo_restaurants_select_own), and a KDS tablet is usually signed in as
--    ordinary staff: a plain select would read "not connected".
--
-- 4. Pin search_path on complete_online_order / mark_online_order_ready
--    (created with 'public' only).
--
-- Apply to staging (dfwqakoyittmrwbqvxgw) first; prod is promoted by hand.
-- The POS falls back to bulk_update_order_item_status_v2 while
-- kds_complete_items_v1 is missing, so client and migration can ship in
-- either order.
-- Rollback: 20260930140000_kds_quick_done_online_completion_rollback.sql
-- ============================================================================


-- 1. Per-display settings -----------------------------------------------------

ALTER TABLE public.kds_displays
  ADD COLUMN IF NOT EXISTS show_online_orders_button boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS kds_flow_mode text NOT NULL DEFAULT 'standard';

DO $$
BEGIN
  ALTER TABLE public.kds_displays
    ADD CONSTRAINT kds_displays_kds_flow_mode_check
    CHECK (kds_flow_mode IN ('standard', 'quick_done'));
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

COMMENT ON COLUMN public.kds_displays.show_online_orders_button IS
  'Show the online-orders edge tab on this KDS. The POS keeps it visible regardless while the location requires manual accepts or has pending online orders.';
COMMENT ON COLUMN public.kds_displays.kds_flow_mode IS
  'standard = Cooking -> Served -> Done. quick_done = Cooking -> Done: tapping an item marks it done (5 s undo), no Served tab.';


-- 2. kds_complete_items_v1 ------------------------------------------------------

CREATE OR REPLACE FUNCTION public.kds_complete_items_v1(
  p_order_item_ids uuid[],
  p_staff_id uuid,
  p_idempotency_key uuid,
  p_expected_sync_version integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_res jsonb;
  v_completion jsonb;
  v_done uuid[] := '{}';
  r record;
BEGIN
  -- Every KDS write carries a key so a queued/retried tap can't double-apply.
  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'p_idempotency_key is required'
      USING ERRCODE = '22023';
  END IF;

  -- IS DISTINCT FROM, not <>: a caller with no staff profile has a NULL
  -- user_merchant_id(), and `x <> NULL` would wave them through.
  IF EXISTS (
    SELECT 1
      FROM public.order_items oi
      JOIN public.orders o ON o.id = oi.order_id
     WHERE oi.id = ANY(p_order_item_ids)
       AND o.merchant_id IS DISTINCT FROM public.user_merchant_id()
  ) AND NOT public.is_dexapos_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Locks the affected orders FOR UPDATE for the rest of this transaction and
  -- moves an order to 'ready' once all its kitchen lines are ready/served.
  v_res := public.bulk_update_order_item_status_v2(
    p_order_item_ids,
    'served',
    p_staff_id,
    p_idempotency_key,
    p_expected_sync_version
  );

  FOR r IN
    SELECT o.id
      FROM public.orders o
     WHERE o.id IN (
             SELECT DISTINCT order_id
               FROM public.order_items
              WHERE id = ANY(p_order_item_ids)
           )
       AND o.order_source = 'online_store'   -- website only (OrderOut deferred)
       AND o.status = 'ready'
       -- Same line filter as the bulk v2 aggregate: an order spanning two
       -- displays completes only when the other display's lines are served too.
       AND NOT EXISTS (
             SELECT 1
               FROM public.order_items oi
              WHERE oi.order_id = o.id
                AND COALESCE(oi.is_voided, false) = false
                AND COALESCE(oi.refunded_quantity, 0) < oi.quantity
                AND oi.kitchen_status IS NOT NULL
                AND oi.kitchen_status <> 'served'
           )
     ORDER BY o.id
  LOOP
    -- Idempotent: already 'completed' returns success. Only count orders it
    -- actually reports as done.
    v_completion := public.complete_online_order(r.id);
    IF COALESCE((v_completion->>'success')::boolean, false) THEN
      v_done := v_done || r.id;
    END IF;
  END LOOP;

  RETURN v_res || jsonb_build_object('completed_order_ids', to_jsonb(v_done));
END;
$function$;

REVOKE ALL ON FUNCTION public.kds_complete_items_v1(
  uuid[], uuid, uuid, integer
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kds_complete_items_v1(
  uuid[], uuid, uuid, integer
) TO authenticated, service_role;

COMMENT ON FUNCTION public.kds_complete_items_v1(uuid[], uuid, uuid, integer) IS
  'KDS Done write: bulk_update_order_item_status_v2(served), then complete_online_order for website (online_store) orders left ready with every kitchen line served. Returns the bulk result plus completed_order_ids.';


-- 3. get_kds_online_accept_config_v1 ---------------------------------------------

CREATE OR REPLACE FUNCTION public.get_kds_online_accept_config_v1(
  p_location_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_merchant_id uuid;
BEGIN
  SELECT merchant_id INTO v_merchant_id
    FROM public.locations
   WHERE id = p_location_id;

  IF v_merchant_id IS NULL THEN
    RETURN jsonb_build_object(
      'store_auto_accept', NULL,
      'orderout_auto_accept', NULL
    );
  END IF;

  IF v_merchant_id IS DISTINCT FROM public.user_merchant_id()
     AND NOT public.is_dexapos_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- NULL = nothing that can send this location orders. bool_and so any row
  -- that needs a manual accept wins.
  RETURN jsonb_build_object(
    -- An inactive storefront takes no orders, so it needs no accept button.
    'store_auto_accept', (
      SELECT bool_and(auto_accept_orders)
        FROM public.online_store_config
       WHERE location_id = p_location_id
         AND is_active
    ),
    -- No status filter: orderout-orders-webhook matches a restaurant row
    -- regardless of status and reads auto_accept_orders as-is.
    'orderout_auto_accept', (
      SELECT bool_and(auto_accept_orders)
        FROM public.orderout_restaurants
       WHERE location_id = p_location_id
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_kds_online_accept_config_v1(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_kds_online_accept_config_v1(uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.get_kds_online_accept_config_v1(uuid) IS
  'KDS online-orders button: {store_auto_accept, orderout_auto_accept} for a location (NULL = no active storefront / not connected). Merchant-scoped.';


-- 4. Pin search_path on the online-order status RPCs ------------------------------

ALTER FUNCTION public.complete_online_order(uuid)
  SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.mark_online_order_ready(uuid)
  SET search_path TO 'public', 'pg_temp';
