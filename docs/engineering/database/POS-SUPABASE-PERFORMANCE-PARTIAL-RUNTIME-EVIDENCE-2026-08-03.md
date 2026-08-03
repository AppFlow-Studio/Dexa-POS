# POS Supabase Performance Partial Runtime Evidence — 2026-08-03

## Status

One complete SELECT-only collector export was received. No matching after-export or workflow metadata was completed, so this is a standalone cumulative shared-database snapshot, not a controlled POS runtime measurement.

The static/source audit remains complete. This partial evidence can rank cumulative statement families, but it cannot attribute calls, execution time, or rows to an idle interval, application launch, specific POS workflow, current build, merchant, location, or station.

## Capture Validation

| Item | Value |
| --- | --- |
| Captured at | `2026-08-03 12:50:18.934614+00` |
| Server started at | `2026-04-07 22:21:23.600898+00` |
| `pg_stat_database.stats_reset` | `null` |
| `pg_stat_statements_info.stats_reset` | `2026-05-07 23:24:09.635744+00` |
| Raw rows | 945 |
| Unique query IDs after string normalization | 925 |
| Repeated query-ID groups | 18 groups / 20 extra rows |
| Missing query IDs | 0 |
| Negative cumulative counters | 0 |
| JSON validation | Complete and parseable |
| Source export size | 2,429,588 bytes |
| Source SHA-256 | `933bf2f7afe6da24538c7494a9bb0f29c9c25da8af1f93df80d151b6015c3d0c` |

`statistics_since = null` is not itself an error; it means no database-statistics reset timestamp was reported. A future valid pair would require the value and all other reset/start timestamps to remain identical.

Repeated query IDs occur because `pg_stat_statements` can retain entries for the same query ID under different users or top-level contexts. For this snapshot, counters were summed after normalizing each ID to text. Two repeated IDs retained more than one query-text representation; labels therefore remain descriptive rather than proof of a single caller.

## Cumulative Filtered Workload

After grouping by normalized query ID, the collector's 925 matched IDs contain approximately 1,402,255 cumulative calls and 52,804,679.72 ms (14.668 database-hours) of execution time. This total covers only statements matching the collector predicates and spans statistics retained since May 7. It is neither elapsed capture duration nor POS-attributed runtime.

Largest cumulative entries:

| Query ID | Family | Calls | Total execution ms | Cumulative mean ms | Share of matched execution time |
| --- | --- | ---: | ---: | ---: | ---: |
| `-8490353006299431004` | Broad nested orders/items/payments/discounts | 1,066 | 9,005,198.18 | 8,447.65 | 17.05% |
| `581096186298726757` | Broad order-items/modifiers graph | 7,421 | 8,871,310.59 | 1,195.43 | 16.80% |
| `-1472861306567873516` | `realtime.list_changes` | 966,478 | 8,265,710.39 | 8.55 | 15.65% |
| `4510059032951203860` | Broad order-items/modifiers graph variant | 1,863 | 3,688,167.43 | 1,979.69 | 6.98% |
| `7672211338686057691` | Broad dated orders/items/payments/discounts | 372 | 1,796,805.27 | 4,830.12 | 3.40% |
| `5684226616861766114` | `realtime.list_changes` variant | 164,362 | 1,512,773.69 | 9.20 | 2.86% |
| `-6605467327703146714` | `pos_staff_login_v2` | 1,929 | 1,321,221.66 | 684.93 | 2.50% |

These values corroborate the shared audit's prioritization of nested operational order graphs, nested item/modifier graphs, and Realtime database work. They still do not establish that the audited POS revision generated any particular share.

Historical mutation text appearing in `query_text` does not mean this collector executed those mutations. The collector selected cumulative statement metadata only.

## What Cannot Be Calculated

Without a matching after-export, the following are unavailable:

- `calls_delta`, `total_exec_ms_delta`, and `rows_delta`;
- `delta_mean_ms = total_exec_ms_delta / calls_delta`;
- idle/background contamination rate;
- workflow attribution for login, bootstrap, orders, payments, KDS, reporting, or resume;
- current-POS p50/p95/p99, response bytes, client transform time, heap use, or Realtime delivery latency;
- before/after optimization benefit.

Do not subtract cumulative `mean_exec_ms` or `max_exec_ms`, and do not present cumulative means as current workflow latency.

## Closure Position

The audit may be reviewed and prioritized using static current-source evidence plus this cumulative shared snapshot. Controlled runtime capture remains optional follow-up rather than a prerequisite for reviewing the confirmed correctness, authorization, migration-ownership, and query-shape findings. Runtime-dependent benefit claims and final performance prioritization must remain open until paired evidence is available.
