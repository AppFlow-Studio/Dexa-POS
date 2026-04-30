-- ============================================================================
-- Fix: Menu ordering should respect per-location display_order
--
-- Issue: Menus don't respect custom ordering set on website (per-location via
-- location_menus.display_order). Categories and items already work correctly.
--
-- Root Cause:
-- 1. get_pos_full_sync RPC doesn't include display_order in the menu JSON
-- 2. SQL uses ORDER BY m.display_order instead of per-location override
--
-- Solution:
-- 1. LEFT JOIN location_menus table to get per-location display_order
-- 2. Use COALESCE(lm.display_order, m.display_order) in ORDER BY
-- 3. Inject display_order into menu JSON using jsonb_set() with resolved value
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_pos_full_sync(p_location_id UUID)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'synced_at', NOW(),
        'location_id', p_location_id,
        'menus', (
            SELECT COALESCE(json_agg(
                -- Inject display_order into the menu JSON
                (get_menu_with_categories(m.id, p_location_id)::jsonb
                 || jsonb_build_object(
                      'display_order',
                      COALESCE(lm.display_order, m.display_order)
                    )
                )::json
                ORDER BY COALESCE(lm.display_order, m.display_order) NULLS LAST, m.name
            ), '[]'::json)
            FROM public.menus m
            LEFT JOIN public.location_menus lm
              ON lm.menu_id = m.id
              AND lm.location_id = p_location_id
            WHERE m.merchant_id = (SELECT merchant_id FROM public.locations WHERE id = p_location_id)
            AND (
                (m.location_id IS NULL)
                OR
                (m.location_id = p_location_id)
            )
            AND (
                -- For location-specific menus, check their is_active
                (m.location_id = p_location_id AND m.is_active = true)
                OR
                -- For global menus, check global is_active OR location override is_active
                (m.location_id IS NULL AND (m.is_active = true OR lm.is_active = true))
            )
        )
    ) INTO result;

    RETURN result;
END;
$$;
