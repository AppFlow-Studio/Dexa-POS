-- ============================================================================
-- get_pos_bootstrap_v1 — single round-trip POS boot payload
--
-- Replaces the 5 requests in hooks/pos/usePosSync.ts (get_pos_full_sync +
-- menu_item_recipes + modifier_group_item_recipes + tax_rates +
-- get_active_snoozes) with one versioned envelope.
--
-- get_pos_full_sync is intentionally left in place — this is additive so the
-- client can cut over per-release. Deprecate the old one only after cutover.
--
-- SECURITY NOTE
--   get_pos_full_sync is STABLE (not SECURITY DEFINER) and therefore relies on
--   RLS for tenant isolation. This function is SECURITY DEFINER — which BYPASSES
--   RLS — so it MUST enforce the merchant check itself. That guard is step 1
--   below and must never be removed. It also means get_menu_with_categories()
--   runs with owner privileges when called from here.
--
-- MONEY
--   price_modifier is cast to numeric(12,2) dollars. percentage is a rate, not
--   money, and is passed through unchanged to preserve existing tax semantics.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Single-signature guard
--
-- Wave 3 (recorded as schema_migrations 20260815140000) installed a TWO-argument
-- get_pos_bootstrap_v1(uuid, <version token>) on staging, and that SQL was never
-- committed to this repo. THIS FILE is the authoritative definition, and it
-- takes ONE argument.
--
-- Leaving both overloads in place makes the client's natural single-arg call
-- ambiguous — which is exactly the breakage recorded under "Two subagents
-- executed DDL on staging" in
-- docs/engineering/performance/db-perf-waves-2026-08-13.md. So drop every
-- overload that is not exactly (uuid) before defining this one.
--
-- Written as a catalog sweep rather than a literal DROP FUNCTION because the
-- Wave 3 signature is not recorded anywhere in this repo: its second argument
-- may be text or uuid, and guessing wrong would silently leave the overload in
-- place.
-- ----------------------------------------------------------------------------
DO $guard$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT p.oid::regprocedure AS sig
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND p.proname = 'get_pos_bootstrap_v1'
           -- identity args are types only, no names/defaults: '' , 'uuid',
           -- 'uuid, text', ...
           AND pg_get_function_identity_arguments(p.oid) <> 'uuid'
    LOOP
        RAISE NOTICE 'get_pos_bootstrap_v1: dropping superseded overload %', r.sig;
        EXECUTE format('DROP FUNCTION %s', r.sig);
    END LOOP;
END
$guard$;

CREATE OR REPLACE FUNCTION public.get_pos_bootstrap_v1(p_location_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_merchant_id     uuid;
    v_caller_merchant uuid;
    v_max_updated     timestamptz;
    v_row_count       bigint;
    v_version         text;
BEGIN
    ------------------------------------------------------------------
    -- 1. Authorization (mandatory — see SECURITY NOTE above)
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

    -- Mirrors the effective authorization of the path this replaces. Every RLS
    -- policy `get_pos_full_sync` leans on is `is_dexapos_admin() OR merchant_id
    -- = user_merchant_id()`, so checking only the merchant here would make this
    -- function STRICTER than the old path and break internal admin/support
    -- access. IS DISTINCT FROM so a NULL caller merchant fails closed rather
    -- than evaluating to NULL and falling through the check.
    IF NOT public.is_dexapos_admin()
       AND (
            v_caller_merchant IS NULL
            OR v_caller_merchant IS DISTINCT FROM v_merchant_id
           ) THEN
        RAISE EXCEPTION 'Not authorized for location %', p_location_id
            USING ERRCODE = '42501';
    END IF;

    ------------------------------------------------------------------
    -- 2. Version watermark
    --
    -- max(updated_at) alone cannot see DELETEs — a removed menu item would
    -- leave the watermark unchanged and the client would keep serving it from
    -- cache. Pairing it with a row count over the same set closes that hole
    -- cheaply. The value is OPAQUE to the client: it only ever tests equality,
    -- so this can later be swapped for an explicit counter (the ticket's
    -- preferred option) with no client change.
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

    v_version :=
        COALESCE(
            to_char(v_max_updated AT TIME ZONE 'UTC', 'YYYYMMDD"T"HH24MISS.US'),
            '0'
        ) || '-' || COALESCE(v_row_count, 0)::text;

    ------------------------------------------------------------------
    -- 3. Payload
    ------------------------------------------------------------------
    RETURN jsonb_build_object(
        'version',      v_version,
        'generated_at', now(),
        'location_id',  p_location_id,
        -- Kept so the payload stays a drop-in for PosSyncData consumers.
        'synced_at',    now(),

        ----------------------------------------------------------------
        -- Menus: identical selection + ordering to get_pos_full_sync, so
        -- the client-side menu tree is byte-for-byte what it is today.
        ----------------------------------------------------------------
        'menus', (
            SELECT COALESCE(jsonb_agg(
                       (public.get_menu_with_categories(m.id, p_location_id)::jsonb
                        || jsonb_build_object(
                             'display_order',
                             COALESCE(lm.display_order, m.display_order)
                           ))
                       ORDER BY COALESCE(lm.display_order, m.display_order) NULLS LAST,
                                m.name
                   ), '[]'::jsonb)
              FROM public.menus m
              LEFT JOIN public.location_menus lm
                     ON lm.menu_id = m.id
                    AND lm.location_id = p_location_id
             WHERE m.merchant_id = v_merchant_id
               AND (m.location_id IS NULL OR m.location_id = p_location_id)
               AND (
                     (m.location_id = p_location_id AND m.is_active = true)
                     OR
                     (m.location_id IS NULL AND (m.is_active = true OR lm.is_active = true))
                   )
        ),

        ----------------------------------------------------------------
        -- Modifier groups: order-entry scope (active only, location
        -- override wins). Options carry is_active/is_default/display_order
        -- so the client keeps its current sort + default pre-selection.
        ----------------------------------------------------------------
        'modifier_groups', (
            SELECT COALESCE(
                     jsonb_agg(s.grp ORDER BY s.sort_order NULLS LAST, s.sort_name),
                     '[]'::jsonb)
              FROM (
                    SELECT
                        jsonb_build_object(
                            'id',             mg.id,
                            'name',           mg.name,
                            'description',    mg.description,
                            'is_required',    mg.is_required,
                            'min_selections', mg.min_selections,
                            'max_selections', mg.max_selections,
                            'display_order',  COALESCE(o.display_order, mg.display_order),
                            'is_active',      true,
                            'location_id',    mg.location_id,
                            'modifier_group_items', COALESCE((
                                SELECT jsonb_agg(
                                           jsonb_build_object(
                                               'id',             mgi.id,
                                               'name',           mgi.name,
                                               'price_modifier', mgi.price_modifier::numeric(12,2),
                                               'is_active',      mgi.is_active,
                                               'is_default',     COALESCE(mgi.is_default, false),
                                               'display_order',  mgi.display_order
                                           )
                                           ORDER BY mgi.display_order NULLS LAST, mgi.name
                                       )
                                  FROM public.modifier_group_items mgi
                                 WHERE mgi.modifier_group_id = mg.id
                            ), '[]'::jsonb)
                        ) AS grp,
                        COALESCE(o.display_order, mg.display_order) AS sort_order,
                        mg.name AS sort_name
                      FROM public.modifier_groups mg
                      LEFT JOIN public.location_modifier_group_overrides o
                             ON o.modifier_group_id = mg.id
                            AND o.location_id = p_location_id
                     WHERE mg.merchant_id = v_merchant_id
                       AND (mg.location_id IS NULL OR mg.location_id = p_location_id)
                       AND COALESCE(o.is_active, mg.is_active, true) = true
              ) s
        ),

        ----------------------------------------------------------------
        -- Recipes. Key names + field shapes match what usePosSync already
        -- builds, so adopting this is a deletion on the client, not a
        -- remap. Note these carry a merchant predicate the current client
        -- queries lack (flagged in the 2026-08-03 Supabase audit).
        ----------------------------------------------------------------
        'menu_item_ingredients', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                       'id',                r.id,
                       'menu_item_id',      r.menu_item_id,
                       'inventory_item_id', r.inventory_item_id,
                       'quantity',          COALESCE(r.quantity_used, 0)
                   )), '[]'::jsonb)
              FROM public.menu_item_recipes r
             WHERE r.merchant_id = v_merchant_id
               AND r.inventory_item_id IS NOT NULL
        ),

        'modifier_group_item_ingredients', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                       'id',                     r.id,
                       'modifier_group_item_id', r.modifier_group_item_id,
                       'inventory_item_id',      r.inventory_item_id,
                       'quantity',               COALESCE(r.quantity_used, 0)
                   )), '[]'::jsonb)
              FROM public.modifier_group_item_recipes r
             WHERE r.merchant_id = v_merchant_id
        ),

        ----------------------------------------------------------------
        -- Tax rates: same column list the client selects today.
        ----------------------------------------------------------------
        'tax_rates', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                       'id',           t.id,
                       'location_id',  t.location_id,
                       'name',         t.name,
                       'percentage',   t.percentage,
                       'tax_category', t.tax_category,
                       'is_active',    t.is_active,
                       'created_at',   t.created_at,
                       'updated_at',   t.updated_at
                   ) ORDER BY t.name), '[]'::jsonb)
              FROM public.tax_rates t
             WHERE t.location_id = p_location_id
               AND t.is_active = true
        ),

        ----------------------------------------------------------------
        -- Snoozes: { items: [...], modifiers: [...] }, same shape the
        -- client already destructures from get_active_snoozes.
        ----------------------------------------------------------------
        'snoozes', COALESCE(
                       public.get_active_snoozes(p_location_id)::jsonb,
                       jsonb_build_object('items', '[]'::jsonb,
                                          'modifiers', '[]'::jsonb)
                   )
    );
END;
$$;

COMMENT ON FUNCTION public.get_pos_bootstrap_v1(uuid) IS
'Single round-trip POS boot payload (menus, modifier groups, recipes, tax rates, snoozes) with an opaque version watermark. SECURITY DEFINER: enforces merchant membership internally because RLS is bypassed.';

-- SECURITY DEFINER functions are executable by PUBLIC by default. Lock it down
-- to authenticated callers only; the in-function guard does the rest.
REVOKE ALL ON FUNCTION public.get_pos_bootstrap_v1(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_pos_bootstrap_v1(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_pos_bootstrap_v1(uuid) TO authenticated;

-- ============================================================================
-- Verification (run manually, do not include in the migration transaction)
-- ============================================================================
-- 0. EXACTLY ONE overload must survive — this is what keeps the client's
--    single-arg call unambiguous:
--    SELECT pg_get_function_identity_arguments(p.oid)
--      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--     WHERE n.nspname = 'public' AND p.proname = 'get_pos_bootstrap_v1';
--    -- expect: exactly one row, 'uuid'
--
-- 1. Payload sanity + size:
--    SELECT jsonb_pretty(public.get_pos_bootstrap_v1('<location-uuid>'));
--    SELECT pg_size_pretty(length(public.get_pos_bootstrap_v1('<location-uuid>')::text)::bigint);
--
-- 2. Menus must be IDENTICAL to the function this replaces:
--    SELECT public.get_pos_bootstrap_v1('<loc>')->'menus'
--           = (public.get_pos_full_sync('<loc>')::jsonb)->'menus' AS menus_match;
--    -- expect: true
--
-- 3. Watermark stability + delete sensitivity:
--    SELECT public.get_pos_bootstrap_v1('<loc>')->>'version';  -- run twice, must match
--    -- then UPDATE a menu item price, re-run: must differ
--    -- then DELETE a modifier option, re-run: must differ (this is what the
--    --   row count in the version is for)
--
-- 4. Tenant isolation — MUST raise 42501, not return data:
--    SELECT public.get_pos_bootstrap_v1('<location-uuid-from-another-merchant>');
--
-- 5. Cost at Charcoal volume:
--    EXPLAIN (ANALYZE, BUFFERS) SELECT public.get_pos_bootstrap_v1('<loc>');
-- ============================================================================
