-- Dexa POS database hotspot follow-up
-- Date: 2026-07-31
-- Target: run in the staging Supabase SQL Editor as postgres.
--
-- READ-ONLY CONTRACT
-- This file has one WITH/SELECT statement and does not modify database objects
-- or application data. Its single result grid is easier to export from the SQL
-- Editor than a multi-result collector.

WITH database_id AS (
  SELECT oid
  FROM pg_catalog.pg_database
  WHERE datname = current_database()
),
statement_source AS (
  SELECT
    s.queryid,
    s.calls,
    s.total_exec_time,
    s.mean_exec_time,
    s.max_exec_time,
    s.rows,
    s.shared_blks_hit,
    s.shared_blks_read,
    s.temp_blks_read,
    s.temp_blks_written,
    LEFT(s.query, 2000) AS query_text
  FROM extensions.pg_stat_statements s
  WHERE s.dbid = (SELECT oid FROM database_id)
),
top_total AS (
  SELECT
    ROW_NUMBER() OVER (ORDER BY q.total_exec_time DESC)::bigint AS item_rank,
    jsonb_build_object(
      'query_id', q.queryid,
      'calls', q.calls,
      'total_exec_ms', ROUND(q.total_exec_time::numeric, 2),
      'mean_exec_ms', ROUND(q.mean_exec_time::numeric, 2),
      'max_exec_ms', ROUND(q.max_exec_time::numeric, 2),
      'rows', q.rows,
      'shared_blocks_hit', q.shared_blks_hit,
      'shared_blocks_read', q.shared_blks_read,
      'temp_blocks_read', q.temp_blks_read,
      'temp_blocks_written', q.temp_blks_written,
      'query', q.query_text
    ) AS details
  FROM (
    SELECT *
    FROM statement_source
    ORDER BY total_exec_time DESC
    LIMIT 25
  ) q
),
top_calls AS (
  SELECT
    ROW_NUMBER() OVER (ORDER BY q.calls DESC)::bigint AS item_rank,
    jsonb_build_object(
      'query_id', q.queryid,
      'calls', q.calls,
      'total_exec_ms', ROUND(q.total_exec_time::numeric, 2),
      'mean_exec_ms', ROUND(q.mean_exec_time::numeric, 2),
      'rows', q.rows,
      'query', q.query_text
    ) AS details
  FROM (
    SELECT *
    FROM statement_source
    ORDER BY calls DESC
    LIMIT 25
  ) q
),
top_mean AS (
  SELECT
    ROW_NUMBER() OVER (ORDER BY q.mean_exec_time DESC)::bigint AS item_rank,
    jsonb_build_object(
      'query_id', q.queryid,
      'calls', q.calls,
      'total_exec_ms', ROUND(q.total_exec_time::numeric, 2),
      'mean_exec_ms', ROUND(q.mean_exec_time::numeric, 2),
      'max_exec_ms', ROUND(q.max_exec_time::numeric, 2),
      'rows', q.rows,
      'query', q.query_text
    ) AS details
  FROM (
    SELECT *
    FROM statement_source
    WHERE calls >= 10
    ORDER BY mean_exec_time DESC
    LIMIT 25
  ) q
),
priority_tables AS (
  SELECT unnest(ARRAY[
    'orders',
    'order_items',
    'order_item_modifiers',
    'order_discounts',
    'order_payments',
    'kds_item_status',
    'table_sessions',
    'table_session_tables',
    'floor_plan_objects',
    'menu_items',
    'modifier_groups',
    'modifier_group_items'
  ]::text[]) AS table_name
),
index_inventory AS (
  SELECT
    ROW_NUMBER() OVER (
      ORDER BY indexes.tablename, indexes.indexname
    )::bigint AS item_rank,
    jsonb_build_object(
      'table', indexes.tablename,
      'index', indexes.indexname,
      'index_scans', COALESCE(index_stats.idx_scan, 0),
      'rows_read', COALESCE(index_stats.idx_tup_read, 0),
      'rows_fetched', COALESCE(index_stats.idx_tup_fetch, 0),
      'size_bytes', pg_catalog.pg_relation_size(index_class.oid),
      'definition', indexes.indexdef
    ) AS details
  FROM pg_catalog.pg_indexes indexes
  JOIN priority_tables priority
    ON priority.table_name = indexes.tablename
  JOIN pg_catalog.pg_namespace index_namespace
    ON index_namespace.nspname = indexes.schemaname
  JOIN pg_catalog.pg_class index_class
    ON index_class.relnamespace = index_namespace.oid
    AND index_class.relname = indexes.indexname
  LEFT JOIN pg_catalog.pg_stat_user_indexes index_stats
    ON index_stats.indexrelid = index_class.oid
  WHERE indexes.schemaname = 'public'
),
foreign_keys AS (
  SELECT
    constraint_row.oid AS constraint_oid,
    namespace_row.nspname AS schema_name,
    table_row.relname AS table_name,
    constraint_row.conname AS constraint_name,
    constraint_row.conrelid AS table_oid,
    constraint_row.conkey AS key_columns
  FROM pg_catalog.pg_constraint constraint_row
  JOIN pg_catalog.pg_class table_row
    ON table_row.oid = constraint_row.conrelid
  JOIN pg_catalog.pg_namespace namespace_row
    ON namespace_row.oid = table_row.relnamespace
  JOIN priority_tables priority
    ON priority.table_name = table_row.relname
  WHERE constraint_row.contype = 'f'
    AND namespace_row.nspname = 'public'
),
unsupported_foreign_keys AS (
  SELECT
    ROW_NUMBER() OVER (
      ORDER BY fk.table_name, fk.constraint_name
    )::bigint AS item_rank,
    jsonb_build_object(
      'schema', fk.schema_name,
      'table', fk.table_name,
      'constraint', fk.constraint_name,
      'definition', pg_get_constraintdef(fk.constraint_oid)
    ) AS details
  FROM foreign_keys fk
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_index index_row
    WHERE index_row.indrelid = fk.table_oid
      AND index_row.indisvalid
      AND index_row.indisready
      AND ARRAY(
        SELECT key_part.attnum
        FROM unnest(index_row.indkey::smallint[])
          WITH ORDINALITY AS key_part(attnum, position)
        WHERE key_part.position <= cardinality(fk.key_columns)
        ORDER BY key_part.position
      ) = fk.key_columns
  )
),
relation_health AS (
  SELECT
    ROW_NUMBER() OVER (
      ORDER BY stats.seq_tup_read DESC
    )::bigint AS item_rank,
    jsonb_build_object(
      'table', stats.relname,
      'live_rows', stats.n_live_tup,
      'dead_rows', stats.n_dead_tup,
      'sequential_scans', stats.seq_scan,
      'sequential_rows_read', stats.seq_tup_read,
      'index_scans', stats.idx_scan,
      'last_auto_maintenance', stats.last_autovacuum,
      'last_auto_statistics', stats.last_autoanalyze,
      'relation_options', table_row.reloptions
    ) AS details
  FROM pg_catalog.pg_stat_user_tables stats
  JOIN priority_tables priority
    ON priority.table_name = stats.relname
  JOIN pg_catalog.pg_class table_row
    ON table_row.oid = stats.relid
  WHERE stats.schemaname = 'public'
),
collection_window AS (
  SELECT
    1::bigint AS item_rank,
    jsonb_build_object(
      'captured_at', now(),
      'statistics_since', stats.stats_reset,
      'database', current_database(),
      'database_user', current_user,
      'io_timing', current_setting('track_io_timing', true)
    ) AS details
  FROM pg_catalog.pg_stat_database stats
  WHERE stats.datname = current_database()
),
report AS (
  SELECT 'collection_window'::text AS section, item_rank, details
  FROM collection_window
  UNION ALL
  SELECT 'statement_total_cost', item_rank, details
  FROM top_total
  UNION ALL
  SELECT 'statement_call_count', item_rank, details
  FROM top_calls
  UNION ALL
  SELECT 'statement_mean_cost', item_rank, details
  FROM top_mean
  UNION ALL
  SELECT 'index_inventory', item_rank, details
  FROM index_inventory
  UNION ALL
  SELECT 'foreign_key_without_support', item_rank, details
  FROM unsupported_foreign_keys
  UNION ALL
  SELECT 'relation_health', item_rank, details
  FROM relation_health
)
SELECT
  section,
  item_rank,
  details
FROM report
ORDER BY
  CASE section
    WHEN 'collection_window' THEN 1
    WHEN 'statement_total_cost' THEN 2
    WHEN 'statement_call_count' THEN 3
    WHEN 'statement_mean_cost' THEN 4
    WHEN 'index_inventory' THEN 5
    WHEN 'foreign_key_without_support' THEN 6
    WHEN 'relation_health' THEN 7
    ELSE 8
  END,
  item_rank;
