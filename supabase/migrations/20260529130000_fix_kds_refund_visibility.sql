-- Fix: refunded items not visible on KDS + acknowledged items returning after refresh.
--
-- Root causes:
--   1. Refund filter required p_kds_display_id IS NOT NULL AND kis.id IS NOT NULL,
--      so refunded items never showed without a pre-existing kds_item_status row.
--   2. LEFT JOIN used kis.kds_display_id = p_kds_display_id — when p_kds_display_id
--      IS NULL, NULL = NULL is always false in SQL, so kis was always NULL, making
--      every item appear unacknowledged and acknowledged items return on every refresh.
--   3. Outer WHERE required any_active_items, dropping all-voided/all-refunded tickets.
--
-- Fix: use two separate LEFT JOINs — one unconditional (for items JSON / acknowledged
-- flag), one only when p_kds_display_id IS NOT NULL (for filtering). When no display
-- ID is provided, void/refund notices always show (no per-display ack tracking).

CREATE OR REPLACE FUNCTION public.get_kds_tickets_v2(
  p_location_id UUID,
  p_statuses TEXT[] DEFAULT ARRAY['sent', 'preparing', 'ready'],
  p_kds_display_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_result JSONB;
BEGIN
  SELECT COALESCE(
    jsonb_agg(ticket ORDER BY ticket->>'start_time' ASC NULLS LAST),
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
      'table_name', o.table_number,
      'customer_name', o.customer_name,
      'order_notes', o.special_instructions,
      'start_time', COALESCE(oi_grouped.fire_time::timestamptz, o.sent_to_kitchen_at, o.created_at),
      'item_count', oi_grouped.active_item_count,
      'prioritized', oi_grouped.any_prioritized,
      'session_id', o.session_id,
      'items', oi_grouped.items_json
    ) AS ticket
    FROM public.orders o
    INNER JOIN (
      SELECT
        oi.order_id,
        COALESCE(oi.course_number, 1) AS course_number,

        -- Active = not voided and not fully refunded
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
        bool_or(COALESCE(oi.is_prioritized, false)) AS any_prioritized,

        -- Unacknowledged void notices: voided and no ack row with acknowledged_at set
        bool_or(
          COALESCE(oi.is_voided, false) = true
          AND NOT EXISTS (
            SELECT 1 FROM public.kds_item_status ack
            WHERE ack.order_item_id = oi.id
              AND ack.acknowledged_at IS NOT NULL
              AND (p_kds_display_id IS NULL OR ack.kds_display_id = p_kds_display_id)
          )
        ) AS has_unacknowledged_void_notice,

        -- Unacknowledged refund notices: refunded and no ack row with acknowledged_at set
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

      -- Join for routing state (display-specific bump/complete tracking).
      -- Only meaningful when p_kds_display_id is set.
      LEFT JOIN public.kds_item_status kis
        ON kis.order_item_id = oi.id
        AND p_kds_display_id IS NOT NULL
        AND kis.kds_display_id = p_kds_display_id

      WHERE (
          oi.kitchen_status IS NOT NULL
          OR COALESCE(oi.is_voided, false) = true
        )
        AND (
          -- Active items: not voided, not fully refunded, in a KDS-relevant status
          (
            COALESCE(oi.is_voided, false) = false
            AND COALESCE(oi.refunded_quantity, 0) < oi.quantity
            AND oi.kitchen_status = ANY(p_statuses)
            AND (
              p_kds_display_id IS NULL
              OR (kis.id IS NOT NULL AND kis.status NOT IN ('cancelled', 'completed'))
            )
          )
          -- Voided items: include only if not yet acknowledged by any display
          OR (
            COALESCE(oi.is_voided, false) = true
            AND NOT EXISTS (
              SELECT 1 FROM public.kds_item_status ack
              WHERE ack.order_item_id = oi.id
                AND ack.acknowledged_at IS NOT NULL
                AND (p_kds_display_id IS NULL OR ack.kds_display_id = p_kds_display_id)
            )
          )
          -- Refunded items: include only if not yet acknowledged by any display
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

GRANT EXECUTE ON FUNCTION public.get_kds_tickets_v2(UUID, TEXT[], UUID) TO authenticated;

COMMENT ON FUNCTION public.get_kds_tickets_v2(UUID, TEXT[], UUID) IS
  'Returns active KDS tickets with display-scoped void/refund acknowledgement. '
  'Acknowledged notices are excluded from future fetches for that display.';
