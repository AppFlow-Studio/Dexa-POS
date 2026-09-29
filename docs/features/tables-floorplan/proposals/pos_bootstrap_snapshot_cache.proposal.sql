-- ============================================================================
-- get_pos_bootstrap_cached_v1 — per-location cached POS bootstrap envelope
-- ============================================================================
-- PROPOSAL, NOT APPLIED ANYWHERE. Proven on staging inside a rolled-back
-- transaction (2026-09-26). Replaces the draft that was named
-- get_pos_bootstrap_v3: that name is taken on staging AND production by the
-- menu-scheduling feature (20260924120000_pos_schedules_v3.sql), and the
-- draft's overload guard would have dropped it.
--
-- INCIDENT (prod, 2026-09-25 17:00–19:00 UTC)
--   get_pos_bootstrap_v2 costs ~800 ms and tens of thousands of shared buffers
--   per call on a Micro instance. One merchant with 17 online stations called
--   it 468 times in a day: a manager edited the menu all afternoon, every
--   write moved the version watermark, every station's 5-minute probe saw it
--   move and refetched, and the client retried each failure 4 times. Once the
--   database slowed, the calls ran into the statement timeout and the whole
--   platform ran 30–100x slow for 90 minutes.
--
-- FIX
--   Build the envelope ONCE per (location, envelope generation, catalog
--   version) and serve every other station from a jsonb row.
--
-- ENVELOPE GENERATIONS
--   Two client generations exist and must each get the envelope they
--   understand, with the `version` that matches the token they poll:
--     'v2'  get_pos_bootstrap_v2  /  get_pos_menu_version_v2   (shipped)
--     'v3'  get_pos_bootstrap_v3  /  get_pos_menu_version_v3   (scheduling)
--   A client that received the other generation's `version` would see its
--   probe differ forever and refetch on every tick.
--
-- CACHE KEY = <probe token of that generation> || '|cv:' || catalog_versions.version
--   catalog_versions.version is bumped by trg_bump_catalog_version on all 23
--   catalog tables, schedules included. The client-facing `version` string is
--   NOT changed.
--
-- TIMED SNOOZES
--   The row records expires_at = earliest FINITE future snoozed_until at build
--   time; a hit requires expires_at IS NULL OR expires_at > now().
--
-- AUTHORIZATION
--   On a miss the inner builder re-checks the caller; on a HIT nothing else
--   does. So this gate has to be right by itself, and it fails closed when
--   either check returns NULL.
--
-- WHAT THIS DOES NOT DO (deliberately)
--   * No SET statement_timeout (the timer is armed once per statement).
--   * No invalidation trigger (the key compare already forces a rebuild).
--   * No waiter ever builds behind a builder: try-lock, then serve the
--     previous body (stale=true) if there is one, else wait at most 2 s
--     (lock_timeout → 55P03, which the client retries once after jitter).
--
-- ROLLOUT
--   Inert until a POS client calls it. Rollback: file in rollback/.
-- ============================================================================

DO $pre$
BEGIN
  IF to_regclass('public.catalog_versions') IS NULL THEN
    RAISE EXCEPTION 'catalog_versions missing';
  END IF;
  IF to_regprocedure('public.tg_bump_catalog_version()') IS NULL THEN
    RAISE EXCEPTION 'tg_bump_catalog_version() missing';
  END IF;
  IF to_regprocedure('public.get_pos_menu_version_v2(uuid)') IS NULL
     OR to_regprocedure('public.get_pos_bootstrap_v2(uuid)') IS NULL THEN
    RAISE EXCEPTION 'get_pos_menu_version_v2 / get_pos_bootstrap_v2 missing';
  END IF;
END
$pre$;

CREATE TABLE IF NOT EXISTS public.pos_bootstrap_snapshots (
  location_id uuid        NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  envelope    text        NOT NULL CHECK (envelope IN ('v2', 'v3')),
  cache_key   text        NOT NULL,
  version     text        NOT NULL,   -- payload->>'version', for support queries
  payload     jsonb       NOT NULL,   -- the full envelope (TOAST)
  expires_at  timestamptz,            -- earliest FINITE timed snooze baked in; NULL = none
  built_at    timestamptz NOT NULL DEFAULT now(),
  build_ms    integer     NOT NULL,
  PRIMARY KEY (location_id, envelope)
);
ALTER TABLE public.pos_bootstrap_snapshots ALTER COLUMN payload SET COMPRESSION lz4;

COMMENT ON TABLE public.pos_bootstrap_snapshots IS
  'Per-location cache of the POS bootstrap envelope, one row per envelope '
  'generation. Written only by get_pos_bootstrap_cached_v1 under a '
  'per-location advisory lock. Not client-facing.';

ALTER TABLE public.pos_bootstrap_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.pos_bootstrap_snapshots FROM PUBLIC;
REVOKE ALL ON TABLE public.pos_bootstrap_snapshots FROM anon;
REVOKE ALL ON TABLE public.pos_bootstrap_snapshots FROM authenticated;
GRANT ALL ON TABLE public.pos_bootstrap_snapshots TO service_role;

CREATE OR REPLACE FUNCTION public.pos_bootstrap_cache_key_v1(
  p_location_id uuid,
  p_envelope    text,
  OUT o_probe   text,
  OUT o_key     text
)
LANGUAGE plpgsql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_counter bigint;
BEGIN
  -- LOCKSTEP with the probe each client generation polls. Separate
  -- statements, so the v3 probe is only planned when v3 is asked for.
  IF p_envelope = 'v3' THEN
    o_probe := public.get_pos_menu_version_v3(p_location_id);
  ELSE
    o_probe := public.get_pos_menu_version_v2(p_location_id);
  END IF;
  SELECT cv.version INTO v_counter
    FROM public.catalog_versions cv
   WHERE cv.location_id = p_location_id;
  o_key := o_probe || '|cv:' || COALESCE(v_counter, 0)::text;
END
$fn$;

REVOKE ALL ON FUNCTION public.pos_bootstrap_cache_key_v1(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pos_bootstrap_cache_key_v1(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.pos_bootstrap_cache_key_v1(uuid, text) FROM authenticated;

CREATE OR REPLACE FUNCTION public.get_pos_bootstrap_cached_v1(
  p_location_id uuid,
  p_envelope    text    DEFAULT 'v2',
  p_force       boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  c_lock_class      CONSTANT integer := 20260928;
  v_lock_key        integer;
  v_merchant_id     uuid;
  v_caller_merchant uuid;
  v_probe           text;
  v_key             text;
  v_row             public.pos_bootstrap_snapshots%ROWTYPE;
  v_hit             boolean := false;
  v_waited          boolean := false;
  v_stale           boolean := false;
  v_payload         jsonb;
  v_expires_at      timestamptz;
  v_t0              timestamptz;
  v_build_ms        integer;
BEGIN
  IF p_envelope IS NULL OR p_envelope NOT IN ('v2', 'v3') THEN
    RAISE EXCEPTION 'Unknown bootstrap envelope %', p_envelope USING ERRCODE = '22023';
  END IF;

  -- Authorization. Fails closed on a NULL merchant AND on a NULL admin check.
  SELECT l.merchant_id INTO v_merchant_id FROM public.locations l WHERE l.id = p_location_id;
  IF v_merchant_id IS NULL THEN
    RAISE EXCEPTION 'Location % not found', p_location_id USING ERRCODE = '42704';
  END IF;
  v_caller_merchant := public.user_merchant_id();
  IF NOT COALESCE(public.is_dexapos_admin(), false)
     AND (v_caller_merchant IS NULL OR v_caller_merchant IS DISTINCT FROM v_merchant_id) THEN
    RAISE EXCEPTION 'Not authorized for location %', p_location_id USING ERRCODE = '42501';
  END IF;

  v_lock_key := hashtext(p_location_id::text || ':' || p_envelope);

  -- Hot path: no lock, one PK read.
  SELECT k.o_probe, k.o_key INTO v_probe, v_key
    FROM public.pos_bootstrap_cache_key_v1(p_location_id, p_envelope) k;
  IF NOT p_force THEN
    SELECT * INTO v_row FROM public.pos_bootstrap_snapshots s
     WHERE s.location_id = p_location_id AND s.envelope = p_envelope
       AND s.cache_key = v_key
       AND (s.expires_at IS NULL OR s.expires_at > now());
    v_hit := FOUND;
  END IF;

  -- Miss: single-flight per (location, envelope). Nobody builds behind a builder.
  IF NOT v_hit THEN
    IF NOT pg_try_advisory_xact_lock(c_lock_class, v_lock_key) THEN
      IF NOT p_force THEN
        SELECT * INTO v_row FROM public.pos_bootstrap_snapshots s
         WHERE s.location_id = p_location_id AND s.envelope = p_envelope;
        IF FOUND THEN
          v_hit   := true;
          v_stale := true;
        END IF;
      END IF;
      IF NOT v_hit THEN
        PERFORM set_config('lock_timeout', '2s', true);
        PERFORM pg_advisory_xact_lock(c_lock_class, v_lock_key);
        v_waited := true;
      END IF;
    END IF;

    IF NOT v_hit THEN
      -- We hold the lock. The key is computed BEFORE the build it labels:
      -- key-then-build can only over-invalidate.
      SELECT k.o_probe, k.o_key INTO v_probe, v_key
        FROM public.pos_bootstrap_cache_key_v1(p_location_id, p_envelope) k;
      IF NOT p_force THEN
        SELECT * INTO v_row FROM public.pos_bootstrap_snapshots s
         WHERE s.location_id = p_location_id AND s.envelope = p_envelope
           AND s.cache_key = v_key
           AND (s.expires_at IS NULL OR s.expires_at > now());
        v_hit := FOUND;   -- someone finished a build between our reads
      END IF;
    END IF;
  END IF;

  IF v_hit THEN
    RETURN v_row.payload
      || jsonb_build_object(
           'generated_at', now(),
           'synced_at',    now(),
           'bootstrap_cache', jsonb_build_object(
             'hit', true, 'stale', v_stale, 'waited', v_waited,
             'built_at', v_row.built_at, 'build_ms', v_row.build_ms,
             'age_ms', (EXTRACT(EPOCH FROM (now() - v_row.built_at)) * 1000)::bigint,
             'probe_version', v_probe, 'envelope', p_envelope));
  END IF;

  -- Rebuild with the builder of the requested generation.
  v_t0 := clock_timestamp();
  IF p_envelope = 'v3' THEN
    v_payload := public.get_pos_bootstrap_v3(p_location_id);
  ELSE
    v_payload := public.get_pos_bootstrap_v2(p_location_id);
  END IF;
  v_build_ms := GREATEST(0, (EXTRACT(EPOCH FROM (clock_timestamp() - v_t0)) * 1000)::integer);
  IF v_payload IS NULL OR v_payload->>'version' IS NULL THEN
    RAISE EXCEPTION 'bootstrap builder % returned no envelope for %', p_envelope, p_location_id
      USING ERRCODE = 'P0001';
  END IF;

  SELECT min(t.snoozed_until) INTO v_expires_at FROM (
      SELECT lio.snoozed_until FROM public.location_item_overrides lio
       WHERE lio.location_id = p_location_id AND lio.snoozed_until > now() AND isfinite(lio.snoozed_until)
      UNION ALL
      SELECT lmi.snoozed_until FROM public.location_modifier_item_overrides lmi
       WHERE lmi.location_id = p_location_id AND lmi.snoozed_until > now() AND isfinite(lmi.snoozed_until)
      UNION ALL
      SELECT lco.snoozed_until FROM public.location_category_overrides lco
       WHERE lco.location_id = p_location_id AND lco.snoozed_until > now() AND isfinite(lco.snoozed_until)
  ) t;

  INSERT INTO public.pos_bootstrap_snapshots AS s
    (location_id, envelope, cache_key, version, payload, expires_at, built_at, build_ms)
  VALUES
    (p_location_id, p_envelope, v_key, v_payload->>'version', v_payload, v_expires_at, now(), v_build_ms)
  ON CONFLICT (location_id, envelope) DO UPDATE
    SET cache_key = EXCLUDED.cache_key, version = EXCLUDED.version, payload = EXCLUDED.payload,
        expires_at = EXCLUDED.expires_at, built_at = EXCLUDED.built_at,
        build_ms = EXCLUDED.build_ms;

  RETURN v_payload
    || jsonb_build_object('bootstrap_cache', jsonb_build_object(
         'hit', false, 'stale', false, 'waited', v_waited, 'built_at', now(),
         'build_ms', v_build_ms, 'age_ms', 0, 'probe_version', v_probe,
         'envelope', p_envelope));
END
$fn$;

COMMENT ON FUNCTION public.get_pos_bootstrap_cached_v1(uuid, text, boolean) IS
  'Cached POS bootstrap: returns the per-location snapshot of the requested '
  'envelope generation (v2 or v3) when its probe token and the catalog '
  'counter match and no timed snooze has expired; otherwise rebuilds once '
  'under a per-location advisory try-lock. Contenders get the previous body '
  '(stale=true) or wait at most 2 s (55P03). Appends bootstrap_cache. '
  'p_force bypasses the cache. Envelope `version` is unchanged.';
REVOKE ALL ON FUNCTION public.get_pos_bootstrap_cached_v1(uuid, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_pos_bootstrap_cached_v1(uuid, text, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_pos_bootstrap_cached_v1(uuid, text, boolean) TO authenticated, service_role;
