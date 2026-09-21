-- ============================================================================
-- Per-station menu scope.
--
-- Menu visibility used to stop at station TYPE: location_menus.is_visible_on_pos
-- applies to every register at a location and is_visible_on_kiosk to every
-- kiosk. "Kiosk 1 shows only Sushi, Kiosk 2 shows everything" could not be
-- represented. This adds an explicit scope per station, applied ON TOP of the
-- existing channel toggle:
--
--   stations.menu_scope   'all' (default — today's behaviour) | 'selected'
--   station_menus         the chosen menus when the scope is 'selected'
--
-- A menu renders on a station iff its channel flag is on for that station's
-- type AND (scope = 'all' OR the menu is in station_menus). The channel toggle
-- always wins. 'selected' with zero rows renders NOTHING — never the full menu.
-- If a station's only selected menu is deleted, the FK cascade removes the row
-- and the station goes empty rather than suddenly showing everything.
--
-- Junction table rather than a uuid[] on stations, so a menu delete cascades
-- and can never leave a dangling id. location_id / merchant_id are denormalized
-- onto the junction so RLS does not join through stations; a BEFORE trigger
-- fills them and rejects a menu from another merchant or another location.
--
-- ----------------------------------------------------------------------------
-- HOW A SCOPE EDIT REACHES THE TABLET
-- ----------------------------------------------------------------------------
-- None of the menu tables are in the supabase_realtime publication. The tablet
-- polls a version probe every five minutes and refetches get_pos_bootstrap_v2
-- only when the token moves; PosSyncProvider then rebuilds the store only when
-- the envelope's `version` differs from the one applied. So a scope edit has to
-- move BOTH strings, and neither existing watermark can see station_menus or
-- stations.menu_scope.
--
-- This migration therefore:
--   * adds get_station_menu_scope_watermark_v1 — an md5 over every non-KDS
--     station's (id, menu_scope, ordered menu_ids) at the location. A content
--     hash, deliberately, rather than max(updated_at): stations.updated_at
--     moves on every device heartbeat and would force a full menu rebuild on
--     every station several times a minute.
--   * folds that hash into get_pos_bootstrap_v2's version and bumps the suffix
--     ('-channels-v2-item-channels' -> '-channels-v3-station-scopes-<hash>'),
--     so every existing snapshot rebuilds exactly once on its next sync;
--   * adds get_pos_menu_version_v2 = get_pos_menu_version_v1 || '-' || hash,
--     the probe the tablet switches to. v1 stays verbatim and in lockstep with
--     get_pos_bootstrap_v1, exactly as its header requires; v2 is to bootstrap
--     v2 what v1 is to bootstrap v1.
--
-- Bootstrap stays LOCATION-keyed: the offline snapshot and the cache key do not
-- change. The envelope gains one map, `station_menu_scopes`, and each tablet
-- filters by its own station id. A station missing from the map is treated as
-- 'all' by the client — that is the only fail-open path, and it exists so a
-- snapshot written before this migration keeps rendering.
--
-- ROLLBACK: DROP FUNCTION get_pos_menu_version_v2, set_station_menu_scope,
-- get_station_menu_scope_watermark_v1; restore get_pos_bootstrap_v2 from
-- 20260914121000_pos_bootstrap_item_channels_rebuild.sql (Dexa-POS repo);
-- DROP TABLE station_menus; ALTER TABLE stations DROP COLUMN menu_scope. Point
-- the tablet back at get_pos_menu_version_v1. Data loss on rollback is limited
-- to the per-station selections themselves.
--
-- Deploy to staging first, then production. Migration files only.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. stations.menu_scope
-- ----------------------------------------------------------------------------
ALTER TABLE public.stations
  ADD COLUMN IF NOT EXISTS menu_scope text NOT NULL DEFAULT 'all';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname  = 'chk_station_menu_scope'
       AND conrelid = 'public.stations'::regclass
  ) THEN
    ALTER TABLE public.stations
      ADD CONSTRAINT chk_station_menu_scope
      CHECK (menu_scope IN ('all', 'selected'));
  END IF;
END
$$;

COMMENT ON COLUMN public.stations.menu_scope IS
  'Which menus this station renders: all (every menu visible on its channel) or selected (only station_menus rows). Applied on top of location_menus channel flags. Ignored for kds.';

-- ----------------------------------------------------------------------------
-- 2. station_menus
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.station_menus (
  station_id  uuid        NOT NULL REFERENCES public.stations(id)  ON DELETE CASCADE,
  menu_id     uuid        NOT NULL REFERENCES public.menus(id)     ON DELETE CASCADE,
  location_id uuid        NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  merchant_id uuid        NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (station_id, menu_id)
);

COMMENT ON TABLE public.station_menus IS
  'Menus a station renders when stations.menu_scope = selected. location_id and merchant_id are denormalized from the station by trigger so RLS does not join.';

CREATE INDEX IF NOT EXISTS idx_station_menus_location ON public.station_menus(location_id);
CREATE INDEX IF NOT EXISTS idx_station_menus_menu     ON public.station_menus(menu_id);

-- Denormalize from the station and refuse rows that could never render: a menu
-- from another merchant, a menu owned by a different location, or a KDS
-- station (which has no menu rail). Runs BEFORE the NOT NULL check, so callers
-- may omit location_id / merchant_id.
CREATE OR REPLACE FUNCTION public.station_menus_before_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_station_location uuid;
  v_station_merchant uuid;
  v_station_type     text;
  v_menu_merchant    uuid;
  v_menu_location    uuid;
BEGIN
  SELECT s.location_id, s.merchant_id, s.station_type
    INTO v_station_location, v_station_merchant, v_station_type
    FROM public.stations s
   WHERE s.id = NEW.station_id;

  IF v_station_location IS NULL THEN
    RAISE EXCEPTION 'station_menus: station % not found', NEW.station_id
      USING ERRCODE = '23503';
  END IF;

  IF v_station_type = 'kds' THEN
    RAISE EXCEPTION 'station_menus: a KDS station does not render a menu'
      USING ERRCODE = '23514';
  END IF;

  SELECT m.merchant_id, m.location_id
    INTO v_menu_merchant, v_menu_location
    FROM public.menus m
   WHERE m.id = NEW.menu_id;

  IF v_menu_merchant IS NULL THEN
    RAISE EXCEPTION 'station_menus: menu % not found', NEW.menu_id
      USING ERRCODE = '23503';
  END IF;

  IF v_menu_merchant IS DISTINCT FROM v_station_merchant THEN
    RAISE EXCEPTION 'station_menus: menu % belongs to another merchant', NEW.menu_id
      USING ERRCODE = '23514';
  END IF;

  IF v_menu_location IS NOT NULL
     AND v_menu_location IS DISTINCT FROM v_station_location THEN
    RAISE EXCEPTION 'station_menus: menu % is owned by another location', NEW.menu_id
      USING ERRCODE = '23514';
  END IF;

  NEW.location_id := v_station_location;
  NEW.merchant_id := v_station_merchant;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_station_menus_before_write ON public.station_menus;
CREATE TRIGGER trg_station_menus_before_write
BEFORE INSERT OR UPDATE ON public.station_menus
FOR EACH ROW
EXECUTE FUNCTION public.station_menus_before_write();

-- ----------------------------------------------------------------------------
-- 3. RLS — mirrors location_menus exactly (view to read, manage to write).
--    WITH CHECK evaluates the row AFTER the BEFORE trigger, so location_id is
--    already filled when the insert policy runs.
-- ----------------------------------------------------------------------------
ALTER TABLE public.station_menus ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS station_menus_select ON public.station_menus;
CREATE POLICY station_menus_select ON public.station_menus
  FOR SELECT
  USING (public.user_has_location_permission(location_id, 'location.menu.view'));

DROP POLICY IF EXISTS station_menus_insert ON public.station_menus;
CREATE POLICY station_menus_insert ON public.station_menus
  FOR INSERT
  WITH CHECK (public.user_has_location_permission(location_id, 'location.menu.manage'));

DROP POLICY IF EXISTS station_menus_update ON public.station_menus;
CREATE POLICY station_menus_update ON public.station_menus
  FOR UPDATE
  USING (public.user_has_location_permission(location_id, 'location.menu.manage'))
  WITH CHECK (public.user_has_location_permission(location_id, 'location.menu.manage'));

DROP POLICY IF EXISTS station_menus_delete ON public.station_menus;
CREATE POLICY station_menus_delete ON public.station_menus
  FOR DELETE
  USING (public.user_has_location_permission(location_id, 'location.menu.manage'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.station_menus TO authenticated;
GRANT ALL ON public.station_menus TO service_role;

-- ----------------------------------------------------------------------------
-- 4. Scope watermark — the content hash both version strings fold in.
--
--    NOT SECURITY DEFINER and NOT executable by callers: it is only ever
--    reached from inside get_pos_bootstrap_v2 / get_pos_menu_version_v2, which
--    are SECURITY DEFINER and have already authorized the caller through the
--    v1 functions. Reached any other way, RLS on stations applies as normal.
--
--    Excludes KDS (no menu rail). Does NOT filter on is_active: the map below
--    carries deactivated stations too, so a device that somehow still runs
--    after deactivation keeps its scope instead of falling open to 'all', and
--    a station that is deactivated then reactivated comes back with the same
--    selection.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_station_menu_scope_watermark_v1(p_location_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT md5(COALESCE(
           string_agg(
             s.id::text || ':' || s.menu_scope || ':' || COALESCE((
               SELECT string_agg(sm.menu_id::text, ',' ORDER BY sm.menu_id)
                 FROM public.station_menus sm
                WHERE sm.station_id = s.id
             ), ''),
             ';' ORDER BY s.id
           ),
           ''
         ))
    FROM public.stations s
   WHERE s.location_id = p_location_id
     AND s.station_type <> 'kds';
$$;

COMMENT ON FUNCTION public.get_station_menu_scope_watermark_v1(uuid) IS
  'md5 of every non-KDS station''s (id, menu_scope, menu_ids) at a location. Folded into get_pos_bootstrap_v2.version and get_pos_menu_version_v2 so a scope edit reaches the tablet. Internal: called only from those SECURITY DEFINER functions.';

REVOKE ALL ON FUNCTION public.get_station_menu_scope_watermark_v1(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_station_menu_scope_watermark_v1(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_station_menu_scope_watermark_v1(uuid) FROM authenticated;

-- ----------------------------------------------------------------------------
-- 5. get_pos_bootstrap_v2 — verbatim from
--    20260914121000_pos_bootstrap_item_channels_rebuild.sql plus:
--      * the scope hash in `version` and a bumped suffix (one forced rebuild),
--      * the `station_menu_scopes` map.
--    Still wraps v1, so authorization is unchanged: v1 raises 42501 for a
--    caller outside the merchant and nothing here is returned.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_pos_bootstrap_v2(p_location_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT b.payload
         || jsonb_build_object(
              -- Suffix bump forces one clean rebuild of every existing snapshot;
              -- the hash makes every later scope edit move the version too.
              'version', COALESCE(b.payload->>'version', '0')
                         || '-channels-v3-station-scopes-'
                         || public.get_station_menu_scope_watermark_v1(p_location_id),
              'menus', COALESCE((
                SELECT jsonb_agg(
                         m.value
                         || jsonb_build_object(
                              'channel_visibility', jsonb_build_object(
                                'pos', COALESCE(lm.is_visible_on_pos, true),
                                'kiosk', COALESCE(lm.is_visible_on_kiosk, true),
                                'online', COALESCE(lm.is_visible_online, true)
                              )
                            )
                         ORDER BY m.ordinality
                       )
                  FROM jsonb_array_elements(
                         COALESCE(b.payload->'menus', '[]'::jsonb)
                       ) WITH ORDINALITY AS m(value, ordinality)
                  LEFT JOIN LATERAL (
                    SELECT
                      x.is_visible_on_pos,
                      x.is_visible_on_kiosk,
                      x.is_visible_online
                      FROM public.location_menus x
                     WHERE x.location_id = p_location_id
                       AND x.menu_id = (m.value->>'id')::uuid
                     ORDER BY x.updated_at DESC, x.id DESC
                     LIMIT 1
                  ) lm ON true
              ), '[]'::jsonb),
              -- station_id -> { scope, menu_ids }. Every non-KDS station at the
              -- location, active or not (see the watermark note above). The
              -- tablet reads its own id; a missing id means 'all'.
              'station_menu_scopes', COALESCE((
                SELECT jsonb_object_agg(
                         s.id,
                         jsonb_build_object(
                           'scope', s.menu_scope,
                           'menu_ids', COALESCE((
                             SELECT jsonb_agg(sm.menu_id ORDER BY sm.menu_id)
                               FROM public.station_menus sm
                              WHERE sm.station_id = s.id
                           ), '[]'::jsonb)
                         )
                       )
                  FROM public.stations s
                 WHERE s.location_id = p_location_id
                   AND s.station_type <> 'kds'
              ), '{}'::jsonb)
            ) AS payload
    FROM (
      SELECT public.get_pos_bootstrap_v1(p_location_id) AS payload
    ) b;
$$;

COMMENT ON FUNCTION public.get_pos_bootstrap_v2(uuid) IS
  'Authorized POS bootstrap enriched with per-location pos/kiosk/online menu visibility and per-station menu scopes (station_menu_scopes). Menu items carry effective_available_channels from get_menu_with_categories.';

REVOKE ALL ON FUNCTION public.get_pos_bootstrap_v2(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_pos_bootstrap_v2(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_pos_bootstrap_v2(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 6. get_pos_menu_version_v2 — the probe the tablet polls from now on.
--
--    v1 stays untouched and in lockstep with get_pos_bootstrap_v1. v2 is v1's
--    token plus the scope hash, which is exactly the set of changes that move
--    get_pos_bootstrap_v2's version. Same single-signature guard as v1, for the
--    same reason recorded there.
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
           AND p.proname = 'get_pos_menu_version_v2'
           AND pg_get_function_identity_arguments(p.oid) <> 'uuid'
    LOOP
        RAISE NOTICE 'get_pos_menu_version_v2: dropping superseded overload %', r.sig;
        EXECUTE format('DROP FUNCTION %s', r.sig);
    END LOOP;
END
$guard$;

CREATE OR REPLACE FUNCTION public.get_pos_menu_version_v2(p_location_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_base text;
BEGIN
    -- v1 owns authorization. It raises 42501 for a caller outside the
    -- merchant, and the assignment guarantees that happens before the scope
    -- hash is read.
    v_base := public.get_pos_menu_version_v1(p_location_id);
    RETURN v_base || '-' || public.get_station_menu_scope_watermark_v1(p_location_id);
END
$fn$;

COMMENT ON FUNCTION public.get_pos_menu_version_v2(uuid) IS
'get_pos_menu_version_v1 plus the per-station menu scope hash. Polled by the tablet; moves whenever get_pos_bootstrap_v2.version would. SECURITY DEFINER: authorization is delegated to v1.';

REVOKE ALL ON FUNCTION public.get_pos_menu_version_v2(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_pos_menu_version_v2(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_pos_menu_version_v2(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 7. set_station_menu_scope — the portal's single write.
--
--    Delete + insert + scope update in ONE transaction, so a tablet syncing
--    mid-save can never observe a half-written list. Identity is the JWT
--    subject (auth.jwt()->>'sub', never auth.uid()); authorization is the same
--    location.menu.manage permission the RLS policies use. SECURITY DEFINER so
--    the write does not depend on the caller's stations RLS, which is
--    merchant-wide and unrelated to menu management.
--
--    scope = 'all' clears station_menus: rows are only ever present when the
--    scope is 'selected', so the table can be read literally.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_station_menu_scope(
  p_station_id uuid,
  p_scope      text,
  p_menu_ids   uuid[] DEFAULT '{}'::uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $fn$
DECLARE
  v_actor            text := auth.jwt()->>'sub';
  v_station_location uuid;
  v_station_merchant uuid;
  v_station_type     text;
  v_menu_ids         uuid[];
  v_bad_count        integer;
  v_result_ids       jsonb;
BEGIN
  IF v_actor IS NULL OR v_actor = '' THEN
    RAISE EXCEPTION 'Not authenticated'
      USING ERRCODE = '42501';
  END IF;

  IF p_scope IS NULL OR p_scope NOT IN ('all', 'selected') THEN
    RAISE EXCEPTION 'menu_scope must be ''all'' or ''selected'''
      USING ERRCODE = '22023';
  END IF;

  SELECT s.location_id, s.merchant_id, s.station_type
    INTO v_station_location, v_station_merchant, v_station_type
    FROM public.stations s
   WHERE s.id = p_station_id
     FOR UPDATE;

  IF v_station_location IS NULL THEN
    RAISE EXCEPTION 'Station % not found', p_station_id
      USING ERRCODE = 'P0002';
  END IF;

  IF v_station_type = 'kds' THEN
    RAISE EXCEPTION 'A KDS station does not render a menu'
      USING ERRCODE = '22023';
  END IF;

  IF NOT public.user_has_location_permission(v_station_location, 'location.menu.manage') THEN
    RAISE EXCEPTION 'Not authorized to manage menus for this location'
      USING ERRCODE = '42501';
  END IF;

  -- Dedupe and drop NULLs. Ids are ignored entirely for scope = 'all'.
  v_menu_ids := CASE
    WHEN p_scope = 'selected' THEN COALESCE((
      SELECT array_agg(DISTINCT t.id)
        FROM unnest(COALESCE(p_menu_ids, '{}'::uuid[])) AS t(id)
       WHERE t.id IS NOT NULL
    ), '{}'::uuid[])
    ELSE '{}'::uuid[]
  END;

  -- Every id must be a menu this station could ever render: same merchant,
  -- and either global or owned by this location. The trigger enforces the
  -- same rule row by row; checking up front turns N constraint errors into
  -- one readable message.
  IF cardinality(v_menu_ids) > 0 THEN
    SELECT count(*)
      INTO v_bad_count
      FROM unnest(v_menu_ids) AS t(id)
      LEFT JOIN public.menus m ON m.id = t.id
     WHERE m.id IS NULL
        OR m.merchant_id IS DISTINCT FROM v_station_merchant
        OR (m.location_id IS NOT NULL AND m.location_id IS DISTINCT FROM v_station_location);

    IF v_bad_count > 0 THEN
      RAISE EXCEPTION '% menu id(s) do not belong to this location', v_bad_count
        USING ERRCODE = '22023';
    END IF;
  END IF;

  DELETE FROM public.station_menus WHERE station_id = p_station_id;

  IF cardinality(v_menu_ids) > 0 THEN
    INSERT INTO public.station_menus (station_id, menu_id, location_id, merchant_id)
    SELECT p_station_id, t.id, v_station_location, v_station_merchant
      FROM unnest(v_menu_ids) AS t(id);
  END IF;

  UPDATE public.stations
     SET menu_scope = p_scope,
         updated_at = now()
   WHERE id = p_station_id;

  SELECT COALESCE(jsonb_agg(sm.menu_id ORDER BY sm.menu_id), '[]'::jsonb)
    INTO v_result_ids
    FROM public.station_menus sm
   WHERE sm.station_id = p_station_id;

  RETURN jsonb_build_object(
    'station_id', p_station_id,
    'menu_scope', p_scope,
    'menu_ids',   v_result_ids,
    'updated_by', v_actor,
    'updated_at', now()
  );
END
$fn$;

COMMENT ON FUNCTION public.set_station_menu_scope(uuid, text, uuid[]) IS
  'Replace a station''s menu scope and selected menus atomically. Requires location.menu.manage at the station''s location. Identity via auth.jwt()->>''sub''.';

REVOKE ALL ON FUNCTION public.set_station_menu_scope(uuid, text, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_station_menu_scope(uuid, text, uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_station_menu_scope(uuid, text, uuid[]) TO authenticated;

-- ----------------------------------------------------------------------------
-- Verification (run manually after deploy, staging first):
--
--   -- 1. Every existing station reads 'all' and has no rows:
--   SELECT count(*) FILTER (WHERE menu_scope <> 'all') AS scoped,
--          (SELECT count(*) FROM public.station_menus)  AS rows
--     FROM public.stations;                                   -- expect 0, 0
--
--   -- 2. The probe and the envelope agree, exactly:
--   SELECT public.get_pos_menu_version_v2('<loc>')
--        = public.get_pos_menu_version_v1('<loc>') || '-'
--          || public.get_station_menu_scope_watermark_v1('<loc>');  -- true
--   SELECT public.get_pos_bootstrap_v2('<loc>')->>'version'
--          LIKE '%-channels-v3-station-scopes-'
--               || public.get_station_menu_scope_watermark_v1('<loc>');  -- true
--
--   -- 3. A scope edit MOVES both. As a dashboard user with manage:
--   SELECT public.set_station_menu_scope('<kiosk-1>', 'selected',
--                                        ARRAY['<sushi-menu-id>']::uuid[]);
--   -- re-run (2): both tokens differ from before.
--
--   -- 4. Per-station view:
--   SELECT s.station_name, s.station_type, s.menu_scope,
--          array_agg(m.name ORDER BY m.name) FILTER (WHERE m.id IS NOT NULL) AS menus
--     FROM public.stations s
--     LEFT JOIN public.station_menus sm ON sm.station_id = s.id
--     LEFT JOIN public.menus m ON m.id = sm.menu_id
--    WHERE s.location_id = '<loc>'
--    GROUP BY 1, 2, 3;
--
--   -- 5. Cascade: DELETE the Sushi menu on a throwaway staging merchant and
--   --    confirm SELECT count(*) FROM station_menus WHERE menu_id = ... is 0.
--
--   -- 6. RLS: as a server-role user (location.menu.view only),
--   --    INSERT INTO station_menus ... must fail with 42501; as a user from
--   --    another merchant, SELECT * FROM station_menus returns no rows.
-- ----------------------------------------------------------------------------
