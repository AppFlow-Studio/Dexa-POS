-- ============================================================================
-- get_pos_menu_version_v1 — the cheap half of get_pos_bootstrap_v1.
--
-- WHY THIS EXISTS
-- The kiosk (and POS) must show current prices without an app restart.
-- `usePosSync` is `staleTime: Infinity`, so nothing re-fetched the menu on a
-- timer. Polling `get_pos_bootstrap_v1` on an interval would work — the client
-- already skips the rebuild when the version matches — but it pulls the ENTIRE
-- menu tree every tick just to compare one string, all day, per station.
--
-- So this returns the watermark ALONE. The client polls this (bytes), and only
-- invalidates the real bootstrap query when the token actually moves.
--
-- ----------------------------------------------------------------------------
-- LOCKSTEP REQUIREMENT — READ BEFORE EDITING EITHER FUNCTION
-- ----------------------------------------------------------------------------
-- The SELECT below is a VERBATIM copy of the "2. Version watermark" block in
-- get_pos_bootstrap_v1 (20260815170000). It has to stay that way. If a table is
-- added to one aggregate and not the other, this probe goes BLIND to that class
-- of change: the token never moves, the client never invalidates, and the menu
-- silently serves stale prices — the exact failure this is meant to fix, made
-- harder to spot because everything looks healthy.
--
-- Any change to the bootstrap watermark MUST be mirrored here in the same
-- migration.
--
-- NOT COVERED (deliberately): snoozes/86s. They are absent from the bootstrap
-- watermark too, so this matches it exactly. 86 state reaches the client via
-- useMenuSnoozeReconcile's own 60s poll, which patches snooze flags surgically
-- without a menu rebuild. Folding snoozes in here would make every 86 trigger a
-- full menu rebuild on every station — precisely what that path exists to avoid.
--
-- ----------------------------------------------------------------------------
-- SINGLE-SIGNATURE GUARD
-- ----------------------------------------------------------------------------
-- Same discipline as the bootstrap function, for the same reason recorded there:
-- an uncommitted two-argument overload once shipped to staging and made the
-- client's single-arg call ambiguous. Sweep the catalog for any signature that
-- is not exactly (uuid) before defining this one.
-- ============================================================================

DO $guard$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT p.oid::regprocedure AS sig
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND p.proname = 'get_pos_menu_version_v1'
           AND pg_get_function_identity_arguments(p.oid) <> 'uuid'
    LOOP
        RAISE NOTICE 'get_pos_menu_version_v1: dropping superseded overload %', r.sig;
        EXECUTE format('DROP FUNCTION %s', r.sig);
    END LOOP;
END
$guard$;

CREATE OR REPLACE FUNCTION public.get_pos_menu_version_v1(p_location_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_merchant_id     uuid;
    v_caller_merchant uuid;
    v_max_updated     timestamptz;
    v_row_count       bigint;
BEGIN
    ------------------------------------------------------------------
    -- 1. Authorization
    --
    -- SECURITY DEFINER bypasses RLS, so membership is enforced here. Identical
    -- to get_pos_bootstrap_v1: admins keep access, and a NULL caller merchant
    -- fails closed via IS DISTINCT FROM rather than evaluating to NULL and
    -- falling through the check.
    ------------------------------------------------------------------
    SELECT l.merchant_id
      INTO v_merchant_id
      FROM public.locations l
     WHERE l.id = p_location_id;

    IF v_merchant_id IS NULL THEN
        RAISE EXCEPTION 'Location % not found', p_location_id
            USING ERRCODE = '42704';
    END IF;

    v_caller_merchant := public.user_merchant_id();

    IF NOT public.is_dexapos_admin()
       AND (
            v_caller_merchant IS NULL
            OR v_caller_merchant IS DISTINCT FROM v_merchant_id
           ) THEN
        RAISE EXCEPTION 'Not authorized for location %', p_location_id
            USING ERRCODE = '42501';
    END IF;

    ------------------------------------------------------------------
    -- 2. Version watermark — VERBATIM copy, see LOCKSTEP note above.
    --
    -- max(updated_at) alone cannot see DELETEs: a removed menu item leaves the
    -- watermark unchanged and the client keeps serving it from cache. Pairing
    -- it with a row count over the same set closes that hole cheaply.
    ------------------------------------------------------------------
    SELECT max(w.updated_at), count(*)
      INTO v_max_updated, v_row_count
      FROM (
            SELECT updated_at FROM public.menus
             WHERE merchant_id = v_merchant_id
               AND (location_id IS NULL OR location_id = p_location_id)
            UNION ALL
            SELECT updated_at FROM public.menu_categories
             WHERE merchant_id = v_merchant_id
            UNION ALL
            SELECT updated_at FROM public.categories
             WHERE merchant_id = v_merchant_id
               AND (location_id IS NULL OR location_id = p_location_id)
            UNION ALL
            SELECT updated_at FROM public.menu_items
             WHERE merchant_id = v_merchant_id
               AND (location_id IS NULL OR location_id = p_location_id)
            UNION ALL
            SELECT updated_at FROM public.modifier_groups
             WHERE merchant_id = v_merchant_id
               AND (location_id IS NULL OR location_id = p_location_id)
            UNION ALL
            SELECT updated_at FROM public.modifier_group_items
             WHERE merchant_id = v_merchant_id
            UNION ALL
            SELECT updated_at FROM public.menu_item_recipes
             WHERE merchant_id = v_merchant_id
            UNION ALL
            SELECT updated_at FROM public.modifier_group_item_recipes
             WHERE merchant_id = v_merchant_id
            UNION ALL
            SELECT updated_at FROM public.tax_rates
             WHERE location_id = p_location_id
            -- Per-location overrides change effective price/availability
            -- without touching the parent row, so they belong in the watermark.
            UNION ALL
            SELECT updated_at FROM public.location_menus
             WHERE location_id = p_location_id
            UNION ALL
            SELECT updated_at FROM public.location_item_overrides
             WHERE location_id = p_location_id
            UNION ALL
            SELECT updated_at FROM public.location_menu_item_overrides
             WHERE location_id = p_location_id
            UNION ALL
            SELECT updated_at FROM public.location_category_overrides
             WHERE location_id = p_location_id
            UNION ALL
            SELECT updated_at FROM public.location_modifier_group_overrides
             WHERE location_id = p_location_id
      ) w;

    -- Byte-identical construction to the bootstrap envelope's 'version'.
    RETURN COALESCE(
               to_char(v_max_updated AT TIME ZONE 'UTC', 'YYYYMMDD"T"HH24MISS.US'),
               '0'
           ) || '-' || COALESCE(v_row_count, 0)::text;
END
$fn$;

COMMENT ON FUNCTION public.get_pos_menu_version_v1(uuid) IS
'Opaque menu watermark for get_pos_bootstrap_v1, without the payload. Polled by clients to detect menu/price changes cheaply; must stay in lockstep with the bootstrap version block. SECURITY DEFINER: enforces merchant membership internally because RLS is bypassed.';

GRANT EXECUTE ON FUNCTION public.get_pos_menu_version_v1(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- Verification (run manually after deploy):
--
--   -- 1. Probe must equal the bootstrap envelope's version, exactly:
--   SELECT public.get_pos_menu_version_v1('<loc>')
--        = public.get_pos_bootstrap_v1('<loc>')->>'version';   -- expect: true
--
--   -- 2. Must MOVE when an effective price changes: edit a price in
--   --    location_item_overrides, re-run (1) — expect true again, with a
--   --    different token than before.
-- ----------------------------------------------------------------------------
