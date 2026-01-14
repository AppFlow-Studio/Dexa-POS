-- Migration: update_order_broadcast.sql
-- Phase 2: Remote Order Management - Enhanced broadcast trigger with station_id and order_items
-- Phase 2.5: Order Item Sync with Modifiers - Added modifiers subquery for each item
--
-- IMPORTANT: This uses realtime.send() for Supabase Realtime broadcasts (NOT pg_notify)
-- NOTE: jsonb_build_object has 100 arg limit, so we build in parts and concatenate with ||

-- ============================================================================
-- FUNCTION: broadcast_order_changes
-- ============================================================================
-- Enhanced version that includes station_id, order_items, and modifiers in the broadcast payload.
-- This enables remote order management where stations can see orders from other stations
-- with full item customization details including modifiers.

CREATE OR REPLACE FUNCTION broadcast_order_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $
DECLARE
  payload jsonb;
  order_data jsonb;
  order_items_data jsonb;
  v_topic text;
  v_location_id uuid;
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

    -- Fetch order items WITH their modifiers for this order
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
        'tax_amount', oi.tax_amount,
        'cash_tax_amount', oi.cash_tax_amount,
        'discount_amount', COALESCE(oi.discount_amount, 0),
        'item_status', oi.item_status,
        'kitchen_status', oi.kitchen_status,
        'paid_quantity', COALESCE(oi.paid_quantity, 0),
        'course_number', oi.course_number,
        'is_voided', COALESCE(oi.is_voided, false),
        'is_open_item', COALESCE(oi.is_open_item, false),
        'open_item_name', oi.open_item_name,
        'open_item_price', oi.open_item_price,
        'special_instructions', oi.special_instructions,
        'category_name', oi.category_name,
        -- Phase 2.5: Include modifiers for this item
        'modifiers', (
          SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
              'modifier_group_id', oim.modifier_group_id,
              'modifier_item_id', oim.modifier_item_id,
              'modifier_group_name', oim.modifier_group_name,
              'modifier_name', oim.modifier_name,
              'price_modifier', oim.price_modifier,
              'quantity', oim.quantity
            )
          ), '[]'::jsonb)
          FROM order_item_modifiers oim
          WHERE oim.order_item_id = oi.id
        )
      )
    ), '[]'::jsonb) INTO order_items_data
    FROM order_items oi
    WHERE oi.order_id = NEW.id
      AND COALESCE(oi.is_voided, false) = false;

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
      'order_type', NEW.order_type,
      'status', NEW.status,
      'table_number', NEW.table_number,
      'seat_number', NEW.seat_number
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
      'check_status', NEW.check_status,
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

    -- Part 5: Void info, sync info, and order items
    order_data := order_data || jsonb_build_object(
      'voided_by', NEW.voided_by,
      'void_reason', NEW.void_reason,
      'cancellation_reason', NEW.cancellation_reason,
      'sync_version', NEW.sync_version,
      'is_offline', NEW.is_offline,
      'order_items', order_items_data
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

  -- Broadcast using Supabase Realtime
  PERFORM realtime.send(
    v_topic,
    TG_OP,
    payload,
    true
  );

  RETURN NULL;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'broadcast_order_changes failed: %', SQLERRM;
  RETURN NULL;
END;
$;

-- ============================================================================
-- TRIGGER: orders_broadcast_trigger
-- ============================================================================
-- Trigger to broadcast order changes on INSERT, UPDATE, DELETE

DROP TRIGGER IF EXISTS orders_broadcast_trigger ON orders;

CREATE TRIGGER orders_broadcast_trigger
  AFTER INSERT OR UPDATE OR DELETE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION broadcast_order_changes();

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON FUNCTION broadcast_order_changes() IS
'Broadcasts order changes to Supabase Realtime with station_id, order_items, and modifiers for remote order management.';
