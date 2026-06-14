# Results — Tables/Dine-in/Orders Navigation persistence + KDS perf

Implements `~/.claude/plans/done-handoff-written-dapper-bonbon.md`. All changes client-only (no SQL).

## Stream A — Floor-plan navigation: no more lost local-only status

Root cause (proven by red tests): the `SYNC` branch of `useTableSessionStore._applyAction` deliberately overwrites local-only statuses (`seating`/`ordering`/`paying`/`closing`). Bulk-SYNC-from-snapshot paths fed it backend statuses for live, same-session tables → status flashed back to `seated`/`available` on floor-plan switch.

- **A1 SOURCE** `stores/useFloorPlanStore.ts` `fetchFloorPlanSnapshot`: reads `useTableSessionStore.getState().sessions` (all plans, keyed by tableId) and preserves a same-session local-only status even when `currentTablesById` is empty (prefetch + cache-miss-reset paths). Existing `currentTable` branch kept as fallback. `fetchFloorPlanSnapshot` is now `export`ed for unit testing.
- **A2 SINK** `stores/useTableSessionStore.ts`: `_patchSessionsFromTables` **and** `hydrateFromBackend` skip the `SYNC` when the live store session is local-only and the **same** session id — mirrors the existing CLEAR-branch guard. Different-id sessions still replace (turnover preserved); non-local-only still SYNCs.
- **A3** Fixed the stale comment at `useFloorPlanStore.ts` (cache-hit path) that claimed "SYNC respects local-only statuses" — now accurate.
- **A4** `services/tableOrderPrefetch.ts` `teardownTableOrderPrefetch`: clears `_inFlightOrderIds`/`_inFlightPrefetches`/`_recentlyHydrated` so a stale resolved prefetch can't apply old order data to a reused same-id table. (Generation guard from the draft dropped — it protected the wrong layer.)
- **A5** `contexts/CFDProvider.tsx` `cfdItems`: idle gate `if (!isConnected && !getCachedCapabilities()?.hasBuiltinCfd) return []` (TDZ-safe cached read, not the `hasBuiltinCfd` state var) — skips the O(n) dual-pricing transform app-wide when no CFD surface exists. Added `isConnected` to deps so a mid-order connect repopulates.
- **A6 (verify-only, no code):** `enableFreeze(true)` (`lib/screenConfig.ts:2`) and AppState→`flushAllPendingWrites()` (`app/_layout.tsx:665-672`) are already wired — the handoff's "missing" claims were wrong.

## Stream B — KDS performance

- **B1 (D5, shipped)** `app/(main)/kds.tsx`: auto-fire/auto-bump intervals now read the live `ticketsByStatus` bucket via `useKDSStore.getState()` inside the interval body; the churning ticket arrays were removed from the effect deps. Fixes the real bug — a bucket change faster than the 30 s `KDS_AUTOMATION_CHECK_MS` re-armed (reset) the interval and could **starve** auto-fire/auto-bump entirely on a busy board. Decision logic extracted to pure `lib/kdsAutomation.ts` (`shouldAutoFire`/`shouldAutoBump`) — recall-skip is unit-tested (safety-critical).
- **B2 (D6, implemented — PROFILE GATE PENDING)** `app/(main)/kds.tsx`: `KDSTicketCard` now takes a bucketed `urgencyLevel` (0-3) prop computed at page level instead of the raw per-second `nowEpochMs`; comparator keys on `urgencyLevel`; dead `timeElapsed`/local `urgencyLevel` memos removed; `urgencyThresholds` prop dropped (now page-level only). Behavior-preserving (header color still changes at thresholds; visible MM:SS timer is the unchanged isolated `KDSTicketTimer` leaf) and can only **reduce** card-body renders.
  - ⚠️ **TODO before merge:** a temporary `__DEV__ console.count("KDSTicketCard.render")` is in the card body. Profile a 50-card board (BEFORE ≈ 50/s, AFTER ≈ ticket-change + ~3 crossings) to confirm the gain is material; screenshot-diff a card crossing the 5/10/15-min thresholds for color parity; then **remove the counter**. If the body render is already cheap under React Compiler, revert B2.
- **Verified no-fix (not touched):** D1 (timer isolation already correct), D2 (distinct memos). **Deferred/gated:** D3 (aggregation micro-opt — key on `kitchen_status`), D4 (virtualization — per-column lists, NOT `numColumns`; needs dev-client rebuild + operator screenshot diff + 50+-ticket profile).

## Tests (all green)
New: `patchSessionsLocalOnlyPreserve`, `fetchSnapshotLocalOnlyFromSessionStore`, `tableOrderPrefetchTeardown`, `kdsAutomation`. Regression: `patchSessionsPlanScoped`, `rapidTableOrderHydration` stay green (24/24 across the 6 suites).

## Verification
- `tsc --noEmit`: only the pre-existing `seatGuests` forwarding-stub error in edited files (orderId `null` vs `undefined`); no new errors.
- `eslint`: identical error count (7) in `kds.tsx` at HEAD vs current — zero new lint errors.
- `jest` full suite: **stash-baseline identical** — 9 failed suites / 23 failed tests at both HEAD and with changes → no regressions. All 9 failing suites are pre-existing and unrelated.

## Manual verification still owed (needs device/emulator)
- Stream A: seat → `ordering`/`paying` on Plan A → switch to Plan B → back to A → status persists (cold >30 s cache AND warm prefetch); + realtime reconcile on a *different* table doesn't flash the local-only table. CFD idle-gate: no CFD → `cfdItems` empty; connect built-in + paired CFD mid-order → items populate.
- Stream B: D5 — auto-fire/bump still fire at configured delays on a busy board (no starvation); recalled ticket not auto-bumped. D6 — the profile gate above.

## Not committed — working tree only (per the initiative's convention).
