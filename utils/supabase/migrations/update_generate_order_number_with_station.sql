-- Migration: update_generate_order_number_with_station.sql
-- Adds p_station_id parameter to generate_order_number for per-station sequences.
-- Format with station: ORD-YYYYMMDD-S1-0008 / #S1-0008
-- Format without station (fallback): ORD-YYYYMMDD-0008 / #0008

CREATE OR REPLACE FUNCTION public.generate_order_number(
  p_location_id UUID,
  p_station_id UUID DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_merchant_id UUID;
  v_date_str TEXT;
  v_sequence_number INT;
  v_order_number TEXT;
  v_station_number INT;
  v_station_prefix TEXT;
  v_lock_key INT;
BEGIN
  -- Get merchant_id from location
  SELECT merchant_id INTO v_merchant_id
  FROM public.locations
  WHERE id = p_location_id;

  IF v_merchant_id IS NULL THEN
    RAISE EXCEPTION 'Location not found: %', p_location_id;
  END IF;

  -- Date string for today
  v_date_str := TO_CHAR(CURRENT_DATE, 'YYYYMMDD');

  -- Look up station number if station_id provided
  IF p_station_id IS NOT NULL THEN
    SELECT station_number INTO v_station_number
    FROM public.stations
    WHERE id = p_station_id;
  END IF;

  IF v_station_number IS NOT NULL THEN
    -- === Per-station sequence ===
    v_station_prefix := 'S' || v_station_number::TEXT;

    -- Advisory lock scoped to merchant + date + station
    v_lock_key := hashtext(v_merchant_id::TEXT || v_date_str || ':' || v_station_prefix);
    PERFORM pg_advisory_xact_lock(v_lock_key);

    -- Count only orders for this station on this date
    SELECT COALESCE(MAX(
      NULLIF(SPLIT_PART(order_number, '-', 4), '')::INTEGER
    ), 0) + 1
    INTO v_sequence_number
    FROM public.orders
    WHERE merchant_id = v_merchant_id
      AND order_number LIKE 'ORD-' || v_date_str || '-' || v_station_prefix || '-%';

    -- Format: ORD-20260324-S1-0008
    v_order_number := 'ORD-' || v_date_str || '-' || v_station_prefix || '-' || LPAD(v_sequence_number::TEXT, 4, '0');
  ELSE
    -- === Global sequence (fallback, no station) ===
    v_lock_key := hashtext(v_merchant_id::TEXT || v_date_str);
    PERFORM pg_advisory_xact_lock(v_lock_key);

    SELECT COALESCE(MAX(
      NULLIF(SPLIT_PART(order_number, '-', 3), '')::INTEGER
    ), 0) + 1
    INTO v_sequence_number
    FROM public.orders
    WHERE merchant_id = v_merchant_id
      AND order_number LIKE 'ORD-' || v_date_str || '-%'
      AND order_number NOT LIKE 'ORD-' || v_date_str || '-S%';

    -- Format: ORD-20260324-0008
    v_order_number := 'ORD-' || v_date_str || '-' || LPAD(v_sequence_number::TEXT, 4, '0');
  END IF;

  RETURN v_order_number;
END;
$$;
