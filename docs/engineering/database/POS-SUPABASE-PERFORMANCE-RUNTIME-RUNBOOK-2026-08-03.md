# POS Supabase Performance Runtime Capture Runbook — 2026-08-03

## Purpose

This runbook attributes shared staging `pg_stat_statements` work to controlled POS workflows. The current static audit and the shared database snapshot identify likely hot query families, but they do not prove which current POS workflows produced the cumulative database work.

Do not use the returned files to make POS runtime claims until the before/after pairs pass the reset, contamination, and fixture checks below.

## Safety Contract

- Run only against the staging project and an approved QA merchant/location.
- The collector is `supabase/audits/20260731_database_workload_delta_readonly.sql`.
- The collector contains SELECT statements only. Do not add `pg_stat_statements_reset()`, DDL, DML, `VACUUM`, or mutation RPCs.
- Do not run `EXPLAIN ANALYZE` on writes or state-changing RPCs.
- The POS workflows themselves intentionally exercise normal staging behavior. Use disposable QA orders, payments, shifts, drawers, and sessions; never use production.
- Run one operator/device unless a workflow explicitly calls for two stations.
- Keep website QA, scheduled jobs, imports, and other POS testers out of the selected staging location during each capture.
- Do not change feature flags, app version, station, merchant, fixture, or network profile between a before/after pair.

## Audited Source

- Branch: `audit/pos-database-refresh`
- Commit: `a1c7a032479bdfc533f28e29eb983824077742c1`
- Previous evidence commit: `7a6ab3069840de5da926e71a3b05caca3f2700ff`

Record the actual installed POS build identifier and environment in `00-run-metadata.json`; a build from another commit is a different experiment.

## Fixed Fixture

Before starting, prepare and record:

- one QA merchant and location;
- one normal POS station, one KDS station, and optionally a second POS station;
- one manager and one ordinary staff PIN;
- a menu with at least 10 categories, 100 items, 10 modifier groups, and recipes on a known subset;
- at least 200 historical orders in the Previous Orders window if available;
- 20 active orders for bootstrap, including item modifiers and payments;
- 25 visible KDS tickets if available, including routed, rushed, void/refund-notice, Ready, and Done cases;
- one floor plan with at least 50 objects and 20 active sessions if available;
- one open shift and cash drawer session;
- terminal simulator/test mode only for payment workflows.

If staging cannot provide a target size, record the actual cardinalities. Do not silently extrapolate a smaller fixture as measured 10x/100x behavior.

## Capture Procedure

For every workflow pair:

1. Confirm no unrelated tester is using the QA location.
2. Wait 60 seconds after the prior workflow so queued retries and Realtime convergence settle.
3. Run the collector in Supabase SQL Editor and export the complete result as the workflow's `before.json` file.
4. Perform only the listed workflow, once, unless an operation count is specified.
5. Wait 15 seconds for queued requests and Realtime delivery. For offline replay, wait until the POS queue is empty and the UI reports synchronized.
6. Run the unchanged collector again and export the complete result as the workflow's `after.json` file.
7. Record client-observed elapsed time, operation count, visible result, errors, retry/verifying state, and approximate response bytes if available in the matching metadata entry.
8. Stop if `server_started_at`, `statistics_since`, or `statements_statistics_since` changes within a pair, or if any cumulative counter decreases. Mark the pair invalid and repeat it later; do not reset statistics.

Export JSON, not screenshots or copied tables. Preserve integer `queryid` values as strings if the exporter would otherwise round 64-bit integers.

## Workflows and Exact Export Names

### 00 — Idle contamination control

- Export `00-idle-before.json`.
- Leave both stations connected and untouched for five minutes.
- Export `00-idle-after.json`.
- This establishes background Realtime, heartbeat, polling, and scheduled-work noise. It is a contamination bound, not a value to subtract automatically from every workflow.

### 01 — PIN login and cold POS bootstrap

- Start signed out with the app process stopped and normal network connectivity.
- Export `01-login-cold-boot-before.json`.
- Launch, select the fixed store/station if required, sign in with the ordinary staff PIN, and wait until menu, config, floor, active orders, inventory, and sync indicators settle.
- Export `01-login-cold-boot-after.json`.

### 02 — Active orders and one order detail

- Export `02-active-orders-detail-before.json`.
- Force one active-order refresh, open one representative order containing at least 10 items, modifiers, discounts, and two payments, then close its detail view without mutating it.
- Export `02-active-orders-detail-after.json`.

### 03 — Table/session and check lifecycle

- Export `03-table-check-lifecycle-before.json`.
- Seat one table, create one order, add five items with modifiers, edit one item, send to kitchen, close the check, and reopen it once with the approved manager flow.
- Export `03-table-check-lifecycle-after.json`.
- Record whether `close_check`, `reopen_check`, `seat_guests_v3`, and idempotent-vNext flags were enabled in the build.

### 04 — Offline queue and replay

- Export `04-offline-replay-before.json` while online.
- Disconnect the POS network, create one disposable order, add five items/modifiers, perform one non-card workflow approved for offline QA, then reconnect.
- Wait until the queue is empty and all local IDs are reconciled.
- Export `04-offline-replay-after.json`.
- Record queued operation types, retry counts, blocked/failed items, and the exact RPC feature-flag state. Do not include real card data.

### 05 — Payment, preauthorization, void/refund recovery

- Use simulator/test terminals and disposable orders only.
- Export `05-payment-preauth-refund-before.json`.
- Perform one full cash payment, one test card payment, one preauthorization plus incremental update/capture or void as supported, and one partial refund. Allow all verification journals to reach a terminal state.
- Export `05-payment-preauth-refund-after.json`.
- Record the actual selected RPC versions (`process_payment_v12`, `v16`, or `v17`; preauth `v1`, `v3`, or `v4`) and whether the calls came from the direct path or offline replay.

### 06 — KDS load and state transitions

- Export `06-kds-workflow-before.json`.
- Cold-open the KDS, wait for its initial ticket and online-order bootstrap, acknowledge one notice, advance five items through configured states, exercise one rush/priority action, and allow one server-authoritative Done reconciliation.
- Export `06-kds-workflow-after.json`.
- Record display ID, routing mode, visible ticket/item/modifier counts, and whether Realtime stayed connected.

### 07 — Previous Orders and detail

- Export `07-previous-orders-before.json`.
- Open Previous Orders, load the first 50-row page, change one channel/provider filter, move to the next page, return to the first page, and open one detailed order.
- Export `07-previous-orders-after.json`.
- Record the date window and actual matching row count; do not combine an export or a different date range in this pair.

### 08 — Timeclock, cash drawer, and End of Day

- Export `08-timeclock-eod-before.json`.
- Exercise one approved clock action, open the EOD flow, refresh the checklist, generate the daily summary, and open the cash step. Do not finalize a real batch or mutate production-like financial state.
- Export `08-timeclock-eod-after.json`.
- Record the business date, number of orders/payments/items/shifts/drawer sessions in scope, and number of variance RPC calls.

### 09 — Resume and Realtime recovery

- Export `09-resume-realtime-before.json`.
- Background and foreground the POS five times using the same timing each cycle; include one network disconnect/reconnect cycle and make one change from the second station while the first is backgrounded.
- Wait for active-order and floor state to converge.
- Export `09-resume-realtime-after.json`.
- Record channel reconnect counts and any full floor/order refreshes observed in client telemetry.

### 10 — Analytics dashboard

- Export `10-analytics-before.json`.
- Open the analytics dashboard for the fixed location and a fixed seven-day range, wait for every summary/card/list to settle, then change to the agreed 30-day range once.
- Export `10-analytics-after.json`.
- Record the location/date bounds, order/payment/session/item/customer cardinalities, response bytes if observable, JavaScript transform time, and peak heap delta. Do not combine export/download behavior with this pair.

## Required Return Package

Return exactly this directory, without renaming files:

```text
pos-db-runtime-2026-08-03/
  00-run-metadata.json
  00-idle-before.json
  00-idle-after.json
  01-login-cold-boot-before.json
  01-login-cold-boot-after.json
  02-active-orders-detail-before.json
  02-active-orders-detail-after.json
  03-table-check-lifecycle-before.json
  03-table-check-lifecycle-after.json
  04-offline-replay-before.json
  04-offline-replay-after.json
  05-payment-preauth-refund-before.json
  05-payment-preauth-refund-after.json
  06-kds-workflow-before.json
  06-kds-workflow-after.json
  07-previous-orders-before.json
  07-previous-orders-after.json
  08-timeclock-eod-before.json
  08-timeclock-eod-after.json
  09-resume-realtime-before.json
  09-resume-realtime-after.json
  10-analytics-before.json
  10-analytics-after.json
```

`00-run-metadata.json` must contain:

- capture timestamps and operator;
- POS branch, commit, build ID, platform, and device model;
- Supabase project reference and confirmation that it is staging;
- merchant, location, and station IDs (no PINs or secrets);
- fixture cardinalities for each workflow;
- network profile and Realtime connection status;
- relevant feature flags and selected payment/preauth RPC versions;
- workflow elapsed times, operation counts, errors/retries, and visible correctness notes;
- confirmation that no statistics reset or database mutation was executed by the collector.

## Delta Calculation

Join each valid pair by `queryid`. For a row present on only one side, investigate before treating the missing cumulative counters as zero; eviction/deallocation can make a pair incomplete.

For each query ID:

```text
calls_delta         = calls_after - calls_before
total_exec_ms_delta = total_exec_ms_after - total_exec_ms_before
rows_delta          = rows_after - rows_before
delta_mean_ms       = total_exec_ms_delta / calls_delta
```

- Compute `delta_mean_ms` only when `calls_delta > 0`.
- Do not subtract cumulative `mean_exec_ms` or `max_exec_ms` values.
- Also compute shared-block and temporary-block deltas, but do not translate them into storage latency while `track_io_timing` is off.
- Normalize by the explicit operation count where a workflow repeats an action.
- Compare workflow deltas with the five-minute idle control. If background calls overlap materially, mark attribution low-confidence or repeat in a quieter window.
- A query family may have several query IDs because payload shape, selected columns, role, or normalized statement text differs. Preserve both the per-query rows and the grouped family total.

## Acceptance and Rejection Rules

A pair is acceptable only when:

- reset/start timestamps match;
- all deltas are non-negative;
- both exports came from the same staging database and collector version;
- the fixture and workflow are recorded;
- unrelated activity was absent or bounded by the idle control;
- client-visible correctness completed successfully.

Reject and repeat a pair when the server or statistics reset, the app/build/flag state changed, JSON is truncated, a workflow overlaps another test, or retries continue after the `after` capture.

## What This Evidence Can and Cannot Prove

Valid deltas can attribute calls, execution time, and rows to a controlled workflow with stated confidence. They still do not provide client p95/p99, network transfer bytes, end-to-end Realtime delay, or production-scale behavior unless those are captured separately. Staging results must not be presented as production capacity or as achieved remediation benefits.
