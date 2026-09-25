-- =============================================================================
-- Remove the KDS board snapshot feature
-- =============================================================================
-- Plan: Dexa-POS/docs/engineering/database/SUPABASE-CONNECTIONS-AND-STORAGE-2026-09-24.md,
-- Phase 2 (decision: remove the feature entirely).
--
-- WHY
--   kds_board_snapshots is 1.09 GB, 45% of the database. Its capture ran a full
--   get_kds_tickets_v3 board query + a ~130 KB insert per KDS display on every
--   send (deferred arrival trigger) and every ready/served bump (queue + a
--   15-second pg_cron drain = 5,760 cron connections a day). The only consumer
--   was the HQ support replay timeline, which the Website no longer calls.
--
-- WHAT STAYS (none of these read kds_board_snapshots)
--   hq_get_kds_board_mirror_v1 (live board), send ledger, unsent items, device
--   truth (kds_device_snapshots, purge_kds_device_truth, kds-device-truth-purge),
--   divergence list, routing health, protect_kds_trace_ledger() (shared).
--
-- ORDER (one transaction)
--   1. Unschedule the drain and purge cron jobs.
--   2. Drop the arrival triggers on order_items, then their trigger function.
--   3. Replace bulk_update_order_item_status_v2 BEFORE dropping the capture
--      functions: PL/pgSQL does not track dependencies, so dropping
--      capture_kds_board_snapshots_for_items while the old body still calls it
--      would make every ready/served bump fail with 42883.
--   4. Drop the snapshot functions, then the two tables (no CASCADE, so an
--      unexpected dependent object fails the migration instead of vanishing).
--
-- Mirrored byte-identical into Dexa-POS/supabase/migrations/.
-- Rollback: rollback/20260925120000_remove_kds_board_snapshots_rollback.sql
-- (restores the objects; snapshot history is gone by decision).
-- Run outside service hours: DROP TRIGGER on order_items takes a brief
-- ACCESS EXCLUSIVE lock. On 55P03 (lock timeout) just re-run.
-- =============================================================================

BEGIN;

SET LOCAL lock_timeout = '3s';

-- 1. Cron --------------------------------------------------------------------
SELECT cron.unschedule(jobid)
  FROM cron.job
 WHERE jobname IN ('drain-kds-board-snapshot-queue', 'kds-board-snapshot-purge');

-- 2. Arrival triggers (send path) ---------------------------------------------
DROP TRIGGER IF EXISTS trg_kds_board_snapshot_arrival_insert ON public.order_items;
DROP TRIGGER IF EXISTS trg_kds_board_snapshot_arrival_update ON public.order_items;
-- Superseded names from 20260827150000; already gone where that ran in full.
DROP TRIGGER IF EXISTS trg_kds_board_snapshot_after_fire_insert ON public.order_items;
DROP TRIGGER IF EXISTS trg_kds_board_snapshot_after_fire_update ON public.order_items;

DROP FUNCTION IF EXISTS public.kds_board_snapshot_at_commit();
DROP FUNCTION IF EXISTS public.kds_board_snapshot_after_fire_insert();
DROP FUNCTION IF EXISTS public.kds_board_snapshot_after_fire_update();

-- 3. Bump RPC ------------------------------------------------------------------
-- Body is 20260922120000_kds_bump_snapshot_queue.sql verbatim, minus the
-- "Board-mirror snapshot" block. Kept: the ORDER BY id FOR UPDATE order lock,
-- the 2 s lock_timeout, and the orders UPDATE / touch split other KDS displays
-- rely on for their broadcast.
CREATE OR REPLACE FUNCTION public.bulk_update_order_item_status_v2(
  p_order_item_ids uuid[],
  p_status text,
  p_staff_id uuid DEFAULT NULL,
  p_idempotency_key uuid DEFAULT NULL,
  p_expected_sync_version integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
-- Function-scoped, restored on exit. A same-order pile-up now fails in 2 s
-- with 55P03 (lock_not_available) instead of holding the 8 s statement budget.
SET lock_timeout TO '2s'
AS $function$
DECLARE
  v_cached jsonb;
  v_affected_order_ids uuid[];
  v_mismatch_count integer;
  v_requested_count integer := COALESCE(array_length(p_order_item_ids, 1), 0);
  v_updated_count integer := 0;
  v_kds_updated_count integer := 0;
  v_now timestamptz := now();
  v_result jsonb;
BEGIN
  IF p_order_item_ids IS NULL OR array_length(p_order_item_ids, 1) IS NULL THEN
    RETURN jsonb_build_object(
      'updated_count', 0,
      'requested_count', 0,
      'kds_updated_count', 0,
      'affected_order_ids', '[]'::jsonb,
      'status', p_status
    );
  END IF;

  IF p_status NOT IN ('sent', 'preparing', 'ready', 'served') THEN
    RAISE EXCEPTION
      'Invalid kitchen status: %. Expected sent, preparing, ready, or served.',
      p_status
      USING ERRCODE = '22023';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    v_cached := public._idempotency_claim(
      p_idempotency_key,
      'bulk_update_order_item_status_v2'
    );
    IF v_cached IS NOT NULL THEN
      RETURN v_cached || jsonb_build_object('requested_count', v_requested_count);
    END IF;
  END IF;

  SELECT array_agg(DISTINCT order_id)
    INTO v_affected_order_ids
    FROM public.order_items
   WHERE id = ANY(p_order_item_ids);

  -- Serialize concurrent bumps on the same order(s) BEFORE reading or writing
  -- any item. Without this, two course tickets of one order bumped within the
  -- other's transaction window each compute the order status from a snapshot
  -- that lacks the other's items, and the later commit wins with a stale
  -- answer (Charcoal #S1-0020: ready -> preparing 75 ms after preparing ->
  -- ready). ORDER BY id keeps multi-order bumps from deadlocking each other.
  IF v_affected_order_ids IS NOT NULL THEN
    PERFORM 1
      FROM public.orders
     WHERE id = ANY(v_affected_order_ids)
     ORDER BY id
       FOR UPDATE;

    IF p_expected_sync_version IS NOT NULL THEN
      SELECT count(*)
        INTO v_mismatch_count
        FROM public.orders
       WHERE id = ANY(v_affected_order_ids)
         AND COALESCE(sync_version, 0) <> p_expected_sync_version;

      IF v_mismatch_count > 0 THEN
        RAISE EXCEPTION
          'sync_version mismatch - expected %, refusing to update % order(s)',
          p_expected_sync_version,
          v_mismatch_count
          USING ERRCODE = 'P0004',
                HINT = 'Re-fetch the order, then retry with the current sync_version.';
      END IF;
    END IF;
  END IF;

  UPDATE public.order_items
     SET kitchen_status = p_status,
         updated_at = v_now,
         fire_time = CASE
           WHEN p_status = 'sent' THEN COALESCE(fire_time, v_now)
           WHEN p_status = 'preparing' THEN COALESCE(fire_time, v_now)
           ELSE fire_time
         END,
         sent_to_kitchen_at = CASE
           WHEN p_status IN ('sent', 'preparing')
             THEN COALESCE(sent_to_kitchen_at, v_now)
           ELSE sent_to_kitchen_at
         END,
         started_preparing_at = CASE
           WHEN p_status = 'sent' THEN NULL
           WHEN p_status = 'preparing'
             THEN COALESCE(started_preparing_at, v_now)
           ELSE started_preparing_at
         END,
         completed_at = CASE
           WHEN p_status = 'sent' THEN NULL
           WHEN p_status IN ('ready', 'served')
             THEN COALESCE(completed_at, v_now)
           ELSE completed_at
         END
   WHERE id = ANY(p_order_item_ids);

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  IF p_status = 'sent' THEN
    UPDATE public.kds_item_status
       SET status = 'pending',
           started_at = NULL,
           completed_at = NULL,
           bumped_at = NULL,
           bumped_by = NULL
     WHERE order_item_id = ANY(p_order_item_ids)
       AND status <> 'cancelled';
    GET DIAGNOSTICS v_kds_updated_count = ROW_COUNT;

  ELSIF p_status = 'preparing' THEN
    UPDATE public.kds_item_status
       SET status = 'pending',
           started_at = COALESCE(started_at, v_now),
           completed_at = NULL,
           bumped_at = NULL,
           bumped_by = NULL
     WHERE order_item_id = ANY(p_order_item_ids)
       AND status <> 'cancelled';
    GET DIAGNOSTICS v_kds_updated_count = ROW_COUNT;

  ELSIF p_status = 'ready' THEN
    UPDATE public.kds_item_status
       SET status = 'pending',
           completed_at = COALESCE(completed_at, v_now),
           bumped_at = NULL,
           bumped_by = NULL
     WHERE order_item_id = ANY(p_order_item_ids)
       AND status <> 'cancelled';
    GET DIAGNOSTICS v_kds_updated_count = ROW_COUNT;

  ELSIF p_status = 'served' THEN
    UPDATE public.kds_item_status
       SET status = 'completed',
           completed_at = COALESCE(completed_at, v_now),
           bumped_at = v_now,
           bumped_by = p_staff_id
     WHERE order_item_id = ANY(p_order_item_ids)
       AND status NOT IN ('cancelled', 'completed');
    GET DIAGNOSTICS v_kds_updated_count = ROW_COUNT;
  END IF;

  IF v_affected_order_ids IS NOT NULL THEN
    -- `target` is the row the old single UPDATE would have written. `changed`
    -- writes it only where something status-related differs (that is the
    -- statement the UPDATE OF status triggers see). Everything else gets the
    -- touch so orders_broadcast_trigger still tells the other displays / POS
    -- to refetch. The two writes are disjoint by construction.
    WITH agg AS (
      SELECT
        oi.order_id,
        bool_and(oi.kitchen_status IN ('ready', 'served')) AS all_ready_or_served,
        bool_or(oi.kitchen_status IN ('preparing', 'ready', 'served')) AS any_beyond_sent
      FROM public.order_items oi
      WHERE oi.order_id = ANY(v_affected_order_ids)
        AND COALESCE(oi.is_voided, false) = false
        AND COALESCE(oi.refunded_quantity, 0) < oi.quantity
        AND oi.kitchen_status IS NOT NULL
      GROUP BY oi.order_id
    ),
    target AS (
      SELECT
        o.id,
        CASE
          WHEN p_status IN ('sent', 'preparing')
            THEN COALESCE(o.sent_to_kitchen_at, v_now)
          ELSE o.sent_to_kitchen_at
        END AS sent_to_kitchen_at,
        CASE
          WHEN p_status = 'preparing'
            THEN COALESCE(o.started_preparing_at, v_now)
          ELSE o.started_preparing_at
        END AS started_preparing_at,
        CASE
          WHEN agg.all_ready_or_served
               AND o.status::text IN ('sent_to_kitchen', 'preparing')
            THEN COALESCE(o.ready_at, v_now)
          WHEN NOT agg.all_ready_or_served
               AND p_status IN ('sent', 'preparing')
            THEN NULL
          ELSE o.ready_at
        END AS ready_at,
        CASE
          WHEN p_status = 'sent'
               AND o.status::text IN ('ready', 'preparing')
            THEN 'sent_to_kitchen'::public.order_status
          WHEN o.status::text NOT IN ('sent_to_kitchen', 'preparing', 'ready')
            THEN o.status
          WHEN agg.all_ready_or_served THEN 'ready'::public.order_status
          WHEN agg.any_beyond_sent THEN 'preparing'::public.order_status
          ELSE 'sent_to_kitchen'::public.order_status
        END AS status
      FROM public.orders o
      JOIN agg ON agg.order_id = o.id
    ),
    changed AS (
      UPDATE public.orders o
         SET status = t.status,
             ready_at = t.ready_at,
             sent_to_kitchen_at = t.sent_to_kitchen_at,
             started_preparing_at = t.started_preparing_at,
             sync_version = COALESCE(o.sync_version, 0) + 1,
             updated_at = v_now
        FROM target t
       WHERE o.id = t.id
         AND (
           o.status IS DISTINCT FROM t.status
           OR o.ready_at IS DISTINCT FROM t.ready_at
           OR o.sent_to_kitchen_at IS DISTINCT FROM t.sent_to_kitchen_at
           OR o.started_preparing_at IS DISTINCT FROM t.started_preparing_at
         )
      RETURNING o.id
    )
    UPDATE public.orders o
       SET sync_version = COALESCE(o.sync_version, 0) + 1,
           updated_at = v_now
     WHERE o.id IN (SELECT t.id FROM target t)
       AND NOT EXISTS (SELECT 1 FROM changed c WHERE c.id = o.id);
  END IF;


  v_result := jsonb_build_object(
    'updated_count', v_updated_count,
    'requested_count', v_requested_count,
    'kds_updated_count', v_kds_updated_count,
    'affected_order_ids', COALESCE(to_jsonb(v_affected_order_ids), '[]'::jsonb),
    'status', p_status
  );

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM public._idempotency_complete(
      p_idempotency_key,
      'bulk_update_order_item_status_v2',
      v_result
    );
  END IF;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.bulk_update_order_item_status_v2(
  uuid[], text, uuid, uuid, integer
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bulk_update_order_item_status_v2(
  uuid[], text, uuid, uuid, integer
) TO authenticated, service_role;

COMMENT ON FUNCTION public.bulk_update_order_item_status_v2(uuid[], text, uuid, uuid, integer) IS
  'KDS bump. Locks affected orders first, writes items/kds_item_status, rewrites orders.status only when it changes (touch otherwise). See 20260922120000_kds_bump_snapshot_queue.sql and 20260925120000_remove_kds_board_snapshots.sql.';

-- 4. Snapshot functions and tables ---------------------------------------------
DROP FUNCTION IF EXISTS public.drain_kds_board_snapshot_queue();
DROP FUNCTION IF EXISTS public.purge_kds_board_snapshots();
DROP FUNCTION IF EXISTS public.capture_kds_board_snapshots_for_items(uuid[], text);
DROP FUNCTION IF EXISTS public.capture_kds_board_snapshot(uuid, uuid, text, uuid);
DROP FUNCTION IF EXISTS public.hq_get_kds_board_snapshot_v1(uuid);
DROP FUNCTION IF EXISTS public.hq_get_kds_board_snapshots_v1(uuid, timestamptz, timestamptz, integer);

DROP TABLE IF EXISTS public.kds_board_snapshot_queue;
DROP TABLE IF EXISTS public.kds_board_snapshots;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Verify (each returns no rows / nulls):
--   select proname from pg_proc where prosrc ilike '%kds_board_snapshot%';
--   select jobname from cron.job where jobname ilike '%kds-board-snapshot%' or jobname = 'drain-kds-board-snapshot-queue';
--   select tgname from pg_trigger where tgname ilike '%kds_board_snapshot%';
--   select to_regclass('public.kds_board_snapshots'), to_regclass('public.kds_board_snapshot_queue');
-- And the bump RPC kept its lock and timeout:
--   select d ~ 'lock_timeout' as has_lock_timeout, d ~ 'ORDER BY id\s+FOR UPDATE' as has_order_lock, d !~ 'capture_' as no_capture
--     from pg_get_functiondef('public.bulk_update_order_item_status_v2(uuid[],text,uuid,uuid,integer)'::regprocedure) d;
