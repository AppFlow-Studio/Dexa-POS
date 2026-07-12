-- Fix POS order numbers resetting at UTC midnight.
-- The day key must follow the restaurant location timezone, not the Supabase
-- session timezone, so dinner service does not reset numbering at 00:00 UTC.

CREATE OR REPLACE FUNCTION public.generate_order_number(
  p_location_id uuid,
  p_station_id uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_merchant_id uuid;
  v_location_tz text;
  v_date_str text;
  v_sequence_number bigint;
  v_start_value bigint;
  v_order_number text;
  v_station_number integer;
  v_station_prefix text;
  v_sequence_name text;
  v_lock_key bigint;
BEGIN
  SELECT l.merchant_id, l.timezone
    INTO v_merchant_id, v_location_tz
    FROM public.locations l
   WHERE l.id = p_location_id;

  IF v_merchant_id IS NULL THEN
    RAISE EXCEPTION 'Location not found: %', p_location_id;
  END IF;

  v_date_str := TO_CHAR(
    (NOW() AT TIME ZONE COALESCE(NULLIF(v_location_tz, ''), 'America/New_York'))::date,
    'YYYYMMDD'
  );

  IF p_station_id IS NOT NULL THEN
    SELECT s.station_number
      INTO v_station_number
      FROM public.stations s
     WHERE s.id = p_station_id;
  END IF;

  IF v_station_number IS NOT NULL THEN
    v_station_prefix := 'S' || v_station_number::text;
    v_sequence_name :=
      'ord_seq_' ||
      REPLACE(v_merchant_id::text, '-', '_') ||
      '_' ||
      v_date_str ||
      '_' ||
      LOWER(v_station_prefix);
  ELSE
    v_sequence_name :=
      'ord_seq_' ||
      REPLACE(v_merchant_id::text, '-', '_') ||
      '_' ||
      v_date_str;
  END IF;

  v_lock_key := hashtextextended(v_sequence_name, 0);
  PERFORM pg_advisory_lock(v_lock_key);

  BEGIN
    IF to_regclass(format('%I.%I', 'public', v_sequence_name)) IS NULL THEN
      IF v_station_number IS NOT NULL THEN
        SELECT COALESCE(MAX(NULLIF(SPLIT_PART(o.order_number, '-', 4), '')::integer), 0) + 1
          INTO v_start_value
          FROM public.orders o
         WHERE o.merchant_id = v_merchant_id
           AND o.order_number LIKE 'ORD-' || v_date_str || '-' || v_station_prefix || '-%'
           AND SPLIT_PART(o.order_number, '-', 4) ~ '^[0-9]+$';
      ELSE
        SELECT COALESCE(MAX(NULLIF(SPLIT_PART(o.order_number, '-', 3), '')::integer), 0) + 1
          INTO v_start_value
          FROM public.orders o
         WHERE o.merchant_id = v_merchant_id
           AND o.order_number LIKE 'ORD-' || v_date_str || '-%'
           AND o.order_number NOT LIKE 'ORD-' || v_date_str || '-S%'
           AND SPLIT_PART(o.order_number, '-', 3) ~ '^[0-9]+$';
      END IF;

      EXECUTE format(
        'CREATE SEQUENCE IF NOT EXISTS %I.%I START WITH %s INCREMENT BY 1 MINVALUE 1 CACHE 1',
        'public',
        v_sequence_name,
        v_start_value
      );
    END IF;

    INSERT INTO public.order_number_day_sequences (
      sequence_name,
      merchant_id,
      date_str,
      created_at
    )
    SELECT
      v_sequence_name,
      v_merchant_id,
      v_date_str,
      NOW()
    WHERE NOT EXISTS (
      SELECT 1
        FROM public.order_number_day_sequences existing
       WHERE existing.sequence_name = v_sequence_name
    );

    PERFORM pg_advisory_unlock(v_lock_key);
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_advisory_unlock(v_lock_key);
    RAISE;
  END;

  EXECUTE format(
    'SELECT nextval(%L::regclass)',
    format('%I.%I', 'public', v_sequence_name)
  )
  INTO v_sequence_number;

  IF v_station_number IS NOT NULL THEN
    v_order_number :=
      'ORD-' ||
      v_date_str ||
      '-' ||
      v_station_prefix ||
      '-' ||
      LPAD(v_sequence_number::text, 4, '0');
  ELSE
    v_order_number :=
      'ORD-' ||
      v_date_str ||
      '-' ||
      LPAD(v_sequence_number::text, 4, '0');
  END IF;

  RETURN v_order_number;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_order_number_internal(
  p_location_id uuid,
  p_merchant_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_location_merchant_id uuid;
  v_merchant_id uuid;
  v_location_tz text;
  v_date_str text;
  v_sequence_number bigint;
  v_start_value bigint;
  v_sequence_name text;
  v_lock_key bigint;
BEGIN
  SELECT l.merchant_id, l.timezone
    INTO v_location_merchant_id, v_location_tz
    FROM public.locations l
   WHERE l.id = p_location_id;

  IF v_location_merchant_id IS NULL THEN
    RAISE EXCEPTION 'Location not found: %', p_location_id;
  END IF;

  v_merchant_id := COALESCE(p_merchant_id, v_location_merchant_id);

  v_date_str := TO_CHAR(
    (NOW() AT TIME ZONE COALESCE(NULLIF(v_location_tz, ''), 'America/New_York'))::date,
    'YYYYMMDD'
  );

  v_sequence_name :=
    'ord_seq_' ||
    REPLACE(v_merchant_id::text, '-', '_') ||
    '_' ||
    v_date_str;

  v_lock_key := hashtextextended(v_sequence_name, 0);
  PERFORM pg_advisory_lock(v_lock_key);

  BEGIN
    IF to_regclass(format('%I.%I', 'public', v_sequence_name)) IS NULL THEN
      SELECT COALESCE(MAX(NULLIF(SPLIT_PART(o.order_number, '-', 3), '')::integer), 0) + 1
        INTO v_start_value
        FROM public.orders o
       WHERE o.merchant_id = v_merchant_id
         AND o.order_number LIKE 'ORD-' || v_date_str || '-%'
         AND o.order_number NOT LIKE 'ORD-' || v_date_str || '-S%'
         AND SPLIT_PART(o.order_number, '-', 3) ~ '^[0-9]+$';

      EXECUTE format(
        'CREATE SEQUENCE IF NOT EXISTS %I.%I START WITH %s INCREMENT BY 1 MINVALUE 1 CACHE 1',
        'public',
        v_sequence_name,
        v_start_value
      );
    END IF;

    INSERT INTO public.order_number_day_sequences (
      sequence_name,
      merchant_id,
      date_str,
      created_at
    )
    SELECT
      v_sequence_name,
      v_merchant_id,
      v_date_str,
      NOW()
    WHERE NOT EXISTS (
      SELECT 1
        FROM public.order_number_day_sequences existing
       WHERE existing.sequence_name = v_sequence_name
    );

    PERFORM pg_advisory_unlock(v_lock_key);
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_advisory_unlock(v_lock_key);
    RAISE;
  END;

  EXECUTE format(
    'SELECT nextval(%L::regclass)',
    format('%I.%I', 'public', v_sequence_name)
  )
  INTO v_sequence_number;

  RETURN 'ORD-' || v_date_str || '-' || LPAD(v_sequence_number::text, 4, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_order_number(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_order_number_internal(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.generate_order_number(uuid, uuid)
  IS 'Generates POS order numbers using the location local date for the daily sequence key.';

COMMENT ON FUNCTION public.generate_order_number_internal(uuid, uuid)
  IS 'Generates POS order numbers using the location local date for the daily sequence key.';
