-- ============================================================
-- Fix: get_unsettled_summary_by_terminal return-type mismatch
-- File: utils/supabase/migrations/fix_get_unsettled_summary_by_terminal_status_type.sql
-- ============================================================
-- Bug:
--   RPC threw "structure of query does not match function result
--   type: Returned type character varying(30) does not match
--   expected type text in column 16" (SQLSTATE 42804).
--
-- Root cause:
--   Column 16 of the RETURNS TABLE is `stuck_batch_status text`,
--   but the subquery feeding it selects `settlement_batches.status`,
--   which is stored as character varying(30). Postgres enforces
--   exact type identity on RETURN QUERY columns, so varchar(N) is
--   not accepted where the declared type is text.
--
-- Fix:
--   Cast `sb.status::text` inside the stuck_batch_status subquery.
--   The return-table contract stays as `text` (matches the TS
--   consumer in services/settlementService.ts:44-57). Every other
--   column in the return shape was already sourced from text /
--   uuid / numeric columns, so no other cast is needed.
--
-- Scope:
--   Staging only (project dfwqakoyittmrwbqvxgw). Prod does not
--   have this function yet — it will pick up the correct
--   definition when the settlement feature ships there.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_unsettled_summary_by_terminal(
  p_merchant_id uuid,
  p_location_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  terminal_uuid        uuid,
  terminal_name        text,
  terminal_type        text,
  castles_ip_address   text,
  castles_port         integer,
  is_active            boolean,
  is_connected         boolean,
  payment_count        bigint,
  gross_amount         numeric,
  tip_amount           numeric,
  total_amount         numeric,
  oldest_payment_date  date,
  newest_payment_date  date,
  day_span             integer,
  has_stuck_batch      boolean,
  stuck_batch_status   text,
  stuck_batch_uuid     uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'public', 'pg_temp'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    pt.id                                       AS terminal_uuid,
    pt.terminal_name                            AS terminal_name,
    pt.terminal_type                            AS terminal_type,
    pt.castles_ip_address                       AS castles_ip_address,
    pt.castles_port                             AS castles_port,
    pt.is_active                                AS is_active,
    pt.is_connected                             AS is_connected,

    -- Payment aggregates for unsettled captured payments
    COUNT(op.id)                                AS payment_count,
    COALESCE(SUM(op.amount),      0)            AS gross_amount,
    COALESCE(SUM(op.tip_amount),  0)            AS tip_amount,
    COALESCE(SUM(op.total_amount),0)            AS total_amount,
    MIN(op.approved_at::date)                   AS oldest_payment_date,
    MAX(op.approved_at::date)                   AS newest_payment_date,

    -- day_span: how many days of transactions are unsettled
    -- A merchant who hasn't closed in 5 days shows day_span = 5.
    -- The EOD UI shows: "You have 5 days of unsettled transactions."
    COALESCE(
      (MAX(op.approved_at::date) - MIN(op.approved_at::date)) + 1,
      0
    )::integer                                  AS day_span,

    -- Detect stuck batches: failed/retry/terminal_unavailable
    -- that are blocking this terminal from settling.
    (EXISTS (
      SELECT 1 FROM public.settlement_batches sb
      WHERE sb.payment_terminal_id = pt.id
        AND sb.status IN ('failed', 'retry', 'terminal_unavailable')
    ))                                          AS has_stuck_batch,

    -- Return the status of the stuck batch (for UI messaging).
    -- Cast to text because settlement_batches.status is varchar(30)
    -- and the declared return column is text.
    (SELECT sb.status::text FROM public.settlement_batches sb
     WHERE sb.payment_terminal_id = pt.id
       AND sb.status IN ('failed', 'retry', 'terminal_unavailable')
     ORDER BY sb.opened_at DESC
     LIMIT 1)                                   AS stuck_batch_status,

    (SELECT sb.id FROM public.settlement_batches sb
     WHERE sb.payment_terminal_id = pt.id
       AND sb.status IN ('failed', 'retry', 'terminal_unavailable')
     ORDER BY sb.opened_at DESC
     LIMIT 1)                                   AS stuck_batch_uuid

  FROM public.payment_terminals pt
  -- Left join: include terminals even if they have zero unsettled payments
  -- so the UI can show "all terminals are settled" cleanly.
  LEFT JOIN public.order_payments op ON
    op.terminal_id       = pt.id::text
    AND op.terminal_type = 'castles'
    AND op.is_settled    = false
    AND op.status        = 'captured'

  WHERE
    pt.merchant_id = p_merchant_id
    AND pt.terminal_type = 'castles'
    AND pt.is_active = true
    -- Optional location filter
    AND (p_location_id IS NULL OR pt.location_id = p_location_id)

  GROUP BY
    pt.id, pt.terminal_name, pt.terminal_type,
    pt.castles_ip_address, pt.castles_port,
    pt.is_active, pt.is_connected;
END;
$function$;
