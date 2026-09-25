# Supabase Connections and Storage: Diagnosis and Fix Plan (2026-09-24)

The Supabase project is at 59 of the 60 connections that Micro compute allows, and four tables take up 91% of its 2.39 GB database. This document covers what holds the connections, what makes them spike, and what fills the disk, then lists the fixes in the order to ship them. Dexa-POS and DexaPOS-Website share this database, so most phases touch both repos.

## Status (2026-09-25)

Every code change in the plan is written and verified locally. Nothing is applied to a database or deployed yet: this workspace has no database credentials, Supabase CLI or dashboard access. The [deployment runbook](#deployment-runbook) lists what to run, in order.

| Phase | Code | Applied / deployed |
| --- | --- | --- |
| 1 Immediate relief | Nothing to write (dashboard settings) | **Pending**: staging and production dashboard |
| 2 Remove KDS snapshots | **Done** | Pending: Website deploy, then migration |
| 3 DB hardening | **Done** (auto clock-out left out by decision) | Pending: migrations, `valor-webhook` deploy, `VACUUM FULL` |
| 4 POS release | **Done**, with tests | Pending: POS build or OTA, after 3.4 is live |
| 5 Website Realtime cleanup | **Done** | Pending: Website deploy and migrations; 5.6 last |
| 6 Scale readiness | **Done**: 6.2 (behind a flag) and 6.3 (behind an env var) | Pending: 6.1 billing, 6.3 Clerk template, 6.4 load test |

**Branches.** Website: `db/connections-and-storage`, from `origin/dexaposwebsite-preview`. POS: `db-fixes`. Nothing is committed yet.

**Out of scope by decision (2026-09-25).** `auto_clock_out_stale_shifts` is left exactly as it is: not ported to the canonical root, not added to the dispatcher, not scheduled.

## Summary

- **None of our code opens Postgres connections directly.** The POS app, the Website and every edge function go through `supabase-js`. Every connection belongs to a Supabase service (Realtime, PostgREST, Auth, Storage, monitoring), to pg_cron, or to someone using the dashboard or a database tool.
- **The number of devices doesn't set the connection count.** A device's 4 Realtime channels connect to Supabase's Realtime server, not to Postgres. Realtime uses its own fixed pool of database connections for all devices.
- **Realtime is the largest holder: 16 connections, against Supabase's documented Micro default of 9.**
  - 6 of those 9 exist only because the Website has `postgres_changes` subscriptions.
  - Of its 7 subscriptions, only 2 deliver anything; the other 5 are dead code or blocked by RLS.
- **The rest of the peak comes from:**
  - PostgREST filling its pool under device polling and slow, locking SQL
  - pg_cron opening a new connection for every run (about 11,600 a day), all on the same minute marks
- **Storage:** `kds_board_snapshots` is 1.09 GB. Valor webhook logs, the webhook dead-letter queue and cron history have no retention.
  - **Decision: remove the KDS board snapshot feature entirely.**

## Evidence (live snapshot, 2026-09-24)

| Role | Application | State | Connections |
| --- | --- | --- | --- |
| supabase_admin | `realtime_connect` (Realtime pools) | idle | 15 |
| authenticator | `postgrest` (all app and edge function API traffic) | idle | 5 |
| supabase_admin | `realtime_replication_connection` (walsender) | active | 1 |
| supabase_admin | `postgres_exporter` (metrics) | idle | 1 |
| postgres | `supabase/dashboard-query-editor` (the diagnostic query) | active | 1 |
| supabase_admin | pg_cron scheduler, pg_net worker | — | 2 |
| — | Postgres internals (checkpointer, WAL writer, archiver, bgwriter, launchers) | — | 6 |

- `cron.use_background_workers` is `off`, so every cron run opens a new connection.
- In the last hour, every cron run finished in under 0.7 s.
- `auto_clock_out_stale_shifts` (every 15 min, `Dexa-POS/supabase/migrations/20260702120000_auto_clock_out_stale_shifts.sql:276`) did not run in that hour. It exists only in Dexa-POS, not in the canonical Website migration root. Left as is by decision.

## Issues

### 1. Realtime holds more connections than the default

- **Observed vs default:** Micro's documented Realtime total is 9 ([Supabase: Realtime concepts](https://supabase.com/docs/guides/realtime/concepts)):
  - 1 for broadcast from the database
  - 2 for the authorization pool
  - 2 each for Postgres Changes subscription management, cleanup and WAL pull
  - We observed 16.
- **The 6 Postgres Changes connections** start only while at least one `postgres_changes` subscription exists. The POS app has none. The Website had 7:

| Subscription | Tables | Delivered? | Why |
| --- | --- | --- | --- |
| `stores/floor-plan-store.ts` | table_sessions, table_session_tables, waitlist, reservations | No | `setupRealtimeSubscriptions` was never called: `initialize()` has no callers |
| `app/sites/components/OrderStatusWatcher.tsx` | orders UPDATE by id | No | Anon client; orders RLS is `TO authenticated` only |
| `app/dashboard/settings/stations/hooks/useDeviceRealtime.ts` | device_heartbeats | No | Anon client, and the table isn't in the publication |
| `app/dashboard/settings/receipt-templates/hooks/useReceiptTemplateRealtime.ts` | receipt_templates | No | Anon client, and the table isn't in the publication |
| `components/notifications/NotificationBell.tsx` | support_tickets, support_ticket_messages (no filter) | Yes | Clerk-token client. It already polled every 120 s. |
| `components/notifications/ReadOnlyNotificationBell.tsx` | app_notifications INSERT | Yes | Clerk-token client. It already polled every 60 s. |

- **The authorization pool** is used on every private channel join and every `access_token` refresh ([Supabase: Realtime settings](https://supabase.com/docs/guides/realtime/settings)).
  - Each POS, KDS and kiosk joins 2 private channels.
  - Each device pushes a new Clerk token to those channels roughly every 30 s (`hooks/useSupabaseClient.ts`: the ~60 s session token is refreshed 30 s before expiry).

### 2. pg_cron opens a connection per run and all jobs fire at the same moments

- About 5 jobs run together at every minute mark and about 8 at :00/:15/:30/:45.
- In total, cron opens about 11,600 connections a day. The 15-second snapshot drain accounts for 5,760 of them.
- Nothing purges `cron.job_run_details` (50 MB).
- `mark-stale-stations-offline` is live but no tracked migration schedules it.

### 3. POS polling keeps PostgREST busy

- **Session-kick check.** It ran 3 RPCs every 30 s on every device (`hooks/useSessionKickListener.ts`): `check_device_session_status`, `get_subscription_access_state` and the location-wide `get_location_stations_with_status`. Every `CLOSED`/`CHANNEL_ERROR` on the kick channel re-ran all 3 immediately, with no throttle, including the `CLOSED` its own cleanup causes.
- **Reconnect catch-up had no random delay.** Every device fired its floor, order and KDS catch-up at the same instant, and the fallback poll started with a full floor load even on a brief `CLOSED` during a resubscribe.
- **The tables sidebar forced a reconnect every 30 s** while the floor channel was in `CHANNEL_ERROR`, resetting the retry counter each time.
- **Kiosks joined the tables channel and ran floor sync without showing a floor.**
- **Delta sync** pulled orders every 30 s on POS devices, even though every order broadcast already triggers a pull.
- **Lock timeouts were misclassified.** `55P03` (lock timeout) wasn't in `TRANSIENT_PG_CODES`.

### 4. Website polling and broken Realtime listeners

- **Floor status poll.** The merchant dashboard polled floor status every **5 s, even in background tabs**.
- **Anon clients on private topics.** `QrGuestAlertsPanel` (15 s poll) and the HQ KDS mirror (5 s poll) listened on topics that are only emitted as private, so they received nothing.
- **QR session broadcasts.** `broadcast_order_changes` sent `qr-session:{token}` as private, but the anon storefront listens on the public channel. QR guests fell back to a 5 s poll.
- **No push from POS to storefront visitors.** When the POS accepted an order or marked it ready, storefront visitors got no push.

### 5. Slow or locking SQL keeps PostgREST connections checked out

- **Order-number lock.** `generate_order_number` and `generate_order_number_internal` took a session-level `pg_advisory_lock` on every call (`Dexa-POS/supabase/migrations/20260629130000_order_numbers_location_timezone.sql:65, 185`). A statement timeout skips the unlock (`WHEN OTHERS` doesn't catch `query_canceled`), so a pooled connection kept the lock and later orders on that sequence waited 8 s.
- **Payment row lock.** `process_payment_v17` locks the order row with no `lock_timeout` (`DexaPOS-Website/supabase/migrations/20260915120100_process_payment_v17_codepay_branch.sql:150`). Not changed by this plan.
- **KDS snapshot on send.** The board snapshot was captured synchronously when an order was sent to the kitchen (`kds_board_snapshot_at_commit`).

### 6. Storage without retention

| Table | Size | Share of 2.39 GB | Retention before | After this plan |
| --- | --- | --- | --- | --- |
| `kds_board_snapshots` | 1.09 GB | 45.5% | 14 days | Table dropped (Phase 2) |
| `valor_webhook_events` | 783 MB + 22.5 MB index | 32.0% | None; every request stored with its full body | 30 days; no body for unverified requests |
| `webhook_dead_letter_queue` | 281 MB | 11.5% | None | Resolved/abandoned rows: 30 days |
| `cron.job_run_details` | 50 MB | 2.0% | None | 7 days |

### 7. At 100 restaurants × 5 devices (500 devices)

The connection count stays capped because the pools are fixed size. What runs out is Realtime quota and PostgREST throughput ([Supabase: Realtime limits](https://supabase.com/docs/guides/realtime/limits)).

| Limit | Pro, spend cap on | Pro with cap off, or Team | 500 devices |
| --- | --- | --- | --- |
| Concurrent Realtime connections | 500 | 10,000 | At the cap before Website visitors |
| Channel joins/sec | 500 | 2,500 | About 2,000 joins in a reconnect wave |
| Messages/sec | 500 | 2,500 | Borderline at dinner peak |

---

## Fix plan

**Ground rules**
- **Migration home:** DB changes go in the canonical root, `DexaPOS-Website/supabase/migrations/`. KDS-shared migrations, and migrations that replace a body whose latest version lives in the POS root, are mirrored into `Dexa-POS/supabase/migrations/` with the same filename. Rollbacks go in `DexaPOS-Website/supabase/migrations/rollback/`.
- **Rollout:** apply every DB change on staging (`dfwqakoyittmrwbqvxgw`) first, soak it for 24 h including a service period, then apply it on production (`hifouuofcaytijrkbvcy`).
- **Regenerate types:** regenerate `database.types.ts` in both repos after the migrations are applied.
- **Record results:** each step's verification result goes in the Results section.

**Migrations added** (canonical root, apply in this order; see the runbook for when)

| File | Phase | Mirrored in Dexa-POS | Rollback |
| --- | --- | --- | --- |
| `20260925120000_remove_kds_board_snapshots.sql` | 2 | Yes, byte-identical | `rollback/20260925120000_remove_kds_board_snapshots_rollback.sql` |
| `20260925121000_connection_hardening.sql` | 3.1, 3.2, 3.4 | No | `rollback/20260925121000_connection_hardening_rollback.sql` |
| `20260925121500_order_number_xact_lock.sql` | 3.3 | Yes, byte-identical | `rollback/20260925121500_order_number_xact_lock_rollback.sql` |
| `20260925122000_storefront_push_and_realtime_access.sql` | 5.2, 5.4 | No | `rollback/20260925122000_storefront_push_and_realtime_access_rollback.sql` |
| `20260925123000_table_session_broadcast_fields.sql` | 6.2 | No | `rollback/20260925123000_table_session_broadcast_fields_rollback.sql` |
| `20260925124000_realtime_publication_empty.sql` | 5.6 | No | `rollback/20260925124000_realtime_publication_empty_rollback.sql` |

### Phase 1: Immediate relief (dashboard only) — PENDING

Needs someone with dashboard access; there is no code for it.

- [ ] **1.1** Realtime → Settings on production and staging: set Database connection pool size to **2** and Postgres Changes pool size to **2** (the Micro defaults). This returns Realtime to about 9 connections.
  - Watch Realtime → Reports for join errors over the next service. If errors appear, raise the authorization pool to 3.
- [ ] **1.2** Upgrade production from Micro to **Small**: 90 connections, about $15/month instead of about $10. It takes effect after a short restart, so schedule it outside service hours.
  - This is headroom while Phases 2–5 ship, not a fix on its own.
  - On Small, Supabase's Realtime authorization default becomes 5; keep it at 2–3 unless joins error.

**Rollback:** restore the previous values or compute size.

### Phase 2: Remove the KDS board snapshot feature — CODE DONE

- **What's lost:** only the HQ support replay timeline.
- **What stays:** the live board mirror (`hq_get_kds_board_mirror_v1`, which calls `get_kds_tickets_v3` directly), the send ledger, unsent items, device truth (`kds_device_snapshots`, `kds-device-truth-purge`), the divergence list, routing health, and the shared `protect_kds_trace_ledger()`.

**2A. Website UI** (deploy before the migration)
- [x] Deleted `app/manage/support/kds-mirror/components/KdsMirrorTimeline.tsx`. Its `TIMELINE_WINDOWS` / `TimelineWindowKey` are still used by the Device truth tab, so they moved to `components/timelineWindows.ts`.
- [x] `hooks/useKdsMirror.ts`: removed `useKdsMirrorSnapshots`, `useKdsBoardSnapshot`, their query keys and imports.
- [x] `page.tsx`: removed the scrubber state, the window anchor, the timeline, and the "stored snapshot" notice. The board always shows the live mirror.
- [x] `app/manage/actions/kds-mirror.ts`: removed `hqGetKdsBoardSnapshots`, `hqGetKdsBoardSnapshot` and the two snapshot interfaces.
- [x] `KdsMirrorControls.tsx`: the comment that referred to the replay scrubber is updated.

**2B. Migration `20260925120000_remove_kds_board_snapshots.sql`** (one transaction, `lock_timeout` 3 s)
- [x] Unschedules `drain-kds-board-snapshot-queue` and `kds-board-snapshot-purge`.
- [x] Drops `trg_kds_board_snapshot_arrival_insert/_update` on `order_items` (and the superseded `_after_fire_*` triggers and functions, if present), then `kds_board_snapshot_at_commit()`.
- [x] `CREATE OR REPLACE bulk_update_order_item_status_v2`: the body of `20260922120000` with only the snapshot block removed (checked with `diff`). The `ORDER BY id FOR UPDATE` lock, the 2 s `lock_timeout` and the orders `UPDATE`/touch split are unchanged. Grants are re-issued and the COMMENT rewritten. This runs **before** the capture functions are dropped: PL/pgSQL doesn't track dependencies, so the other order would make every ready/served bump fail.
- [x] Drops the six snapshot functions, then `kds_board_snapshot_queue` and `kds_board_snapshots` (no `CASCADE`). This frees 1.09 GB.

**2C. Verify**
- [x] Local (PGlite 18): after the migration, no function source mentions `kds_board_snapshot`, both cron jobs and both triggers are gone, both tables are gone, and the bump RPC keeps its lock and timeout. The rollback re-applies cleanly.
- [ ] Staging: `select proname from pg_proc where prosrc ilike '%kds_board_snapshot%';` returns no rows.
- [ ] Staging: `select jobname from cron.job where jobname ilike '%snapshot%';` returns no rows.
- [ ] Staging, two-display store: send to kitchen, bump a ticket, then bump the second course of the same order. Both displays update and the order status is right.
- [ ] Staging: the HQ KDS mirror page loads the live board, send ledger and device truth.

**Rollback:** `rollback/20260925120000_remove_kds_board_snapshots_rollback.sql` re-runs `20260827150000`, `20260827170000` and `20260922120000` in one transaction (in that order; 922 must be last). Snapshot history is gone by decision.

### Phase 3: Database hardening — CODE DONE

Split into two migrations: 3.3 replaces function bodies whose latest version lives only in the POS root, so it is mirrored there; the rest is not.

**3.1 One per-minute dispatcher** (`20260925121000_connection_hardening.sql`)
- [x] `public.run_frequent_jobs()` (`SECURITY DEFINER`, `search_path` pinned, function-level `lock_timeout` 3 s). Each job runs in its own `BEGIN … EXCEPTION WHEN OTHERS THEN RAISE WARNING` block:
  - every minute: `poke_orderout_status_relay()`, `poke_orderout_delivery_dispatch()`, `expire_stale_pending_online_orders()`
  - `minute % 2 = 0`: `mark_stale_stations_offline()`
  - `minute % 5 = 2`: `restore_expired_item_snoozes()`, `sweep_orderout_delivery_dispatches()`
  - `minute % 15 = 7`: `poke_reservation_request_expiry()`
- [x] Schedules `frequent-jobs` at `* * * * *` and, in the same transaction, unschedules the **7** jobs it replaces: `orderout-status-relay-drain`, `orderout-delivery-dispatch-drain`, `expire-stale-pending-online-orders`, `mark-stale-stations-offline`, `restore-expired-item-snoozes`, `orderout-delivery-dispatch-sweep`, `website-reservation-request-expiry`. Each one's live command is printed as a NOTICE first; `mark-stale-stations-offline` has no tracked migration, so that output is its only record. Hourly and nightly jobs, and any `auto_clock_out_stale_shifts` job, are untouched.
- [x] Revokes `run_frequent_jobs()` from `anon` and `authenticated`.
- A failing inner job does not mark the cron run failed; look for `run_frequent_jobs: <job> failed` warnings in the Postgres logs.
- **Result:** cron connections drop from about 11,600 a day to about 1,500 (with Phase 2). No more pile-ups at minute and quarter-hour marks.
- **Verify:** for 24 h, `cron.job_run_details` shows one `frequent-jobs` run per minute, each under 2 s, and the OrderOut and delivery queues still drain.
- **Rollback:** `rollback/20260925121000_connection_hardening_rollback.sql` re-schedules the 7 jobs with their original commands (only the `cron.schedule` calls; re-running the old migrations would regress `restore_expired_item_snoozes`).

**3.2 Retention**
- [x] `public.purge_operational_logs(p_batch_size => 10000, p_max_batches => 500, p_strip_since => NULL)`, scheduled nightly as `purge-operational-logs` at `20 3 * * *` with the command `CALL public.purge_operational_logs()`.
  - It is a **procedure**, not a function: it `COMMIT`s after every 10,000-row batch, which a function can't do. That's also why it has no `SECURITY DEFINER` or `SET` clause; pg_cron runs it as `postgres`.
  - `cron.job_run_details` older than 7 days, using `coalesce(end_time, start_time)` (runs orphaned by a restart have no `end_time`).
  - `webhook_dead_letter_queue` with `status in ('resolved','abandoned')` and `coalesce(resolved_at, updated_at)` older than 30 days.
  - `valor_webhook_events` older than 30 days, oldest first through `idx_valor_webhook_events_time`.
  - Sets `raw_payload = NULL` on `ignored` and `invalid_signature` Valor rows, in 6-hour windows of `received_at`. Nightly it covers the last 2 days; the one-off backfill is `CALL public.purge_operational_logs(p_strip_since => '-infinity');`.
- [x] `supabase/functions/valor-webhook/index.ts`: the unsigned `ignored` path now logs the event name in `detail` and no body; `invalid_signature` keeps its `detail` and drops the body. The verified `ignored` path (unrecognised recurring event) and every verified path still store the body.
- [ ] After the backfill, run `VACUUM FULL` off-hours (runbook step 6). It can't run in a migration.

**3.3 Order-number lock** (`20260925121500_order_number_xact_lock.sql`, mirrored in Dexa-POS)
- [x] `CREATE OR REPLACE` of both functions from the latest bodies (`Dexa-POS/supabase/migrations/20260629130000`, which is what staging runs). Naming, location-local date, bootstrap and number format are unchanged.
  - Fast path: if `to_regclass(<sequence>)` finds the day's sequence, `nextval` with no lock and no subtransaction.
  - Slow path: `pg_advisory_xact_lock`, an MVCC re-check of `pg_class` (the syscache can still hold the fast path's negative lookup), `CREATE SEQUENCE IF NOT EXISTS`, registry insert `ON CONFLICT DO NOTHING`.
  - The lock key has a new prefix (`'generate_order_number:'`), so a session lock leaked by the old code can't block the new slow path.
  - No `pg_advisory_unlock` and no `EXCEPTION` block: the lock is released on commit, rollback or statement timeout.
  - Backfills registry rows for existing `ord_seq_%` sequences, parsing both naming schemes in use.
- **Verify:** on staging, create 20 orders at once from 4 stations through a server path that generates the number (`create_order_v4` without `p_order_number`, or `process_online_order`); the POS normally sends its own number, so tapping in the app doesn't exercise this. Numbers are unique and sequential per sequence, and the idle-backend advisory lock query in the Appendix returns nothing afterwards.

**3.4 Station change push** (`20260925121000_connection_hardening.sql`)
- [x] `trg_stations_notify_updated`: `AFTER UPDATE OF` the columns the POS acts on (`is_active`, `deactivated_at`, `location_id`, `station_type`, `station_name`, `station_number`, `view_scope`, the five `can_*` flags, `current_receipt_printer_id`, `kiosk_profile_id`), with a `WHEN` clause that requires a real change. Heartbeats, `is_online` flips and device-capability writes never broadcast.
- [x] `trg_stations_notify_deleted`: a separate `AFTER DELETE` trigger (a `DELETE` trigger's `WHEN` can't reference `NEW`).
- [x] `trg_payment_terminals_notify_station`: the station's terminal lives in `payment_terminals.station_id`, not on `stations`. It nudges on insert, delete, and changes to assignment or connection config, and ignores the health and counter columns written every ~90 s.
- All three call `realtime.send('{}', 'station_updated', 'station:' || id, false)`: an empty nudge on the public channel the POS already joins. Failures are swallowed with a WARNING, so a station write never fails because of Realtime.

### Phase 4: POS release — CODE DONE

**4.1 Session-kick listener** (`hooks/useSessionKickListener.ts`)
- [x] The 30 s poll runs only `check_device_session_status` (1 RPC), wrapped in `runWithDeadline` and single-flight.
- [x] `refreshSelectedStationOperationalState` (billing and station state) runs every 5 min, on the foreground resume task, and on a `station_updated` nudge. Nudges are coalesced (at most one refresh per 10 s, plus 0–5 s jitter) and reach the hook through the `SessionKick` context. `useRemoteActionsListener` binds the event on its existing `station:{id}` channel, outside the remote-action path: no status report, no audit row.
- [x] Random 0–5 s start offset for the poll; in-flight guards on both the session check and the station refresh.
- [x] `CLOSED`/`CHANNEL_ERROR` re-checks the session (1 RPC) at most once every 60 s, and the `CLOSED` from our own cleanup is ignored.
- [x] A station refresh that finishes after the session changed (for example, a remote deactivate that also logged the device out) no longer shows a kick modal.
- [x] `stores/useOrderStore.ts`: a same-station edit to `view_scope`, the capabilities or the name now reaches `useOrderStore.currentStation` (it only synced on a station switch), and a `view_scope` change refetches visible orders. Without this, "permission edits arrive within seconds" was not true for `view_scope`.
- [x] Updated the comment at `services/orderService.ts`. Tests: `__tests__/useSessionKickListener.test.ts` (8) and `__tests__/useRemoteActionsListener.test.ts` (2).
- **Result:** 6 RPCs per minute per device drops to about 2.4. Station deactivation, permission, printer, kiosk-profile and terminal edits arrive within seconds. A billing suspension through `apply_subscription_access_state` deactivates the stations, so it also arrives within seconds; only billing denials that don't deactivate stations wait for the 5-minute refresh.

**4.2 Kiosks and KDS skip the tables channel**
- [x] `contexts/LocationRealtimeProvider.tsx`: new `floorEnabled` prop; `allConnected` and `isReconnecting` ignore a floor channel that is off by design. Set to `false` for KDS and kiosk in `app/(main)/_layout.tsx`.
- [x] Kiosk also skips `syncFloorPlans` (tax rates and receipt templates still load), `useTableSessionInit` and the `pos.floor-status-converge` resume task.
- [x] KDS table names checked: tickets carry `table_name` (the raw `table_number` from `get_kds_tickets_v3`), and `resolveKdsTableName` looks UUIDs up in the persisted floor store. The floor channel never filled that store on a KDS: `syncFloorPlans` is already skipped there, and `loadFloorPlanStatus` needs an `activeFloorPlanId` that only `syncFloorPlans` sets. Marking a session served from the KDS uses the ticket's `session_id`, which `get_kds_tickets_v3` returns.

**4.3 Random delays on reconnect** (`lib/network/jitter.ts`: `jitterMs`, `withJitter`)
- [x] `lib/realtimeConfig.ts`: `reconnectAfterMs` is the default 1/2/5/10 s schedule with ±50% jitter (channels rejoin on the same schedule).
- [x] `useFloorRealtime.ts`: re-subscribe catch-up after 0–10 s (the first subscribe after mount is still immediate); fallback poll starts after 10 s + 0–5 s instead of immediately.
- [x] `useRealtimeFallbackPolling.ts`: same 10 s + 0–5 s grace before the first poll.
- [x] `app/(main)/kds.tsx`: the disconnected poll interval gets +0–5 s and the reconnect fetch waits 0–5 s. The first fetch on mount is unchanged.
- [x] `hooks/db/useOutboxDrain.ts`: on reconnect (not mount), queued operations are released after 0–3 s.
- [x] `hooks/db/useDeltaSync.ts`: first cycle after 0–5 s.

**4.4 Tables sidebar**
- [x] `hooks/realtime/useRealtimechannel.ts`: new `retriesExhausted` status flag. `reconnect()` clears a pending backoff timer and keeps the retry budget; a successful subscribe, network restore and app resume still reset it.
- [x] `components/tables/Sidebar.tsx`: forces a reconnect only once the channel has used up its retries, every ~30 s ±30% (first after 5–10 s).

**4.5 Delta sync**
- [x] `hooks/db/useDeltaSync.ts`: 30 s → 120 s. Order broadcasts trigger a pull through `lib/db/deltaNudge.ts` (`app/(main)/_layout.tsx`), so the timer is a safety net.

**4.6 Lock errors**
- [x] `'55P03'` added to `TRANSIENT_PG_CODES` in `lib/network/opResult.ts`, so lock timeouts (the KDS bump RPC's 2 s `lock_timeout`) retry as contention. Test added to `__tests__/opResultClassifier.test.ts`.

**Verify Phase 4:** at the same fleet size, calls per hour drop for `check_device_session_status`, `get_subscription_access_state`, `get_location_stations_with_status`, `get_location_table_status_v2` and `get_kds_tickets_v3` in `pg_stat_statements`.

### Phase 5: Website Realtime cleanup — CODE DONE (5.6 applies last)

**5.1 Delete the dead `postgres_changes` subscriptions**
- [x] `stores/floor-plan-store.ts`: removed `setupRealtimeSubscriptions`, its call, the `realtimeChannel` state and the now-unused client helper.
- [x] Deleted `useDeviceRealtime.ts`; `useStationsWithHeartbeats` polls every 60 s (not in background tabs).
- [x] Deleted `useReceiptTemplateRealtime.ts`; the list refetches on window focus.
- [x] `OrderStatusWatcher.tsx`: removed the `postgres_changes` binding.

**5.2 Push order status to storefront visitors** (`20260925122000_storefront_push_and_realtime_access.sql`)
- [x] Trigger `trg_orders_broadcast_online_status`: `AFTER UPDATE OF status ON orders WHEN (old.status is distinct from new.status and new.order_source <> 'pos')` sends `{orderId, status}` as `status_changed` on the public `order-update:{id}`, the same topic and payload as the Website's REST emitters.
- [x] `broadcast_order_changes`: the `qr-session:{token}` send is public (`private = false`). The body is `20260816130000` verbatim apart from that flag, and a guard aborts the migration if the live body isn't that version.
- [x] `OrderTrackingPage`: the QR fallback poll never runs faster than 30 s, whatever `poll_interval_seconds` the RPC returns (still 5).

**5.3 Notification bells: polling instead of Realtime**
- [x] `NotificationBell.tsx`: no subscription and no Supabase client; polls every 60 s (was 120 s behind Realtime), not in background tabs, and on window focus.
- [x] `ReadOnlyNotificationBell.tsx`: same, 60 s.

**5.4 Fix the listeners that never received anything**
- [x] RLS policy `"location members receive location broadcasts"` on `realtime.messages` (permissive, `SELECT`, `TO authenticated`). It admits `location:{id}:tables`, `location:{id}:orders` and `floor-plan-{id}` for users whose `user_location_ids()` include the location, or for Dexa HQ (`is_dexapos_admin()`). It uses `realtime.topic()` and a strict UUID pattern, so the cast can't fail.
- [x] New `hooks/usePrivateBroadcast.ts`: a Clerk-token client built once (Clerk's `getToken` is stable), `realtime.setAuth()` before a `{ private: true }` join. realtime-js re-reads the token on every heartbeat.
- [x] `QrGuestAlertsPanel`: private join; poll 15 s → 60 s.
- [x] HQ KDS mirror (`useKdsMirrorRealtime`): private join. The board poll is 30 s while push is live and stays 5 s while it isn't, so a support engineer never watches a stale board.

**5.5 Dashboard floor poll**
- [x] `useFloorPlanStatus`: 5 s → 30 s, `refetchIntervalInBackground: false`, and it subscribes to the private `floor-plan-{locationId}` topic (sent by the `table_session_events` trigger) to refetch on every session change. `RuntimeTablesView` passes the location.

**5.6 Turn off Postgres Changes** (`20260925124000_realtime_publication_empty.sql`)
- [x] Drops every table in `supabase_realtime`, printing each as a NOTICE. Nothing in the POS app, the CFD build, the Website or the edge functions uses `postgres_changes` any more. Database broadcasts use Realtime's own messages publication, so they keep working.
- [ ] Apply after the Website release is live.
- **Verify:** `select count(*) from realtime.subscription;` is 0 and `realtime_connect` drops by about 6 connections.
- **Rollback:** `rollback/20260925124000_realtime_publication_empty_rollback.sql` re-adds the tables the tracked migrations had added; add any others the forward NOTICEs listed.

### Phase 6: Scale readiness (before passing ~300 devices)

- [ ] **6.1** Before 400 concurrent devices, turn the Realtime spend cap off or move to Team. Pro with the cap on allows 500 connections, 500 joins/s and 500 messages/s. Billing decision; no code.
- [x] **6.2** Apply floor broadcasts to the store directly, behind `EXPO_PUBLIC_FLOOR_BROADCAST_APPLY=1` (off by default).
  - The broadcast lacked two fields the RPC path relies on: `is_active` (the RPC only shows active sessions) and `server_staff_id`. `20260925123000_table_session_broadcast_fields.sql` adds them; nothing else in the payload changes.
  - `lib/floor/applySessionBroadcast.ts` (pure, 9 tests) applies the same rules as the RPC refresh: an inactive or `cleaning` session shows on no table, a same-session local-only status is never overwritten, a session cleared locally within the TTL stays cleared, fields the broadcast doesn't carry survive.
  - `useFloorPlanStore.applySessionBroadcastPayload` ignores out-of-order broadcasts per session and patches only the changed tables. `DELETE`s, assignment and session-event signals, or a payload without `is_active` (database not migrated yet) fall back to the existing reconcile. The heartbeat, catch-up and fallback poll still converge.
- [x] **6.3** Code: `EXPO_PUBLIC_CLERK_SUPABASE_JWT_TEMPLATE` makes the POS request that Clerk JWT template for Supabase; unset keeps the session token. `REFRESH_MARGIN_MS` stays 30 s, above the 25 s heartbeat.
  - [ ] Create the template in Clerk: lifetime 300 s, **no custom signing key** (Supabase's Clerk integration verifies with the instance keys), claims `{"role": "authenticated", "email": "{{user.primary_email_address}}", "org": {"id": "{{org.id}}"}}` (the database reads `role`, `sub`, `org.id` and `email`; `sub` is automatic). Validate on staging (sign in, place an order, bump on KDS, private channels stay joined), then set the env var in the build profile.
- [ ] **6.4** Re-run the Realtime fan-out load test (`DexaPOS-Website/docs/quality/load-testing/load-002-realtime-fanout.md`) at 500 simulated devices before onboarding past 300. Needs Phases 1–5 deployed first.

## Deployment runbook

Staging first, the whole sequence; soak 24 h including a service; then production in the same order. Run SQL outside service hours.

1. **Pre-checks, per environment** (record in Results):
   - `select jobid, jobname, schedule, command, username, active from cron.job order by jobname;`
   - `select schemaname, tablename from pg_publication_tables where pubname = 'supabase_realtime';`
   - `select policyname, roles, cmd, qual from pg_policies where schemaname = 'realtime';` (these policies exist only on the live databases; worth committing as a migration later)
   - `select obj_description('public.generate_order_number(uuid,uuid)'::regprocedure, 'pg_proc');` (should mention "location local date")
2. **Phase 1** dashboard settings (1.1 on both; 1.2 on production).
3. **Deploy the Website** from `db/connections-and-storage`. This must happen before `20260925120000`, which drops the RPCs the old HQ replay called; an old build would only show an error there.
4. **Deploy `valor-webhook`**: `supabase functions deploy valor-webhook --project-ref <ref>`.
5. **Apply the migrations** in timestamp order: `20260925120000` → `20260925121000` → `20260925121500` → `20260925122000` → `20260925123000` → `20260925124000`. Each is idempotent, and all but the last run in their own transaction. On `55P03` (lock timeout) just re-run. Keep the NOTICE output of `121000` and `124000`: it is the rollback record.
6. **Storage reclaim**, off-hours at a quiet US time (not 7 PM local, Valor's auto-batch time):
   - `CALL public.purge_operational_logs(p_strip_since => '-infinity');` from the SQL editor (not inside a transaction).
   - `SET lock_timeout = '5s'; VACUUM FULL public.valor_webhook_events;` It takes an exclusive lock and the webhook's inserts wait; on Micro it can take minutes. Run it on `webhook_dead_letter_queue` only if `pg_stat_user_tables.n_dead_tup` shows the purge freed a real share.
7. **Leaked order-number locks:** run the idle-backend advisory lock query (Appendix). Any rows are session locks left by the old code; `pg_terminate_backend(pid)` them off-peak (PostgREST reconnects).
8. **Regenerate `database.types.ts`** in both repos. This drops the snapshot tables and RPCs from the types and adds the new functions; expect unrelated drift too, since the current Website files predate `20260922120000`.
9. **POS release** (build or OTA) once `20260925121000` is live on that environment, so `station_updated` nudges exist when the 30 s station refresh goes away.
10. **Verify** each phase with its Verify list, and fill in Results.
11. **Phase 6:** set `EXPO_PUBLIC_FLOOR_BROADCAST_APPLY=1` for a pilot store's build after `20260925123000` is live; the 6.3 Clerk template; the 6.1 spend cap; the 6.4 load test.

## Timeline and owners

| Phase | When | Owner | Depends on |
| --- | --- | --- | --- |
| 1 Immediate relief | Today | Backend | — |
| 2 Remove KDS snapshots | Week 1 | Website + backend | Website deploy before the migration |
| 3 DB hardening | Week 1 | Backend | — |
| 4 POS release | Week 2 | POS | 3.4 live |
| 5 Website Realtime cleanup | Weeks 2–3 | Website | 5.6 after 5.1–5.3 are live |
| 6 Scale readiness | Before 300 devices | All | 4, 5 |

## Expected results

| Metric | Today | After the plan |
| --- | --- | --- |
| Peak connections during service | 59 of 60 | Well under the limit: Realtime −7 or more, cron spikes gone, fewer PostgREST connections held |
| `realtime_connect` connections | 15 | ≤ 3 |
| Cron-opened connections per day | ~11,600 | ~1,500 |
| Session and station RPCs per device per minute | 6 | ~2.4 |
| Database size | 2.39 GB | about 1 GB, after `VACUUM FULL` (Valor bodies of unverified requests stripped, snapshots dropped) |

## Benefits

The biggest gain is stability during busy service: the plan removes the chain that takes the system down when connections run out.

| Benefit | What changes | Phases |
| --- | --- | --- |
| No more connection exhaustion | Peak goes from 59/60 to well under the limit. Realtime drops from 16 to ≤ 3 connections, and the cron spikes at minute and quarter-hour marks go away. | 1, 2, 3.1, 5 |
| Realtime stays up during service | Near the limit, Realtime can't check access for private channel joins, so devices fall back to heavy polling and all catch up at once when it recovers. With headroom, that loop no longer starts. Random reconnect delays and the throttled session re-check stop the stampede if it ever does. | 1, 4.1, 4.3, 4.4 |
| Faster send-to-kitchen | No synchronous board snapshot per KDS display (about 135 ms each) inside the send. A store with 3 displays saves about 0.4 s per send. | 2 |
| No 8-second order stalls | A timed-out request can no longer leave the order-number lock held. Almost every call skips the lock entirely. | 3.3 |
| Less database load at peak | Session and station checks drop from 6 to about 2.4 requests per minute per device. Kiosks and KDS stop joining the floor channel. Delta sync polls 4× less often. The dashboard floor poll goes from every 5 s to every 30 s, and never in background tabs. | 4.1, 4.2, 4.5, 5.5 |
| Smaller, lighter database | About 1 GB instead of 2.39 GB. No more 130 KB snapshot writes or full bodies on unverified webhooks, and every log table has retention. | 2, 3.2 |
| Storefront customers see live order status | POS-driven changes (accepted, ready) reach the storefront immediately instead of not at all, and QR guests get push instead of a 5 s poll. | 5.2 |
| Station edits arrive in seconds | Deactivation, permissions, printer, kiosk profile and terminal changes are pushed to the device instead of waiting for a poll. | 3.4, 4.1 |
| Dead code and silent failures removed | Five `postgres_changes` subscriptions that never delivered are deleted. Three listeners that never received anything (QR alerts, HQ KDS mirror, dashboard floor) now get push. | 5.1, 5.4, 5.5 |
| Ready to grow | Per-device load drops and Realtime quota is planned for, so adding restaurants doesn't bring back the same failure. | 4, 5, 6 |

The plan doesn't rewrite the known slow queries (the nested order fetch, the floor status RPC). Those are covered in [POS-SUPABASE-PERFORMANCE-AUDIT-2026-08-03.md](POS-SUPABASE-PERFORMANCE-AUDIT-2026-08-03.md).

## Plan corrections found during implementation

- **2A:** deleting `KdsMirrorTimeline.tsx` as written would have broken the Device truth tab, which uses its `TIMELINE_WINDOWS`; they moved to `timelineWindows.ts`.
- **2B:** the snapshot call to remove was at `:517-520` in `20260922120000` (the plan said `:513-517`). The bump RPC also needed its COMMENT rewritten and its grants re-issued. Only `20260922120000` was mirrored in Dexa-POS; `20260827150000` and `20260827170000` exist only in the Website root.
- **3.1:** with auto clock-out out of scope, the dispatcher replaces 7 jobs, not 8.
- **3.2:** a function can't commit per batch, so the purge is a procedure. `cron.job_run_details` needs `coalesce(end_time, start_time)`. `valor_webhook_events` is only ~41 days old, so a 30-day purge alone frees about a quarter of it; stripping the unverified bodies is what makes `VACUUM FULL` worthwhile.
- **3.3:** the bodies to port live only in the POS root; the canonical root had an older version with a different sequence naming scheme. The re-check must read `pg_class` (the syscache can hold a negative entry), `CREATE SEQUENCE IF NOT EXISTS` must stay, and the lock key needed a new prefix.
- **3.4:** there is no terminal column on `stations` (`payment_terminals.station_id`), and one `UPDATE OR DELETE` trigger with a column-change `WHEN` is invalid, so it is three triggers.
- **4.1:** `view_scope` never reached `useOrderStore.currentStation` without a station switch; fixed.
- **5.4/5.5:** no migration in either repo defines a policy on `realtime.messages`. The live policies that admit POS devices were created by hand, so the new policy also covers `floor-plan-{id}` rather than relying on them.
- **6.2:** the broadcast payload lacked `is_active` and `server_staff_id`, so applying it directly would have kept closed sessions on tables.

## Results

Local verification, 2026-09-25. Staging and production results go below as each step lands.

- **SQL** (PGlite 18, with stand-ins for Supabase's `cron`, `net` and `realtime` schemas and the API roles): every migration and every rollback applies.
  - 2: all snapshot objects gone; bump RPC keeps its lock and timeout.
  - 3.1: the dispatcher kept running the other jobs when one threw; the cron swap is idempotent and leaves hourly jobs and `auto_clock_out_stale_shifts` alone.
  - 3.2: with 2-row batches the purge removed exactly the old cron runs (including a `NULL end_time` one), the old resolved/abandoned DLQ rows (pending and recent ones kept), the old Valor rows, and stripped only unverified bodies; `'-infinity'` on an empty table terminates.
  - 3.3: numbering continues from existing orders (`S1-0041` → `0042`, `0043`; `0007` → `0008`), no advisory locks remain after commit, an aborted transaction releases the lock and leaves no sequence, and the backfill registers both naming schemes and skips unknown merchants.
  - 3.4: heartbeats, no-op saves and terminal health writes send nothing; real station and terminal changes send one nudge each (8 of 8 expected).
  - 5.2/5.4: the guard aborts on a non-aud10 body; the push fires once, publicly, for a storefront order and never for a POS order; members and HQ are admitted, other locations and topics are not.
  - 5.6: publication emptied and restored by the rollback. 6.2: payload carries `is_active` and `server_staff_id`.
- **POS:** `npx tsc --noEmit` 0 errors. Jest 232 of 233 suites, 2,618 of 2,619 tests; the one failure (`syncOrderFromDatabaseDiscountMetadata`) fails identically on `HEAD` without these changes. 20 new tests. Lint: no new errors in changed files (9 existing ones in `kds.tsx`).
- **Website:** no TypeScript errors in changed files (837 existing ones elsewhere; builds ignore them). Vitest 165 of 173 files; the 13 failing tests fail identically on the base commit. Lint: no new errors (the 11 in changed files exist on the base).

## Open questions

- Is 30 days of Valor webhook history enough for the Valor visualizer and support? Unsigned `transactions` / `batch_detail` events logged as `ignored` no longer show a payload in the HQ device view.
- The DLQ purge frees little: every automated writer inserts `pending` and nothing auto-resolves. Decide a rule for old `pending` rows from sources HQ can't retry (anything but `orderout`).
- `order_number_day_sequences`: `cleanup_old_order_sequences` exists but is never scheduled, so a sequence per merchant, station and day accumulates. It drops them in one transaction, which could exhaust the lock table on the first run; it needs a batched version before it is scheduled.
- `valor_recurring_webhook_events.payload` has no retention either.
- The live `realtime.messages` policies should be captured into a migration (runbook step 1 prints them).
- Resolved: storefront orders always have `order_source = 'online_store'` (`process_online_order`); the 5.2 trigger covers every non-POS source, so kiosk and OrderOut orders push too.
- Resolved: a billing suspension deactivates the stations, so it arrives through 3.4 within seconds.

## Appendix: SQL

```sql
-- Connections by role (use to verify after each phase)
select usename, application_name, backend_type, state, wait_event_type, count(*)
from pg_stat_activity group by 1,2,3,4,5 order by count(*) desc;

-- Cron durations (last hour)
select j.jobname, count(*) runs, avg(d.end_time-d.start_time) avg_dur, max(d.end_time-d.start_time) max_dur
from cron.job_run_details d join cron.job j using (jobid)
where d.start_time > now() - interval '1 hour' group by 1 order by max_dur desc;

-- Held advisory locks
select l.pid, a.state, now()-a.state_change held_for
from pg_locks l join pg_stat_activity a using (pid)
where l.locktype = 'advisory' and l.granted;

-- Session advisory locks leaked by the old order-number code (idle holders)
select l.pid, a.application_name, a.state, now() - a.state_change held_for
from pg_locks l join pg_stat_activity a using (pid)
where l.locktype = 'advisory' and l.granted and a.state like 'idle%';

-- Where the Valor bytes are (before and after the strip)
select outcome, raw_payload->>'event' ev, count(*), pg_size_pretty(sum(pg_column_size(raw_payload)))
from public.valor_webhook_events group by 1,2 order by 4 desc;

-- Dead-letter queue by source and status
select source, status, count(*), pg_size_pretty(sum(pg_column_size(raw_payload)))
from public.webhook_dead_letter_queue group by 1,2 order by 3 desc;
```

## Sources

- [Supabase: Realtime concepts (database connections)](https://supabase.com/docs/guides/realtime/concepts)
- [Supabase: Realtime settings](https://supabase.com/docs/guides/realtime/settings)
- [Supabase: Realtime limits](https://supabase.com/docs/guides/realtime/limits)
- [Supabase: Compute sizes and connection limits](https://supabase.com/docs/guides/platform/compute-and-disk)
