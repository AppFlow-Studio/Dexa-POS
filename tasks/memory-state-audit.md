# Memory & State Audit (device RAM / shift-long retention)

Read-only audit of where the POS grows memory / retains state over an 8–12h shift under continuous broadcast load. 4 auditors + 8 adversarial verifiers. **Headline: the codebase is largely mature** — realtime channels, timers, listeners, and most caches have correct lifecycle management. The real issues cluster around **per-order/per-item module state that is never released when an order leaves the store**, plus two timer/Set leaks. Nothing here is catastrophic (each leak is sub-MB over a full shift), but they accumulate monotonically until app restart.

> **Systemic root cause:** there is no single "order removed → release its per-order state" fan-out. An `order:archived` event exists (`lib/eventSubscribers.ts:193`) **but is never emitted anywhere in the repo** (dead subscriber). So each store/map cleans up independently — and several don't. Fixes must hook the real removal paths (`useOrderStore.removeOrder` / `clearInactiveOrders` / `cleanupAbandonedDrafts`), or emit a real `order:removed` event those stores subscribe to.

---

## CONFIRMED leaks (adversarially verified `isReal: true`)

### Group A — per-order/per-item state not released on order removal

| # | Where | Grows per | Why it leaks | Fix |
|---|-------|-----------|--------------|-----|
| A1 **HIGH** | `useOrderStore` `orderRefreshTimeouts` | order | `_cleanupOrderModuleState` (clears throttle dicts) does **not** clear it; `clearInactiveOrders` doesn't call `_cleanupOrderModuleState` at all. A removed order's pending refresh-debounce **setTimeout** orphans (timer + closure retained). | Extend `_cleanupOrderModuleState` to `clearTimeout(orderRefreshTimeouts[id])` + `delete`; call it from `clearInactiveOrders` per removed order. |
| A2 **HIGH** | `useOrderStore` `quantitySyncGenerations` (`Map<itemId,number>`, line ~811) | item | Only ever `.set()`, **zero `.delete()`** in 17k lines. Items removed from store; entries persist forever. ~500 entries/shift. | Delete each removed order's item ids on `removeOrder`/`removeItemFromActiveOrder`. |
| A3 **HIGH** | `useCoursingStore.byOrderId` | order | `clearOrder()` exists but is **never called** anywhere (verified: 0 external call-sites). ~1–2KB/order retained to restart. | Call `clearOrder(orderId)` from the order-removal fan-out (or a real `order:removed` event). Optional LRU cap (~100). |
| A4 **HIGH** | `useSeatingStore.byOrderId` | order | Same pattern as A3 — `clearOrder()` never called. ~2–3KB/order. (Verifier labeled "critical"; it's a genuine unbounded leak, sub-MB/shift.) | Same fan-out cleanup. |
| A5 **MED** | `useSyncStatusStore` `itemSyncStatus`/`itemSyncErrors`/`itemFailedAt` | item | `clearAllForOrder` is manual, not auto-triggered; `itemFailedAt` never expires. | Call `clearAllForOrder` from the fan-out; add `itemFailedAt` expiry (>30min). |
| A6 **MED** | `useOrderStore` `pendingBackendUpdates` + `pendingItemsBlockStart` | dirty order | `pendingItemsBlockStart` not in `_cleanupOrderModuleState`; `pendingBackendUpdates` not pruned for removed orders (only cleared by `flushQueuedUpdates`). Bounded in practice but unpruned on removal. | Delete entries for removed orders in the fan-out. |

**Recommended fix for Group A:** one private `releaseOrderState(orderId, items)` helper in `useOrderStore`, called from `removeOrder` + `clearInactiveOrders` + `cleanupAbandonedDrafts`, that (1) extends `_cleanupOrderModuleState` (orderRefreshTimeouts w/ clearTimeout, pendingItemsBlockStart, pendingBackendUpdates) + per-item `quantitySyncGenerations`, and (2) fans out to `useCoursingStore.clearOrder` / `useSeatingStore.clearOrder` / `useSyncStatusStore.clearAllForOrder` (lazy `require` to avoid cycles, mirroring `getTableSessionStore`). This is the single highest-leverage change and fixes A1–A6 at once.

### Group B — timer / Set leaks

| # | Where | Severity | Why it leaks | Fix |
|---|-------|----------|--------------|-----|
| B1 | `offlineSyncService.autoRetryTimers` (`Map<opId, timeout>`, line ~317) | **HIGH** ⚠️ | Operations removed / dead-lettered / cancelled (`removeOperation`, `handleOperationFailure`, `moveToDeadLetter`, `dropQueuedOpsForItem`, `cancelPendingByEntity`) **without** `clearTimeout` + `delete`. Orphaned `setTimeout` refs retain the operation closure. 120–1200 orphans over a busy shift. | Before every op removal/dead-letter, `clearTimeout(autoRetryTimers.get(id)); autoRetryTimers.delete(id)`. **⚠️ touches the offline sync queue → gate behind the bad-WiFi cross-check + senior-persona review per project rules.** |
| B2 | `useKDSStore._recalledTicketIds` (`Set<string>`) | **HIGH** | Removed only on ticket completion; **no TTL**, persisted to MMKV. Incomplete recalls (customer leaves, etc.) accumulate across the shift *and* survive restarts. | Track recall timestamps (Map), TTL-cull (>~4h) on foreground; clear in `_cleanup()`. |

### Group C — module listener Sets (needs call-site verification)

| # | Where | Severity | Risk |
|---|-------|----------|------|
| C1 | `lib/network/featureFlags.ts` `listeners` Set | MED | `subscribeFlags()` returns an unsubscribe, but any call-site that doesn't run it in a `useEffect` cleanup leaks a closure per mount. **Action: audit all `subscribeFlags`/`subscribeActiveVendorSidebarId` call-sites; add a `__DEV__` warn if the Set exceeds a sane size.** |
| C2 | `lib/vendorSidebarControl.ts` `listeners` Set | MED | Same pattern. |

---

## Corrected / refuted (verifier caught these)

- **KDS `doneTickets` — NOT a leak.** Capped at `.slice(0, 50)` in every add path (`advanceTicketStatus`, `bulkAdvanceTickets`, `bulkMarkTicketsDone`); cap enforced before MMKV persist. ✅
- **`useFloorPlanStore.floorPlanCache` — bounded, not unbounded.** Keyed by `[floorPlanId]` → re-warm **overwrites**, so it's bounded by the *number of floor plans* (~50KB × N plans, typically <10 = <0.5MB), and there's already eviction at `:877`. The verifier's "duplicates × refresh count" was wrong. **Real (minor) concern:** it's in MMKV `partialize` (`:2096`) and re-written on every floor switch (new `lastSyncAt`) → persisted-write churn. *Optional:* drop `floorPlanCache` from `partialize` (it's a re-warmable cache) or cap at ~3 plans.
- **`toastCounter`** monotonic int — cosmetic, ~0 memory; use `% 10000` if desired. Low.

---

## Adequate — do NOT touch (verified healthy)

Realtime channels (`useRealtimechannel` — exemplary: backoff, NetInfo, AppState, auth-refresh, all cleaned), `useKDSTimer` (AppState-aware singleton, pauses on background), stuck-session watchdog (`_activeMounts` singleton), `useSessionKickListener` (3-layer, all teardown wired), keyboard listeners, remote-actions channel, **order pruning** (`clearInactiveOrders` 2–5min + `cleanupAbandonedDrafts` 15min, bounds `ordersById`), broadcast throttle dicts (`_cleanupOrderModuleState`), `order-calculator` cache (TTL 2s + cap 20), offline queue (cap 500 + dead-letter 50), `logCollector` (ring buffer 1000), `menuImageCache` (eviction), `tableOrderPrefetch` maps (cleared in teardown — the A4 fix from this session).

---

## Suggested order of work (if implementing)
1. **Group A fan-out** (`releaseOrderState`) — biggest win, self-contained to `useOrderStore` + 3 store `clearOrder` calls; add a unit test asserting the maps shrink on `removeOrder`. No queue/realtime touch.
2. **B2** (`_recalledTicketIds` TTL) — KDS-local, low risk.
3. **C1/C2** — audit call-sites, add `__DEV__` guard.
4. **B1** (`autoRetryTimers`) — **gated**: bad-WiFi cross-check + senior-persona review before touching the sync queue.
5. **floorPlanCache** persist trim — optional, low priority.

## ✅ IMPLEMENTED (Group A + B2 + C) — verified, working tree

- **Group A** (`stores/useOrderStore.ts`): extended `_cleanupOrderModuleState` (now clears `orderRefreshTimeouts`+clearTimeout / `pendingItemsBlockStart` / `lastLocalMutationAt`); new `releaseOrderState(order, storeKey?)` fan-out (per-item `quantitySyncGenerations.delete` + lazy-required `useCoursingStore`/`useSeatingStore`.`clearOrder` + `useSyncStatusStore.clearAllForOrder`); wired into `removeOrder`, `clearInactiveOrders`, `cleanupAbandonedDrafts` + `pendingBackendUpdates` pruned per removed order.
- **B2** (`stores/useKDSStore.ts`): `_recalledTicketAt` timestamp map + `RECALLED_TICKET_TTL` (4h); `cullExpiredRecalls` (evicts both `_recalledTicketIds` **and** `_recalledCycleTicketIds`) wired into `overlayPendingActions`; cleared in `_cleanup`; timestamps seeded on rehydrate. Pure `isRecallExpired` predicate added to `lib/kdsAutomation.ts`.
- **C**: `__DEV__` size>25 warn in `featureFlags.subscribeFlags` + `vendorSidebarControl.subscribeActiveVendorSidebarId` (defense-in-depth; current call-sites are clean).
- **Tests**: `__tests__/orderStateRelease.test.ts` (satellite-store clear APIs runtime + fan-out wiring source), `__tests__/kdsRecalledTtl.test.ts` (`isRecallExpired` unit + TTL wiring source). 11 new tests green.
- **Verify**: tsc identical to baseline (no new errors), lint clean, full suite identical to baseline (23 pre-existing failures unchanged; 800→811 passing). Zero regressions.
- **Not done (gated):** B1 `autoRetryTimers` (sync-queue → review gate); floorPlanCache persist-trim (optional).

## Verification approach
- Unit test: after `removeOrder`/`clearInactiveOrders`, assert `quantitySyncGenerations`/coursing/seating/sync-status no longer hold the removed order's keys (need small test hooks or `__DEV__` size getters).
- On-device: Hermes heap snapshot / `performance.memory` (or Android Studio profiler) at shift start vs after a scripted 200-order churn — confirm the per-order maps don't grow linearly.
