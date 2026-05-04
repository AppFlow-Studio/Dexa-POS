-- =====================================================================
-- Migration: rebuild_employee_daily_tips_v3 — net charged_tips after processor fee
-- =====================================================================
-- Reality: the bank lumps subtotal + tip together for processing and
-- deducts ~4% of the whole captured amount from the merchant payout.
-- The merchant therefore only RECEIVES ~96% of each charged tip. The
-- existing tip-pool / tip-out logic was distributing the gross tip,
-- which means the merchant was eating the 4% out of pocket on every
-- tipped card sale.
--
-- This migration:
--   1. Adds employee_daily_tips.charged_tips_processor_fee (transparency
--      column — sum of bank fees on this staff's card tips for the day)
--   2. Updates rebuild_employee_daily_tips so:
--        charged_tips                  = SUM(tip_amount - tip_fee)   -- NET
--        charged_tips_processor_fee    = SUM(tip_fee)                -- transparency
--      Cash tips are unaffected (tip_fee=0 on cash rows by construction).
--
-- The pool / tip-out RPC (calculate_tip_distribution_v2) reads
-- charged_tips as before — no change there. Now it distributes the net
-- amount, which is what the merchant actually has to pay out.
--
-- Apply AFTER:
--   - 00_processor_fee_columns.sql
--   - process_payment_v10_processor_fee_pivot.sql
--
-- Rollback: rebuild_employee_daily_tips_v3_processor_fee_net_rollback.sql
-- =====================================================================

ALTER TABLE public.employee_daily_tips
  ADD COLUMN IF NOT EXISTS charged_tips_processor_fee numeric(12,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.employee_daily_tips.charged_tips_processor_fee IS
  'Sum of processor (bank) fees on this staff''s card tips for the day. Informational; charged_tips is already net of this. Reporting use only.';

COMMENT ON COLUMN public.employee_daily_tips.charged_tips IS
  'NET card tips for this staff for the day = SUM(op.tip_amount - op.tip_fee). The bank takes ~4% of every captured card payment (subtotal + tip), so the merchant only receives ~96% of the gross tip. This is the amount actually available to distribute.';

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
  -- v3: net the bank's processor fee out of card tips so charged_tips
  -- reflects what the merchant actually received and has available to
  -- pay out. Cash tips have tip_fee=0 by construction.
  server_tips AS (
    SELECT
      sa.staff_profile_id,
      COALESCE(SUM(CASE WHEN op.payment_method != 'cash'
                        THEN op.tip_amount - COALESCE(op.tip_fee, 0)
                        ELSE 0 END), 0)::NUMERIC(12,2) AS card_tips_net,
      COALESCE(SUM(CASE WHEN op.payment_method != 'cash'
                        THEN COALESCE(op.tip_fee, 0)
                        ELSE 0 END), 0)::NUMERIC(12,2) AS card_tips_processor_fee,
      COALESCE(SUM(CASE WHEN op.payment_method = 'cash' THEN op.tip_amount ELSE 0 END), 0)::NUMERIC(12,2) AS cash_payment_tips,
      COALESCE(SUM(sa.subtotal), 0)::NUMERIC(12,2) AS gross_sales
    FROM server_activity sa
    JOIN public.order_payments op ON op.order_id = sa.order_id
    WHERE op.status = 'captured'
    GROUP BY sa.staff_profile_id
  ),
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
      COALESCE(st2.card_tips_net, 0.00)              AS charged_tips,
      COALESCE(st2.card_tips_processor_fee, 0.00)    AS charged_tips_processor_fee,
      COALESCE(st2.cash_payment_tips, 0.00)          AS cash_payment_tips,
      COALESCE(st2.gross_sales, 0.00)                AS gross_sales,
      COALESCE(sh.hours_worked, 0.00)                AS hours_worked,
      COALESCE(sh.cash_tips_declared, 0.00)          AS cash_tips_declared
    FROM server_tips st2
    FULL OUTER JOIN shift_totals sh USING (staff_profile_id)
  )
  INSERT INTO public.employee_daily_tips (
    staff_profile_id, merchant_id, location_id, shift_date,
    charged_tips, charged_tips_processor_fee,
    cash_payment_tips, gross_sales, hours_worked, cash_tips_declared
  )
  SELECT c.staff_profile_id, v_merchant_id, p_location_id, p_shift_date,
    c.charged_tips, c.charged_tips_processor_fee,
    c.cash_payment_tips, c.gross_sales, c.hours_worked, c.cash_tips_declared
  FROM combined c WHERE c.staff_profile_id IS NOT NULL
  ON CONFLICT (staff_profile_id, location_id, shift_date) DO UPDATE
    SET charged_tips                = EXCLUDED.charged_tips,
        charged_tips_processor_fee  = EXCLUDED.charged_tips_processor_fee,
        cash_payment_tips           = EXCLUDED.cash_payment_tips,
        gross_sales                 = EXCLUDED.gross_sales,
        hours_worked                = EXCLUDED.hours_worked,
        cash_tips_declared          = EXCLUDED.cash_tips_declared,
        updated_at                  = now()
    WHERE public.employee_daily_tips.is_verified = false;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;
