-- =====================================================================
-- Migration: get_business_day_summary_v1 — closing-report wrapper
-- =====================================================================
-- Drop-in replacement that delegates to
-- get_business_day_activity_summary_v1, so the public name keeps working
-- but the result is the closing-report shape (always-populated 10-section
-- aggregate sourced from order_payments, not settlement_batches).
--
-- This fixes the regression where every "Print Today's Summary" returned
-- $0.00 prior to batchout — the previous body listed only settled
-- batches, of which there are typically none until end-of-day.
--
-- Per-batch settled reports remain available via get_batch_summary_v1.
--
-- Rollback: get_business_day_summary_v1_rollback.sql
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_business_day_summary_v1(
  p_location_id   uuid,
  p_business_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT public.get_business_day_activity_summary_v1(p_location_id, p_business_date, NULL);
$function$;

GRANT EXECUTE ON FUNCTION public.get_business_day_summary_v1(uuid, date) TO authenticated;

COMMENT ON FUNCTION public.get_business_day_summary_v1 IS
  'Public closing-report RPC. Thin wrapper around get_business_day_activity_summary_v1 (no terminal filter). Returns the same JSONB shape as that RPC.';
