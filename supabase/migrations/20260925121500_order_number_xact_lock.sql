-- =============================================================================
-- Order numbers: no session advisory lock on the hot path
-- =============================================================================
-- Plan: Dexa-POS/docs/engineering/database/SUPABASE-CONNECTIONS-AND-STORAGE-2026-09-24.md,
-- Phase 3.3.
--
-- WHAT WAS WRONG
--   generate_order_number and generate_order_number_internal (latest bodies:
--   Dexa-POS/supabase/migrations/20260629130000_order_numbers_location_timezone.sql,
--   which is what staging runs) took a SESSION-level pg_advisory_lock on every
--   call and released it in the body or an EXCEPTION WHEN OTHERS handler.
--   WHEN OTHERS does not catch query_canceled (57014): a statement timeout
--   skipped the unlock, the pooled PostgREST connection kept the lock, and
--   every later order for that sequence waited out its 8 s statement timeout.
--
-- WHAT CHANGES (numbering, naming, date key and bootstrap are unchanged)
--   Fast path: the day's sequence exists (every call but the first of the day
--     per sequence) -> nextval, no lock, no subtransaction.
--   Slow path: pg_advisory_xact_lock (released on commit, rollback or timeout),
--     re-check pg_class with an MVCC read (to_regclass can still see the
--     negative cache entry from the fast-path lookup), CREATE SEQUENCE IF NOT
--     EXISTS, registry insert ON CONFLICT DO NOTHING.
--   The lock key has a new prefix ('generate_order_number:'), so a session
--   lock leaked by the old code cannot block the new slow path.
--   Backfills order_number_day_sequences for ord_seq_% sequences that have no
--   registry row (both the 32-hex and the underscored-uuid naming schemes).
--
-- Mirrored byte-identical into Dexa-POS/supabase/migrations/, next to
-- 20260629130000, so neither migration root holds the session-lock version as
-- its latest.
-- Rollback: rollback/20260925121500_order_number_xact_lock_rollback.sql
--
-- After applying, find session locks leaked by the old code (an idle backend
-- can only be holding a session lock):
--   select l.pid, a.application_name, a.state, now() - a.state_change held_for
--     from pg_locks l join pg_stat_activity a using (pid)
--    where l.locktype = 'advisory' and l.granted and a.state like 'idle%';
-- They only block the OLD key; terminating them (pg_terminate_backend) is safe,
-- PostgREST reconnects, but do it off-peak.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.generate_order_number(
  p_location_id uuid,
  p_station_id uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_merchant_id uuid;
  v_location_tz text;
  v_date_str text;
  v_sequence_number bigint;
  v_start_value bigint;
  v_station_number integer;
  v_station_prefix text;
  v_sequence_name text;
  v_sequence regclass;
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
    v_sequence_name := 'ord_seq_' || REPLACE(v_merchant_id::text, '-', '_') || '_' || v_date_str || '_' || LOWER(v_station_prefix);
  ELSE
    v_sequence_name := 'ord_seq_' || REPLACE(v_merchant_id::text, '-', '_') || '_' || v_date_str;
  END IF;

  -- Fast path: the day's sequence already exists. No lock, no subtransaction.
  v_sequence := to_regclass(format('%I.%I', 'public', v_sequence_name));

  IF v_sequence IS NULL THEN
    -- Slow path (first order of the day for this sequence): serialize creators.
    -- Transaction-scoped, so commit, rollback and statement timeout all release it.
    PERFORM pg_advisory_xact_lock(hashtextextended('generate_order_number:' || v_sequence_name, 0));

    -- Re-check with an MVCC read of pg_class (fresh statement snapshot), not the
    -- syscache, which can still hold the negative entry from the lookup above.
    SELECT c.oid::regclass
      INTO v_sequence
      FROM pg_catalog.pg_class c
     WHERE c.relnamespace = 'public'::regnamespace
       AND c.relname = v_sequence_name
       AND c.relkind = 'S';

    IF v_sequence IS NULL THEN
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
        'public', v_sequence_name, v_start_value
      );

      INSERT INTO public.order_number_day_sequences (sequence_name, merchant_id, date_str, created_at)
      VALUES (v_sequence_name, v_merchant_id, v_date_str, NOW())
      ON CONFLICT (sequence_name) DO NOTHING;

      v_sequence := format('%I.%I', 'public', v_sequence_name)::regclass;
    END IF;
  END IF;

  v_sequence_number := nextval(v_sequence);

  IF v_station_number IS NOT NULL THEN
    RETURN 'ORD-' || v_date_str || '-' || v_station_prefix || '-' || LPAD(v_sequence_number::text, 4, '0');
  END IF;
  RETURN 'ORD-' || v_date_str || '-' || LPAD(v_sequence_number::text, 4, '0');
END;
$function$;

CREATE OR REPLACE FUNCTION public.generate_order_number_internal(
  p_location_id uuid,
  p_merchant_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_location_merchant_id uuid;
  v_merchant_id uuid;
  v_location_tz text;
  v_date_str text;
  v_sequence_number bigint;
  v_start_value bigint;
  v_sequence_name text;
  v_sequence regclass;
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

  v_sequence_name := 'ord_seq_' || REPLACE(v_merchant_id::text, '-', '_') || '_' || v_date_str;

  v_sequence := to_regclass(format('%I.%I', 'public', v_sequence_name));

  IF v_sequence IS NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('generate_order_number:' || v_sequence_name, 0));

    SELECT c.oid::regclass
      INTO v_sequence
      FROM pg_catalog.pg_class c
     WHERE c.relnamespace = 'public'::regnamespace
       AND c.relname = v_sequence_name
       AND c.relkind = 'S';

    IF v_sequence IS NULL THEN
      SELECT COALESCE(MAX(NULLIF(SPLIT_PART(o.order_number, '-', 3), '')::integer), 0) + 1
        INTO v_start_value
        FROM public.orders o
       WHERE o.merchant_id = v_merchant_id
         AND o.order_number LIKE 'ORD-' || v_date_str || '-%'
         AND o.order_number NOT LIKE 'ORD-' || v_date_str || '-S%'
         AND SPLIT_PART(o.order_number, '-', 3) ~ '^[0-9]+$';

      EXECUTE format(
        'CREATE SEQUENCE IF NOT EXISTS %I.%I START WITH %s INCREMENT BY 1 MINVALUE 1 CACHE 1',
        'public', v_sequence_name, v_start_value
      );

      INSERT INTO public.order_number_day_sequences (sequence_name, merchant_id, date_str, created_at)
      VALUES (v_sequence_name, v_merchant_id, v_date_str, NOW())
      ON CONFLICT (sequence_name) DO NOTHING;

      v_sequence := format('%I.%I', 'public', v_sequence_name)::regclass;
    END IF;
  END IF;

  v_sequence_number := nextval(v_sequence);

  RETURN 'ORD-' || v_date_str || '-' || LPAD(v_sequence_number::text, 4, '0');
END;
$function$;

GRANT EXECUTE ON FUNCTION public.generate_order_number(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_order_number_internal(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.generate_order_number(uuid, uuid) IS
  'Generates POS order numbers using the location local date for the daily sequence key. Locks (transaction-scoped) only when creating the day''s sequence. See 20260925121500_order_number_xact_lock.sql.';

COMMENT ON FUNCTION public.generate_order_number_internal(uuid, uuid) IS
  'Generates merchant-wide order numbers using the location local date for the daily sequence key. Locks (transaction-scoped) only when creating the day''s sequence. See 20260925121500_order_number_xact_lock.sql.';

-- Registry rows for existing day sequences that have none.
WITH parsed AS (
  SELECT c.relname::text AS sequence_name,
         regexp_match(
           c.relname::text,
           '^ord_seq_([0-9a-f]{32}|[0-9a-f]{8}_[0-9a-f]{4}_[0-9a-f]{4}_[0-9a-f]{4}_[0-9a-f]{12})_([0-9]{8})(_s[0-9]+)?$'
         ) AS m
    FROM pg_catalog.pg_class c
   WHERE c.relnamespace = 'public'::regnamespace
     AND c.relkind = 'S'
     AND c.relname LIKE 'ord\_seq\_%'
)
INSERT INTO public.order_number_day_sequences (sequence_name, merchant_id, date_str, created_at)
SELECT p.sequence_name,
       replace(p.m[1], '_', '')::uuid,
       p.m[2],
       NOW()
  FROM parsed p
  JOIN public.merchants mer ON mer.id = replace(p.m[1], '_', '')::uuid
 WHERE p.m IS NOT NULL
ON CONFLICT (sequence_name) DO NOTHING;

COMMIT;

-- Verify
--   select obj_description('public.generate_order_number(uuid,uuid)'::regprocedure, 'pg_proc');
--     -> mentions 20260925121500
--   select pg_get_functiondef('public.generate_order_number(uuid,uuid)'::regprocedure) !~ 'pg_advisory_lock\(';
--     -> true
--   Unregistered day sequences left (orphaned merchant or unparseable name):
--   select c.relname from pg_class c where c.relkind = 'S' and c.relname like 'ord\_seq\_%'
--      and not exists (select 1 from public.order_number_day_sequences r where r.sequence_name = c.relname);
