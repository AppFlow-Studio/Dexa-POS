# KDS realtime resilience + honest device-truth arrival metric

Investigation date: 2026-09-26. Branch: `fix/lf-custom-modifier-lost-items` (work landed alongside the user's in-progress outbox changes; those files were not touched).

## Context

Report: "KDS receives order items in delayed batches instead of in real time." Evidence was the
HQ order panel's "device received" stamp vs `order_items` sent time — 24 Kitchen items sent
21:02–21:25 on Sep 20 all "arrived" 21:27:12; KDS 2 items from Sep 22–24 all "arrived" Sep 24
18:59:01, and Sep 25 items "arrived" 16:08:01.

Six investigators (db forensics, realtime config/RLS, client realtime, offline sync, logs/edge,
reproducer) plus a devil's-advocate pass converged on:

**The reported numbers are an artifact of how the device-truth ledger is written and read, not a
measurement of realtime delivery.**

- `report_kds_device_events` stamps ONE `clock_timestamp()` as `received_at` for every row of a
  heartbeat flush (60 s cadence, `services/hardware/heartbeat.ts`), so any batch shares one exact
  second.
- The KDS screen re-emits `arrived` for EVERY ticket on its MMKV-persisted board at every mount /
  restart / display switch (`app/(main)/kds.tsx` arrival effect + per-session seen-sets in
  `services/kds/kdsDeviceTruth.ts`). Each re-emission carries a new `client_event_at`, so the
  unique index inserts a NEW row.
- The HQ reader `get_kds_device_truth_for_order` reported `max(received_at)` — i.e. the LAST
  re-emission flush = the last remount / power-on, rendered by the website as "device received".
- Staging reproduces it exactly: every mass `arrived` cluster sits 0.6–1.8 s after a
  `device_login_history` row, with items up to 20 days old and 4–6 `arrived` rows per item.
- KDS 2 is the pickup screen with known dark periods on 9/24 and 9/25 until 4:08 pm (= the
  16:08:01 cluster). On 9/25 the Kitchen tablet's 19:31 OTA restart re-emitted 69 items whose real
  first arrival was 1 s after routing.

Hypotheses killed with live evidence: H1 stale JWT on the socket (one `accessToken` callback feeds
REST and the socket; realtime-js 2.90.1 re-reads it on connect, every 25 s heartbeat and every join
ack; expiry closes the channel visibly), H2 RLS/publication (private broadcast, policy simulated
PASS for active `location_members`), H4 late routing (synchronous in the send transaction), POS
outbox batching (all "sent" columns are server `now()` at RPC time).

Real gaps that DO violate the 30 s staleness cap (found while auditing, fixed here):

| id | gap | where |
|----|-----|-------|
| G0 | Clerk token mint has no deadline; a half-open socket pins `inFlightTokenFetch`, which blocks every REST call, realtime-js's own socket reconnect (`_waitForAuthIfNeeded`) and every hook resubscribe path (`await setAuth()`), for as long as the dead TCP connection lives. Recovers with one board fetch → the exact "one second, many orders" signature with no restart. | `hooks/useSupabaseClient.ts` |
| G1 | Clerk serves a cached token until 15 s before expiry; the socket only pushes a new token on the 25 s heartbeat, so ~40 % of rotations push after expiry → server closes the channel → 2–5 s reconnect + edge fetch, many times per hour. | `hooks/useSupabaseClient.ts` |
| G2 | Reconnect budget (20 attempts ≈ 16–19 min) → permanent `CHANNEL_ERROR`, revived only by a NetInfo transition, foreground or remount; no jitter (thundering herd after a Supabase blip). | `hooks/realtime/useRealtimechannel.ts` |
| G3 | `routing_mode='all'` displays stop polling after the first SUBSCRIBED and never re-arm; a half-open socket then costs 25–50 s detection + reconnect. | `app/(main)/kds.tsx` |
| G4 | Foreground resume with the channel still believed SUBSCRIBED refreshes auth only — no board refetch. | `app/(main)/kds.tsx` |
| G5 | Heartbeat resume task is skipped when the resume happens offline (`requiresNetwork`) and never re-armed → station shows offline, device-truth never flushes again this session. | `services/hardware/heartbeat.ts` |
| G6 | Device-truth pending buffer + seen-sets are in-memory: a restart discards unflushed first-arrival rows and re-emits the whole board; the 500-event cap evicts the OLDEST (first-arrival) rows. | `services/kds/kdsDeviceTruth.ts` |
| G7 | `device_heartbeats.created_at` NULL 400s when `stopHeartbeat` races a tick. | `services/hardware/heartbeat.ts` |

## Plan (checkable)

DB — website repo `supabase/migrations/20260926130000_kds_device_truth_first_arrival_and_source.sql`
(apply to staging via MCP; prod applied manually by the owner):
- [x] `kds_device_events.source` nullable text (NO CHECK — sanitized in the RPC so an unknown value can never brick a flush)
- [x] `report_kds_device_events` reads `e->>'source'` (same signature)
- [x] `get_kds_device_truth_for_order`: `arrived_at`/`ack_at`/`bumped_at` = FIRST observation on the server clock (`min(client_event_at − clock_skew_ms)`, clamped to ≥ `fired_at`); adds `first_received_at` (clock-immune, ≤ 60 s), `last_reported_at` (old value), `arrived_source`
- [x] view `v_kds_realtime_lag` → `kds_realtime_lag_seconds` per routed item, tagged by `first_source`

Client:
- [x] `lib/auth/supabaseTokenCache.ts` (new, pure TS, tested): cached Clerk token with 40 s margin, **10 s mint deadline** (falls back to the still-valid cached token, clears the in-flight slot so the next call retries, breadcrumb `auth.token mint_timeout`), **proactive forced mint at exp − 35 s** (`getToken({ skipCache: true })`) followed by `realtime.setAuth()` (no-arg — an explicit token would switch realtime-js to manual mode and stop its heartbeat refresh), exported `getCachedTokenExpMs()` for a debug overlay
- [x] `hooks/useSupabaseClient.ts` delegates to the cache module; passes the client into it so the proactive push can reach the socket
- [x] `hooks/realtime/useRealtimechannel.ts`: never give up (exponential backoff with ±50 % jitter from attempt 1, capped 60 s; `maxReconnectAttempts` now only marks when the "still retrying" warning breadcrumb fires); every `setAuth()` await bounded to 10 s and wrapped in try/catch; Sentry breadcrumb `realtime.channel` on every status transition
- [x] `app/(main)/kds.tsx`: poll chain always alive — 30 s while SUBSCRIBED, 15 s otherwise, every mode; foreground resume task `kds.board-refetch`; arrival stamp carries the delivery path
- [x] `stores/useKDSStore.ts`: `_lastTicketSource` (`mount|manual|poll|reconnect|resume|broadcast|rehydrate`) set by every path that writes `tickets`
- [x] `services/kds/kdsDeviceTruth.ts`: `source` on events; pending buffer + seen-sets persisted per display in MMKV (48 h TTL) so restarts flush the original first-arrival rows instead of re-emitting the board; chunked flush (≤ 500 per RPC call) instead of evicting the oldest
- [x] `services/hardware/heartbeat.ts`: resume task no longer `requiresNetwork` (always re-arms the interval); tick captures `currentSessionStart` locally; `sendGoingOffline` guarded
- [x] tests: `__tests__/kdsDeviceTruth.test.ts` (source, persistence, chunking), `__tests__/supabaseTokenCache.test.ts` (deadline, proactive refresh, fallback)

Blast radius: `useSupabaseClient` + `useRealtimeChannel` are shared by POS, KDS, kiosk and the
on-device CFD (all station types). Behavior change for all of them: token mint can no longer hang
a request longer than 10 s; the socket gets a fresh token ~35 s before expiry; channels keep
retrying instead of going permanently dark. KDS-only: polling cadence and arrival tagging.

## How to test

- Unit: `npx jest __tests__/kdsDeviceTruth.test.ts __tests__/supabaseTokenCache.test.ts __tests__/badWifiWave2.test.ts`
- Types/lint: `npx tsc --noEmit`, `npm run lint`
- Repro A (token expiry): KDS idle 3 / 12 / 35 min, then `send_order_to_kitchen_v1` from staging SQL → card ≤ 5 s. Verify `SELECT * FROM v_kds_realtime_lag WHERE order_id = …` shows `kds_realtime_lag_seconds` ≤ 5 and `first_source = 'broadcast'`.
- Repro B (Wi-Fi off 5 min): send while offline, restore → card ≤ 30 s (`first_source` = `reconnect` or `poll`).
- Repro B2 (socket death, NetInfo stays online): block only `*.supabase.co:443` for 5 min → card ≤ 30 s after unblock (30 s poll).
- Repro C (screen off 10 min): items appear on wake via `resume`; `v_kds_realtime_lag.arrived_rows` stays 1 across a remount (persisted seen-sets).

## Review (2026-09-26)

Verified:
- `npx tsc --noEmit`: 0 errors project-wide.
- Jest: `__tests__/supabaseTokenCache.test.ts` (6), `__tests__/kdsDeviceTruth.test.ts` (13), `__tests__/kdsOrderScopedRefresh.test.ts` (9, three assertions updated for the new `scheduleRefetch` source argument), `__tests__/badWifiWave2.test.ts`, `__tests__/kdsRoutingTraceability.test.ts` all green. Full suite: 2652 pass; the one remaining failure (`syncOrderFromDatabaseDiscountMetadata`) is a source-pattern test on `stores/useOrderStore.ts`, which carries another session's uncommitted edits and was not touched here.
- ESLint on touched files: 0 errors (pre-existing warnings only, plus `import/first` in the two tests for the standard `jest.mock`-before-import pattern).
- Staging (`dfwqakoyittmrwbqvxgw`): migration applied; `kds_device_events.source` exists, both RPCs redefined, `v_kds_realtime_lag` selectable.

Not yet verified (needs a tablet / the owner):
- Repro A/B/B2/C on a staging-configured KDS tablet (plans in the investigation report).
- Prod forensic SQL P0–P8 (prod is blocked for agents) — decides whether the 9/20 Kitchen cluster was a remount re-emission, a paused device, or the Clerk/TCP wedge.
- Prod migration apply (owner does prod manually).

Residual risk / follow-ups:
- Clerk's own fetch still has no timeout; only our wait on it is bounded. A JWT template with a longer lifetime, or an abort-signal timeout on Clerk hosts, would remove the remaining blind window while a mint is wedged past token expiry.
- Clerk 7-day maximum session lifetime signs an unattended KDS out to the login screen (dashboard setting; see the Clerk session-logout note).
- `database.types.ts` was not regenerated (the new column is written through jsonb; no client type depends on it).
