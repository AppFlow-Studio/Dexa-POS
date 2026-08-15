-- =============================================================================
-- Wave 2b — get_kds_tickets_for_order_v1: order-scoped KDS refresh
-- =============================================================================
-- Source: Notion [POS-PERF] AUD-8, approach step 2 ("order-scoped refresh").
--
-- PROBLEM
--   Wave 2 (get_kds_tickets_v3) made each board read ~27% cheaper. It did not
--   reduce how MANY board reads happen, and the call count is the larger half of
--   the bill: 429,637 + 127,137 = 556,774 calls / 21,706 s of DB time.
--
--   Every header-only order broadcast makes EVERY subscribed KDS station refetch
--   the ENTIRE board (stores/useKDSStore.ts _processOrderBroadcast -> scheduleRefetch
--   -> get_kds_tickets_v3(p_location_id)). One cook tapping Rush on one ticket
--   costs N stations x one whole-location aggregate. The cost of a single-ticket
--   change scales with the location's total open-order volume AND with the number
--   of displays on the floor.
--
--   Worse, that refresh is scheduled through ONE shared trailing timer. Every
--   relevant event clears and re-arms it, so a sustained event stream (above
--   roughly 3.3 relevant events/second) can prevent the quiet window from ever
--   arriving and starve the board of authoritative data entirely.
--
-- FIX
--   Give the client a way to ask for exactly the tickets it needs: the ones
--   belonging to the order that actually changed. The board is then patched in
--   place instead of rebuilt.
--
--   Rush / prioritise / item-status / void-ack propagate cross-station on a read
--   whose cost is O(one order) instead of O(location), and the client can key the
--   debounce per order instead of sharing one global timer.
--
-- WHY THIS IS A NEW FUNCTION AND NOT A PARAMETER ON v3
--   v3 is mid-promotion to prod and has read-only equivalence evidence attached
--   to its exact body. Adding a parameter would invalidate that evidence and force
--   a re-verification of the board path to ship a refresh-path optimisation.
--
-- WHY p_location_id IS STILL REQUIRED
--   This is SECURITY DEFINER. Keying only on p_order_id would make it an oracle
--   for reading any order's kitchen contents — items, modifiers, customer name,
--   server name — across every merchant on the platform, by uuid alone. The
--   location predicate is retained purely as the tenant guard; the caller always
--   has it (the broadcast payload carries order.location_id).
--
-- OUTPUT EQUIVALENCE
--   The body is get_kds_tickets_v3 verbatim plus one equality predicate on the
--   order id, applied in both the scoped-item join and the outer WHERE. Adding a
--   conjunct to both filters can only remove whole orders; it cannot change any
--   surviving group's membership, aggregates, or JSON. Therefore for any order O
--   at location L:
--
--     get_kds_tickets_for_order_v1(L, O, S, D)
--       == the elements of get_kds_tickets_v3(L, S, D) whose order_id = O
--
--   including ticket_id (floor-millisecond form, guarding the #S1-0013 collision
--   fix), the rush/prioritised sort, and every field ordering.
--
-- MAINTENANCE
--   This body is a deliberate copy of v3's. The two MUST be edited together —
--   a field added to one and not the other makes a broadcast-patched ticket
--   differ from the same ticket after a full board refresh, which surfaces as
--   cards that change shape when the board polls. See the equivalence harness
--   note in the deploy checklist.
--
-- ROLLOUT
--   Additive. Nothing calls it until the client ships, and the client falls back
--   to the full-board refetch when this function is absent (PGRST202/42883, via
--   lib/network/rpcVersionFallback.ts), so deploy order does not matter.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_kds_tickets_for_order_v1(
  p_location_id uuid,
  p_order_id uuid,
  p_statuses text[] DEFAULT ARRAY['sent'::text, 'preparing'::text, 'ready'::text],
  p_kds_display_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_result jsonb;
  v_show_server_name boolean := true;
  v_done_retention interval := interval '1 hour';
BEGIN
  SELECT COALESCE(d.show_server_name, true)
    INTO v_show_server_name
    FROM public.kds_displays d
   WHERE d.id = p_kds_display_id;

  v_show_server_name := COALESCE(v_show_server_name, true);

  SELECT COALESCE(
    jsonb_agg(
      ticket
      ORDER BY
        (
          COALESCE((ticket->>'any_rush')::boolean, false)
          OR COALESCE((ticket->>'prioritized')::boolean, false)
        ) DESC,
        ticket->>'start_time' ASC NULLS LAST
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM (
    SELECT jsonb_build_object(
      -- ticket_id MUST use floor-MILLISECOND precision. Seconds truncation is the
      -- #S1-0013 collision bug: two batches fired within the same second collapse
      -- into one ticket card and items visibly vanish from the KDS. This must stay
      -- byte-identical to v3 or a broadcast-patched ticket will not match the same
      -- ticket delivered by a full board refresh.
      'ticket_id', o.id::text || '_c' || COALESCE(oi_grouped.course_number, 1)::text
        || '_f' || COALESCE(floor(EXTRACT(EPOCH FROM oi_grouped.fire_time::timestamptz) * 1000)::bigint::text, '0'),
      'order_id', o.id,
      'db_order_id', o.id,
      'order_number', o.order_number,
      'display_number', o.display_number,
      'course_number', COALESCE(oi_grouped.course_number, 1),
      'status', CASE
        WHEN oi_grouped.any_done_items AND NOT oi_grouped.any_active_items THEN 'done'
        WHEN NOT oi_grouped.any_active_items THEN 'cooking'
        WHEN oi_grouped.all_active_ready THEN 'ready'
        WHEN oi_grouped.any_active_sent THEN 'pending'
        ELSE 'cooking'
      END,
      'order_type', o.order_type,
      'order_source', o.order_source,
      'delivery_platform', COALESCE(o.delivery_platform, o.metadata->>'delivery_company'),
      'platform_order_number', o.platform_order_number,
      'server_id', COALESCE(o.created_by_staff_id, o.assigned_server_id),
      'server_name', CASE
        WHEN v_show_server_name THEN
          COALESCE(
            sp.display_name,
            NULLIF(TRIM(sp.first_name || ' ' || sp.last_name), '')
          )
        ELSE NULL
      END,
      'table_name', o.table_number,
      'customer_name', o.customer_name,
      'order_notes', o.special_instructions,
      'start_time', COALESCE(oi_grouped.fire_time::timestamptz, o.sent_to_kitchen_at, o.created_at),
      'ready_time', oi_grouped.ready_time,
      'done_time', oi_grouped.done_time,
      'item_count', oi_grouped.visible_item_count,
      'any_rush', oi_grouped.any_rush,
      'prioritized', oi_grouped.any_prioritized,
      'session_id', o.session_id,
      'items', oi_grouped.items_json
    ) AS ticket
    FROM public.orders o
    LEFT JOIN public.staff_profiles sp
      ON sp.id = COALESCE(o.created_by_staff_id, o.assigned_server_id)
    INNER JOIN (
      SELECT
        oi.order_id,
        COALESCE(oi.course_number, 1) AS course_number,
        bool_or(
          COALESCE(oi.is_voided, false) = false
          AND COALESCE(oi.refunded_quantity, 0) < oi.quantity
          AND oi.kitchen_status = ANY(p_statuses)
        ) AS any_active_items,
        bool_or(
          COALESCE(oi.is_voided, false) = false
          AND COALESCE(oi.refunded_quantity, 0) < oi.quantity
          AND oi.kitchen_status = 'served'
          AND COALESCE(oi.updated_at, oi.completed_at) >= now() - v_done_retention
        ) AS any_done_items,
        bool_and(
          CASE
            WHEN COALESCE(oi.is_voided, false) = false
              AND COALESCE(oi.refunded_quantity, 0) < oi.quantity
              AND oi.kitchen_status = ANY(p_statuses)
            THEN oi.kitchen_status = 'ready'
            ELSE true
          END
        ) AS all_active_ready,
        bool_or(
          COALESCE(oi.is_voided, false) = false
          AND COALESCE(oi.refunded_quantity, 0) < oi.quantity
          AND oi.kitchen_status = 'sent'
        ) AS any_active_sent,
        SUM(
          CASE
            WHEN COALESCE(oi.is_voided, false) = false
              AND COALESCE(oi.refunded_quantity, 0) < oi.quantity
              AND (
                oi.kitchen_status = ANY(p_statuses)
                OR (
                  oi.kitchen_status = 'served'
                  AND COALESCE(oi.updated_at, oi.completed_at) >= now() - v_done_retention
                )
              )
            THEN GREATEST(oi.quantity - COALESCE(oi.refunded_quantity, 0), 0)
            ELSE 0
          END
        )::int AS visible_item_count,
        oi.fire_time,
        MAX(oi.completed_at) FILTER (
          WHERE COALESCE(oi.is_voided, false) = false
            AND COALESCE(oi.refunded_quantity, 0) < oi.quantity
            AND oi.kitchen_status = 'ready'
        ) AS ready_time,
        MAX(COALESCE(oi.updated_at, oi.completed_at)) FILTER (
          WHERE COALESCE(oi.is_voided, false) = false
            AND COALESCE(oi.refunded_quantity, 0) < oi.quantity
            AND oi.kitchen_status = 'served'
            AND COALESCE(oi.updated_at, oi.completed_at) >= now() - v_done_retention
        ) AS done_time,
        bool_or(COALESCE(oi.rush, false)) AS any_rush,
        bool_or(COALESCE(oi.is_prioritized, false)) AS any_prioritized,
        bool_or(
          COALESCE(oi.is_voided, false) = true
          AND NOT EXISTS (
            SELECT 1 FROM public.kds_item_status ack
            WHERE ack.order_item_id = oi.id
              AND ack.acknowledged_at IS NOT NULL
              AND (p_kds_display_id IS NULL OR ack.kds_display_id = p_kds_display_id)
          )
        ) AS has_unacknowledged_void_notice,
        bool_or(
          COALESCE(oi.refunded_quantity, 0) > 0
          AND oi.kitchen_status NOT IN ('served', 'done', 'completed')
          AND NOT EXISTS (
            SELECT 1 FROM public.kds_item_status ack
            WHERE ack.order_item_id = oi.id
              AND ack.acknowledged_at IS NOT NULL
              AND (p_kds_display_id IS NULL OR ack.kds_display_id = p_kds_display_id)
          )
        ) AS has_unacknowledged_refund_notice,
        jsonb_agg(
          jsonb_build_object(
            'id', oi.id,
            'name', COALESCE(oi.open_item_name, oi.item_name),
            'quantity', oi.quantity,
            'seat_number', oi.seat_number,
            'kitchen_status', COALESCE(oi.kitchen_status, 'sent'),
            'special_instructions', oi.special_instructions,
            'category_name', oi.category_name,
            'category_id', oi.category_id,
            'menu_name', oi.menu_name,
            'menu_id', oi.menu_id,
            'prep_station', oi.prep_station,
            'rush', COALESCE(oi.rush, false),
            'is_prioritized', COALESCE(oi.is_prioritized, false),
            'is_to_go', COALESCE(oi.is_to_go, false),
            'fire_time', oi.fire_time::timestamptz,
            'is_voided', COALESCE(oi.is_voided, false),
            'acknowledged', EXISTS (
              SELECT 1 FROM public.kds_item_status ack
              WHERE ack.order_item_id = oi.id
                AND ack.acknowledged_at IS NOT NULL
                AND (p_kds_display_id IS NULL OR ack.kds_display_id = p_kds_display_id)
            ),
            'is_refunded', COALESCE(oi.refunded_quantity, 0) > 0,
            'refunded_quantity', COALESCE(oi.refunded_quantity, 0),
            'modifiers', (
              SELECT COALESCE(
                jsonb_agg(
                  jsonb_build_object(
                    'modifier_name', oim.modifier_name,
                    'modifier_group_name', oim.modifier_group_name,
                    'price_modifier', oim.price_modifier,
                    'is_no', COALESCE(oim.is_no, false)
                  )
                ),
                '[]'::jsonb
              )
              FROM public.order_item_modifiers oim
              WHERE oim.order_item_id = oi.id
            )
          )
          ORDER BY oi.id ASC
        ) AS items_json
      FROM public.order_items oi
      -- ===================================================================
      -- WAVE 2 scoping (inherited from v3) + WAVE 2b order predicate.
      -- oi.order_id = p_order_id is the whole delta from v3: it turns an
      -- O(location) aggregate into an O(one order) index lookup. The location
      -- and status predicates are retained unchanged — location as the tenant
      -- guard, status as the same superset of the outer WHERE that v3 proved.
      -- ===================================================================
      JOIN public.orders scoped_o
        ON scoped_o.id = oi.order_id
       AND scoped_o.id = p_order_id
       AND scoped_o.location_id = p_location_id
       AND scoped_o.status NOT IN ('cancelled', 'void', 'refunded')
      LEFT JOIN public.kds_item_status kis
        ON kis.order_item_id = oi.id
        AND p_kds_display_id IS NOT NULL
        AND kis.kds_display_id = p_kds_display_id
      WHERE (
          oi.kitchen_status IS NOT NULL
          OR COALESCE(oi.is_voided, false) = true
        )
        AND (
          (
            COALESCE(oi.is_voided, false) = false
            AND COALESCE(oi.refunded_quantity, 0) < oi.quantity
            AND oi.kitchen_status = ANY(p_statuses)
            AND (
              p_kds_display_id IS NULL
              OR (kis.id IS NOT NULL AND kis.status NOT IN ('cancelled', 'completed'))
            )
          )
          OR (
            COALESCE(oi.is_voided, false) = false
            AND COALESCE(oi.refunded_quantity, 0) < oi.quantity
            AND oi.kitchen_status = 'served'
            AND COALESCE(oi.updated_at, oi.completed_at) >= now() - v_done_retention
            AND (
              p_kds_display_id IS NULL
              OR kis.id IS NOT NULL
            )
          )
          OR (
            COALESCE(oi.is_voided, false) = true
            AND NOT EXISTS (
              SELECT 1 FROM public.kds_item_status ack
              WHERE ack.order_item_id = oi.id
                AND ack.acknowledged_at IS NOT NULL
                AND (p_kds_display_id IS NULL OR ack.kds_display_id = p_kds_display_id)
            )
          )
          OR (
            COALESCE(oi.refunded_quantity, 0) > 0
            AND oi.kitchen_status NOT IN ('served', 'done', 'completed')
            AND NOT EXISTS (
              SELECT 1 FROM public.kds_item_status ack
              WHERE ack.order_item_id = oi.id
                AND ack.acknowledged_at IS NOT NULL
                AND (p_kds_display_id IS NULL OR ack.kds_display_id = p_kds_display_id)
            )
          )
        )
      GROUP BY oi.order_id, COALESCE(oi.course_number, 1), oi.fire_time
    ) oi_grouped ON oi_grouped.order_id = o.id
    WHERE o.id = p_order_id
      AND o.location_id = p_location_id
      AND (
        o.status NOT IN ('completed', 'cancelled', 'void', 'refunded')
        OR (o.status = 'completed' AND oi_grouped.any_done_items)
      )
      AND (
        oi_grouped.any_active_items
        OR oi_grouped.any_done_items
        OR oi_grouped.has_unacknowledged_void_notice
        OR oi_grouped.has_unacknowledged_refund_notice
      )
  ) sub;

  RETURN v_result;
END;
$function$;

COMMENT ON FUNCTION public.get_kds_tickets_for_order_v1(uuid, uuid, text[], uuid) IS
  'KDS tickets for ONE order. Returns exactly the elements get_kds_tickets_v3 '
  'would return for that order, so the client can patch the board on a broadcast '
  'instead of refetching the whole location. p_location_id is the tenant guard '
  'and is required. Body is a copy of v3 plus an order predicate — edit both '
  'together. See AUD-8 approach step 2.';

REVOKE ALL ON FUNCTION public.get_kds_tickets_for_order_v1(uuid, uuid, text[], uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_kds_tickets_for_order_v1(uuid, uuid, text[], uuid)
  TO authenticated, service_role;

-- =============================================================================
-- EQUIVALENCE CHECK (read-only, run on staging before the client ships).
-- Proves the per-order result is exactly the v3 sub-array for that order, for
-- every currently-visible order at a location. Expect zero rows.
--
--   WITH board AS (
--     SELECT jsonb_array_elements(
--              public.get_kds_tickets_v3('<location-uuid>'::uuid)
--            ) AS ticket
--   ),
--   by_order AS (
--     SELECT (ticket->>'order_id')::uuid AS order_id,
--            jsonb_agg(ticket ORDER BY ticket->>'ticket_id') AS from_board
--     FROM board GROUP BY 1
--   ),
--   scoped AS (
--     SELECT b.order_id,
--            b.from_board,
--            (SELECT jsonb_agg(t ORDER BY t->>'ticket_id')
--               FROM jsonb_array_elements(
--                      public.get_kds_tickets_for_order_v1('<location-uuid>'::uuid, b.order_id)
--                    ) t) AS from_scoped
--     FROM by_order b
--   )
--   SELECT order_id, from_board, from_scoped
--   FROM scoped
--   WHERE from_board IS DISTINCT FROM from_scoped;
--
-- Repeat with a p_kds_display_id argument on BOTH calls for each active display.
--
-- ROLLBACK: DROP FUNCTION IF EXISTS public.get_kds_tickets_for_order_v1(uuid, uuid, text[], uuid);
-- v3 and v2 are untouched; the client falls back to the full-board refetch.
-- =============================================================================
