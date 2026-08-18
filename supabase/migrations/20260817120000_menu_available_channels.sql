-- Menu-level channel visibility for POS, online ordering, and kiosk.
--
-- Existing menu RPC definitions differ between environments and the optimized
-- bootstrap DDL is not recorded on staging. Keep the existing functions intact
-- and add channel-aware wrappers so deployments remain backward-compatible.

ALTER TABLE public.menus
  ADD COLUMN IF NOT EXISTS available_channels jsonb NOT NULL
  DEFAULT '["pos", "online", "kiosk"]'::jsonb;

ALTER TABLE public.location_menus
  ADD COLUMN IF NOT EXISTS available_channels jsonb NULL;

ALTER TABLE public.menus
  DROP CONSTRAINT IF EXISTS menus_available_channels_valid;
ALTER TABLE public.menus
  ADD CONSTRAINT menus_available_channels_valid CHECK (
    jsonb_typeof(available_channels) = 'array'
    AND available_channels <@ '["pos", "online", "kiosk"]'::jsonb
  ) NOT VALID;
ALTER TABLE public.menus
  VALIDATE CONSTRAINT menus_available_channels_valid;

ALTER TABLE public.location_menus
  DROP CONSTRAINT IF EXISTS location_menus_available_channels_valid;
ALTER TABLE public.location_menus
  ADD CONSTRAINT location_menus_available_channels_valid CHECK (
    available_channels IS NULL
    OR (
      jsonb_typeof(available_channels) = 'array'
      AND available_channels <@ '["pos", "online", "kiosk"]'::jsonb
    )
  ) NOT VALID;
ALTER TABLE public.location_menus
  VALIDATE CONSTRAINT location_menus_available_channels_valid;

COMMENT ON COLUMN public.menus.available_channels IS
  'Menu surfaces. Existing rows default to pos, online, and kiosk.';
COMMENT ON COLUMN public.location_menus.available_channels IS
  'Nullable location override for menu surfaces; NULL inherits menus.available_channels.';

CREATE OR REPLACE FUNCTION public.filter_menu_array_by_channel_v1(
  p_menus jsonb,
  p_location_id uuid,
  p_channel text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_channel text := lower(COALESCE(p_channel, ''));
BEGIN
  IF v_channel NOT IN ('pos', 'online', 'kiosk') THEN
    RAISE EXCEPTION 'Unsupported menu channel: %', p_channel
      USING ERRCODE = '22023';
  END IF;

  RETURN (
    SELECT COALESCE(jsonb_agg(entry.menu_json ORDER BY entry.ordinality), '[]'::jsonb)
    FROM jsonb_array_elements(COALESCE(p_menus, '[]'::jsonb))
      WITH ORDINALITY AS entry(menu_json, ordinality)
    JOIN public.menus m
      ON m.id = (entry.menu_json ->> 'id')::uuid
    LEFT JOIN public.location_menus lm
      ON lm.menu_id = m.id
     AND lm.location_id = p_location_id
    WHERE COALESCE(lm.available_channels, m.available_channels) ? v_channel
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_pos_bootstrap_channel_v1(
  p_location_id uuid,
  p_channel text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_payload jsonb;
BEGIN
  -- The optimized bootstrap is deployed ahead of its DDL in some environments.
  -- Resolve it dynamically so a migration replay can still create this wrapper;
  -- the client will fall back to get_pos_full_sync when no bootstrap exists.
  IF to_regprocedure('public.get_pos_bootstrap_v1(uuid)') IS NOT NULL THEN
    EXECUTE 'SELECT public.get_pos_bootstrap_v1($1)::jsonb'
      INTO v_payload
      USING p_location_id;
  ELSIF to_regprocedure('public.get_pos_bootstrap_v1(uuid,text)') IS NOT NULL THEN
    EXECUTE 'SELECT public.get_pos_bootstrap_v1($1, $2)::jsonb'
      INTO v_payload
      USING p_location_id, NULL::text;
  ELSE
    RAISE EXCEPTION 'get_pos_bootstrap_v1 is not deployed'
      USING ERRCODE = '42883';
  END IF;

  RETURN jsonb_set(
    v_payload,
    '{menus}',
    public.filter_menu_array_by_channel_v1(
      v_payload -> 'menus',
      p_location_id,
      p_channel
    ),
    true
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_pos_full_sync_channel_v1(
  p_location_id uuid,
  p_channel text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_payload jsonb;
BEGIN
  v_payload := public.get_pos_full_sync(p_location_id => p_location_id)::jsonb;

  RETURN jsonb_set(
    v_payload,
    '{menus}',
    public.filter_menu_array_by_channel_v1(
      v_payload -> 'menus',
      p_location_id,
      p_channel
    ),
    true
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_menus_for_location_channel_v1(
  p_merchant_id uuid,
  p_location_id uuid,
  p_channel text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_menus jsonb;
BEGIN
  v_menus := public.get_menus_for_location(
    p_merchant_id => p_merchant_id,
    p_location_id => p_location_id
  )::jsonb;

  RETURN public.filter_menu_array_by_channel_v1(
    v_menus,
    p_location_id,
    p_channel
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_menu_library_channel_v1(
  p_merchant_id uuid,
  p_location_id uuid,
  p_channel text
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', m.id,
        'name', m.name,
        'description', m.description,
        'is_active', m.is_active,
        'location_id', m.location_id,
        'display_order', m.display_order,
        'created_at', m.created_at,
        'available_channels', COALESCE(lm.available_channels, m.available_channels),
        'menu_categories', COALESCE(
          (
            SELECT jsonb_agg(
              jsonb_build_object(
                'category_id', mc.category_id,
                'display_order', mc.display_order,
                'is_active', mc.is_active
              )
              ORDER BY mc.display_order NULLS LAST, mc.created_at
            )
            FROM public.menu_categories mc
            WHERE mc.menu_id = m.id
          ),
          '[]'::jsonb
        )
      )
      ORDER BY m.display_order NULLS LAST, m.created_at DESC
    ),
    '[]'::jsonb
  )
  FROM public.menus m
  LEFT JOIN public.location_menus lm
    ON lm.menu_id = m.id
   AND lm.location_id = p_location_id
  WHERE m.merchant_id = p_merchant_id
    AND (m.location_id IS NULL OR m.location_id = p_location_id)
    AND COALESCE(lm.available_channels, m.available_channels) ? lower(p_channel)
    AND lower(p_channel) IN ('pos', 'online', 'kiosk');
$function$;

CREATE OR REPLACE FUNCTION public.set_menu_available_channels_v1(
  p_menu_id uuid,
  p_available_channels jsonb,
  p_location_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_merchant_id uuid;
  v_effective_channels jsonb;
BEGIN
  SELECT m.merchant_id
    INTO v_merchant_id
    FROM public.menus m
   WHERE m.id = p_menu_id;

  IF v_merchant_id IS NULL THEN
    RAISE EXCEPTION 'Menu not found: %', p_menu_id USING ERRCODE = 'P0002';
  END IF;

  IF NOT COALESCE(public.is_dexapos_admin(), false)
     AND public.user_merchant_id() IS DISTINCT FROM v_merchant_id THEN
    RAISE EXCEPTION 'Not authorized to update menu %', p_menu_id
      USING ERRCODE = '42501';
  END IF;

  IF p_location_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM public.locations l
     WHERE l.id = p_location_id
       AND l.merchant_id = v_merchant_id
  ) THEN
    RAISE EXCEPTION 'Location does not belong to the menu merchant'
      USING ERRCODE = '22023';
  END IF;

  IF p_available_channels IS NOT NULL AND (
    jsonb_typeof(p_available_channels) <> 'array'
    OR NOT p_available_channels <@ '["pos", "online", "kiosk"]'::jsonb
  ) THEN
    RAISE EXCEPTION 'available_channels must contain only pos, online, and kiosk'
      USING ERRCODE = '22023';
  END IF;

  IF p_location_id IS NULL AND p_available_channels IS NULL THEN
    RAISE EXCEPTION 'Base menu channels cannot be NULL'
      USING ERRCODE = '23502';
  END IF;

  IF p_available_channels IS NOT NULL
     AND NOT (p_available_channels ? 'online')
     AND EXISTS (
       SELECT 1
         FROM public.orderout_menu_links oml
         JOIN public.orderout_restaurants oor
           ON oor.id = oml.orderout_restaurant_id
        WHERE oml.menu_id = p_menu_id
          AND COALESCE(oml.is_active, true)
          AND COALESCE(oml.is_primary, false)
          AND (p_location_id IS NULL OR oor.location_id = p_location_id)
     ) THEN
    RAISE EXCEPTION 'Online cannot be disabled for a primary OrderOut menu'
      USING ERRCODE = '23514';
  END IF;

  IF p_location_id IS NULL THEN
    UPDATE public.menus
       SET available_channels = p_available_channels,
           updated_at = now()
     WHERE id = p_menu_id;
    v_effective_channels := p_available_channels;
  ELSE
    INSERT INTO public.location_menus (
      location_id,
      menu_id,
      available_channels
    ) VALUES (
      p_location_id,
      p_menu_id,
      p_available_channels
    )
    ON CONFLICT (location_id, menu_id)
    DO UPDATE SET
      available_channels = EXCLUDED.available_channels,
      updated_at = now();

    SELECT COALESCE(lm.available_channels, m.available_channels)
      INTO v_effective_channels
      FROM public.menus m
      LEFT JOIN public.location_menus lm
        ON lm.menu_id = m.id
       AND lm.location_id = p_location_id
     WHERE m.id = p_menu_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'menu_id', p_menu_id,
    'location_id', p_location_id,
    'available_channels', v_effective_channels
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_pos_bootstrap_channel_v1(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_pos_full_sync_channel_v1(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_menus_for_location_channel_v1(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_menu_library_channel_v1(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_menu_available_channels_v1(uuid, jsonb, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.filter_menu_array_by_channel_v1(jsonb, uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_pos_bootstrap_channel_v1(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pos_full_sync_channel_v1(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_menus_for_location_channel_v1(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_menu_library_channel_v1(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_menu_available_channels_v1(uuid, jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.filter_menu_array_by_channel_v1(jsonb, uuid, text) TO authenticated;
