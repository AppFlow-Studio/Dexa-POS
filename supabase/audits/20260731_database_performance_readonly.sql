-- Dexa POS database performance and architecture audit
-- Date: 2026-07-31
-- Target: run in the Supabase SQL Editor as postgres.
--
-- READ-ONLY CONTRACT
-- This script contains SELECT statements only. It does not create extensions,
-- indexes, functions, views, policies, or other persistent database objects.
-- Save/export every result grid so it can be compared after optimizations.
--
-- pg_stat_statements is cumulative. Record the stats-reset timestamp before
-- interpreting the results. Do not reset statistics as part of this audit.

-- ============================================================================
-- 1. Environment and database settings
-- ============================================================================

SELECT
  now() AS captured_at,
  current_database() AS database_name,
  current_user AS database_user,
  version() AS postgres_version;

SELECT
  e.extname,
  e.extversion,
  n.nspname AS extension_schema
FROM pg_catalog.pg_extension e
JOIN pg_catalog.pg_namespace n ON n.oid = e.extnamespace
WHERE e.extname IN (
  'pg_stat_statements',
  'index_advisor',
  'pg_cron',
  'pg_trgm',
  'hypopg'
)
ORDER BY e.extname;

SELECT
  name,
  setting,
  unit,
  source
FROM pg_catalog.pg_settings
WHERE name IN (
  'autovacuum',
  'effective_cache_size',
  'effective_io_concurrency',
  'idle_in_transaction_session_timeout',
  'max_connections',
  'random_page_cost',
  'shared_buffers',
  'statement_timeout',
  'track_io_timing',
  'work_mem'
)
ORDER BY name;

SELECT
  stats_reset
FROM pg_catalog.pg_stat_database
WHERE datname = current_database();

-- ============================================================================
-- 2. Connections, long-running work, waits, and blocking
-- ============================================================================

SELECT
  usename,
  application_name,
  state,
  wait_event_type,
  wait_event,
  COUNT(*) AS connections
FROM pg_catalog.pg_stat_activity
WHERE datname = current_database()
GROUP BY usename, application_name, state, wait_event_type, wait_event
ORDER BY connections DESC, usename, application_name;

SELECT
  pid,
  usename,
  application_name,
  client_addr,
  state,
  wait_event_type,
  wait_event,
  now() - query_start AS query_age,
  now() - xact_start AS transaction_age,
  LEFT(query, 1000) AS query
FROM pg_catalog.pg_stat_activity
WHERE datname = current_database()
  AND pid <> pg_backend_pid()
  AND state <> 'idle'
ORDER BY query_start NULLS LAST;

SELECT
  blocked.pid AS blocked_pid,
  blocked.usename AS blocked_user,
  now() - blocked.query_start AS blocked_for,
  LEFT(blocked.query, 500) AS blocked_query,
  blocker.pid AS blocker_pid,
  blocker.usename AS blocker_user,
  now() - blocker.query_start AS blocker_for,
  LEFT(blocker.query, 500) AS blocker_query
FROM pg_catalog.pg_stat_activity blocked
JOIN pg_catalog.pg_locks blocked_lock
  ON blocked_lock.pid = blocked.pid
  AND NOT blocked_lock.granted
JOIN pg_catalog.pg_locks blocker_lock
  ON blocker_lock.locktype = blocked_lock.locktype
  AND blocker_lock.database IS NOT DISTINCT FROM blocked_lock.database
  AND blocker_lock.relation IS NOT DISTINCT FROM blocked_lock.relation
  AND blocker_lock.page IS NOT DISTINCT FROM blocked_lock.page
  AND blocker_lock.tuple IS NOT DISTINCT FROM blocked_lock.tuple
  AND blocker_lock.virtualxid IS NOT DISTINCT FROM blocked_lock.virtualxid
  AND blocker_lock.transactionid IS NOT DISTINCT FROM blocked_lock.transactionid
  AND blocker_lock.classid IS NOT DISTINCT FROM blocked_lock.classid
  AND blocker_lock.objid IS NOT DISTINCT FROM blocked_lock.objid
  AND blocker_lock.objsubid IS NOT DISTINCT FROM blocked_lock.objsubid
  AND blocker_lock.pid <> blocked_lock.pid
  AND blocker_lock.granted
JOIN pg_catalog.pg_stat_activity blocker ON blocker.pid = blocker_lock.pid
ORDER BY blocked.query_start;

-- ============================================================================
-- 3. Query workload from pg_stat_statements
-- ============================================================================

-- Highest cumulative database cost.
SELECT
  s.queryid,
  s.calls,
  ROUND(s.total_exec_time::numeric, 2) AS total_exec_ms,
  ROUND(s.mean_exec_time::numeric, 2) AS mean_exec_ms,
  ROUND(s.max_exec_time::numeric, 2) AS max_exec_ms,
  s.rows,
  s.shared_blks_hit,
  s.shared_blks_read,
  s.temp_blks_read,
  s.temp_blks_written,
  LEFT(s.query, 2000) AS query
FROM extensions.pg_stat_statements s
WHERE s.dbid = (
  SELECT oid
  FROM pg_catalog.pg_database
  WHERE datname = current_database()
)
ORDER BY s.total_exec_time DESC
LIMIT 50;

-- Frequently called statements. Small queries can dominate total load when
-- every POS/KDS station executes them continuously.
SELECT
  s.queryid,
  s.calls,
  ROUND(s.mean_exec_time::numeric, 2) AS mean_exec_ms,
  ROUND(s.total_exec_time::numeric, 2) AS total_exec_ms,
  s.rows,
  LEFT(s.query, 2000) AS query
FROM extensions.pg_stat_statements s
WHERE s.dbid = (
  SELECT oid
  FROM pg_catalog.pg_database
  WHERE datname = current_database()
)
ORDER BY s.calls DESC
LIMIT 50;

-- Slowest average statements with enough calls to avoid one-off noise.
SELECT
  s.queryid,
  s.calls,
  ROUND(s.mean_exec_time::numeric, 2) AS mean_exec_ms,
  ROUND(s.max_exec_time::numeric, 2) AS max_exec_ms,
  ROUND(s.total_exec_time::numeric, 2) AS total_exec_ms,
  s.rows,
  LEFT(s.query, 2000) AS query
FROM extensions.pg_stat_statements s
WHERE s.dbid = (
  SELECT oid
  FROM pg_catalog.pg_database
  WHERE datname = current_database()
)
  AND s.calls >= 10
ORDER BY s.mean_exec_time DESC
LIMIT 50;

-- Temp-file and physical-read pressure.
SELECT
  s.queryid,
  s.calls,
  ROUND(s.total_exec_time::numeric, 2) AS total_exec_ms,
  s.shared_blks_read,
  s.temp_blks_read,
  s.temp_blks_written,
  LEFT(s.query, 2000) AS query
FROM extensions.pg_stat_statements s
WHERE s.dbid = (
  SELECT oid
  FROM pg_catalog.pg_database
  WHERE datname = current_database()
)
  AND (
    s.shared_blks_read > 0
    OR s.temp_blks_read > 0
    OR s.temp_blks_written > 0
  )
ORDER BY
  s.temp_blks_written DESC,
  s.shared_blks_read DESC,
  s.total_exec_time DESC
LIMIT 50;

-- POS-specific RPC/query candidates.
SELECT
  s.queryid,
  s.calls,
  ROUND(s.total_exec_time::numeric, 2) AS total_exec_ms,
  ROUND(s.mean_exec_time::numeric, 2) AS mean_exec_ms,
  ROUND(s.max_exec_time::numeric, 2) AS max_exec_ms,
  s.rows,
  LEFT(s.query, 2500) AS query
FROM extensions.pg_stat_statements s
WHERE s.dbid = (
  SELECT oid
  FROM pg_catalog.pg_database
  WHERE datname = current_database()
)
  AND s.query ~* (
    'get_kds_tickets|get_active_orders|get_order_details|'
    'get_floor_plan|get_location_table_status|get_menu|'
    'process_payment|calculate_order_totals|'
    'get_business_day|get_sales_by_item|get_payment_summary'
  )
ORDER BY s.total_exec_time DESC
LIMIT 100;

-- ============================================================================
-- 4. Cache hit, table size, scans, churn, and vacuum health
-- ============================================================================

SELECT
  'index_hit_rate' AS metric,
  ROUND(
    100 * SUM(idx_blks_hit)::numeric
      / NULLIF(SUM(idx_blks_hit + idx_blks_read), 0),
    2
  ) AS percent
FROM pg_catalog.pg_statio_user_indexes
UNION ALL
SELECT
  'table_hit_rate',
  ROUND(
    100 * SUM(heap_blks_hit)::numeric
      / NULLIF(SUM(heap_blks_hit + heap_blks_read), 0),
    2
  )
FROM pg_catalog.pg_statio_user_tables;

SELECT
  schemaname,
  relname AS table_name,
  n_live_tup,
  n_dead_tup,
  seq_scan,
  seq_tup_read,
  idx_scan,
  idx_tup_fetch,
  n_tup_ins,
  n_tup_upd,
  n_tup_del,
  n_tup_hot_upd,
  last_analyze,
  last_autoanalyze,
  last_vacuum,
  last_autovacuum
FROM pg_catalog.pg_stat_user_tables
ORDER BY
  (seq_tup_read + n_dead_tup) DESC,
  relname;

SELECT
  n.nspname AS schema_name,
  c.relname AS table_name,
  pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size,
  pg_size_pretty(pg_relation_size(c.oid)) AS table_size,
  pg_size_pretty(pg_indexes_size(c.oid)) AS index_size,
  COALESCE(s.n_live_tup, 0) AS estimated_live_rows,
  COALESCE(s.n_dead_tup, 0) AS estimated_dead_rows
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_catalog.pg_stat_user_tables s ON s.relid = c.oid
WHERE c.relkind IN ('r', 'p')
  AND n.nspname = 'public'
ORDER BY pg_total_relation_size(c.oid) DESC
LIMIT 100;

SELECT
  schemaname,
  relname AS table_name,
  n_live_tup,
  n_dead_tup,
  ROUND(
    100 * n_dead_tup::numeric / NULLIF(n_live_tup + n_dead_tup, 0),
    2
  ) AS dead_tuple_percent,
  autovacuum_count,
  autoanalyze_count,
  last_autovacuum,
  last_autoanalyze
FROM pg_catalog.pg_stat_user_tables
WHERE n_dead_tup > 0
ORDER BY dead_tuple_percent DESC NULLS LAST, n_dead_tup DESC
LIMIT 100;

-- ============================================================================
-- 5. Index inventory, unused/duplicate indexes, and foreign-key coverage
-- ============================================================================

SELECT
  ui.schemaname,
  ui.relname AS table_name,
  ui.indexrelname AS index_name,
  pg_size_pretty(pg_relation_size(ui.indexrelid)) AS index_size,
  ui.idx_scan,
  ui.idx_tup_read,
  ui.idx_tup_fetch,
  pg_get_indexdef(ui.indexrelid) AS index_definition
FROM pg_catalog.pg_stat_user_indexes ui
JOIN pg_catalog.pg_index i ON i.indexrelid = ui.indexrelid
WHERE NOT i.indisprimary
  AND NOT i.indisunique
  AND ui.idx_scan = 0
ORDER BY pg_relation_size(ui.indexrelid) DESC;

SELECT
  schemaname,
  relname AS table_name,
  ROUND(
    100 * idx_scan::numeric / NULLIF(seq_scan + idx_scan, 0),
    2
  ) AS index_usage_percent,
  seq_scan,
  idx_scan,
  n_live_tup
FROM pg_catalog.pg_stat_user_tables
WHERE seq_scan + idx_scan > 0
ORDER BY index_usage_percent ASC NULLS FIRST, n_live_tup DESC;

WITH index_defs AS (
  SELECT
    n.nspname AS schema_name,
    t.relname AS table_name,
    i.indexrelid,
    ic.relname AS index_name,
    regexp_replace(
      pg_get_indexdef(i.indexrelid),
      '^CREATE (UNIQUE )?INDEX [^ ]+ ',
      'CREATE \1INDEX '
    ) AS normalized_definition
  FROM pg_catalog.pg_index i
  JOIN pg_catalog.pg_class t ON t.oid = i.indrelid
  JOIN pg_catalog.pg_class ic ON ic.oid = i.indexrelid
  JOIN pg_catalog.pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
)
SELECT
  schema_name,
  table_name,
  normalized_definition,
  array_agg(index_name ORDER BY index_name) AS duplicate_indexes,
  COUNT(*) AS duplicate_count
FROM index_defs
GROUP BY schema_name, table_name, normalized_definition
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC, schema_name, table_name;

WITH foreign_keys AS (
  SELECT
    c.oid AS constraint_oid,
    n.nspname AS schema_name,
    t.relname AS table_name,
    c.conname AS constraint_name,
    c.conrelid AS table_oid,
    c.conkey AS key_columns
  FROM pg_catalog.pg_constraint c
  JOIN pg_catalog.pg_class t ON t.oid = c.conrelid
  JOIN pg_catalog.pg_namespace n ON n.oid = t.relnamespace
  WHERE c.contype = 'f'
    AND n.nspname = 'public'
)
SELECT
  fk.schema_name,
  fk.table_name,
  fk.constraint_name,
  pg_get_constraintdef(fk.constraint_oid) AS constraint_definition
FROM foreign_keys fk
WHERE NOT EXISTS (
  SELECT 1
  FROM pg_catalog.pg_index i
  WHERE i.indrelid = fk.table_oid
    AND i.indisvalid
    AND i.indisready
    AND (i.indkey::smallint[])[0:cardinality(fk.key_columns) - 1]
      @> fk.key_columns
)
ORDER BY fk.schema_name, fk.table_name, fk.constraint_name;

-- Full index definitions for the core POS workload.
SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_catalog.pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
    'orders',
    'order_items',
    'order_item_modifiers',
    'order_discounts',
    'order_payments',
    'order_payment_items',
    'order_status_history',
    'kds_item_status',
    'table_sessions',
    'table_session_tables',
    'floor_plan_objects',
    'menu_items',
    'modifier_groups',
    'modifier_group_items',
    'staff_shifts',
    'audit_logs',
    'idempotency_keys'
  )
ORDER BY tablename, indexname;

-- ============================================================================
-- 6. RLS and function safety/performance
-- ============================================================================

SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_catalog.pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- Policies that directly invoke auth helpers per row. Review whether the
-- stable value can be wrapped as (SELECT auth.uid())/(SELECT auth.jwt()) and
-- whether policy predicate columns have supporting indexes.
SELECT
  schemaname,
  tablename,
  policyname,
  qual,
  with_check
FROM pg_catalog.pg_policies
WHERE schemaname = 'public'
  AND (
    COALESCE(qual, '') ~ 'auth\.(uid|jwt)\(\)'
    OR COALESCE(with_check, '') ~ 'auth\.(uid|jwt)\(\)'
  )
ORDER BY tablename, policyname;

SELECT
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  l.lanname AS language,
  p.provolatile AS volatility,
  p.proparallel AS parallel_safety,
  p.prosecdef AS security_definer,
  p.proconfig AS function_config
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
JOIN pg_catalog.pg_language l ON l.oid = p.prolang
WHERE n.nspname = 'public'
  AND p.prosecdef
  AND NOT EXISTS (
    SELECT 1
    FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) AS cfg
    WHERE cfg LIKE 'search_path=%'
  )
ORDER BY p.proname, pg_get_function_identity_arguments(p.oid);

-- Large functions are not automatically slow, but oversized all-in-one RPCs
-- are harder to review, optimize, and retire safely.
SELECT
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  length(pg_get_functiondef(p.oid)) AS definition_bytes,
  p.prosecdef AS security_definer,
  p.provolatile AS volatility
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prokind = 'f'
ORDER BY definition_bytes DESC
LIMIT 100;

-- Version-family sprawl. Confirm usage in pg_stat_statements and every
-- codebase before removing any compatibility function.
SELECT
  regexp_replace(
    p.proname,
    '(_v[0-9]+|_dep|_legacy|_internal)$',
    ''
  ) AS function_family,
  COUNT(*) AS overload_or_version_count,
  array_agg(
    p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
    ORDER BY p.proname, pg_get_function_identity_arguments(p.oid)
  ) AS members
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prokind = 'f'
GROUP BY function_family
HAVING COUNT(*) > 1
ORDER BY overload_or_version_count DESC, function_family;

-- ============================================================================
-- 7. Trigger and Realtime amplification
-- ============================================================================

SELECT
  event_object_schema AS schema_name,
  event_object_table AS table_name,
  trigger_name,
  action_timing,
  event_manipulation,
  action_orientation,
  action_statement
FROM information_schema.triggers
WHERE event_object_schema = 'public'
ORDER BY event_object_table, trigger_name, event_manipulation;

SELECT
  p.pubname,
  n.nspname AS schema_name,
  c.relname AS table_name,
  CASE c.relreplident
    WHEN 'd' THEN 'default'
    WHEN 'n' THEN 'nothing'
    WHEN 'f' THEN 'full'
    WHEN 'i' THEN 'index'
  END AS replica_identity
FROM pg_catalog.pg_publication p
JOIN pg_catalog.pg_publication_rel pr ON pr.prpubid = p.oid
JOIN pg_catalog.pg_class c ON c.oid = pr.prrelid
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
ORDER BY p.pubname, n.nspname, c.relname;

-- ============================================================================
-- 8. Core POS table snapshot
-- ============================================================================

SELECT
  relname AS table_name,
  n_live_tup,
  n_dead_tup,
  seq_scan,
  seq_tup_read,
  idx_scan,
  n_tup_ins,
  n_tup_upd,
  n_tup_del,
  last_autovacuum,
  last_autoanalyze
FROM pg_catalog.pg_stat_user_tables
WHERE relname IN (
  'orders',
  'order_items',
  'order_item_modifiers',
  'order_discounts',
  'order_payments',
  'order_status_history',
  'kds_item_status',
  'table_sessions',
  'table_session_tables',
  'floor_plan_objects',
  'menu_items',
  'modifier_groups',
  'modifier_group_items',
  'staff_shifts',
  'audit_logs',
  'idempotency_keys'
)
ORDER BY relname;

-- ============================================================================
-- 9. EXPLAIN templates (intentionally commented out)
-- ============================================================================

-- Replace placeholders with staging IDs and run these separately. These are
-- read-only functions, but EXPLAIN ANALYZE executes the SELECT and can add
-- load, so run one at a time during a quiet staging window.
--
-- EXPLAIN (ANALYZE, BUFFERS, WAL, VERBOSE, FORMAT JSON)
-- SELECT public.get_kds_tickets_v2(
--   '<location_id>'::uuid,
--   ARRAY['sent', 'preparing', 'ready'],
--   '<kds_display_id>'::uuid
-- );
--
-- EXPLAIN (ANALYZE, BUFFERS, WAL, VERBOSE, FORMAT JSON)
-- SELECT *
-- FROM public.get_active_orders_v1(
--   '<location_id>'::uuid,
--   '<station_id>'::uuid,
--   '<business_day_start>'::timestamptz,
--   200
-- );
--
-- EXPLAIN (ANALYZE, BUFFERS, WAL, VERBOSE, FORMAT JSON)
-- SELECT public.get_order_details('<order_id>'::uuid);
--
-- EXPLAIN (ANALYZE, BUFFERS, WAL, VERBOSE, FORMAT JSON)
-- SELECT public.get_floor_plan_status('<location_id>'::uuid);

