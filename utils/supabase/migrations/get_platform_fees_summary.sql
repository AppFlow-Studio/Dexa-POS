-- =====================================================================
-- Migration: get_platform_fees_summary — merchant-scoped fee reporting
-- =====================================================================
-- Sums platform fees over a [period_start, period_end) range for a
-- merchant (optionally a single location). Returns:
--   - gross_dual_pricing_fee, gross_tip_fee
--   - refunded_dual_pricing_fee, refunded_tip_fee
--   - net_platform_fee (= gross - refunded)
--   - payment_count
--
-- Status predicate matches idx_order_payments_fees_location_period
-- exactly so the planner uses the partial index. Per
-- project_voided_payment_refunded_amount:
--   * 'captured' / 'partially_refunded' / 'refunded': real money flowed
--   * 'void' AND is_returned=true: refund-via-void (real cash returned)
--   * 'void' AND is_returned=false: pure cancellation — EXCLUDED
--
-- Period attribution: filtered by captured_at. A capture in March
-- refunded in April attributes both gross and refund to March (matches
-- the "month a sale was made" merchant invoicing semantics).
--
-- RLS: uses user_merchant_id() / user_location_ids() guard. Caller must
-- own the merchant; if p_location_id is supplied, must also be in the
-- caller's location scope.
--
-- Apply AFTER:
--   - 00_platform_fee_columns_columns_only.sql
--   - 00_platform_fee_index.sql
--
-- Rollback: get_platform_fees_summary_rollback.sql
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_platform_fees_summary(
  p_merchant_id uuid,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_location_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF p_merchant_id IS DISTINCT FROM user_merchant_id() THEN
    RAISE EXCEPTION 'Access denied: merchant scope mismatch';
  END IF;

  IF p_location_id IS NOT NULL
     AND NOT (p_location_id = ANY(user_location_ids())) THEN
    RAISE EXCEPTION 'Access denied: location not in user scope';
  END IF;

  SELECT jsonb_build_object(
    'gross_dual_pricing_fee',    COALESCE(SUM(dual_pricing_fee), 0),
    'gross_tip_fee',             COALESCE(SUM(tip_fee), 0),
    'refunded_dual_pricing_fee', COALESCE(SUM(refunded_dual_pricing_fee), 0),
    'refunded_tip_fee',          COALESCE(SUM(refunded_tip_fee), 0),
    'net_platform_fee', COALESCE(SUM(
      dual_pricing_fee + tip_fee
      - refunded_dual_pricing_fee - refunded_tip_fee), 0),
    'payment_count', COUNT(*)
  ) INTO v_result
  FROM public.order_payments
  WHERE merchant_id = p_merchant_id
    AND (p_location_id IS NULL OR location_id = p_location_id)
    AND captured_at >= p_period_start
    AND captured_at <  p_period_end
    AND (
      status IN ('captured', 'partially_refunded', 'refunded')
      OR (status = 'void' AND COALESCE(is_returned, false) = true)
    );

  RETURN v_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_platform_fees_summary(uuid, timestamptz, timestamptz, uuid)
  TO authenticated;

COMMENT ON FUNCTION public.get_platform_fees_summary IS
  'Merchant-scoped platform-fee reporting RPC. Sums gross/refunded dual_pricing_fee + tip_fee over [period_start, period_end). RLS-guarded via user_merchant_id() / user_location_ids(). Status predicate matches idx_order_payments_fees_location_period.';
