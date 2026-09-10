-- =====================================================================
-- add_order_item_v4 — RECOVERED FROM THE LIVE DATABASE, not authored here.
-- =====================================================================
-- Dumped from STAGING (dfwqakoyittmrwbqvxgw) on 2026-09-10 via
-- pg_get_functiondef (the query in add_order_item_v5_RUNBOOK.md §Step 1) and
-- committed verbatim. v4 never had an in-repo migration — this file closes
-- that gap so a hot-path RPC is no longer un-versioned.
--
-- WHAT IT ACTUALLY IS: v4 is a thin wrapper, NOT a fork of the v3 body. It
-- stamps the broadcast origin, then delegates to the 20-parameter
-- add_order_item_v3 (the station-guard overload). This is why add_order_item_v5
-- was built by INLINING the v3 body plus set_broadcast_origin rather than by
-- editing v4 — v5 has to reach into the INSERT to place a client-minted id,
-- which a pure delegation cannot do.
--
-- ⚠️ DRIFT NOTE: the 20-param add_order_item_v3 that v4 delegates to has, on the
-- live DB, the INVERSE cash fallback `ROUND(p_unit_price / (1 + rate), 2)`
-- (from 20260706130000_open_item_dual_pricing_inverse.sql). The in-repo
-- add_order_item_v3_station_guard.sql still carries the OLD discount formula
-- `p_unit_price * (1 - rate)` and is therefore stale. add_order_item_v5.sql
-- reproduces the LIVE (inverse) formula, not the stale in-repo one.
--
-- set_broadcast_origin(NULL) is a no-op (it early-returns on NULL), so the
-- unconditional call below is equivalent to a NULL-guarded one.
--
-- Do not "improve" this file — it documents deployed reality. Change v5 instead.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.add_order_item_v4(
  p_order_id uuid,
  p_menu_item_id uuid DEFAULT NULL::uuid,
  p_quantity integer DEFAULT 1,
  p_unit_price numeric DEFAULT 0,
  p_cash_unit_price numeric DEFAULT NULL::numeric,
  p_item_name text DEFAULT NULL::text,
  p_category_name text DEFAULT NULL::text,
  p_location_exclusive_item_id uuid DEFAULT NULL::uuid,
  p_selected_size_id uuid DEFAULT NULL::uuid,
  p_selected_size_name text DEFAULT NULL::text,
  p_size_price_modifier numeric DEFAULT 0,
  p_modifiers jsonb DEFAULT NULL::jsonb,
  p_special_instructions text DEFAULT NULL::text,
  p_course_number integer DEFAULT 1,
  p_seat_number integer DEFAULT NULL::integer,
  p_menu_id uuid DEFAULT NULL::uuid,
  p_menu_name text DEFAULT NULL::text,
  p_category_id uuid DEFAULT NULL::uuid,
  p_idempotency_key uuid DEFAULT NULL::uuid,
  p_station_id uuid DEFAULT NULL::uuid,
  p_origin_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM public.set_broadcast_origin(p_origin_id);

  RETURN public.add_order_item_v3(
    p_order_id                   => p_order_id,
    p_menu_item_id               => p_menu_item_id,
    p_quantity                   => p_quantity,
    p_unit_price                 => p_unit_price,
    p_cash_unit_price            => p_cash_unit_price,
    p_item_name                  => p_item_name,
    p_category_name              => p_category_name,
    p_location_exclusive_item_id => p_location_exclusive_item_id,
    p_selected_size_id           => p_selected_size_id,
    p_selected_size_name         => p_selected_size_name,
    p_size_price_modifier        => p_size_price_modifier,
    p_modifiers                  => p_modifiers,
    p_special_instructions       => p_special_instructions,
    p_course_number              => p_course_number,
    p_seat_number                => p_seat_number,
    p_menu_id                    => p_menu_id,
    p_menu_name                  => p_menu_name,
    p_category_id                => p_category_id,
    p_idempotency_key            => p_idempotency_key,
    p_station_id                 => p_station_id
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.add_order_item_v4(uuid, uuid, integer, numeric, numeric, text, text, uuid, uuid, text, numeric, jsonb, text, integer, integer, uuid, text, uuid, uuid, uuid, uuid) TO authenticated;
