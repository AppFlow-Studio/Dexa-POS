-- =====================================================================
-- Migration: BEFORE INSERT trigger on order_payments
-- Backstop for processor_fee_percentage_snapshot / dual_pricing_fee / tip_fee
-- =====================================================================
-- Stamps fee columns on card captures whose caller forgot to (process_payment_v9,
-- preauth v1, NMI Edge Function pre-fix). Respects v10 (skips when caller already
-- wrote a real value). Cash and other non-card methods are intentionally untouched.
-- =====================================================================

CREATE OR REPLACE FUNCTION public._stamp_pricing_snapshot()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_pct numeric;
BEGIN
  IF NEW.payment_method::text NOT IN
       ('card','card_spinapi','card_dvpaylite','card_manual','card_online') THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.processor_fee_percentage_snapshot, 0) > 0 THEN
    RETURN NEW;
  END IF;

  -- Source of truth: dual_pricing_percentage is the markup applied to
  -- card prices in add_order_item_v3 / add_open_item_v3. The reported
  -- dual_pricing_fee must match that exact percentage. processor_fee_percentage
  -- is a different concept (the bank's processing fee) and is not used here.
  SELECT dual_pricing_percentage INTO v_pct
    FROM public.locations WHERE id = NEW.location_id;

  IF v_pct IS NULL OR v_pct <= 0 THEN
    RETURN NEW;
  END IF;

  NEW.processor_fee_percentage_snapshot := v_pct;
  -- Fee base = full charge amount sent to the bank (total_amount =
  -- subtotal + tax + tip). The bank withholds pct% of whatever we
  -- authorized, so the reported fee must match. tip_fee is intentionally
  -- 0 because tip is already included in total_amount — splitting the
  -- two would double-count.
  IF COALESCE(NEW.dual_pricing_fee, 0) = 0 THEN
    NEW.dual_pricing_fee := ROUND(COALESCE(NEW.total_amount, NEW.amount, 0) * v_pct / 100, 2);
  END IF;
  IF COALESCE(NEW.tip_fee, 0) = 0 THEN
    NEW.tip_fee := 0;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_payments_stamp_pricing_snapshot ON public.order_payments;

CREATE TRIGGER trg_order_payments_stamp_pricing_snapshot
  BEFORE INSERT ON public.order_payments
  FOR EACH ROW EXECUTE FUNCTION public._stamp_pricing_snapshot();

COMMENT ON FUNCTION public._stamp_pricing_snapshot IS
  'BEFORE INSERT backstop: stamps processor_fee_percentage_snapshot, dual_pricing_fee, tip_fee on card captures when caller left them at 0. No-op for cash/non-card methods, locations with pct=0, or rows already stamped by process_payment_v10. Pure reporting — never modifies amount/charge.';
