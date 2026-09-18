-- Per-location menu visibility for staff POS, self-service kiosk, and online.
-- Existing rows default to visible on every surface, so this migration is
-- backward compatible until a portal user explicitly disables a channel.

ALTER TABLE public.location_menus
  ADD COLUMN IF NOT EXISTS is_visible_on_pos boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_visible_on_kiosk boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_visible_online boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.location_menus.is_visible_on_pos IS
  'Whether this menu is selectable in staff-operated POS order entry.';
COMMENT ON COLUMN public.location_menus.is_visible_on_kiosk IS
  'Whether this menu is selectable in self-service kiosk order entry.';
COMMENT ON COLUMN public.location_menus.is_visible_online IS
  'Whether this menu may be published or served by online ordering.';

-- Menu bootstrap versioning depends on updated_at. The dashboard currently
-- updates is_active without setting updated_at, which can leave a refreshed POS
-- on a stale snapshot. Keep both menu configuration tables self-versioning.
CREATE OR REPLACE FUNCTION public.touch_menu_configuration_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_menus_touch_updated_at ON public.menus;
CREATE TRIGGER trg_menus_touch_updated_at
BEFORE UPDATE ON public.menus
FOR EACH ROW
EXECUTE FUNCTION public.touch_menu_configuration_updated_at();

DROP TRIGGER IF EXISTS trg_location_menus_touch_updated_at ON public.location_menus;
CREATE TRIGGER trg_location_menus_touch_updated_at
BEFORE UPDATE ON public.location_menus
FOR EACH ROW
EXECUTE FUNCTION public.touch_menu_configuration_updated_at();

-- Enrich the existing, authorized v1 bootstrap rather than duplicating its
-- large menu/recipe/tax query. v1 remains available to older app versions.
CREATE OR REPLACE FUNCTION public.get_pos_bootstrap_v2(p_location_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT b.payload
         || jsonb_build_object(
              -- The suffix forces one clean rebuild for clients carrying a v1
              -- offline snapshot even when no business row changed.
              'version', COALESCE(b.payload->>'version', '0') || '-channels-v1',
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
              ), '[]'::jsonb)
            ) AS payload
    FROM (
      SELECT public.get_pos_bootstrap_v1(p_location_id) AS payload
    ) b;
$$;

COMMENT ON FUNCTION public.get_pos_bootstrap_v2(uuid) IS
  'Authorized POS bootstrap enriched with per-location pos/kiosk/online menu visibility.';

REVOKE ALL ON FUNCTION public.get_pos_bootstrap_v2(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_pos_bootstrap_v2(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_pos_bootstrap_v2(uuid) TO authenticated;

-- Verification after deployment:
-- SELECT id, menu_id, location_id, is_active,
--        is_visible_on_pos, is_visible_on_kiosk, is_visible_online, updated_at
--   FROM public.location_menus
--  WHERE location_id = '<location-id>'::uuid;
--
-- SELECT jsonb_pretty(public.get_pos_bootstrap_v2('<location-id>'::uuid));
