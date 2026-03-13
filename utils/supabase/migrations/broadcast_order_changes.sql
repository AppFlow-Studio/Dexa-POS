CREATE OR REPLACE FUNCTION broadcast_order_changes();
DECLARE
  payload jsonb;
  order_data jsonb;
  order_items_data jsonb;
  order_payments_data jsonb;
  order_refund_items_data jsonb;
  reversals_data jsonb;

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
    -- We need to look up the name based on the station_id
    SELECT station_name INTO v_station_name
    FROM stations
    WHERE id = NEW.station_id;
    -----------------------------------------------------------------
    -- Fetch order items WITH their modifiers for this order
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        --TODO: Might need to fetch menu_item base price 
        -- THIS LOGIC does not work for the current modifiers calculation locally
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
        'is_voided', COALESCE(oi.is_voided, false),
        'is_open_item', COALESCE(oi.is_open_item, false),
        'open_item_name', oi.open_item_name,
        'open_item_price', oi.open_item_price,
        'special_instructions', oi.special_instructions,
        'category_name', oi.category_name,
        'category_id', oi.category_id,
        'prep_station', oi.prep_station,
        'rush', COALESCE(oi.rush, false),
        'fire_time', oi.fire_time,
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
      'order_refund_items', order_refund_items_data
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

  -- RAISE LOG 'Active Order %', payload; 
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



-- DECLARE
--   payload jsonb;
--   order_data jsonb;
--   order_items_data jsonb;
--   order_payments_data jsonb;
--   order_refund_items_data jsonb;
--   reversals_data jsonb;
--   v_topic text;
--   v_location_id uuid;
--   v_station_name text;
-- BEGIN
--   -- Get location_id (handle DELETE case)
--   v_location_id := COALESCE(NEW.location_id, OLD.location_id);

--   IF v_location_id IS NULL THEN
--     RETURN NULL;
--   END IF;

--   -- Build topic
--   v_topic := 'location:' || v_location_id::text || ':orders';

--   -- Build payload based on operation
--   IF TG_OP = 'DELETE' THEN
--     -- DELETE: Minimal payload (no need to fetch items)
--     payload := jsonb_build_object(
--       'operation', TG_OP,
--       'timestamp', now(),
--       'data', jsonb_build_object(
--         'order', jsonb_build_object(
--           'id', OLD.id,
--           'order_number', OLD.order_number,
--           'location_id', OLD.location_id,
--           'station_id', OLD.station_id
--         )
--       )
--     );
--   ELSE
--     -- INSERT/UPDATE: Full payload with order_items and modifiers
--     -- 1. FETCH STATION NAME ----------------------------------------
--     -- We need to look up the name based on the station_id
--     SELECT station_name INTO v_station_name
--     FROM stations
--     WHERE id = NEW.station_id;
--     -----------------------------------------------------------------
--     -- Fetch order items WITH their modifiers for this order
--     SELECT COALESCE(jsonb_agg(
--       jsonb_build_object(
--         --TODO: Might need to fetch menu_item base price 
--         -- THIS LOGIC does not work for the current modifiers calculation locally
--         'id', oi.id,
--         'menu_item_id', oi.menu_item_id,
--         'item_name', oi.item_name,
--         'quantity', oi.quantity,
--         'unit_price', oi.unit_price,
--         'cash_price', oi.cash_price,
--         'subtotal', oi.subtotal,
--         'cash_subtotal', oi.cash_subtotal,
--         'base_card_price', oi.base_card_price,
--         'base_cash_price', oi.base_cash_price,
--         'tax_amount', oi.tax_amount,
--         'cash_tax_amount', oi.cash_tax_amount,
--         'discount_amount', COALESCE(oi.discount_amount, 0),
--         'item_status', oi.item_status,
--         'kitchen_status', oi.kitchen_status,
--         'paid_quantity', COALESCE(oi.paid_quantity, 0),
--         'refunded_quantity', COALESCE(oi.refunded_quantity, 0),
--         'refunded_amount', COALESCE(oi.refunded_amount, 0),
--         'course_number', oi.course_number,
--         'is_voided', COALESCE(oi.is_voided, false),
--         'is_open_item', COALESCE(oi.is_open_item, false),
--         'open_item_name', oi.open_item_name,
--         'open_item_price', oi.open_item_price,
--         'special_instructions', oi.special_instructions,
--         'category_name', oi.category_name,
--         -- Phase 2.5: Include modifiers for this item
--         'modifiers', (
--           SELECT COALESCE(jsonb_agg(
--             jsonb_build_object(
--               'modifier_group_id', oim.modifier_group_id,
--               'modifier_item_id', oim.modifier_item_id,
--               'modifier_group_name', oim.modifier_group_name,
--               'modifier_name', oim.modifier_name,
--               'price_modifier', oim.price_modifier,
--               'quantity', oim.quantity
--             )
--           ), '[]'::jsonb)
--           FROM order_item_modifiers oim
--           WHERE oim.order_item_id = oi.id
--         )
--       )
--     ), '[]'::jsonb) INTO order_items_data
--     FROM order_items oi
--     WHERE oi.order_id = NEW.id
--       AND COALESCE(oi.is_voided, false) = false;
     
--     -- Fetch order payments for this order
--     SELECT COALESCE(jsonb_agg(
--       jsonb_build_object(
--         'id', op.id,
--         'order_id', op.order_id,
--         'payment_method', op.payment_method,
--         'amount', op.amount,
--         'tip_amount', COALESCE(op.tip_amount, 0),
--         'total_amount', op.total_amount,
--         'status', op.status,
--         'subtotal_portion', op.subtotal_portion,
--         'tax_portion', op.tax_portion,
--         'discount_portion', op.discount_portion,
--         'amount_tendered', op.amount_tendered,
--         'change_given', COALESCE(op.change_given, 0),
--         'is_cash_priced', COALESCE(op.is_cash_priced, false),
--         'original_amount', op.original_amount,
--         'split_portion_index', op.split_portion_index,
--         'split_count', op.split_count,
--         'covers_items', COALESCE(op.covers_items, ARRAY[]::uuid[]),
--         'card_type', op.card_type,
--         'card_last_four', op.card_last_four,
--         'transaction_id', op.transaction_id,
--         'terminal_type', op.terminal_type,
--         'is_voided', COALESCE(op.is_voided, false),
--         'void_reason', op.void_reason,
--         'refunded_amount', COALESCE(op.refunded_amount, 0),
--         'refunded_at', op.refunded_at,
--         'captured_at', op.captured_at,
--         'authorization_code', op.authorization_code,
--         'auth_code', op.auth_code,
--         'rrn', op.rrn,
--         'batch_number', op.batch_number,
--         'dejavoo_batch_number', op.dejavoo_batch_number,
--         'dejavoo_invoice_number', op.dejavoo_invoice_number,
--         'result_code', op.result_code,
--         'entry_mode', op.processor_response->'dejavoo_transaction'->>'entryMode',
--         'reference_number', op.reference_number,
--         'reference_id', op.reference_number,
--         'created_at', op.initiated_at,
--         -- Return/refund tracking fields
--         'is_returned', COALESCE(op.is_returned, false),
--         'returned_at', op.returned_at,
--         'returned_by', op.returned_by,
--         'return_amount', COALESCE(op.return_amount, 0),
--         'return_rrn', op.return_rrn,
--         'return_auth_code', op.return_auth_code,
--         'return_reference_id', op.return_reference_id,
--         'return_number', op.return_number,
--         'return_reason', op.return_reason
--       )
--     ), '[]'::jsonb) INTO order_payments_data
--     FROM order_payments op
--     WHERE op.order_id = NEW.id
--       AND op.status IN ('captured', 'refunded', 'partially_refunded', 'void');
--     -- Include refunded/voided payments for history display

--     -- Fetch reversals for this order (via payment linkage)
--     SELECT COALESCE(jsonb_agg(
--       jsonb_build_object(
--         'id', r.id,
--         'original_payment_id', r.original_payment_id,
--         'original_psp_reference', r.original_psp_reference,
--         'reversal_reference_id', r.reversal_reference_id,
--         'reversal_psp_reference', r.reversal_psp_reference,
--         'merchant_id', r.merchant_id,
--         'location_id', r.location_id,
--         'reversal_type', r.reversal_type,
--         'amount', r.amount,
--         'reason_code', r.reason_code,
--         'reason_description', r.reason_description,
--         'status', r.status,
--         'result_code', r.result_code,
--         'response_message', r.response_message,
--         'initiated_by', r.initiated_by,
--         'approved_by', r.approved_by,
--         'requested_at', r.requested_at,
--         'processed_at', r.processed_at,
--         'completed_at', r.completed_at,
--         'failed_at', r.failed_at,
--         'terminal_response', r.terminal_response,
--         'emv_data', r.emv_data
--       )
--     ), '[]'::jsonb) INTO reversals_data
--     FROM reversals r
--     JOIN order_payments op ON op.id = r.original_payment_id
--     WHERE op.order_id = NEW.id;

--     -- Fetch refund line items for this order
--     SELECT COALESCE(jsonb_agg(
--       jsonb_build_object(
--         'id', ori.id,
--         'reversal_id', ori.reversal_id,
--         'order_item_id', ori.order_item_id,
--         'order_payment_item_id', ori.order_payment_item_id,
--         'quantity_refunded', ori.quantity_refunded,
--         'unit_price_refunded', ori.unit_price_refunded,
--         'subtotal_refunded', ori.subtotal_refunded,
--         'tax_refunded', ori.tax_refunded,
--         'total_refunded', ori.total_refunded,
--         'refund_reason', ori.refund_reason,
--         'refund_reason_detail', ori.refund_reason_detail,
--         'return_to_inventory', ori.return_to_inventory,
--         'inventory_updated', ori.inventory_updated,
--         'created_at', ori.created_at
--       )
--     ), '[]'::jsonb) INTO order_refund_items_data
--     FROM order_refund_items ori
--     JOIN order_items oi ON oi.id = ori.order_item_id
--     WHERE oi.order_id = NEW.id;



--     -- Build order_data in parts to avoid 100 argument limit
--     -- Part 1: Identifiers and relationships
--     order_data := jsonb_build_object(
--       'id', NEW.id,
--       'order_number', NEW.order_number,
--       'display_number', NEW.display_number,
--       'external_id', NEW.external_id,
--       'merchant_id', NEW.merchant_id,
--       'location_id', NEW.location_id,
--       'customer_id', NEW.customer_id,
--       'created_by_staff_id', NEW.created_by_staff_id,
--       'created_by_user_id', NEW.created_by_user_id,
--       'assigned_server_id', NEW.assigned_server_id,
--       'station_id', NEW.station_id,
--       'station_name', v_station_name,
--       'order_type', NEW.order_type,
--       'status', NEW.status,
--       'table_number', NEW.table_number,
--       'seat_number', NEW.seat_number,
--       'check_status', NEW.check_status
--     );

--     -- Part 2: Financial totals
--     order_data := order_data || jsonb_build_object(
--       'subtotal', NEW.subtotal,
--       'tax_amount', NEW.tax_amount,
--       'tip_amount', NEW.tip_amount,
--       'discount_amount', NEW.discount_amount,
--       'service_charge', NEW.service_charge,
--       'total_amount', NEW.total_amount,
--       'card_subtotal', NEW.card_subtotal,
--       'card_tax_amount', NEW.card_tax_amount,
--       'card_total', NEW.card_total,
--       'cash_subtotal', NEW.cash_subtotal,
--       'cash_tax_amount', NEW.cash_tax_amount,
--       'cash_total', NEW.cash_total,
--       'cash_discount_applied', NEW.cash_discount_applied,
--       'cash_discount_amount', NEW.cash_discount_amount
--     );

--     -- Part 3: Effective pricing and payment status
--     order_data := order_data || jsonb_build_object(
--       'effective_subtotal', NEW.effective_subtotal,
--       'effective_tax_amount', NEW.effective_tax_amount,
--       'effective_total', NEW.effective_total,
--       'payment_pricing_mode', NEW.payment_pricing_mode,
--       'payment_status', NEW.payment_status,
--       'amount_paid', NEW.amount_paid,
--       'amount_due', NEW.amount_due,
--       'cash_amount_due', NEW.cash_amount_due
--     );

--     -- Part 4: Timestamps
--     order_data := order_data || jsonb_build_object(
--       'created_at', NEW.created_at,
--       'updated_at', NEW.updated_at,
--       'sent_to_kitchen_at', NEW.sent_to_kitchen_at,
--       'started_preparing_at', NEW.started_preparing_at,
--       'ready_at', NEW.ready_at,
--       'completed_at', NEW.completed_at,
--       'cancelled_at', NEW.cancelled_at,
--       'voided_at', NEW.voided_at
--     );

--     -- Part 5: Void info, sync info, order items, and payments
--     order_data := order_data || jsonb_build_object(
--       'voided_by', NEW.voided_by,
--       'void_reason', NEW.void_reason,
--       'cancellation_reason', NEW.cancellation_reason,
--       'sync_version', NEW.sync_version,
--       'is_offline', NEW.is_offline,
--       'order_items', order_items_data,
--       'order_payments', order_payments_data,
--       'reversals', reversals_data,
--       'order_refund_items', order_refund_items_data
--     );

--     -- Build final payload
--     payload := jsonb_build_object(
--       'operation', TG_OP,
--       'timestamp', now(),
--       'data', jsonb_build_object(
--         'order', order_data
--       )
--     );
--   END IF;

--   -- RAISE LOG 'Active Order %', payload; 
--   RAISE LOG 'Broadcasting order for location %', v_topic;
--   RAISE LOG 'Broadcasting order for location %', payload;

--   -- Broadcast using Supabase Realtime
--   PERFORM realtime.send(
--     payload,
--     TG_OP,
--     v_topic,
--     true
--   );

--   RETURN NULL;

-- EXCEPTION WHEN OTHERS THEN
--   RAISE WARNING 'broadcast_order_changes failed: %', SQLERRM;
--   RETURN NULL;
-- END;