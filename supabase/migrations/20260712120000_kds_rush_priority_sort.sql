-- get_kds_tickets_v2: elevate rushed and prioritized tickets to the top band.
--
-- Ticket: [POS-KDS] Rushed/prioritized tickets don't sort to the top of the queue.
-- Scope:
--   - Add ticket-level any_rush to the payload.
--   - Sort active tickets by (any_rush OR prioritized) DESC, then start_time ASC.
--   - Preserve existing server_name, ready_time, is_to_go, void/refund notice,
--     display-scoped acknowledgement, SECURITY DEFINER, and pinned search_path.

CREATE OR REPLACE FUNCTION public.get_kds_tickets_v2(
  p_location_id uuid,
  p_statuses text[] DEFAULT ARRAY['sent'::text, 'preparing'::text, 'ready'::text],
  p_kds_display_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_result jsonb;
  v_show_server_name boolean := true;
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
      'ticket_id', o.id::text || '_c' || COALESCE(oi_grouped.course_number, 1)::text
        || '_f' || COALESCE(EXTRACT(EPOCH FROM oi_grouped.fire_time::timestamptz)::bigint::text, '0'),
      'order_id', o.id,
      'db_order_id', o.id,
      'order_number', o.order_number,
      'display_number', o.display_number,
      'course_number', COALESCE(oi_grouped.course_number, 1),
      'status', CASE
        WHEN NOT oi_grouped.any_active_items THEN 'cooking'
        WHEN oi_grouped.all_active_ready  THEN 'ready'
        WHEN oi_grouped.any_active_sent   THEN 'pending'
        ELSE 'cooking'
      END,
      'order_type', o.order_type,
      'order_source', o.order_source,
      'delivery_platform', COALESCE(o.delivery_platform, o.metadata->>'delivery_company'),
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
      'item_count', oi_grouped.active_item_count,
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
          NOT COALESCE(oi.is_voided, false)
          AND COALESCE(oi.refunded_quantity, 0) < oi.quantity
        ) AS any_active_items,
        bool_and(
          CASE
            WHEN NOT COALESCE(oi.is_voided, false)
              AND COALESCE(oi.refunded_quantity, 0) < oi.quantity
            THEN oi.kitchen_status = 'ready'
            ELSE true
          END
        ) AS all_active_ready,
        bool_or(
          CASE
            WHEN NOT COALESCE(oi.is_voided, false)
              AND COALESCE(oi.refunded_quantity, 0) < oi.quantity
            THEN oi.kitchen_status = 'sent'
            ELSE false
          END
        ) AS any_active_sent,
        SUM(
          CASE
            WHEN COALESCE(oi.is_voided, false) THEN 0
            ELSE GREATEST(oi.quantity - COALESCE(oi.refunded_quantity, 0), 0)
          END
        )::int AS active_item_count,
        oi.fire_time,
        MAX(oi.completed_at) FILTER (
          WHERE NOT COALESCE(oi.is_voided, false)
            AND COALESCE(oi.refunded_quantity, 0) < oi.quantity
        ) AS ready_time,
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
    WHERE o.location_id = p_location_id
      AND o.status NOT IN ('completed', 'cancelled', 'void', 'refunded')
      AND (
        oi_grouped.any_active_items
        OR oi_grouped.has_unacknowledged_void_notice
        OR oi_grouped.has_unacknowledged_refund_notice
      )
  ) sub;

  RETURN v_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_kds_tickets_v2(uuid, text[], uuid) TO authenticated;

COMMENT ON FUNCTION public.get_kds_tickets_v2(uuid, text[], uuid) IS
  'Returns active KDS tickets with display-scoped acknowledgement, ready_time, is_to_go, show_server_name-gated server identity, and rush/priority top-band ordering.';
