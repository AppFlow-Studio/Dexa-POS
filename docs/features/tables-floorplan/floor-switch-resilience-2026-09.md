# Floor-switch resilience (2026-09)

Switching floor plans took about 20 seconds at Charcoal Gardenia during lunch on 2026-09-25.
This document owns the fix. The incident analysis and the full plan, including Wave 2 (the
bootstrap storm that slowed the database), are in the approved plan; this file tracks what is
built, how it was checked, and what is still open.

## What happened

The database was slow for every location for about 90 minutes (one merchant's 17 stations kept
re-running a heavy menu bootstrap that was timing out). Charcoal's own floor was not busy.

The floor switch made it visible. On a plan that was not in the in-memory cache, the switch
cleared the tables, showed a skeleton, and waited for three table reads in sequence plus a
sections read, with no timeout. At 4 to 15 seconds per read that is the reported 20 seconds.

## What changed (Wave 1, PR-A)

| Before | After |
| --- | --- |
| Cache miss: tables cleared, skeleton until the reads return | Tables paint from the plan's geometry, which is already in the store and on disk, with the sessions the session store holds |
| Reconcile: 3 sequential reads plus sections, per plan | One location-wide `get_floor_snapshot_v1`; it fills every plan's cache and the session store |
| No timeout on floor reads | 20 s deadline on every floor read, which does not report into connection quality |
| A failed status refresh started a full load | A timed-out refresh starts nothing; last known good stays |
| Status refreshes stacked up under a slow database | One in flight, at most one queued |
| Boot's orphan sweep read the cache, so an unread plan lost its sessions | The sweep reads the plans' geometry |

### Checklist

- [x] PR-A.1 Paint-first `setActiveFloorPlan`, returning how the paint was made
- [x] PR-A.1 Boot and Sync All wait for the reconcile; the other callers only need the paint
- [x] PR-A.1 `_stripOrphanedSessions` sources table ids from `floorPlans[].objects`
- [x] PR-A.2 `loadFloorPlanStatus` reads the snapshot RPC; per-plan reads remain as the fallback
- [x] PR-A.2 `quality: false` option on `withDeadline` / `runWithDeadline`
- [x] PR-A.2 `check_device_session_status` moved to the non-reporting option
- [x] PR-A.2 One session shape for every source; merged groups sorted, self included
- [x] PR-A.2 `createFloorPlan` / `deleteFloorPlan` reload through `loadFloorPlans`
- [x] PR-A.2 Floor service reads accept an abort signal
- [x] PR-A.3 `refreshTableSessions`: in-flight dedupe, deadline, no cascade on a timeout
- [x] PR-A.4 `floor.switch_wait_ms`, `floor.read_deadline`; `pos.floor_switch` carries `path`
- [x] PR-A.5 `offlineSyncInit` reads `locationId` (it read a field the store never had)
- [ ] Device acceptance on the emulator against staging (see "How to test")
- [ ] PR-B hygiene (memoized `partialize`, slow-mode reconcile interval): not in this pass

### Decisions made while building

- **An object the server did not report on keeps its live session.** Status covers active tables
  and booths; geometry covers every object. Only reported tables are passed to the session
  store's clearing sweep. On staging every active session sits on a table or booth (77 of 77),
  so this is a guard, not a behaviour change.
- **"No session" is `undefined` everywhere.** The legacy read returned `null`, the status refresh
  `null`, the bridge `undefined`. A free table would otherwise get a new object every time the
  source of the read changed.
- **Per-plan prefetch is off wherever the snapshot RPC answers.** One reconcile already fills
  every plan. Prefetch added four reads per plan and was the first thing to fail on a slow
  database. It resumes by itself in an environment without the RPC.
- **The geometry token is sent only when every stored plan has its `objects`.** Otherwise
  "unchanged" would leave nothing to build tables from.
- **Sync All forces a reconcile** even when the cache is fresh enough that a switch would skip it.
- **Section changes are compared by value.** The old check compared ids only, so a section
  reassigned to another server did not repaint.

## Evidence

**Staging RPC, as the emulator's own user (2026-09-26).** `get_floor_snapshot_v1` for location
`8835e749…`: 4 plans with 178, 21, 44 and 2 objects, the same counts the device's per-plan reads
logged at boot. Status covers 177, 11, 44 and 1 tables and 77 sessions. With a matching token the
geometry is omitted.

| Call | Payload |
| --- | --- |
| No token | 178,056 B |
| Matching token | 57,444 B |

**Store logic against those rows.** The real store and the real service were run against rows
captured from that response, with only the transport faked. Nine checks, all passing:

1. Boot: one `get_floor_snapshot_v1` (`p_floor_plan_id` null, token sent), no table reads, both
   plans cached, the session store holds the sessions of the plan that is not on screen.
2. Session shape: no `minutes_seated`, no undefined-valued keys, `current_course: 0` kept, the
   merged pair lists both tables, sorted, on both tables.
3. An unchanged floor keeps the `tables` array and every table's identity although
   `minutes_seated` moved.
4. Cold cache and a database that never answers: tables, sessions and `isLoading: false` are in
   the store synchronously; the switch resolves `cacheMiss/geometryPaint`.
5. A read past its deadline: previous `tables` identity kept, `error` set,
   `connectionQuality.reportTimeout` not called, no retry, no table reads.
6. A plan switch while a reconcile is in flight shares that read.
7. Boot's orphan sweep with an empty cache keeps the other plan's sessions and removes a real orphan.
8. Status refresh: three overlapping calls make two reads; a timed-out refresh starts no other read.
9. Without the RPC: one probe, then the per-plan reads; no probe the second time.

The harness was temporary and is not in the repository (new Jest suites only on request).

**Safety net.** `npx tsc --noEmit`: 0 errors. Lint on the changed files: same warnings as before.
Jest: 2,683 of 2,684 pass; `syncOrderFromDatabaseDiscountMetadata` fails on `staging` too.

**Not yet verified: the flow on the device.** The emulator stops at the staff PIN screen and no
test PIN is documented, so the checks below are open.

## How to test (emulator against staging)

1. Cold start, then switch to a plan other than the default: tables and their sessions paint at
   once, no skeleton.
2. Dev Flags → force slow mode, then switch plans: instant paint; the log shows one
   `get_floor_snapshot_v1` per reconcile.
3. Airplane mode, then switch: the plan paints from geometry, no spinner.
4. Seat a table on station A, switch plans on station B: the session appears after one broadcast.
5. Restart the app with tables seated on a plan other than the default: they are still seated
   after boot.
6. Telemetry export: `floor.switch_wait_ms` under 100 ms; `pos.floor_switch` carries `path`.
7. Staging `edge_logs` for the test station: `/rest/v1/floor_plan_objects`,
   `/table_session_tables` and `/table_sessions` drop to about zero.

## Monitoring (Wave 3.2)

Logs Explorer query that flags a login re-running the bootstrap. A healthy merchant calls it once
or twice a day.

```sql
select
  toStartOfHour(timestamp)                              as hour,
  log_attributes['request.sb.auth_user']                as auth_user,
  count()                                               as calls,
  countIf(toInt32OrZero(log_attributes['response.status_code']) >= 500) as calls_5xx,
  round(countIf(toInt32OrZero(log_attributes['response.status_code']) >= 500) / count(), 2) as ratio_5xx,
  round(quantile(0.95)(toFloat64OrZero(log_attributes['response.origin_time']))) as p95_origin_ms
from logs
where source = 'edge_logs'
  and log_attributes['request.path'] like '/rest/v1/rpc/get_pos_bootstrap_v%'
group by hour, auth_user
having calls > 10 or ratio_5xx > 0.2
order by hour desc, calls desc
```

Run against production for 2026-09-25 it returns one login only, in every hour from 16:00 to
22:00 UTC:

| Hour (UTC) | Calls | 5xx | p95 origin |
| --- | --- | --- | --- |
| 16:00 | 33 | 0 | 969 ms |
| 17:00 | 132 | 42 | 20,282 ms |
| 18:00 | 110 | 56 | 40,595 ms |
| 19:00 | 47 | 0 | 1,240 ms |
| 20:00 | 18 | 0 | 887 ms |
| 21:00 | 102 | 0 | 1,052 ms |
| 22:00 | 16 | 0 | 1,532 ms |

The 16:00 row is the point: the alert would have fired about 100 minutes before the database
tipped over at 17:40. The query still has to be saved in the dashboard and wired to an alert;
that cannot be done from the repository.

## Wave 2B — the client stops amplifying a slow database

Built. None of it depends on a server change.

- [x] `lib/network/bootstrapRetryPolicy.ts`: classification by code, then the retry rule
- [x] `usePosSync`: a station with a menu on screen retries at most once and never on a statement
      timeout; an empty menu grid keeps its 4 retries; delays are jittered
- [x] A statement timeout (57014) is reported to connection quality and, once per five minutes,
      to Sentry (`event: pos_bootstrap_timeout`)
- [x] "Menu on screen" reads the menu store as well as the query cache, so a station that booted
      from its offline snapshot is not treated as a first load
- [x] `useMenuVersionWatch`: refetch spread over 0 to 90 s, held while the station is in slow mode,
      and the seen version only advances when the refetch worked
- [x] `PosSyncProvider` recovery loop: every 3 to 5 minutes when a menu is on screen or the
      station is slow; 10/20/40/60 s only for an empty grid on a working connection
- [x] Settings → "Check for menu changes" compares like with like
- [ ] Device acceptance: force slow mode, edit a menu item on the website, the station logs
      `deferring` and makes no bootstrap call until slow mode clears
- [ ] Calling the cached RPC: waits for the decision in Wave 2A

What the numbers say, for the incident's shape (17 stations with a menu, the bootstrap timing out):

| | Before | After |
| --- | --- | --- |
| Attempts per station per menu edit | 5 | 1 |
| Attempts per edit, 17 stations | 85 | 17 |
| Spread of those attempts | the same second | 0 to 90 s |

Facts checked while building:

- The failed bootstrap calls in the incident were HTTP 500, all 98 of them, not 504. The policy
  classifies by Postgres code first, so the status does not matter.
- The statement timeout is 8 s on production and 15 s on staging.
- The probe token and the envelope `version` are different strings. Staging:
  `…390337-362-7cefc89f…` against `…390337-362-channels-v3-station-scopes-7cefc89f…`. The manual
  check compared the v1 token to the envelope version, so it could never report "up to date".

Conflict to expect: `origin/category-schedueling` (menu scheduling, not merged) edits
`usePosSync.ts`, `useMenuVersionWatch.ts` and `PosSyncProvider.tsx` too.

## Wave 2A — the server cache: NOT applied, needs a decision

The plan's migration must not be applied as written.

- It creates `get_pos_bootstrap_v3(uuid, boolean)`. That name is taken, on staging **and on
  production**, by the menu scheduling feature: `get_pos_bootstrap_v3(uuid)`,
  `get_pos_menu_version_v3(uuid)` and `get_pos_schedule_map_v1(uuid)`, from
  `20260924120000_pos_schedules_v3.sql`.
- Its overload guard drops every `get_pos_bootstrap_v3` whose arguments are not `uuid, boolean`.
  It would have deleted the scheduling RPC.
- Its authorization gate was written for a call that builds the payload. On a cache hit nothing
  else would re-check the caller, so the gate has to fail closed by itself.

Nothing was applied to staging or production.

### Proposal

`proposals/pos_bootstrap_snapshot_cache.proposal.sql`, with its rollback beside it. Same design
as the plan (one build per catalog version, try-lock, previous body served while a build runs),
with three changes:

1. Its own name: `get_pos_bootstrap_cached_v1(p_location_id, p_envelope, p_force)`.
2. It serves the envelope generation the caller asks for, `'v2'` or `'v3'`, each keyed by the probe
   that generation polls. A client given the other generation's `version` would refetch forever.
3. The authorization gate fails closed by itself.

Proven on staging inside one transaction that was rolled back (2026-09-26, location `8835e749…`,
as the emulator's user). Afterwards the table and both functions were confirmed absent.

| Check | Result |
| --- | --- |
| Direct `get_pos_bootstrap_v2`, what stations call today | 184 ms |
| Cached, first call | 152 ms, `hit: false` |
| Cached, second call | 4.1 ms, `hit: true` |
| Payload against the direct call, volatile keys removed | identical |
| `version` against the direct call | identical |
| After a menu item edit | miss, then hit |
| `p_force` | miss |
| A baked-in timed snooze has expired | miss |
| `'v3'` envelope | 193 ms cold, 5 ms warm, `version` is the v3 token, menus carry `schedules` |
| Unknown envelope | rejected, 22023 |
| Another merchant's user, row already cached | denied, 42501 |
| `anon` | denied, 42501 |
| `authenticated` reads the table directly | denied, 42501 |
| Stored payload | 65 KB per envelope (lz4) |
| `get_pos_bootstrap_v3(uuid)` after the run | still there |

Not proven: two callers at once (the try-lock, the stale body, the 2 s wait). One transaction
cannot contend with itself; it needs two sessions.

Decisions needed before it can be applied: the name, whether to serve both envelope generations
from one function, and who moves the file into the website repository (with a timestamp after
the latest one there).

## Known windows, unchanged by this work

- A caller that awaits `loadFloorPlanStatus()` without `force` can share a read that started
  before its own write. Transfers already pass `force`.
- In slow mode `loadFloorPlanStatusIfStale` returns early, so heartbeat reconciles are suspended
  and the per-broadcast status refresh is the only one. Floor reads can no longer cause slow mode.
- `cleaning` sessions are excluded by `get_location_table_status_v2` and included by the snapshot.

## Rollback

- `setDeadlineWrapEnabled(false)` removes the deadlines.
- Without `get_floor_snapshot_v1` the client uses the per-plan reads by itself.
