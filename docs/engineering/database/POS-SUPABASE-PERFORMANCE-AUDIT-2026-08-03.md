# POS Supabase/Postgres Performance and Architecture Audit — 2026-08-03

## Audit Baseline

| Item | Value |
| --- | --- |
| Repository | Dexa-POS |
| Branch | `audit/pos-database-refresh` |
| Audited commit | `a1c7a032479bdfc533f28e29eb983824077742c1` |
| `origin/staging` at audit start | `a1c7a032479bdfc533f28e29eb983824077742c1` (`0/0` divergence) |
| Previous POS evidence commit | `7a6ab3069840de5da926e71a3b05caca3f2700ff` |
| Database | Shared staging Supabase project used by Dexa-POS and DexaPOS-Website |
| Scope | Investigation, read-only SQL tooling, and documentation only |

The starting worktree was clean. This audit did not modify application code, dependencies, lockfiles, or migrations; did not execute SQL; and did not commit or push.

## Executive Summary

The highest-risk current-staging findings are contract governance and authorization defects, followed by broad operational payloads and repeated reads:

1. **A committed shared-RPC reference is not valid SQL.** `utils/supabase/migrations/stations_and_devices/get_location_stations_with_status.sql:56-101` contains unresolved nested merge markers. Five current POS call sites depend on the deployed function, but this repository cannot safely reproduce or compare it.
2. **Authorization boundaries are incomplete on active operational contracts.** Four known authless `SECURITY DEFINER` functions have confirmed current POS callers: `close_check`, `reopen_check`, `record_cash_operation`, and `delete_floor_plan_cascade`. In addition, the current canonical `pos_staff_login_v2` body does not bind the selected station to the submitted location/staff merchant and writes the submitted PIN to `location_members.pin_plain`; live-body equivalence still requires export.
3. **Payment routing regressed across current call paths.** With idempotent vNext enabled, `services/orderService.ts:810-845` selects `process_payment_v16`, while `stores/useOrderStore.ts:3020-3046` selects `v17` and says the two “MUST match.” Offline replay delegates to the v16 service path. The split is conditional on flags, but it is a concrete release/configuration hazard for Valor metadata and replay equivalence.
4. **Operational order payloads remain the dominant measured shared query family.** Current POS still has whole-row active-order and order-detail contracts and broad fallbacks. Shared cumulative evidence attributes 67.02% of the refreshed top-100 statement time to nested order plus nested item/modifier graphs; controlled current-POS attribution is still missing.
5. **KDS, floor, Previous Orders, analytics, refund allocation, and End of Day still amplify work.** The most consequential current examples are KDS aggregation before location scoping, floor bootstrap at roughly `1 + 4F` requests for `F` plans, Previous Orders page/count/summary fan-out, raw analytics/EOD aggregation in JavaScript, sequential `2N` refund allocation reads, and a historical EOD payment predicate with no upper time bound.

A separate correctness/cache risk affects recovery: `useOrdersQuery` fingerprints an active-order snapshot using only result length and the first row's `opened_at`. A reconnect can therefore fetch changed order/item/payment state and decline to hydrate Zustand when those two values did not change.

Redis is **not justified at the measured current scale**. The shared staging database is small (approximately 74 MB across the largest 100 public relations) and cache-hot (approximately 99.9999% database buffer hit ratio). Current costs point to request and query shape, authorization, payload width, refresh amplification, and migration ownership—not missing generic caching infrastructure.

## Evidence Model and Confidence

| Label | Meaning |
| --- | --- |
| **Measured shared** | Read-only staging catalog or cumulative `pg_stat_statements` evidence. It ranks shared query families but is not attributed to the current POS build. |
| **Confirmed static** | Exact current source or SQL text at the audited commit. It proves the path/shape exists, not that it executed frequently. |
| **Inferred** | A scale or performance consequence derived from static shape and stated assumptions. It requires controlled measurement. |
| **Proposed** | A target contract, SLO, or remediation design. It is not an achieved benefit. |

No current POS p50/p95/p99, response-byte, query-plan, connection, or end-to-end Realtime latency claim is made. Ali's controlled before/after exports remain the runtime closure gate.

### Partial capture received

One complete collector export captured at `2026-08-03 12:50:18.934614+00` was later received and validated: 945 raw rows, 925 normalized query IDs, stable internal capture metadata, and no missing IDs or negative counters. It has no matching after-export, so it is recorded only as a cumulative shared-database snapshot in `POS-SUPABASE-PERFORMANCE-PARTIAL-RUNTIME-EVIDENCE-2026-08-03.md`. It corroborates the existing ranking of nested order graphs, nested item/modifier graphs, and Realtime work but provides no idle or workflow delta and no POS attribution.

## Current Static Access Inventory

Method: lexical scan of 1,041 production `.ts/.tsx/.js/.jsx` files under `app`, `components`, `contexts`, `hooks`, `lib`, `modules`, `services`, `stores`, `utils`, `web`, and `supabase/functions`; tests/specs, generated types, SQL, docs, build output, and `mockData.ts` were excluded. Counts are review-surface call sites, not runtime volume. Dynamic RPC selection is counted separately.

| Surface | Current HEAD | Prior evidence commit, same parser | Delta |
| --- | ---: | ---: | ---: |
| Literal `.from("relation")` | 370 across 82 files | 382 | -12 |
| Distinct literal relations | 70 | 71 | -1 |
| Literal `.rpc("name")` | 214 across 72 files | 215 | -1 |
| Distinct literal RPC names | 151 | 151 | 0 |
| All `.rpc(...)` expressions | 219 | 220 | -1 |
| Dynamic RPC dispatch expressions | 5 | 5 | 0 |
| All `.select(...)` | 230 across 70 files | not trend-compared | — |
| Exact `.select("*")` | 25 across 15 files | 27 | -2 |
| `.limit(...)` | 35 | 37 | -2 |
| `.range(...)` | 4 | 4 | 0 |
| Exact-count request sites | 7 | not trend-compared | — |
| `functions.invoke(...)` | 7 across 5 files | not trend-compared | — |
| `.channel(...)` | 5 | not trend-compared | — |
| Literal `postgres_changes` | 0 | not trend-compared | — |

The reductions are primarily removal of kiosk UI/profile paths and payment-terminal reads. They do not represent a material fix to the hot query families. Active-order, KDS, EOD, analytics, floor, refund, and menu hot paths remain.

Highest-density current files:

| File | Literal access calls | Main responsibility |
| --- | ---: | --- |
| `services/orderService.ts` | 49 | Orders, payments, history, KDS, mutations |
| `services/floorPlanService.ts` | 48 | Floor/session, waitlist, reservations |
| `services/menuService.ts` | 36 | Menu/library and snooze operations |
| `stores/useInventoryStore.ts` | 34 | Inventory and purchase operations |
| `services/endOfDayService.ts` | 23 | EOD raw facts and client aggregation |
| `services/offlineSyncInit.ts` | 19 | Offline operation dispatch and replay |
| `stores/useOrderStore.ts` | 18 | Order/payment operational paths |

Most referenced relations include `orders` (53), `payment_terminals` (26), `printers` (18), `staff_shifts` (17), `purchase_orders` (15), `customers` (13), `order_items` (9), `cash_drawers` (9), and `order_payments` (8).

## Architecture and Database-Access Inventory

### Clients and identity

- `hooks/useSupabaseClient.ts:95-167` owns the app-wide singleton client and one shared Realtime socket. Clerk token caching/coalescing at `:35-85` prevents every RPC from rotating the token and reauthenticating channels.
- `lib/supabase.ts:12-25` remains a second client factory used by some settings surfaces. It does not maintain a global instance and can create additional clients for those screens.
- `contexts/PosSyncProvider.tsx:121-160` injects the authenticated singleton into operational Zustand stores.
- Edge Functions create independent user/admin clients. `supabase/functions/send-receipt/index.ts:62` uses service role; the waitlist/reservation notification functions create user and admin clients at `notify-waitlist-guest/index.ts:117-120` and `notify-reservation-guest/index.ts:149-152`. Their tenant checks belong to server-side authorization review.

### Bootstrap, menu, inventory, and configuration

- `hooks/pos/usePosSync.ts:44-78` starts five parallel requests: full sync, two recipe relations, tax rates, and snoozes. The recipe reads at `:60-67` have no explicit merchant/location predicate.
- `hooks/pos/useStandaloneSync.ts:159-229` starts six parallel requests and includes a large modifier relationship graph; `:199` explicitly relies on RLS instead of adding a merchant predicate.
- `contexts/PosSyncProvider.tsx:712-737` separately refreshes floor, tax, and receipt-template data.
- `hooks/pos/useMenuSnoozeReconcile.ts:32-65` performs another initial snooze request and 60-second reconciliation polling.
- React Query uses `staleTime: Infinity` for POS/menu/inventory configuration (`hooks/pos/usePosSync.ts:188-190`, `useStandaloneSync.ts:334-336`, `useInventorySync.ts:151-154`), so explicit invalidation/broadcast ownership—not generic Redis—is the relevant cache question.

### Orders and detail

- `hooks/pos/useOrdersQuery.ts:79-124` prefers bounded `get_active_orders_v1` (business-day plus 200-order limit) but falls back on missing-function errors to a nested whole-row PostgREST graph.
- `utils/supabase/migrations/get_active_orders_v1.sql:38-65` also serializes `o.*`, `oi.*`, `oim.*`, all payments, and discounts through correlated JSON aggregates.
- Other loaders bypass that preferred path: `stores/useOrderStore.ts:7205-7221`, `:7299-7315`, and the unbounded initialization at `:16350-16371`.
- `hooks/orders/useOrderDetails.ts:33-38` and order/offline store paths call `get_order_details`; its utility-root definition returns whole order and all child graphs at `utils/supabase/migrations/get_order_details.sql:32-88`.

### Tables, sessions, and floor plans

- `stores/useFloorPlanStore.ts:837-876` loads the active plan and prefetches inactive plans.
- Each plan snapshot runs objects/sections in parallel, followed by junction and session reads: `stores/useFloorPlanStore.ts:200-229` and `services/floorPlanService.ts:105-160`. This is approximately one plan-list request plus four requests per plan.
- `services/floorPlanService.ts:105-112` reads all active geometry with `.select("*")`.
- The current active store does not use the `getFloorPlanStatus` wrapper at `services/floorPlanService.ts:73-84`; Realtime catch-up instead composes current store paths.

### Payments, refunds, cash, and offline replay

- Payment RPC selection is centralized only partially through `rpcWithIdempotency` (`lib/network/idempotencyKey.ts:230-285`); callers still pass divergent version pairs.
- `services/offlineSyncInit.ts:1255-1389` uses two parallel defensive reads, then a session-validity RPC and payment RPC through `OrderService`: roughly four database calls per queued payment, deliberately serialized by `services/offlineSyncService.ts:2447-2461`.
- `services/preAuthService.ts:707-808` dynamically selects preauth v1/v3/v4, while offline replay hardcodes v1 at `services/offlineSyncInit.ts:3257-3390`.
- `services/refundService.ts:1632-1657` performs two sequential reads per requested item—`order_items`, then `order_payment_items`—creating a confirmed `2N` read waterfall before refund mutations.
- `services/cashDrawerService.ts:227-258` retries `record_cash_operation` across old/new signatures, confirming both remain compatibility contracts.

### KDS

- `stores/useKDSStore.ts:1570-1810` calls `get_kds_tickets_v2` for foreground and background refresh.
- The latest POS migration body still aggregates item/modifier/acknowledgement state before applying the location-bound order join (`supabase/migrations/20260717120000_kds_server_authoritative_done.sql:89-261`).
- Display-filtered KDS stations poll every 30 seconds; disconnected stations intend to poll every 15 seconds (`app/(main)/kds.tsx:2536-2560`). Header-only broadcasts can schedule authoritative refresh at `stores/useKDSStore.ts:2459-2509`.
- `hooks/pos/useKdsOnlineOrdersBootstrap.ts:54-62,87` fetches a 100-order nested order/item/modifier graph at mount and every 120 seconds.

### Previous Orders and reporting

- `stores/usePreviousOrdersStore.ts:1048-1183` serially resolves business-day bounds, concurrently requests a window summary, then requests a 50-row nested page and exact count.
- `services/orderService.ts:1406-1440` pages but still returns `orders.*` plus all items, payments, and discounts.
- `services/orderService.ts:1462-1533` transfers up to 5,000 discriminator rows for client-side tab/provider counts; it silently undercounts beyond the cap.
- `hooks/orders/useOrderHistory.ts` has no current caller and must not be presented as runtime work, even though its dead path contains five parallel exact-count requests.
- `stores/useAnalyticsStore.ts:141-389` is an active sequential raw-fact waterfall, including a potentially large `.in(order_id, orderIds)` and merchant-wide loyalty reads.

### Timeclock and End of Day

- Timeclock uses `handle_time_clock`, shift lookups, and durable offline replay (`hooks/useTimeclock.ts:73-113`, `services/timeclockSyncProcessor.ts:67-193`). The sequential fallbacks preserve correctness but need runtime attribution before consolidation.
- `services/endOfDayService.ts:590-617` transfers orders, payments, shifts, and items in parallel and aggregates in JavaScript; it then performs staff and drawer waterfalls at `:624-635` and `:749-824`.
- Significant drawer variances trigger one sequential `get_session_variance_analysis` call per drawer session at `:817-837`.
- `components/settings/end-of-day/steps/EodStepCash.tsx:52-126` repeats the drawer/session/operation reads when no externally generated summary is present.

### Realtime, background, and resume

- Current source uses private Broadcast channels, not client `postgres_changes` subscriptions.
- Orders use `location:{locationId}:orders` (`hooks/realtime/useOrdersRealtime.ts:443-445`); floor uses `location:{locationId}:tables` and optional `session:{sessionId}:events` (`hooks/realtime/useFloorRealtime.ts:205-207,316-318`). Kick, remote-action, and location-config channels are separate targeted paths.
- A normal signed-in process has four persistent channels: private order and floor channels plus public station-kick and remote-action channels. The location provider mounts once for POS and KDS (`app/(main)/_layout.tsx:300-345`), so KDS also receives floor signals. No duplicate persistent mount was confirmed; `session:{sessionId}:events` is currently defined but unconsumed.
- `hooks/realtime/useRealtimechannel.ts:133-311` explicitly detaches handlers and removes stale channels. This reduces duplicate-subscription risk, but reconnect and trigger frequency still require controlled evidence.
- Floor broadcasts are signals for authoritative rereads. `hooks/realtime/useFloorRealtime.ts:38-58,124-181` debounces to 300 ms and throttles session refresh to at most once per 1.5 seconds; connected heartbeat is 120 seconds and disconnected full-snapshot polling backs off from 5 to 30 seconds (`:244-300`).
- Active-order and Previous Orders fallback polling stops while the order channel is connected (`hooks/pos/useRealtimeFallbackPolling.ts:16-59`). Resume tasks are coordinated and staleness-gated at `contexts/PosSyncProvider.tsx:743-830`.

## Findings Ordered by Severity

### P0 — Invalid shared station RPC reference and unresolved authorization contract

**Confirmed static.** `utils/supabase/migrations/stations_and_devices/get_location_stations_with_status.sql:56-101` contains nested Git conflict markers and is not executable SQL. The file says the website repository is authoritative at `:1-3`.

Current callers:

- `hooks/useLocationStations.ts:25-26`
- `services/posAccessService.ts:59-60,93-94`
- `app/(main)/settings/stations.tsx:67-68`
- `app/(main)/settings/cash-management.tsx:102-103`

The website's claimed authoritative definition is valid SQL but uses `SECURITY DEFINER`, grants `anon`, returns station/session/device/terminal/network metadata, and does not derive authorization from the caller. Live equivalence has not been freshly exported in this POS phase.

**Required action:** shared migration owner exports the live definition, defines caller/location authorization, ships a forward-only canonical version, and makes the POS copy clearly non-deployable or removes it from migration roots. Add CI that rejects conflict markers in SQL.

### P0 — Four authless definer contracts have active POS callers

**Measured shared:** five live functions were body-reviewed as authless and anonymously executable: `get_unified_staff_view`, `close_check`, `reopen_check`, `record_cash_operation`, and `delete_floor_plan_cascade`.

**Confirmed current POS:** callers exist for four:

- `close_check`: `hooks/orders/useOrderActions.ts:15-18`; `services/orderService.ts:2284-2288`; offline operation dispatch at `services/offlineSyncInit.ts:1018-1051`.
- `reopen_check`: `hooks/orders/useOrderActions.ts:62-65`; `services/orderService.ts:2336-2340`; offline dispatch at `services/offlineSyncInit.ts:1052-1088`.
- `record_cash_operation`: `services/cashDrawerService.ts:227-258`.
- `delete_floor_plan_cascade`: `stores/useFloorPlanStore.ts:1002-1011`.

No current POS RPC caller was found for `get_unified_staff_view`; generated types alone are not a caller.

The local bodies trust caller-supplied object/actor IDs without caller-derived merchant/location permission checks (`20260509113000_close_check_idempotent.sql:1-50`, `20260602090000_fix_reopen_check_payment_lifecycle.sql:6-62`, `20260513143000_add_vendor_to_record_cash_operation.sql:18-43`, and `cascade_delete_floorplans.sql:13-97`).

**Required action:** do not blanket-revoke all grants. Design versioned functions that validate the authenticated Clerk/Supabase identity, active station session, merchant/location membership, and permission; derive audit actor server-side; preserve idempotent offline replay; deploy database contract before POS caller migration; retire old grants only after a compatibility window.

### P0 — PIN login does not bind staff, location, and station consistently

**Confirmed current canonical source; live equivalence unverified.** `pos_staff_login_v2` resolves staff/PIN within caller-supplied `p_location_id` (`supabase/migrations/20260429120000_pos_staff_login_rate_limiting.sql:175-210`), but then selects the station only by `p_station_id` and active state (`:224-229`). It does not require the station location to equal `p_location_id` or its merchant to equal the staff merchant before takeover/session mutations at `:239-349`. After a successful hashed-PIN comparison, it also writes the submitted plaintext PIN into `location_members.pin_plain` at `:218-221`. Current callers are `app/(auth)/pin-login.tsx:247,473`, `hooks/useStationLoginSync.ts:38`, and `hooks/usePinSignIn.ts:206`.

**Required action:** preserve legitimate anonymous pre-login use, but version the contract so it atomically validates staff membership, station merchant/location, device/session context, and rate-limit scope before changing sessions. Stop persisting plaintext PINs and avoid revealing whether an out-of-scope station exists. Export the live body and grants before classifying exploitability.

### P0/P1 — Preauthorization and terminal-device families need live authorization closure

**Confirmed repository bodies; live signature/grant state unverified.** Online preauthorization selects v1/v3/v4 while replay calls v1. The local v1/v3 bodies resolve payment/order objects by UUID without caller merchant/location validation (`utils/supabase/migrations/preauth_functions_v1.sql:16-399`, `preauth_functions_v3_platform_fees.sql:12-207`); the website v4 body follows the same authorization shape. Active terminal registration, credentials, and health contracts also depend on definer bodies with weak or missing station/location permission checks. These are compatibility-sensitive because unattended devices and offline replay are legitimate workflows.

**Required action:** export each live overload and effective ACL, then version each family as a unit. Derive payment/order/terminal tenant scope inside the function, bind staff attribution to an active station session, retain idempotency and legacy replay shapes through a measured compatibility window, and narrow grants only after deployed-client usage is known.

### P0 — Payment generation split across direct, service, and replay paths

**Confirmed static regression.** With idempotent vNext enabled:

- `services/orderService.ts:810-845` selects `process_payment_v16`.
- `stores/useOrderStore.ts:3020-3046` selects `process_payment_v17` and documents that it must match the service.
- `services/offlineSyncInit.ts:1385-1389` delegates replay to the v16 service path.

The prior evidence commit used v17 in `OrderService`; current HEAD reverted only that path. With flags off, both select v12. `database.types.ts` contains payment generations only through v15, the POS SQL corpus has no v17 definition, and current shared evidence says v6-v17 are deployed.

**Impact:** conditional behavior/metadata divergence, especially Valor card fields, plus an unreproducible/type-unsafe rollout. This is not proof that a current production payment used the mismatched branch.

**Required action:** one router and one selected version for direct/service/replay; export the chosen live definition into the canonical root; regenerate types; test cash/card/split/Valor/offline replay and idempotency; retain v12/v16/v17 until deployed/offline usage is measured.

### P0 — No authoritative migration history

**Confirmed static.** Current POS contains 36 SQL files under `supabase/migrations` and 332 under `utils/supabase/migrations`. An approximate function parser found 200 function names and 55 names defined more than once across the corpus, including `calculate_order_totals_fast` (17 bodies), `broadcast_order_changes` (9), `get_kds_tickets_v2` (8), and `add_order_item_v2` (7). Eighty-six rollback files remain inside migration roots; a non-versioned `cascade_delete_floorplans.sql` and duplicate timestamp prefix also exist.

Runtime-critical definitions remain historical-root-only or absent locally, including active orders, order details, station status, floor status, and payment/preauth generations. Shared August 3 evidence found six roots across POS/website, 999 SQL paths, 35 duplicate basenames, and 13 same-named files with different hashes; this branch has since removed four POS migration files but has not resolved ownership.

**Required action:** declare one shared deployable root, export live critical definitions, reconcile forward-only, move rollback/reference SQL out of the deploy sequence, and build an empty database in CI to verify signatures/grants.

### P1 — Whole-row operational order hydration remains the top query-shape target

**Confirmed static + measured shared.** Active-order and detail paths return broad nested graphs as described above. Shared refreshed top-100 evidence attributes 44.62% of time to nested order graphs and 22.40% to nested item/modifier graphs. Prior captured means include approximately 8.45 seconds for the slowest nested order shape and 1.20 seconds for a single-order item/modifier shape. Those values are cumulative shared evidence, not current-POS latency.

**Required action:** versioned explicit-column `get_active_orders_v2` and `get_order_details_v2`; materialize the scoped order-ID set first; aggregate each child once; preserve 200-order/business-day semantics; hydrate headers first and details on demand; remove bypass/fallback loaders only after compatibility capture.

**Proposed target:** at least 40% payload reduction and active bootstrap p95 below 500 ms on an agreed 200-order fixture. Confidence is low until baseline bytes/p95 exist.

### P1 — Active-order recovery can discard a fresh server snapshot

**Confirmed active static path.** `hooks/pos/useOrdersQuery.ts:145-155` decides whether to hydrate Zustand from a fingerprint containing only `${length}:${first.opened_at}`. Changes to item/payment/status state, most header changes, and all non-first orders can leave that value unchanged. Recovery and resume deliberately invalidate the query at `hooks/pos/useOrderSyncRecovery.ts:27-60` and `contexts/PosSyncProvider.tsx:761-786`, so the network read may succeed while the repair merge is skipped.

**Required action:** use an authoritative snapshot version or stable structural discriminator such as server revision/max `updated_at`, or always merge with identity preservation. Verify with a controlled missed-broadcast/reconnect fixture; frequency and user impact are not measured yet.

### P1 — KDS aggregation and refresh pressure scale multiplicatively

**Confirmed static + measured shared.** KDS aggregation scopes location too late, repeats acknowledgement predicates, and builds modifiers per item. Shared evidence reports 3,978 calls and approximately 98.91 ms mean for `get_kds_tickets_v2`. Display-filtered polling, reconnect/fallback behavior, online nested bootstrap, and broadcast-driven refresh add fleet frequency.

The current polling effect also has a correctness risk: when mounted healthy with no display filter, `app/(main)/kds.tsx:2547-2572` returns without arming a timer and intentionally excludes live connection state from dependencies. A later disconnect can leave no fallback timer until another dependency changes; reconnect does trigger a fetch.

There is a second confirmed convergence risk under sustained traffic. Header-only broadcasts schedule the authoritative RPC through one trailing 300 ms timer (`stores/useKDSStore.ts:2459-2512,2777-2784`); every relevant event clears and rearms it. A continuous stream above roughly 3.3 relevant events/second can prevent a quiet window indefinitely, and the healthy unfiltered KDS has no safety poll. The threshold is timer math, not a measured staging event rate.

**Required action:** create a location-first KDS vNext contract with one-pass acknowledgement/modifier aggregation, compact header events, and typed sorting before JSON. Replace trailing-only refresh with leading/trailing coalescing and a maximum wait; explicitly arm/cancel fallback polling on connection transitions. Preserve routing, Done retention, rush, notice acknowledgement, server name, and offline behavior.

### P1 — End of Day has correctness, raw-transfer, duplicate-read, and N+1 defects

**Confirmed static.** The historical payment predicate at `services/endOfDayService.ts:600-603` applies a lower bound or accepts null timestamps but has no upper bound, so a past-day summary can include later and null-timestamp payments. Date boundaries use device-local midnight at `:582-588`, not the authoritative location business day.

`fetchOpenOrders` filters lowercase `opened` at `:318-326`, while current types/migrations use `Opened`; bulk close writes lowercase `closed` directly at `:358-370`, bypasses `close_check` audit/sync-version behavior, and always returns `0` at `:384`. Raw facts are aggregated in JavaScript and variance analysis is sequential per flagged session.

**Required action:** one tenant-safe, location-timezone, set-based EOD contract with a canonical reporting timestamp and check-state vocabulary; narrow aggregates plus paged drill-down; batch variance analysis; route close/void through authoritative audited mutations. Verify totals against website reports before rollout.

### P1 — Previous Orders performs avoidable page/count/summary work

**Confirmed static.** A refresh can involve business-day RPC, up-to-5,000-row summary, full nested 50-row page, and exact count; stale-cache probes add two more requests. Compared with the prior evidence commit, current HEAD removed reuse of server-resolved business-day bounds and cached summary behavior, so filter/tab refreshes again pay more repeated work.

**Required action:** server `GROUP BY/FILTER` summary, narrow list DTO, lazy detail, reusable business-day bounds by window, and count invalidation only for relevant mutations. Keep exports separate from interactive lists.

Opening payment detail also issues overlapping reads: `components/menu/PaymentDetailBottomSheetBody.tsx:5485-5503` starts `get_order_details`, which already includes payments, and separately loads the wide payment graph in `hooks/orders/useOrderPayments.ts:98-166`. Seed one cache from the other response or give each tab an explicit projection; this branch is structurally two requests where one owner should suffice.

### P1 — Analytics and refund allocation are unbounded/request-linear client workflows

**Confirmed static.** `stores/useAnalyticsStore.ts:141-389` downloads raw facts sequentially, aggregates client-side, constructs a potentially large order-ID `.in(...)`, and reads merchant-wide loyalty data. `services/refundService.ts:1632-1657` performs two reads per item.

**Required action:** location/date-scoped aggregate RPCs with paged drill-down and top-N SQL; batch refund input reads or place allocation inside the authoritative transactional refund contract. Do not parallelize financial mutations merely to hide the waterfall.

### P1 — Offline compatibility contains version and defensive-check gaps

**Confirmed static.** `services/offlineSyncService.ts:2586-2627` dead-letters older/missing operation versions before field-level migration can run. Online preauth can select v3/v4 while replay hardcodes v1. `services/offlineSyncInit.ts:1275-1283` selects nonexistent `orders.order_status` (the schema exposes `status`), ignores the query error, and lets the defensive payment precheck fail open; the authoritative payment RPC remains the final guard.

**Required action:** per-operation migrators and explicit offline compatibility windows; align online/replay versions; fix the read column; keep transactional server validation and manual dead-letter visibility.

### P2 — Floor geometry/session separation is directionally improved but bootstrap still fans out

**Confirmed static.** Broadcast-driven refresh now uses compact session status when geometry is cached and throttles refresh, which is a meaningful improvement. Cold boot/prefetch still performs roughly `1 + 4F` requests and full geometry rows per plan.

**Required action:** versioned geometry snapshot/delta cached locally plus compact authoritative session state; prefetch inactive plan geometry on demand or in one location snapshot. Never serve active session/payment truth from a stale generic cache.

### P2 — Menu/bootstrap duplicates data ownership

**Confirmed static.** A minimum of 12 requests across full/standalone/snooze/tax paths can overlap at location bootstrap; recipes and snoozes are duplicated and some recipe reads lack explicit tenant scope.

**Required action:** define whether full sync owns recipes/tax/snoozes. Seed separately keyed caches from one response or remove those fields and keep one query per domain. Add explicit merchant/location predicates even when RLS remains the enforcement layer.

### P2 — Realtime shared cost is measured; current POS attribution is not

**Measured shared:** Realtime change-feed work accounts for 17.12% of refreshed top-100 time and previously about 1.1 million calls/2.64 database-hours. **Confirmed current POS:** the app uses targeted Broadcast channels with a singleton socket and explicit cleanup, plus throttled authoritative reconciliation. No duplicate `postgres_changes` subscription is present.

**Required action:** capture per-workflow database deltas, channel joins/reconnects, trigger message counts, payload bytes, and commit-to-client latency. Review live Broadcast triggers/publications and private-channel RLS. Reduce one-logical-action-to-many-row broadcasts before adding infrastructure.

Current source also turns each floor signal into an authoritative `get_location_table_status_v2` reread, throttled to one per 1.5 seconds per subscribed station (`hooks/realtime/useFloorRealtime.ts:124-203`; `stores/useFloorPlanStore.ts:1250-1261`). Because the provider is globally mounted, this includes KDS processes; at 100 subscribed terminals the timer ceiling is a theoretical 4,000 RPCs/minute. Session validation independently polls every 30 seconds per station. These are structural ceilings, not observed call rates. Live trigger topology is unresolved because migrations alternately create/drop immediate, cascade, and deferred order broadcast triggers.

### P2 — Broad projections and exact counts remain a coupling surface

**Confirmed static.** There are 25 exact `.select("*")` sites across 15 production files plus many nested projections beginning with `*`. Important current examples include floor geometry (`floorPlanService.ts:108`), history/detail fallbacks, payment terminal, loyalty, customer, printer, KDS config, and cash drawer reads.

**Required action:** prioritize hot/list paths; do not mechanically rewrite mutation follow-up reads or stable tiny config tables without payload evidence. Add response-byte instrumentation outside dev builds for selected hot queries.

## Shared Database, Security, and RLS Findings

The following are shared staging facts, not newly collected SQL in this POS phase:

- 511 live `SECURITY DEFINER` signatures; 465 effectively executable by `anon`, 495 by `authenticated`, all 511 by `service_role`.
- 500 functions have pinned `search_path`; 11 do not.
- Five functions are proven authless P0 contracts; four have current POS callers.
- Current canonical PIN login source has a cross-location/station binding gap and persists plaintext PIN input; fresh live-body/grant evidence is required.
- Preauthorization and payment-terminal definer families have active POS callers and repository bodies that need signature-level live authorization verification.
- `kiosk_pickup_sequences` and `luqra_sync_runs` have RLS disabled with full anonymous/authenticated privileges. No current POS caller was found for either table.
- 436 RLS policies exist across 204 tables; role-realistic planner evidence is still missing.

Do not equate anonymous execute on all 465 functions with 465 exploitable functions. Public storefront, QR, OTP, customer self-service, authenticated station, and offline workflows require signature-by-signature classification. The compatible sequence is caller inventory → internal authorization review → versioned replacement where needed → explicit role allowlist → monitored grant retirement.

## Query, Payload, and Index Direction

### POS-owned application changes

- Unify payment/preauth selection across direct/service/replay.
- Remove duplicate bootstrap ownership and scope direct reads explicitly.
- Use narrow list DTOs and lazy detail for orders/history.
- Replace raw analytics/EOD aggregation and refund `2N` reads.
- Correct KDS connection-state fallback and EOD/offline column/status defects.
- Instrument request count, response bytes, retry state, and channel reconnects.

### Shared database changes

- Canonicalize migrations and export live critical definitions.
- Add caller-derived authorization to definer RPCs and station metadata contracts.
- Version active-order/detail/KDS/floor/EOD/analytics contracts.
- Preserve transactional snapshots on orders/payments; omit unused snapshots from hot read DTOs rather than normalizing away historical truth.
- Validate sargable business-day/reporting timestamp predicates.

### Index policy

Do not add indexes from this source audit alone. Shared evidence already shows relevant child indexes and extensive/duplicated order/payment indexes. Plans and controlled deltas must precede additions or removals. Duplicate-index cleanup is write-amplification/migration hygiene at current scale, not a capacity remedy.

## Cache and Redis Recommendation

| Layer | Appropriate POS use | Guardrail |
| --- | --- | --- |
| Request-local memo/dedupe | Coalesce identical work in one action/resume window | Never outlive the operation's authority checks |
| Zustand | Live UI/workflow state and optimistic reconciliation | Not database truth across stations |
| Persisted MMKV/offline queue | Menu/config snapshots and durable replay intent | Version entries; preserve manual recovery and idempotency |
| React Query | Bounded reads, offline-first bridge, explicit invalidation | Stable tenant/location keys and one owner per dataset |
| Postgres | Orders, payments, KDS, shifts, inventory acceptance, entitlements | Optimize SQL/payload/indexes first |
| Redis | Possible later stale-tolerant read models or ephemeral coordination | Only after measured repeated cross-instance demand remains |

**Decision: no general Redis cache now.** Reconsider only for versioned public menu read models, explicitly stale-tolerant analytics snapshots, distributed rate limits, or leases after P0-P2 remediation and measurement. Never use generic stale cache for payments, active orders, KDS, shifts, transactional inventory, idempotency, or subscription access.

## 10x and 100x Scaling Model

This is a structural model, not a benchmark. Applying simple volume multipliers to shared staging row estimates:

| Relation | Shared staging estimate | 10x | 100x |
| --- | ---: | ---: | ---: |
| `orders` | 6,539 | 65,390 | 653,900 |
| `order_items` | 11,127 | 111,270 | 1,112,700 |
| `order_item_modifiers` | 8,460 | 84,600 | 846,000 |
| `order_payments` | 5,100 | 51,000 | 510,000 |
| `table_sessions` | 1,410 | 14,100 | 141,000 |

Expected pressure if shapes remain:

- Broad bounded payloads grow with rows per active window and child cardinality; unbounded analytics/EOD/menu/history reads grow with retained history/catalog.
- `get_active_orders_v1` has a 200-order ceiling, so scale can become silent incompleteness before pure latency failure. Payload is approximately `O × [order + I × (item + M × modifier) + payments + discounts]`; growing both active-order and item cardinality 10x is a theoretical roughly 100x child-graph pressure, subject to caps and actual distributions.
- KDS cost can multiply by both data volume and display/station count. Ten times the item history and ten times the polling displays is a theoretical 100x fleet-work risk when location scoping happens late; 100x/100x becomes 10,000x. This is an upper-bound structural warning, not a forecast.
- Floor cold-start calls grow with plan count and station count; volatile reconciliation grows with broadcast rate and stations.
- Offline replay remains intentionally serial; backlog drain time grows approximately linearly with queued operations, currently about four database calls per queued payment.
- Timeclock replay processes the queue head on a 10-second interval (`services/timeclockSyncProcessor.ts:207-245,269-323`), so its ideal no-retry ceiling is 0.1 action/second: 100 actions require at least 16.7 minutes and 500 at least 83.3 minutes. This is deterministic timer math, not observed recovery time.
- Realtime connections grow roughly with stations because the client shares one socket per app process; channel joins/messages grow with active screens and location events. Plan limits must be checked against actual plan/peak stations, not global benchmark marketing numbers.
- Large `.in(orderIds)` analytics/refund/report requests can hit URL/gateway limits before database capacity.

At 10x, narrow/location-first operational RPCs, batching, pagination, and telemetry are required. At 100x, evaluate tenant skew, summary/read models, connection pooling, retention, and optional stale-tolerant replicas/caches only after measured single-primary optimization. Current staging size does not justify partitioning or sharding.

## Applicable Mature-POS and Platform Patterns

- Stripe Terminal and Square document offline payments as durable local state that is forwarded after reconnection, with explicit expiry/risk/amount controls and warnings against deleting local state. Dexa should keep durable versioned replay, idempotency, visible pending state, and operator recovery rather than converting financial replay into generic cache.
- Toast documents automatic recovery/capture after connectivity returns and warns against manually duplicating capture. Dexa's payment journals and verification paths are directionally appropriate; the version split and multi-call replay contract must be resolved without weakening duplicate protection.
- Supabase recommends Broadcast over Postgres Changes for scalable/security-sensitive database notifications. Dexa already uses Broadcast/private channels; the next step is compact trigger payloads and one logical signal per transaction, not adding more subscriptions.
- Mature systems separate operational lists from details and reports: bounded headers for active work, on-demand details, and server aggregates for historical reporting. This matches the proposed active-order/history/EOD/KDS read models without requiring premature distributed infrastructure.

References:

- Stripe Terminal offline payments: https://docs.stripe.com/terminal/features/operate-offline/collect-card-payments
- Square offline payments: https://squareup.com/help/us/en/article/7777-process-card-payments-with-offline-mode
- Toast offline auto-capture: https://central.toasttab.com/articles/Knowledge/Close-Out-Day-Z-Report-Auto-Capture
- Supabase Broadcast/Postgres Changes guidance: https://supabase.com/docs/guides/realtime/subscribing-to-database-changes
- Supabase Realtime architecture and limits: https://supabase.com/docs/guides/realtime/architecture and https://supabase.com/docs/guides/realtime/limits
- PostgreSQL `pg_stat_statements`: https://www.postgresql.org/docs/current/pgstatstatements.html

## Phased Remediation Plan

### Phase 0 — Contract and security containment

1. Assign one shared database/migration owner and canonical root.
2. Export live definitions/grants for station status, payment/preauth, active orders/details, KDS, floor, EOD, and the five authless functions.
3. Reject conflict markers/rollback files in deployable migration CI.
4. Design forward-only, caller-derived authorization replacements for the four POS-used authless functions and the station metadata RPC; separately contain the two exposed tables.
5. Align payment/preauth/offline routing without removing compatibility versions.
6. Run the controlled workload runbook.

### Phase 1 — POS-only safe bounds and correctness

1. Fix the EOD upper bound, business-day source, check-status vocabulary, and raw mutation bypass.
2. Fix offline `order_status` read and operation-version migration.
3. Batch refund allocation reads.
4. Reuse Previous Orders bounds, narrow list projection, and stop redundant counts/summaries.
5. Remove duplicate bootstrap recipes/tax/snooze ownership and add explicit scope.
6. Correct KDS polling transition logic.

### Phase 2 — Version operational read contracts

1. `get_active_orders_v2` and `get_order_details_v2`.
2. Location-first `get_kds_tickets_vNext`.
3. Versioned floor geometry plus compact session status.
4. EOD/analytics aggregate contracts with paged drill-down.

Deploy database first, compare semantic fixtures, canary POS callers, keep old versions through an agreed offline window, monitor errors/time/rows/bytes, then retire separately.

### Phase 3 — Evidence-led maintenance and capacity

- Role-realistic RLS plans and definer allowlist.
- Query-plan-confirmed indexes only.
- Constraint-aware duplicate-index consolidation.
- Table-specific autovacuum tuning only after churn measurement.
- Redis/read replica/partition decision only if residual measured demand warrants it.

## Estimated Benefits and Confidence Limits

| Change | Structural estimate | Confidence |
| --- | --- | --- |
| Narrow active-order/detail DTOs | 40%+ payload reduction target; remove correlated whole-row serialization | Medium that bytes/CPU fall; low for latency until capture |
| Previous Orders aggregate summary | Replace up to 5,000 transferred rows and repeated count fan-out with one small result | High for request/row reduction; latency unmeasured |
| Refund allocation batching | `2N` reads to approximately two reads before mutations | High structurally |
| Floor cold bootstrap | `1 + 4F` toward one plan list plus one/few geometry/session requests | High for request count; payload depends on contract |
| EOD aggregate contract | Four raw facts + staff/drawer/N variance waterfall toward one summary plus paged details | High for rows/requests; correctness fixture required |
| KDS early scoping | Prevent data-volume × display-count amplification | Medium; live plan/fixture required |
| Bootstrap dedupe | Eliminate duplicate recipe/tax/snooze requests | High structurally |

No benefit is achieved in this audit phase. All latency/SLO targets are provisional.

## Verification and Measurement Plan

1. Ali returns the exact JSON package defined by `POS-SUPABASE-PERFORMANCE-RUNTIME-RUNBOOK-2026-08-03.md`.
2. Validate matching server/statistics reset timestamps and non-negative counters.
3. Join by `queryid`; compute calls, total execution time, and rows deltas; `delta_mean_ms = total_exec_ms_delta / calls_delta` when calls are positive. Never subtract cumulative mean/max values.
4. Group query IDs into current call families using statement text and workflow timestamps.
5. Capture client request count, elapsed time, response bytes, retries, journal state, channel reconnects, and visible correctness.
6. For proposed reads only, collect safe representative plans with role-realistic tenant scope. Do not `EXPLAIN ANALYZE` writes.
7. Repeat identical before/after fixtures for each implementation ticket and compare payload semantics as well as speed.

## Risks and Senior Decisions

1. Name the canonical shared migration repository/root and owner.
2. Decide the forward payment/preauth generation and offline compatibility window.
3. Approve caller/station/merchant authorization contracts for the four POS-used authless functions and station metadata RPC.
4. Decide canonical `check_status` vocabulary and authoritative EOD/business-day contract.
5. Set RPC retirement evidence window for deployed/offline clients.
6. Approve POS workload capture and production read-only evidence access.
7. Decide acceptable freshness for historical reports only; operational state remains strongly authoritative.

## What Changed Since the Prior POS Evidence Commit

- Kiosk UI/hooks/stores and related SQL were removed; lexical table calls fell 382 → 370, literal RPC calls 215 → 214, exact `select("*")` 27 → 25, canonical migrations 39 → 36, and utility migrations 333 → 332.
- The previous read-only collectors and prior task audit were removed; the focused collector is restored by this audit.
- `services/orderService.ts` regressed its vNext payment target from v17 to v16 while the direct store path stayed v17.
- The station-status reference SQL now contains unresolved conflict markers.
- Previous Orders lost reuse of authoritative window bounds/cached summaries and again repeats work on refresh, despite retaining bounded 50-row pages.
- The major active-order, KDS, floor, analytics, EOD, menu, refund, Realtime, security, and migration-governance findings remain materially present.

## Unverified Items

- Which current POS query IDs and call counts occur in controlled workflows.
- Current POS p50/p95/p99 and response bytes.
- Live definition/grants equivalence for the conflicted station RPC and missing local payment/preauth definitions.
- Current production/staging flag state selecting v12/v16/v17 and preauth v1/v3/v4.
- End-to-end Realtime latency, trigger amplification, connection peaks, and reconnect frequency.
- Role-realistic RLS plan cost and production relation/index/churn behavior.
- Controlled before/after pairs; the received standalone snapshot cannot produce query-ID deltas.

Do not implement optimizations or shared migrations until this audit, ownership decisions, and runtime evidence are reviewed.
