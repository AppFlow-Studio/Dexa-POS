-- Dexa POS focused workload snapshot
-- Date: 2026-07-31
-- Target: run in the staging Supabase SQL Editor as postgres.
--
-- READ-ONLY CONTRACT
-- Run once before a controlled POS test and once after it. Compare each
-- query_id's calls and total_exec_ms between the two exports.

SELECT
  now() AS captured_at,
  pg_catalog.pg_postmaster_start_time() AS server_started_at,
  database_stats.stats_reset AS statistics_since,
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
    OR statements.query ILIKE '%realtime.list_changes%'
  )
ORDER BY statements.total_exec_time DESC;
