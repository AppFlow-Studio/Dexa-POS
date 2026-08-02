# Handoff — Perf + Memory + Bad-WiFi session (branch `feat/perf-and-bug`)

Self-contained recap of this session's work. Everything below is **committed** on `feat/perf-and-bug` (commits `b7c0c56b` "perf floor plans + KDS + orders", `1db238ca` "memory and floor plan updates", `8f0bad58` "small bad wifi optimization"). A few intermixed commits are NOT from this work (`71342e56`/`bf356266` modifier-setting fixes touching `useModifierSidebarStore`/`useSettingsStore`/`ModifierScreen`; `638ed0c6` cfd-web bundle).

**Verification baseline (applies to every stream):** project has **9 pre-existing failing jest suites / 23 failing tests** and ~305 pre-existing `tsc` errors (incl. 2 in `useKDSStore.ts`, 1 `seatGuests` stub in `useFloorPlanStore.ts`). Every change below was checked **stash-baseline**: tsc/lint/full-suite identical to baseline → **zero regressions**. New tests added this session all pass.

---

## 1. Floor-plan navigation — table/order status no longer lost (correctness)

**Bug:** switching floor plans (or away-and-back) wiped a table's live **local-only status** (`seating`/`ordering`/`paying`/`closing`) back to the backend value. Root cause: bulk-`SYNC`-from-snapshot overwrites live local-only sessions (`_applyAction` SYNC deliberately doesn't preserve them).

- **`stores/useTableSessionStore.ts`** — SINK guard: `_patchSessionsFromTables` **and** `hydrateFromBackend` skip the `SYNC` when the live store session is local-only and the **same** session id (different id still replaces → turnover preserved).
- **`stores/useFloorPlanStore.ts`** — SOURCE fix: `fetchFloorPlanSnapshot` reads `useTableSessionStore.getState().sessions` (all plans) to preserve local-only even when `currentTablesById` is empty (prefetch + cache-miss paths). `fetchFloorPlanSnapshot` is now `export`ed for testing. Stale "SYNC respects local-only" comment fixed.
- **Tests:** `patchSessionsLocalOnlyPreserve.test.ts`, `fetchSnapshotLocalOnlyFromSessionStore.test.ts` (red-first → green).
- **⚠️ Owed:** manual emulator check — seat→`ordering`/`paying` on Plan A → switch to B → back to A → status persists (cold >30s cache **and** warm prefetch); + a realtime reconcile on a *different* table must not flash the local-only table.

## 2. Floor-plan switch SPEED (`stores/useFloorPlanStore.ts` `setActiveFloorPlan`)

A cache-hit-**fresh** (<30s) switch was still firing a redundant background `loadFloorPlanStatus()` every switch — re-fetching identical data + **re-writing the persisted `floorPlanCache`** (full MMKV serialize) each time. Now skipped when fresh (realtime + the next stale/>30s switch still reconcile; `prefetchFloorPlans` still re-warms). **~25-60ms/switch + 5-10× fewer MMKV writes/RPCs per shift.** (Deliberately did NOT drop `floorPlanCache` from `partialize` — it hurts offline multi-plan viewing.)

## 3. Navigation deferral / instant transitions (I4 + CFD)

- **`services/tableOrderPrefetch.ts`** — the speculative prefetch subscriber moved `queueMicrotask` → `InteractionManager.runAfterInteractions` (both broadcast callback + initial run), so a broadcast during a mount/floor-switch no longer runs its sync prelude in the same frame. On-demand prefetch on tap + single-flight hydration preserve usability. Also: `teardownTableOrderPrefetch` now clears `_inFlightOrderIds`/`_inFlightPrefetches`/`_recentlyHydrated` (leak + stale-order fix — memory Group A).
- **`app/(main)/order-processing.tsx`** — the eager `ensureActiveOrderCreated` RPC wrapped in `runAfterInteractions` (with `task.cancel()` cleanup) so it doesn't fire mid-first-interaction.
- **`contexts/CFDProvider.tsx`** — `cfdItems` idle gate: `if (!isConnected && !getCachedCapabilities()?.hasBuiltinCfd) return []` (TDZ-safe cached read, *not* the `hasBuiltinCfd` state var) — skips the O(n) dual-pricing transform app-wide when no CFD surface exists.
- **Verified-only (no change):** `enableFreeze(true)` + AppState MMKV flush are already wired.

## 4. KDS performance (`app/(main)/kds.tsx`, `lib/kdsAutomation.ts`)

- **D5 (shipped):** auto-fire/auto-bump intervals now read `useKDSStore.getState().ticketsByStatus.*` inside the interval body; the churning ticket arrays were removed from deps. Fixes a real **starvation** bug (a sub-30s bucket change re-armed/reset the 30s timer, so automation could never fire on a busy board). Decision logic extracted to `lib/kdsAutomation.ts` (`shouldAutoFire`/`shouldAutoBump`), recall-skip unit-tested (`kdsAutomation.test.ts`).
- **D6 (PROFILE-GATED — needs a decision):** `KDSTicketCard` takes a bucketed `urgencyLevel` prop instead of raw per-second `nowEpochMs`; comparator keys on it; dead `timeElapsed`/local `urgencyLevel` memos removed. Behavior-preserving + render-reducing. **⚠️ A temporary `if (__DEV__) console.count("KDSTicketCard.render")` is still in the card body — profile a 50-card board, screenshot-diff the 5/10/15-min threshold colors, then REMOVE the counter; revert D6 if the body render is already cheap.**
- **Verified no-fix:** D1 (timer isolation already correct), D2 (distinct memos). **Deferred/gated:** D3 (aggregation micro-opt), D4 (virtualization — per-column lists, NOT `numColumns`; needs dev-client rebuild).

## 5. Memory / state leak fixes (shift-long stability)

Audit in `docs/engineering/performance/memory-state-audit.md`. The codebase was largely mature; the real leaks were per-order/item module state never released on order removal.

- **`stores/useOrderStore.ts` — Group A:** new `releaseOrderState(order, storeKey?)` fan-out wired into `removeOrder` / `clearInactiveOrders` / `cleanupAbandonedDrafts`. Extends `_cleanupOrderModuleState` (now clears `orderRefreshTimeouts`+clearTimeout / `pendingItemsBlockStart` / `lastLocalMutationAt`), deletes per-item `quantitySyncGenerations`, prunes `pendingBackendUpdates`, and lazily clears `useCoursingStore`/`useSeatingStore`.`clearOrder` + `useSyncStatusStore.clearAllForOrder`.
- **`stores/useKDSStore.ts` — B2:** recalled-ticket Sets (`_recalledTicketIds` + `_recalledCycleTicketIds`) get a 4h TTL via `_recalledTicketAt` + `cullExpiredRecalls` (wired into `overlayPendingActions`), cleared in `_cleanup`, timestamps seeded on rehydrate. Pure `isRecallExpired` in `lib/kdsAutomation.ts`.
- **`lib/network/featureFlags.ts` + `lib/vendorSidebarControl.ts` — C:** `__DEV__` size>25 warn on the listener Sets (defense-in-depth; current call-sites are clean).
- **Tests:** `orderStateRelease.test.ts`, `kdsRecalledTtl.test.ts`, `longSessionSoak.test.ts` (500-cycle churn proves the satellite collections stay bounded, not cumulative).
- **NOT done (gated):** `offlineSyncService.autoRetryTimers` leak (B1) — touches the sync queue → needs the bad-WiFi cross-check + persona review. `floorPlanCache` persist-trim — bounded already, optional.

## 6. Bad-WiFi "Option-C Wave 2" (deadline coverage)

Cross-checked + senior-persona reviewed (the review **reshaped the plan** — half the original gap list was wrong).

- **`components/menu/ModifierScreen.tsx`** — **deleted** the redundant raw `OrderService.updateOpenItem` call: `updateItemInActiveOrder` already syncs qty+notes (deadline-wrapped + offline-queued) and `setItemSeat` handles seat. The raw call was a keyless **double-sync on good WiFi** + a 30s hang on bad WiFi. (Removed its now-dead imports too.)
- **`stores/useKDSStore.ts`** — wrapped the **live** KDS poll (`get_kds_tickets_v2` in `fetchTickets` + `_backgroundFetchTickets`) in `runWithDeadline('get_kds_tickets', DEADLINES.read, …abortSignal)`. (The dead `OrderService.getKDSTickets` + 5 other dead "reads" were correctly dropped.)
- **`services/floorPlanService.ts`** — wrapped the `seat_guests` legacy PGRST202 fallback in `runWithDeadline` (timeout → existing `seatGuests` queue path; PGRST202 is deterministic, so no loop).
- **Test:** `badWifiWave2.test.ts`.
- **Still open:** `addOrderDiscount` is confirmed **dead code** (drop in a separate cleanup); the connectionQuality `degraded/slow` **UI badge** (deferred UX); a `grep "client.rpc(" without .abortSignal` sweep before declaring bad-WiFi "done"; Category-B server idempotency stays deferred.

---

## Reference docs (this session)
- `docs/engineering/performance/memory-state-audit.md` — full memory/leak audit + what shipped.
- `docs/engineering/performance/perf-nav-kds-results.md` — floor-plan persistence + KDS perf (streams 1, 3, 4).
- `docs/engineering/performance/sustained-perf-and-badwifi.md` — floor-switch speed headroom, long-session soak design, bad-WiFi coverage + Wave 2.

## Top open items for the next session (priority order)
1. **Remove the D6 `console.count` in `app/(main)/kds.tsx`** after a 50-card profile + threshold-color screenshot-diff; keep or revert D6 from the number.
2. **Manual/device verification** owed: floor-plan persistence (§1), bad-WiFi throttled-network test of §6, KDS starvation/recall on a busy board.
3. **Gated follow-ups:** `autoRetryTimers` leak (B1) + bad-WiFi connectionQuality UI badge + the `client.rpc` RAW sweep — all need the bad-WiFi cross-check + senior-persona review.
4. Optional: drop dead `addOrderDiscount`; KDS D3/D4; floor A2 (delta-only `_patchSessionsFromTables`).
