-- Timesheets Part 2: per-location automatic clock-out cutoff.
-- POS uses this function as a safe startup check; pg_cron uses it as the
-- recurring guardrail when the extension is available.

ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS auto_clock_out_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_clock_out_time time without time zone NOT NULL DEFAULT '03:00';

COMMENT ON COLUMN public.locations.auto_clock_out_enabled IS
  'When true, open staff_shifts for this location can be system-closed at the configured local cutoff time.';

COMMENT ON COLUMN public.locations.auto_clock_out_time IS
  'Location-local wall-clock cutoff for auto clock-out. Interpreted with locations.timezone.';

CREATE INDEX IF NOT EXISTS idx_locations_auto_clock_out_enabled
  ON public.locations (id)
  WHERE auto_clock_out_enabled = true;

CREATE INDEX IF NOT EXISTS idx_staff_shifts_auto_clock_out_open
  ON public.staff_shifts (location_id, clock_in_time)
  WHERE clock_out_time IS NULL AND status IN ('active', 'on_break');

CREATE OR REPLACE FUNCTION public._auto_clock_out_close_break_logs(
  p_break_logs jsonb,
  p_cutoff_at timestamptz
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p_break_logs IS NULL THEN NULL
    WHEN jsonb_typeof(p_break_logs) <> 'array' THEN p_break_logs
    ELSE COALESCE(
      (
        SELECT jsonb_agg(
          CASE
            WHEN jsonb_typeof(step1) = 'object'
              AND step1 ? 'end_at'
              AND NULLIF(step1 ->> 'end_at', '') IS NULL
              THEN jsonb_set(step1, '{end_at}', to_jsonb(p_cutoff_at), true)
            ELSE step1
          END
          ORDER BY ordinality
        )
        FROM (
          SELECT
            ordinality,
            CASE
              WHEN jsonb_typeof(value) = 'object'
                AND (value ? 'end' OR NOT (value ? 'end_at'))
                AND NULLIF(value ->> 'end', '') IS NULL
                THEN jsonb_set(value, '{end}', to_jsonb(p_cutoff_at), true)
              ELSE value
            END AS step1
          FROM jsonb_array_elements(p_break_logs) WITH ORDINALITY AS entries(value, ordinality)
        ) normalized
      ),
      '[]'::jsonb
    )
  END;
$$;

COMMENT ON FUNCTION public._auto_clock_out_close_break_logs(jsonb, timestamptz) IS
  'Closes open staff_shifts.break_logs entries at the supplied cutoff. Supports the current {start,end,type} shape and end_at variants.';

CREATE OR REPLACE FUNCTION public.auto_clock_out_stale_shifts(
  p_location_id uuid DEFAULT NULL,
  p_now timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_location record;
  v_requested_merchant_id uuid;
  v_local_now timestamp;
  v_cutoff_local timestamp;
  v_cutoff_at timestamptz;
  v_batch_count integer;
  v_batch_rows jsonb;
  v_total_closed integer := 0;
  v_locations_checked integer := 0;
  v_closed_shifts jsonb := '[]'::jsonb;
BEGIN
  -- Authenticated manual invocations are location-scoped unless Dexa admin.
  -- Cron/service executions do not have auth.uid() and may process all enabled
  -- locations.
  IF auth.uid() IS NOT NULL THEN
    IF p_location_id IS NULL THEN
      IF NOT public.is_dexapos_admin() THEN
        RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'insufficient_privilege';
      END IF;
    ELSE
      SELECT l.merchant_id
        INTO v_requested_merchant_id
      FROM public.locations l
      WHERE l.id = p_location_id;

      IF v_requested_merchant_id IS NULL THEN
        RETURN jsonb_build_object(
          'success', true,
          'locations_checked', 0,
          'closed_count', 0,
          'closed_shifts', '[]'::jsonb,
          'ran_at', p_now
        );
      END IF;

      IF NOT (
        public.is_dexapos_admin()
        OR v_requested_merchant_id = public.user_merchant_id()
      ) THEN
        RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'insufficient_privilege';
      END IF;
    END IF;
  END IF;

  FOR v_location IN
    SELECT
      l.id,
      l.merchant_id,
      COALESCE(NULLIF(l.timezone, ''), 'UTC') AS timezone,
      l.auto_clock_out_time
    FROM public.locations l
    WHERE l.auto_clock_out_enabled = true
      AND (p_location_id IS NULL OR l.id = p_location_id)
  LOOP
    v_locations_checked := v_locations_checked + 1;
    v_local_now := p_now AT TIME ZONE v_location.timezone;
    v_cutoff_local := date_trunc('day', v_local_now) + v_location.auto_clock_out_time;

    IF v_local_now < v_cutoff_local THEN
      v_cutoff_local := v_cutoff_local - interval '1 day';
    END IF;

    v_cutoff_at := v_cutoff_local AT TIME ZONE v_location.timezone;

    WITH candidate AS (
      SELECT ss.*
      FROM public.staff_shifts ss
      WHERE ss.location_id = v_location.id
        AND ss.status IN ('active', 'on_break')
        AND ss.clock_out_time IS NULL
        AND ss.clock_in_time < v_cutoff_at
      FOR UPDATE SKIP LOCKED
    ),
    updated AS (
      UPDATE public.staff_shifts ss
      SET
        status = 'completed',
        clock_out_time = v_cutoff_at,
        break_logs = public._auto_clock_out_close_break_logs(ss.break_logs, v_cutoff_at),
        is_verified = false,
        notes = concat_ws(
          E'\n',
          NULLIF(ss.notes, ''),
          format(
            'Auto clock-out (system) - review required. Cutoff: %s %s.',
            to_char(v_cutoff_local, 'YYYY-MM-DD HH24:MI'),
            v_location.timezone
          )
        ),
        updated_at = p_now
      FROM candidate c
      WHERE ss.id = c.id
      RETURNING
        ss.id,
        ss.merchant_id,
        ss.location_id,
        ss.staff_profile_id,
        c.status AS old_status,
        c.clock_out_time AS old_clock_out_time,
        c.break_logs AS old_break_logs,
        c.is_verified AS old_is_verified,
        c.notes AS old_notes,
        ss.status AS new_status,
        ss.clock_out_time AS new_clock_out_time,
        ss.break_logs AS new_break_logs,
        ss.is_verified AS new_is_verified,
        ss.notes AS new_notes
    ),
    audit_insert AS (
      INSERT INTO public.audit_logs (
        action,
        action_category,
        actor_name,
        actor_role,
        severity,
        resource_type,
        resource_id,
        resource_name,
        staff_profile_id,
        location_id,
        merchant_id,
        changes,
        metadata,
        status
      )
      SELECT
        'shift_auto_closed',
        'timeclock',
        'System',
        'system',
        'info',
        'staff_shift',
        u.id::text,
        'Auto clock-out',
        u.staff_profile_id,
        u.location_id,
        u.merchant_id,
        jsonb_build_object(
          'status', jsonb_build_object('old', u.old_status, 'new', u.new_status),
          'clock_out_time', jsonb_build_object('old', u.old_clock_out_time, 'new', u.new_clock_out_time),
          'break_logs', jsonb_build_object('old', u.old_break_logs, 'new', u.new_break_logs),
          'is_verified', jsonb_build_object('old', u.old_is_verified, 'new', u.new_is_verified),
          'notes', jsonb_build_object('old', u.old_notes, 'new', u.new_notes)
        ),
        jsonb_build_object(
          'source', 'auto_clock_out_stale_shifts',
          'cutoff_at', v_cutoff_at,
          'cutoff_local', v_cutoff_local,
          'timezone', v_location.timezone,
          'job_ran_at', p_now
        ),
        'success'
      FROM updated u
      RETURNING resource_id
    )
    SELECT
      COUNT(u.id)::integer,
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'shift_id', u.id,
            'staff_profile_id', u.staff_profile_id,
            'location_id', u.location_id,
            'cutoff_at', u.new_clock_out_time
          )
          ORDER BY u.id
        ),
        '[]'::jsonb
      )
      INTO v_batch_count, v_batch_rows
    FROM updated u
    LEFT JOIN audit_insert ai ON ai.resource_id::text = u.id::text;

    v_total_closed := v_total_closed + COALESCE(v_batch_count, 0);
    v_closed_shifts := v_closed_shifts || COALESCE(v_batch_rows, '[]'::jsonb);
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'locations_checked', v_locations_checked,
    'closed_count', v_total_closed,
    'closed_shifts', v_closed_shifts,
    'ran_at', p_now
  );
END;
$$;

COMMENT ON FUNCTION public.auto_clock_out_stale_shifts(uuid, timestamptz) IS
  'Closes location-enabled open staff shifts at the most recent past local cutoff, closes open breaks, leaves is_verified=false, and writes shift_auto_closed audit logs. Idempotent by status + clock_out_time filter.';

GRANT EXECUTE ON FUNCTION public.auto_clock_out_stale_shifts(uuid, timestamptz) TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('auto_clock_out_stale_shifts')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto_clock_out_stale_shifts');

    PERFORM cron.schedule(
      'auto_clock_out_stale_shifts',
      '*/15 * * * *',
      $cron$SELECT public.auto_clock_out_stale_shifts();$cron$
    );
  ELSE
    RAISE NOTICE 'pg_cron not installed; auto_clock_out_stale_shifts() must be scheduled outside this migration.';
  END IF;
END $$;
