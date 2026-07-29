-- Kiosk channel reporting contract.
--
-- Ticket: [Reporting - Kiosk] Kiosk orders reported separately from in-store POS.
-- Reporting channel key: orders.order_source.
-- Canonical set: pos | kiosk | online_store | orderout.

CREATE OR REPLACE FUNCTION public.normalize_order_source(p_order_source text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT CASE lower(nullif(trim(p_order_source), ''))
    WHEN 'kiosk' THEN 'kiosk'
    WHEN 'online' THEN 'online_store'
    WHEN 'online_store' THEN 'online_store'
    WHEN 'orderout' THEN 'orderout'
    WHEN 'in_store' THEN 'pos'
    WHEN 'instore' THEN 'pos'
    WHEN 'phone' THEN 'pos'
    WHEN 'pos' THEN 'pos'
    ELSE COALESCE(lower(nullif(trim(p_order_source), '')), 'pos')
  END
$$;

CREATE OR REPLACE FUNCTION public.order_source_label(p_order_source text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT CASE public.normalize_order_source(p_order_source)
    WHEN 'pos' THEN 'In-Store'
    WHEN 'kiosk' THEN 'Kiosk'
    WHEN 'online_store' THEN 'Online'
    WHEN 'orderout' THEN 'Delivery Apps'
    ELSE 'Unknown'
  END
$$;

DO $block$
BEGIN
  IF to_regprocedure(
    'public.is_order_reportable(public.order_status,public.payment_status)'
  ) IS NULL THEN
    RAISE EXCEPTION
      'Missing prerequisite: public.is_order_reportable(order_status, payment_status)';
  END IF;
END;
$block$;

UPDATE public.orders
SET order_source = 'online_store'
WHERE lower(order_source) = 'online';

UPDATE public.orders
SET order_source = 'pos'
WHERE order_source IS NULL
   OR lower(order_source) IN ('in_store', 'instore', 'phone');

ALTER TABLE public.orders
  ALTER COLUMN order_source SET DEFAULT 'pos';

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_order_source_canonical;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_order_source_canonical
  CHECK (
    order_source IS NOT NULL
    AND order_source IN ('pos', 'kiosk', 'online_store', 'orderout')
  )
  NOT VALID;

ALTER TABLE public.orders VALIDATE CONSTRAINT orders_order_source_canonical;

CREATE OR REPLACE FUNCTION public.resolve_create_order_source(
  p_station_id uuid,
  p_order_source text
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_station_type text;
  v_source text;
BEGIN
  SELECT s.station_type
    INTO v_station_type
    FROM public.stations s
   WHERE s.id = p_station_id;

  IF v_station_type = 'self_service' THEN
    RETURN 'kiosk';
  END IF;

  v_source := public.normalize_order_source(COALESCE(p_order_source, 'pos'));

  IF v_source = 'kiosk' THEN
    RAISE EXCEPTION 'order_source=kiosk requires a self_service station'
      USING ERRCODE = '23514';
  END IF;

  IF v_source <> 'pos' THEN
    RAISE EXCEPTION 'create_order order_source=% is not supported; use the source-specific ingestion RPC', p_order_source
      USING ERRCODE = '23514';
  END IF;

  RETURN 'pos';
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_order_source_channel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_station_type text;
  v_source text;
BEGIN
  SELECT s.station_type
    INTO v_station_type
    FROM public.stations s
   WHERE s.id = NEW.station_id;

  IF v_station_type = 'self_service' THEN
    NEW.order_source := 'kiosk';
    RETURN NEW;
  END IF;

  v_source := public.normalize_order_source(NEW.order_source);

  IF v_source = 'kiosk' THEN
    RAISE EXCEPTION 'order_source=kiosk requires a self_service station'
      USING ERRCODE = '23514';
  END IF;

  IF v_source NOT IN ('pos', 'online_store', 'orderout') THEN
    RAISE EXCEPTION 'Invalid order_source: %', NEW.order_source
      USING ERRCODE = '23514';
  END IF;

  NEW.order_source := v_source;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS orders_enforce_order_source_channel ON public.orders;

CREATE TRIGGER orders_enforce_order_source_channel
BEFORE INSERT OR UPDATE OF station_id, order_source ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.enforce_order_source_channel();

CREATE OR REPLACE FUNCTION public.create_order_v2(
  p_created_by_staff_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_device_id text,
  p_location_id uuid,
  p_merchant_id uuid,
  p_order_type public.order_type,
  p_special_instructions text,
  p_station_id uuid,
  p_table_number text,
  p_order_source text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_result jsonb;
  v_first jsonb;
  v_order_id uuid;
  v_source text;
BEGIN
  v_source := public.resolve_create_order_source(p_station_id, p_order_source);

  SELECT public.create_order_v2(
    p_created_by_staff_id => p_created_by_staff_id,
    p_customer_name => p_customer_name,
    p_customer_phone => p_customer_phone,
    p_device_id => p_device_id,
    p_location_id => p_location_id,
    p_merchant_id => p_merchant_id,
    p_order_type => p_order_type,
    p_special_instructions => p_special_instructions,
    p_station_id => p_station_id,
    p_table_number => p_table_number
  )::jsonb
  INTO v_result;

  v_first := CASE
    WHEN jsonb_typeof(v_result) = 'array' THEN v_result->0
    ELSE v_result
  END;
  v_order_id := COALESCE(v_first->>'order_id', v_first->>'id')::uuid;

  UPDATE public.orders
     SET order_source = v_source
   WHERE id = v_order_id
     AND order_source IS DISTINCT FROM v_source;

  IF jsonb_typeof(v_result) = 'array' THEN
    RETURN jsonb_set(v_result, '{0,order_source}', to_jsonb(v_source), true);
  END IF;

  RETURN COALESCE(v_result, '{}'::jsonb) || jsonb_build_object('order_source', v_source);
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_order_v3(
  p_created_by_staff_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_device_id text,
  p_idempotency_key uuid,
  p_location_id uuid,
  p_merchant_id uuid,
  p_order_type public.order_type,
  p_special_instructions text,
  p_station_id uuid,
  p_table_number text,
  p_order_source text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_result jsonb;
  v_first jsonb;
  v_order_id uuid;
  v_source text;
BEGIN
  v_source := public.resolve_create_order_source(p_station_id, p_order_source);

  SELECT public.create_order_v3(
    p_created_by_staff_id => p_created_by_staff_id,
    p_customer_name => p_customer_name,
    p_customer_phone => p_customer_phone,
    p_device_id => p_device_id,
    p_idempotency_key => p_idempotency_key,
    p_location_id => p_location_id,
    p_merchant_id => p_merchant_id,
    p_order_type => p_order_type,
    p_special_instructions => p_special_instructions,
    p_station_id => p_station_id,
    p_table_number => p_table_number
  )::jsonb
  INTO v_result;

  v_first := CASE
    WHEN jsonb_typeof(v_result) = 'array' THEN v_result->0
    ELSE v_result
  END;
  v_order_id := COALESCE(v_first->>'order_id', v_first->>'id')::uuid;

  UPDATE public.orders
     SET order_source = v_source
   WHERE id = v_order_id
     AND order_source IS DISTINCT FROM v_source;

  IF jsonb_typeof(v_result) = 'array' THEN
    RETURN jsonb_set(v_result, '{0,order_source}', to_jsonb(v_source), true);
  END IF;

  RETURN COALESCE(v_result, '{}'::jsonb) || jsonb_build_object('order_source', v_source);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_business_day_summary_v2(
  p_location_id uuid,
  p_business_date date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_start_ts timestamptz;
  v_end_ts timestamptz;
  v_base jsonb;
  v_by_channel jsonb;
BEGIN
  IF NOT public.is_dexapos_admin()
     AND NOT COALESCE(p_location_id = ANY(public.user_location_ids()), false) THEN
    RAISE EXCEPTION 'Access denied: location not in user scope';
  END IF;

  SELECT b.start_ts::timestamptz, b.end_ts::timestamptz
    INTO v_start_ts, v_end_ts
    FROM public.get_business_day_bounds(p_location_id, p_business_date, p_business_date) b
   LIMIT 1;

  v_base := COALESCE(public.get_business_day_summary_v1(p_location_id, p_business_date)::jsonb, '{}'::jsonb);

  WITH channels(channel, label, ordinal) AS (
    VALUES
      ('pos'::text, 'In-Store'::text, 1),
      ('kiosk'::text, 'Kiosk'::text, 2),
      ('online_store'::text, 'Online'::text, 3),
      ('orderout'::text, 'Delivery Apps'::text, 4)
  ),
  reportable_payments AS (
    SELECT
      public.normalize_order_source(o.order_source) AS channel,
      p.order_id,
      p.status::text AS payment_status,
      COALESCE(p.is_returned, false) AS is_returned,
      COALESCE(p.amount, 0)::numeric AS amount,
      COALESCE(p.refunded_amount, 0)::numeric AS refunded_amount
    FROM public.order_payments p
    JOIN public.orders o ON o.id = p.order_id
    WHERE p.location_id = p_location_id
      AND p.captured_at >= v_start_ts
      AND p.captured_at < v_end_ts
  ),
  channel_raw AS (
    SELECT
      c.channel,
      c.label,
      c.ordinal,
      COUNT(DISTINCT rp.order_id) FILTER (
        WHERE (
          rp.payment_status IN ('captured', 'partially_refunded', 'refunded')
          OR (rp.payment_status = 'void' AND rp.is_returned = true)
        )
        AND rp.is_returned = false
      )::int AS orders,
      ROUND(COALESCE(SUM(rp.amount) FILTER (
        WHERE (
          rp.payment_status IN ('captured', 'partially_refunded', 'refunded')
          OR (rp.payment_status = 'void' AND rp.is_returned = true)
        )
        AND rp.is_returned = false
      ), 0), 2) AS gross,
      ROUND(
        COALESCE(SUM(rp.amount) FILTER (
          WHERE (
            rp.payment_status IN ('captured', 'partially_refunded', 'refunded')
            OR (rp.payment_status = 'void' AND rp.is_returned = true)
          )
          AND rp.is_returned = true
        ), 0)
        + COALESCE(SUM(rp.refunded_amount) FILTER (
          WHERE (
            rp.payment_status IN ('captured', 'partially_refunded', 'refunded')
            OR (rp.payment_status = 'void' AND rp.is_returned = true)
          )
        ), 0),
        2
      ) AS refunds
    FROM channels c
    LEFT JOIN reportable_payments rp ON rp.channel = c.channel
    GROUP BY c.channel, c.label, c.ordinal
  ),
  channel_totals AS (
    SELECT
      channel,
      label,
      ordinal,
      orders,
      gross,
      ROUND(gross - refunds, 2) AS net
    FROM channel_raw
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'channel', channel,
        'label', label,
        'orders', orders,
        'gross', gross,
        'net', net,
        'avg_ticket', CASE WHEN orders = 0 THEN 0 ELSE ROUND(net / orders, 2) END
      )
      ORDER BY ordinal
    ),
    '[]'::jsonb
  )
  INTO v_by_channel
  FROM channel_totals;

  RETURN v_base || jsonb_build_object('by_channel', v_by_channel);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_sales_by_item_report_v2(
  p_merchant_id uuid,
  p_location_id uuid,
  p_start_date timestamptz,
  p_end_date timestamptz,
  p_order_source text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_filter_source text := CASE
    WHEN p_order_source IS NULL THEN NULL
    ELSE public.normalize_order_source(p_order_source)
  END;
BEGIN
  IF v_filter_source IS NOT NULL
     AND v_filter_source NOT IN ('pos', 'kiosk', 'online_store', 'orderout') THEN
    RAISE EXCEPTION 'Invalid order_source filter: %', p_order_source
      USING ERRCODE = '22023';
  END IF;

  IF NOT public.is_dexapos_admin() THEN
    IF p_merchant_id IS DISTINCT FROM public.user_merchant_id() THEN
      RAISE EXCEPTION 'Access denied: merchant not in user scope';
    END IF;

    IF p_location_id IS NOT NULL
       AND NOT COALESCE(p_location_id = ANY(public.user_location_ids()), false) THEN
      RAISE EXCEPTION 'Access denied: location not in user scope';
    END IF;
  END IF;

  RETURN (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'item_name', item_name,
          'category', category_name,
          'quantity_sold', total_qty,
          'gross_sales', gross_sales,
          'net_sales', net_sales
        )
        ORDER BY gross_sales DESC
      ),
      '[]'::jsonb
    )
    FROM (
      SELECT
        oi.item_name,
        oi.category_name,
        SUM(oi.quantity) AS total_qty,
        SUM(COALESCE(oi.pre_discount_subtotal, oi.subtotal)) AS gross_sales,
        SUM(oi.subtotal) AS net_sales
      FROM public.order_items oi
      JOIN public.orders o ON o.id = oi.order_id
      WHERE o.merchant_id = p_merchant_id
        AND (p_location_id IS NULL OR o.location_id = p_location_id)
        AND public.is_order_reportable(o.status, o.payment_status)
        AND COALESCE(oi.is_voided, false) = false
        AND o.created_at >= p_start_date
        AND o.created_at < p_end_date
        AND (
          v_filter_source IS NULL
          OR public.normalize_order_source(o.order_source) = v_filter_source
        )
      GROUP BY oi.item_name, oi.category_name
    ) stats
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_payment_summary_stats_v2(
  p_from timestamptz,
  p_to timestamptz,
  p_order_source text DEFAULT NULL
)
RETURNS TABLE (
  total_transactions bigint,
  total_failed bigint,
  overall_failure_rate numeric,
  total_chargebacks bigint,
  total_chargeback_amount numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  WITH filtered_payments AS (
    SELECT op.*
    FROM public.order_payments op
    JOIN public.orders o ON o.id = op.order_id
    WHERE op.initiated_at >= p_from
      AND op.initiated_at < p_to
      AND public.is_dexapos_admin()
      AND (
        p_order_source IS NULL
        OR public.normalize_order_source(o.order_source) = public.normalize_order_source(p_order_source)
      )
  ),
  filtered_chargebacks AS (
    SELECT cb.*
    FROM public.chargebacks cb
    JOIN public.order_payments op ON op.id = cb.original_payment_id
    JOIN public.orders o ON o.id = op.order_id
    WHERE cb.received_at >= p_from
      AND cb.received_at < p_to
      AND public.is_dexapos_admin()
      AND (
        p_order_source IS NULL
        OR public.normalize_order_source(o.order_source) = public.normalize_order_source(p_order_source)
      )
  )
  SELECT
    COUNT(fp.id)::bigint AS total_transactions,
    COUNT(*) FILTER (WHERE fp.status::text IN ('failed', 'declined'))::bigint AS total_failed,
    CASE
      WHEN COUNT(fp.id) = 0 THEN 0
      ELSE ROUND((COUNT(*) FILTER (WHERE fp.status::text IN ('failed', 'declined'))::numeric / COUNT(fp.id)::numeric) * 100, 2)
    END AS overall_failure_rate,
    (SELECT COUNT(*)::bigint FROM filtered_chargebacks) AS total_chargebacks,
    (SELECT ROUND(COALESCE(SUM(amount), 0), 2) FROM filtered_chargebacks) AS total_chargeback_amount
  FROM filtered_payments fp;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_transaction_summary_v2(
  p_card_type text DEFAULT NULL,
  p_date_from timestamptz DEFAULT NULL,
  p_date_to timestamptz DEFAULT NULL,
  p_location_ids uuid[] DEFAULT NULL,
  p_max_amount numeric DEFAULT NULL,
  p_merchant_ids uuid[] DEFAULT NULL,
  p_min_amount numeric DEFAULT NULL,
  p_payment_method text[] DEFAULT NULL,
  p_payment_status text[] DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_sort_by text DEFAULT NULL,
  p_sort_dir text DEFAULT NULL,
  p_staff_id uuid DEFAULT NULL,
  p_status text[] DEFAULT NULL
)
RETURNS TABLE (
  channel text,
  channel_label text,
  current_period_from timestamptz,
  current_period_to timestamptz,
  current_total_transactions bigint,
  current_total_revenue numeric,
  current_cash_count bigint,
  current_cash_revenue numeric,
  current_card_count bigint,
  current_card_revenue numeric,
  current_avg_tip numeric,
  current_avg_tip_pct numeric,
  current_void_return_count bigint,
  current_void_return_amount numeric,
  current_void_rate_pct numeric,
  previous_period_from timestamptz,
  previous_period_to timestamptz,
  previous_total_transactions bigint,
  previous_total_revenue numeric,
  previous_cash_count bigint,
  previous_cash_revenue numeric,
  previous_card_count bigint,
  previous_card_revenue numeric,
  previous_avg_tip numeric,
  previous_avg_tip_pct numeric,
  previous_void_return_count bigint,
  previous_void_return_amount numeric,
  previous_void_rate_pct numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_to timestamptz;
  v_from timestamptz;
  v_prev_to timestamptz;
  v_prev_from timestamptz;
  v_window interval;
BEGIN
  v_from := COALESCE(p_date_from, date_trunc('day', now()) - interval '29 days');
  v_to := COALESCE(p_date_to, now());

  IF p_date_from IS NULL AND p_date_to IS NOT NULL THEN
    v_from := p_date_to - interval '29 days';
  END IF;

  IF v_to <= v_from THEN
    v_to := v_from + interval '1 second';
  END IF;

  v_window := v_to - v_from;
  v_prev_to := v_from;
  v_prev_from := v_from - v_window;

  PERFORM p_sort_by, p_sort_dir;

  RETURN QUERY
  WITH channels(channel, label, ordinal) AS (
    VALUES
      ('pos'::text, 'In-Store'::text, 1),
      ('kiosk'::text, 'Kiosk'::text, 2),
      ('online_store'::text, 'Online'::text, 3),
      ('orderout'::text, 'Delivery Apps'::text, 4)
  ),
  scoped_payments AS (
    SELECT
      public.normalize_order_source(o.order_source) AS channel,
      CASE
        WHEN COALESCE(op.captured_at, op.initiated_at, o.created_at) >= v_from
         AND COALESCE(op.captured_at, op.initiated_at, o.created_at) < v_to
        THEN 'current'
        ELSE 'previous'
      END AS period,
      op.payment_method::text AS payment_method,
      op.status::text AS payment_status,
      COALESCE(op.total_amount, op.amount, 0)::numeric AS total_amount,
      COALESCE(op.amount, 0)::numeric AS amount,
      COALESCE(op.tip_amount, 0)::numeric AS tip_amount,
      COALESCE(op.return_amount, op.refunded_amount, 0)::numeric AS return_amount,
      COALESCE(op.is_voided, false) AS is_voided,
      COALESCE(op.is_returned, false) AS is_returned
    FROM public.order_payments op
    JOIN public.orders o ON o.id = op.order_id
    WHERE COALESCE(op.captured_at, op.initiated_at, o.created_at) >= v_prev_from
      AND COALESCE(op.captured_at, op.initiated_at, o.created_at) < v_to
      AND public.is_dexapos_admin()
      AND o.merchant_id IN (
        SELECT allowed_merchant_id
        FROM public.get_admin_merchant_ids() AS allowed_merchant_id
      )
      AND (p_merchant_ids IS NULL OR o.merchant_id = ANY(p_merchant_ids))
      AND (p_location_ids IS NULL OR o.location_id = ANY(p_location_ids))
      AND (p_payment_method IS NULL OR op.payment_method::text = ANY(p_payment_method))
      AND (
        (p_payment_status IS NULL AND op.status::text <> ALL (ARRAY['pending', 'failed']))
        OR (p_payment_status IS NOT NULL AND op.status::text = ANY(p_payment_status))
      )
      AND (p_status IS NULL OR o.status::text = ANY(p_status))
      AND (
        NULLIF(trim(COALESCE(p_card_type, '')), '') IS NULL
        OR EXISTS (
          SELECT 1
          FROM unnest(string_to_array(lower(p_card_type), ',')) AS card_token
          WHERE lower(COALESCE(op.card_type, '')) LIKE '%' || trim(card_token) || '%'
        )
      )
      AND (p_min_amount IS NULL OR COALESCE(op.total_amount, op.amount, 0) >= p_min_amount)
      AND (p_max_amount IS NULL OR COALESCE(op.total_amount, op.amount, 0) <= p_max_amount)
      AND (
        p_staff_id IS NULL
        OR op.processed_by_staff_id = p_staff_id
        OR o.created_by_staff_id = p_staff_id
      )
      AND (
        p_search IS NULL
        OR o.order_number ILIKE '%' || p_search || '%'
        OR o.display_number ILIKE '%' || p_search || '%'
        OR COALESCE(o.customer_name, '') ILIKE '%' || p_search || '%'
        OR COALESCE(op.card_last_four, '') ILIKE '%' || p_search || '%'
        OR COALESCE(op.authorization_code, '') ILIKE '%' || p_search || '%'
        OR COALESCE(op.reference_number, '') ILIKE '%' || p_search || '%'
      )
  ),
  agg AS (
    SELECT
      c.channel,
      c.label,
      c.ordinal,
      COUNT(sp.period) FILTER (WHERE sp.period = 'current')::bigint AS current_total_transactions,
      ROUND(COALESCE(SUM(sp.total_amount) FILTER (
        WHERE sp.period = 'current'
          AND sp.payment_status = 'captured'
          AND sp.payment_method IN ('cash', 'card', 'card_spinapi', 'card_dvpaylite')
      ), 0), 2) AS current_total_revenue,
      COUNT(sp.period) FILTER (
        WHERE sp.period = 'current'
          AND sp.payment_status = 'captured'
          AND sp.payment_method = 'cash'
      )::bigint AS current_cash_count,
      ROUND(COALESCE(SUM(sp.total_amount) FILTER (
        WHERE sp.period = 'current'
          AND sp.payment_status = 'captured'
          AND sp.payment_method = 'cash'
      ), 0), 2) AS current_cash_revenue,
      COUNT(sp.period) FILTER (
        WHERE sp.period = 'current'
          AND sp.payment_status = 'captured'
          AND sp.payment_method IN ('card', 'card_spinapi', 'card_dvpaylite')
      )::bigint AS current_card_count,
      ROUND(COALESCE(SUM(sp.total_amount) FILTER (
        WHERE sp.period = 'current'
          AND sp.payment_status = 'captured'
          AND sp.payment_method IN ('card', 'card_spinapi', 'card_dvpaylite')
      ), 0), 2) AS current_card_revenue,
      ROUND(COALESCE(AVG(sp.tip_amount) FILTER (
        WHERE sp.period = 'current'
          AND sp.payment_status = 'captured'
          AND sp.payment_method IN ('card', 'card_spinapi', 'card_dvpaylite')
      ), 0), 2) AS current_avg_tip,
      ROUND(COALESCE(AVG((sp.tip_amount / NULLIF(sp.amount, 0)) * 100) FILTER (
        WHERE sp.period = 'current'
          AND sp.payment_status = 'captured'
          AND sp.payment_method IN ('card', 'card_spinapi', 'card_dvpaylite')
      ), 0), 2) AS current_avg_tip_pct,
      COUNT(sp.period) FILTER (
        WHERE sp.period = 'current' AND (sp.is_voided OR sp.is_returned)
      )::bigint AS current_void_return_count,
      ROUND(COALESCE(SUM(
        CASE
          WHEN sp.is_returned THEN sp.return_amount
          WHEN sp.is_voided THEN sp.total_amount
          ELSE 0
        END
      ) FILTER (WHERE sp.period = 'current'), 0), 2) AS current_void_return_amount,
      CASE
        WHEN COUNT(sp.period) FILTER (WHERE sp.period = 'current') = 0 THEN 0
        ELSE ROUND((COUNT(sp.period) FILTER (
          WHERE sp.period = 'current' AND (sp.is_voided OR sp.is_returned)
        )::numeric / COUNT(sp.period) FILTER (WHERE sp.period = 'current')::numeric) * 100, 2)
      END AS current_void_rate_pct,
      COUNT(sp.period) FILTER (WHERE sp.period = 'previous')::bigint AS previous_total_transactions,
      ROUND(COALESCE(SUM(sp.total_amount) FILTER (
        WHERE sp.period = 'previous'
          AND sp.payment_status = 'captured'
          AND sp.payment_method IN ('cash', 'card', 'card_spinapi', 'card_dvpaylite')
      ), 0), 2) AS previous_total_revenue,
      COUNT(sp.period) FILTER (
        WHERE sp.period = 'previous'
          AND sp.payment_status = 'captured'
          AND sp.payment_method = 'cash'
      )::bigint AS previous_cash_count,
      ROUND(COALESCE(SUM(sp.total_amount) FILTER (
        WHERE sp.period = 'previous'
          AND sp.payment_status = 'captured'
          AND sp.payment_method = 'cash'
      ), 0), 2) AS previous_cash_revenue,
      COUNT(sp.period) FILTER (
        WHERE sp.period = 'previous'
          AND sp.payment_status = 'captured'
          AND sp.payment_method IN ('card', 'card_spinapi', 'card_dvpaylite')
      )::bigint AS previous_card_count,
      ROUND(COALESCE(SUM(sp.total_amount) FILTER (
        WHERE sp.period = 'previous'
          AND sp.payment_status = 'captured'
          AND sp.payment_method IN ('card', 'card_spinapi', 'card_dvpaylite')
      ), 0), 2) AS previous_card_revenue,
      ROUND(COALESCE(AVG(sp.tip_amount) FILTER (
        WHERE sp.period = 'previous'
          AND sp.payment_status = 'captured'
          AND sp.payment_method IN ('card', 'card_spinapi', 'card_dvpaylite')
      ), 0), 2) AS previous_avg_tip,
      ROUND(COALESCE(AVG((sp.tip_amount / NULLIF(sp.amount, 0)) * 100) FILTER (
        WHERE sp.period = 'previous'
          AND sp.payment_status = 'captured'
          AND sp.payment_method IN ('card', 'card_spinapi', 'card_dvpaylite')
      ), 0), 2) AS previous_avg_tip_pct,
      COUNT(sp.period) FILTER (
        WHERE sp.period = 'previous' AND (sp.is_voided OR sp.is_returned)
      )::bigint AS previous_void_return_count,
      ROUND(COALESCE(SUM(
        CASE
          WHEN sp.is_returned THEN sp.return_amount
          WHEN sp.is_voided THEN sp.total_amount
          ELSE 0
        END
      ) FILTER (WHERE sp.period = 'previous'), 0), 2) AS previous_void_return_amount,
      CASE
        WHEN COUNT(sp.period) FILTER (WHERE sp.period = 'previous') = 0 THEN 0
        ELSE ROUND((COUNT(sp.period) FILTER (
          WHERE sp.period = 'previous' AND (sp.is_voided OR sp.is_returned)
        )::numeric / COUNT(sp.period) FILTER (WHERE sp.period = 'previous')::numeric) * 100, 2)
      END AS previous_void_rate_pct
    FROM channels c
    LEFT JOIN scoped_payments sp ON sp.channel = c.channel
    GROUP BY c.channel, c.label, c.ordinal
  )
  SELECT
    a.channel,
    a.label,
    v_from,
    v_to,
    a.current_total_transactions,
    a.current_total_revenue,
    a.current_cash_count,
    a.current_cash_revenue,
    a.current_card_count,
    a.current_card_revenue,
    a.current_avg_tip,
    a.current_avg_tip_pct,
    a.current_void_return_count,
    a.current_void_return_amount,
    a.current_void_rate_pct,
    v_prev_from,
    v_prev_to,
    a.previous_total_transactions,
    a.previous_total_revenue,
    a.previous_cash_count,
    a.previous_cash_revenue,
    a.previous_card_count,
    a.previous_card_revenue,
    a.previous_avg_tip,
    a.previous_avg_tip_pct,
    a.previous_void_return_count,
    a.previous_void_return_amount,
    a.previous_void_rate_pct
  FROM agg a
  ORDER BY a.ordinal;
END;
$function$;

REVOKE ALL ON FUNCTION public.resolve_create_order_source(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_order_source_channel() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_order_v2(uuid, text, text, text, uuid, uuid, public.order_type, text, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_order_v3(uuid, text, text, text, uuid, uuid, uuid, public.order_type, text, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_business_day_summary_v2(uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_sales_by_item_report_v2(uuid, uuid, timestamptz, timestamptz, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_payment_summary_stats_v2(timestamptz, timestamptz, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_admin_transaction_summary_v2(text, timestamptz, timestamptz, uuid[], numeric, uuid[], numeric, text[], text[], text, text, text, uuid, text[]) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.normalize_order_source(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.order_source_label(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_order_v2(uuid, text, text, text, uuid, uuid, public.order_type, text, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_order_v3(uuid, text, text, text, uuid, uuid, uuid, public.order_type, text, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_business_day_summary_v2(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_sales_by_item_report_v2(uuid, uuid, timestamptz, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_payment_summary_stats_v2(timestamptz, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_transaction_summary_v2(text, timestamptz, timestamptz, uuid[], numeric, uuid[], numeric, text[], text[], text, text, text, uuid, text[]) TO authenticated;

COMMENT ON CONSTRAINT orders_order_source_canonical ON public.orders IS
  'Canonical reporting channels only: pos, kiosk, online_store, orderout.';

COMMENT ON FUNCTION public.get_business_day_summary_v2(uuid, date) IS
  'Business-day summary v1 payload plus by_channel breakdown keyed by orders.order_source.';

COMMENT ON FUNCTION public.get_sales_by_item_report_v2(uuid, uuid, timestamptz, timestamptz, text) IS
  'Sales-by-item report with optional canonical order_source filter; NULL preserves all-channel behavior.';

COMMENT ON FUNCTION public.get_payment_summary_stats_v2(timestamptz, timestamptz, text) IS
  'Payment summary stats with optional canonical order_source filter; NULL preserves all-channel behavior.';

COMMENT ON FUNCTION public.get_admin_transaction_summary_v2(text, timestamptz, timestamptz, uuid[], numeric, uuid[], numeric, text[], text[], text, text, text, uuid, text[]) IS
  'HQ transaction summary segmented by canonical orders.order_source channel.';
