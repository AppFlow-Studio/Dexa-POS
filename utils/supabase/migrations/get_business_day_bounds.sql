-- Lightweight RPC: returns the timestamptz bounds for a business day window.
-- Client uses these bounds to filter existing Supabase queries with .gte/.lt.
--
-- Usage:
--   SELECT * FROM get_business_day_bounds('location-uuid');                    -- today
--   SELECT * FROM get_business_day_bounds('location-uuid', '2026-04-11');     -- specific date
--   SELECT * FROM get_business_day_bounds('location-uuid', '2026-04-05', '2026-04-11'); -- range

CREATE OR REPLACE FUNCTION get_business_day_bounds(
  p_location_id uuid,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
)
RETURNS TABLE(start_ts timestamptz, end_ts timestamptz)
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tz text;
  v_start_hour int;
BEGIN
  -- Pull merchant timezone + business day cutoff hour
  SELECT timezone, COALESCE(business_day_start_hour, 0)
    INTO v_tz, v_start_hour
    FROM locations WHERE id = p_location_id;

  -- Fallback to UTC if timezone not configured
  IF v_tz IS NULL THEN
    v_tz := 'UTC';
  END IF;

  IF p_start_date IS NULL THEN
    -- "Today" business day: compute dynamically from server clock
    start_ts := (date_trunc('day', now() AT TIME ZONE v_tz)
                 + make_interval(hours => v_start_hour))
                AT TIME ZONE v_tz;

    -- If current local time is before the rollover hour,
    -- we're still on yesterday's business day
    IF (now() AT TIME ZONE v_tz)::time < make_time(v_start_hour, 0, 0) THEN
      start_ts := start_ts - interval '1 day';
    END IF;

    end_ts := start_ts + interval '1 day';
  ELSE
    -- Explicit date range
    start_ts := (p_start_date::timestamp
                 + make_interval(hours => v_start_hour))
                AT TIME ZONE v_tz;
    end_ts := ((COALESCE(p_end_date, p_start_date) + 1)::timestamp
               + make_interval(hours => v_start_hour))
              AT TIME ZONE v_tz;
  END IF;

  RETURN NEXT;
END;
$$;
