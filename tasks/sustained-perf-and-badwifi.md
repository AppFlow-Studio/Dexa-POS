# Sustained perf (floor nav + long-session) + bad-WiFi coverage

Answers three asks: (1) how much faster can floor-plan nav get, (2) a test that proves first-launch ≈ 5h-later behavior, (3) are all operations optimized for bad-WiFi. Backed by a 3-agent research sweep.

---

## 1. Floor-plan navigation — shipped + remaining headroom

The common case (cache-hit switch, ~20-50 tables) paints in ~200-300ms; ~40-100ms (20-50%) is recoverable.

### ✅ Shipped this session — A3: skip redundant background load on a fresh switch
`stores/useFloorPlanStore.ts` `setActiveFloorPlan`: a cache-hit-**fresh** (<30s) switch painted instantly *and then still* fired `loadFloorPlanStatus()` in the background — re-fetching identical data, re-diffing, and **re-writing the persisted `floorPlanCache` with a new `lastSyncAt` on every switch** (a wasted RPC + a full multi-plan-cache MMKV serialize + diff). Now it skips that when fresh (realtime + the next stale/>30s switch still reconcile, and `prefetchFloorPlans` still re-warms inactive plans). **Gain: ~25-60ms off the switch + 5-10× fewer MMKV writes/RPCs per shift** → directly improves the "5h later" case (less GC/storage churn). Low risk; offline cache preserved.

### Remaining, ranked (not done — each is a follow-up)
- **A2 — delta-only `_patchSessionsFromTables`** (`stores/useTableSessionStore.ts`): on a snapshot where 1 of 30 tables changed, it still builds 30 SYNC actions (`_applyAction` short-circuits each, but the iteration + allocation is wasted). Pre-filter to changed tables only. **~10-18ms/switch**, small effort. Risk: the value-equality must exactly mirror `_applyAction`'s SYNC branch — extract a shared helper.
- **A1 — drop `floorPlanCache` from MMKV `partialize`** (`:2090`): **~25-40ms** more + kills the remaining write-churn. **Deliberately NOT done** — it removes the persisted multi-plan cache, so **offline** switching to a non-active plan would show a skeleton instead of stale data. That regresses bad-WiFi/offline UX (which is the other priority). A3 already removes most of the churn without this tradeoff. Only do A1 if offline multi-plan viewing is deemed unimportant.
- **B1 — `DraggableTable` subscription narrowing** (medium): a single session change re-runs the per-table selector for all N tables (~5-10ms/realtime event). High-touch refactor (per-table dirty tracking / zustand `subscribe`). Moderate ROI — only matters under heavy realtime. Defer.
- **C1 — progressive-render threshold** (`TableLayoutView.tsx`, trivial): 80-table threshold; tune only if venues exceed ~50 tables.

**Measure before more:** the `pos.floor_switch` span (`tables/index.tsx:739`) already exists — read p95 on a busy board to decide whether A2/B1 are worth it.

---

## 2. Long-session soak/leak test — first launch ≈ 5h later

### ✅ Shipped — `__tests__/longSessionSoak.test.ts`
Drives **500 cycles × 10-order bursts** (a busy shift's churn) through the satellite stores the audit found leaking, asserting the collections **return to baseline every cycle and the peak is bounded by the working set, not cumulative count**:
- `useCoursingStore.byOrderId` / `useSeatingStore.byOrderId` → 0 after each burst; peak ≤ BURST (not 500×10).
- `useSyncStatusStore` item maps → empty after 5,000 distinct items touched.
This is the Group A fix proven at scale, in CI on every PR. Green (3/3), no regressions.

### Device-side harness (designed; needs a device — not built)
The jest test proves the *logical* invariants; actual RAM + sustained render latency need a device:
- **`app/(main)/dev/soak-harness.tsx`** (`__DEV__`-only screen): runs the full churn loop (create→add items→send→pay→clear + floor switches + KDS advance/recall), logs collection sizes + `lib/perf` spans every 50 cycles to console + MMKV. Lets a human watch t0 vs after ~300 cycles (~30 min ≈ a shift) on a real tablet.
- **Memory probe**: periodic size-logger (cheap) and/or Hermes heap snapshot diff (deep dives).
- **Perf regression gate**: sample `pos.floor_switch` / `pos.table_open` / `pos.add_to_cart` p50/p95 at cycle 10 vs 300; **flag if p95 grows >25%** (catches GC pauses / render cascades as memory fills).
- **CI**: run the jest soak on every PR (fast); run the device soak nightly / pre-release on a device farm.

Full invariant checklist + thresholds are in the research output; implement the harness when device-soak confidence is needed.

---

## 3. Bad-WiFi coverage — mostly solid, a few hot-path gaps

**Covered (shipped, verified):** Category A RPCs deadline-wrapped (`update_order_status`/`close_check`/`reopen_check`/KDS ops, `DEADLINES.*` + `runWithDeadline`); `process_payment` deadline + full recovery UI (`check_recent_payment` polling, manual adoption, journal idempotency); `seat_guests` **main** path deadline-wrapped; `connectionQuality` state machine (fast→degraded→slow, probe backoff) gating TanStack via `getIsOnline`; offline queue with backoff + dead-letter caps (500/50). Category B server-side idempotency (14 RPCs) is **deliberately deferred** (`docs/bad-wifi-deeper-optimizations.md`) — keep deferred unless an operator reports payment/seat freezes (high-risk, low-frequency).

**Gaps (ranked) — hot-path RPCs NOT deadline-wrapped → a bad-WiFi event = 30s+ silent spinner:**
1. **`OrderService.updateOpenItem`** (`services/orderService.ts:267`) — **live** (`components/menu/ModifierScreen.tsx:1389`, item edits). Caller only `.catch`-logs.
2. **`OrderService.addOrderDiscount`** (`:281`) — a `.from().insert()` (not RPC); needs `abortSignal` verification or an `add_order_discount` RPC to wrap.
3. **`seat_guests` legacy fallback** (`floorPlanService.ts:347`, the PGRST202 retry) — raw `.rpc` without the deadline the main path has.
4. Lower-freq utility reads (`calculateOrderTax`, `calculateSplitPayment`, `getOrderItem`, `getKDSTickets`, `isOrderLocked`, `updateOrderWithVersion`, several `FloorPlanService` utils incl. `merge_table_to_session`) — wrap for consistency + connection-quality tracking.
5. **No UI indicator** of `degraded`/`slow` connection state — operators can't tell the network (not the app) is slow.

**Why I did NOT auto-fix these:** wrapping a hot-path mutation in a deadline changes failure semantics (silent hang → thrown `DEADLINE_EXCEEDED`), and the current callers (e.g. `ModifierScreen`'s `.catch` that only logs) don't route that to recovery (offline queue / retry / toast) — so a naive wrap converts a hang into a **lost edit**. Per the project's own rule ([[check-bad-wifi-before-sync-changes]], [[review-with-senior-personas]]), these wraps must be done **with each caller's error-handling verified** + persona review. They're small + in-pattern (`_runWithDeadline(op, DEADLINES.hotMutation, signal => client.rpc(...).abortSignal(signal))`) but belong in a gated change, not a drive-by.

**Recommendation:** a focused "Option-C Wave 2" — wrap gaps 1, 3, 4 (RPC) with deadlines **and** route each caller's deadline failure into the existing offline-queue/dead-letter path; do gap 2 via an RPC migration; add gap 5's status badge. Estimate: ~1 day incl. throttled-network testing.

---

## Verification (this session's changes)
- `npx jest __tests__/longSessionSoak.test.ts` green (3/3). Full suite identical to baseline (9 suites/23 tests pre-existing; 811→814 passing) → A3 + soak = zero regressions.
- A3 is a behavior-preserving reduction (skips a redundant fetch); manually verify on-device that a fresh re-switch still shows live sessions (realtime path) and a >30s switch still reconciles.
