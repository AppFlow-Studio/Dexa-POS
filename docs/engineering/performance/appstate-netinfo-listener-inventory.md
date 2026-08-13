# AppState / NetInfo Listener Inventory

Deliverable for acceptance criterion 1 of the lifecycle-coordinator ticket.
**No behavior change** — this document only. Runs before AUD-4 establishes runtime
ownership; feeds the staged-priority coordinator design.

Snapshot taken on `jaffal-jul-fixsprint`. Line numbers drift — re-verify before
deleting any listener.

---

## 1. Summary

| | Count |
|---|---|
| Distinct `AppState.addEventListener` call sites | 19 |
| Live AppState listeners on a **POS** station at steady state | ~20 |
| Distinct `NetInfo.addEventListener` call sites | 5 |
| Live NetInfo listeners on a POS station | ~7 |
| `NetInfo.fetch()` one-shot call sites | 8 |
| Independent polling timers touching network state | 4 |

The count exceeds the call-site count because `useRealtimeChannel` is instantiated
**3×** on a POS station (floor ×2, orders ×1) and each instance registers its own
AppState *and* NetInfo listener.

---

## 2. AppState listeners

Ordered by what they do on `active`. "Network on resume" = issues a request on the
foreground path, i.e. competes with the first tap.

### 2a. Fire network work on resume

| # | Site | Work on `active` | Gated? |
|---|---|---|---|
| 1 | [ClerkSessionKeeper.tsx:66](../../../components/auth/ClerkSessionKeeper.tsx#L66) | `getToken({ skipCache: true })` — full refresh-token exchange | Online-only ([:41](../../../components/auth/ClerkSessionKeeper.tsx#L41)). **No staleness gate** — fires on every resume |
| 2 | [useRealtimechannel.ts:366](../../../hooks/realtime/useRealtimechannel.ts#L366) **×3** | If channel dead: full re-subscribe after 1000ms. If SUBSCRIBED: `realtime.setAuth()` | Per-channel state only |
| 3 | [offlineSyncService.ts:676](../../../services/offlineSyncService.ts#L676) | `NetInfo.fetch()` → `handleNetworkChange` → may drain the offline queue | `connectionQuality.reset()` gated on `appForegroundResetMs` |
| 4 | [heartbeat.ts:177](../../../services/hardware/heartbeat.ts#L177) → [:118](../../../services/hardware/heartbeat.ts#L118) | Immediate `sendHeartbeat()` (Supabase write) + restart 60s interval | Only that interval was paused |
| 5 | [terminalHealthCheck.ts:370](../../../services/hardware/terminalHealthCheck.ts#L370) → [:317](../../../services/hardware/terminalHealthCheck.ts#L317) | Immediate `performHealthCheck()` (terminal TCP/HTTP probe) + restart interval | Only that interval was paused |
| 6 | [starPrinterHealthCheck.ts:534](../../../services/hardware/starPrinterHealthCheck.ts#L534) → [:495](../../../services/hardware/starPrinterHealthCheck.ts#L495) | Immediate `performHealthCheckRound()` — probes **every** known printer + restart interval | Only that interval was paused |
| 7 | [useOrderReconcile.ts:86](../../../hooks/useOrderReconcile.ts#L86) | `fire('foreground')` → debounced order reconcile | Internal debounce |
| 8 | [useSessionKickListener.ts:344](../../../hooks/useSessionKickListener.ts#L344) → [:335](../../../hooks/useSessionKickListener.ts#L335) | `validateSession()` after 500ms | 5-min staleness gate ✅ |
| 9 | [useBusinessDayRollover.ts:73](../../../hooks/pos/useBusinessDayRollover.ts#L73) | `checkRollover()` → `refreshPreviousOrders({force:true})` **only if the business day changed** | Day-boundary gate ✅ — but the overnight-resume QA case is exactly when it fires |
| 10 | [PosSyncProvider.tsx:807](../../../contexts/PosSyncProvider.tsx#L807) | Five separate items, see below | Mixed |

**PosSyncProvider is itself a mini-coordinator** and the closest existing thing to
the target design ([:713-787](../../../contexts/PosSyncProvider.tsx#L713-L787)):

- `refreshSelectedStore` — 5-min staleness gate ✅
- `refreshEmployeesIfStale` — 5-min staleness gate ✅
- `loadFloorPlanStatusIfStale` — internal staleness gate ✅
- Active-orders `invalidateQueries` — 2-min staleness gate ✅
- **Castles `service.resume()` + connection pre-warm — ungated**, on the resume path

### 2b. Fire local/JS work on resume (no network, still main-thread)

| # | Site | Work on `active` |
|---|---|---|
| 11 | [app/_layout.tsx:879](../../../app/_layout.tsx#L879) | `startDraftCleanup()` — **synchronously runs `cleanupAbandonedDrafts()` + `clearInactiveOrders()` over the whole order store** ([useOrderStore.ts:12809-12811](../../../stores/useOrderStore.ts#L12809-L12811)), plus `PrinterService.startProcessing()` + `startSessionPrune()` |
| 12 | [StarPrinterDiscoveryService.ts:147](../../../services/printing/discovery/StarPrinterDiscoveryService.ts#L147) | Restarts the 5-min interval only — does **not** scan immediately ✅ (already background-shaped) |
| 13 | [useTableTimerTick.ts:78](../../../hooks/useTableTimerTick.ts#L78) | Clears a `backgrounded` flag, resumes tick fan-out |
| 14 | [useLiveClock.ts:44](../../../hooks/useLiveClock.ts#L44) | Restarts clock interval |
| 15 | [useKDSTimer.ts:42](../../../hooks/useKDSTimer.ts#L42) | Restarts KDS tick interval (KDS only) |
| 16 | [SkiaTableLayer.tsx:100](../../../components/tables/skia/SkiaTableLayer.tsx#L100) | Updates `appStateRef` to gate the redraw interval |
| 17 | [telemetry/init.ts:96](../../../lib/telemetry/init.ts#L96) | Long-task watcher + flush lifecycle |

Item 11 is worth calling out: it is the only resume-path item that does unbounded
**synchronous** work over the order store before yielding. On a station carrying a
shift's worth of orders that lands directly on the first-tap path.

### 2c. Background-only listeners (not on the resume path)

| # | Site | Work |
|---|---|---|
| 18 | [app/_layout.tsx:853](../../../app/_layout.tsx#L853) | `flushAllPendingWrites()` on background/inactive |
| 19 | [useCFDWSClient.ts:294](../../../hooks/useCFDWSClient.ts#L294) | CFD socket lifecycle — CFD route only, never on a POS station |

`PosSyncProvider`'s `background` branch also runs `clearInactiveOrders()` and a
graceful Castles `suspend()` ([:786-800](../../../contexts/PosSyncProvider.tsx#L786-L800)).

### 2d. Leak note

[telemetry/init.ts:96](../../../lib/telemetry/init.ts#L96) registers its listener with **no
stored subscription and no removal path** — every `initTelemetry()` call adds
another. It is idempotent-guarded upstream, so today it's one listener, but it is
the one site with no teardown.

---

## 3. NetInfo subscribers

| # | Site | Reacts to | Work |
|---|---|---|---|
| 1 | [offlineSyncService.ts:657](../../../services/offlineSyncService.ts#L657) | all changes | Canonical handler — owns `NetInfo.configure()` ([:463](../../../services/offlineSyncService.ts#L463)), drives `getRawIsOnline()`, queue replay |
| 2 | [useRealtimechannel.ts:312](../../../hooks/realtime/useRealtimechannel.ts#L312) **×3** | `isConnected && !SUBSCRIBED` | Immediate re-subscribe, resets reconnect budget |
| 3 | [terminalHealthCheck.ts:376](../../../services/hardware/terminalHealthCheck.ts#L376) | false→true edge | Immediate `performHealthCheck()` |
| 4 | [starPrinterHealthCheck.ts:539](../../../services/hardware/starPrinterHealthCheck.ts#L539) | false→true edge | Immediate `performHealthCheckRound()` |
| 5 | [useCFDWSClient.ts:317](../../../hooks/useCFDWSClient.ts#L317) | all, skips initial emission | CFD reconnect (CFD only) |

`NetInfo.fetch()` one-shots: [offlineSyncService.ts:485](../../../services/offlineSyncService.ts#L485),
[:666](../../../services/offlineSyncService.ts#L666), [:691](../../../services/offlineSyncService.ts#L691),
[useStationLoginSync.ts:28](../../../hooks/useStationLoginSync.ts#L28),
[useTimeclock.ts:73](../../../hooks/useTimeclock.ts#L73) & [:329](../../../hooks/useTimeclock.ts#L329),
[useTerminalStatus.ts:375](../../../hooks/useTerminalStatus.ts#L375),
[speedTest.ts:61](../../../lib/speedTest.ts#L61).

### Polling timers touching network state

| Interval | Site |
|---|---|
| 10s | `NetInfo.fetch()` poll — [offlineSyncService.ts:664](../../../services/offlineSyncService.ts#L664) |
| 60s | Periodic sync fallback — [offlineSyncService.ts:559](../../../services/offlineSyncService.ts#L559) |
| 5s | Floor realtime fallback poll — [useFloorRealtime.ts:62](../../../hooks/realtime/useFloorRealtime.ts#L62) |
| 10min | Realtime auth refresh ×3 — [useRealtimechannel.ts:296](../../../hooks/realtime/useRealtimechannel.ts#L296) |

The 10s `NetInfo.fetch()` poll runs unconditionally — it does not check whether
connectivity is uncertain or whether queued work exists. That is the specific
target of the ticket's "poll only when connectivity is uncertain or queued work
exists" clause.

---

## 4. What a cold resume actually costs today

Worst case, a POS station resuming after screen-off with no staleness gates
satisfied, all firing without coordination:

1. Clerk refresh-token exchange (ungated)
2. `realtime.setAuth()` ×3, or 3 full channel re-subscribes
3. `NetInfo.fetch()` + possible offline-queue drain
4. Heartbeat write
5. Payment-terminal health probe
6. Star printer health round — one probe per known printer
7. Order reconcile
8. Session validate (if >5min)
9. Store settings + employees + floor status + active-orders invalidate (if stale)
10. Castles resume + TCP pre-warm (ungated)
11. Synchronous draft cleanup + inactive-order prune over the whole order store

Every one is on the same tick, and every network item independently calls
`getCachedAccessToken()` — which, after idle, is past `cachedTokenExpMs`
([useSupabaseClient.ts:56](../../../hooks/useSupabaseClient.ts#L56)). The in-flight
coalescing at [:59](../../../hooks/useSupabaseClient.ts#L59) means they collapse to one
Clerk call rather than N, but **all of them block behind it**, and the
ClerkSessionKeeper refresh at item 1 is a *separate* exchange that does not
populate that cache.

---

## 5. Notes for the coordinator design

- **The shared network source already exists.** `offlineSyncService` owns
  `NetInfo.configure()` and exposes `getRawIsOnline()`; `useNetworkStatus` and
  `setupTanstackOnlineManager` already consume it. Subscribers 2–5 in §3 should
  move to it rather than a new abstraction being introduced.
- **Bucket-mapping is already implied by the existing gates.** Sites with
  staleness gates (§2a #8, #9, and 4 of PosSyncProvider's 5 items) are already
  "after interactions" shaped. The ungated ones — Clerk refresh, Castles
  pre-warm, heartbeat, both health checks — are what need explicit bucketing.
- **Immediate-bucket candidates** per the ticket: Clerk validity, realtime state,
  active-payment recovery. Note that Castles resume/pre-warm is *not* the same as
  active-payment recovery; conflating them would put a TCP connect in the
  immediate bucket for a station with no payment in flight.
- **Ordering hazard for QA.** The ticket requires offline-queue replay must not
  preempt the Immediate bucket. Today replay is triggered from inside the
  NetInfo handler (§3 #1), which fires from the resume handler (§2a #3) — so
  replay currently *can* land ahead of auth validity.
- **`useRealtimeChannel`'s ×3 multiplier** means per-instance listeners cost 3×
  whatever the per-call-site reading suggests. Worth collapsing to one
  subscription with a registry.

---

## 6. Post-migration state

The coordinator (`lib/lifecycle/appLifecycleCoordinator.ts`) has since landed
and the census above is the **pre**-migration baseline. Current counts:

| | Before | After |
|---|---|---|
| AppState listeners | 19 sites | **7** |
| Raw NetInfo subscribers | 5 sites (~7 live) | **2** |

Remaining AppState listeners, all deliberate:

| Site | Why it stays |
|---|---|
| `appLifecycleCoordinator.ts` | The single owner |
| `lib/telemetry/init.ts` | Measuring instrument — must stay independent of the thing it measures, or a coordinator bug would silently disable resume telemetry |
| `useLiveClock`, `useKDSTimer`, `useTableTimerTick`, `SkiaTableLayer` | Pure local timer gating, no network, not on the storm path. `__tests__/idleTimerAppState.test.ts` asserts their AppState wiring directly |
| `useCFDWSClient` | CFD route only, never live on a POS station |

Remaining NetInfo subscribers: `offlineSyncService` (the owner, holds
`NetInfo.configure`) and `useCFDWSClient`. Everything else now goes through
`subscribeOnlineStatus`.

**Bucket assignment as shipped:**

| Bucket | Tasks |
|---|---|
| `immediate` | `auth.clerk-token`, `realtime.reconnect:<topic>` (×3), `hardware.heartbeat-cancel-offline-timer` |
| `frame` | `pos.floor-status-converge`, `pos.active-orders-invalidate`, `orders.reconcile-on-resume`, `orders.business-day-rollover` |
| `interactions` | `pos.store-settings-refresh`, `pos.employees-refresh`, `pos.castles-resume`, `pos.maintenance-timers-resume`, `auth.session-kick-validate`, `hardware.heartbeat-resume`, `hardware.terminal-health-resume`, `sync.foreground-network-recheck` |
| `background` | `hardware.star-health-resume`, `printing.star-discovery-resume` |

Two ordering decisions worth preserving:

- **`sync.foreground-network-recheck` is `interactions`, not `immediate`.** This
  is the fix for the §5 hazard — queue replay can no longer land ahead of auth
  validity. `__tests__/appLifecycleCoordinator.test.ts` pins it.
- **`pos.castles-resume` is `interactions`, not `immediate`.** It's a terminal
  pre-warm, not active-payment recovery; a station with nothing in flight must
  not put a TCP connect ahead of the first tap.

**Resume semantics changed** in one user-visible way: the coordinator drains
only after a genuine `background`, not after an `inactive` flicker. Suspend
tasks still fire on the first leave-foreground edge including `inactive`
(flushing early is the safe direction). Pre-migration, several sites treated
`inactive` as a full background and re-ran their whole recovery pass on iOS
transient interruptions.

## 7. Not covered by this inventory

- No before/after request counts (criterion 3) — needs the telemetry span, which
  is a behavior change and belongs in the next PR.
- Castles-internal timers ([castles-service.ts:1609](../../../services/terminals/castles-service.ts#L1609)
  watchdog, [castlesConnectionSupervisor.ts:127](../../../services/terminals/castlesConnectionSupervisor.ts#L127)
  probe) are not AppState/NetInfo subscribers and are excluded, but they do
  contend for the same resume window.
- Component-level `setInterval` sites (~70 across the app) are out of scope
  except where they touch network state.
