-- =============================================================================
-- KDS bump: move board-snapshot capture off the bump transaction, serialize
-- concurrent bumps per order, and stop rewriting orders.status on no-op bumps
-- =============================================================================
-- Source: Charcoal Gardenia #S1-0020 (Sept 20 2026). 13x
-- `bulk_update_order_item_status_v2` -> 57014 statement_timeout, and the order
-- left in `preparing` with every item `served`.
--
-- WHAT WAS WRONG
--   1. capture_kds_board_snapshots_for_items ran INSIDE the bump transaction:
--      one full get_kds_tickets_v3 board query + md5 + a ~130 KB insert PER
--      DISPLAY. Measured on prod off-peak: 135 ms / 84k buffers per display;
--      Sept 20 wrote 1,278 snapshots (162 MB) in one day. At service volume
--      the bump blew the authenticated role's 8 s statement_timeout.
--   2. The `orders` row was only locked when p_expected_sync_version was
--      passed -- the tablet never passes it. Two course tickets of the same
--      order bumped 75 ms apart: the second read the first's items before it
--      committed (it was still capturing snapshots), computed `preparing`, and
--      won. order_status_history shows preparing->ready->preparing within
--      75 ms. That is the "stuck in Cooking" ticket.
--   3. Every bump listed `status` in the orders SET clause, so all six
--      `UPDATE OF status` triggers fired on every tap whether or not the
--      status changed.
--
-- WHAT THIS DOES
--   A. kds_board_snapshot_queue + drain_kds_board_snapshot_queue() on pg_cron
--      every 15 s. The bump path only INSERTs queue rows. Snapshot semantics
--      (one board per display, md5 dedupe, append-only ledger) are unchanged;
--      only the moment of capture moves from "inside the bump" to "within
--      ~15 s of it". A failed capture leaves the row queued for the next tick
--      (capped at c_max_attempts so a broken display cannot loop forever).
--   B. bulk_update_order_item_status_v2 always locks the affected orders
--      (ORDER BY id FOR UPDATE) before touching items, with a 2 s
--      lock_timeout so a pile-up fails fast (55P03) instead of eating the
--      statement budget.
--   C. The orders write is split: a full UPDATE only when status / ready_at /
--      sent_to_kitchen_at / started_preparing_at actually change; otherwise a
--      touch of updated_at + sync_version that does NOT list `status`, so the
--      status triggers stay quiet. The touch is deliberate: the KDS handles
--      header-only order broadcasts by refetching, and orders_broadcast_trigger
--      is the only thing that tells the OTHER display a ticket moved. Skipping
--      the write entirely would leave a two-display store out of sync.
--   D. track_order_status_changes becomes UPDATE OF status. Its body already
--      no-ops when status is unchanged; this stops it from being invoked at
--      all on the touch path.
--
-- NOT CHANGED HERE
--   - The arrival snapshot (kds_board_snapshot_at_commit, deferred constraint
--     trigger on the send path) still captures synchronously at COMMIT. Same
--     class of cost on the POS send path; separate ticket.
--   - order_items.kitchen_status CHECK (Done epic owns it).
--   - Money / RLS paths.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Queue
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kds_board_snapshot_queue (
  id bigserial PRIMARY KEY,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  kds_display_id uuid NOT NULL REFERENCES public.kds_displays(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  reason text NOT NULL,
  enqueued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  processed_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  CONSTRAINT kds_board_snapshot_queue_reason_chk
    CHECK (reason IN ('item_arrived', 'item_ready', 'item_served', 'manual'))
);

-- The drain reads "newest unprocessed row per display"; this is exactly that.
CREATE INDEX IF NOT EXISTS idx_kbsq_pending
  ON public.kds_board_snapshot_queue (kds_display_id, id DESC)
  WHERE processed_at IS NULL;

-- Retention delete.
CREATE INDEX IF NOT EXISTS idx_kbsq_processed_at
  ON public.kds_board_snapshot_queue (processed_at)
  WHERE processed_at IS NOT NULL;

-- RLS on, no policies: nothing client-side reads or writes this. Rows are
-- written by SECURITY DEFINER functions and drained by cron.
ALTER TABLE public.kds_board_snapshot_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.kds_board_snapshot_queue FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.kds_board_snapshot_queue TO service_role;

COMMENT ON TABLE public.kds_board_snapshot_queue IS
  'Work queue for KDS board snapshots. The bump RPC enqueues (location, display); drain_kds_board_snapshot_queue() captures on pg_cron so the board query never runs inside a bump.';

-- ---------------------------------------------------------------------------
-- 2. Enqueue instead of capture
-- ---------------------------------------------------------------------------
-- Same signature and same (location, display) fan-out as before, so the bump
-- RPC call site is unchanged. Returns the number of queue rows written.
CREATE OR REPLACE FUNCTION public.capture_kds_board_snapshots_for_items(
  p_order_item_ids uuid[],
  p_reason text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_enqueued integer := 0;
BEGIN
  IF p_order_item_ids IS NULL
     OR array_length(p_order_item_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  -- Still wrapped: instrumentation must never be able to fail a bump. The
  -- insert is trivial now, but a bad FK (display deleted mid-bump) is still
  -- a warning, not a kitchen outage.
  BEGIN
    INSERT INTO public.kds_board_snapshot_queue (
      location_id,
      kds_display_id,
      order_id,
      reason
    )
    SELECT
      o.location_id,
      kis.kds_display_id,
      -- Only attribute the snapshot to an order when the statement touched
      -- exactly one. A multi-order statement gets a NULL order_id rather than
      -- an arbitrary one.
      CASE
        WHEN count(DISTINCT o.id) = 1 THEN (array_agg(DISTINCT o.id))[1]
      END,
      p_reason
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    JOIN public.kds_item_status kis ON kis.order_item_id = oi.id
    WHERE oi.id = ANY(p_order_item_ids)
      AND kis.kds_display_id IS NOT NULL
    GROUP BY o.location_id, kis.kds_display_id;

    GET DIAGNOSTICS v_enqueued = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'capture_kds_board_snapshots_for_items: enqueue failed for reason % (%)',
      p_reason, SQLERRM;
  END;

  RETURN v_enqueued;
END;
$function$;

COMMENT ON FUNCTION public.capture_kds_board_snapshots_for_items(uuid[], text) IS
  'Enqueues one kds_board_snapshot_queue row per distinct (location, kds_display) the given order items routed to. Captured asynchronously by drain_kds_board_snapshot_queue().';

REVOKE ALL ON FUNCTION public.capture_kds_board_snapshots_for_items(uuid[], text)
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Drain
-- ---------------------------------------------------------------------------
-- One capture per display per tick: the newest queued row for a display
-- carries the reason / order attribution, and every older unprocessed row for
-- that display is collapsed into it. This matches the md5 no-op collapse the
-- synchronous path already had (N bumps in 15 s used to produce N boards of
-- which only the distinct ones were kept; now they produce one).
CREATE OR REPLACE FUNCTION public.drain_kds_board_snapshot_queue()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  -- 20 attempts at 15 s = ~5 min of retries before a display is given up on.
  c_max_attempts CONSTANT integer := 20;
  r record;
  v_processed integer := 0;
  v_ok boolean;
  v_err text;
BEGIN
  FOR r IN
    SELECT DISTINCT ON (q.kds_display_id)
      q.id,
      q.location_id,
      q.kds_display_id,
      q.order_id,
      q.reason,
      q.attempts
    FROM public.kds_board_snapshot_queue q
    WHERE q.processed_at IS NULL
    ORDER BY q.kds_display_id, q.id DESC
    LIMIT 50
  LOOP
    v_ok := true;
    v_err := NULL;

    BEGIN
      PERFORM public.capture_kds_board_snapshot(
        r.location_id,
        r.kds_display_id,
        r.reason,
        r.order_id
      );
    EXCEPTION WHEN OTHERS THEN
      v_ok := false;
      v_err := SQLERRM;
      RAISE WARNING 'drain_kds_board_snapshot_queue: capture failed for display % (attempt %): %',
        r.kds_display_id, r.attempts + 1, SQLERRM;
    END;

    IF v_ok OR r.attempts + 1 >= c_max_attempts THEN
      UPDATE public.kds_board_snapshot_queue
         SET processed_at = clock_timestamp(),
             attempts = attempts + 1,
             last_error = v_err
       WHERE kds_display_id = r.kds_display_id
         AND processed_at IS NULL
         AND id <= r.id;
      v_processed := v_processed + 1;
    ELSE
      -- Leave the rows queued for the next tick.
      UPDATE public.kds_board_snapshot_queue
         SET attempts = attempts + 1,
             last_error = v_err
       WHERE kds_display_id = r.kds_display_id
         AND processed_at IS NULL
         AND id <= r.id;
    END IF;
  END LOOP;

  -- Processed rows only exist for the backlog metric; a day is plenty.
  DELETE FROM public.kds_board_snapshot_queue
   WHERE processed_at IS NOT NULL
     AND processed_at < now() - interval '1 day';

  RETURN v_processed;
END;
$function$;

COMMENT ON FUNCTION public.drain_kds_board_snapshot_queue() IS
  'pg_cron worker: captures one board snapshot per KDS display with pending queue rows, marks them processed, and prunes processed rows older than a day.';

REVOKE ALL ON FUNCTION public.drain_kds_board_snapshot_queue()
  FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  PERFORM cron.unschedule('drain-kds-board-snapshot-queue');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'drain-kds-board-snapshot-queue',
  '15 seconds',
  $cron$SELECT public.drain_kds_board_snapshot_queue()$cron$
);

-- ---------------------------------------------------------------------------
-- 4. Status-history trigger only when status is in the SET list
-- ---------------------------------------------------------------------------
-- record_order_status_change() already returns early unless OLD.status IS
-- DISTINCT FROM NEW.status; scoping the trigger keeps it from being invoked on
-- the touch-only bump path below at all.
DROP TRIGGER IF EXISTS track_order_status_changes ON public.orders;
CREATE TRIGGER track_order_status_changes
  BEFORE UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.record_order_status_change();

-- ---------------------------------------------------------------------------
-- 5. Bump RPC
-- ---------------------------------------------------------------------------
-- Body is 20260827170000_restore_board_snapshot_capture.sql (DexaPOS-Website)
-- with the three changes described in the header: always-lock, split orders
-- write, lock_timeout. Item / kds_item_status handling is verbatim.
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

  -- ==== Board-mirror snapshot (HQ KDS mirror, P1) ==========================
  -- Now an enqueue; drain_kds_board_snapshot_queue() captures within ~15 s.
  -- 'sent'/'preparing' arrivals are still covered by the deferred arrival
  -- trigger on the send path.
  IF p_status IN ('ready', 'served') THEN
    PERFORM public.capture_kds_board_snapshots_for_items(
      p_order_item_ids,
      CASE WHEN p_status = 'ready' THEN 'item_ready' ELSE 'item_served' END
    );
  END IF;
  -- ==== END snapshot ========================================================

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

COMMENT ON FUNCTION public.bulk_update_order_item_status_v2(uuid[], text, uuid, uuid, integer) IS
  'KDS bump. Locks affected orders first, writes items/kds_item_status, rewrites orders.status only when it changes (touch otherwise), enqueues a board snapshot. See 20260922120000_kds_bump_snapshot_queue.sql.';
