-- =====================================================================
-- W1-2 byte-capture harness — broadcast_order_changes v2 vs v3 payloads
-- =====================================================================
-- READ-ONLY. Not a migration. Run on STAGING (dfwqakoyittmrwbqvxgw) against
-- recent real orders; attach the output table to the W1-2 ticket as the
-- acceptance-criteria evidence.
--
-- Builds, for each sampled order, the exact jsonb payload the v2 trigger
-- (20260712124000) and the v3 trigger (20260713120000) would emit, and
-- compares octet_length per class:
--   header       — plain order write (no payments block; ~99% of fires)
--   pay_cash     — payment-write payload, all payments cash
--   pay_card     — payment-write payload, any card payment
-- Reported: n, p50 / p95 / max bytes for v2 and v3, and % delta.
-- =====================================================================

WITH sampled AS (
  SELECT o.*
  FROM public.orders o
  WHERE o.created_at > now() - interval '14 days'
  ORDER BY o.created_at DESC
  LIMIT 500
),

enriched AS (
  SELECT
    o.*,
    (SELECT s.station_name FROM public.stations s WHERE s.id = o.station_id) AS v_station_name,
    (SELECT count(*) FROM public.order_items oi
      WHERE oi.order_id = o.id AND coalesce(oi.is_voided, false) = false) AS v_item_count
  FROM sampled o
),

pay AS (
  SELECT
    op.order_id,
    bool_or(op.payment_method = 'card') AS has_card,
    count(*) AS n_payments,
    -- ---- v2 per-payment objects (verbatim from 20260712124000) ----
    jsonb_agg(
      jsonb_build_object(
        'id', op.id, 'order_id', op.order_id,
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
    ) AS v2_payments,
    -- ---- v3 per-payment objects (verbatim from 20260713120000) ----
    jsonb_agg(
      jsonb_strip_nulls(
        jsonb_build_object(
          'id', op.id, 'order_id', op.order_id,
          'payment_method', op.payment_method,
          'amount', op.amount,
          'tip_amount', coalesce(op.tip_amount, 0),
          'total_amount', op.total_amount,
          'status', op.status,
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
      ) || jsonb_build_object(
        'subtotal_portion', op.subtotal_portion,
        'tax_portion', op.tax_portion
      )
    ) AS v3_payments
  FROM public.order_payments op
  WHERE op.status IN ('captured', 'refunded', 'partially_refunded', 'void')
    AND op.order_id IN (SELECT id FROM sampled)
  GROUP BY op.order_id
),

pitems AS (
  SELECT
    op.order_id,
    jsonb_agg(jsonb_build_object(
      'id', opi.id,
      'order_payment_id', opi.order_payment_id,
      'order_item_id', opi.order_item_id,
      'quantity_paid', opi.quantity_paid,
      'unit_price_paid', opi.unit_price_paid,
      'subtotal_paid', opi.subtotal_paid,
      'tax_paid', opi.tax_paid
    )) AS v2_items,
    jsonb_agg(jsonb_build_object(
      'order_payment_id', opi.order_payment_id,
      'order_item_id', opi.order_item_id,
      'quantity_paid', opi.quantity_paid,
      'unit_price_paid', opi.unit_price_paid,
      'subtotal_paid', opi.subtotal_paid,
      'tax_paid', opi.tax_paid
    )) AS v3_items
  FROM public.order_payment_items opi
  JOIN public.order_payments op ON op.id = opi.order_payment_id
  WHERE op.order_id IN (SELECT id FROM sampled)
  GROUP BY op.order_id
),

built AS (
  SELECT
    e.id,
    (pay.order_id IS NOT NULL) AS has_payments,
    coalesce(pay.has_card, false) AS has_card,
    -- ---- v2 header (verbatim key set from 20260712124000) ----
    jsonb_build_object(
      '_broadcast_version', 2, 'item_count', e.v_item_count,
      'id', e.id, 'order_number', e.order_number, 'display_number', e.display_number,
      'external_id', e.external_id, 'merchant_id', e.merchant_id, 'location_id', e.location_id,
      'customer_id', e.customer_id, 'customer_name', e.customer_name,
      'customer_phone', e.customer_phone, 'customer_email', e.customer_email,
      'delivery_address', e.delivery_address, 'created_by_staff_id', e.created_by_staff_id,
      'created_by_user_id', e.created_by_user_id, 'assigned_server_id', e.assigned_server_id,
      'session_id', e.session_id, 'station_id', e.station_id, 'station_name', e.v_station_name,
      'order_type', e.order_type, 'order_source', e.order_source,
      'delivery_platform', coalesce(e.delivery_platform, e.metadata->>'delivery_company'),
      'platform_order_number', coalesce(e.platform_order_number, e.metadata->>'provider_order_id'),
      'split_payment_path', e.split_payment_path
    ) || jsonb_build_object(
      'status', e.status, 'table_number', e.table_number, 'seat_number', e.seat_number,
      'check_status', e.check_status, 'subtotal', e.subtotal, 'tax_amount', e.tax_amount,
      'tip_amount', e.tip_amount, 'discount_amount', e.discount_amount,
      'service_charge', e.service_charge, 'total_amount', e.total_amount,
      'card_subtotal', e.card_subtotal, 'card_tax_amount', e.card_tax_amount,
      'card_total', e.card_total, 'cash_subtotal', e.cash_subtotal,
      'cash_tax_amount', e.cash_tax_amount, 'cash_total', e.cash_total,
      'cash_discount_applied', e.cash_discount_applied, 'cash_discount_amount', e.cash_discount_amount
    ) || jsonb_build_object(
      'service_charge_name', e.service_charge_name, 'service_charge_rate', e.service_charge_rate,
      'service_charge_applies_on', e.service_charge_applies_on,
      'service_charge_rule_id', e.service_charge_rule_id,
      'service_charge_is_manual', e.service_charge_is_manual,
      'service_charge_is_taxable', e.service_charge_is_taxable
    ) || jsonb_build_object(
      'effective_subtotal', e.effective_subtotal, 'effective_tax_amount', e.effective_tax_amount,
      'effective_total', e.effective_total, 'payment_pricing_mode', e.payment_pricing_mode,
      'payment_status', e.payment_status, 'amount_paid', e.amount_paid,
      'amount_due', e.amount_due, 'cash_amount_due', e.cash_amount_due
    ) || jsonb_build_object(
      'created_at', e.created_at, 'updated_at', e.updated_at,
      'sent_to_kitchen_at', e.sent_to_kitchen_at, 'started_preparing_at', e.started_preparing_at,
      'ready_at', e.ready_at, 'completed_at', e.completed_at,
      'cancelled_at', e.cancelled_at, 'voided_at', e.voided_at
    ) || jsonb_build_object(
      'voided_by', e.voided_by, 'void_reason', e.void_reason,
      'cancellation_reason', e.cancellation_reason, 'sync_version', e.sync_version,
      'is_offline', e.is_offline
    ) AS v2_header,
    -- ---- v3 header (verbatim key set from 20260713120000) ----
    jsonb_build_object(
      '_broadcast_version', 3, 'item_count', e.v_item_count,
      'id', e.id, 'order_number', e.order_number, 'display_number', e.display_number,
      'location_id', e.location_id,
      'customer_id', e.customer_id, 'customer_name', e.customer_name,
      'customer_phone', e.customer_phone, 'customer_email', e.customer_email,
      'delivery_address', e.delivery_address, 'created_by_staff_id', e.created_by_staff_id,
      'assigned_server_id', e.assigned_server_id,
      'session_id', e.session_id, 'station_id', e.station_id, 'station_name', e.v_station_name,
      'order_type', e.order_type, 'order_source', e.order_source,
      'delivery_platform', coalesce(e.delivery_platform, e.metadata->>'delivery_company'),
      'platform_order_number', coalesce(e.platform_order_number, e.metadata->>'provider_order_id'),
      'split_payment_path', e.split_payment_path
    ) || jsonb_build_object(
      'status', e.status, 'table_number', e.table_number,
      'check_status', e.check_status, 'tax_amount', e.tax_amount,
      'discount_amount', e.discount_amount,
      'service_charge', e.service_charge, 'total_amount', e.total_amount,
      'card_subtotal', e.card_subtotal, 'card_tax_amount', e.card_tax_amount,
      'card_total', e.card_total, 'cash_total', e.cash_total
    ) || jsonb_build_object(
      'service_charge_name', e.service_charge_name, 'service_charge_rate', e.service_charge_rate,
      'service_charge_applies_on', e.service_charge_applies_on,
      'service_charge_rule_id', e.service_charge_rule_id,
      'service_charge_is_manual', e.service_charge_is_manual,
      'service_charge_is_taxable', e.service_charge_is_taxable
    ) || jsonb_build_object(
      'payment_status', e.payment_status, 'amount_paid', e.amount_paid,
      'amount_due', e.amount_due, 'cash_amount_due', e.cash_amount_due
    ) || jsonb_build_object(
      'created_at', e.created_at, 'updated_at', e.updated_at,
      'sent_to_kitchen_at', e.sent_to_kitchen_at, 'completed_at', e.completed_at,
      'sync_version', e.sync_version
    ) AS v3_header,
    pay.v2_payments, pay.v3_payments,
    pitems.v2_items, pitems.v3_items
  FROM enriched e
  LEFT JOIN pay ON pay.order_id = e.id
  LEFT JOIN pitems ON pitems.order_id = e.id
),

sized AS (
  SELECT
    id,
    CASE
      WHEN NOT has_payments THEN 'header'
      WHEN has_card THEN 'pay_card'
      ELSE 'pay_cash'
    END AS class,
    -- full envelope, matching the trigger's realtime.send payload
    octet_length((jsonb_build_object(
      'operation', 'UPDATE', 'timestamp', now(),
      'data', jsonb_build_object('order',
        v2_header || CASE WHEN has_payments
          THEN jsonb_build_object('order_payments', v2_payments, 'payment_items', coalesce(v2_items, '[]'::jsonb))
          ELSE '{}'::jsonb END)
    ))::text) AS v2_bytes,
    octet_length((jsonb_build_object(
      'operation', 'UPDATE', 'timestamp', now(),
      'data', jsonb_build_object('order',
        v3_header || CASE WHEN has_payments
          THEN jsonb_build_object('order_payments', v3_payments, 'payment_items', coalesce(v3_items, '[]'::jsonb))
          ELSE '{}'::jsonb END)
    ))::text) AS v3_bytes
  FROM built
)

SELECT
  class,
  count(*) AS n,
  round(percentile_cont(0.5) WITHIN GROUP (ORDER BY v2_bytes)) AS v2_p50,
  round(percentile_cont(0.5) WITHIN GROUP (ORDER BY v3_bytes)) AS v3_p50,
  round(percentile_cont(0.95) WITHIN GROUP (ORDER BY v2_bytes)) AS v2_p95,
  round(percentile_cont(0.95) WITHIN GROUP (ORDER BY v3_bytes)) AS v3_p95,
  max(v2_bytes) AS v2_max,
  max(v3_bytes) AS v3_max,
  round(100.0 * (1 - avg(v3_bytes)::numeric / nullif(avg(v2_bytes), 0)), 1) AS avg_pct_saved
FROM sized
GROUP BY class
ORDER BY class;

-- =====================================================================
-- Fixture-pair generator (optional): emit the v2/v3 payload jsonb for a
-- handful of orders to refresh __tests__/broadcastV3PayloadTrim.test.ts
-- fixtures with real staging shapes. SCRUB customer PII before checking in.
--
--   SELECT id, v2_header, v3_header, v2_payments, v3_payments
--   FROM built LIMIT 5;
-- (Re-run the CTEs above with this SELECT as the final statement.)
-- =====================================================================
