# POS Supabase/Postgres Performance Senior Summary — 2026-08-03

## Decision Snapshot

The audited POS revision is `a1c7a032479bdfc533f28e29eb983824077742c1` on `audit/pos-database-refresh`, exactly aligned with `origin/staging` at audit start. The worktree was clean before the audit. No application code, dependency, lockfile, or migration was changed; no SQL was executed; nothing was committed or pushed.

The immediate concern is shared contract correctness and authorization, followed by operational read shape. The cumulative database statistics are useful shared evidence, but they do not identify this POS build. No POS-specific runtime benefit or p50/p95/p99 claim should be approved until Ali returns the controlled before/after JSON package.

One standalone collector export was received after the audit. It is complete and confirms the same cumulative shared priorities, but without an after-export it cannot provide idle/workflow deltas or current-POS attribution. The static audit can proceed to review without completing the full capture package; runtime-dependent claims remain open.

Redis is not justified at the measured current scale. Shared staging is small (about 74 MB across the largest 100 public relations) and cache-hot. The first-order work is authorization, canonical migrations, narrower/location-first SQL, request consolidation, pagination, correct recovery, and telemetry.

## Top Five Risks

1. **Station and login contract integrity.** The committed station-status SQL has unresolved nested conflict markers and cannot reproduce the deployed function. Its website-owned definition exposes station/device/terminal/network metadata without caller-derived scope. Current canonical `pos_staff_login_v2` does not bind staff location/merchant to the selected station and writes the submitted PIN into `pin_plain`; the exact live body still needs export.
2. **Active authless and weakly scoped definer mutations.** Shared live evidence proved five authless functions; current POS calls four: `close_check`, `reopen_check`, `record_cash_operation`, and `delete_floor_plan_cascade`. Preauthorization and terminal-device families show similar repository-level authorization gaps but still require live signature/grant confirmation. Blanket grant revocation is unsafe; versioned caller/station/tenant authorization is required.
3. **Payment/preauthorization generation drift.** The service and offline paths select `process_payment_v16`, while the direct store selects v17 and says the versions must match. Online preauth can select v1/v3/v4 while replay hardcodes v1. Generated types and local migration ownership do not reproduce the deployed surface.
4. **Operational payload and refresh amplification.** Nested order graphs remain the largest measured shared family. Current source still has broad whole-row active/detail reads, KDS aggregation before location scoping, roughly `1 + 4F` floor-plan cold-start calls, Previous Orders page/count/up-to-5,000-row summary work, raw analytics/EOD facts, and `2N` refund reads. KDS authoritative refresh uses trailing-only debounce and can starve under sustained events, while floor signals fan out into one reread per subscribed process.
5. **Recovery and reporting correctness.** Active-order reconnect can fetch fresh data and then skip hydration because its fingerprint uses only row count and the first `opened_at`. EOD has case-mismatched check states, a missing payment upper bound, device-local rather than authoritative business-day bounds, and direct close writes that bypass the audited RPC.

## Top Five First Actions

1. Name one canonical shared migration root and owner; export the live definitions, overloads, owners, security mode, `search_path`, and ACLs for station/login, payment/preauth, active orders/detail, KDS, floor, cash/EOD, and the known authless functions. Add CI rejection for conflict markers and deployable rollback files.
2. Design forward-only versioned authorization contracts. Derive merchant/location/object scope from database rows and authenticated claims, bind staff attribution to an active station session, preserve legitimate anonymous PIN entry and unattended device behavior, and retain old signatures through a measured offline-client window.
3. Select one payment and preauth routing policy for direct, service, and replay paths; reproduce it in the canonical migration history, regenerate types, and verify cash/card/split/Valor/preauth/refund/idempotent replay fixtures.
4. Run the controlled workload runbook and return all 23 JSON files. Attribute deltas by `queryid` using calls, total execution time, and rows; never subtract cumulative mean or max values.
5. After evidence review, implement narrow/location-first operational read models: active headers plus lazy detail, KDS vNext, compact floor/session snapshots, Previous Orders aggregate/signature, EOD/analytics aggregates, batched refund inputs, and robust reconnect snapshot versioning.

## Ownership Boundary

### POS-owned

- Unify payment/preauth version routing and offline operation compatibility.
- Fix active-order snapshot reconciliation, KDS connection-transition polling, EOD bounds/state vocabulary, and offline `order_status` precheck.
- Consolidate duplicate menu/payment-detail requests; bound Previous Orders and analytics UI behavior; batch refund reads.
- Preserve the singleton authenticated client, targeted private Broadcast channels, durable offline queues, idempotency journals, and observer-aware invalidation controls.
- Add client request/response-byte, retry, cache, reconnect, transform-time, and heap telemetry for the controlled workflows.

### Shared database/migration-owned

- Canonicalize migration ownership and reproduce every live critical definition and grant.
- Version authorization-safe station/login, close/reopen/cash/floor-delete, payment/preauth, terminal-device, KDS, table-status, and cash-report contracts.
- Build explicit-column, location-first active-order/detail/KDS/floor/history/EOD/analytics read models.
- Contain `kiosk_pickup_sequences` and `luqra_sync_runs` separately after external caller discovery; neither has a current POS caller.
- Add or consolidate indexes only after representative role-realistic plans prove the need.

## Evidence and Scale Position

Shared refreshed top-100 evidence assigns 44.62% of execution time to nested order graphs, 22.40% to nested item/modifier graphs, and 17.12% to Realtime database work—84.14% combined. These are shared cumulative measurements, not current-POS attribution.

At 10x, existing unbounded history/reporting reads, wide child graphs, large `IN` lists, KDS late scoping, station polling, and serial replay become the likely limits. The 200-order active snapshot and 5,000-row Previous Orders summary can become correctness ceilings before infrastructure saturation. At 100x, tenant skew, connection pooling, retention, summary/read models, and possibly stale-tolerant replicas or cache can be evaluated after single-primary query/request repair. The theoretical data-volume × station/display amplification is a warning model, not a capacity forecast.

## Pending Evidence and Decisions

- Controlled query-ID deltas, client timing/bytes, reconnect traces, broadcast-to-visible latency, live trigger topology, and fixture cardinalities for the current build.
- A matching after-export for the received standalone snapshot, if runtime attribution is resumed later.
- Fresh live definitions and effective grants for the conflicted station RPC, PIN login, preauth generations, terminal registration/credentials/health, KDS, table status, and cash audit functions.
- Actual staging/production flags selecting payment v12/v16/v17 and preauth v1/v3/v4.
- Current RLS behavior for direct offline cash replay and external kiosk/Luqra/Edge Function callers.
- Canonical check-state vocabulary, authoritative location business-day definition, offline compatibility/retirement window, and acceptable staleness only for historical reporting.

Do not implement the proposed optimizations or shared migrations until the audit, ownership decisions, and controlled runtime evidence are reviewed.
