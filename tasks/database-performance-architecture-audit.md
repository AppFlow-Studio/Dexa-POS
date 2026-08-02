# Database Performance and Architecture Audit

## Summary

This audit applies the same evidence-first approach used for the POS app
performance audit to the shared Supabase/PostgreSQL backend. The objective is
to make the database faster, more predictable under merchant load, easier to
migrate safely, and easier to diagnose before adding infrastructure such as
Redis.

This is not an approval to deploy speculative indexes, rewrite payment
functions, or add Redis. Phase 1 is a read-only static and deployed-contract
audit. Phase 2 requires live PostgreSQL statistics and execution plans before
any optimization migration is written.

Audit date: `2026-07-31`

Live contract inspected: staging project `dfwqakoyittmrwbqvxgw`

## Status

- Phase 1 static repository audit: complete.
- Deployed PostgREST contract inventory: complete.
- Lightweight staging relation estimates: complete.
- Low-level PostgreSQL workload and live-index evidence: collected; controlled
  delta snapshots and execution plans remain pending.
- Performance migrations: not started.
- Redis implementation: not recommended yet.

## Scope

Included:

- Supabase/PostgreSQL schema and migration organization.
- Deployed RPC and relation surface.
- POS query/RPC call patterns.
- Hot operational paths: active orders, KDS, floor plans, payments, menus,
  reporting, Realtime triggers, and audit/history tables.
- Index, RLS, function, trigger, bloat, vacuum, lock, connection, and query
  statistics.
- Migration quality and function-version retirement.
- Redis suitability and safe cache boundaries.
- Before/after performance measurement and rollout gates.

Excluded from this phase:

- Production writes.
- Applying or changing migrations.
- Resetting `pg_stat_statements`.
- Changing payment/order correctness logic.
- Adding Redis credentials or client libraries.
- Guessing indexes without live plans and usage statistics.

## Access and Evidence

The repository contains an ignored local `.env` with staging Supabase
credentials. It is not tracked by Git. Those credentials allow read-only
inspection of the deployed PostgREST/OpenAPI surface and authorized table
reads. They do not provide a direct PostgreSQL connection or access to
`pg_stat_statements`, `pg_stat_activity`, planner statistics, index usage, or
`EXPLAIN`.

The read-only collector is:

`supabase/audits/20260731_database_performance_readonly.sql`

Run it in the staging Supabase SQL Editor as `postgres`, export every result
grid, and return the output for Phase 2. It contains only `SELECT` statements.

The SQL Editor run returned only the collector's final result grid. The
single-result follow-up collector is:

`supabase/audits/20260731_database_hotspots_followup_readonly.sql`

It returns the statistics window, top statements, priority-table index
inventory, foreign keys without a supporting index, and relation health in one
exportable grid. It contains one `WITH`/`SELECT` statement.

The focused delta collector is:

`supabase/audits/20260731_database_workload_delta_readonly.sql`

Run it immediately before and after a controlled POS test. It identifies which
current client paths increment without clearing cumulative database statistics.

## Current Inventory

### Deployed staging contract

- Approximately `240` exposed relations/views.
- Approximately `541` exposed RPC paths.
- `12` deployed `process_payment` generations (`v6` through `v17`).
- Multiple live version families for refunds, pre-authorizations, order-item
  mutations, reports, and service-charge overrides.

### POS repository call surface

Static literal-call analysis found:

- `152` distinct literal `.rpc("...")` names across `216` call sites.
- `71` directly accessed relations across `386` `.from("...")` call sites.
- `52` direct `orders` access sites in app/service/store code.
- `26` direct `.select("*")` sites.

These are static lower-bound counts. Wrapper-based dynamic RPC routing, SQL
inside Edge Functions, generated clients, and comments require manual
classification.

### Staging table scale

PostgREST planned-count estimates:

| Relation | Approximate rows |
| --- | ---: |
| `orders` | 6,539 |
| `order_items` | 11,127 |
| `order_item_modifiers` | 8,460 |
| `order_payments` | 5,100 |
| `order_status_history` | 10,698 |
| `payment_events` | 2,140 |
| `audit_logs` | 14,769 |
| `table_sessions` | 1,410 |
| `staff_shifts` | 128 |

These counts are adequate for staging correctness testing but not enough to
prove production-scale plans. The target plans must also be tested with
merchant-realistic cardinality.

### Partial live workload evidence

The final result grid from the staging collector was captured on `2026-07-31`.
The statistics start time was not included in that grid, so these values are
cumulative signals, not per-hour rates.

| Relation | Sequential scans | Rows read by sequential scans | Average rows per sequential scan |
| --- | ---: | ---: | ---: |
| `order_item_modifiers` | 6,830,467 | 47,908,972,476 | 7,014.0 |
| `order_discounts` | 5,114,502 | 687,418,437 | 134.4 |
| `orders` | 39,227 | 134,114,966 | 3,418.9 |
| `kds_item_status` | 23,094 | 122,426,103 | 5,301.2 |
| `table_sessions` | 74,943 | 64,293,399 | 857.9 |
| `modifier_groups` | 962,012 | 18,130,965 | 18.8 |
| `floor_plan_objects` | 189,466 | 14,007,876 | 73.9 |

Interpretation:

- `order_item_modifiers` is the strongest measured hotspot. It combines
  `6.83M` sequential scans with `47.9B` rows examined and matches the repeated
  per-item modifier aggregation found in KDS and order payload builders.
- `order_discounts` is the second strongest signal. A table with approximately
  `175` live rows was sequentially scanned `5.11M` times. Current functions
  repeatedly filter it by `order_id` and `voided_at`.
- `kds_item_status` averages more than `5,300` rows per sequential scan. The
  current KDS RPC repeats acknowledgement predicates and joins acknowledgement
  state before the requested location has bounded the item set.
- `orders` and `table_sessions` confirm that active-order and floor/session
  polling are material database workloads, not only client-rendering costs.
- The high scan counts on very small tables such as `modifier_groups` are not
  automatically index defects. PostgreSQL may correctly prefer a tiny table
  scan; statement-level total time decides whether these deserve work.

Maintenance observations:

- `order_items` had approximately `2,169` dead rows (`16.5%` of live plus dead)
  and had not been automatically vacuumed since `2026-06-27`.
- `order_payments` had approximately `770` dead rows (`13.2%`) and had not been
  automatically vacuumed since `2026-05-08`.
- `orders` had approximately `911` dead rows (`12.2%`), with automatic
  maintenance recorded on `2026-07-22`.
- Higher percentages on `menu_items` and `table_session_tables` represent only
  tens of rows and are not meaningful storage bloat by themselves.

The live index inventory rules out the initial missing-index hypothesis:

- `order_item_modifiers(order_item_id)` exists as
  `idx_order_item_modifiers_order_item` and recorded `68,399,203` scans.
- `order_discounts(order_id)` exists, and the active-row partial index
  `idx_order_discounts_order_active` recorded `99,233` scans.
- `kds_item_status` has item, order/display, pending-status, full unique, and
  display-scoped unique indexes. More indexes should not be added until the KDS
  query shape is corrected and planned.

Therefore, no new index migration is justified by these two relation hotspots.
The evidence instead prioritizes:

1. Remove repeated deep PostgREST child aggregation from hot order paths.
2. Verify whether the active-order legacy fallback still runs in the current
   build using two short-window workload snapshots.
3. Rewrite `get_kds_tickets_v2` so location-scoped items, acknowledgements, and
   modifiers are each aggregated once.
4. Evaluate table-specific automatic-maintenance settings for high-churn order
   tables after table size and write-rate evidence is captured.

### Live statement workload evidence

The single-result follow-up was captured at `2026-07-31 10:22:56 UTC`.
`statistics_since` was `NULL`, so absolute totals may span multiple deployments
and cannot prove that every query is emitted by the current app version. The
relative concentration and query shapes are still actionable.

The top 25 statements account for `12.54` cumulative database-hours in the
captured counters:

| Workload class | Statements | Calls | Database-hours | Share of top 25 |
| --- | ---: | ---: | ---: | ---: |
| Nested order payloads | 10 | 2,795 | 4.63 | 36.9% |
| Nested item/modifier payloads | 2 | 9,284 | 3.49 | 27.8% |
| Realtime change feed | 2 | 1,100,091 | 2.64 | 21.1% |
| POS staff login RPC | 1 | 1,903 | 0.36 | 2.9% |
| KDS tickets RPC | 1 | 3,978 | 0.11 | 0.9% |

Key statements:

- The highest-cost nested order payload ran `1,066` times, consumed
  `9,005,198 ms`, averaged `8,447.65 ms`, and touched approximately `157,104`
  shared buffers per call.
- A nested `order_items` plus `order_item_modifiers` query ran `7,421` times,
  consumed `8,871,311 ms`, and averaged `1,195.43 ms` despite filtering one
  `order_id` and `is_voided = false`.
- `get_kds_tickets_v2` ran `3,978` times, consumed `393,445 ms`, and averaged
  `98.91 ms`. Its mean is acceptable, but its cumulative cost and worst cases
  justify the location-bounded rewrite already identified statically.
- `pos_staff_login_v2` ran `1,903` times and averaged `684.86 ms`, making login
  a separate P1 latency investigation after active order hydration.
- The two Realtime change-feed statements ran about `1.1M` times. Their
  individual means were approximately `8.55-9.20 ms`, but frequency made them
  `21.1%` of top-25 database time.

`track_io_timing` is off, and the dominant nested order statements reported no
shared-block reads while recording very high shared-buffer hits. This points to
CPU/query-shape and JSON aggregation overhead on cache-hot data, not a storage
or Redis miss problem.

The repository already prefers `get_active_orders_v1` and falls back to the
deep embed only when that function is unavailable. Because the counters have no
known start time, a before/after delta during current-app QA is required to
separate old-client traffic from a current fallback deployment problem.

### Live index findings

The inventory also found probable duplicate or overlapping indexes:

- `idx_orders_location_created_at` and
  `idx_orders_location_created_at_desc` have the same key definition.
- `idx_unique_order_number_per_merchant` and
  `orders_order_number_merchant_key` enforce the same unique key.
- `kds_item_status` has overlapping full and partial display/item uniqueness
  indexes.

Do not remove them solely from this inventory. First identify constraint-owned
indexes, capture a clean usage window, and test dependent plans. Index cleanup
reduces write amplification and storage but will not fix the multi-second order
payloads.

Six priority-table foreign keys had no leading supporting index: merchant on
`floor_plan_objects`, acknowledgement actor on `kds_item_status`, location on
`menu_items`, service-charge rule on `orders`, and closed-by/merchant on
`table_sessions`. These are review candidates for parent-row maintenance and
tenant predicates, not automatic additions; current table size and query plans
must prove value.

### Migration layout

| Root | SQL files | Approx. lines | Role today |
| --- | ---: | ---: | --- |
| `supabase/migrations` | 39 | 9,904 | Current canonical migration root |
| `utils/supabase/migrations` | 333 | 53,030 | Historical/reference/legacy SQL |

Several runtime-critical function definitions exist only under `utils/`, while
other live functions are absent from both canonical local sources. Examples:

- `get_active_orders_v1`: only under `utils/`.
- `get_order_details`: only under `utils/`.
- `get_location_stations_with_status`: only under `utils/`.
- `get_floor_plan_status`: no local definition found.
- `get_menu_for_location`: no local definition found.
- `get_items_for_location_library`: no local definition found.
- `get_categories_for_location`: no local definition found.
- `process_payment_v17`: no local definition found in this branch.

This means a fresh database built from `supabase/migrations` cannot currently
be assumed to reproduce the deployed POS contract.

## Executive Findings

### P0: Measure the real workload before changing infrastructure

The database has enough function and migration complexity that static review
alone cannot identify the highest total cost. The first optimization input must
be:

- Top statements by total execution time.
- Top statements by calls.
- Slow statements by mean/max execution time.
- Buffer reads and temporary-file writes.
- Sequential scan and index usage.
- Lock waits and connection pressure.
- Table bloat, dead tuples, and autovacuum history.

Supabase provides `pg_stat_statements`, Query Performance reports, Database
Advisors, and `index_advisor`. The collector captures the SQL-level evidence.

Pass gate:

- At least one representative business day of staging stats, or a controlled
  load-test window.
- Query plans for KDS, active orders, floor plan, order detail, and the top
  reporting query.
- Before/after p50, p95, calls, total DB time, rows, buffers, and payload size.

### P0: Restore one authoritative migration history

Performance work is unsafe while deployed definitions cannot be reproduced
from one canonical migration root. A query rewrite can silently remove fields
added by a later ticket when developers copy an older function body.

Required:

1. Declare `supabase/migrations` as the only deployable root.
2. Treat `utils/supabase/migrations` as reference-only and document that rule.
3. Export the live definitions of runtime-critical RPCs.
4. Diff live definitions against canonical migrations.
5. Add forward-only reconciliation migrations for missing definitions.
6. Never place executable rollback files in the forward migration sequence.
7. Add CI that builds an empty database and verifies required RPC signatures.

Expected benefit:

- Prevents function regressions and schema drift.
- Makes query improvements reviewable and repeatable.
- Reduces failed migrations caused by stale view/function shapes.
- Enables safe retirement of unused versions.

### P1: Optimize `get_kds_tickets_v2` before adding Redis

Confirmed from the current SQL:

- The inner `order_items` aggregate is not explicitly scoped to the requested
  location before grouping.
- KDS acknowledgement state is checked repeatedly through correlated
  `EXISTS`/`NOT EXISTS` expressions.
- Modifiers are aggregated with a nested correlated query per item.
- The function builds a large nested JSON document and then extracts JSON text
  again for sorting.
- Done retention, active status, void/refund notice, display routing, rush, and
  priority logic all execute in one function.

PostgreSQL may optimize portions of this, but an execution plan is required.
The safe vNext shape is:

1. `scoped_orders`: filter location and relevant order statuses first.
2. `scoped_items`: join items to `scoped_orders` before aggregation.
3. `ack_state`: aggregate display acknowledgement once per item.
4. `modifier_json`: aggregate modifiers once per item.
5. `ticket_rows`: group the already-scoped rows by order/course/fire time.
6. Sort using typed boolean/timestamp columns before converting to JSON.

Candidate indexes to verify, not blindly create:

- `orders(location_id, status, id)`.
- `order_items(order_id, kitchen_status, course_number, fire_time)`, possibly
  partial for kitchen-visible rows.
- `kds_item_status(order_item_id, kds_display_id)` including acknowledgement
  and status fields where supported.
- `order_item_modifiers(order_item_id)`.

Acceptance budgets:

- Warm p95 under `150 ms` for a normal location.
- Stress p95 under `300 ms` with 100 visible tickets.
- No temporary-file writes.
- No scan of unrelated locations' order items.
- Payload and ticket order remain byte/behavior compatible.

### P1: Split stable floor-plan geometry from volatile session state

The client already records one full floor-plan refresh at approximately
`835–1999 ms` and around `215 KB`. It therefore treats this as the heaviest
floor query and backs off polling while disconnected.

The live `get_floor_plan_status` definition is missing locally, so its plan and
shape must be exported before rewriting it.

Recommended architecture:

- Geometry/config RPC: floor plans, tables, positions, shapes, and static
  metadata. Cache by floor-plan `updated_at`/version because it changes rarely.
- Session/status RPC: compact table/session/order status only. This remains the
  broadcast reconciliation path.
- Full snapshot RPC: retained only for cold start/recovery and composed from
  the two bounded sources.
- Return only fields consumed by the POS; avoid large `SELECT *` JSON rows.

The POS already has MMKV/store caching and a lightweight session refresh path.
This is more useful than putting floor-plan truth in Redis.

Acceptance budgets:

- Warm geometry cache hit requires no large DB response.
- Session/status refresh p95 under `100 ms`.
- Cold full snapshot p95 under `400 ms` at the agreed stress fixture.
- Payload under `75 KB` for the normal pilot layout.

### P1: Replace whole-row active-order serialization

`get_active_orders_v1` is bounded by business day and `LIMIT 200`, which is
good. However, it currently uses:

- `to_jsonb(o.*)`.
- `to_jsonb(oi.*)`.
- `to_jsonb(oim.*)`.
- Per-order correlated aggregates for items, payments, and discounts.
- Per-item correlated modifier aggregates.

Live evidence also shows deep PostgREST active/history payloads averaging from
approximately `1.2` to `10` seconds. One shape matches the legacy fallback in
`useOrdersQuery`; other shapes map to previous orders, online orders, and
service/store fetches. A controlled delta must establish which current screens
still issue each query before replacing call sites.

Recommended `get_active_orders_v2`:

- Select an explicit, client-consumed header column list.
- Materialize the limited/scoped order IDs first.
- Aggregate each child table once against those IDs.
- Preserve the active-item partial predicate.
- Consider header-first bootstrap plus on-demand order detail for orders not
  currently visible.

Candidate index shape to validate:

- Partial/composite active order index beginning with `location_id`, followed
  by status/date fields that match the actual predicate.
- Active order items by `order_id`, display order, and creation time.
- Modifiers/payments by their foreign-key join columns.
- Active discounts by `order_id` where `voided_at IS NULL`.

Acceptance budgets:

- Cold bootstrap p95 under `500 ms` for 200 active orders.
- No child-table full scan.
- At least 40% payload reduction without changing client behavior.

### P1: Make reporting predicates indexable

Confirmed in the kiosk reporting migration:

- `normalize_order_source(o.order_source)` is called inside row filters even
  after the canonical source constraint has normalized stored values.
- `COALESCE(op.captured_at, op.initiated_at, o.created_at)` is used in date
  predicates.
- Admin search uses several leading-wildcard `ILIKE '%term%'` predicates.
- Business-day v2 composes v1 and then performs an additional channel scan.

These shapes can defeat ordinary B-tree indexes.

Recommended:

- Compare canonical `orders.order_source` directly after validating the
  constraint and backfill.
- Store/index one authoritative payment reporting timestamp, or use separate
  sargable branches for dated payments and the rare fallback path.
- Add `pg_trgm` indexes only if search telemetry proves the admin substring
  search is materially expensive.
- For frequently viewed historical summaries, consider a PostgreSQL summary
  table/materialized view refreshed incrementally or by `pg_cron`.
- Keep operational order/payment writes as the source of truth.

### P1: Audit Realtime trigger amplification

The POS uses private Supabase Broadcast channels and already coalesces client
updates. Database-side trigger cost still matters because row-level bulk
updates can emit multiple broadcasts and build JSON for each changed row.

Live evidence confirms frequency is material: two change-feed statements made
approximately `1.1M` calls and consumed `2.64` cumulative database-hours,
`21.1%` of the top-25 total. This does not prove a Realtime defect, but it makes
subscription count, trigger fan-out, and payload coalescing first-wave evidence
targets.

The live trigger/publication inventory must establish:

- Trigger count per hot table.
- Trigger execution order and duplicate broadcast paths.
- Whether bulk item changes emit one order-level event or N item-level events.
- Payload bytes per active merchant minute.
- Whether `REPLICA IDENTITY FULL` is enabled unnecessarily.

Preferred direction:

- One compact order-level signal per logical transaction where possible.
- Keep payload fields limited to values actually consumed.
- Use statement-level/transition-table patterns where correctness permits.
- Never move payment correctness or transaction state into an asynchronous
  cache/event path.

### P2: Reduce direct table and `SELECT *` usage

Direct PostgREST access is not inherently wrong, but 52 direct `orders` sites
and 26 `select("*")` sites make payload, RLS, and index behavior difficult to
control.

Prioritize:

- Polling and bootstrap queries.
- App-wide providers.
- Queries returning nested relations.
- Tables with wide JSON/metadata columns.

Do not convert every small lookup to an RPC. Use explicit column lists and a
shared query module first. Create an RPC only when it provides atomicity,
authorization, aggregation, or a measurable plan/payload benefit.

### P2: Retire function versions using evidence

Function count does not directly make each query slower, but version sprawl
creates operational and security cost. Staging exposes 12 payment generations
and multiple generations of several mutation families.

Retirement process:

1. Identify calls in every POS, website, Edge Function, webhook, and job repo.
2. Confirm zero calls in `pg_stat_statements` over an agreed retention window.
3. Confirm no offline queue can replay the old function name.
4. Revoke execute first and monitor.
5. Drop in a later migration with a rollback definition archived outside the
   deployable migration root.

Static comparison also found eight literal POS RPC names absent from staging's
OpenAPI contract:

- `calculate_split_payment`
- `is_order_locked`
- `lock_order_for_payment`
- `process_payment_v2`
- `process_payment_v3`
- `register_payment_terminal`
- `unlock_order_for_payment`
- `update_order_with_version`

Several references are comments, wrappers, or potentially dead service
methods. Classify them before treating them as production defects.

### P2: Review RLS and function safety as part of performance

A file-level static scan found many `SECURITY DEFINER` definitions and fewer
files containing a pinned `search_path`. Because files can contain multiple
functions, this is a warning signal, not an exact live count.

The collector identifies exact live functions that are `SECURITY DEFINER`
without a pinned `search_path`. It also lists RLS policies that invoke auth
helpers and need predicate-index review.

Benefits:

- Avoids per-row policy work where a stable value can be planned once.
- Ensures tenant predicates have supporting indexes.
- Removes mutable-search-path security risk.
- Reduces duplicated authorization logic inside nested functions.

## Redis Assessment

### Decision

Do not add Redis as a general-purpose POS cache in the first optimization
wave.

The React Native POS connects directly to Supabase. Redis credentials cannot
be shipped safely in the tablet app, so Redis requires a trusted server/Edge
Function layer. That adds another network hop and a second availability and
invalidation system. Active orders, KDS, tables, inventory, and payments are
write-heavy and consistency-sensitive, making them poor cache candidates.

### Good future candidates

| Candidate | Staleness | Why Redis may help |
| --- | --- | --- |
| HQ/dashboard report aggregates | 30–300 seconds | Expensive repeated reads across merchants |
| Stable menu/config snapshots served by a backend | Versioned | Read-heavy, relatively infrequent writes |
| Rate limits and short-lived abuse controls | Seconds/minutes | Natural TTL data |
| Ephemeral job coordination not tied to payment truth | Short | Cross-worker coordination |

### Bad candidates

| Data | Reason |
| --- | --- |
| Payment/order correctness | Must remain transactionally authoritative in PostgreSQL |
| KDS active queue | Changes continuously; invalidation overhead and stale-ticket risk |
| Table/session state | Cross-station correctness is more important than cache hits |
| Inventory on-hand values | Stale data can oversell or misstate stock |
| Idempotency ledger | Existing PostgreSQL transaction boundary is safer |
| POS offline queue | Must remain local to the device and reconcile to PostgreSQL |

### Postgres-native options first

1. Correct indexes and query shapes.
2. Smaller explicit payloads.
3. Materialized/summary tables for reporting.
4. Existing POS MMKV/TanStack caches.
5. Supavisor for server-side connection pooling.
6. Read replicas for eligible dashboard/report reads if primary load justifies
   the cost.
7. Redis only after cacheable endpoints and invalidation ownership are explicit.

## Proposed Migration Waves

### Wave 0: Baseline and ownership

- Run the read-only collector.
- Export live definitions for the five hot RPCs.
- Save Query Performance Advisor output.
- Record app/Sentry p50/p95 and payload sizes.
- Establish canonical migration ownership and fresh-database CI.

No behavior or schema changes.

### Wave 1: Low-risk index and payload corrections

- Do not add modifier/discount indexes; the expected indexes already exist and
  are heavily used.
- Add only advisor/plan-proven missing foreign-key/composite/partial indexes.
- Remove provably duplicate/unused indexes in a separate migration.
- Replace high-volume `SELECT *` calls with explicit columns.
- Pin missing `SECURITY DEFINER` search paths without changing function bodies.

Each index requires:

- Query and plan proving need.
- Write-amplification assessment.
- Staging before/after metrics.
- Rollback statement documented outside the forward migration sequence.

### Wave 2: Hot RPC vNext functions

- `get_floor_plan_status_v2` split/composition.
- `get_kds_tickets_v3` scoped and pre-aggregated.
- `get_active_orders_v2` explicit and pre-aggregated.
- `get_order_details_v2` one scoped order lookup with explicit payload.

Keep old signatures during rollout. Add a feature flag/client fallback and
compare output equivalence before retirement.

### Wave 3: Reporting path

- Make channel/time predicates indexable.
- Introduce summary/materialized tables only for proven expensive reports.
- Route eligible website/HQ reads to a replica or server cache if necessary.

### Wave 4: Version retirement and trigger consolidation

- Revoke/drop unused RPC generations after usage evidence.
- Consolidate duplicate trigger/broadcast paths.
- Remove legacy SQL from deployable paths.

### Wave 5: Redis pilot, only if still justified

Pilot one report aggregate behind a server endpoint:

- Cache-aside.
- Tenant/location/date/version in the key.
- Short TTL plus explicit invalidation.
- PostgreSQL remains source of truth.
- Kill switch and cache bypass.
- Hit-rate, stale-read, latency, and DB-time telemetry.

Do not begin with payments, active orders, KDS, or table sessions.

## Migration Quality Standard

Every performance migration must include:

- Ticket and query being optimized.
- Current and expected execution plan.
- Before/after p50, p95, calls, total DB time, buffers, rows, and payload.
- Exact schema/function signature.
- `SECURITY DEFINER` and pinned `search_path` review.
- Authorization and RLS equivalence.
- Idempotent deployment behavior where possible.
- Lock level and expected lock duration.
- Staging rollout and rollback procedure.
- Client compatibility window.
- Targeted automated test and manual QA.

Do not:

- Add indexes from intuition alone.
- rewrite payment math during a performance ticket.
- use `VACUUM FULL` casually; it locks and rewrites the table.
- use leading-wildcard search without proving/selecting an index strategy.
- deploy a rollback file as a later forward migration.
- mutate a widely used function signature in place.
- add Redis without server ownership and invalidation semantics.

## Verification

Completed:

- Local SQL inventory: `384` SQL files.
- Live staging OpenAPI inspection succeeded.
- Live relation/RPC counts recorded.
- Static POS RPC/relation call inventory recorded.
- Critical table planned-count estimates recorded.
- Hot function source review for active orders, order details, KDS, and reports.
- Read-only SQL collector created.
- Core staging relation statistics received and ranked.
- Single-result read-only follow-up collector created.
- Statement-cost, live-index, and unsupported-foreign-key evidence received.
- Initial missing modifier/discount index hypothesis rejected from live data.
- Focused read-only workload delta collector created.
- Website source findings reconciled into one corrected cross-repository audit.
- Shared implementation backlog organized by priority, owner, dependency,
  migration requirement, rollout wave, and definition of done.
- Deployed staging OpenAPI contract refreshed read-only on 2026-08-01:
  541 RPC paths, 239 exposed relation/view definitions, and 3,855 properties.
- Canonical audit expanded with specialist lenses, strict critical findings,
  advanced architecture options, industry patterns, 10x/100x modeling, and
  confidence-bounded structural gain estimates.

Pending:

- Capture before/after workload snapshots around current-app QA.
- Export live definitions of missing hot RPCs.
- Capture execution plans with real staging IDs.
- Map each incrementing nested query ID to its current POS call site.
- Approve the first migration wave with a senior/backend reviewer.

## Files

- `tasks/database-performance-architecture-audit.md`
- `supabase/audits/20260731_database_performance_readonly.sql`
- `supabase/audits/20260731_database_hotspots_followup_readonly.sql`
- `supabase/audits/20260731_database_workload_delta_readonly.sql`
- `tasks/ticket-log.md`

## Open QA

1. Run the workload delta collector before current-app QA.
2. Exercise active-order login/hydration, Previous Orders, one order detail,
   KDS refresh, and one staff login; then run the same collector again.
3. Export both result grids as CSV/JSON.
4. Supply one staging `location_id`, `station_id`, `kds_display_id`,
   representative `order_id`, and business-day start for read-only plans.
5. Send the representative staging IDs to the implementer. The four read-only
   execution-plan statements will then be supplied and run one at a time during
   a quiet staging window.
6. Record current Supabase compute size and Database Reports CPU/RAM/Disk I/O
   screenshots.
7. Repeat the app performance baseline before and after each approved wave.

## References

Cross-repository canonical artifacts in the sibling DexaPOS-Website repository:

- `docs/AUDIT-2026-07-31-SHARED-DATABASE-PERFORMANCE-COMBINED.md`
- `docs/SENIOR-SUMMARY-2026-07-31-SHARED-DATABASE-PERFORMANCE.md`
- `docs/IMPLEMENTATION-BACKLOG-2026-08-01-SHARED-DATABASE-PERFORMANCE.md`
- `docs/SQL-READONLY-2026-07-31-DATABASE-PERFORMANCE-AUDIT.sql`

- Supabase query optimization:
  `https://supabase.com/docs/guides/database/query-optimization`
- Supabase `pg_stat_statements`:
  `https://supabase.com/docs/guides/database/extensions/pg_stat_statements`
- Supabase debugging and monitoring:
  `https://supabase.com/docs/guides/database/inspect`
- Supabase Database Advisors:
  `https://supabase.com/docs/guides/database/database-advisors`
- Supabase platform performance:
  `https://supabase.com/docs/guides/platform/performance`
- Supabase read replicas:
  `https://supabase.com/docs/guides/platform/read-replicas`
- Redis caching guidance:
  `https://redis.io/docs/latest/develop/clients/client-side-caching/`
