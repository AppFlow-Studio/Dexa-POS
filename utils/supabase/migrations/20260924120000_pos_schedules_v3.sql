-- ============================================================================
-- Menu + category schedules on the POS / kiosk — get_pos_bootstrap_v3.
--
-- Schedules assigned in Dexa Admin were meant to hide menus and categories
-- outside their windows on the POS order screen and the kiosk. Neither level
-- reached the tablet:
--
--   * Menu schedules: get_menu_with_categories stopped emitting
--     schedule.is_active in 20260413000000 and the client drops any schedule
--     without it, so every menu read as "always available". It also ignores
--     menu_schedules.location_id, schedules.location_id,
--     location_schedule_overrides and slot is_active.
--   * Category schedules: never emitted at all.
--   * Neither watermark covers a schedule table, so an edit never moved the
--     version and never reached a running station.
--
-- WHY v3 AND NOT AN IN-PLACE v2 EDIT
-- Shipped builds call v2 and remap day_of_week as if 0=Monday. The website
-- writes 0=Sunday (ScheduleCard DAYS_OF_WEEK, `slot.day_of_week === getDay()`).
-- Emitting is_active from v2 would make every old build start enforcing menu
-- schedules a day off. v2 stays byte-for-byte as it is; the new client calls
-- v3 and maps day_of_week 1:1 onto Date#getDay().
--
-- This migration:
--   * adds get_pos_schedule_map_v1 — the ONE place that selects schedules for a
--     location: menu schedules keyed by menu id, category schedules keyed by
--     category id (and by menu:category for the rare location_menus-scoped
--     row). Internal: not SECURITY DEFINER, not executable by callers.
--   * adds get_pos_menu_version_v3 = get_pos_menu_version_v2 || '-sched-' ||
--     md5(map). A CONTENT hash on purpose: menu_schedules / category_schedules
--     have no updated_at, and the dashboard deletes + re-inserts every slot on
--     each save. Slot ids are left out of the map so a no-op save does not
--     force a rebuild on every station.
--   * adds get_pos_bootstrap_v3 = get_pos_bootstrap_v2 with menus[].schedules
--     rebuilt from the map, menus[].categories[].schedules added, and
--     `version` := get_pos_menu_version_v3 — equal to the probe BY
--     CONSTRUCTION, so a manual "check for menu changes" compares like with
--     like.
--   * backfills category_schedules.merchant_id. The dashboard assigned
--     category schedules without it; RLS reads key on it, so such rows were
--     invisible in the dashboard while still being real assignments.
--
-- Entry shape (menus[].schedules[] and menus[].categories[].schedules[]):
--   { id, schedule: { id, name, description, is_active,
--                     time_slots: [{ day_of_week, start_time, end_time,
--                                    is_active }] } }
--   day_of_week 0=Sunday..6=Saturday. end_time > start_time (DB check);
--   overnight windows arrive as two slots split at midnight.
--   is_active = COALESCE(location_schedule_overrides.is_active,
--                        schedules.is_active) for this location.
--
-- Shared migration: owned by the POS repository. The identical copy in
-- DexaPOS-Website/supabase/migrations is synchronization-only.
--
-- ROLLBACK: DROP FUNCTION get_pos_bootstrap_v3, get_pos_menu_version_v3,
-- get_pos_schedule_map_v1; point the tablet back at get_pos_bootstrap_v2 /
-- get_pos_menu_version_v2 (the client already falls back when v3 is missing).
-- The merchant_id backfill is not reverted — it only fills NULLs.
--
-- Deploy to staging first, then production, BEFORE the client build that
-- calls v3. Migration files only.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Single-signature guards (see 20260904120000 for why).
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
           AND p.proname IN (
                 'get_pos_schedule_map_v1',
                 'get_pos_menu_version_v3',
                 'get_pos_bootstrap_v3'
               )
           AND pg_get_function_identity_arguments(p.oid) <> 'p_location_id uuid'
    LOOP
        RAISE NOTICE 'pos_schedules_v3: dropping superseded overload %', r.sig;
        EXECUTE format('DROP FUNCTION %s', r.sig);
    END LOOP;
END
$guard$;

-- ----------------------------------------------------------------------------
-- 2. get_pos_schedule_map_v1 — every schedule the location's tablet enforces.
--
--    NOT SECURITY DEFINER and NOT executable by callers: only reached from
--    get_pos_menu_version_v3 / get_pos_bootstrap_v3, which are SECURITY
--    DEFINER and have already authorized the caller through v1. Merchant scope
--    comes from schedules.merchant_id — category_schedules.merchant_id is
--    nullable and was left NULL by the dashboard.
--
--    Every aggregate is ordered and jsonb normalizes key order, so equal
--    content always renders to the same text (the watermark hashes it).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_pos_schedule_map_v1(p_location_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH loc AS (
    SELECT l.merchant_id FROM public.locations l WHERE l.id = p_location_id
  ),
  sched AS (
    SELECT s.id,
           jsonb_build_object(
             'id', s.id,
             'name', s.name,
             'description', s.description,
             'is_active', COALESCE(lso.is_active, s.is_active),
             'time_slots', COALESCE((
               SELECT jsonb_agg(
                        jsonb_build_object(
                          'day_of_week', ts.day_of_week,
                          'start_time', ts.start_time,
                          'end_time', ts.end_time,
                          'is_active', ts.is_active
                        )
                        ORDER BY ts.day_of_week, ts.start_time, ts.end_time,
                                 ts.is_active
                      )
                 FROM public.schedule_time_slots ts
                WHERE ts.schedule_id = s.id
             ), '[]'::jsonb)
           ) AS body
      FROM public.schedules s
      JOIN loc ON loc.merchant_id = s.merchant_id
      LEFT JOIN public.location_schedule_overrides lso
             ON lso.schedule_id = s.id
            AND lso.location_id = p_location_id
     WHERE s.location_id IS NULL OR s.location_id = p_location_id
  )
  SELECT jsonb_build_object(
    -- menu id -> entries
    'menus', COALESCE((
      SELECT jsonb_object_agg(x.k, x.e)
        FROM (
          SELECT ms.menu_id::text AS k,
                 jsonb_agg(
                   jsonb_build_object('id', ms.id, 'schedule', sc.body)
                   ORDER BY ms.id
                 ) AS e
            FROM public.menu_schedules ms
            JOIN sched sc ON sc.id = ms.schedule_id
            JOIN public.menus m
              ON m.id = ms.menu_id
             AND (m.location_id IS NULL OR m.location_id = p_location_id)
           WHERE ms.location_id IS NULL OR ms.location_id = p_location_id
           GROUP BY ms.menu_id
        ) x
    ), '{}'::jsonb),
    -- category id -> entries (category-wide assignments: every row the
    -- dashboard writes)
    'categories', COALESCE((
      SELECT jsonb_object_agg(x.k, x.e)
        FROM (
          SELECT cs.category_id::text AS k,
                 jsonb_agg(
                   jsonb_build_object('id', cs.id, 'schedule', sc.body)
                   ORDER BY cs.id
                 ) AS e
            FROM public.category_schedules cs
            JOIN sched sc ON sc.id = cs.schedule_id
            JOIN public.categories c
              ON c.id = cs.category_id
             AND (c.location_id IS NULL OR c.location_id = p_location_id)
           WHERE cs.menu_id IS NULL
           GROUP BY cs.category_id
        ) x
    ), '{}'::jsonb),
    -- 'menu_id:category_id' -> entries. category_schedules.menu_id references
    -- location_menus(id); no UI writes it today, kept so such a row is scoped
    -- correctly rather than ignored.
    'menu_categories', COALESCE((
      SELECT jsonb_object_agg(x.k, x.e)
        FROM (
          SELECT lm.menu_id::text || ':' || cs.category_id::text AS k,
                 jsonb_agg(
                   jsonb_build_object('id', cs.id, 'schedule', sc.body)
                   ORDER BY cs.id
                 ) AS e
            FROM public.category_schedules cs
            JOIN public.location_menus lm
              ON lm.id = cs.menu_id
             AND lm.location_id = p_location_id
            JOIN sched sc ON sc.id = cs.schedule_id
           GROUP BY 1
        ) x
    ), '{}'::jsonb)
  );
$$;

COMMENT ON FUNCTION public.get_pos_schedule_map_v1(uuid) IS
  'Menu and category schedules a location enforces, keyed for injection into get_pos_bootstrap_v3 and hashed into get_pos_menu_version_v3. day_of_week 0=Sunday. Internal: called only from those SECURITY DEFINER functions.';

REVOKE ALL ON FUNCTION public.get_pos_schedule_map_v1(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_pos_schedule_map_v1(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_pos_schedule_map_v1(uuid) FROM authenticated;

-- ----------------------------------------------------------------------------
-- 3. get_pos_menu_version_v3 — the probe the tablet polls from now on.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_pos_menu_version_v3(p_location_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_base text;
BEGIN
    -- v2 → v1 owns authorization (42501 for a caller outside the merchant),
    -- and the assignment guarantees it runs before the schedule map is read.
    v_base := public.get_pos_menu_version_v2(p_location_id);
    RETURN v_base || '-sched-'
           || md5(public.get_pos_schedule_map_v1(p_location_id)::text);
END
$fn$;

COMMENT ON FUNCTION public.get_pos_menu_version_v3(uuid) IS
  'get_pos_menu_version_v2 plus a content hash of the location''s menu/category schedules. Byte-identical to get_pos_bootstrap_v3.version. SECURITY DEFINER: authorization is delegated to v1.';

REVOKE ALL ON FUNCTION public.get_pos_menu_version_v3(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_pos_menu_version_v3(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_pos_menu_version_v3(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. get_pos_bootstrap_v3 — v2 plus schedules.
--
--    Category entries are matched on `category_id`, never `id` (that is the
--    menu_categories row). STABLE, so v2, the map and the version all read the
--    same snapshot.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_pos_bootstrap_v3(p_location_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_payload jsonb;
    v_map     jsonb;
BEGIN
    -- Authorization happens here (v2 → v1); nothing below runs for an
    -- unauthorized caller.
    v_payload := public.get_pos_bootstrap_v2(p_location_id);
    v_map     := public.get_pos_schedule_map_v1(p_location_id);

    RETURN v_payload || jsonb_build_object(
      'version', public.get_pos_menu_version_v3(p_location_id),
      'menus', COALESCE((
        SELECT jsonb_agg(
                 m.value || jsonb_build_object(
                   'schedules',
                   COALESCE(v_map->'menus'->(m.value->>'id'), '[]'::jsonb),
                   'categories',
                   COALESCE((
                     SELECT jsonb_agg(
                              c.value || jsonb_build_object(
                                'schedules',
                                COALESCE(v_map->'categories'
                                           ->(c.value->>'category_id'),
                                         '[]'::jsonb)
                                || COALESCE(v_map->'menu_categories'
                                              ->((m.value->>'id') || ':'
                                                 || (c.value->>'category_id')),
                                            '[]'::jsonb)
                              )
                              ORDER BY c.ordinality
                            )
                       FROM jsonb_array_elements(
                              CASE WHEN jsonb_typeof(m.value->'categories') = 'array'
                                   THEN m.value->'categories'
                                   ELSE '[]'::jsonb
                              END
                            ) WITH ORDINALITY AS c(value, ordinality)
                   ), '[]'::jsonb)
                 )
                 ORDER BY m.ordinality
               )
          FROM jsonb_array_elements(
                 COALESCE(v_payload->'menus', '[]'::jsonb)
               ) WITH ORDINALITY AS m(value, ordinality)
      ), '[]'::jsonb)
    );
END
$fn$;

COMMENT ON FUNCTION public.get_pos_bootstrap_v3(uuid) IS
  'get_pos_bootstrap_v2 with location-effective menu schedules (is_active included) and category schedules on every menus[].categories[] entry. day_of_week 0=Sunday. version = get_pos_menu_version_v3.';

REVOKE ALL ON FUNCTION public.get_pos_bootstrap_v3(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_pos_bootstrap_v3(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_pos_bootstrap_v3(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. Backfill category_schedules.merchant_id (idempotent; NULLs only).
-- ----------------------------------------------------------------------------
UPDATE public.category_schedules cs
   SET merchant_id = c.merchant_id
  FROM public.categories c
 WHERE c.id = cs.category_id
   AND cs.merchant_id IS NULL;

-- ----------------------------------------------------------------------------
-- Verification (run manually after deploy, staging first):
--
--   -- 1. Day convention: a schedule the dashboard shows as Mon–Fri stores 1..5.
--   SELECT s.name, array_agg(DISTINCT ts.day_of_week ORDER BY ts.day_of_week)
--     FROM public.schedules s
--     JOIN public.schedule_time_slots ts ON ts.schedule_id = s.id
--    WHERE s.merchant_id = '<merchant>'
--    GROUP BY 1;
--
--   -- 2. Probe and envelope agree, exactly:
--   SELECT public.get_pos_menu_version_v3('<loc>')
--        = public.get_pos_bootstrap_v3('<loc>')->>'version';        -- true
--
--   -- 3. Category schedules are in the payload:
--   SELECT jsonb_path_query(public.get_pos_bootstrap_v3('<loc>'),
--                           '$.menus[*].categories[*] ? (@.schedules.size() > 0)'
--                           ) ->> 'category_id';
--
--   -- 4. Menu schedules carry is_active now:
--   SELECT jsonb_path_query(public.get_pos_bootstrap_v3('<loc>'),
--                           '$.menus[*].schedules[*].schedule.is_active');
--
--   -- 5. The probe MOVES on: assign/unassign a category schedule, edit a slot,
--   --    toggle a schedule, add a location override. A save with no changes
--   --    leaves it unchanged. Re-run SELECT get_pos_menu_version_v3('<loc>').
--
--   -- 6. Payload size delta:
--   SELECT octet_length(public.get_pos_bootstrap_v2('<loc>')::text) AS v2,
--          octet_length(public.get_pos_bootstrap_v3('<loc>')::text) AS v3;
--
--   -- 7. Backfill left nothing behind:
--   SELECT count(*) FROM public.category_schedules WHERE merchant_id IS NULL;  -- 0
--
--   -- 8. Authorization: as a user from another merchant,
--   --    SELECT get_pos_bootstrap_v3('<loc>') raises 42501.
-- ----------------------------------------------------------------------------
