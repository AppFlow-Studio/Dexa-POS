-- Dexa POS focused workload snapshot
-- Restored for the 2026-08-03 current-staging audit.
-- Target: run in the staging Supabase SQL Editor as postgres.
--
-- READ-ONLY / SELECT-ONLY CONTRACT
-- This file intentionally contains SELECT statements only. It does not reset
-- pg_stat_statements and does not execute, explain, or analyze any mutation.
-- Run once before a controlled POS workflow and once after it, exporting each
-- result as JSON. Compare rows by queryid using cumulative counter deltas:
--   calls_delta         = calls_after - calls_before
--   total_exec_ms_delta = total_exec_ms_after - total_exec_ms_before
--   rows_delta          = rows_after - rows_before
--   delta_mean_ms       = total_exec_ms_delta / calls_delta
-- Do not subtract cumulative mean_exec_ms or max_exec_ms values.

SELECT
  now() AS captured_at,
  pg_catalog.pg_postmaster_start_time() AS server_started_at,
  database_stats.stats_reset AS statistics_since,
  statements_info.stats_reset AS statements_statistics_since,
  statements.queryid,
  statements.calls,
  ROUND(statements.total_exec_time::numeric, 2) AS total_exec_ms,
  ROUND(statements.mean_exec_time::numeric, 2) AS mean_exec_ms,
  ROUND(statements.max_exec_time::numeric, 2) AS max_exec_ms,
  statements.rows,
  statements.shared_blks_hit,
  statements.shared_blks_read,
  statements.temp_blks_read,
  statements.temp_blks_written,
  LEFT(statements.query, 8000) AS query_text
FROM extensions.pg_stat_statements statements
CROSS JOIN extensions.pg_stat_statements_info statements_info
JOIN pg_catalog.pg_database database_row
  ON database_row.oid = statements.dbid
JOIN pg_catalog.pg_stat_database database_stats
  ON database_stats.datid = statements.dbid
WHERE database_row.datname = current_database()
  AND (
    statements.query ILIKE '%orders_order_items%'
    OR statements.query ILIKE '%order_items_order_item_modifiers%'
    OR statements.query ILIKE '%get_active_orders_v1%'
    OR statements.query ILIKE '%get_order_details%'
    OR statements.query ILIKE '%get_kds_tickets_v2%'
    OR statements.query ILIKE '%pos_staff_login_v2%'
    OR statements.query ILIKE '%get_pos_full_sync%'
    OR statements.query ILIKE '%menu_items%'
    OR statements.query ILIKE '%menu_categories%'
    OR statements.query ILIKE '%modifier_groups%'
    OR statements.query ILIKE '%customers%'
    OR statements.query ILIKE '%loyalty%'
    OR statements.query ILIKE '%get_business_day_bounds%'
    OR statements.query ILIKE '%get_business_day_activity_summary%'
    OR statements.query ILIKE '%get_floor_plan_status%'
    OR statements.query ILIKE '%get_location_table_status_v2%'
    OR statements.query ILIKE '%floor_plan_objects%'
    OR statements.query ILIKE '%table_sessions%'
    OR statements.query ILIKE '%process_payment_v%'
    OR statements.query ILIKE '%preauth%'
    OR statements.query ILIKE '%refund%'
    OR statements.query ILIKE '%order_payments%'
    OR statements.query ILIKE '%staff_shifts%'
    OR statements.query ILIKE '%handle_time_clock%'
    OR statements.query ILIKE '%cash_drawer%'
    OR statements.query ILIKE '%reservations%'
    OR statements.query ILIKE '%waitlist%'
    OR statements.query ILIKE '%get_session_variance_analysis%'
    OR statements.query ILIKE '%realtime.list_changes%'
  )
ORDER BY statements.total_exec_time DESC;
