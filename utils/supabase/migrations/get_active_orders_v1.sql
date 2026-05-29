-- ============================================================================
-- get_active_orders_v1 — server-shaped JSON for the active POS feed
-- ============================================================================
-- Replaces the PostgREST nested-embed used by useOrdersQuery. Pre-shapes
-- the response server-side as a single JSON-per-row stream so:
--   * The planner sees a tight query (no PostgREST CTE rewrite)
--   * The partial index idx_order_items_order_active is engaged via the
--     explicit is_voided = false predicate
--   * Wire payload is bounded by p_limit and the business-day floor
--   * Client-side normalizer (normalizeFetchedOrder) needs no changes —
--     each returned JSON row is the same flat shape as the PostgREST embed.
--
-- Filter semantics match useOrdersQuery:
--   - location_id = p_location_id
--   - status IN active set
--   - station-private drafts: keep external (station_id IS NULL) + own station
--   - created_at >= p_business_day_start (optional)

CREATE OR REPLACE FUNCTION public.get_active_orders_v1(
  p_location_id uuid,
  p_station_id uuid DEFAULT NULL,
  p_business_day_start timestamptz DEFAULT NULL,
  p_limit int DEFAULT 200
)
RETURNS SETOF json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  -- Auth: caller must have access to this location
  IF NOT (p_location_id = ANY(user_location_ids())) THEN
    RAISE EXCEPTION 'Location access denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT (
    to_jsonb(o.*)
    || jsonb_build_object(
      'order_items', COALESCE((
        SELECT jsonb_agg(
          to_jsonb(oi.*)
          || jsonb_build_object(
            'order_item_modifiers', COALESCE((
              SELECT jsonb_agg(to_jsonb(oim.*))
              FROM public.order_item_modifiers oim
              WHERE oim.order_item_id = oi.id
            ), '[]'::jsonb)
          )
          ORDER BY oi.display_order ASC NULLS LAST, oi.created_at ASC
        )
        FROM public.order_items oi
        WHERE oi.order_id = o.id
          AND oi.is_voided = false
      ), '[]'::jsonb),
      'order_payments', COALESCE((
        SELECT jsonb_agg(to_jsonb(op.*))
        FROM public.order_payments op
        WHERE op.order_id = o.id
      ), '[]'::jsonb),
      'order_discounts', COALESCE((
        SELECT jsonb_agg(to_jsonb(od.*) ORDER BY od.applied_at)
        FROM public.order_discounts od
        WHERE od.order_id = o.id
          AND od.voided_at IS NULL
      ), '[]'::jsonb),
      'stations', CASE
        WHEN s.id IS NOT NULL
          THEN jsonb_build_object('station_name', s.station_name)
        ELSE NULL
      END,
      'created_by_staff', CASE
        WHEN sp.id IS NOT NULL
          THEN jsonb_build_object('first_name', sp.first_name, 'last_name', sp.last_name)
        ELSE NULL
      END
    )
  )::json
  FROM public.orders o
  LEFT JOIN public.stations s ON s.id = o.station_id
  LEFT JOIN public.staff_profiles sp ON sp.id = o.created_by_staff_id
  WHERE o.location_id = p_location_id
    AND o.status IN ('draft', 'pending', 'sent_to_kitchen', 'preparing', 'ready')
    AND (p_business_day_start IS NULL OR o.created_at >= p_business_day_start)
    AND (
      -- station-private drafts: if caller passed a station id, drop other
      -- stations' drafts; non-draft rows and station-less drafts always pass
      p_station_id IS NULL
      OR o.status <> 'draft'
      OR o.station_id IS NULL
      OR o.station_id = p_station_id
    )
  ORDER BY o.created_at DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_active_orders_v1(uuid, uuid, timestamptz, int)
  TO authenticated;
