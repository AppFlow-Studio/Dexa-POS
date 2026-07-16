-- Rollback for 20260712124000_broadcast_platform_order_number.sql
-- Restores broadcast_order_changes verbatim from 20260610125142 (no platform_order_number).

CREATE OR REPLACE FUNCTION public.broadcast_order_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  payload jsonb;
  order_data jsonb;
  order_payments_data jsonb;
  payment_items_data jsonb;

  v_topic text;
  v_location_id uuid;
  v_station_name text;
  v_item_count integer;
  v_qr_session_token text;
  v_qr_topic text;
  v_qr_payload jsonb;
  v_should_emit_qr boolean := false;
begin
  v_location_id := coalesce(new.location_id, old.location_id);

  if v_location_id is null then
    return null;
  end if;

  v_topic := 'location:' || v_location_id::text || ':orders';

  if tg_op = 'DELETE' then
    payload := jsonb_build_object(
      'operation', tg_op,
      'timestamp', now(),
      'data', jsonb_build_object(
        'order', jsonb_build_object(
          'id', old.id,
          'order_number', old.order_number,
          'location_id', old.location_id,
          'station_id', old.station_id
        )
      )
    );
  else
    select station_name into v_station_name
    from public.stations
    where id = new.station_id;

    select count(*) into v_item_count
    from public.order_items
    where order_id = new.id
      and coalesce(is_voided, false) = false;

    if tg_op = 'INSERT' or (
      tg_op = 'UPDATE' and (
        new.payment_status is distinct from old.payment_status or
        new.amount_paid is distinct from old.amount_paid or
        new.amount_due is distinct from old.amount_due
      )
    ) then
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id', op.id,
          'order_id', op.order_id,
          'payment_method', op.payment_method,
          'amount', op.amount,
          'tip_amount', coalesce(op.tip_amount, 0),
          'total_amount', op.total_amount,
          'status', op.status,
          'subtotal_portion', op.subtotal_portion,
          'tax_portion', op.tax_portion,
          'discount_portion', op.discount_portion,
          'amount_tendered', op.amount_tendered,
          'change_given', coalesce(op.change_given, 0),
          'is_cash_priced', coalesce(op.is_cash_priced, false),
          'original_amount', op.original_amount,
          'split_portion_index', op.split_portion_index,
          'split_count', op.split_count,
          'covers_items', coalesce(op.covers_items, array[]::uuid[]),
          'card_type', op.card_type,
          'card_last_four', op.card_last_four,
          'transaction_id', op.transaction_id,
          'terminal_type', op.terminal_type,
          'is_voided', coalesce(op.is_voided, false),
          'void_reason', op.void_reason,
          'refunded_amount', coalesce(op.refunded_amount, 0),
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
          'is_returned', coalesce(op.is_returned, false),
          'returned_at', op.returned_at,
          'returned_by', op.returned_by,
          'return_amount', coalesce(op.return_amount, 0),
          'return_rrn', op.return_rrn,
          'return_auth_code', op.return_auth_code,
          'return_reference_id', op.return_reference_id,
          'return_number', op.return_number,
          'return_reason', op.return_reason
        )
      ), '[]'::jsonb)
      into order_payments_data
      from public.order_payments op
      where op.order_id = new.id
        and op.status in ('captured', 'refunded', 'partially_refunded', 'void');

      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id', opi.id,
          'order_payment_id', opi.order_payment_id,
          'order_item_id', opi.order_item_id,
          'quantity_paid', opi.quantity_paid,
          'unit_price_paid', opi.unit_price_paid,
          'subtotal_paid', opi.subtotal_paid,
          'tax_paid', opi.tax_paid
        )
      ), '[]'::jsonb)
      into payment_items_data
      from public.order_payment_items opi
      join public.order_payments op on op.id = opi.order_payment_id
      where op.order_id = new.id;
    else
      order_payments_data := null;
      payment_items_data := null;
    end if;

    order_data := jsonb_build_object(
      '_broadcast_version', 2,
      'item_count', v_item_count,
      'id', new.id,
      'order_number', new.order_number,
      'display_number', new.display_number,
      'external_id', new.external_id,
      'merchant_id', new.merchant_id,
      'location_id', new.location_id,
      'customer_id', new.customer_id,
      'customer_name', new.customer_name,
      'customer_phone', new.customer_phone,
      'customer_email', new.customer_email,
      'delivery_address', new.delivery_address,
      'created_by_staff_id', new.created_by_staff_id,
      'created_by_user_id', new.created_by_user_id,
      'assigned_server_id', new.assigned_server_id,
      'session_id', new.session_id,
      'station_id', new.station_id,
      'station_name', v_station_name,
      'order_type', new.order_type,
      'order_source', new.order_source,
      'delivery_platform', coalesce(new.delivery_platform, new.metadata->>'delivery_company'),
      'split_payment_path', new.split_payment_path
    );

    order_data := order_data || jsonb_build_object(
      'status', new.status,
      'table_number', new.table_number,
      'seat_number', new.seat_number,
      'check_status', new.check_status,
      'subtotal', new.subtotal,
      'tax_amount', new.tax_amount,
      'tip_amount', new.tip_amount,
      'discount_amount', new.discount_amount,
      'service_charge', new.service_charge,
      'total_amount', new.total_amount,
      'card_subtotal', new.card_subtotal,
      'card_tax_amount', new.card_tax_amount,
      'card_total', new.card_total,
      'cash_subtotal', new.cash_subtotal,
      'cash_tax_amount', new.cash_tax_amount,
      'cash_total', new.cash_total,
      'cash_discount_applied', new.cash_discount_applied,
      'cash_discount_amount', new.cash_discount_amount
    );

    -- SC snapshot fields. Without these, client transformer maps missing
    -- service_charge_is_manual ?? false, wiping the manager override flag on
    -- every broadcast from a discount/item edit. See migration header.
    order_data := order_data || jsonb_build_object(
      'service_charge_name',       new.service_charge_name,
      'service_charge_rate',       new.service_charge_rate,
      'service_charge_applies_on', new.service_charge_applies_on,
      'service_charge_rule_id',    new.service_charge_rule_id,
      'service_charge_is_manual',  new.service_charge_is_manual,
      'service_charge_is_taxable', new.service_charge_is_taxable
    );

    order_data := order_data || jsonb_build_object(
      'effective_subtotal', new.effective_subtotal,
      'effective_tax_amount', new.effective_tax_amount,
      'effective_total', new.effective_total,
      'payment_pricing_mode', new.payment_pricing_mode,
      'payment_status', new.payment_status,
      'amount_paid', new.amount_paid,
      'amount_due', new.amount_due,
      'cash_amount_due', new.cash_amount_due
    );

    order_data := order_data || jsonb_build_object(
      'created_at', new.created_at,
      'updated_at', new.updated_at,
      'sent_to_kitchen_at', new.sent_to_kitchen_at,
      'started_preparing_at', new.started_preparing_at,
      'ready_at', new.ready_at,
      'completed_at', new.completed_at,
      'cancelled_at', new.cancelled_at,
      'voided_at', new.voided_at
    );

    order_data := order_data || jsonb_build_object(
      'voided_by', new.voided_by,
      'void_reason', new.void_reason,
      'cancellation_reason', new.cancellation_reason,
      'sync_version', new.sync_version,
      'is_offline', new.is_offline
    );

    if order_payments_data is not null then
      order_data := order_data || jsonb_build_object(
        'order_payments', order_payments_data,
        'payment_items', payment_items_data
      );
    end if;

    payload := jsonb_build_object(
      'operation', tg_op,
      'timestamp', now(),
      'data', jsonb_build_object(
        'order', order_data
      )
    );

    v_should_emit_qr :=
      new.order_type = 'qr_dine_in'
      and new.online_session_id is not null
      and (
        tg_op = 'INSERT' or
        new.status is distinct from old.status or
        new.payment_status is distinct from old.payment_status or
        new.accepted_at is distinct from old.accepted_at or
        new.sent_to_kitchen_at is distinct from old.sent_to_kitchen_at or
        new.started_preparing_at is distinct from old.started_preparing_at or
        new.ready_at is distinct from old.ready_at or
        new.completed_at is distinct from old.completed_at or
        new.cancelled_at is distinct from old.cancelled_at or
        new.updated_at is distinct from old.updated_at
      );
  end if;

  perform realtime.send(
    payload,
    tg_op,
    v_topic,
    true
  );

  if v_should_emit_qr then
    select s.session_token
      into v_qr_session_token
    from public.online_order_sessions s
    where s.id = new.online_session_id
    limit 1;

    if nullif(trim(coalesce(v_qr_session_token, '')), '') is not null then
      v_qr_topic := 'qr-session:' || v_qr_session_token;
      v_qr_payload := jsonb_build_object(
        'operation', tg_op,
        'timestamp', now(),
        'order_id', new.id,
        'online_session_id', new.online_session_id,
        'status', new.status,
        'payment_status', new.payment_status,
        'updated_at', new.updated_at,
        'table_label', new.table_number,
        'order_type', new.order_type
      );

      perform realtime.send(
        v_qr_payload,
        'qr_order_changed',
        v_qr_topic,
        true
      );
    end if;
  end if;

  return null;

exception
  when others then
    raise warning 'broadcast_order_changes failed: %', sqlerrm;
    return null;
end;
$function$;

COMMENT ON FUNCTION public.broadcast_order_changes() IS
  'Order-update broadcast trigger. v2 payload + SC snapshot columns (service_charge_*). Without the SC snapshots, the client transformer mapped missing service_charge_is_manual ?? false on every broadcast and clobbered manager overrides client-side after any orders-row UPDATE.';
