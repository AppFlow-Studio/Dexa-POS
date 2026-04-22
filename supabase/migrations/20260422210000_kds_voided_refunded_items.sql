-- ============================================================================
-- Migration: kds_voided_refunded_items
-- Date: 2026-04-22
--
-- PURPOSE: Make voided and refunded items visible on KDS with visual indicators
-- instead of silently filtering them out.
--
-- CHANGES:
--   1. get_kds_tickets_v2: Include voided/refunded items that had kitchen_status,
--      add is_voided/is_refunded/refunded_quantity to items JSON,
--      derive status/count from active items only.
--
--   2. broadcast_order_changes: Remove is_voided filter from order_items query
--      so voided items are included in the broadcast payload for KDS display.
--
-- BACKWARD COMPATIBLE: Yes — new JSON fields are additive. Client-side code
-- handles missing fields via optional chaining / defaults.
-- ============================================================================


-- ============================================================================
-- PART 1: Update get_kds_tickets_v2()
--
-- Changes vs. previous version:
--   - WHERE clause: include voided/refunded items that had kitchen_status
--   - Items JSON: add is_voided, is_refunded, refunded_quantity fields
--   - Status aggregation: derive from active items only (skip voided/fully-refunded)
--   - Item count: count only active quantities (exclude voided, subtract refunded)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_kds_tickets_v2(
  p_location_id UUID,
  p_statuses TEXT[] DEFAULT ARRAY['sent', 'preparing', 'ready'],
  p_kds_display_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(ticket ORDER BY ticket->>'start_time' ASC NULLS LAST), '[]'::jsonb)
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
        WHEN oi_grouped.all_active_ready THEN 'ready'
        WHEN oi_grouped.any_active_sent THEN 'pending'
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
    FROM orders o
    INNER JOIN (
      SELECT
        oi.order_id,
        COALESCE(oi.course_number, 1) AS course_number,
        -- Status from ACTIVE items only (not voided, not fully refunded)
        bool_and(
          CASE WHEN NOT COALESCE(oi.is_voided, false)
                AND COALESCE(oi.refunded_quantity, 0) < oi.quantity
               THEN oi.kitchen_status = 'ready'
               ELSE true END
        ) AS all_active_ready,
        bool_or(
          CASE WHEN NOT COALESCE(oi.is_voided, false)
                AND COALESCE(oi.refunded_quantity, 0) < oi.quantity
               THEN oi.kitchen_status = 'sent'
               ELSE false END
        ) AS any_active_sent,
        -- Count only active quantities (exclude voided, subtract refunded)
        SUM(
          CASE WHEN COALESCE(oi.is_voided, false) THEN 0
               ELSE GREATEST(oi.quantity - COALESCE(oi.refunded_quantity, 0), 0)
          END
        )::int AS active_item_count,
        oi.fire_time,
        bool_or(COALESCE(oi.is_prioritized, false)) AS any_prioritized,
        -- Items array now includes voided/refunded fields for KDS display
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
            'is_refunded', COALESCE(oi.refunded_quantity, 0) > 0,
            'refunded_quantity', COALESCE(oi.refunded_quantity, 0),
            'modifiers', (
              SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                  'modifier_name', oim.modifier_name,
                  'modifier_group_name', oim.modifier_group_name,
                  'price_modifier', oim.price_modifier,
                  'is_no', COALESCE(oim.is_no, false)
                )
              ), '[]'::jsonb)
              FROM order_item_modifiers oim
              WHERE oim.order_item_id = oi.id
            )
          )
          ORDER BY oi.id ASC
        ) AS items_json
      FROM order_items oi
      LEFT JOIN kds_item_status kis
        ON kis.order_item_id = oi.id
        AND kis.kds_display_id = p_kds_display_id
        AND kis.status NOT IN ('cancelled', 'completed')
      WHERE oi.kitchen_status IS NOT NULL
        AND (
          -- Active items with KDS-relevant statuses
          (COALESCE(oi.is_voided, false) = false
           AND COALESCE(oi.refunded_quantity, 0) < oi.quantity
           AND oi.kitchen_status = ANY(p_statuses))
          -- Voided items that had been sent to kitchen — show as VOIDED
          OR COALESCE(oi.is_voided, false) = true
          -- Refunded items (partial or full) that had been sent to kitchen — show as REFUNDED
          OR COALESCE(oi.refunded_quantity, 0) > 0
        )
        AND (p_kds_display_id IS NULL OR kis.id IS NOT NULL)
      GROUP BY oi.order_id, COALESCE(oi.course_number, 1), oi.fire_time
    ) oi_grouped ON oi_grouped.order_id = o.id
    WHERE o.location_id = p_location_id
      AND o.status NOT IN ('completed', 'cancelled', 'void', 'refunded')
  ) sub;

  RETURN v_result;
END;
$$;


-- ============================================================================
-- PART 2: Update broadcast_order_changes()
--
-- Single change: remove "AND COALESCE(oi.is_voided, false) = false" filter
-- from the order_items query so voided items are included in the broadcast
-- payload. The KDS client filters handle display logic. All other consumers
-- already have is_voided in the BroadcastOrderItemData type and filter
-- client-side as needed.
--
-- NOTE: The full function body is reproduced below (CREATE OR REPLACE
-- requires the complete function). The ONLY change vs. the previous version
-- is the removal of the is_voided filter on the order_items SELECT.
-- ============================================================================

CREATE OR REPLACE FUNCTION broadcast_order_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
DECLARE
  payload jsonb;
  order_data jsonb;
  order_items_data jsonb;
  order_payments_data jsonb;
  order_refund_items_data jsonb;
  reversals_data jsonb;
  payment_items_data jsonb;

  v_topic text;
  v_location_id uuid;
  v_station_name text;
BEGIN
  -- Get location_id (handle DELETE case)
  v_location_id := COALESCE(NEW.location_id, OLD.location_id);

  IF v_location_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Build topic
  v_topic := 'location:' || v_location_id::text || ':orders';

  -- Build payload based on operation
  IF TG_OP = 'DELETE' THEN
    -- DELETE: Minimal payload (no need to fetch items)
    payload := jsonb_build_object(
      'operation', TG_OP,
      'timestamp', now(),
      'data', jsonb_build_object(
        'order', jsonb_build_object(
          'id', OLD.id,
          'order_number', OLD.order_number,
          'location_id', OLD.location_id,
          'station_id', OLD.station_id
        )
      )
    );
  ELSE
    -- INSERT/UPDATE: Full payload with order_items and modifiers
    -- 1. FETCH STATION NAME ----------------------------------------
    SELECT station_name INTO v_station_name
    FROM stations
    WHERE id = NEW.station_id;
    -----------------------------------------------------------------
    -- Fetch order items WITH their modifiers for this order
    -- NOTE: No is_voided filter — voided items included for KDS display
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', oi.id,
        'menu_item_id', oi.menu_item_id,
        'item_name', oi.item_name,
        'quantity', oi.quantity,
        'unit_price', oi.unit_price,
        'cash_price', oi.cash_price,
        'subtotal', oi.subtotal,
        'cash_subtotal', oi.cash_subtotal,
        'base_card_price', oi.base_card_price,
        'base_cash_price', oi.base_cash_price,
        'tax_amount', oi.tax_amount,
        'cash_tax_amount', oi.cash_tax_amount,
        'discount_amount', COALESCE(oi.discount_amount, 0),
        'item_status', oi.item_status,
        'kitchen_status', oi.kitchen_status,
        'paid_quantity', COALESCE(oi.paid_quantity, 0),
        'refunded_quantity', COALESCE(oi.refunded_quantity, 0),
        'refunded_amount', COALESCE(oi.refunded_amount, 0),
        'course_number', oi.course_number,
        'seat_number', oi.seat_number,
        'is_voided', COALESCE(oi.is_voided, false),
        'is_open_item', COALESCE(oi.is_open_item, false),
        'open_item_name', oi.open_item_name,
        'open_item_price', oi.open_item_price,
        'special_instructions', oi.special_instructions,
        'category_name', oi.category_name,
        'category_id', oi.category_id,
        'prep_station', oi.prep_station,
        'rush', COALESCE(oi.rush, false),
        'is_prioritized', COALESCE(oi.is_prioritized, false),
        'fire_time', oi.fire_time::timestamptz,
        -- Phase 2.5: Include modifiers for this item
        'modifiers', (
          SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
              'modifier_group_id', oim.modifier_group_id,
              'modifier_item_id', oim.modifier_item_id,
              'modifier_group_name', oim.modifier_group_name,
              'modifier_name', oim.modifier_name,
              'price_modifier', oim.price_modifier,
              'quantity', oim.quantity,
              'is_no', COALESCE(oim.is_no, false)
            )
          ), '[]'::jsonb)
          FROM order_item_modifiers oim
          WHERE oim.order_item_id = oi.id
        )
      )
      ORDER BY oi.display_order ASC NULLS LAST, oi.created_at ASC
    ), '[]'::jsonb) INTO order_items_data
    FROM order_items oi
    WHERE oi.order_id = NEW.id;


    -- Fetch order payments for this order
    -- Split into two jsonb_build_object calls to stay under 100-arg limit
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', op.id,
        'order_id', op.order_id,
        'payment_method', op.payment_method,
        'amount', op.amount,
        'tip_amount', COALESCE(op.tip_amount, 0),
        'total_amount', op.total_amount,
        'status', op.status,
        'subtotal_portion', op.subtotal_portion,
        'tax_portion', op.tax_portion,
        'discount_portion', op.discount_portion,
        'amount_tendered', op.amount_tendered,
        'change_given', COALESCE(op.change_given, 0),
        'is_cash_priced', COALESCE(op.is_cash_priced, false),
        'original_amount', op.original_amount,
        'split_portion_index', op.split_portion_index,
        'split_count', op.split_count,
        'covers_items', COALESCE(op.covers_items, ARRAY[]::uuid[]),
        'card_type', op.card_type,
        'card_last_four', op.card_last_four,
        'transaction_id', op.transaction_id,
        'terminal_type', op.terminal_type,
        'is_voided', COALESCE(op.is_voided, false),
        'void_reason', op.void_reason,
        'refunded_amount', COALESCE(op.refunded_amount, 0),
        'refunded_at', op.refunded_at
      ) || jsonb_build_object(
        'captured_at', op.captured_at,
        'authorization_code', op.authorization_code,
        'auth_code', op.auth_code,
        'rrn', op.rrn,
        'batch_number', op.batch_number,
        'dejavoo_batch_number', op.dejavoo_batch_number,
        'dejavoo_invoice_number', op.dejavoo_invoice_number,
        'result_code', op.result_code,
        'entry_mode', op.processor_response->'dejavoo_transaction'->>'entryMode',
        'reference_number', op.reference_number,
        'reference_id', op.reference_number,
        'created_at', op.initiated_at,
        -- Return/refund tracking fields
        'is_returned', COALESCE(op.is_returned, false),
        'returned_at', op.returned_at,
        'returned_by', op.returned_by,
        'return_amount', COALESCE(op.return_amount, 0),
        'return_rrn', op.return_rrn,
        'return_auth_code', op.return_auth_code,
        'return_reference_id', op.return_reference_id,
        'return_number', op.return_number,
        'return_reason', op.return_reason
      )
    ), '[]'::jsonb) INTO order_payments_data
    FROM order_payments op
    WHERE op.order_id = NEW.id
      AND op.status IN ('captured', 'refunded', 'partially_refunded', 'void');
    -- Include refunded/voided payments for history display

    -- Fetch reversals for this order (via payment linkage)
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'original_payment_id', r.original_payment_id,
        'original_psp_reference', r.original_psp_reference,
        'reversal_reference_id', r.reversal_reference_id,
        'reversal_psp_reference', r.reversal_psp_reference,
        'merchant_id', r.merchant_id,
        'location_id', r.location_id,
        'reversal_type', r.reversal_type,
        'amount', r.amount,
        'reason_code', r.reason_code,
        'reason_description', r.reason_description,
        'status', r.status,
        'result_code', r.result_code,
        'response_message', r.response_message,
        'initiated_by', r.initiated_by,
        'approved_by', r.approved_by,
        'requested_at', r.requested_at,
        'processed_at', r.processed_at,
        'completed_at', r.completed_at,
        'failed_at', r.failed_at,
        'terminal_response', r.terminal_response,
        'emv_data', r.emv_data
      )
    ), '[]'::jsonb) INTO reversals_data
    FROM reversals r
    JOIN order_payments op ON op.id = r.original_payment_id
    WHERE op.order_id = NEW.id;

    -- Fetch refund line items for this order
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', ori.id,
        'reversal_id', ori.reversal_id,
        'order_item_id', ori.order_item_id,
        'order_payment_item_id', ori.order_payment_item_id,
        'quantity_refunded', ori.quantity_refunded,
        'unit_price_refunded', ori.unit_price_refunded,
        'subtotal_refunded', ori.subtotal_refunded,
        'tax_refunded', ori.tax_refunded,
        'total_refunded', ori.total_refunded,
        'refund_reason', ori.refund_reason,
        'refund_reason_detail', ori.refund_reason_detail,
        'return_to_inventory', ori.return_to_inventory,
        'inventory_updated', ori.inventory_updated,
        'created_at', ori.created_at
      )
    ), '[]'::jsonb) INTO order_refund_items_data
    FROM order_refund_items ori
    JOIN order_items oi ON oi.id = ori.order_item_id
    WHERE oi.order_id = NEW.id;

    -- Fetch per-payment item coverage from junction table
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', opi.id,
        'order_payment_id', opi.order_payment_id,
        'order_item_id', opi.order_item_id,
        'quantity_paid', opi.quantity_paid,
        'unit_price_paid', opi.unit_price_paid,
        'subtotal_paid', opi.subtotal_paid,
        'tax_paid', opi.tax_paid
      )
    ), '[]'::jsonb) INTO payment_items_data
    FROM order_payment_items opi
    JOIN order_payments op ON op.id = opi.order_payment_id
    WHERE op.order_id = NEW.id;

    -- Build order_data in parts to avoid 100 argument limit
    -- Part 1: Identifiers and relationships
    order_data := jsonb_build_object(
      'id', NEW.id,
      'order_number', NEW.order_number,
      'display_number', NEW.display_number,
      'external_id', NEW.external_id,
      'merchant_id', NEW.merchant_id,
      'location_id', NEW.location_id,
      'customer_id', NEW.customer_id,
      'created_by_staff_id', NEW.created_by_staff_id,
      'created_by_user_id', NEW.created_by_user_id,
      'assigned_server_id', NEW.assigned_server_id,
      'station_id', NEW.station_id,
      'station_name', v_station_name,
      'order_type', NEW.order_type,
      'order_source', NEW.order_source,
      'split_payment_path', NEW.split_payment_path,
      'status', NEW.status,
      'table_number', NEW.table_number,
      'seat_number', NEW.seat_number,
      'check_status', NEW.check_status
    );

    -- Part 2: Financial totals
    order_data := order_data || jsonb_build_object(
      'subtotal', NEW.subtotal,
      'tax_amount', NEW.tax_amount,
      'tip_amount', NEW.tip_amount,
      'discount_amount', NEW.discount_amount,
      'service_charge', NEW.service_charge,
      'total_amount', NEW.total_amount,
      'card_subtotal', NEW.card_subtotal,
      'card_tax_amount', NEW.card_tax_amount,
      'card_total', NEW.card_total,
      'cash_subtotal', NEW.cash_subtotal,
      'cash_tax_amount', NEW.cash_tax_amount,
      'cash_total', NEW.cash_total,
      'cash_discount_applied', NEW.cash_discount_applied,
      'cash_discount_amount', NEW.cash_discount_amount
    );

    -- Part 3: Effective pricing and payment status
    order_data := order_data || jsonb_build_object(
      'effective_subtotal', NEW.effective_subtotal,
      'effective_tax_amount', NEW.effective_tax_amount,
      'effective_total', NEW.effective_total,
      'payment_pricing_mode', NEW.payment_pricing_mode,
      'payment_status', NEW.payment_status,
      'amount_paid', NEW.amount_paid,
      'amount_due', NEW.amount_due,
      'cash_amount_due', NEW.cash_amount_due
    );

    -- Part 4: Timestamps
    order_data := order_data || jsonb_build_object(
      'created_at', NEW.created_at,
      'updated_at', NEW.updated_at,
      'sent_to_kitchen_at', NEW.sent_to_kitchen_at,
      'started_preparing_at', NEW.started_preparing_at,
      'ready_at', NEW.ready_at,
      'completed_at', NEW.completed_at,
      'cancelled_at', NEW.cancelled_at,
      'voided_at', NEW.voided_at
    );

    -- Part 5: Void info, sync info, order items, and payments
    order_data := order_data || jsonb_build_object(
      'voided_by', NEW.voided_by,
      'void_reason', NEW.void_reason,
      'cancellation_reason', NEW.cancellation_reason,
      'sync_version', NEW.sync_version,
      'is_offline', NEW.is_offline,
      'order_items', order_items_data,
      'order_payments', order_payments_data,
      'reversals', reversals_data,
      'order_refund_items', order_refund_items_data,
      'payment_items', payment_items_data
    );

    -- Build final payload
    payload := jsonb_build_object(
      'operation', TG_OP,
      'timestamp', now(),
      'data', jsonb_build_object(
        'order', order_data
      )
    );
  END IF;

  RAISE LOG 'Broadcasting order for location %', v_topic;
  RAISE LOG 'Broadcasting order for location %', payload;

  -- Broadcast using Supabase Realtime
  PERFORM realtime.send(
    payload,
    TG_OP,
    v_topic,
    true
  );

  RETURN NULL;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'broadcast_order_changes failed: %', SQLERRM;
  RETURN NULL;
END;
$fn$;
