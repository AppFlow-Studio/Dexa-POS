-- ============================================================================
-- Force one menu rebuild for item-level sales channels.
--
-- The field itself is added upstream, in the DexaPOS-Website migration
-- 20260914120000_menu_item_sales_channels_pos_kiosk.sql, which teaches
-- get_menu_with_categories to emit `effective_available_channels` on every menu
-- item. get_pos_bootstrap_v1 embeds that function's output wholesale, so the
-- POS payload gains the field with no change to v1 or v2's shape.
--
-- THIS IS A SAFETY NET FOR THE WATERMARK, not the main propagation path.
-- v1 derives `version` from max(updated_at) across the menu tables, and
-- PosSyncProvider skips the entire store rebuild when the incoming version
-- matches the one already applied. Redefining an RPC touches no business row,
-- so a device could otherwise sit on its cached, channel-less snapshot until
-- something unrelated edited a menu.
--
-- In practice the upstream backfill covers most of this on its own: menu_items
-- carries an `update_menu_items_updated_at` trigger, so every row it adds
-- 'kiosk' to bumps updated_at and moves the watermark. What it does NOT cover
-- is a location with nothing to backfill — a merchant whose items already
-- listed all three channels — where no row changes and no rebuild is triggered.
-- Those devices would never see the new field.
--
-- Bumping the suffix closes that gap for every location at once: each device
-- does exactly one forced rebuild on its next sync. Same trick the
-- '-channels-v1' suffix played for menu-level visibility; this is that suffix
-- incremented, nothing else. The function body below is otherwise verbatim
-- from 20260821120000_menu_channel_visibility.sql.
--
-- DEPLOY AFTER the website migration, so the rebuild it forces already has the
-- new field to pick up.
-- ============================================================================

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
              'version', COALESCE(b.payload->>'version', '0') || '-channels-v2-item-channels',
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
  'Authorized POS bootstrap enriched with per-location pos/kiosk/online menu visibility. Menu items carry effective_available_channels from get_menu_with_categories.';

REVOKE ALL ON FUNCTION public.get_pos_bootstrap_v2(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_pos_bootstrap_v2(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_pos_bootstrap_v2(uuid) TO authenticated;
