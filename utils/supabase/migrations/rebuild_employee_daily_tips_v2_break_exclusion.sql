-- rebuild_employee_daily_tips_v2: Subtract unpaid break time from hours_worked
-- FLSA compliance fix: tip pool shares must exclude unpaid break time
-- break_logs is jsonb array: [{"start": "...", "end": "..."}, ...]

CREATE OR REPLACE FUNCTION public.rebuild_employee_daily_tips(
  p_location_id UUID,
  p_shift_date  DATE
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_merchant_id     UUID;
  v_timezone        TEXT;
  v_end_hour        INTEGER;
  v_day_start       TIMESTAMPTZ;
  v_day_end         TIMESTAMPTZ;
  v_rows            INTEGER := 0;
BEGIN
  SELECT merchant_id, COALESCE(timezone, 'UTC'), COALESCE(business_day_end_hour, 0)
    INTO v_merchant_id, v_timezone, v_end_hour
  FROM public.locations WHERE id = p_location_id;

  IF v_merchant_id IS NULL THEN
    RAISE EXCEPTION 'Location % not found', p_location_id USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT (is_dexapos_admin() OR v_merchant_id = user_merchant_id()) THEN
    RAISE EXCEPTION 'Not authorized to rebuild tips for this merchant' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_day_start := ((p_shift_date::timestamp + (v_end_hour || ' hours')::interval) AT TIME ZONE v_timezone);
  v_day_end   := (((p_shift_date + 1)::timestamp + (v_end_hour || ' hours')::interval) AT TIME ZONE v_timezone);

  WITH server_activity AS (
    SELECT COALESCE(o.assigned_server_id, o.created_by_staff_id) AS staff_profile_id,
           o.id AS order_id, o.subtotal
    FROM public.orders o
    WHERE o.location_id = p_location_id
      AND o.created_at >= v_day_start AND o.created_at < v_day_end
      AND o.status NOT IN ('cancelled', 'void', 'refunded')
      AND COALESCE(o.assigned_server_id, o.created_by_staff_id) IS NOT NULL
  ),
  -- Split tips by payment method: card vs cash
  server_tips AS (
    SELECT
      sa.staff_profile_id,
      COALESCE(SUM(CASE WHEN op.payment_method != 'cash' THEN op.tip_amount ELSE 0 END), 0)::NUMERIC(12,2) AS card_tips,
      COALESCE(SUM(CASE WHEN op.payment_method = 'cash' THEN op.tip_amount ELSE 0 END), 0)::NUMERIC(12,2) AS cash_payment_tips,
      COALESCE(SUM(sa.subtotal), 0)::NUMERIC(12,2) AS gross_sales
    FROM server_activity sa
    JOIN public.order_payments op ON op.order_id = sa.order_id
    WHERE op.status = 'captured'
    GROUP BY sa.staff_profile_id
  ),
  -- v2: Subtract break_logs duration from raw shift hours for FLSA compliance
  shift_totals AS (
    SELECT ss.staff_profile_id,
      COALESCE(SUM(
        EXTRACT(EPOCH FROM (COALESCE(ss.clock_out_time, now()) - ss.clock_in_time)) / 3600.0
        - COALESCE((
            SELECT SUM(
              EXTRACT(EPOCH FROM (
                (brk->>'end')::timestamptz - (brk->>'start')::timestamptz
              )) / 3600.0
            )
            FROM jsonb_array_elements(ss.break_logs) AS brk
            WHERE brk->>'start' IS NOT NULL AND brk->>'end' IS NOT NULL
          ), 0)
      ), 0)::NUMERIC(6,2) AS hours_worked,
      COALESCE(SUM(ss.declared_cash_tips), 0)::NUMERIC(12,2) AS cash_tips_declared
    FROM public.staff_shifts ss
    WHERE ss.location_id = p_location_id
      AND ss.clock_in_time >= v_day_start AND ss.clock_in_time < v_day_end
    GROUP BY ss.staff_profile_id
  ),
  combined AS (
    SELECT
      COALESCE(st2.staff_profile_id, sh.staff_profile_id) AS staff_profile_id,
      COALESCE(st2.card_tips, 0.00)            AS charged_tips,
      COALESCE(st2.cash_payment_tips, 0.00)    AS cash_payment_tips,
      COALESCE(st2.gross_sales, 0.00)          AS gross_sales,
      COALESCE(sh.hours_worked, 0.00)          AS hours_worked,
      COALESCE(sh.cash_tips_declared, 0.00)    AS cash_tips_declared
    FROM server_tips st2
    FULL OUTER JOIN shift_totals sh USING (staff_profile_id)
  )
  INSERT INTO public.employee_daily_tips (
    staff_profile_id, merchant_id, location_id, shift_date,
    charged_tips, cash_payment_tips, gross_sales, hours_worked, cash_tips_declared
  )
  SELECT c.staff_profile_id, v_merchant_id, p_location_id, p_shift_date,
    c.charged_tips, c.cash_payment_tips, c.gross_sales, c.hours_worked, c.cash_tips_declared
  FROM combined c WHERE c.staff_profile_id IS NOT NULL
  ON CONFLICT (staff_profile_id, location_id, shift_date) DO UPDATE
    SET charged_tips       = EXCLUDED.charged_tips,
        cash_payment_tips  = EXCLUDED.cash_payment_tips,
        gross_sales        = EXCLUDED.gross_sales,
        hours_worked       = EXCLUDED.hours_worked,
        cash_tips_declared = EXCLUDED.cash_tips_declared,
        updated_at         = now()
    WHERE public.employee_daily_tips.is_verified = false;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;
