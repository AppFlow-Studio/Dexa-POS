-- Server-authoritative Online Orders date filtering.
--
-- Today/Yesterday are location-local calendar days, not UTC days or the
-- configurable POS business-day rollover. Active orders stay on the board
-- even when they were placed before the selected window.

CREATE OR REPLACE FUNCTION public.get_online_orders_board_v1(
  p_location_id uuid,
  p_preset text DEFAULT 'today',
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  -- Retained for compatibility with early clients. Results are not truncated.
  p_limit integer DEFAULT 500
)
RETURNS TABLE(
  order_id uuid,
  placed_at timestamptz,
  is_in_range boolean,
  item_count integer,
  order_data jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_timezone text;
  v_today date;
  v_start_date date;
  v_end_date date;
  v_start_ts timestamptz;
  v_end_ts timestamptz;
BEGIN
  SELECT COALESCE(NULLIF(l.timezone, ''), 'UTC')
    INTO v_timezone
    FROM public.locations l
   WHERE l.id = p_location_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Location not found: %', p_location_id
      USING ERRCODE = 'P0002';
  END IF;

  IF p_preset IS NULL
     OR p_preset NOT IN ('today', 'yesterday', 'last_7_days', 'custom') THEN
    RAISE EXCEPTION 'Unsupported online-order date preset: %', p_preset
      USING ERRCODE = '22023';
  END IF;

  v_today := (now() AT TIME ZONE v_timezone)::date;

  CASE p_preset
    WHEN 'today' THEN
      v_start_date := v_today;
      v_end_date := v_today;
    WHEN 'yesterday' THEN
      v_start_date := v_today - 1;
      v_end_date := v_today - 1;
    WHEN 'last_7_days' THEN
      v_start_date := v_today - 6;
      v_end_date := v_today;
    WHEN 'custom' THEN
      IF p_start_date IS NULL OR p_end_date IS NULL THEN
        RAISE EXCEPTION 'Custom date range requires start and end dates'
          USING ERRCODE = '22023';
      END IF;
      IF p_end_date < p_start_date THEN
        RAISE EXCEPTION 'Custom date range end must not precede start'
          USING ERRCODE = '22023';
      END IF;
      v_start_date := p_start_date;
      v_end_date := p_end_date;
  END CASE;

  -- Converting each local midnight independently keeps the half-open window
  -- correct across 23-hour and 25-hour DST days.
  v_start_ts := v_start_date::timestamp AT TIME ZONE v_timezone;
  v_end_ts := (v_end_date + 1)::timestamp AT TIME ZONE v_timezone;
  RETURN QUERY
  WITH online_order_rows AS (
    -- The FK is not unique in the schema. Select one authoritative placement
    -- row per order so duplicate ingestion rows cannot consume result slots or
    -- duplicate cards.
    SELECT DISTINCT ON (oo.order_id)
      oo.order_id,
      oo.placed_at
    FROM public.online_orders oo
    WHERE oo.location_id = p_location_id
    ORDER BY
      oo.order_id,
      oo.updated_at DESC,
      oo.id DESC
  )
  SELECT
    online_order_rows.order_id,
    online_order_rows.placed_at,
    COALESCE(
      online_order_rows.placed_at >= v_start_ts
        AND online_order_rows.placed_at < v_end_ts,
      false
    ) AS is_in_range,
    COALESCE((
      SELECT SUM(GREATEST(oi.quantity, 0))::integer
      FROM public.order_items oi
      WHERE oi.order_id = o.id
        AND NOT COALESCE(oi.is_voided, false)
    ), 0) AS item_count,
    to_jsonb(o) || jsonb_build_object(
      'stations', CASE
        WHEN s.id IS NULL THEN NULL
        ELSE jsonb_build_object('station_name', s.station_name)
      END,
      'created_by_staff', CASE
        WHEN sp.id IS NULL THEN NULL
        ELSE jsonb_build_object(
          'first_name', sp.first_name,
          'last_name', sp.last_name
        )
      END
    ) AS order_data
  FROM online_order_rows
  JOIN public.orders o ON o.id = online_order_rows.order_id
  LEFT JOIN public.stations s ON s.id = o.station_id
  LEFT JOIN public.staff_profiles sp ON sp.id = o.created_by_staff_id
  WHERE o.location_id = p_location_id
    AND o.status::text IN (
      'pending',
      'accepted',
      'sent_to_kitchen',
      'preparing',
      'ready',
      'completed'
    )
    AND (
      (
        online_order_rows.placed_at >= v_start_ts
        AND online_order_rows.placed_at < v_end_ts
      )
      OR o.status::text IN (
        'pending',
        'accepted',
        'sent_to_kitchen',
        'preparing',
        'ready'
      )
    )
  ORDER BY online_order_rows.placed_at DESC NULLS LAST, online_order_rows.order_id DESC;
END;
$function$;

COMMENT ON FUNCTION public.get_online_orders_board_v1(uuid, text, date, date, integer)
IS 'Returns deduplicated location-local online order headers plus active orders outside the selected window.';
