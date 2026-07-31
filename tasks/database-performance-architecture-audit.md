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
- Low-level PostgreSQL workload evidence: pending SQL Editor collector output.
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

Pending:

- Run `supabase/audits/20260731_database_performance_readonly.sql`.
- Export live definitions of missing hot RPCs.
- Capture execution plans with real staging IDs.
- Rank candidates by total database time, not code size.
- Approve the first migration wave with a senior/backend reviewer.

## Files

- `tasks/database-performance-architecture-audit.md`
- `supabase/audits/20260731_database_performance_readonly.sql`
- `tasks/ticket-log.md`

## Open QA

1. Run the collector in staging SQL Editor.
2. Export all result grids as CSV/JSON or attach screenshots.
3. Supply one staging `location_id`, `station_id`, `kds_display_id`,
   representative `order_id`, and business-day start for read-only plans.
4. Run the four commented `EXPLAIN (ANALYZE, BUFFERS, WAL, FORMAT JSON)`
   templates one at a time during a quiet staging window.
5. Record current Supabase compute size and Database Reports CPU/RAM/Disk I/O
   screenshots.
6. Repeat the app performance baseline before and after each approved wave.

## References

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

