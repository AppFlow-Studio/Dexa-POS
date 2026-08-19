# Performance Handoff — pre-realtime work

> Self-contained handoff for a fresh session. Read this top-to-bottom; you do **not** need the prior conversation.

## Where things stand

Branch `feat/perf-and-bug`. A prior session shipped (working tree, **uncommitted**) the high-ROI / low-risk perf waves and verified them clean. The remaining work is sequenced below.

**Already shipped this initiative (do NOT redo):**
- **Subscription hygiene:** `components/Header.tsx` (whole `tablesById` → single name string), `components/panels/SeatedPanel.tsx` + `components/bill/BillSection.tsx` (`useShallow`), `app/(main)/previous-orders.tsx` (one `useShallow` live-order selector), `components/bill/paymentView/PayForItemsView.tsx` + `SplitByItemView.tsx` (`useActiveOrder()`).
- **Order-line selectors** in `stores/selectors/orderSelectors.ts` iterate `state.orderIds` instead of `Object.keys/values(ordersById)`; `sessionPartySize` is O(1) with an `sx.id === session_id` guard.
- **`hooks/useTableSession.ts`** Priority-3 fallback is allocation-free; **`services/tableOrderPrefetch.ts`** defensive scan de-allocated; **`stores/useFloorPlanStore.ts`** reservation enrichment uses the O(1) `nextReservationByTableId` index.
- **Memory leak:** `_cleanupOrderModuleState` in `stores/useOrderStore.ts` (clears broadcast-throttle dicts in `removeOrder` + `cleanupAbandonedDrafts`).
- **MMKV lazy-persist:** `useCFDClientStore`, `useLoyaltyStore`, `useMenuVisibilityStore` → `createLazyPersistStorage()`.

**Reference docs:**
- Full plan + per-wave detail: `~/.claude/plans/so-far-we-have-imperative-ritchie.md`
- Approved 4-phase roadmap (Phases 0–3 shipped): `~/.claude/plans/role-objective-cryptic-dusk.md`
- Baseline protocol: `docs/engineering/performance/perf-baseline-protocol.md`; instrumentation: `lib/perf.ts` (spans `pos.add_to_cart`, `pos.open_payment`, `pos.floor_switch`, `pos.table_open`, `pos.boot_to_order`, `pos.queue_flush`).

## Standing guardrails (apply to ALL items below)

1. **React Compiler is ON** → adding `React.memo`/`useMemo` is near-zero ROI. The lever is **narrowing store subscriptions** and **removing O(n)/allocation per mutation**, not memo-wrapping.
2. **Verify before churning.** Roadmap Phase-2 F9/F10 found a prior render-audit's KDS/subscription findings *did not reproduce*. Profile with `lib/perf.ts` spans / a `__DEV__` render counter to confirm a hotspot is real before editing.
3. **Realtime layer is "audited healthy — leave alone."** None of the items below should touch broadcast/sync. That's the separate, gated Wave 5 (last).
4. **Local-only table statuses** (`seating`/`ordering`/`paying`/`closing`) are never synced and are guarded against realtime overwrite (`lib/tableStateMachine.ts` `isLocalOnlyStatus`). Do not regress these — directly relevant to item B.
5. **Migrations stop at staging** (`dfwqakoyittmrwbqvxgw`); user runs prod. No prod writes.
6. Project-wide `npx tsc --noEmit` has ~305 **pre-existing** errors (Deno edge fns, `types/discounts.ts`, etc.). Filter for your edited files; don't chase the baseline.

---

## Backlog — do these BEFORE the realtime Wave 5, in this order

### A. KDS optimizations  *(busy kitchen display)*

Deferred from the original survey (user originally prioritized takeout/delivery). **First profile to confirm each reproduces** (roadmap says KDS memoization may already be in target state). All line numbers are `app/(main)/kds.tsx` unless noted; re-grep, the file is ~3285 lines and shifts.

- **D1 [verify-then-fix, CRITICAL if real]** `~1758`: `const nowEpochMs = useMemo(() => Date.now(), [timerTick])` — if this feeds the page-level filter/sort/columnize memos, the whole page re-derives **every 1s**. Fix: drive elapsed-time via per-card timers (there's already a `KDSTicketTimer` subscribing to `timerTick`) / a `nowRef`, and `useShallow` the three `ticketsByStatus` selectors (`~1752-1754`). **Ship this + D5 first — lowest risk, biggest per-second win.**
- **D5 [HIGH]** `~1853-1935`: auto-fire / auto-bump `useEffect`s include `pendingTickets`/`readyTickets` (new array refs per broadcast) in deps → `clearInterval`/`setInterval` churn on every broadcast. Fix: read tickets via `useKDSStore.getState()` inside the interval body; remove the arrays from deps.
- **D2 [HIGH]** `~1983-2050`: 3 stacked `useMemo` layers (`filteredPending/Cooking/Ready/Done` → `filteredByStatus` → `listDataByStatus`) re-filter the same arrays. Collapse to a single-pass memo.
- **D3 [HIGH]** `~490-634` (`KDSTicketCard`): O(n·m) per card — filters `ticketItems` multiple times + nested `representedItemIds` filter per aggregated item. Fix: precompute display items / `representedItemIds` at the **KDS store** level on ticket-items change; card consumes precomputed data.
- **D4 / D6 [virtualization — SHIP LAST, gated]** `~2911-2959`: ticket grid is a non-virtualized `ScrollView` + nested `.map` columnization; all tabs' cards mount. **CAUTION: the manual columnization is column-major (masonry); `FlatList numColumns` is row-major and would visually reorder tickets + create ragged gaps with variable-height cards.** Do NOT use `numColumns`. Use a masonry-capable windowed list (e.g. per-column `FlashList`s, or FlashList masonry). Gate merge on a side-by-side screenshot diff with a KDS operator and a 50+-ticket profile. Note FlashList v1 needs a dev-client rebuild + `disableAutoLayout` on New Arch (see roadmap F8).

**Verify:** with 50+ tickets, page-level filter/sort should not run on the 1s tick; scrolling smooth; auto-fire/auto-bump still trigger at configured delays; aggregation/hide-done/sort settings render identically.

### B. Dine-in floor-plan navigation — tables & order status MUST persist  *(correctness + perf)*

**Symptom:** navigating between floor plans / away-and-back loses table + order status. This is a **state-persistence/correctness** bug, not yet surveyed — needs fresh investigation. Likely causes to check, in order:

1. **Full refresh overwriting local-only statuses.** `stores/useFloorPlanStore.ts` `loadFloorPlanStatus` / `fetchFloorPlanSnapshot` / `setActiveFloorPlan` — confirm the local-only-status guard (`isLocalOnlyStatus`, `lib/tableStateMachine.ts`) is applied on **floor-plan switch**, not just realtime. Phase-3 Wave T added reconcile suppression (`<1.2s` after snapshot) + `shallowValueEqual` stable per-table identities — verify those cover the floor-switch path.
2. **Session store loss on navigation.** `stores/useTableSessionStore.ts` `sessions` — is it persisted (MMKV) and not cleared on screen blur/unmount? Check `app/(main)/tables/` mount/unmount and any `useFocusEffect` cleanup that resets sessions (compare to `previous-orders.tsx`, which intentionally releases on blur — tables must NOT).
3. **Order status loss.** Cross-check `useOrderStore` `dbOrderIdIndex`/`tableOrderIdIndex` rebuilds and the `useTableSession` priority resolution (`hooks/useTableSession.ts`) during the floor-switch transition window.
4. **Perf angle:** floor-plan switch render cost — `pos.floor_switch` / `pos.table_open` spans already exist; measure before/after. `DraggableTable` is `React.memo`'d; confirm per-table session subscription so only the changed table re-renders.

**Deliverable:** reproduce the loss first (which navigation: floor-plan tab switch? section switch? screen away/back?), write a failing repro, then fix the persistence path without regressing local-only-status guards. Add a test under `__tests__/` mirroring `clearTableServedTransition`/`tableReopenCheckWiring` patterns.

### C. Navigation & render time when busy

- Profile screen transitions with 10+ tables + several takeout/delivery orders. The shipped Waves 1–4 already cut a lot of re-render churn; re-measure to find what's left.
- **CFDProvider** (`contexts/CFDProvider.tsx`) is mounted app-wide and its order-sync effect / `cfdItems` transform run under broadcast load on every screen — this is **F1 (deferred)**. Re-scope: gate `cfdItems`/`itemsFingerprint` when CFD is idle, BUT first verify on-device whether the **built-in CFD WebView** registers in `clientCount` (gating wrongly blanks a connected display). See plan file F1.
- **Navigation teardown/setup race** (`I4`): tables ↔ order-processing — defer heavy mount work (e.g. `useTableSessionInit`) via `InteractionManager` so unmount cleanup doesn't contend with the next screen's setup.
- Check background (unfocused) screens aren't re-rendering on hot-store churn — consider expo-router `freezeOnBlur` for heavy tabs.

### D. Instant loading & page transitions  *(TTI)*

- Use the existing `pos.boot_to_order`, `pos.floor_switch`, `pos.table_open` spans to find slow transitions.
- Skeleton/optimistic transitions for the heavy screens (order-processing, tables, kds); preload/prefetch on intent (Phase-3 Wave T already prefetches floor + coursing at tap).
- Audit route bundle cost (expo-router import mode is `sync` — routes execute at boot; see roadmap F6 `LazyGiftedCharts` facade pattern for lazy-loading heavy deps).
- Don't flip TanStack `refetchOnReconnect`/`refetchOnWindowFocus` without the bad-WiFi cross-check (roadmap F7).

---

## After the above: deferred items (in order)

1. **F1 — CFD idle gate** (folds into item C; needs device verification of `clientCount` incl. built-in WebView).
2. **Wave 5 — realtime** (conflict-detection short-circuit + operation-aware broadcast coalescing). **Highest risk.** Ship ALONE, behind an `EXPO_PUBLIC_*` kill switch, with a burst-replay convergence test (voids/INSERT-chime/cross-station payments must survive coalescing). Requires bad-WiFi cross-check + senior-persona review per roadmap gates. **C2 stays dropped** (re-gating payment invalidation contradicts shipped F1). Detail in plan file Wave 5.
3. **Wave 6 — polish:** `hooks/useTableTimerTick.ts` zustand tick selector (batched notify vs per-table fan-out); `lib/order-calculator.ts` Decimal allocation (measure the 2000ms TTL-cache hit-rate first — only high-ROI if the cache misses under broadcast load); `Date.now()` hoists in `app/(main)/order-processing.tsx` + `HostStationScreenEnhanced.tsx`.

## How to verify any wave
1. `npx tsc --noEmit` (filter for edited files); `npm run lint` (edited files); `npm test` — **stash-baseline** to separate pre-existing failures (`git stash`, run, compare, `git stash pop`).
2. `__DEV__` render-count / `produce()`-per-sec counters + `lib/perf.ts` spans before/after with the busy dataset (10+ tables + takeout/delivery).
3. Remove all temporary `__DEV__` counters before merge.
