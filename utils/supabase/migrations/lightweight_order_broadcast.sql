-- Migration: lightweight_order_broadcast.sql
-- Lightweight Broadcast Optimization
--
-- Replaces the heavy broadcast_order_changes() trigger with a lightweight version:
-- - Zero item/modifier subqueries (was ~600-800ms, now 0ms)
-- - Zero reversals/refund_items subqueries (was ~100-200ms, now 0ms)
-- - Conditional payment subquery: only when payment_status/amount_paid/amount_due changes (~1% of fires)
-- - Adds _broadcast_version: 2 and item_count for client-side detection
-- - Adds missing fields: session_id, customer_name, customer_phone, customer_email, delivery_address
--
-- Expected trigger execution: ~5ms (non-payment) / ~200ms (payment change) vs ~1400ms before
-- Expected payload size: ~1.5KB (non-payment) / ~3-5KB (payment) vs 5-50KB before
--
-- IMPORTANT: Deploy client-side changes FIRST. Old clients handle missing order_items gracefully
-- via existing optional type checks. KDS falls back to polling refetch.

-- ============================================================================
-- FUNCTION: broadcast_order_changes (v2 — lightweight)
-- ============================================================================
CREATE OR REPLACE FUNCTION broadcast_order_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $func$
DECLARE
  payload jsonb;
  order_data jsonb;
  order_payments_data jsonb;
  payment_items_data jsonb;

  v_topic text;
  v_location_id uuid;
  v_station_name text;
  v_item_count integer;
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
    -- DELETE: Minimal payload (unchanged from v1)
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
    -- INSERT/UPDATE: Lightweight payload — header fields only, no item subqueries

    -- 1. Station name lookup (~0.1ms, indexed PK)
    SELECT station_name INTO v_station_name
    FROM stations
    WHERE id = NEW.station_id;

    -- 2. Non-voided item count (~0.1ms, indexed FK scan)
    SELECT COUNT(*) INTO v_item_count
    FROM order_items
    WHERE order_id = NEW.id AND COALESCE(is_voided, false) = false;

    -- 3. CONDITIONAL: Payments + payment_items only when payment fields changed
    --    This runs for ~1% of trigger fires (payment capture/refund/void)
    --    Non-payment changes (item add, status change, kitchen send) skip entirely
    IF TG_OP = 'INSERT' OR (
      TG_OP = 'UPDATE' AND (
        NEW.payment_status IS DISTINCT FROM OLD.payment_status OR
        NEW.amount_paid IS DISTINCT FROM OLD.amount_paid OR
        NEW.amount_due IS DISTINCT FROM OLD.amount_due
      )
    ) THEN
      -- Fetch order_payments (same query as v1)
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
    ELSE
      -- Non-payment change: skip payment subqueries entirely
      order_payments_data := NULL;
      payment_items_data := NULL;
    END IF;

    -- Build order_data from NEW.* columns — zero item/modifier subqueries
    -- Part 1: Identifiers and relationships (includes v2 marker + item_count)
    order_data := jsonb_build_object(
      '_broadcast_version', 2,
      'item_count', v_item_count,
      'id', NEW.id,
      'order_number', NEW.order_number,
      'display_number', NEW.display_number,
      'external_id', NEW.external_id,
      'merchant_id', NEW.merchant_id,
      'location_id', NEW.location_id,
      'customer_id', NEW.customer_id,
      'customer_name', NEW.customer_name,
      'customer_phone', NEW.customer_phone,
      'customer_email', NEW.customer_email,
      'delivery_address', NEW.delivery_address,
      'created_by_staff_id', NEW.created_by_staff_id,
      'created_by_user_id', NEW.created_by_user_id,
      'assigned_server_id', NEW.assigned_server_id,
      'session_id', NEW.session_id,
      'station_id', NEW.station_id,
      'station_name', v_station_name,
      'order_type', NEW.order_type,
      'order_source', NEW.order_source,
      'delivery_platform', COALESCE(NEW.delivery_platform, NEW.metadata->>'delivery_company'),
      'split_payment_path', NEW.split_payment_path
    );

    -- Part 2: Status + financial totals
    order_data := order_data || jsonb_build_object(
      'status', NEW.status,
      'table_number', NEW.table_number,
      'seat_number', NEW.seat_number,
      'check_status', NEW.check_status,
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

    -- Part 5: Void info + sync version (NO items, NO reversals, NO refund_items)
    order_data := order_data || jsonb_build_object(
      'voided_by', NEW.voided_by,
      'void_reason', NEW.void_reason,
      'cancellation_reason', NEW.cancellation_reason,
      'sync_version', NEW.sync_version,
      'is_offline', NEW.is_offline
    );

    -- Append conditional payment data (null-safe: only included when payment fields changed)
    IF order_payments_data IS NOT NULL THEN
      order_data := order_data || jsonb_build_object(
        'order_payments', order_payments_data,
        'payment_items', payment_items_data
      );
    END IF;

    -- Build final payload
    payload := jsonb_build_object(
      'operation', TG_OP,
      'timestamp', now(),
      'data', jsonb_build_object(
        'order', order_data
      )
    );
  END IF;

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
$func$;

-- ============================================================================
-- TRIGGER: Recreate with same name (function replaced in-place via CREATE OR REPLACE)
-- ============================================================================
-- The trigger already references broadcast_order_changes() — no need to DROP/CREATE
-- since CREATE OR REPLACE updates the function body while keeping the trigger binding.

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON FUNCTION broadcast_order_changes() IS
'v2 Lightweight broadcast: header-only (no items/modifiers/reversals/refund_items), conditional payments, _broadcast_version: 2, item_count. Trigger execution ~5ms (non-payment) / ~200ms (payment change).';
